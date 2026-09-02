import type { ComparisonResult, EvidenceModuleKey, WeeklyEvidenceItem } from "@/lib/reports/weekly-report-types";

/**
 * Phase 7D deterministic commentary composition -- explicitly NOT an AI
 * call (Section 11's architectural rule: Phase 7 stays at approximately one
 * AI invocation per weekly report, the Phase 7C analyst assessment; no
 * per-chart/per-section AI calls were added here). Every sentence below is
 * template text with typed values substituted in -- never an invented
 * interpretation, never a claim the underlying ComparisonResult/
 * MaterialityInputs data doesn't itself support.
 *
 * This is intentionally a simple v1: real analyst-grade connective prose
 * ("how a storage surplus and LNG demand growth interact") is exactly what
 * Phase 7C's executiveAssessment/biggestRisk/biggestOpportunity narrative
 * already provides from the one AI call this subsystem makes; the
 * per-section commentary here only needs to state clearly what the
 * accompanying chart/table already shows. A richer deterministic NLG layer
 * remains a future enhancement, not something this phase should reach for
 * by adding more model calls (see this file's own header discipline mirrored
 * from Section 11 of the Phase 7D brief).
 */

function formatDeltaPct(deltaPct: number): string {
  return `${Math.abs(deltaPct).toFixed(1)}%`;
}

function directionVerb(direction: ComparisonResult["direction"]): string | null {
  if (direction === "up") return "up";
  if (direction === "down") return "down";
  if (direction === "flat") return "flat";
  return null;
}

/** One sentence per available (non-"unavailable") comparison, in the item's own comparisons order -- never fabricates a comparison the item doesn't carry. */
function comparisonSentences(item: WeeklyEvidenceItem, maxSentences: number): string[] {
  const sentences: string[] = [];
  for (const cmp of item.comparisons) {
    if (sentences.length >= maxSentences) break;
    const verb = directionVerb(cmp.direction);
    if (verb === null || cmp.deltaPct === null) continue;
    const basis = cmp.basisDescription ? ` ${cmp.basisDescription}` : "";
    if (verb === "flat") {
      sentences.push(`${cmp.label} was unchanged${basis}.`);
    } else {
      sentences.push(`${cmp.label} was ${verb} ${formatDeltaPct(cmp.deltaPct)}${basis}.`);
    }
  }
  return sentences;
}

/**
 * Composes 1-N deterministic sentences for one evidence item's section:
 * sentence 1 always states the current value/period; subsequent sentences
 * (up to maxSentences total) narrate its own available comparisons in
 * order. A comparison whose direction is "unavailable" is silently skipped
 * (never described as "flat" or invented) -- the same "never fabricate an
 * unavailable comparison" discipline comparisons.ts itself enforces.
 */
export function composeEvidenceCommentary(item: WeeklyEvidenceItem, maxSentences: number): string[] {
  const headline = item.period
    ? `${item.label} stood at ${item.displayValue} for the period ending ${item.period}.`
    : `${item.label} stood at ${item.displayValue}.`;
  const rest = comparisonSentences(item, Math.max(0, maxSentences - 1));
  return [headline, ...rest].slice(0, maxSentences);
}

/** Same shape as composeEvidenceCommentary but for a multi-item section (e.g. Rig Activity) -- one headline sentence per item, no per-item comparison detail (kept to the section's own sentence budget). */
export function composeMultiItemCommentary(items: WeeklyEvidenceItem[], maxSentences: number): string[] {
  return items.slice(0, maxSentences).map((item) => (item.period ? `${item.label}: ${item.displayValue} (as of ${item.period}).` : `${item.label}: ${item.displayValue}.`));
}

const UP_DOWN_TEMPLATES: Partial<Record<EvidenceModuleKey, { up: string; down: string }>> = {
  gas_pricing: {
    up: "Higher Henry Hub pricing is directionally supportive for Range's realized natural gas price.",
    down: "Softer Henry Hub pricing is a headwind for Range's realized natural gas price."
  },
  storage: {
    up: "A storage build above expectations typically pressures near-term gas pricing, a headwind for Range's realized price.",
    down: "A storage draw tightens near-term balances, typically supportive for Range's realized price."
  },
  us_gas_supply: {
    up: "Rising U.S. dry gas production is a broader supply headwind that can pressure pricing Range also realizes.",
    down: "Slowing U.S. dry gas production growth reduces broader supply pressure on pricing Range also realizes."
  },
  appalachia_supply: {
    up: "Rising Appalachian production adds to the same regional supply base Range produces into, a potential basis-differential headwind.",
    down: "Slowing Appalachian production growth eases regional supply pressure, potentially supportive for Range's local basis differential."
  },
  lng_demand: {
    up: "Growing U.S. LNG exports add incremental demand pull that is directionally supportive for domestic gas pricing Range realizes.",
    down: "Softer U.S. LNG exports reduce incremental demand pull on domestic gas pricing Range realizes."
  },
  power_data_center_demand: {
    up: "Rising power-sector gas demand adds incremental demand pull supportive for domestic gas pricing.",
    down: "Softer power-sector gas demand reduces incremental demand pull on domestic gas pricing."
  },
  industrial_demand: {
    up: "Rising industrial gas demand adds incremental demand pull supportive for domestic gas pricing.",
    down: "Softer industrial gas demand reduces incremental demand pull on domestic gas pricing."
  },
  rigs: {
    up: "A rising Appalachian rig count points to more future regional supply, a longer-lead-time consideration for regional pricing.",
    down: "A falling Appalachian rig count points to slower future regional supply growth, a longer-lead-time consideration for regional pricing."
  }
};

/** News' Range implication is already a real, grounded fact from News's own persisted AI analysis (rangeImpactDirection/rangeImpactStrength) -- this restates it, it does not derive a new one. */
function newsRangeImplication(item: WeeklyEvidenceItem): string | null {
  const direction = item.materialityInputs.rangeImpactDirection;
  const strength = item.materialityInputs.rangeImpactStrength;
  if (!direction) return null;
  const strengthPhrase = strength ? `${strength} ${direction}` : direction;
  return `"${item.label}" is flagged with a ${strengthPhrase} Range impact by analyzed News coverage.`;
}

/**
 * Only returns non-null when the connection is meaningful (Section 12):
 * the representative item must be high-materiality (new/changed/high-risk/
 * large-magnitude move) AND a template must exist for its category AND (for
 * the up/down templates) the item must carry a real, available directional
 * comparison. Never forces a callout under every chart.
 */
export function composeRangeImplication(item: WeeklyEvidenceItem): string | null {
  const isHighMateriality =
    item.materialityInputs.isNewThisWeek ||
    item.materialityInputs.changedSincePreviousReport ||
    item.materialityInputs.riskState === "HIGH_RISK" ||
    item.materialityInputs.riskState === "MODERATE_RISK" ||
    (item.materialityInputs.comparisonMagnitudePct !== null && Math.abs(item.materialityInputs.comparisonMagnitudePct) >= 5);
  if (!isHighMateriality) return null;

  if (item.category === "news") return newsRangeImplication(item);

  const templates = UP_DOWN_TEMPLATES[item.category];
  if (!templates) return null;
  const primaryComparison = item.comparisons.find((c) => c.direction === "up" || c.direction === "down");
  if (!primaryComparison) return null;
  return primaryComparison.direction === "up" ? templates.up : templates.down;
}
