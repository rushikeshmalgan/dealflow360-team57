import { Prisma } from "@/generated/prisma/client";
import type { QuotationStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { combineDiscounts } from "@/modules/discount-risk";

import type { DealHealthAlertType } from "../domain/types";
import type { AlertWriteResult, DealHealthRepository, UpsertAlertInput } from "../application/ports";
import type {
  DealHealthAlertDto,
  DealHealthListQuery,
  QuotationHealthSnapshot,
} from "../application/types";

const alertInclude = {
  quotation: {
    select: { code: true, salesRepId: true, customerId: true, customer: { select: { name: true } } },
  },
} satisfies Prisma.DealHealthAlertInclude;

type AlertRow = Prisma.DealHealthAlertGetPayload<{ include: typeof alertInclude }>;

function toAlertDto(row: AlertRow): DealHealthAlertDto {
  return {
    id: row.id,
    quotationId: row.quotationId,
    quotationCode: row.quotation.code,
    customerId: row.quotation.customerId,
    customerName: row.quotation.customer.name,
    salesRepId: row.quotation.salesRepId,
    type: row.type,
    status: row.status,
    severity: row.severity,
    priorityScore: row.priorityScore,
    dealValue: row.dealValue.toString(),
    details: row.details,
    detectedAt: row.detectedAt.toISOString(),
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

type DiscountLine = { unitPrice: Prisma.Decimal; quantity: number; lineDiscountPct: Prisma.Decimal };

/** Value-weighted effective discount across a quotation's lines (T6.4's combineDiscounts,
 * never re-derived) - also doubles as this snapshot's "deal value" (sum of line net-before-tax). */
function summarizeDiscount(
  lines: readonly DiscountLine[],
  orderDiscountPct: Prisma.Decimal,
): { dealValue: number; currentDiscountPct: number | null } {
  if (lines.length === 0) return { dealValue: 0, currentDiscountPct: null };

  let dealValue = 0;
  let weightedDiscountSum = 0;
  let simpleDiscountSum = 0;
  for (const line of lines) {
    // Stored as a 0-1 fraction (quotation_lines_line_discount_pct_range's DB check constraint);
    // combineDiscounts (like the rest of the app - see prisma-quotation-repository.ts) works in
    // 0-100 percentages, so both inputs need the same ×100 conversion applied on every read.
    const effectiveDiscountPct = combineDiscounts({
      lineDiscountPct: Number(line.lineDiscountPct) * 100,
      orderDiscountPct: Number(orderDiscountPct) * 100,
    });
    const netBeforeTax = Number(line.unitPrice) * line.quantity * (1 - effectiveDiscountPct / 100);
    dealValue += netBeforeTax;
    weightedDiscountSum += effectiveDiscountPct * netBeforeTax;
    simpleDiscountSum += effectiveDiscountPct;
  }
  // Fully-discounted quotes have zero net value to weight by - fall back to a plain average so
  // an all-100%-off quote still reports a discount instead of an arbitrary 0.
  const currentDiscountPct = dealValue > 0 ? weightedDiscountSum / dealValue : simpleDiscountSum / lines.length;
  return { dealValue, currentDiscountPct };
}

const NON_ACTIVE_STATUSES: QuotationStatus[] = ["REJECTED", "COMPLETED"];

export class PrismaDealHealthRepository implements DealHealthRepository {
  async listActiveQuotationIds(limit: number): Promise<string[]> {
    const rows = await prisma.quotation.findMany({
      where: { status: { notIn: NON_ACTIVE_STATUSES } },
      orderBy: { updatedAt: "asc" },
      take: limit,
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  async getSnapshot(quotationId: string): Promise<QuotationHealthSnapshot | null> {
    const quotation = await prisma.quotation.findUnique({
      where: { id: quotationId },
      select: {
        id: true,
        code: true,
        status: true,
        salesRepId: true,
        customerId: true,
        createdAt: true,
        updatedAt: true,
        orderDiscountPct: true,
        customer: { select: { name: true } },
        lines: { select: { unitPrice: true, quantity: true, lineDiscountPct: true } },
        versions: {
          orderBy: { versionNo: "desc" },
          take: 1,
          select: {
            riskEvaluation: { select: { score: true, band: true } },
            approvalRecords: {
              where: { role: "FINANCE_OPS", status: "PENDING" },
              orderBy: { createdAt: "asc" },
              take: 1,
              select: { createdAt: true },
            },
          },
        },
        fulfillment: { select: { items: { select: { estShipmentDate: true } } } },
        // "Promised date" has no dedicated column (TAD SS34 never defines one) - the most
        // recent ACCEPTED negotiation's requestedDeliveryDate is the closest existing concept
        // to a customer-facing delivery commitment; see domain/rules/delivery-slippage.ts.
        negotiations: {
          where: { status: "ACCEPTED", requestedDeliveryDate: { not: null } },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { requestedDeliveryDate: true },
        },
      },
    });
    if (!quotation) return null;

    const { dealValue, currentDiscountPct } = summarizeDiscount(quotation.lines, quotation.orderDiscountPct);

    const latestVersion = quotation.versions[0];
    const latestRisk = latestVersion?.riskEvaluation
      ? { score: Number(latestVersion.riskEvaluation.score), band: latestVersion.riskEvaluation.band }
      : null;
    const pendingFinanceApprovalSince = latestVersion?.approvalRecords[0]?.createdAt ?? null;

    const estimateDates = (quotation.fulfillment?.items ?? [])
      .map((item) => item.estShipmentDate)
      .filter((date): date is Date => date !== null);
    const currentEstimateDate =
      estimateDates.length > 0 ? new Date(Math.max(...estimateDates.map((date) => date.getTime()))) : null;
    const promisedDate = quotation.negotiations[0]?.requestedDeliveryDate ?? null;
    const delivery = promisedDate && currentEstimateDate ? { promisedDate, currentEstimateDate } : null;

    return {
      id: quotation.id,
      code: quotation.code,
      status: quotation.status,
      salesRepId: quotation.salesRepId,
      customerId: quotation.customerId,
      customerName: quotation.customer.name,
      createdAt: quotation.createdAt,
      lastActivityAt: quotation.updatedAt,
      dealValue,
      currentDiscountPct,
      latestRisk,
      pendingFinanceApprovalSince,
      delivery,
    };
  }

  async getRepDiscountHistory(salesRepId: string, quotationId: string, limit: number): Promise<number[]> {
    const rows = await prisma.quotation.findMany({
      where: { salesRepId, id: { not: quotationId } },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        orderDiscountPct: true,
        lines: { select: { unitPrice: true, quantity: true, lineDiscountPct: true } },
      },
    });
    return rows
      .map((row) => summarizeDiscount(row.lines, row.orderDiscountPct).currentDiscountPct)
      .filter((pct): pct is number => pct !== null);
  }

  async upsertOpenAlert(input: UpsertAlertInput): Promise<AlertWriteResult> {
    const existing = await prisma.dealHealthAlert.findUnique({
      where: { quotationId_type: { quotationId: input.quotationId, type: input.type } },
      include: alertInclude,
    });

    // Sticky dismissal: a manager already acknowledged this condition; leave it alone for as
    // long as it stays active rather than silently reopening it every evaluation pass.
    if (existing?.status === "DISMISSED") {
      return { alert: toAlertDto(existing), changed: false };
    }

    const detectedAt = !existing || existing.status === "RESOLVED" ? input.now : existing.detectedAt;
    const changed =
      !existing ||
      existing.status !== "OPEN" ||
      existing.severity !== input.severity ||
      existing.priorityScore !== input.priorityScore;

    const updated = await prisma.dealHealthAlert.upsert({
      where: { quotationId_type: { quotationId: input.quotationId, type: input.type } },
      create: {
        quotationId: input.quotationId,
        type: input.type,
        status: "OPEN",
        severity: input.severity,
        priorityScore: input.priorityScore,
        dealValue: input.dealValue,
        details: input.details as Prisma.InputJsonValue,
        detectedAt,
      },
      update: {
        status: "OPEN",
        severity: input.severity,
        priorityScore: input.priorityScore,
        dealValue: input.dealValue,
        details: input.details as Prisma.InputJsonValue,
        detectedAt,
        resolvedAt: null,
        resolvedByUserId: null,
      },
      include: alertInclude,
    });

    return { alert: toAlertDto(updated), changed };
  }

  async resolveAlertIfOpen(quotationId: string, type: DealHealthAlertType): Promise<AlertWriteResult | null> {
    const existing = await prisma.dealHealthAlert.findUnique({
      where: { quotationId_type: { quotationId, type } },
    });
    if (!existing || existing.status !== "OPEN") return null;

    const updated = await prisma.dealHealthAlert.update({
      where: { id: existing.id },
      data: { status: "RESOLVED", resolvedAt: new Date() },
      include: alertInclude,
    });
    return { alert: toAlertDto(updated), changed: true };
  }

  async listAlerts(query: DealHealthListQuery): Promise<DealHealthAlertDto[]> {
    const rows = await prisma.dealHealthAlert.findMany({
      where: {
        status: query.status,
        type: query.type,
        severity: query.severity,
        quotation: query.salesRepId ? { salesRepId: query.salesRepId } : undefined,
      },
      orderBy: { priorityScore: "desc" },
      take: query.limit ?? 100,
      include: alertInclude,
    });
    return rows.map(toAlertDto);
  }

  async getAlertsForQuotation(quotationId: string): Promise<DealHealthAlertDto[]> {
    const rows = await prisma.dealHealthAlert.findMany({
      where: { quotationId },
      orderBy: { priorityScore: "desc" },
      include: alertInclude,
    });
    return rows.map(toAlertDto);
  }

  async getAlertOwnership(alertId: string): Promise<{ quotationId: string; salesRepId: string } | null> {
    const row = await prisma.dealHealthAlert.findUnique({
      where: { id: alertId },
      select: { quotationId: true, quotation: { select: { salesRepId: true } } },
    });
    if (!row) return null;
    return { quotationId: row.quotationId, salesRepId: row.quotation.salesRepId };
  }

  async dismissAlert(alertId: string, resolvedByUserId: string, now: Date): Promise<DealHealthAlertDto | null> {
    try {
      const updated = await prisma.dealHealthAlert.update({
        where: { id: alertId },
        data: { status: "DISMISSED", resolvedAt: now, resolvedByUserId },
        include: alertInclude,
      });
      return toAlertDto(updated);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") return null;
      throw error;
    }
  }
}
