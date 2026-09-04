import type { RenderBudgetTier } from "@/lib/reports/render/render-model";

/**
 * Phase 7D deterministic content budget -- the brief's "cap number of
 * evidence sections... use compact source formatting... high-materiality
 * evidence wins, routine evidence is omitted before typography becomes
 * unreadable" rule, expressed as fixed, documented ceilings rather than an
 * invented scoring formula. Two tiers only: STANDARD (the normal weekly
 * render) and REDUCED (the one deterministic compact re-render pass
 * pdf-service.ts falls back to if STANDARD renders beyond the 5-page hard
 * maximum -- see that file's header for the exact retry policy). There is
 * no third tier; a REDUCED render that still overflows fails safely rather
 * than trying a third, ever-smaller budget.
 */

export const MAX_PDF_PAGES = 5;

export type ContentBudget = {
  tier: RenderBudgetTier;
  maxEvidenceSections: number;
  maxAtAGlanceMetrics: number;
  maxPeerCompanies: number;
  maxRisksOpportunitiesRows: number;
  maxNewsRows: number;
  maxSourceRows: number;
  maxWhatChangedItems: number;
  maxWatchItems: number;
  maxCommentarySentences: number;
};

export const STANDARD_BUDGET: ContentBudget = {
  tier: "standard",
  maxEvidenceSections: 6,
  maxAtAGlanceMetrics: 6,
  maxPeerCompanies: 6,
  maxRisksOpportunitiesRows: 8,
  maxNewsRows: 5,
  maxSourceRows: 10,
  maxWhatChangedItems: 5,
  maxWatchItems: 6,
  maxCommentarySentences: 3
};

/** Every cap tightened for the one allowed reduced-content retry pass -- never a third, smaller tier (see this file's header). */
export const REDUCED_BUDGET: ContentBudget = {
  tier: "reduced",
  maxEvidenceSections: 4,
  maxAtAGlanceMetrics: 5,
  maxPeerCompanies: 4,
  maxRisksOpportunitiesRows: 6,
  maxNewsRows: 3,
  maxSourceRows: 8,
  maxWhatChangedItems: 4,
  maxWatchItems: 4,
  maxCommentarySentences: 2
};

export function budgetForTier(tier: RenderBudgetTier): ContentBudget {
  return tier === "reduced" ? REDUCED_BUDGET : STANDARD_BUDGET;
}
