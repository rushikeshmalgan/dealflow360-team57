import { createHash } from "node:crypto";

import { ServiceError } from "@/lib/service-error";
import type { ApprovalRuleService } from "@/modules/approval";
import type { DiscountRuleService } from "@/modules/discount-risk";
import { scoreRisk } from "@/modules/discount-risk";
import type { RiskLineInput } from "@/modules/discount-risk";
import type { Actor } from "@/modules/shared/domain/actor";
import { requireOwnResource, requireRole } from "@/modules/shared/domain/actor";

import type { SubmitQuotationInput } from "../schemas/quotation";
import type { QuotationRepository } from "./ports";
import type { SubmitQuotationResult } from "./types";

/**
 * T7.2 — the orchestrator TAD SS8 calls out by name ("Cross-module circular calls are avoided
 * by orchestrators such as SubmitQuotationUseCase"). It composes three modules' public service
 * APIs — never their repositories/Prisma tables directly — because none of Quotation, Discount
 * Rules, or Approval Rules should have to import each other's internals to submit a quote:
 *
 *   1. Quotation module:      the current Draft (already live-computed via T6.4, T6.5's DTO)
 *   2. Discount-Risk module:  each line's ceiling (T3.1, read-only) + T7.1's scoreRisk
 *   3. Approval module:       the chain configured for the resulting risk band (T3.2, read-only)
 *
 * Reads happen first (config doesn't change mid-request in a way that matters here); the four
 * writes this produces — QuotationVersion, RiskEvaluation, ApprovalRecords, Quotation status —
 * are then persisted atomically by `repository.submit`, one Prisma transaction, all or nothing.
 */
export class SubmitQuotationUseCase {
  constructor(
    private readonly repository: QuotationRepository,
    private readonly discountRuleService: DiscountRuleService,
    private readonly approvalRuleService: ApprovalRuleService,
  ) {}

  async execute(
    actor: Actor | null,
    id: string,
    input: SubmitQuotationInput,
  ): Promise<SubmitQuotationResult> {
    // Same write-role rule as every other builder mutation (TAD SS6): only the assigned Sales Rep submits.
    requireRole(actor, ["SALES_REP"]);
    const quotation = await this.repository.get(id);
    if (!quotation) throw new ServiceError("NOT_FOUND", "Quotation not found", { id });
    requireOwnResource(actor, quotation.salesRep.id);

    if (quotation.status !== "DRAFT") {
      throw new ServiceError(
        "INVALID_STATE_TRANSITION",
        "Only a Draft quotation can be submitted",
        {
          id,
          status: quotation.status,
        },
      );
    }
    if (quotation.lines.length === 0) {
      throw new ServiceError("VALIDATION_ERROR", "Cannot submit a quotation with no lines", { id });
    }

    // T3.1's canonical ceiling lookup — the same function the config UI itself would call.
    // T7.1 is never handed a raw discount_rules row; only the already-resolved ceiling.
    const ceilings = await Promise.all(
      quotation.lines.map((line) =>
        this.discountRuleService.resolveCeiling(
          actor,
          quotation.customer.tierId,
          line.product.categoryId,
        ),
      ),
    );

    // Every number here is read straight off the already-computed quotation DTO — the same
    // effectiveDiscountPct/netBeforeTax T6.5 is currently showing the rep on screen. T7.1 never
    // re-derives discount/margin math, so risk scoring can't silently disagree with the builder.
    const riskLines: RiskLineInput[] = quotation.lines.map((line, index) => ({
      lineId: line.id,
      allowedDiscountPct:
        ceilings[index].allowedDiscountPct === null
          ? null
          : Number(ceilings[index].allowedDiscountPct),
      effectiveDiscountPct: Number(line.effectiveDiscountPct),
      netBeforeTax: Number(line.netBeforeTax),
    }));

    const risk = scoreRisk({
      lines: riskLines,
      quoteMarginPct:
        quotation.summary.marginPct === null ? null : Number(quotation.summary.marginPct),
    });

    // T3.2's band -> chain mapping, read-only from here (T7.2 never writes approval_rules).
    // riskBand is @unique on ApprovalRule, so there is at most one row for this band.
    const [rule] = await this.approvalRuleService.list(actor, {
      riskBand: risk.band,
      active: true,
    });
    const approvalSteps = (rule?.steps ?? []).map((step) => ({
      stepOrder: step.stepOrder,
      role: step.role,
    }));
    const requiresApproval = approvalSteps.length > 0;

    // TAD SS9: QuotationVersion freezes an immutable snapshot; the hash is what "immutable"
    // is actually checkable against later (e.g. detecting a version row that was tampered with).
    const payload = quotation;
    const payloadHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");

    const riskDto = {
      score: risk.score,
      band: risk.band,
      configVersion: risk.configVersion,
      explanation: risk.explanation,
    };

    const updated = await this.repository.submit(
      id,
      {
        expectedVersion: input.expectedVersion,
        payload,
        payloadHash,
        risk: riskDto,
        approvalSteps,
        // TAD SS9 state diagram: SUBMITTED -> PENDING_APPROVAL (approval required) or
        // -> APPROVED (no approval required) — both collapse into one atomic transition here
        // rather than persisting the transient SUBMITTED state in between.
        finalStatus: requiresApproval ? "PENDING_APPROVAL" : "APPROVED",
      },
      actor,
    );

    return { quotation: updated, requiresApproval, risk: riskDto, approvalSteps };
  }
}
