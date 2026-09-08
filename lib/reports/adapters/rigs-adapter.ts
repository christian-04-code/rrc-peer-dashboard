import { getRigDataset, getRigBasin } from "@/lib/rigs/rig-data";
import { calculateFreshness } from "@/lib/market/macro-analytics";
import type { RigDelta } from "@/lib/rigs/types";
import { compareRigDelta } from "@/lib/reports/comparisons";
import type { SourceManifestEntry, WeeklyEvidenceItem } from "@/lib/reports/weekly-report-types";

/**
 * Baker Hughes weekly rig count (category "rigs"), read directly from the
 * static import (lib/rigs/rig-data.ts, backed by scripts/rigs/import.py --
 * see docs/rig-count-import.md), which already carries its own precomputed
 * WoW/YoY deltas per basin/state (RigDelta). Deliberately narrow: national
 * U.S. plus the two basins actually relevant to Range/Appalachia
 * (Marcellus, Utica) -- not all 15 tracked basins, to avoid diluting the
 * report with basins that have no plausible Range relevance (Permian,
 * Eagle Ford, Williston, etc. stay in the interactive dashboard, not this
 * weekly snapshot).
 */

const RELEVANT_BASINS = ["Marcellus", "Utica"] as const;

function unitedStatesDisplay(value: number | null): string {
  return value === null ? "--" : `${value.toLocaleString("en-US")} rigs`;
}

function itemFromDelta(evidenceId: string, metricKey: string, label: string, delta: RigDelta, reportDate: string, freshness: "current" | "lagged" | "stale" | "unavailable", driver: string): WeeklyEvidenceItem {
  return {
    evidenceId,
    category: "rigs",
    metricKey,
    label,
    currentValue: delta.current,
    displayValue: unitedStatesDisplay(delta.current),
    unit: "rigs",
    period: reportDate,
    asOfDate: reportDate,
    sourceIds: ["rigs_baker_hughes"],
    freshness,
    comparisons: compareRigDelta(delta, metricKey, label, reportDate),
    rangeDrivers: [driver],
    materialityInputs: { isNewThisWeek: false, changedSincePreviousReport: false, riskSeverityRank: null, riskState: null, rangeImpactDirection: null, rangeImpactStrength: null, comparisonMagnitudePct: null },
    metadata: { reportDate }
  };
}

export type RigsCollection = {
  items: WeeklyEvidenceItem[];
  manifestEntries: SourceManifestEntry[];
  present: boolean;
};

export function collectRigsEvidence(now = new Date()): RigsCollection {
  let dataset: ReturnType<typeof getRigDataset>;
  try {
    dataset = getRigDataset();
  } catch {
    return { items: [], manifestEntries: [{ key: "rigs_baker_hughes", label: "Baker Hughes North America rig count", period: null, freshness: "unavailable", included: false }], present: false };
  }

  const reportDate = dataset.source.reportDate;
  const freshness = calculateFreshness(reportDate, "weekly", now);
  const items: WeeklyEvidenceItem[] = [
    itemFromDelta("rigs:national_us", "national_us", "U.S. Rig Count", dataset.national.unitedStates, reportDate, freshness, "us_gas_supply")
  ];

  for (const basinName of RELEVANT_BASINS) {
    const basin = getRigBasin(basinName);
    if (!basin) continue;
    items.push(
      itemFromDelta(
        `rigs:basin_${basinName.toLowerCase()}`,
        `basin_${basinName.toLowerCase()}`,
        `${basinName} Rig Count`,
        basin,
        reportDate,
        freshness,
        "appalachia_supply"
      )
    );
  }

  const manifestEntries: SourceManifestEntry[] = [
    { key: "rigs_baker_hughes", label: "Baker Hughes North America rig count", period: reportDate, freshness, included: true }
  ];

  return { items, manifestEntries, present: items.length > 0 };
}
