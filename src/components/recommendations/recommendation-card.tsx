"use client";

import { Gift, TrendingDown, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RecommendationViewModel } from "@/lib/recommendations";

const TYPE_TONE: Record<RecommendationViewModel["type"], string> = {
  UPSELL: "border-sky-400/30 bg-sky-400/10 text-sky-200",
  CROSS_SELL: "border-violet-400/30 bg-violet-400/10 text-violet-200",
};

const TYPE_LABEL: Record<RecommendationViewModel["type"], string> = {
  UPSELL: "Upsell",
  CROSS_SELL: "Cross-sell",
};

export type RecommendationCardProps = {
  recommendation: RecommendationViewModel;
  disabled?: boolean;
  isAdding?: boolean;
  isDismissing?: boolean;
  onAddToQuote: (recommendation: RecommendationViewModel) => void;
  onDismiss: (recommendation: RecommendationViewModel) => void;
};

export function RecommendationCard({
  recommendation,
  disabled = false,
  isAdding = false,
  isDismissing = false,
  onAddToQuote,
  onDismiss,
}: RecommendationCardProps) {
  const marginPositive = recommendation.marginImpact.deltaAmount >= 0;
  const actionsDisabled = disabled || isAdding || isDismissing;

  return (
    <div
      data-testid="recommendation-card"
      className="flex flex-col gap-3 rounded-lg border border-slate-700/70 bg-[#1c222b] px-4 py-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="border-slate-600 text-slate-400">
            #{recommendation.rank}
          </Badge>
          <Badge className={`border ${TYPE_TONE[recommendation.type]}`}>
            {TYPE_LABEL[recommendation.type]}
          </Badge>
          <span className="text-sm font-semibold text-slate-100">{recommendation.productName}</span>
          <span className="text-xs text-slate-500">{recommendation.productSku}</span>
        </div>
        <span className="text-sm font-semibold text-slate-100">
          ${recommendation.price.toLocaleString("en-US", { minimumFractionDigits: 2 })}
        </span>
      </div>

      <p className="text-xs text-slate-400">{recommendation.reason}</p>

      <div className="flex flex-wrap items-center gap-2">
        {recommendation.promotion && (
          <Badge className="border border-amber-400/30 bg-amber-400/10 text-amber-200">
            <Gift className="mr-1 h-3 w-3" />
            {recommendation.promotion.name} · {recommendation.promotion.discountPct}% off
          </Badge>
        )}
        <Badge
          className={`border ${
            marginPositive
              ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
              : "border-rose-400/30 bg-rose-400/10 text-rose-200"
          }`}
        >
          {marginPositive ? (
            <TrendingUp className="mr-1 h-3 w-3" />
          ) : (
            <TrendingDown className="mr-1 h-3 w-3" />
          )}
          Margin {marginPositive ? "+" : ""}$
          {recommendation.marginImpact.deltaAmount.toLocaleString("en-US", {
            minimumFractionDigits: 2,
          })}{" "}
          ({recommendation.marginImpact.resultingMarginPct.toFixed(1)}% resulting)
        </Badge>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button
          variant="ghost"
          size="sm"
          className="text-slate-400 hover:text-slate-100"
          disabled={actionsDisabled}
          onClick={() => onDismiss(recommendation)}
        >
          {isDismissing ? "Dismissing…" : "Dismiss"}
        </Button>
        <Button
          size="sm"
          className="bg-sky-500 text-white hover:bg-sky-400"
          disabled={actionsDisabled}
          onClick={() => onAddToQuote(recommendation)}
        >
          {isAdding ? "Adding…" : "Add to Quote"}
        </Button>
      </div>
    </div>
  );
}
