import type { EvidenceModuleKey, WeeklyChange, WeeklyChangeKind, WeeklyEvidenceItem, WeeklyReportModules } from "@/lib/reports/weekly-report-types";

/**
 * Deterministic "what changed this week" foundation (Phase 7B). Diffs the
 * CURRENT snapshot's modules against the PREVIOUS *published* snapshot's
 * modules (via getPreviousPublishedSnapshot() -- never against this same
 * snapshot's own inputs, and never inferred). Returns structured facts
 * only; no prose, no conclusions -- Phase 7C's future AI narrates these, it
 * does not have to go discover them itself.
 *
 * The critical rule this file exists to enforce (Phase 7B brief): a diff is
 * driven entirely by evidenceId identity and each item's own displayValue,
 * never by "did the report get generated again." An unchanged quarterly
 * metric appearing in two consecutive WEEKLY snapshots produces NO change
 * entry, because its evidenceId's displayValue is identical in both --
 * there is no separate "was this week's snapshot generation a no-op for
 * this item" special case to get wrong, because the diff never looks at
 * anything except the two items' own content. A metric only ever produces a
 * change entry when its own real-world value actually differs, which for a
 * monthly/quarterly series only happens as often as that series itself
 * actually updates -- never merely because another week's report ran.
 */

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

function metadataString(item: WeeklyEvidenceItem | undefined, key: string): string | null {
  const value = item?.metadata[key];
  return typeof value === "string" ? value : null;
}

function metadataRank(item: WeeklyEvidenceItem | undefined): string | null {
  const value = item?.metadata.riskRank;
  return typeof value === "number" ? String(value) : null;
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
      } else if (priorItem.displayValue !== item.displayValue) {
        changes.push({ kind: valueChangedKind(item.category), evidenceId: item.evidenceId, category: item.category, label: item.label, fromValue: priorItem.displayValue, toValue: item.displayValue, fromState: null, toState: null });
      }
    }
  }

  return changes;
}
