import type { EvidenceModuleKey, WeeklyChange, WeeklyEvidenceItem, WeeklyReportPayload } from "@/lib/reports/weekly-report-types";
import { rankEvidenceByMateriality } from "@/lib/reports/materiality";
import type { WeeklyAnalystChangeRef, WeeklyAnalystEvidenceRef, WeeklyAnalystInput, WeeklyAnalystRiskCandidate, WeeklyAnalystSourceFreshness } from "@/lib/reports/ai-contract";
import { WEEKLY_ANALYST_SCHEMA_VERSION } from "@/lib/reports/ai-contract";

/**
 * Phase 7C deterministic evidence selection -- turns a frozen
 * WeeklyReportPayload (+ the deterministic WeeklyChange[] recomputed from
 * it and the previous published snapshot, see analyst-service.ts) into the
 * one bounded WeeklyAnalystInput sent to the model. Every limit below is a
 * hard, documented ceiling so token usage cannot silently explode on an
 * unusually eventful week -- selection always prefers highest-materiality
 * items first (rankEvidenceByMateriality, Phase 7B) and is fully
 * deterministic: the same payload + changes always produces the same
 * input, in the same order.
 *
 * This file never calls AI and never fetches anything -- pure
 * transformation only, independently testable without a DB or network.
 */

// Macro categories: typically <=7 items total across all of them combined
// today (one per category), so this ceiling is a documented safety bound
// for future category growth, not an active truncation in practice.
const MARKET_BACKDROP_MAX = 10;
// range_company: 9 headline metrics + a variable number of guidance
// records -- capped so a quarter with unusually many guidance line items
// doesn't dominate the payload.
const RANGE_MAX = 8;
// peers: up to 36 raw items (6 tickers x 6 metrics) -- capped hard, since
// most weeks nearly all of them are unchanged and only the top few by
// materiality are worth the model's attention.
const PEERS_MAX = 6;
// news-window.ts already caps the collected set at 8; re-capped slightly
// tighter here specifically for what reaches the model.
const NEWS_MAX = 5;
// steo_outlook (9 series) + forecast_scenarios (2 items) combined.
const OUTLOOK_MAX = 6;
// Raw deterministic change candidates offered to the model; the model may
// then synthesize/prioritize down to at most 5 narrative whatChanged items
// (enforced by ai-contract.ts's MAX_WHAT_CHANGED_ITEMS).
const CHANGES_MAX = 8;

const MARKET_BACKDROP_CATEGORIES: EvidenceModuleKey[] = [
  "gas_pricing",
  "storage",
  "us_gas_supply",
  "appalachia_supply",
  "lng_demand",
  "power_data_center_demand",
  "industrial_demand"
];
const OUTLOOK_CATEGORIES: EvidenceModuleKey[] = ["steo_outlook", "forecast_scenarios"];

function itemsFor(payload: WeeklyReportPayload, categories: EvidenceModuleKey[]): WeeklyEvidenceItem[] {
  return categories.flatMap((category) => payload.modules[category] ?? []);
}

function toEvidenceRef(item: WeeklyEvidenceItem): WeeklyAnalystEvidenceRef {
  return { evidenceId: item.evidenceId, category: item.category, label: item.label, displayValue: item.displayValue, period: item.period };
}

function selectTop(items: WeeklyEvidenceItem[], limit: number): WeeklyEvidenceItem[] {
  return rankEvidenceByMateriality(items).slice(0, limit);
}

/** HIGH_RISK/MODERATE_RISK/WATCH -> risk candidates; SUPPORTIVE -> opportunity candidates. Order preserved from the deterministic risk engine's own rank (metadata.riskRank), never re-ranked here. */
function splitRiskCandidates(items: WeeklyEvidenceItem[]): { risk: WeeklyAnalystRiskCandidate[]; opportunity: WeeklyAnalystRiskCandidate[] } {
  const sorted = [...items].sort((a, b) => {
    const rankA = typeof a.metadata.riskRank === "number" ? a.metadata.riskRank : Number.MAX_SAFE_INTEGER;
    const rankB = typeof b.metadata.riskRank === "number" ? b.metadata.riskRank : Number.MAX_SAFE_INTEGER;
    return rankA - rankB;
  });
  const risk: WeeklyAnalystRiskCandidate[] = [];
  const opportunity: WeeklyAnalystRiskCandidate[] = [];
  for (const item of sorted) {
    const candidate: WeeklyAnalystRiskCandidate = {
      evidenceId: item.evidenceId,
      driver: item.metricKey,
      label: item.label,
      state: typeof item.metadata.riskState === "string" ? item.metadata.riskState : "UNKNOWN",
      rank: typeof item.metadata.riskRank === "number" ? item.metadata.riskRank : 0,
      reason: typeof item.metadata.deterministicReason === "string" ? item.metadata.deterministicReason : item.label
    };
    if (candidate.state === "SUPPORTIVE") opportunity.push(candidate);
    else risk.push(candidate);
  }
  return { risk, opportunity };
}

// Prioritizes state/rank changes (the most structurally significant kind)
// first, then category-specific "new information arrived" kinds, then
// plain value revisions -- a deterministic tie-break, not a materiality
// score. Ties within a tier break by evidenceId for full determinism.
const CHANGE_KIND_PRIORITY: Record<string, number> = {
  risk_state_changed: 0,
  risk_rank_changed: 1,
  new_steo_vintage: 2,
  new_company_result_or_guidance: 2,
  material_peer_change: 2,
  new_retained_news_item: 2,
  forecast_revision: 2,
  new_observation: 3,
  value_changed: 4
};

function selectChanges(changes: WeeklyChange[], limit: number): WeeklyChange[] {
  return [...changes]
    .sort((a, b) => {
      const priorityDelta = (CHANGE_KIND_PRIORITY[a.kind] ?? 9) - (CHANGE_KIND_PRIORITY[b.kind] ?? 9);
      if (priorityDelta !== 0) return priorityDelta;
      return a.evidenceId.localeCompare(b.evidenceId);
    })
    .slice(0, limit);
}

function toChangeRef(change: WeeklyChange): WeeklyAnalystChangeRef {
  return { kind: change.kind, evidenceId: change.evidenceId, category: change.category, label: change.label, fromValue: change.fromValue, toValue: change.toValue, fromState: change.fromState, toState: change.toState };
}

function toSourceFreshness(payload: WeeklyReportPayload): WeeklyAnalystSourceFreshness[] {
  return payload.sourceManifest.generatedFrom.map((entry) => ({ key: entry.key, label: entry.label, period: entry.period, freshness: entry.freshness }));
}

export type PreviousReportContext = { storageWeekEnding: string; bottomLine: string } | null;

/**
 * Builds the complete WeeklyAnalystInput from a frozen payload + the
 * deterministic changes computed against the previous published snapshot
 * (see analyst-service.ts -- this function does not compute changes
 * itself, it only selects/bounds/shapes what's passed in).
 */
export function selectAnalystEvidence(payload: WeeklyReportPayload, changes: WeeklyChange[], previousReportContext: PreviousReportContext): WeeklyAnalystInput {
  const marketBackdropItems = selectTop(itemsFor(payload, MARKET_BACKDROP_CATEGORIES), MARKET_BACKDROP_MAX);
  const rangeItems = selectTop(payload.modules.range_company ?? [], RANGE_MAX);
  const peersItems = selectTop(payload.modules.peers ?? [], PEERS_MAX);
  const newsItems = selectTop(payload.modules.news ?? [], NEWS_MAX);
  const outlookItems = selectTop(itemsFor(payload, OUTLOOK_CATEGORIES), OUTLOOK_MAX);
  const { risk: riskCandidates, opportunity: opportunityCandidates } = splitRiskCandidates(payload.modules.deterministic_risk_opportunity ?? []);
  const selectedChanges = selectChanges(changes, CHANGES_MAX);

  const marketBackdrop = marketBackdropItems.map(toEvidenceRef);
  const range = rangeItems.map(toEvidenceRef);
  const peers = peersItems.map(toEvidenceRef);
  const news = newsItems.map(toEvidenceRef);
  const outlook = outlookItems.map(toEvidenceRef);
  const whatChanged = selectedChanges.map(toChangeRef);

  const evidenceAllowlist = [
    ...new Set([
      ...marketBackdrop.map((ref) => ref.evidenceId),
      ...riskCandidates.map((candidate) => candidate.evidenceId),
      ...opportunityCandidates.map((candidate) => candidate.evidenceId),
      ...whatChanged.map((change) => change.evidenceId),
      ...range.map((ref) => ref.evidenceId),
      ...peers.map((ref) => ref.evidenceId),
      ...news.map((ref) => ref.evidenceId),
      ...outlook.map((ref) => ref.evidenceId)
    ])
  ];

  return {
    schemaVersion: WEEKLY_ANALYST_SCHEMA_VERSION,
    report: { storageWeekEnding: payload.storageWeekEnding, dataCutoffAt: payload.dataCutoffAt },
    marketBackdrop,
    riskCandidates,
    opportunityCandidates,
    whatChanged,
    range,
    peers,
    news,
    outlook,
    sourcesFreshness: toSourceFreshness(payload),
    previousReportContext,
    evidenceAllowlist
  };
}
