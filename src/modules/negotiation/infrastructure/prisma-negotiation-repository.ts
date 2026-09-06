import { createHash } from "node:crypto";

import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { withOptimisticVersion } from "@/lib/optimistic-version";
import { ServiceError } from "@/lib/service-error";
import {
  calculateLineMargin,
  calculateQuotationMargin,
  resolveDiscountCeiling,
  scoreRisk,
} from "@/modules/discount-risk";
import type {
  PortalCommentAuthor,
  PortalCommentDto,
  PortalConfirmResultDto,
  PortalNegotiationStatus,
  PortalQuotationDetailDto,
  PortalQuotationListItemDto,
  PortalQuotationStatus,
} from "@/modules/portal/application/types";
import type { Actor } from "@/modules/shared/domain/actor";

import type { NegotiateQuotationInput } from "../schemas/negotiation";
import type { ResolveNegotiationInput } from "../schemas/resolve";
import type { InternalNegotiationRepository, NegotiationRepository } from "../application/ports";
import type { PendingNegotiationDto, ResolveNegotiationResultDto } from "../application/types";

type CustomerActor = Actor & { customerId: string };

/** A quotation is only visible in the portal once it has left internal drafting/approval. */
const CUSTOMER_VISIBLE_STATUSES = [
  "SENT_TO_CUSTOMER",
  "UNDER_NEGOTIATION",
  "RE_APPROVAL_REQUIRED",
  "CONFIRMED",
  "COMPLETED",
] as const;

/** Of those, only these two accept a new negotiate/confirm action from the customer. */
const NEGOTIABLE_STATUSES = ["SENT_TO_CUSTOMER", "UNDER_NEGOTIATION"] as const;

const RESOLUTION_ACTION_LABEL: Record<string, string> = {
  ACCEPTED: "Counter-offer accepted",
  REJECTED: "Counter-offer declined",
  SUPERSEDED: "Request superseded",
};

/** Customer-safe subset of audit actions this module writes — see recordAudit calls below.
 * Nothing else in `audit_logs` for a quotation is ever surfaced to the portal. */
const AUDIT_HISTORY_ACTIONS = ["PORTAL_CONFIRM", "PORTAL_CONFIRM_REROUTED"] as const;
const AUDIT_ACTION_LABEL: Record<string, string> = {
  PORTAL_CONFIRM: "Confirmed quotation",
  PORTAL_CONFIRM_REROUTED: "Confirmation routed for re-approval",
};

const detailInclude = {
  customer: { select: { id: true, name: true, tierId: true } },
  lines: {
    include: {
      product: { select: { id: true, name: true, sku: true, categoryId: true, costPrice: true } },
      variant: { select: { id: true, attribute: true, value: true } },
    },
    orderBy: { createdAt: "asc" },
  },
  // Unfiltered: both general (quotationLineId null) and per-line comments come through this one
  // relation and are bucketed by quotationLineId in toDetailDto, rather than fetching twice.
  comments: {
    include: { author: { select: { id: true, role: true } } },
    orderBy: { createdAt: "asc" },
  },
  negotiations: {
    include: { changeRequests: true },
    orderBy: { createdAt: "asc" },
  },
} satisfies Prisma.QuotationInclude;

type QuotationDetailRecord = Prisma.QuotationGetPayload<{ include: typeof detailInclude }>;
type NegotiationRecord = QuotationDetailRecord["negotiations"][number];
type CommentRecord = QuotationDetailRecord["comments"][number];
type AuditHistoryRow = { id: string; action: string; createdAt: Date };

function toFraction(percent: number): Prisma.Decimal {
  return new Prisma.Decimal(percent).dividedBy(100);
}

function formatPct(value: number): string {
  return value.toFixed(4).replace(/\.?0+$/, "") || "0";
}

function deriveNegotiationStatus(
  negotiations: readonly { status: string }[],
  quotationStatus: string,
): PortalNegotiationStatus {
  const latest = negotiations[negotiations.length - 1];
  if (latest?.status === "PENDING") return "PENDING";
  if (latest?.status === "ACCEPTED") return "ACCEPTED";
  if (latest?.status === "REJECTED") return "REJECTED";
  // A CONFIRMED/COMPLETED quotation always reached that state through an accepted negotiation
  // (see confirm() below), even for the "confirmed as-is, no negotiation ever opened" path.
  if (quotationStatus === "CONFIRMED" || quotationStatus === "COMPLETED") return "ACCEPTED";
  return "NONE";
}

/** Negotiation has no per-user attribution column (schema: customerId only) — "Requested
 * change" events are always labelled generically for the customer side. */
function summarizeNegotiation(neg: NegotiationRecord): string | null {
  const parts: string[] = [];
  if (neg.counterDiscountPct) {
    parts.push(`Counter-discount ${neg.counterDiscountPct.times(100).toString()}%`);
  }
  if (neg.requestedDeliveryDate) {
    parts.push(`delivery by ${neg.requestedDeliveryDate.toISOString().slice(0, 10)}`);
  }
  if (neg.changeRequests.length > 0) {
    parts.push(`${neg.changeRequests.length} line change request(s)`);
  }
  return parts.length > 0 ? parts.join(", ") : null;
}

function toCommentDto(comment: CommentRecord, actor: CustomerActor): PortalCommentDto {
  const author: PortalCommentAuthor = comment.author.role === "CUSTOMER" ? "CUSTOMER" : "SALES";
  const authorLabel =
    comment.authorUserId === actor.id ? "You" : author === "CUSTOMER" ? "Your Team" : "Sales Team";
  return {
    id: comment.id,
    author,
    authorLabel,
    comment: comment.comment,
    createdAt: comment.createdAt.toISOString(),
  };
}

function toDetailDto(
  record: QuotationDetailRecord,
  auditEvents: readonly AuditHistoryRow[],
  actor: CustomerActor,
): PortalQuotationDetailDto {
  const orderDiscountPctDecimal = record.orderDiscountPct.times(100);
  const orderDiscountPct = orderDiscountPctDecimal.toNumber();

  const commentsByLine = new Map<string, CommentRecord[]>();
  const generalComments: CommentRecord[] = [];
  for (const comment of record.comments) {
    if (comment.quotationLineId) {
      const bucket = commentsByLine.get(comment.quotationLineId) ?? [];
      bucket.push(comment);
      commentsByLine.set(comment.quotationLineId, bucket);
    } else {
      generalComments.push(comment);
    }
  }

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

  const lines = lineMargins.map(({ line, margin }) => ({
    id: line.id,
    productName: line.product.name,
    sku: line.product.sku,
    quantity: line.quantity,
    unitPrice: line.unitPrice.toFixed(2),
    discountPct: formatPct(margin.effectiveDiscountPct),
    lineTotal: margin.netBeforeTax.toFixed(2),
    comments: (commentsByLine.get(line.id) ?? []).map((c) => toCommentDto(c, actor)),
  }));

  const pendingNegotiation = record.negotiations.find((n) => n.status === "PENDING");
  // Negotiation has no FK to the comments made alongside it, and at most one negotiation can be
  // PENDING at a time (enforced in negotiate() below) — so "the latest general comment made at
  // or after this negotiation opened" is an unambiguous, correct way to recover which comment
  // belongs to it without a schema change.
  const generalCommentForPending = pendingNegotiation
    ? [...generalComments].reverse().find((c) => c.createdAt >= pendingNegotiation.createdAt)
    : undefined;

  type HistoryEvent = {
    id: string;
    actor: PortalCommentAuthor;
    actorLabel: string;
    action: string;
    detail: string | null;
    createdAt: Date;
  };
  const historyEvents: HistoryEvent[] = [];
  for (const neg of record.negotiations) {
    historyEvents.push({
      id: `negotiation-${neg.id}`,
      actor: "CUSTOMER",
      actorLabel: "You",
      action: "Requested change",
      detail: summarizeNegotiation(neg),
      createdAt: neg.createdAt,
    });
    if (neg.status !== "PENDING" && neg.updatedAt.getTime() !== neg.createdAt.getTime()) {
      historyEvents.push({
        id: `negotiation-${neg.id}-resolved`,
        actor: "SALES",
        actorLabel: "Sales Team",
        action: RESOLUTION_ACTION_LABEL[neg.status] ?? "Updated",
        detail: null,
        createdAt: neg.updatedAt,
      });
    }
  }
  for (const log of auditEvents) {
    historyEvents.push({
      id: `audit-${log.id}`,
      actor: "CUSTOMER",
      actorLabel: "You",
      action: AUDIT_ACTION_LABEL[log.action] ?? log.action,
      detail: null,
      createdAt: log.createdAt,
    });
  }
  historyEvents.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  return {
    id: record.id,
    code: record.code,
    status: record.status as PortalQuotationStatus,
    // No expiry/validity column exists on Quotation yet — honestly null rather than invented.
    validUntil: null,
    customerName: record.customer.name,
    orderDiscountPct: orderDiscountPctDecimal.toString(),
    orderTotal: summary.totalNetBeforeTax.toFixed(2),
    lines,
    negotiationStatus: deriveNegotiationStatus(record.negotiations, record.status),
    pendingNegotiation: pendingNegotiation
      ? {
          counterDiscountPct: pendingNegotiation.counterDiscountPct
            ? pendingNegotiation.counterDiscountPct.times(100).toString()
            : null,
          requestedDeliveryDate: pendingNegotiation.requestedDeliveryDate
            ? pendingNegotiation.requestedDeliveryDate.toISOString().slice(0, 10)
            : null,
          generalComment: generalCommentForPending?.comment ?? null,
          submittedAt: pendingNegotiation.createdAt.toISOString(),
        }
      : null,
    history: historyEvents.map((e) => ({
      id: e.id,
      actor: e.actor,
      actorLabel: e.actorLabel,
      action: e.action,
      detail: e.detail,
      createdAt: e.createdAt.toISOString(),
    })),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function translateWriteError(error: unknown): never {
  if (error instanceof ServiceError) throw error;
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
    throw new ServiceError("NOT_FOUND", "The requested quotation was not found");
  }
  throw error;
}

export class PrismaNegotiationRepository implements NegotiationRepository, InternalNegotiationRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async listPortalQuotations(actor: CustomerActor): Promise<PortalQuotationListItemDto[]> {
    const quotations = await this.db.quotation.findMany({
      where: { customerId: actor.customerId, status: { in: [...CUSTOMER_VISIBLE_STATUSES] } },
      select: {
        id: true,
        code: true,
        status: true,
        updatedAt: true,
        orderDiscountPct: true,
        lines: { select: { unitPrice: true, quantity: true, lineDiscountPct: true } },
        negotiations: { orderBy: { createdAt: "asc" }, select: { status: true } },
      },
      orderBy: { updatedAt: "desc" },
    });

    return quotations.map((q) => {
      const orderDiscountPct = q.orderDiscountPct.times(100).toNumber();
      const total = q.lines.reduce(
        (sum, line) =>
          sum +
          calculateLineMargin({
            unitPrice: line.unitPrice.toNumber(),
            quantity: line.quantity,
            unitCost: 0,
            lineDiscountPct: line.lineDiscountPct.times(100).toNumber(),
            orderDiscountPct,
          }).netBeforeTax,
        0,
      );
      return {
        id: q.id,
        code: q.code,
        status: q.status as PortalQuotationStatus,
        negotiationStatus: deriveNegotiationStatus(q.negotiations, q.status),
        total: total.toFixed(2),
        updatedAt: q.updatedAt.toISOString(),
      };
    });
  }

  async getPortalQuotation(
    actor: CustomerActor,
    id: string,
  ): Promise<PortalQuotationDetailDto | null> {
    const record = await this.db.quotation.findFirst({
      where: { id, customerId: actor.customerId, status: { in: [...CUSTOMER_VISIBLE_STATUSES] } },
      include: detailInclude,
    });
    if (!record) return null;

    const auditEvents = await this.db.auditLog.findMany({
      where: { entityType: "Quotation", entityId: id, action: { in: [...AUDIT_HISTORY_ACTIONS] } },
      select: { id: true, action: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    });
    return toDetailDto(record, auditEvents, actor);
  }

  async negotiate(
    actor: CustomerActor,
    id: string,
    input: NegotiateQuotationInput,
  ): Promise<PortalQuotationDetailDto> {
    try {
      return await this.db.$transaction(async (tx) => {
        const quotation = await tx.quotation.findFirst({
          where: { id, customerId: actor.customerId },
          select: { status: true, version: true },
        });
        if (!quotation) throw new ServiceError("NOT_FOUND", "Quotation not found", { id });
        if (!(NEGOTIABLE_STATUSES as readonly string[]).includes(quotation.status)) {
          throw new ServiceError(
            "INVALID_STATE_TRANSITION",
            "This quotation is no longer open for negotiation",
            { id, status: quotation.status },
          );
        }

        const existingPending = await tx.negotiation.findFirst({
          where: { quotationId: id, status: "PENDING" },
          select: { id: true },
        });
        if (existingPending) {
          throw new ServiceError(
            "ALREADY_ACTIONED",
            "A request is already pending. Wait for a response before submitting another.",
            { id },
          );
        }

        // Every lineId the customer referenced must actually belong to this quotation — never
        // trust it just because it looks like a UUID.
        const referencedLineIds = new Set([
          ...(input.lineComments ?? []).map((c) => c.lineId),
          ...(input.changeRequests ?? []).map((c) => c.lineId),
        ]);
        if (referencedLineIds.size > 0) {
          const owned = await tx.quotationLine.findMany({
            where: { id: { in: [...referencedLineIds] }, quotationId: id },
            select: { id: true },
          });
          if (owned.length !== referencedLineIds.size) {
            throw new ServiceError(
              "VALIDATION_ERROR",
              "One or more referenced lines do not belong to this quotation",
            );
          }
        }

        const latestVersion = await tx.quotationVersion.findFirst({
          where: { quotationId: id },
          orderBy: { versionNo: "desc" },
          select: { id: true },
        });

        const negotiation = await tx.negotiation.create({
          data: {
            quotationId: id,
            quotationVersionId: latestVersion?.id ?? null,
            customerId: actor.customerId,
            status: "PENDING",
            counterDiscountPct:
              input.counterDiscountPct !== undefined ? toFraction(input.counterDiscountPct) : null,
            requestedDeliveryDate: input.requestedDeliveryDate
              ? new Date(input.requestedDeliveryDate)
              : null,
          },
        });

        if (input.generalComment) {
          await tx.customerComment.create({
            data: { quotationId: id, authorUserId: actor.id, comment: input.generalComment },
          });
        }
        for (const lc of input.lineComments ?? []) {
          await tx.customerComment.create({
            data: {
              quotationId: id,
              quotationLineId: lc.lineId,
              authorUserId: actor.id,
              comment: lc.comment,
            },
          });
        }
        if (input.changeRequests?.length) {
          await tx.changeRequest.createMany({
            data: input.changeRequests.map((cr) => ({
              negotiationId: negotiation.id,
              quotationLineId: cr.lineId,
              requestType: cr.requestType,
              requestedValue: { note: cr.note } as Prisma.InputJsonValue,
            })),
          });
        }

        await withOptimisticVersion(tx.quotation, id, quotation.version, {
          status: "UNDER_NEGOTIATION",
        });

        await recordAudit(tx, {
          actor,
          entityType: "Quotation",
          entityId: id,
          action: "PORTAL_NEGOTIATE",
          before: { status: quotation.status },
          after: { status: "UNDER_NEGOTIATION", negotiationId: negotiation.id },
        });

        const updated = await tx.quotation.findUniqueOrThrow({
          where: { id },
          include: detailInclude,
        });
        const auditEvents = await tx.auditLog.findMany({
          where: { entityType: "Quotation", entityId: id, action: { in: [...AUDIT_HISTORY_ACTIONS] } },
          select: { id: true, action: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        });
        return toDetailDto(updated, auditEvents, actor);
      });
    } catch (error) {
      translateWriteError(error);
    }
  }

  async confirm(
    actor: CustomerActor,
    id: string,
  ): Promise<{ result: PortalConfirmResultDto; quotation: PortalQuotationDetailDto }> {
    try {
      return await this.db.$transaction(async (tx) => {
        const quotation = await tx.quotation.findFirst({
          where: { id, customerId: actor.customerId },
          include: {
            customer: { select: { tierId: true } },
            lines: {
              include: { product: { select: { categoryId: true, costPrice: true } } },
            },
          },
        });
        if (!quotation) throw new ServiceError("NOT_FOUND", "Quotation not found", { id });
        if (!(NEGOTIABLE_STATUSES as readonly string[]).includes(quotation.status)) {
          throw new ServiceError(
            "INVALID_STATE_TRANSITION",
            "This quotation cannot be confirmed in its current state",
            { id, status: quotation.status },
          );
        }
        const pending = await tx.negotiation.findFirst({
          where: { quotationId: id, status: "PENDING" },
          select: { id: true },
        });
        if (pending) {
          throw new ServiceError(
            "ALREADY_ACTIONED",
            "Resolve the pending negotiation request before confirming",
            { id },
          );
        }

        // Re-evaluation reuses T7.2's exact discount-ceiling + risk-scoring engines
        // (scoreRisk.ts names this "T12.4 negotiation re-approval" as an intended second
        // caller) called directly rather than through DiscountRuleService/ApprovalRuleService,
        // whose `requireInternal` gate would reject this CUSTOMER actor — this re-check is a
        // system-triggered side effect of a customer action, not a config-management call a
        // customer could otherwise ever make.
        const orderDiscountPct = quotation.orderDiscountPct.times(100).toNumber();
        const categoryIds = [...new Set(quotation.lines.map((l) => l.product.categoryId))];
        const [tierRule, categoryRules] = await Promise.all([
          tx.discountRule.findFirst({
            where: { scope: "TIER", tierId: quotation.customer.tierId, isActive: true },
            select: { maxDiscountPct: true },
          }),
          tx.discountRule.findMany({
            where: { scope: "CATEGORY", categoryId: { in: categoryIds }, isActive: true },
            select: { categoryId: true, maxDiscountPct: true },
          }),
        ]);
        const tierCeilingPct = tierRule ? tierRule.maxDiscountPct.times(100).toNumber() : null;
        const categoryCeilingByCategoryId = new Map(
          categoryRules.map((r) => [r.categoryId, r.maxDiscountPct.times(100).toNumber()]),
        );

        const lineEvaluations = quotation.lines.map((line) => {
          const categoryCeilingPct = categoryCeilingByCategoryId.get(line.product.categoryId) ?? null;
          const ceiling = resolveDiscountCeiling({ tierCeilingPct, categoryCeilingPct });
          const margin = calculateLineMargin({
            unitPrice: line.unitPrice.toNumber(),
            quantity: line.quantity,
            unitCost: line.product.costPrice.toNumber(),
            lineDiscountPct: line.lineDiscountPct.times(100).toNumber(),
            orderDiscountPct,
          });
          return { lineId: line.id, allowedDiscountPct: ceiling.allowedDiscountPct, margin };
        });
        const summary = calculateQuotationMargin(lineEvaluations.map((l) => l.margin));
        const risk = scoreRisk({
          lines: lineEvaluations.map((l) => ({
            lineId: l.lineId,
            allowedDiscountPct: l.allowedDiscountPct,
            effectiveDiscountPct: l.margin.effectiveDiscountPct,
            netBeforeTax: l.margin.netBeforeTax,
          })),
          quoteMarginPct: summary.marginPct,
        });

        const approvalRule = await tx.approvalRule.findFirst({
          where: { riskBand: risk.band, isActive: true },
          include: { steps: { orderBy: { stepOrder: "asc" } } },
        });
        const approvalSteps = approvalRule?.steps ?? [];
        const requiresApproval = approvalSteps.length > 0;

        if (requiresApproval) {
          const payload = {
            source: "PORTAL_CONFIRM_REROUTE",
            orderDiscountPct,
            lines: lineEvaluations.map((l) => ({
              lineId: l.lineId,
              effectiveDiscountPct: l.margin.effectiveDiscountPct,
              netBeforeTax: l.margin.netBeforeTax,
            })),
            risk,
          };
          const payloadHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");

          const versionCount = await tx.quotationVersion.count({ where: { quotationId: id } });
          const quotationVersion = await tx.quotationVersion.create({
            data: {
              quotationId: id,
              versionNo: versionCount + 1,
              payload: payload as Prisma.InputJsonValue,
              payloadHash,
            },
          });
          await tx.riskEvaluation.create({
            data: {
              quotationVersionId: quotationVersion.id,
              score: new Prisma.Decimal(risk.score),
              band: risk.band,
              explanation: risk.explanation as Prisma.InputJsonValue,
              configVersion: risk.configVersion,
            },
          });
          await tx.approvalRecord.createMany({
            data: approvalSteps.map((step) => ({
              quotationVersionId: quotationVersion.id,
              stepOrder: step.stepOrder,
              role: step.role,
            })),
          });
          await withOptimisticVersion(tx.quotation, id, quotation.version, {
            status: "RE_APPROVAL_REQUIRED",
          });
          await recordAudit(tx, {
            actor,
            entityType: "Quotation",
            entityId: id,
            action: "PORTAL_CONFIRM_REROUTED",
            before: { status: quotation.status },
            after: { status: "RE_APPROVAL_REQUIRED", riskBand: risk.band },
          });
        } else {
          await withOptimisticVersion(tx.quotation, id, quotation.version, { status: "CONFIRMED" });
          await recordAudit(tx, {
            actor,
            entityType: "Quotation",
            entityId: id,
            action: "PORTAL_CONFIRM",
            before: { status: quotation.status },
            after: { status: "CONFIRMED" },
          });
        }

        const updated = await tx.quotation.findUniqueOrThrow({
          where: { id },
          include: detailInclude,
        });
        const auditEvents = await tx.auditLog.findMany({
          where: { entityType: "Quotation", entityId: id, action: { in: [...AUDIT_HISTORY_ACTIONS] } },
          select: { id: true, action: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        });

        return {
          result: {
            status: requiresApproval ? "PENDING_APPROVAL" : "CONFIRMED",
            reason: requiresApproval ? "threshold_exceeded" : undefined,
          },
          quotation: toDetailDto(updated, auditEvents, actor),
        };
      });
    } catch (error) {
      translateWriteError(error);
    }
  }

  private async ownershipCheck(actor: Actor, quotationId: string): Promise<{ salesRepId: string }> {
    const quotation = await this.db.quotation.findUnique({
      where: { id: quotationId },
      select: { salesRepId: true },
    });
    if (!quotation) throw new ServiceError("NOT_FOUND", "Quotation not found", { id: quotationId });
    if (actor.role === "SALES_REP" && actor.id !== quotation.salesRepId) {
      throw new ServiceError("FORBIDDEN", "You can only manage negotiations on your own quotations");
    }
    return quotation;
  }

  async getPendingNegotiation(actor: Actor, quotationId: string): Promise<PendingNegotiationDto | null> {
    await this.ownershipCheck(actor, quotationId);

    const pending = await this.db.negotiation.findFirst({
      where: { quotationId, status: "PENDING" },
      include: { changeRequests: true },
      orderBy: { createdAt: "desc" },
    });
    if (!pending) return null;

    const comments = await this.db.customerComment.findMany({
      where: { quotationId, createdAt: { gte: pending.createdAt } },
      orderBy: { createdAt: "asc" },
    });

    return toPendingNegotiationDto(pending, comments);
  }

  async resolve(
    actor: Actor,
    quotationId: string,
    negotiationId: string,
    input: ResolveNegotiationInput,
  ): Promise<ResolveNegotiationResultDto> {
    try {
      return await this.db.$transaction(async (tx) => {
        const quotation = await tx.quotation.findUnique({
          where: { id: quotationId },
          select: { status: true, version: true, salesRepId: true },
        });
        if (!quotation) throw new ServiceError("NOT_FOUND", "Quotation not found", { id: quotationId });
        if (actor.role === "SALES_REP" && actor.id !== quotation.salesRepId) {
          throw new ServiceError("FORBIDDEN", "You can only manage negotiations on your own quotations");
        }
        // Re-checks status inside the same transaction as the write below (the ownershipCheck()
        // helper used by getPendingNegotiation only covers the read path).
        if (quotation.status !== "UNDER_NEGOTIATION") {
          throw new ServiceError(
            "INVALID_STATE_TRANSITION",
            "This quotation has no active negotiation to resolve",
            { id: quotationId, status: quotation.status },
          );
        }

        const negotiation = await tx.negotiation.findFirst({
          where: { id: negotiationId, quotationId },
          include: { changeRequests: true },
        });
        if (!negotiation) throw new ServiceError("NOT_FOUND", "Negotiation not found", { id: negotiationId });
        if (negotiation.status !== "PENDING") {
          throw new ServiceError("ALREADY_ACTIONED", "This negotiation has already been resolved", {
            id: negotiationId,
          });
        }

        const applying = input.action === "APPLY";
        const newNegotiationStatus = applying ? "ACCEPTED" : "REJECTED";

        await tx.negotiation.update({ where: { id: negotiationId }, data: { status: newNegotiationStatus } });
        if (negotiation.changeRequests.length) {
          await tx.changeRequest.updateMany({
            where: { negotiationId },
            data: { status: applying ? "APPLIED" : "REJECTED" },
          });
        }

        // Applying re-opens the quote for the customer to review/confirm rather than jumping
        // straight to CONFIRMED — T12.4's confirm() (already implemented) is what re-scores risk
        // and routes to re-approval or fulfillment; this only ever hands control back to the
        // customer with the counter-discount (the negotiation's one directly-actionable term)
        // applied. Quantity/line-removal change requests are recorded as APPLIED/REJECTED here
        // for the audit trail, but executing them still goes through the rep's normal builder
        // controls (PATCH /api/quotations/{id}) — deliberately not auto-mutated here.
        await withOptimisticVersion(tx.quotation, quotationId, quotation.version, {
          status: "SENT_TO_CUSTOMER",
          ...(applying && negotiation.counterDiscountPct !== null
            ? { orderDiscountPct: negotiation.counterDiscountPct }
            : {}),
        });

        await recordAudit(tx, {
          actor,
          entityType: "Quotation",
          entityId: quotationId,
          action: applying ? "NEGOTIATION_APPLIED" : "NEGOTIATION_DECLINED",
          before: { status: "UNDER_NEGOTIATION" },
          after: { status: "SENT_TO_CUSTOMER", negotiationId },
          reason: input.reason,
        });

        const [updatedNegotiation, updatedQuotation, comments] = await Promise.all([
          tx.negotiation.findUniqueOrThrow({ where: { id: negotiationId }, include: { changeRequests: true } }),
          tx.quotation.findUniqueOrThrow({ where: { id: quotationId }, select: { status: true, version: true } }),
          tx.customerComment.findMany({
            where: { quotationId, createdAt: { gte: negotiation.createdAt } },
            orderBy: { createdAt: "asc" },
          }),
        ]);

        return {
          negotiation: toPendingNegotiationDto(updatedNegotiation, comments),
          quotationId,
          quotationStatus: updatedQuotation.status,
          quotationVersion: updatedQuotation.version,
        };
      });
    } catch (error) {
      translateWriteError(error);
    }
  }
}

type PendingNegotiationRecord = Prisma.NegotiationGetPayload<{ include: { changeRequests: true } }>;
type PlainComment = { id: string; quotationLineId: string | null; comment: string; createdAt: Date };

function toPendingNegotiationDto(
  negotiation: PendingNegotiationRecord,
  comments: PlainComment[],
): PendingNegotiationDto {
  const generalComment = [...comments].reverse().find((c) => !c.quotationLineId);
  const lineComments = comments.filter((c) => c.quotationLineId);

  return {
    id: negotiation.id,
    status: negotiation.status,
    counterDiscountPct: negotiation.counterDiscountPct ? negotiation.counterDiscountPct.times(100).toString() : null,
    requestedDeliveryDate: negotiation.requestedDeliveryDate
      ? negotiation.requestedDeliveryDate.toISOString().slice(0, 10)
      : null,
    generalComment: generalComment?.comment ?? null,
    lineComments: lineComments.map((c) => ({
      id: c.id,
      lineId: c.quotationLineId,
      comment: c.comment,
      createdAt: c.createdAt.toISOString(),
    })),
    changeRequests: negotiation.changeRequests.map((cr) => ({
      id: cr.id,
      lineId: cr.quotationLineId,
      requestType: cr.requestType,
      note: (cr.requestedValue as { note?: string } | null)?.note ?? null,
      status: cr.status,
    })),
    createdAt: negotiation.createdAt.toISOString(),
  };
}
