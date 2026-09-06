"use client";

import { useCallback, useEffect, useState } from "react";

import { RecommendationCard } from "@/components/recommendations/recommendation-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  fetchMockRecommendations,
  mapRecommendationToViewModel,
  sortRecommendationsByRank,
  type RecommendationFetcher,
  type RecommendationViewModel,
} from "@/lib/recommendations";

export type RecommendationPaneProps = {
  quotationId: string;
  /** Defaults to the typed mock adapter. Pass a real fetcher with the same signature once the backend exists. */
  fetcher?: RecommendationFetcher;
  /** Disables all actions, e.g. while the quotation itself isn't editable. */
  disabled?: boolean;
  onAddToQuote?: (recommendation: RecommendationViewModel) => void | Promise<void>;
  onDismiss?: (recommendation: RecommendationViewModel) => void | Promise<void>;
};

/**
 * Presentation-only Upsell/Cross-Sell pane. Ranking, scoring, margin calculation, and
 * promotion eligibility all come from `fetcher` — this component only renders what it's
 * given and reports user actions via onAddToQuote/onDismiss. With no handlers supplied it
 * falls back to a purely local demo behavior (removing the card from view), so the pane
 * is usable standalone before the backend recommendation engine lands.
 */
export function RecommendationPane({
  quotationId,
  fetcher = fetchMockRecommendations,
  disabled = false,
  onAddToQuote,
  onDismiss,
}: RecommendationPaneProps) {
  const [recommendations, setRecommendations] = useState<RecommendationViewModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<Record<string, "add" | "dismiss">>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const dtos = await fetcher(quotationId);
      setRecommendations(sortRecommendationsByRank(dtos.map(mapRecommendationToViewModel)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load recommendations.");
    } finally {
      setLoading(false);
    }
  }, [fetcher, quotationId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAddToQuote(recommendation: RecommendationViewModel) {
    setPendingAction((prev) => ({ ...prev, [recommendation.id]: "add" }));
    try {
      await onAddToQuote?.(recommendation);
      setRecommendations((prev) => prev.filter((r) => r.id !== recommendation.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add recommendation to quote.");
    } finally {
      setPendingAction((prev) => {
        const next = { ...prev };
        delete next[recommendation.id];
        return next;
      });
    }
  }

  async function handleDismiss(recommendation: RecommendationViewModel) {
    setPendingAction((prev) => ({ ...prev, [recommendation.id]: "dismiss" }));
    try {
      await onDismiss?.(recommendation);
      setRecommendations((prev) => prev.filter((r) => r.id !== recommendation.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to dismiss recommendation.");
    } finally {
      setPendingAction((prev) => {
        const next = { ...prev };
        delete next[recommendation.id];
        return next;
      });
    }
  }

  return (
    <Card className="border-sky-200 bg-white" data-testid="recommendation-pane">
      <CardHeader className="border-b border-sky-100">
        <CardTitle className="text-base">Recommended for this quote</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        {error && (
          <div
            role="alert"
            className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-700"
          >
            {error}
          </div>
        )}
        {loading ? (
          <p className="p-2 text-sm text-slate-500">Loading recommendations…</p>
        ) : error ? null : recommendations.length === 0 ? (
          <p className="p-2 text-sm text-slate-500">No upsell or cross-sell recommendations right now.</p>
        ) : (
          recommendations.map((recommendation) => (
            <RecommendationCard
              key={recommendation.id}
              recommendation={recommendation}
              disabled={disabled}
              isAdding={pendingAction[recommendation.id] === "add"}
              isDismissing={pendingAction[recommendation.id] === "dismiss"}
              onAddToQuote={handleAddToQuote}
              onDismiss={handleDismiss}
            />
          ))
        )}
      </CardContent>
    </Card>
  );
}
