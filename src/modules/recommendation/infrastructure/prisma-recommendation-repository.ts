import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/service-error";

import { reasonTextFromCodes } from "../domain/reason-codes";
import type { ReasonCode } from "../domain/types";
import type { RecommendationRepository } from "../application/ports";
import type {
  GeneratedRecommendationRow,
  RecommendationDto,
  RecommendationOwnership,
  ScoringContext,
} from "../application/types";

const recommendationInclude = {
  product: { select: { id: true, name: true, sku: true, price: true } },
  promotionDiscountRule: {
    select: {
      id: true,
      scope: true,
      maxDiscountPct: true,
      tier: { select: { name: true } },
      category: { select: { name: true } },
    },
  },
} satisfies Prisma.RecommendationInclude;

type RecommendationRecord = Prisma.RecommendationGetPayload<{ include: typeof recommendationInclude }>;

function promotionName(rule: RecommendationRecord["promotionDiscountRule"]): string {
  if (!rule) return "";
  return rule.scope === "CATEGORY"
    ? `${rule.category?.name ?? "Category"} promotion`
    : `${rule.tier?.name ?? "Tier"} promotion`;
}

function recommendationDto(record: RecommendationRecord): RecommendationDto {
  const reasonCodes = record.reasonCodes as ReasonCode[];
  return {
    id: record.id,
    quotationId: record.quotationId,
    type: record.type,
    rank: record.rank,
    score: record.score.toNumber(),
    product: {
      id: record.product.id,
      name: record.product.name,
      sku: record.product.sku,
      price: record.product.price.toFixed(2),
    },
    reasonCodes,
    reason: reasonTextFromCodes(reasonCodes),
    promotion: record.promotionDiscountRule
      ? {
          id: record.promotionDiscountRule.id,
          name: promotionName(record.promotionDiscountRule),
          discountPct: record.promotionDiscountRule.maxDiscountPct.times(100).toFixed(2),
        }
      : null,
    marginImpact: {
      deltaAmount: record.projectedMarginDeltaAmount.toFixed(2),
      deltaPct: record.projectedMarginDeltaPct.toFixed(4),
      resultingMarginPct: record.projectedResultingMarginPct?.toFixed(4) ?? null,
    },
  };
}

export class PrismaRecommendationRepository implements RecommendationRepository {
  constructor(private readonly db: PrismaClient = prisma) {}

  async getScoringContext(quotationId: string): Promise<ScoringContext | null> {
    const quotation = await this.db.quotation.findUnique({
      where: { id: quotationId },
      select: {
        id: true,
        status: true,
        salesRepId: true,
        customerId: true,
        priceListId: true,
        orderDiscountPct: true,
        customer: { select: { tierId: true } },
        priceList: { select: { currency: true } },
        lines: {
          select: {
            productId: true,
            quantity: true,
            unitPrice: true,
            lineDiscountPct: true,
            product: { select: { categoryId: true, costPrice: true } },
          },
        },
      },
    });
    if (!quotation) return null;

    const anchorLines = quotation.lines.map((line) => ({
      productId: line.productId,
      categoryId: line.product.categoryId,
      unitPrice: line.unitPrice.toNumber(),
      quantity: line.quantity,
      costPrice: line.product.costPrice.toNumber(),
      lineDiscountPct: line.lineDiscountPct.times(100).toNumber(),
    }));
    const anchorProductIds = anchorLines.map((line) => line.productId);

    const candidateProducts = await this.db.product.findMany({
      where: {
        isActive: true,
        id: anchorProductIds.length ? { notIn: anchorProductIds } : undefined,
      },
      select: {
        id: true,
        name: true,
        sku: true,
        categoryId: true,
        price: true,
        costPrice: true,
        isSubscription: true,
        isActive: true,
      },
    });
    const candidates = candidateProducts.map((product) => ({
      productId: product.id,
      name: product.name,
      sku: product.sku,
      categoryId: product.categoryId,
      price: product.price.toNumber(),
      costPrice: product.costPrice.toNumber(),
      isSubscription: product.isSubscription,
      isActive: product.isActive,
    }));
    const candidateIds = candidates.map((candidate) => candidate.productId);

    const [coOccurrenceCounts, matchedPromotions, stockByProduct, tierAffinity, existingDecisions] =
      await Promise.all([
        this.getCoOccurrenceCounts(quotationId, anchorProductIds, candidateIds),
        this.getMatchedPromotions(candidates, quotation.customer.tierId),
        this.getStockByProduct(candidateIds),
        this.getTierAffinity(candidateIds, quotation.customer.tierId),
        this.getExistingDecisions(quotationId),
      ]);

    return {
      quotation: {
        id: quotation.id,
        status: quotation.status,
        salesRepId: quotation.salesRepId,
        customerId: quotation.customerId,
        customerTierId: quotation.customer.tierId,
        priceListId: quotation.priceListId,
        currency: quotation.priceList.currency,
        orderDiscountPct: quotation.orderDiscountPct.times(100).toNumber(),
      },
      anchorLines,
      candidates,
      coOccurrenceCounts,
      matchedPromotions,
      stockByProduct,
      tierAffinity,
      existingDecisions,
    };
  }

  /** Counts quotation_lines rows for each candidate within quotations (other than this one) that
   * also contain at least one anchor product — a simple, documented proxy for "frequently
   * co-purchased" (see domain/score.ts's coPurchase comment); it counts line rows, not distinct
   * quotations, which only over-counts a candidate that appears more than once in the same
   * historical quotation — not something any current flow in this app produces. */
  private async getCoOccurrenceCounts(
    quotationId: string,
    anchorProductIds: string[],
    candidateIds: string[],
  ): Promise<Record<string, number>> {
    if (anchorProductIds.length === 0 || candidateIds.length === 0) return {};

    const anchorQuotations = await this.db.quotationLine.findMany({
      where: { productId: { in: anchorProductIds }, quotationId: { not: quotationId } },
      select: { quotationId: true },
      distinct: ["quotationId"],
    });
    const anchorQuotationIds = anchorQuotations.map((row) => row.quotationId);
    if (anchorQuotationIds.length === 0) return {};

    const grouped = await this.db.quotationLine.groupBy({
      by: ["productId"],
      where: { quotationId: { in: anchorQuotationIds }, productId: { in: candidateIds } },
      _count: { _all: true },
    });
    return Object.fromEntries(grouped.map((row) => [row.productId, row._count._all]));
  }

  /** This app's closest existing "active promotion" concept — see domain/score.ts's promotion
   * comment — is an active DiscountRule for the candidate's category or the customer's tier. */
  private async getMatchedPromotions(
    candidates: ScoringContext["candidates"],
    customerTierId: string,
  ): Promise<ScoringContext["matchedPromotions"]> {
    if (candidates.length === 0) return {};
    const categoryIds = [...new Set(candidates.map((candidate) => candidate.categoryId))];

    const activeRules = await this.db.discountRule.findMany({
      where: { isActive: true, OR: [{ categoryId: { in: categoryIds } }, { tierId: customerTierId }] },
      select: { id: true, categoryId: true, tierId: true, maxDiscountPct: true },
    });
    if (activeRules.length === 0) return {};

    const matched: ScoringContext["matchedPromotions"] = {};
    for (const candidate of candidates) {
      const applicable = activeRules.filter(
        (rule) => rule.categoryId === candidate.categoryId || rule.tierId === customerTierId,
      );
      if (applicable.length === 0) continue;
      const best = applicable.reduce((a, b) => (a.maxDiscountPct.greaterThan(b.maxDiscountPct) ? a : b));
      matched[candidate.productId] = { discountRuleId: best.id, maxDiscountPct: best.maxDiscountPct.times(100).toNumber() };
    }
    return matched;
  }

  private async getStockByProduct(candidateIds: string[]): Promise<Record<string, number>> {
    if (candidateIds.length === 0) return {};
    const rows = await this.db.warehouseStock.groupBy({
      by: ["productId"],
      where: { productId: { in: candidateIds } },
      _sum: { availableQty: true, reservedQty: true },
    });
    return Object.fromEntries(
      rows.map((row) => [row.productId, (row._sum.availableQty ?? 0) - (row._sum.reservedQty ?? 0)]),
    );
  }

  private async getTierAffinity(
    candidateIds: string[],
    customerTierId: string,
  ): Promise<ScoringContext["tierAffinity"]> {
    if (candidateIds.length === 0) return {};
    const [totalRows, sameTierRows] = await Promise.all([
      this.db.quotationLine.groupBy({
        by: ["productId"],
        where: { productId: { in: candidateIds } },
        _count: { _all: true },
      }),
      this.db.quotationLine.groupBy({
        by: ["productId"],
        where: { productId: { in: candidateIds }, quotation: { customer: { tierId: customerTierId } } },
        _count: { _all: true },
      }),
    ]);
    const sameTierByProduct = new Map(sameTierRows.map((row) => [row.productId, row._count._all]));
    return Object.fromEntries(
      totalRows.map((row) => [
        row.productId,
        { sameTierCount: sameTierByProduct.get(row.productId) ?? 0, totalCount: row._count._all },
      ]),
    );
  }

  private async getExistingDecisions(quotationId: string): Promise<ScoringContext["existingDecisions"]> {
    const rows = await this.db.recommendation.findMany({
      where: { quotationId },
      select: { productId: true, status: true },
    });
    return Object.fromEntries(rows.map((row) => [row.productId, row.status]));
  }

  async saveGenerated(
    quotationId: string,
    rows: GeneratedRecommendationRow[],
    configVersion: number,
  ): Promise<RecommendationDto[]> {
    const productIds = rows.map((row) => row.productId);

    return this.db.$transaction(async (tx) => {
      // Drop stale PENDING rows that fell out of this generation's top-K — ADDED/DISMISSED
      // history is never touched (sticky decisions survive re-generation).
      await tx.recommendation.deleteMany({
        where: {
          quotationId,
          status: "PENDING",
          productId: productIds.length ? { notIn: productIds } : undefined,
        },
      });

      for (const row of rows) {
        const data = {
          type: row.type,
          rank: row.rank,
          score: new Prisma.Decimal(row.score.toFixed(5)),
          reasonCodes: row.reasonCodes as Prisma.InputJsonValue,
          promotionDiscountRuleId: row.promotionDiscountRuleId,
          projectedMarginDeltaAmount: new Prisma.Decimal(row.projectedMarginDeltaAmount.toFixed(2)),
          projectedMarginDeltaPct: new Prisma.Decimal(row.projectedMarginDeltaPct.toFixed(4)),
          projectedResultingMarginPct:
            row.projectedResultingMarginPct === null
              ? null
              : new Prisma.Decimal(row.projectedResultingMarginPct.toFixed(4)),
          configVersion,
        };
        await tx.recommendation.upsert({
          where: { quotationId_productId: { quotationId, productId: row.productId } },
          create: { quotationId, productId: row.productId, status: "PENDING", ...data },
          update: data,
        });
      }

      const saved = await tx.recommendation.findMany({
        where: { quotationId, status: "PENDING" },
        include: recommendationInclude,
        orderBy: { rank: "asc" },
      });
      return saved.map(recommendationDto);
    });
  }

  async listPending(quotationId: string): Promise<RecommendationDto[]> {
    const rows = await this.db.recommendation.findMany({
      where: { quotationId, status: "PENDING" },
      include: recommendationInclude,
      orderBy: { rank: "asc" },
    });
    return rows.map(recommendationDto);
  }

  async getQuotationOwnership(quotationId: string): Promise<{ salesRepId: string } | null> {
    return this.db.quotation.findUnique({ where: { id: quotationId }, select: { salesRepId: true } });
  }

  async getForActor(recommendationId: string): Promise<RecommendationOwnership | null> {
    const row = await this.db.recommendation.findUnique({
      where: { id: recommendationId },
      select: {
        id: true,
        quotationId: true,
        productId: true,
        status: true,
        quotation: { select: { salesRepId: true } },
        product: { select: { isSubscription: true } },
      },
    });
    if (!row) return null;
    return {
      id: row.id,
      quotationId: row.quotationId,
      productId: row.productId,
      status: row.status,
      salesRepId: row.quotation.salesRepId,
      productIsSubscription: row.product.isSubscription,
    };
  }

  async markAdded(recommendationId: string, quotationLineId: string): Promise<RecommendationDto> {
    const updated = await this.db.recommendation.update({
      where: { id: recommendationId },
      data: { status: "ADDED", addedQuotationLineId: quotationLineId },
      include: recommendationInclude,
    });
    return recommendationDto(updated);
  }

  async markDismissed(
    recommendationId: string,
    dismissedByUserId: string,
    now: Date,
  ): Promise<RecommendationDto> {
    try {
      const updated = await this.db.recommendation.update({
        where: { id: recommendationId },
        data: { status: "DISMISSED", dismissedByUserId, dismissedAt: now },
        include: recommendationInclude,
      });
      return recommendationDto(updated);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        throw new ServiceError("NOT_FOUND", "Recommendation not found", { recommendationId });
      }
      throw error;
    }
  }
}
