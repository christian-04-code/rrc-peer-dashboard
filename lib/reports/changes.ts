import type { EvidenceModuleKey, WeeklyChange, WeeklyChangeKind, WeeklyEvidenceItem, WeeklyReportModules } from "@/lib/reports/weekly-report-types";

/**
 * Deterministic "what changed this week" foundation (Phase 7B; semantic
 * comparison rule corrected in Phase 7B.1). Diffs the CURRENT snapshot's
 * modules against the PREVIOUS *published* snapshot's modules (via
 * getPreviousPublishedSnapshot() -- never against this same snapshot's own
 * inputs, and never inferred). Returns structured facts only; no prose, no
 * conclusions -- Phase 7C's future AI narrates these, it does not have to
 * go discover them itself.
 *
 * The critical rule this file exists to enforce (Phase 7B brief): a diff is
 * driven by evidenceId identity and each item's own SEMANTIC fact, never by
 * "did the report get generated again." An unchanged quarterly metric
 * appearing in two consecutive WEEKLY snapshots produces NO change entry --
 * a metric only ever produces a change entry when its own real-world value
 * actually differs, which for a monthly/quarterly series only happens as
 * often as that series itself actually updates, never merely because
 * another week's report ran.
 *
 * Phase 7B.1 correction: "semantic fact" is deliberately NOT `displayValue`.
 * `displayValue` is presentation-only (rounding, formatting, unit
 * suffixes) -- comparing it directly made truth detection dependent on
 * formatting, so a real underlying change that happens to round to the
 * same display string (3.326 -> 3.334, both "$3.33") went undetected, and a
 * pure formatting change with no real data change could in principle have
 * registered as one. `isEvidenceItemChanged()` below is the single
 * semantic-equality rule used consistently by both this file's generic diff
 * AND snapshot-builder.ts's annotateMateriality() (`changedSincePreviousReport`)
 * -- there is exactly one definition of "changed" in this subsystem, not two.
 */

function metadataString(item: WeeklyEvidenceItem | undefined, key: string): string | null {
  const value = item?.metadata[key];
  return typeof value === "string" ? value : null;
}

function metadataRank(item: WeeklyEvidenceItem | undefined): string | null {
  const value = item?.metadata.riskRank;
  return typeof value === "number" ? String(value) : null;
}

/**
 * The one semantic-equality rule for "did this evidence item genuinely
 * change." Category-aware:
 *  - "deterministic_risk_opportunity": riskState/riskRank metadata only
 *    (never the generic numeric/period rule below) -- a risk item's
 *    `currentValue` (pressurePct) and `displayValue` are both largely a
 *    restatement of its classification, so this is the one deterministic
 *    fact that actually matters for a risk item.
 *  - "news": always `false` -- discrete events, identity-based (a News
 *    item's evidenceId embeds its own article id and never recurs across
 *    weeks in practice, so there is nothing to "change" in place).
 *  - everything else: `current.period !== prior.period` (case B -- a new
 *    observation period arrived, even if the number happens to coincide
 *    with the prior period's) OR, for the same period, a real numeric
 *    difference in `currentValue` when both sides have one (case C vs A) OR,
 *    only when NEITHER side has a numeric currentValue (a genuinely
 *    qualitative fact, e.g. text-only guidance wording), a `displayValue`
 *    difference as the sole remaining fact to compare.
 */
export function isEvidenceItemChanged(current: WeeklyEvidenceItem, prior: WeeklyEvidenceItem): boolean {
  if (current.category === "deterministic_risk_opportunity") {
    return metadataString(current, "riskState") !== metadataString(prior, "riskState") || metadataRank(current) !== metadataRank(prior);
  }
  if (current.category === "news") return false;
  if (current.period !== prior.period) return true;
  if (current.currentValue !== null && prior.currentValue !== null) {
    return current.currentValue !== prior.currentValue;
  }
  return current.displayValue !== prior.displayValue;
}

/** True iff the period itself advanced (case B) -- used only to pick which WeeklyChangeKind vocabulary applies (the "new_*" kinds vs "value_changed"/category-specific), not to decide whether a change occurred at all (isEvidenceItemChanged already covers that). */
function isNewObservationPeriod(current: WeeklyEvidenceItem, prior: WeeklyEvidenceItem): boolean {
  return current.period !== prior.period;
}

function newObservationKind(category: EvidenceModuleKey): WeeklyChangeKind {
  switch (category) {
    case "news":
      return "new_retained_news_item";
    case "steo_outlook":
      return "new_steo_vintage";
    case "range_company":
      return "new_company_result_or_guidance";
    case "peers":
      return "material_peer_change";
    default:
      return "new_observation";
  }
}

function valueChangedKind(category: EvidenceModuleKey): WeeklyChangeKind {
  switch (category) {
    case "steo_outlook":
      return "new_steo_vintage";
    case "range_company":
      return "new_company_result_or_guidance";
    case "peers":
      return "material_peer_change";
    case "forecast_scenarios":
      return "forecast_revision";
    default:
      return "value_changed";
  }
}

/** Exported for reuse by snapshot-builder.ts's annotateMateriality(), which needs the exact same evidenceId -> item lookup this file's own diff uses. */
export function flattenModules(modules: WeeklyReportModules): Map<string, WeeklyEvidenceItem> {
  const map = new Map<string, WeeklyEvidenceItem>();
  for (const items of Object.values(modules)) {
    for (const item of items ?? []) map.set(item.evidenceId, item);
  }
  return map;
}

/**
 * Risk items (category "deterministic_risk_opportunity") are diffed only
 * by their own riskState/riskRank metadata, never by the generic
 * new/value-changed path above -- a risk item's `displayValue` is largely a
 * restatement of its state, so running both paths would produce a
 * redundant second change entry describing the same real-world fact twice.
 */
function riskChangesFor(current: WeeklyEvidenceItem, prior: WeeklyEvidenceItem | undefined): WeeklyChange[] {
  const changes: WeeklyChange[] = [];
  const currentState = metadataString(current, "riskState");
  const priorState = metadataString(prior, "riskState");
  if (currentState !== priorState) {
    changes.push({ kind: "risk_state_changed", evidenceId: current.evidenceId, category: current.category, label: current.label, fromValue: null, toValue: null, fromState: priorState, toState: currentState });
  }
  const currentRank = metadataRank(current);
  const priorRank = metadataRank(prior);
  if (currentRank !== priorRank) {
    changes.push({ kind: "risk_rank_changed", evidenceId: current.evidenceId, category: current.category, label: current.label, fromValue: null, toValue: null, fromState: priorRank, toState: currentRank });
  }
  return changes;
}

export function computeWeeklyChanges(currentModules: WeeklyReportModules, previousModules: WeeklyReportModules | null): WeeklyChange[] {
  const changes: WeeklyChange[] = [];
  const previous = previousModules ? flattenModules(previousModules) : new Map<string, WeeklyEvidenceItem>();

  for (const items of Object.values(currentModules)) {
    for (const item of items ?? []) {
      const priorItem = previous.get(item.evidenceId);

      if (item.category === "deterministic_risk_opportunity") {
        changes.push(...riskChangesFor(item, priorItem));
        continue;
      }

      if (!priorItem) {
        changes.push({ kind: newObservationKind(item.category), evidenceId: item.evidenceId, category: item.category, label: item.label, fromValue: null, toValue: item.displayValue, fromState: null, toState: null });
      } else if (isEvidenceItemChanged(item, priorItem)) {
        // A new observation period (case B) uses the "new_*" kind vocabulary even
        // though an evidenceId match exists -- semantically this is new information
        // arriving, not merely a same-period value revision (case C).
        const kind = isNewObservationPeriod(item, priorItem) ? newObservationKind(item.category) : valueChangedKind(item.category);
        changes.push({ kind, evidenceId: item.evidenceId, category: item.category, label: item.label, fromValue: priorItem.displayValue, toValue: item.displayValue, fromState: null, toState: null });
      }
    }
  }

  return changes;
}
