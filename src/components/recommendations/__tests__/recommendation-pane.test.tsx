// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RecommendationPane } from "@/components/recommendations/recommendation-pane";
import type { RecommendationDto, RecommendationViewModel } from "@/lib/recommendations";

const UPSELL_DTO: RecommendationDto = {
  id: "rec-1",
  quotationId: "quote-1",
  type: "UPSELL",
  rank: 1,
  score: 0.9,
  product: { id: "prod-1", name: "Enterprise Support Plan", sku: "SUP-ENT-01", price: "4999.00" },
  reasonCodes: ["HIGHER_TIER"],
  reason: "Customers frequently upgrade to this tier.",
  promotion: { id: "promo-1", name: "Q3 Support Upgrade", discountPct: "10.00" },
  marginImpact: { deltaAmount: "1450.00", deltaPct: "4.2", resultingMarginPct: "38.6" },
};

const CROSS_SELL_DTO: RecommendationDto = {
  id: "rec-2",
  quotationId: "quote-1",
  type: "CROSS_SELL",
  rank: 2,
  score: 0.8,
  product: { id: "prod-2", name: "Onboarding Services Package", sku: "SVC-ONB-02", price: "1899.00" },
  reasonCodes: ["FREQUENTLY_CO_PURCHASED"],
  reason: "Frequently purchased alongside this deal.",
  promotion: null,
  marginImpact: { deltaAmount: "612.00", deltaPct: "2.1", resultingMarginPct: "36.5" },
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RecommendationPane", () => {
  it("shows a loading state while the fetcher is in flight", () => {
    const fetcher = vi.fn(() => new Promise<RecommendationDto[]>(() => {}));
    render(<RecommendationPane quotationId="quote-1" fetcher={fetcher} />);

    expect(screen.getByText(/loading recommendations/i)).toBeInTheDocument();
  });

  it("shows an empty state when there are no recommendations", async () => {
    const fetcher = vi.fn(async () => []);
    render(<RecommendationPane quotationId="quote-1" fetcher={fetcher} />);

    expect(
      await screen.findByText(/no upsell or cross-sell recommendations right now/i),
    ).toBeInTheDocument();
  });

  it("shows an error state when the fetcher rejects", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("Backend unavailable");
    });
    render(<RecommendationPane quotationId="quote-1" fetcher={fetcher} />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Backend unavailable");
  });

  it("renders ranked recommendations with type labels, reason, promotion, and margin impact", async () => {
    const fetcher = vi.fn(async () => [CROSS_SELL_DTO, UPSELL_DTO]);
    render(<RecommendationPane quotationId="quote-1" fetcher={fetcher} />);

    const cards = await screen.findAllByTestId("recommendation-card");
    expect(cards).toHaveLength(2);

    // Ranked ascending (rank 1 upsell first) even though the fetcher returned rank 2 first.
    expect(within(cards[0]).getByText("Enterprise Support Plan")).toBeInTheDocument();
    expect(within(cards[0]).getByText("Upsell")).toBeInTheDocument();
    expect(within(cards[0]).getByText(/customers frequently upgrade/i)).toBeInTheDocument();
    expect(within(cards[0]).getByText(/q3 support upgrade/i)).toBeInTheDocument();
    expect(within(cards[0]).getByText(/margin \+\$1,450\.00/i)).toBeInTheDocument();

    expect(within(cards[1]).getByText("Onboarding Services Package")).toBeInTheDocument();
    expect(within(cards[1]).getByText("Cross-sell")).toBeInTheDocument();
    expect(within(cards[1]).queryByText(/% off/i)).not.toBeInTheDocument();
  });

  it("calls onAddToQuote and removes the card once added", async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn(async () => [UPSELL_DTO]);
    const onAddToQuote = vi.fn<(recommendation: RecommendationViewModel) => Promise<void>>();
    render(
      <RecommendationPane quotationId="quote-1" fetcher={fetcher} onAddToQuote={onAddToQuote} />,
    );

    const card = await screen.findByTestId("recommendation-card");
    await user.click(within(card).getByRole("button", { name: /add to quote/i }));

    await waitFor(() => expect(onAddToQuote).toHaveBeenCalledTimes(1));
    expect(onAddToQuote.mock.calls[0][0]).toMatchObject({ id: "rec-1", productName: "Enterprise Support Plan" });
    await waitFor(() => expect(screen.queryByTestId("recommendation-card")).not.toBeInTheDocument());
  });

  it("calls onDismiss and removes the card once dismissed", async () => {
    const user = userEvent.setup();
    const fetcher = vi.fn(async () => [UPSELL_DTO]);
    const onDismiss = vi.fn<(recommendation: RecommendationViewModel) => Promise<void>>();
    render(<RecommendationPane quotationId="quote-1" fetcher={fetcher} onDismiss={onDismiss} />);

    const card = await screen.findByTestId("recommendation-card");
    await user.click(within(card).getByRole("button", { name: /dismiss/i }));

    await waitFor(() => expect(onDismiss).toHaveBeenCalledTimes(1));
    expect(onDismiss.mock.calls[0][0]).toMatchObject({ id: "rec-1" });
    await waitFor(() => expect(screen.queryByTestId("recommendation-card")).not.toBeInTheDocument());
  });

  it("disables Add to Quote and Dismiss actions when the pane is disabled", async () => {
    const fetcher = vi.fn(async () => [UPSELL_DTO]);
    render(<RecommendationPane quotationId="quote-1" fetcher={fetcher} disabled />);

    const card = await screen.findByTestId("recommendation-card");
    expect(within(card).getByRole("button", { name: /add to quote/i })).toBeDisabled();
    expect(within(card).getByRole("button", { name: /dismiss/i })).toBeDisabled();
  });
});
