import { randomUUID } from "node:crypto";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { withOptimisticVersion } from "@/lib/optimistic-version";
import { ServiceError } from "@/lib/service-error";
import { calculateLineMargin, calculateQuotationMargin } from "@/modules/discount-risk";
import type {
  BackorderDto,
  BillingSummaryDto,
  FulfillmentLineDto,
  FulfillmentOrderDetailDto,
  FulfillmentOrderListItemDto,
  FulfillmentStatus,
  OrderTimelineEntryDto,
  SuggestedSplitDto,
} from "@/modules/fulfillment/application/types";
import type { Actor } from "@/modules/shared/domain/actor";

import { allocateAcrossWarehouses } from "../domain/allocate-stock";
import { estimateShipmentDate, estimateShippingCost } from "../domain/estimate-shipping";
import type { OverrideSplitInput } from "../schemas/fulfillment";
import type { FulfillmentRepository } from "../application/ports";

/** Orders visible in this feature at all — anything that has reached Confirmed and beyond
 * (docs/ORDERS_FLOW.md §2 state machine). DRAFT/SUBMITTED/PENDING_APPROVAL/etc. never appear. */
const VISIBLE_STATUSES = ["CONFIRMED", "FULFILLMENT", "BILLING", "COMPLETED"] as const;

const ACTOR_ROLE_LABEL: Record<string, string> = {
  ADMIN: "Admin",
  SALES_REP: "Sales Rep",
  MANAGER: "Manager",
  FINANCE_OPS: "Finance",
  CUSTOMER: "Customer",
};

const AUDIT_ACTION_LABEL: Record<string, string> = {
  PORTAL_CONFIRM: "Order confirmed",
  PORTAL_CONFIRM_REROUTED: "Order confirmed (routed for re-approval)",
  ACCEPT_SUGGESTED_SPLIT: "Warehouse split accepted",
  MANUAL_OVERRIDE: "Manual warehouse override applied",
  SHIP: "Order shipped",
};

const orderDetailInclude = {
  customer: { select: { id: true, name: true, tierId: true } },
  lines: {
    include: { product: { select: { id: true, name: true, sku: true, categoryId: true, costPrice: true } } },
    orderBy: { createdAt: "asc" },
  },
  fulfillment: {
    include: {
      items: {
        include: { warehouse: { select: { id: true, name: true, shippingCostWeight: true } } },
        orderBy: { createdAt: "asc" },
      },
      backorders: { orderBy: { createdAt: "asc" } },
    },
  },
} satisfies Prisma.QuotationInclude;

type OrderDetailRecord = Prisma.QuotationGetPayload<{ include: typeof orderDetailInclude }>;

function orderTotalOf(lines: OrderDetailRecord["lines"], orderDiscountPct: number): string {
  const margins = lines.map((line) =>
    calculateLineMargin({
      unitPrice: line.unitPrice.toNumber(),
      quantity: line.quantity,
      unitCost: 0,
      lineDiscountPct: line.lineDiscountPct.times(100).toNumber(),
      orderDiscountPct,
    }),
  );
  return calculateQuotationMargin(margins).totalNetBeforeTax.toFixed(2);
}

function translateWriteError(error: unknown): never {
  if (error instanceof ServiceError) throw error;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
    throw new ServiceError("NOT_FOUND", "The requested order was not found");
  }
  throw error;
}

export class PrismaFulfillmentRepository implements FulfillmentRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async listOrders(): Promise<FulfillmentOrderListItemDto[]> {
    const quotations = await this.db.quotation.findMany({
      where: { status: { in: [...VISIBLE_STATUSES] } },
      select: {
        id: true,
        code: true,
        status: true,
        updatedAt: true,
        orderDiscountPct: true,
        customer: { select: { name: true } },
        lines: { select: { unitPrice: true, quantity: true, lineDiscountPct: true } },
        fulfillment: {
          select: { status: true, backorders: { select: { status: true } } },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    return quotations.map((q) => {
      const orderDiscountPct = q.orderDiscountPct.times(100).toNumber();
      const margins = q.lines.map((line) =>
        calculateLineMargin({
          unitPrice: line.unitPrice.toNumber(),
          quantity: line.quantity,
          unitCost: 0,
          lineDiscountPct: line.lineDiscountPct.times(100).toNumber(),
          orderDiscountPct,
        }),
      );
      return {
        id: q.id,
        orderCode: q.code,
        customerName: q.customer.name,
        orderStatus: q.status,
        fulfillmentStatus: q.fulfillment?.status ?? null,
        hasOpenBackorder: (q.fulfillment?.backorders ?? []).some((b) => b.status !== "RESOLVED"),
        lineCount: q.lines.length,
        amount: calculateQuotationMargin(margins).totalNetBeforeTax.toFixed(2),
        updatedAt: q.updatedAt.toISOString(),
      };
    });
  }

  async getOrder(id: string): Promise<FulfillmentOrderDetailDto | null> {
    const record = await this.db.quotation.findUnique({ where: { id }, include: orderDetailInclude });
    if (!record || !(VISIBLE_STATUSES as readonly string[]).includes(record.status)) return null;
    return this.toDetailDto(record);
  }

  private async toDetailDto(record: OrderDetailRecord): Promise<FulfillmentOrderDetailDto> {
    const orderDiscountPct = record.orderDiscountPct.times(100).toNumber();
    const orderTotal = orderTotalOf(record.lines, orderDiscountPct);

    let fulfillmentStatus: FulfillmentStatus | null;
    let lines: FulfillmentLineDto[];
    let suggestedSplit: SuggestedSplitDto[] = [];
    let backorders: BackorderDto[] = [];

    if (record.fulfillment) {
      fulfillmentStatus = record.fulfillment.status;
      const itemsByLine = new Map(record.fulfillment.items.map((item) => [item.quotationLineId, item]));
      const backordersByLine = new Map(
        record.fulfillment.backorders.map((b) => [b.quotationLineId, b]),
      );
      lines = record.lines.map((line) => {
        const item = itemsByLine.get(line.id);
        const backorder = backordersByLine.get(line.id);
        if (item) {
          return {
            id: item.id,
            quotationLineId: line.id,
            productName: line.product.name,
            sku: line.product.sku,
            orderedQty: line.quantity,
            allocatedQty: item.allocatedQty,
            warehouseName: item.warehouse.name,
            estShipmentDate: item.estShipmentDate?.toISOString().slice(0, 10) ?? null,
            shippingCost: item.shippingCost?.toFixed(2) ?? null,
            lineStatus: backorder ? "BACKORDERED" : "ALLOCATED",
          };
        }
        if (backorder) {
          return {
            id: backorder.id,
            quotationLineId: line.id,
            productName: line.product.name,
            sku: line.product.sku,
            orderedQty: line.quantity,
            allocatedQty: 0,
            warehouseName: null,
            estShipmentDate: null,
            shippingCost: null,
            lineStatus: "BACKORDERED",
          };
        }
        return {
          id: line.id,
          quotationLineId: line.id,
          productName: line.product.name,
          sku: line.product.sku,
          orderedQty: line.quantity,
          allocatedQty: null,
          warehouseName: null,
          estShipmentDate: null,
          shippingCost: null,
          lineStatus: "PENDING",
        };
      });
      backorders = record.fulfillment.backorders.map((b) => {
        const line = record.lines.find((l) => l.id === b.quotationLineId);
        return {
          id: b.id,
          productName: line?.product.name ?? "Unknown product",
          warehouseName: "—",
          remainingQty: b.remainingQty,
          status: b.status,
          restockEta: b.restockEta?.toISOString().slice(0, 10) ?? null,
        };
      });
    } else {
      const suggestion = await this.computeSuggestion(record.lines);
      fulfillmentStatus = suggestion.needsDecision ? "SPLIT_PROPOSED" : "PENDING";
      suggestedSplit = suggestion.splits;
      lines = record.lines.map((line) => ({
        id: line.id,
        quotationLineId: line.id,
        productName: line.product.name,
        sku: line.product.sku,
        orderedQty: line.quantity,
        allocatedQty: null,
        warehouseName: null,
        estShipmentDate: null,
        shippingCost: null,
        lineStatus: "PENDING",
      }));
    }

    const billing = await this.getBillingSummary(record.id);
    const timeline = await this.buildTimeline(record.id, record.fulfillment?.id ?? null);

    return {
      id: record.id,
      orderCode: record.code,
      customerName: record.customer.name,
      orderStatus: record.status,
      fulfillmentStatus,
      orderTotal,
      lines,
      suggestedSplit,
      backorders,
      billing,
      timeline,
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  /** Side-effect-free preview used by GET before any Fulfillment row exists — this is the exact
   * same allocation this order would get if "Accept Suggested Split" were pressed right now,
   * but a GET must never write. Only meaningful when every line shares one product; a
   * multi-product order still previews per-product internally, but is merged into one
   * warehouse-keyed list (SuggestedSplitDto has no productId — matches API_DOCS.md §5's own
   * order-level, not per-line, `suggested_split[]` shape). */
  private async computeSuggestion(
    lines: OrderDetailRecord["lines"],
  ): Promise<{ splits: SuggestedSplitDto[]; needsDecision: boolean }> {
    const qtyByProduct = new Map<string, number>();
    for (const line of lines) {
      qtyByProduct.set(line.productId, (qtyByProduct.get(line.productId) ?? 0) + line.quantity);
    }

    const mergedByWarehouse = new Map<
      string,
      { warehouseId: string; warehouseName: string; quantity: number; cost: number; latestEta: Date }
    >();
    let anyProductNeedsSplit = false;

    for (const [productId, orderedQty] of qtyByProduct) {
      const stock = await this.db.warehouseStock.findMany({
        where: { productId },
        include: { warehouse: { select: { id: true, name: true, shippingCostWeight: true } } },
      });
      const options = stock.map((s) => ({
        warehouseId: s.warehouseId,
        warehouseName: s.warehouse.name,
        freeQty: s.availableQty - s.reservedQty,
        shippingCostWeight: s.warehouse.shippingCostWeight.toNumber(),
      }));
      const { splits } = allocateAcrossWarehouses(orderedQty, options);
      if (splits.length > 1) anyProductNeedsSplit = true;

      const eta = estimateShipmentDate(new Date());
      for (const split of splits) {
        const cost = estimateShippingCost(split.quantity, split.shippingCostWeight);
        const existing = mergedByWarehouse.get(split.warehouseId);
        if (existing) {
          existing.quantity += split.quantity;
          existing.cost += cost;
        } else {
          mergedByWarehouse.set(split.warehouseId, {
            warehouseId: split.warehouseId,
            warehouseName: split.warehouseName,
            quantity: split.quantity,
            cost,
            latestEta: eta,
          });
        }
      }
    }

    const splits = [...mergedByWarehouse.values()].map((s) => ({
      warehouseId: s.warehouseId,
      warehouseName: s.warehouseName,
      quantity: s.quantity,
      estShipmentDate: s.latestEta.toISOString().slice(0, 10),
      cost: s.cost.toFixed(2),
    }));

    return { splits, needsDecision: anyProductNeedsSplit || splits.length > 1 };
  }

  private async getBillingSummary(quotationId: string): Promise<BillingSummaryDto> {
    const invoice = await this.db.invoice.findFirst({
      where: { quotationId },
      include: { payments: { where: { status: "RECORDED" } } },
      orderBy: { createdAt: "desc" },
    });
    if (!invoice) return null;
    const paidAmount = invoice.payments.reduce((sum, p) => sum + p.amount.toNumber(), 0);
    return {
      invoiceCode: invoice.invoiceCode,
      status: invoice.status,
      totalAmount: invoice.totalAmount.toFixed(2),
      paidAmount: paidAmount.toFixed(2),
      dueDate: invoice.dueDate?.toISOString().slice(0, 10) ?? null,
    };
  }

  private async buildTimeline(
    quotationId: string,
    fulfillmentId: string | null,
  ): Promise<OrderTimelineEntryDto[]> {
    const entityIds = fulfillmentId ? [quotationId, fulfillmentId] : [quotationId];
    const logs = await this.db.auditLog.findMany({
      where: {
        entityId: { in: entityIds },
        action: { in: Object.keys(AUDIT_ACTION_LABEL) },
      },
      select: { id: true, action: true, actorRole: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    return logs.map((log) => ({
      id: log.id,
      actorLabel: log.actorRole ? (ACTOR_ROLE_LABEL[log.actorRole] ?? log.actorRole) : "System",
      action: AUDIT_ACTION_LABEL[log.action] ?? log.action,
      detail: null,
      createdAt: log.createdAt.toISOString(),
    }));
  }

  async acceptSuggestedSplit(id: string, actor: Actor): Promise<FulfillmentOrderDetailDto> {
    try {
      await this.db.$transaction(async (tx) => {
        const quotation = await tx.quotation.findUnique({
          where: { id },
          include: { lines: { include: { product: true } }, fulfillment: true },
        });
        if (!quotation) throw new ServiceError("NOT_FOUND", "Order not found", { id });
        if (quotation.status !== "CONFIRMED") {
          throw new ServiceError(
            "INVALID_STATE_TRANSITION",
            "Only a Confirmed order can be allocated",
            { id, status: quotation.status },
          );
        }
        if (quotation.fulfillment) {
          throw new ServiceError("ALREADY_ACTIONED", "This order has already been allocated", { id });
        }

        const qtyByProduct = new Map<string, number>();
        for (const line of quotation.lines) {
          qtyByProduct.set(line.productId, (qtyByProduct.get(line.productId) ?? 0) + line.quantity);
        }

        const perProductAllocation = new Map<
          string,
          { splits: { warehouseId: string; warehouseName: string; quantity: number; shippingCostWeight: number }[]; shortfall: number }
        >();
        for (const [productId, orderedQty] of qtyByProduct) {
          const stock = await tx.warehouseStock.findMany({
            where: { productId },
            include: { warehouse: { select: { id: true, name: true, shippingCostWeight: true } } },
          });
          const options = stock.map((s) => ({
            warehouseId: s.warehouseId,
            warehouseName: s.warehouse.name,
            freeQty: s.availableQty - s.reservedQty,
            shippingCostWeight: s.warehouse.shippingCostWeight.toNumber(),
          }));
          perProductAllocation.set(productId, allocateAcrossWarehouses(orderedQty, options));
        }

        await this.persistAllocation(tx, quotation, perProductAllocation, actor, "ACCEPT_SUGGESTED_SPLIT");
      });
      return (await this.getOrder(id))!;
    } catch (error) {
      translateWriteError(error);
    }
  }

  async overrideSplit(
    id: string,
    input: OverrideSplitInput,
    actor: Actor,
  ): Promise<FulfillmentOrderDetailDto> {
    try {
      await this.db.$transaction(async (tx) => {
        const quotation = await tx.quotation.findUnique({
          where: { id },
          include: { lines: { include: { product: true } }, fulfillment: true },
        });
        if (!quotation) throw new ServiceError("NOT_FOUND", "Order not found", { id });
        if (quotation.status !== "CONFIRMED") {
          throw new ServiceError(
            "INVALID_STATE_TRANSITION",
            "Only a Confirmed order can be allocated",
            { id, status: quotation.status },
          );
        }
        if (quotation.fulfillment) {
          throw new ServiceError("ALREADY_ACTIONED", "This order has already been allocated", { id });
        }

        const distinctProductIds = new Set(quotation.lines.map((l) => l.productId));
        if (distinctProductIds.size !== 1) {
          throw new ServiceError(
            "VALIDATION_ERROR",
            "Manual override only supports orders with a single product across all lines",
            { id },
          );
        }
        const [productId] = distinctProductIds;
        const totalOrdered = quotation.lines.reduce((sum, l) => sum + l.quantity, 0);
        const requestedTotal = input.splits.reduce((sum, s) => sum + s.quantity, 0);
        if (requestedTotal !== totalOrdered) {
          throw new ServiceError(
            "VALIDATION_ERROR",
            `Override quantities must total the full ordered quantity (${totalOrdered})`,
            { id, totalOrdered, requestedTotal },
          );
        }

        const activeSplits = input.splits.filter((s) => s.quantity > 0);
        const warehouseIds = activeSplits.map((s) => s.warehouseId);
        const stockRows = await tx.warehouseStock.findMany({
          where: { productId, warehouseId: { in: warehouseIds } },
          include: { warehouse: { select: { id: true, name: true, shippingCostWeight: true } } },
        });
        const stockByWarehouse = new Map(stockRows.map((s) => [s.warehouseId, s]));

        const splits: { warehouseId: string; warehouseName: string; quantity: number; shippingCostWeight: number }[] = [];
        for (const split of activeSplits) {
          const stock = stockByWarehouse.get(split.warehouseId);
          if (!stock) {
            throw new ServiceError(
              "VALIDATION_ERROR",
              "One or more warehouses have no stock record for this product",
              { warehouseId: split.warehouseId },
            );
          }
          const free = stock.availableQty - stock.reservedQty;
          if (split.quantity > free) {
            throw new ServiceError(
              "CONFIGURATION_CONFLICT",
              `${stock.warehouse.name} only has ${free} units free — cannot allocate ${split.quantity}`,
              { warehouseId: split.warehouseId, free, requested: split.quantity },
            );
          }
          splits.push({
            warehouseId: split.warehouseId,
            warehouseName: stock.warehouse.name,
            quantity: split.quantity,
            shippingCostWeight: stock.warehouse.shippingCostWeight.toNumber(),
          });
        }

        const perProductAllocation = new Map([[productId, { splits, shortfall: 0 }]]);
        await this.persistAllocation(tx, quotation, perProductAllocation, actor, "MANUAL_OVERRIDE");
      });
      return (await this.getOrder(id))!;
    } catch (error) {
      translateWriteError(error);
    }
  }

  /** Shared by accept-split and override: given a per-product allocation decision, creates the
   * Fulfillment/FulfillmentItem/Backorder/StockReservation rows, reserves WarehouseStock, and
   * advances the quotation to FULFILLMENT — all in the caller's transaction. */
  private async persistAllocation(
    tx: Prisma.TransactionClient,
    quotation: Prisma.QuotationGetPayload<{ include: { lines: { include: { product: true } } } }>,
    perProductAllocation: Map<
      string,
      { splits: { warehouseId: string; warehouseName: string; quantity: number; shippingCostWeight: number }[]; shortfall: number }
    >,
    actor: Actor,
    auditAction: "ACCEPT_SUGGESTED_SPLIT" | "MANUAL_OVERRIDE",
  ): Promise<void> {
    const totalShortfall = [...perProductAllocation.values()].reduce((sum, a) => sum + a.shortfall, 0);
    const totalAllocated = [...perProductAllocation.values()].reduce(
      (sum, a) => sum + a.splits.reduce((s, split) => s + split.quantity, 0),
      0,
    );
    const fulfillmentStatus: FulfillmentStatus =
      totalShortfall === 0 ? "ALLOCATED" : totalAllocated === 0 ? "BACKORDERED" : "PARTIALLY_ALLOCATED";

    const fulfillment = await tx.fulfillment.create({
      data: {
        quotationId: quotation.id,
        status: fulfillmentStatus,
        idempotencyKey: randomUUID(),
      },
    });

    // Consume each product's split quantity against that product's lines, in line order —
    // multiple lines of the same product each get their own FulfillmentItem/warehouse slice.
    const eta = estimateShipmentDate(new Date());
    for (const [productId, allocation] of perProductAllocation) {
      const linesForProduct = quotation.lines.filter((l) => l.productId === productId);
      const remainingByWarehouse = new Map(allocation.splits.map((s) => [s.warehouseId, s.quantity]));
      let shortfallRemaining = allocation.shortfall;

      for (const line of linesForProduct) {
        let lineRemaining = line.quantity;

        for (const split of allocation.splits) {
          if (lineRemaining <= 0) break;
          const available = remainingByWarehouse.get(split.warehouseId) ?? 0;
          if (available <= 0) continue;
          const take = Math.min(lineRemaining, available);
          remainingByWarehouse.set(split.warehouseId, available - take);
          lineRemaining -= take;

          await tx.fulfillmentItem.create({
            data: {
              fulfillmentId: fulfillment.id,
              quotationLineId: line.id,
              warehouseId: split.warehouseId,
              productId,
              allocatedQty: take,
              shippingCost: estimateShippingCost(take, split.shippingCostWeight),
              estShipmentDate: eta,
              status: "ALLOCATED",
            },
          });

          const stock = await tx.warehouseStock.findUniqueOrThrow({
            where: { warehouseId_productId: { warehouseId: split.warehouseId, productId } },
            select: { id: true, version: true },
          });
          await withOptimisticVersion(tx.warehouseStock, stock.id, stock.version, {
            reservedQty: { increment: take },
          });
          await tx.stockReservation.create({
            data: {
              warehouseStockId: stock.id,
              fulfillmentId: fulfillment.id,
              productId,
              warehouseId: split.warehouseId,
              quantity: take,
              idempotencyKey: `${fulfillment.id}-${productId}-${split.warehouseId}`,
            },
          });
        }

        if (lineRemaining > 0) {
          const takeAsBackorder = Math.min(lineRemaining, shortfallRemaining);
          if (takeAsBackorder > 0) {
            await tx.backorder.create({
              data: {
                fulfillmentId: fulfillment.id,
                quotationLineId: line.id,
                productId,
                remainingQty: takeAsBackorder,
                status: "OPEN",
              },
            });
            shortfallRemaining -= takeAsBackorder;
          }
        }
      }
    }

    await withOptimisticVersion(tx.quotation, quotation.id, quotation.version, {
      status: "FULFILLMENT",
    });

    await recordAudit(tx, {
      actor,
      entityType: "Fulfillment",
      entityId: fulfillment.id,
      action: auditAction,
      before: null,
      after: { quotationId: quotation.id, status: fulfillmentStatus },
    });
  }

  async markShipped(id: string, actor: Actor): Promise<FulfillmentOrderDetailDto> {
    try {
      await this.db.$transaction(async (tx) => {
        const quotation = await tx.quotation.findUnique({
          where: { id },
          include: {
            fulfillment: { include: { items: true, backorders: true } },
          },
        });
        if (!quotation) throw new ServiceError("NOT_FOUND", "Order not found", { id });
        if (!quotation.fulfillment) {
          throw new ServiceError(
            "INVALID_STATE_TRANSITION",
            "This order has not been allocated yet",
            { id },
          );
        }
        if (quotation.fulfillment.status === "SHIPPED") {
          throw new ServiceError("ALREADY_ACTIONED", "This order has already shipped", { id });
        }
        const openBackorder = quotation.fulfillment.backorders.some((b) => b.status !== "RESOLVED");
        if (openBackorder) {
          throw new ServiceError(
            "INVALID_STATE_TRANSITION",
            "Cannot ship while a backorder remains open",
            { id },
          );
        }

        for (const item of quotation.fulfillment.items) {
          const stock = await tx.warehouseStock.findUniqueOrThrow({
            where: {
              warehouseId_productId: { warehouseId: item.warehouseId, productId: item.productId },
            },
            select: { id: true, version: true },
          });
          await withOptimisticVersion(tx.warehouseStock, stock.id, stock.version, {
            availableQty: { decrement: item.allocatedQty },
            reservedQty: { decrement: item.allocatedQty },
          });
          await tx.fulfillmentItem.update({ where: { id: item.id }, data: { status: "SHIPPED" } });
        }

        await withOptimisticVersion(tx.fulfillment, quotation.fulfillment.id, quotation.fulfillment.version, {
          status: "SHIPPED",
        });
        await withOptimisticVersion(tx.quotation, quotation.id, quotation.version, {
          status: "BILLING",
        });

        await recordAudit(tx, {
          actor,
          entityType: "Fulfillment",
          entityId: quotation.fulfillment.id,
          action: "SHIP",
          before: { status: quotation.fulfillment.status },
          after: { status: "SHIPPED" },
        });
      });
      return (await this.getOrder(id))!;
    } catch (error) {
      translateWriteError(error);
    }
  }
}
