import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { recordAudit } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { withOptimisticVersion } from "@/lib/optimistic-version";
import { ServiceError } from "@/lib/service-error";
import { calculateLineMargin, calculateQuotationMargin } from "@/modules/discount-risk";
import type { Actor } from "@/modules/shared/domain/actor";

import type { ApprovalRecordRepository } from "../application/ports";
import type { ApprovalQueueItemDto } from "../application/types";
import type { ApprovalDecisionInput } from "../schemas/approval-decision";

const ACTION_TO_STATUS = {
  APPROVE: "APPROVED",
  REJECT: "REJECTED",
  RETURN: "RETURNED",
} as const;

const queueInclude = {
  quotationVersion: {
    include: {
      riskEvaluation: true,
      quotation: {
        include: {
          customer: { select: { id: true, name: true } },
          salesRep: { select: { id: true, email: true } },
          lines: { include: { product: { select: { costPrice: true } } } },
        },
      },
    },
  },
} satisfies Prisma.ApprovalRecordInclude;

type QueueRow = Prisma.ApprovalRecordGetPayload<{ include: typeof queueInclude }>;

function netBeforeTaxOf(quotation: QueueRow["quotationVersion"]["quotation"]): number {
  const orderDiscountPct = quotation.orderDiscountPct.times(100).toNumber();
  const lineMargins = quotation.lines.map((line) =>
    calculateLineMargin({
      unitPrice: line.unitPrice.toNumber(),
      quantity: line.quantity,
      unitCost: line.product.costPrice.toNumber(),
      lineDiscountPct: line.lineDiscountPct.times(100).toNumber(),
      orderDiscountPct,
    }),
  );
  return calculateQuotationMargin(lineMargins).totalNetBeforeTax;
}

function toQueueItemDto(record: QueueRow, isActionable: boolean): ApprovalQueueItemDto {
  const quotation = record.quotationVersion.quotation;
  const risk = record.quotationVersion.riskEvaluation;
  return {
    id: record.id,
    stepOrder: record.stepOrder,
    role: record.role,
    status: record.status,
    version: record.version,
    isActionable,
    quotation: {
      id: quotation.id,
      code: quotation.code,
      status: quotation.status,
      customer: quotation.customer,
      salesRep: quotation.salesRep,
      netBeforeTax: netBeforeTaxOf(quotation).toFixed(2),
    },
    riskBand: risk?.band ?? "LOW",
    riskScore: risk ? risk.score.toString() : "0",
    createdAt: record.createdAt.toISOString(),
  };
}

/** The origin status a fully-approved chain should resolve to, per which flow created it
 * (T7.2's initial submit vs. T12.4's post-negotiation re-approval) — see the module README-style
 * comment in approval-record-service.ts for why these two origins resolve differently. */
function terminalApprovedStatus(currentStatus: string): "SENT_TO_CUSTOMER" | "CONFIRMED" {
  return currentStatus === "RE_APPROVAL_REQUIRED" ? "CONFIRMED" : "SENT_TO_CUSTOMER";
}

export class PrismaApprovalRecordRepository implements ApprovalRecordRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async listQueue(actor: Actor): Promise<ApprovalQueueItemDto[]> {
    const roleFilter = actor.role === "ADMIN" ? {} : { role: actor.role as "MANAGER" | "FINANCE_OPS" };

    const records = await this.db.approvalRecord.findMany({
      where: { status: "PENDING", ...roleFilter },
      include: queueInclude,
      orderBy: [{ createdAt: "asc" }, { stepOrder: "asc" }],
    });

    // "Only the first pending step is actionable" — compute the lowest pending stepOrder per
    // quotationVersionId across ALL roles' records (not just the ones this actor's role filter
    // returned), so a Finance step never shows as actionable while an earlier Manager step is
    // still pending.
    const versionIds = [...new Set(records.map((r) => r.quotationVersionId))];
    const firstPendingByVersion = new Map<string, number>();
    if (versionIds.length) {
      const allPending = await this.db.approvalRecord.findMany({
        where: { quotationVersionId: { in: versionIds }, status: "PENDING" },
        select: { quotationVersionId: true, stepOrder: true },
      });
      for (const r of allPending) {
        const current = firstPendingByVersion.get(r.quotationVersionId);
        if (current === undefined || r.stepOrder < current) {
          firstPendingByVersion.set(r.quotationVersionId, r.stepOrder);
        }
      }
    }

    return records.map((record) =>
      toQueueItemDto(record, firstPendingByVersion.get(record.quotationVersionId) === record.stepOrder),
    );
  }

  async decide(actor: Actor, recordId: string, input: ApprovalDecisionInput): Promise<ApprovalQueueItemDto> {
    return this.db.$transaction(async (tx) => {
      const record = await tx.approvalRecord.findUnique({ where: { id: recordId }, include: queueInclude });
      if (!record) throw new ServiceError("NOT_FOUND", "Approval record not found", { id: recordId });

      if (actor.role !== "ADMIN" && actor.role !== record.role) {
        throw new ServiceError("FORBIDDEN", `This step requires a ${record.role} decision`, {
          recordRole: record.role,
        });
      }
      if (record.status !== "PENDING") {
        throw new ServiceError("ALREADY_ACTIONED", "This approval step has already been decided", {
          id: recordId,
          status: record.status,
        });
      }

      const firstPending = await tx.approvalRecord.findFirst({
        where: { quotationVersionId: record.quotationVersionId, status: "PENDING" },
        orderBy: { stepOrder: "asc" },
        select: { id: true },
      });
      if (firstPending?.id !== recordId) {
        throw new ServiceError(
          "INVALID_STATE_TRANSITION",
          "An earlier approval step is still pending",
          { id: recordId },
        );
      }

      const newRecordStatus = ACTION_TO_STATUS[input.action];
      await withOptimisticVersion(tx.approvalRecord, recordId, input.expectedVersion, {
        status: newRecordStatus,
        actorUserId: actor.id,
        reason: input.reason ?? null,
        decidedAt: new Date(),
      });

      const quotation = record.quotationVersion.quotation;
      let newQuotationStatus: string | null = null;

      if (input.action === "REJECT") {
        newQuotationStatus = "REJECTED";
      } else if (input.action === "RETURN") {
        newQuotationStatus = "DRAFT";
      } else {
        const remainingPending = await tx.approvalRecord.count({
          where: { quotationVersionId: record.quotationVersionId, status: "PENDING", id: { not: recordId } },
        });
        if (remainingPending === 0) {
          newQuotationStatus = terminalApprovedStatus(quotation.status);
        }
      }

      if (newQuotationStatus) {
        await withOptimisticVersion(tx.quotation, quotation.id, quotation.version, {
          status: newQuotationStatus,
        });
      }

      await recordAudit(tx, {
        actor,
        entityType: "ApprovalRecord",
        entityId: recordId,
        action: `APPROVAL_${newRecordStatus}`,
        before: { status: "PENDING" },
        after: { status: newRecordStatus, reason: input.reason ?? null, quotationStatus: newQuotationStatus },
        reason: input.reason,
      });

      const updated = await tx.approvalRecord.findUniqueOrThrow({ where: { id: recordId }, include: queueInclude });
      return toQueueItemDto(updated, false);
    });
  }
}
