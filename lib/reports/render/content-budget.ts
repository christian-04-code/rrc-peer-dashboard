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
  /** Added for the IR-report enhancement (2026-09-08). Every cap below is a safety CEILING, never a target -- each underlying section is independently gated on real evidence existing at all (see evidence-sections.ts/ai-contract.ts), so 0 is the normal, expected value most weeks for at least one of these. */
  maxKeyMetricsToWatch: number;
  maxGuidanceRows: number;
  maxInvestorQuestions: number;
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
  maxCommentarySentences: 3,
  maxKeyMetricsToWatch: 6,
  maxGuidanceRows: 8,
  maxInvestorQuestions: 5
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
  maxEvidenceSections: 4,
  maxAtAGlanceMetrics: 5,
  // A peer-table row is one compact table line, not a paragraph -- showing
  // all 6 tracked peers instead of 4 costs almost no vertical space, and a
  // truncated "Range vs. Peers" table was an explicit review finding.
  maxPeerCompanies: 6,
  maxRisksOpportunitiesRows: 6,
  maxNewsRows: 3,
  maxSourceRows: 20,
  maxWhatChangedItems: 3,
  maxWatchItems: 3,
  maxCommentarySentences: 2,
  // The IR-enhancement fields below are the newest, most-optional content in
  // the report (see their own "empty most weeks by design" headers) -- a
  // real production render with a full week's worth of this content still
  // produced 7 pages at the PRE-EXISTING reduced caps (4/6/5), identical to
  // its own standard-tier attempt, confirming those caps were not actually
  // acting as a safety net for a genuinely full week. Cut hard here, since
  // this tier's only job is guaranteeing the 5-page hard maximum, not
  // preserving every optional section -- omitted content still surfaces via
  // `omittedContentLabels`, never silently.
  maxKeyMetricsToWatch: 3,
  maxGuidanceRows: 4,
  maxInvestorQuestions: 1
};

export function budgetForTier(tier: RenderBudgetTier): ContentBudget {
  return tier === "reduced" ? REDUCED_BUDGET : STANDARD_BUDGET;
}
