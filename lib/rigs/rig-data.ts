import rigCountJson from "@/data/rigs/rig-count.json";
import type { RigBasinDetail, RigDataset, RigStateData } from "@/lib/rigs/types";

const dataset = rigCountJson as unknown as RigDataset;

export function getRigDataset(): RigDataset {
  return dataset;
}

export function getRigState(stateCode: string): RigStateData | null {
  return dataset.states[stateCode.toUpperCase()] ?? null;
}

export function isRigStateTracked(stateCode: string): boolean {
  return stateCode.toUpperCase() in dataset.states;
}

export function getTrackedRigStateCodes(): string[] {
  return Object.keys(dataset.states);
}

export function getRigStateMax(): number {
  return Math.max(0, ...Object.values(dataset.states).map((state) => state.current ?? 0));
}

export function getRigBasin(basinName: string): RigBasinDetail | null {
  return dataset.basins[basinName] ?? null;
}

export function getRigBasinNames(): string[] {
  return Object.keys(dataset.basins);
}

/** All basins with current rig count > 0, sorted descending by current rig count. */
export function getRankedRigBasins(): RigBasinDetail[] {
  return Object.values(dataset.basins)
    .filter((basin) => (basin.current ?? 0) > 0)
    .sort((left, right) => (right.current ?? 0) - (left.current ?? 0));
}

/** The N largest basins by current rig count -- the default "major basin" view. */
export function getTopRigBasins(count: number): RigBasinDetail[] {
  return getRankedRigBasins().slice(0, count);
}
