import type { InformationLevel, MaterialityInputs, WeeklyEvidenceItem } from "@/lib/reports/weekly-report-types";

/**
 * Deterministic materiality foundation (Phase 7B). Deliberately NOT a
 * blended numeric score -- per the phase brief's caution against
 * "arbitrary over-engineered scoring," this file only (1) classifies each
 * item into a transparent high/routine split from its already-computed
 * MaterialityInputs, and (2) sorts items by those same raw signals. Both
 * are simple, documented, and fully deterministic; neither invents a
 * weighting formula. Phase 7C/7D remain free to build a richer selection
 * algorithm on top of these raw signals later -- this file only prevents
 * every item from looking equally important.
 */

/** A comparison move at or beyond this magnitude counts as "high" information on its own, even with no state change. Matches the +/-5% moderate-pressure threshold lib/market/macro-risk-engine.ts already uses for classifySignalMagnitude, reused here for consistency rather than a separately-invented number. */
export const MATERIAL_COMPARISON_MAGNITUDE_PCT = 5;

const HIGH_RISK_STATES = new Set(["HIGH_RISK", "MODERATE_RISK"]);

/**
 * "high" iff the item is new since the previous published report, changed
 * since the previous published report, currently HIGH_RISK/MODERATE_RISK,
 * carries a "high" News impact strength, or moved by at least
 * MATERIAL_COMPARISON_MAGNITUDE_PCT on any of its own comparisons.
 * "routine" otherwise -- an unchanged, non-risk, non-high-impact item with
 * only small moves.
 */
export function classifyInformationLevel(inputs: MaterialityInputs): InformationLevel {
  if (inputs.isNewThisWeek) return "high";
  if (inputs.changedSincePreviousReport) return "high";
  if (inputs.riskState && HIGH_RISK_STATES.has(inputs.riskState)) return "high";
  if (inputs.rangeImpactStrength === "high") return "high";
  if (inputs.comparisonMagnitudePct !== null && Math.abs(inputs.comparisonMagnitudePct) >= MATERIAL_COMPARISON_MAGNITUDE_PCT) return "high";
  return "routine";
}

const RISK_STATE_RANK: Record<string, number> = { HIGH_RISK: 0, MODERATE_RISK: 1, WATCH: 2, SUPPORTIVE: 3 };

/**
 * Deterministic sort, most-materially-important first -- a plain
 * comparator, not a weighting formula. Order: (1) new-or-changed items
 * before unchanged ones, (2) among risk-engine items, by severity rank
 * (ties broken by riskSeverityRank itself), (3) by |comparisonMagnitudePct|
 * descending, (4) stable fallback by evidenceId so the result is fully
 * deterministic for equal inputs.
 */
export function rankEvidenceByMateriality(items: WeeklyEvidenceItem[]): WeeklyEvidenceItem[] {
  return [...items].sort((a, b) => {
    const aInputs = a.materialityInputs;
    const bInputs = b.materialityInputs;

    const aFresh = aInputs.isNewThisWeek || aInputs.changedSincePreviousReport ? 0 : 1;
    const bFresh = bInputs.isNewThisWeek || bInputs.changedSincePreviousReport ? 0 : 1;
    if (aFresh !== bFresh) return aFresh - bFresh;

    const aRiskRank = aInputs.riskState ? (RISK_STATE_RANK[aInputs.riskState] ?? 99) : 99;
    const bRiskRank = bInputs.riskState ? (RISK_STATE_RANK[bInputs.riskState] ?? 99) : 99;
    if (aRiskRank !== bRiskRank) return aRiskRank - bRiskRank;

    const aMagnitude = aInputs.comparisonMagnitudePct !== null ? Math.abs(aInputs.comparisonMagnitudePct) : -1;
    const bMagnitude = bInputs.comparisonMagnitudePct !== null ? Math.abs(bInputs.comparisonMagnitudePct) : -1;
    if (aMagnitude !== bMagnitude) return bMagnitude - aMagnitude;

    return a.evidenceId.localeCompare(b.evidenceId);
  });
}
