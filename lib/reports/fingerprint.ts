import { createHash } from "node:crypto";
import type { ComparisonResult, WeeklyEvidenceItem, WeeklyReportModules } from "@/lib/reports/weekly-report-types";

/**
 * Weekly snapshot input fingerprint (Phase 7B), following the exact
 * precedent lib/market/persistence/summary-repo.ts's
 * computeMacroSummaryFingerprint already proved out: canonical (key-sorted)
 * JSON serialization -> SHA-256. Not imported from that file directly --
 * `canonicalize` there is a small private helper, not exported, and
 * duplicating ~6 lines of a well-understood algorithm here is cheaper and
 * safer than adding a cross-subsystem coupling for it (Phase 7 is meant to
 * be a read-only *consumer* of Macro's validated output, not share its
 * internal plumbing).
 *
 * The critical extra step beyond that precedent: this file first reduces
 * each WeeklyEvidenceItem down to a curated, deterministic subset
 * (`toFingerprintView`) before hashing, rather than hashing the raw
 * evidence objects. That is what guarantees the fingerprint is insensitive
 * to volatile fields an adapter might legitimately carry in `metadata` or
 * elsewhere (a DB row id, a fetch timestamp, an object-key ordering
 * difference) while staying sensitive to every field that actually
 * represents "the underlying data changed."
 */

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(",")}}`;
}

type ComparisonFingerprintView = Pick<ComparisonResult, "period" | "metricKey" | "currentValue" | "previousValue" | "direction">;

function toComparisonFingerprintView(comparison: ComparisonResult): ComparisonFingerprintView {
  return { period: comparison.period, metricKey: comparison.metricKey, currentValue: comparison.currentValue, previousValue: comparison.previousValue, direction: comparison.direction };
}

type EvidenceFingerprintView = {
  evidenceId: string;
  category: string;
  metricKey: string;
  currentValue: number | null;
  displayValue: string;
  unit: string | null;
  period: string | null;
  freshness: string;
  comparisons: ComparisonFingerprintView[];
  rangeDrivers: string[];
};

/**
 * Deliberately excludes: `asOfDate` (redundant with `period`, and carrying
 * both would make the fingerprint sensitive to a formatting change in how
 * asOfDate is derived rather than to a real data change), `sourceIds`
 * (traceability metadata, not the fact itself), `materialityInputs`
 * (derived *from* a comparison against the previous report, not itself an
 * input describing this week's real-world data), and `metadata` (an
 * intentionally free-form per-category bag that may legitimately carry
 * non-deterministic bookkeeping -- any field inside it that genuinely
 * represents new information belongs in one of the typed fields above
 * instead, not fingerprinted indirectly through a catch-all).
 */
function toFingerprintView(item: WeeklyEvidenceItem): EvidenceFingerprintView {
  return {
    evidenceId: item.evidenceId,
    category: item.category,
    metricKey: item.metricKey,
    currentValue: item.currentValue,
    displayValue: item.displayValue,
    unit: item.unit,
    period: item.period,
    freshness: item.freshness,
    comparisons: item.comparisons.map(toComparisonFingerprintView),
    rangeDrivers: [...item.rangeDrivers].sort()
  };
}

function modulesFingerprintView(modules: WeeklyReportModules): Record<string, EvidenceFingerprintView[]> {
  const view: Record<string, EvidenceFingerprintView[]> = {};
  for (const category of Object.keys(modules).sort()) {
    const items = modules[category as keyof WeeklyReportModules] ?? [];
    view[category] = items.map(toFingerprintView).sort((a, b) => a.evidenceId.localeCompare(b.evidenceId));
  }
  return view;
}

export type WeeklyFingerprintInput = {
  schemaVersion: string;
  storageWeekEnding: string;
  modules: WeeklyReportModules;
};

/**
 * Same real-world weekly intelligence inputs -> same fingerprint, every
 * time, regardless of object-key insertion order, array order, or which
 * volatile bookkeeping fields an adapter happened to attach this run.
 * Changing any field retained in EvidenceFingerprintView (a value, a
 * period, a comparison's direction, an added/removed evidence item, an
 * added/removed category) changes the fingerprint.
 */
export function computeWeeklyReportFingerprint(input: WeeklyFingerprintInput): string {
  const view = { schemaVersion: input.schemaVersion, storageWeekEnding: input.storageWeekEnding, modules: modulesFingerprintView(input.modules) };
  return createHash("sha256").update(canonicalize(view)).digest("hex");
}
