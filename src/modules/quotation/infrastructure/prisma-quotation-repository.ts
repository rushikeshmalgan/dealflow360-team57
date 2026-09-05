import { randomUUID } from "node:crypto";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { withOptimisticVersion } from "@/lib/optimistic-version";
import { ServiceError } from "@/lib/service-error";
import type { Actor } from "@/modules/shared/domain/actor";
import { calculateLineMargin, calculateQuotationMargin } from "@/modules/discount-risk";
import { pricingService } from "@/modules/pricing";

import type {
  AddQuotationLineInput,
  CreateQuotationInput,
  PatchQuotationInput,
  QuotationListQuery,
  UpdateQuotationDiscountsInput,
} from "../schemas/quotation";
import type { QuotationRepository } from "../application/ports";
import type { QuotationDto } from "../application/types";

const quotationInclude = {
  customer: { select: { id: true, name: true, tierId: true } },
  salesRep: { select: { id: true, email: true } },
  priceList: { select: { id: true, name: true, currency: true } },
  lines: {
    include: {
      product: { select: { id: true, name: true, sku: true, costPrice: true } },
      variant: { select: { id: true, attribute: true, value: true } },
    },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.QuotationInclude;

type QuotationRecord = Prisma.QuotationGetPayload<{ include: typeof quotationInclude }>;

/**
 * *_pct columns are stored as 0-1 fractions on every model in this schema (products.tax_pct,
 * discount_rules.max_discount_pct, ...); the API/DTO layer speaks 0-100 human percentages.
 * Matches the same conversion in prisma-discount-rule-repository.ts.
 */
function toFraction(percent: number): Prisma.Decimal {
  return new Prisma.Decimal(percent).dividedBy(100);
}

/** Floats from the domain layer's arithmetic (e.g. combineDiscounts) can carry binary rounding
 * noise (20.799999999999997) — round to 4 decimal places, matching every other *_pct column's
 * Decimal(7,4) precision, before it goes out over the wire. */
function formatPct(value: number): string {
  return value.toFixed(4).replace(/\.?0+$/, "") || "0";
}

function quotationDto(record: QuotationRecord): QuotationDto {
  // Decimal-to-string stays exact for the DTO field; the plain number is only for the domain
  // layer's arithmetic input (see calculateLineMargin), matching prisma-discount-rule-repository.ts.
  const orderDiscountPctDecimal = record.orderDiscountPct.times(100);
  const orderDiscountPct = orderDiscountPctDecimal.toNumber();

  const lineMargins = record.lines.map((line) => ({
    line,
    margin: calculateLineMargin({
      unitPrice: line.unitPrice.toNumber(),
      quantity: line.quantity,
      unitCost: line.product.costPrice.toNumber(),
      lineDiscountPct: line.lineDiscountPct.times(100).toNumber(),
      orderDiscountPct,
    }),
  }));
  const summary = calculateQuotationMargin(lineMargins.map(({ margin }) => margin));

  return {
    id: record.id,
    code: record.code,
    seqNo: record.seqNo,
    customer: record.customer,
    salesRep: record.salesRep,
    priceList: record.priceList,
    status: record.status,
    orderDiscountPct: orderDiscountPctDecimal.toString(),
    version: record.version,
    lines: lineMargins.map(({ line, margin }) => ({
      id: line.id,
      product: { id: line.product.id, name: line.product.name, sku: line.product.sku },
      variant: line.variant,
      quantity: line.quantity,
      unitPrice: line.unitPrice.toFixed(2),
      lineDiscountPct: line.lineDiscountPct.times(100).toString(),
      billingType: line.billingType,
      effectiveDiscountPct: formatPct(margin.effectiveDiscountPct),
      netBeforeTax: margin.netBeforeTax.toFixed(2),
      marginAmount: margin.marginAmount.toFixed(2),
      marginPct: margin.marginPct === null ? null : formatPct(margin.marginPct),
      createdAt: line.createdAt.toISOString(),
      updatedAt: line.updatedAt.toISOString(),
    })),
    summary: {
      netBeforeTax: summary.totalNetBeforeTax.toFixed(2),
      totalCost: summary.totalCost.toFixed(2),
      marginAmount: summary.totalMarginAmount.toFixed(2),
      marginPct: summary.marginPct === null ? null : formatPct(summary.marginPct),
    },
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function translateWriteError(error: unknown): never {
  if (error instanceof ServiceError) throw error;
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2025")
      throw new ServiceError("NOT_FOUND", "The requested quotation was not found");
    if (error.code === "P2002") {
      throw new ServiceError(
        "CONFIGURATION_CONFLICT",
        "A unique quotation value is already in use",
        {
          target: error.meta?.target,
        },
      );
    }
  }
  throw error;
}

export class PrismaQuotationRepository implements QuotationRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async list(query: QuotationListQuery) {
    const quotations = await this.db.quotation.findMany({
      where: { status: query.status, customerId: query.customerId, salesRepId: query.salesRepId },
      include: quotationInclude,
      orderBy: { updatedAt: "desc" },
    });
    return quotations.map(quotationDto);
  }

  async get(id: string) {
    const quotation = await this.db.quotation.findUnique({
      where: { id },
      include: quotationInclude,
    });
    return quotation ? quotationDto(quotation) : null;
  }

  async create(input: CreateQuotationInput, actor: Actor) {
    try {
      return await this.db.$transaction(async (tx) => {
        const customer = await tx.customer.findUnique({
          where: { id: input.customerId },
          select: { tierId: true },
        });
        if (!customer)
          throw new ServiceError("NOT_FOUND", "Customer not found", { id: input.customerId });

        const priceList = await tx.priceList.findUnique({
          where: { id: input.priceListId },
          select: { id: true, isActive: true, tierId: true },
        });
        if (!priceList?.isActive) {
          throw new ServiceError("NOT_FOUND", "Price list not found", { id: input.priceListId });
        }
        if (priceList.tierId !== customer.tierId) {
          throw new ServiceError(
            "VALIDATION_ERROR",
            "The selected price list does not match this customer's tier",
            { customerId: input.customerId, priceListId: input.priceListId },
          );
        }

        const draft = await tx.quotation.create({
          data: {
            code: `PENDING-${randomUUID()}`,
            customerId: input.customerId,
            salesRepId: actor.id,
            priceListId: input.priceListId,
          },
        });
        const created = await tx.quotation.update({
          where: { id: draft.id },
          data: { code: `QT-${draft.seqNo.toString().padStart(6, "0")}` },
          include: quotationInclude,
        });

        const dto = quotationDto(created);
        await recordAudit(tx, {
          actor,
          entityType: "Quotation",
          entityId: created.id,
          action: "CREATE",
          before: null,
          after: dto,
        });
        return dto;
      });
    } catch (error) {
      translateWriteError(error);
    }
  }

  async addLine(id: string, input: AddQuotationLineInput, actor: Actor) {
    try {
      return await this.db.$transaction(async (tx) => {
        const quotation = await tx.quotation.findUnique({
          where: { id },
          select: {
            customer: { select: { tierId: true } },
            priceList: { select: { currency: true } },
          },
        });
        if (!quotation) throw new ServiceError("NOT_FOUND", "Quotation not found", { id });

        const resolved = await pricingService.resolvePrice(
          quotation.customer.tierId,
          input.productId,
          input.variantId ?? null,
          quotation.priceList.currency,
        );

        const line = await tx.quotationLine.create({
          data: {
            quotationId: id,
            productId: input.productId,
            variantId: input.variantId ?? null,
            quantity: input.quantity,
            unitPrice: resolved.unitPrice,
            billingType: input.billingType,
          },
        });

        await withOptimisticVersion(tx.quotation, id, input.expectedVersion, {});

        await recordAudit(tx, {
          actor,
          entityType: "Quotation",
          entityId: id,
          action: "ADD_LINE",
          before: null,
          after: {
            lineId: line.id,
            productId: input.productId,
            variantId: input.variantId ?? null,
            quantity: input.quantity,
            unitPrice: resolved.unitPrice,
          },
        });

        const updated = await tx.quotation.findUniqueOrThrow({
          where: { id },
          include: quotationInclude,
        });
        return quotationDto(updated);
      });
    } catch (error) {
      translateWriteError(error);
    }
  }

  async patch(id: string, input: PatchQuotationInput, actor: Actor) {
    try {
      return await this.db.$transaction(async (tx) => {
        if (input.removeLineId) {
          const line = await tx.quotationLine.findFirst({
            where: { id: input.removeLineId, quotationId: id },
            select: { id: true, productId: true, quantity: true },
          });
          if (!line)
            throw new ServiceError("NOT_FOUND", "Quotation line not found", {
              id: input.removeLineId,
            });

          await tx.quotationLine.delete({ where: { id: line.id } });
          await withOptimisticVersion(tx.quotation, id, input.expectedVersion, {});
          await recordAudit(tx, {
            actor,
            entityType: "Quotation",
            entityId: id,
            action: "REMOVE_LINE",
            before: line,
            after: null,
          });
        } else if (input.updateLineQuantity) {
          const { lineId, quantity } = input.updateLineQuantity;
          const existing = await tx.quotationLine.findFirst({
            where: { id: lineId, quotationId: id },
            select: { id: true, quantity: true },
          });
          if (!existing)
            throw new ServiceError("NOT_FOUND", "Quotation line not found", { id: lineId });

          await tx.quotationLine.update({ where: { id: lineId }, data: { quantity } });
          await withOptimisticVersion(tx.quotation, id, input.expectedVersion, {});
          await recordAudit(tx, {
            actor,
            entityType: "Quotation",
            entityId: id,
            action: "UPDATE_LINE_QUANTITY",
            before: { lineId, quantity: existing.quantity },
            after: { lineId, quantity },
          });
        }

        const updated = await tx.quotation.findUniqueOrThrow({
          where: { id },
          include: quotationInclude,
        });
        return quotationDto(updated);
      });
    } catch (error) {
      translateWriteError(error);
    }
  }

  async updateDiscounts(id: string, input: UpdateQuotationDiscountsInput, actor: Actor) {
    try {
      return await this.db.$transaction(async (tx) => {
        const before: Record<string, unknown> = {};
        const after: Record<string, unknown> = {};

        if (input.lineDiscounts) {
          const lines = await tx.quotationLine.findMany({
            where: { id: { in: input.lineDiscounts.map((d) => d.lineId) }, quotationId: id },
            select: { id: true, lineDiscountPct: true },
          });
          if (lines.length !== input.lineDiscounts.length) {
            throw new ServiceError(
              "NOT_FOUND",
              "One or more quotation lines were not found on this quotation",
            );
          }
          const beforeByLine = new Map(
            lines.map((line) => [line.id, line.lineDiscountPct.times(100).toString()]),
          );

          for (const { lineId, lineDiscountPct } of input.lineDiscounts) {
            await tx.quotationLine.update({
              where: { id: lineId },
              data: { lineDiscountPct: toFraction(lineDiscountPct) },
            });
          }
          before.lineDiscounts = input.lineDiscounts.map((d) => ({
            lineId: d.lineId,
            lineDiscountPct: beforeByLine.get(d.lineId),
          }));
          after.lineDiscounts = input.lineDiscounts;
        }

        if (input.orderDiscountPct !== undefined) {
          const current = await tx.quotation.findUniqueOrThrow({
            where: { id },
            select: { orderDiscountPct: true },
          });
          before.orderDiscountPct = current.orderDiscountPct.times(100).toString();
          after.orderDiscountPct = input.orderDiscountPct;
        }

        await withOptimisticVersion(
          tx.quotation,
          id,
          input.expectedVersion,
          input.orderDiscountPct !== undefined
            ? { orderDiscountPct: toFraction(input.orderDiscountPct) }
            : {},
        );

        await recordAudit(tx, {
          actor,
          entityType: "Quotation",
          entityId: id,
          action: "UPDATE_DISCOUNTS",
          before,
          after,
        });

        const updated = await tx.quotation.findUniqueOrThrow({
          where: { id },
          include: quotationInclude,
        });
        return quotationDto(updated);
      });
    } catch (error) {
      translateWriteError(error);
    }
  }
}
