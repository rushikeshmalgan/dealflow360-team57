/**
 * T7.1 — pure risk-scoring utility implementing TAD SS10's exact blended-risk formula:
 *
 *   excess_i          = max(0, effectiveDiscount_i - allowedDiscount_i)
 *   valueWeight_i     = lineNetBeforeTax_i / quoteNetBeforeTax
 *   weightedExcess    = sum(valueWeight_i * excess_i)
 *   violationBreadth  = sum(valueWeight_i where excess_i > 0)
 *   maxExcess         = max(excess_i)
 *   marginPressure    = max(0, (configuredMinMargin - quoteMargin) / configuredMinMargin)
 *   riskScore         = 100 * clamp(w1*normalize(weightedExcess) + w2*violationBreadth
 *                                   + w3*normalize(maxExcess) + w4*marginPressure, 0, 1)
 *
 * No Next.js/Prisma dependency (TAD SS31). `effectiveDiscount_i` and `lineNetBeforeTax_i` are
 * expected to already be the output of calculate-discount-margin.ts's `calculateLineMargin` —
 * this file does not re-derive discount/margin math, only combines it into a risk score, so
 * the two callers allowed by the ticket (T7.2 submit flow, T12.4 negotiation re-approval) can
 * never see a different effective-discount number here than the one the quote itself displays.
 *
 * Percentages are 0-100 throughout, matching every other function in this module.
 */

export type RiskLineInput = {
  lineId: string;
  /** From DiscountRuleService.resolveCeiling. Null means no ceiling is configured — never violates. */
  allowedDiscountPct: number | null;
  /** From calculateLineMargin. */
  effectiveDiscountPct: number;
  /** From calculateLineMargin — `lineNetBeforeTax_i` in TAD SS10. */
  netBeforeTax: number;
};

export type RiskQuoteInput = {
  lines: readonly RiskLineInput[];
  /** From calculateQuotationMargin — `quoteMargin` in TAD SS10. Null when the quote has no revenue. */
  quoteMarginPct: number | null;
};

export type RiskConfig = {
  version: number;
  weights: {
    weightedExcess: number;
    violationBreadth: number;
    maxExcess: number;
    marginPressure: number;
  };
  /**
   * `weightedExcess` and `maxExcess` are excess *percentage points* (0-100+); TAD SS10 calls
   * for `normalize()` before weighting them alongside the already-unit-scale `violationBreadth`.
   * Dividing by this value and clamping to [0,1] is that normalizer.
   */
  excessNormalizerPct: number;
  /** `configuredMinMargin` in TAD SS10's marginPressure term, as a 0-100 percentage. */
  configuredMinMarginPct: number;
  /** riskScore cut points (0-100 scale) for LOW/MEDIUM/HIGH banding. */
  bandThresholds: { medium: number; high: number };
};

/**
 * Default versioned config. Bump `version` (and persist the new object under a new export)
 * whenever weights/normalizers/thresholds change — `risk_evaluation.config_version` records
 * which one produced a given score, so historical evaluations stay explainable.
 */
export const RISK_CONFIG_V1: RiskConfig = {
  version: 1,
  weights: { weightedExcess: 0.4, violationBreadth: 0.25, maxExcess: 0.25, marginPressure: 0.1 },
  excessNormalizerPct: 100,
  configuredMinMarginPct: 20,
  bandThresholds: { medium: 30, high: 60 },
};

export type RiskBand = "LOW" | "MEDIUM" | "HIGH";

export type RiskLineExplanation = {
  lineId: string;
  allowedDiscountPct: number | null;
  effectiveDiscountPct: number;
  excessPct: number;
  valueWeight: number;
  /** This line's (pre-normalization) share of `weightedExcess`, i.e. `valueWeight_i * excess_i`. */
  contribution: number;
};

export type RiskExplanation = {
  weightedExcess: number;
  violationBreadth: number;
  maxExcess: number;
  marginPressure: number;
  /** The four weighted, normalized terms that sum (before the final *100) to the risk score. */
  components: {
    weightedExcess: number;
    violationBreadth: number;
    maxExcess: number;
    marginPressure: number;
  };
  lines: RiskLineExplanation[];
};

export type RiskResult = {
  score: number;
  band: RiskBand;
  configVersion: number;
  explanation: RiskExplanation;
};

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function scoreRisk(input: RiskQuoteInput, config: RiskConfig = RISK_CONFIG_V1): RiskResult {
  const quoteNetBeforeTax = input.lines.reduce((sum, line) => sum + line.netBeforeTax, 0);

  const lines: RiskLineExplanation[] = input.lines.map((line) => {
    const excessPct =
      line.allowedDiscountPct === null
        ? 0
        : Math.max(0, line.effectiveDiscountPct - line.allowedDiscountPct);
    const valueWeight = quoteNetBeforeTax === 0 ? 0 : line.netBeforeTax / quoteNetBeforeTax;
    return {
      lineId: line.lineId,
      allowedDiscountPct: line.allowedDiscountPct,
      effectiveDiscountPct: line.effectiveDiscountPct,
      excessPct,
      valueWeight,
      contribution: valueWeight * excessPct,
    };
  });

  const weightedExcess = lines.reduce((sum, line) => sum + line.contribution, 0);
  const violationBreadth = lines.reduce(
    (sum, line) => sum + (line.excessPct > 0 ? line.valueWeight : 0),
    0,
  );
  const maxExcess = lines.reduce((max, line) => Math.max(max, line.excessPct), 0);
  const marginPressure =
    input.quoteMarginPct === null
      ? 0
      : Math.max(
          0,
          (config.configuredMinMarginPct - input.quoteMarginPct) / config.configuredMinMarginPct,
        );

  const components = {
    weightedExcess:
      config.weights.weightedExcess * clamp01(weightedExcess / config.excessNormalizerPct),
    violationBreadth: config.weights.violationBreadth * clamp01(violationBreadth),
    maxExcess: config.weights.maxExcess * clamp01(maxExcess / config.excessNormalizerPct),
    marginPressure: config.weights.marginPressure * clamp01(marginPressure),
  };

  const score =
    100 *
    clamp01(
      components.weightedExcess +
        components.violationBreadth +
        components.maxExcess +
        components.marginPressure,
    );

  let band: RiskBand =
    score >= config.bandThresholds.high
      ? "HIGH"
      : score >= config.bandThresholds.medium
        ? "MEDIUM"
        : "LOW";

  // TAD SS10: "Any line violation forces at least manager approval" — a single violating line
  // buried among mostly-compliant ones can otherwise average out to a LOW-banding score.
  const hasViolation = lines.some((line) => line.excessPct > 0);
  if (hasViolation && band === "LOW") band = "MEDIUM";

  return {
    score,
    band,
    configVersion: config.version,
    explanation: { weightedExcess, violationBreadth, maxExcess, marginPressure, components, lines },
  };
}
