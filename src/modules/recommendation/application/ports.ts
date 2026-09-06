import type {
  GeneratedRecommendationRow,
  RecommendationDto,
  RecommendationOwnership,
  ScoringContext,
} from "./types";

export interface RecommendationRepository {
  /** Null when the quotation does not exist. */
  getScoringContext(quotationId: string): Promise<ScoringContext | null>;

  /**
   * Upserts one PENDING row per generated candidate (unique on [quotationId, productId]) and
   * returns the full current PENDING set for the quotation, ordered by rank. Never touches a row
   * already ADDED or DISMISSED (sticky decisions — see the Recommendation model's Prisma comment).
   */
  saveGenerated(
    quotationId: string,
    rows: GeneratedRecommendationRow[],
    configVersion: number,
  ): Promise<RecommendationDto[]>;

  /** Current PENDING recommendations for a quotation, ordered by rank ascending. */
  listPending(quotationId: string): Promise<RecommendationDto[]>;

  /** For authorization: which quotation (and its owning sales rep) a quotation belongs to, without the cost of a full scoring context fetch. */
  getQuotationOwnership(quotationId: string): Promise<{ salesRepId: string } | null>;

  /** For authorization + mutation: everything add-to-quote/dismiss need about one recommendation row. */
  getForActor(recommendationId: string): Promise<RecommendationOwnership | null>;

  markAdded(recommendationId: string, quotationLineId: string): Promise<RecommendationDto>;

  markDismissed(recommendationId: string, dismissedByUserId: string, now: Date): Promise<RecommendationDto>;
}
