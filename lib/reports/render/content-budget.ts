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
  // A source row is compact (one line each) and is exactly the traceability
  // information a management-facing IR document should never hide -- a real
  // Preview PDF still truncated this table (13-14 real sources, only 7-8
  // shown) even though the page had visible unused white space. Raised well
  // above the realistic total source count so this table is effectively
  // never truncated in practice; still a real, documented cap, not removed.
  maxSourceRows: 20,
  maxWhatChangedItems: 5,
  maxWatchItems: 6,
  maxCommentarySentences: 3
};

/**
 * Every cap tightened for the one allowed reduced-content retry pass --
 * never a third, smaller tier (see this file's header). A real Preview PDF's
 * first-ever report fell back to this tier and still rendered with a mostly-
 * empty final page while omitting 7 of 11 candidate evidence sections
 * (including Natural Gas Pricing and Storage) -- both maxEvidenceSections
 * and maxPeerCompanies were tightened well past what the actual per-item
 * vertical space consumption required. Raised modestly (still meaningfully
 * below STANDARD) and re-validated against the 5-page hard maximum using the
 * project's sample fixture rather than guessed blindly.
 */
export const REDUCED_BUDGET: ContentBudget = {
  tier: "reduced",
  maxEvidenceSections: 5,
  maxAtAGlanceMetrics: 5,
  // A peer-table row is one compact table line, not a paragraph -- showing
  // all 6 tracked peers instead of 4 costs almost no vertical space, and a
  // truncated "Range vs. Peers" table was an explicit review finding.
  maxPeerCompanies: 6,
  maxRisksOpportunitiesRows: 6,
  maxNewsRows: 3,
  maxSourceRows: 20,
  maxWhatChangedItems: 4,
  maxWatchItems: 4,
  maxCommentarySentences: 2
};

export function budgetForTier(tier: RenderBudgetTier): ContentBudget {
  return tier === "reduced" ? REDUCED_BUDGET : STANDARD_BUDGET;
}
