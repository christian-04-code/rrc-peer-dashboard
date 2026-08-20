import rigCountJson from "@/data/rigs/rig-count.json";
import type { RigDataset, RigStateData } from "@/lib/rigs/types";

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
