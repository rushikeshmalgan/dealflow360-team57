import { calculateLineMargin, calculateQuotationMargin } from "@/modules/discount-risk";
import { quotationService } from "@/modules/quotation";
import type { Actor } from "@/modules/shared/domain/actor";
import { requireInternal, requireOwnResource, requireRole } from "@/modules/shared/domain/actor";
import { ServiceError } from "@/lib/service-error";
import { emitRealtimeEvent } from "@/realtime/emit";
import { roomName } from "@/realtime/rooms";

import { classifyRecommendation } from "../domain/classify";
import { RECOMMENDATION_CONFIG_V1, type RecommendationConfig } from "../domain/config";
import { findExclusionReason } from "../domain/exclusions";
import { buildReasonCodes } from "../domain/reason-codes";
import { scoreCandidate } from "../domain/score";
import { selectTopK, type ScoredItem } from "../domain/select-top-k";
import type { AddRecommendationToQuoteInput } from "../schemas/recommendation";
import type { RecommendationRepository } from "./ports";
import type { GeneratedRecommendationRow, RecommendationDto } from "./types";

/**
 * TAD SS15's own route table scopes this to Sales Rep access ("POST /api/recommendations |
 * quotationVersionId | Rep access | top-K"); Manager/Finance/Admin get the same read-only
 * posture QuotationService gives them over quotations (view, never mutate).
 */
const WRITE_ROLES = ["SALES_REP"] as const;

export class RecommendationService {
  constructor(
    private readonly repository: RecommendationRepository,
    private readonly config: RecommendationConfig = RECOMMENDATION_CONFIG_V1,
  ) {}

  /**
   * Runs TAD SS15's scoring pass for one quotation and persists the top-K as PENDING rows
   * (sticky — a prior ADDED/DISMISSED decision for a product is never re-offered). Safe to call
   * repeatedly (e.g. every time the pane mounts, or after a line changes) since re-scoring is
   * idempotent by construction (unique [quotationId, productId] upsert).
   */
  async generate(actor: Actor | null, quotationId: string): Promise<RecommendationDto[]> {
    requireInternal(actor);
    const ctx = await this.repository.getScoringContext(quotationId);
    if (!ctx) throw new ServiceError("NOT_FOUND", "Quotation not found", { quotationId });
    if (actor.role === "SALES_REP") requireOwnResource(actor, ctx.quotation.salesRepId);

    const anchorProductIds = new Set(ctx.anchorLines.map((line) => line.productId));
    const alreadyDecidedProductIds = new Set(
      Object.entries(ctx.existingDecisions)
        .filter(([, status]) => status !== "PENDING")
        .map(([productId]) => productId),
    );
    const maxCoOccurrenceCount = Math.max(0, ...Object.values(ctx.coOccurrenceCounts));

    const anchorLineMargins = ctx.anchorLines.map((line) =>
      calculateLineMargin({
        unitPrice: line.unitPrice,
        quantity: line.quantity,
        unitCost: line.costPrice,
        lineDiscountPct: line.lineDiscountPct,
        orderDiscountPct: ctx.quotation.orderDiscountPct,
      }),
    );
    const currentSummary = calculateQuotationMargin(anchorLineMargins);

    const scored: ScoredItem<GeneratedRecommendationRow>[] = [];

    for (const candidate of ctx.candidates) {
      const candidateLineMargin = calculateLineMargin({
        unitPrice: candidate.price,
        quantity: 1,
        unitCost: candidate.costPrice,
        lineDiscountPct: 0,
        orderDiscountPct: ctx.quotation.orderDiscountPct,
      });
      const availableQty = ctx.stockByProduct[candidate.productId] ?? 0;

      const exclusion = findExclusionReason(
        {
          candidate,
          marginPct: candidateLineMargin.marginPct,
          availableQty,
          alreadyInQuoteProductIds: anchorProductIds,
          alreadyDecidedProductIds,
        },
        this.config,
      );
      if (exclusion) continue;

      const promotion = ctx.matchedPromotions[candidate.productId] ?? null;
      const affinity = ctx.tierAffinity[candidate.productId] ?? { sameTierCount: 0, totalCount: 0 };

      const { score, components, weightedComponents } = scoreCandidate(
        {
          coOccurrenceCount: ctx.coOccurrenceCounts[candidate.productId] ?? 0,
          maxCoOccurrenceCount,
          matchedPromotionMaxDiscountPct: promotion?.maxDiscountPct ?? null,
          marginPct: candidateLineMargin.marginPct ?? 0,
          availableQty,
          tierAffinitySameTierCount: affinity.sameTierCount,
          tierAffinityTotalCount: affinity.totalCount,
        },
        this.config,
      );

      const type = classifyRecommendation(candidate, ctx.anchorLines, this.config);
      const { reasonCodes } = buildReasonCodes(type, components, weightedComponents, this.config);

      const combinedSummary = calculateQuotationMargin([...anchorLineMargins, candidateLineMargin]);
      const projectedMarginDeltaPct =
        combinedSummary.marginPct === null
          ? 0
          : combinedSummary.marginPct - (currentSummary.marginPct ?? 0);

      scored.push({
        score,
        item: {
          productId: candidate.productId,
          type,
          rank: 0,
          score,
          reasonCodes,
          promotionDiscountRuleId: promotion?.discountRuleId ?? null,
          projectedMarginDeltaAmount: candidateLineMargin.marginAmount,
          projectedMarginDeltaPct,
          projectedResultingMarginPct: combinedSummary.marginPct,
        },
      });
    }

    const topK = selectTopK(scored, this.config.topK, this.config.heapThreshold);
    const rows: GeneratedRecommendationRow[] = topK.map(({ item }, index) => ({
      ...item,
      rank: index + 1,
    }));

    const saved = await this.repository.saveGenerated(quotationId, rows, this.config.version);

    this.emitUpdate(
      quotationId,
      saved.map((r) => r.product.id),
      Array.from(new Set(saved.flatMap((r) => r.reasonCodes))).slice(0, 10),
    );

    return saved;
  }

  async list(actor: Actor | null, quotationId: string): Promise<RecommendationDto[]> {
    requireInternal(actor);
    const ownership = await this.repository.getQuotationOwnership(quotationId);
    if (!ownership) throw new ServiceError("NOT_FOUND", "Quotation not found", { quotationId });
    if (actor.role === "SALES_REP") requireOwnResource(actor, ownership.salesRepId);
    return this.repository.listPending(quotationId);
  }

  /**
   * Add to Quote (TAD SS15: "accepted product becomes line; recalc margin/risk"). Validation,
   * pricing resolution, permissions, and the actual quotation mutation are all delegated to
   * QuotationService.addLine — the same authoritative path the manual "Add Line" form uses —
   * so this method never re-implements or duplicates that logic; it only decides which product
   * to add and records the resulting decision on the Recommendation row.
   */
  async addToQuote(
    actor: Actor | null,
    recommendationId: string,
    input: AddRecommendationToQuoteInput,
  ): Promise<{ quotationId: string; recommendation: RecommendationDto }> {
    requireRole(actor, WRITE_ROLES);
    const rec = await this.repository.getForActor(recommendationId);
    if (!rec) throw new ServiceError("NOT_FOUND", "Recommendation not found", { recommendationId });
    requireOwnResource(actor, rec.salesRepId);
    this.assertPending(rec.status, recommendationId);

    const billingType = rec.productIsSubscription ? "RECURRING" : "ONE_TIME";
    const quotation = await quotationService.addLine(actor, rec.quotationId, {
      expectedVersion: input.expectedVersion,
      productId: rec.productId,
      variantId: null,
      quantity: 1,
      billingType,
    });
    // addLine only ever appends a new line, never reorders existing ones (lines stay ordered by
    // createdAt asc), so the line it just created is always the last one in the returned DTO.
    const newLine = quotation.lines[quotation.lines.length - 1];

    const updated = await this.repository.markAdded(recommendationId, newLine.id);
    this.emitUpdate(rec.quotationId, [rec.productId], ["ADDED_TO_QUOTE"]);

    return { quotationId: rec.quotationId, recommendation: updated };
  }

  async dismiss(actor: Actor | null, recommendationId: string, now = new Date()): Promise<RecommendationDto> {
    requireRole(actor, WRITE_ROLES);
    const rec = await this.repository.getForActor(recommendationId);
    if (!rec) throw new ServiceError("NOT_FOUND", "Recommendation not found", { recommendationId });
    requireOwnResource(actor, rec.salesRepId);
    this.assertPending(rec.status, recommendationId);

    const dismissed = await this.repository.markDismissed(recommendationId, actor.id, now);
    this.emitUpdate(rec.quotationId, [rec.productId], ["DISMISSED"]);
    return dismissed;
  }

  private assertPending(status: string, recommendationId: string): void {
    if (status !== "PENDING") {
      throw new ServiceError(
        "ALREADY_ACTIONED",
        `This recommendation was already ${status.toLowerCase()}`,
        { recommendationId, status },
      );
    }
  }

  private emitUpdate(quotationId: string, productIds: string[], explanationCodes: string[]): void {
    emitRealtimeEvent(roomName("quotation", quotationId), "recommendation:updated", {
      quotationId,
      productIds: productIds.slice(0, 10),
      explanationCodes: explanationCodes.slice(0, 10),
    });
  }
}
