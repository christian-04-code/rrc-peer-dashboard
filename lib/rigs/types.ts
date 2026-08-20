/**
 * Baker Hughes North America rig count -- static snapshot types.
 *
 * Source: the Baker Hughes "North America Rig Count Report" workbook, imported
 * by scripts/rigs/import.py into data/rigs/rig-count.json (see docs/rig-count-import.md
 * for the update workflow). Every number here is a value stored in that workbook
 * (or a straightforward sum/lookup over it); nothing is estimated or interpolated.
 */

export type RigDelta = {
  current: number | null;
  priorWeek: number | null;
  wow: number | null;
  wowPct: number | null;
  yearAgo: number | null;
  yoy: number | null;
  yoyPct: number | null;
};

export type RigHistoryPoint = { period: string; value: number };

export type RigCommodityMix = { gas: number; oil: number; misc: number };
export type RigTrajectoryMix = { horizontal: number; directional: number; vertical: number };

export type RigTopCounty = {
  county: string;
  rigs: number;
  dominantBasin: string;
  dominantDrillFor: string;
};

export type RigStateData = RigDelta & {
  stateName: string;
  commodityMix: RigCommodityMix;
  trajectoryMix: RigTrajectoryMix;
  topCounties: RigTopCounty[];
  /** Weekly observations, newest first, up to the last 52 published weeks (~12 months). */
  history: RigHistoryPoint[];
};

export type RigBasinData = RigDelta & { basin: string };

export type RigDataset = {
  schemaVersion: 1;
  source: {
    provider: "Baker Hughes";
    report: "North America Rotary Rig Count";
    reportDate: string;
    workbook: string;
    workbookSha256: string;
  };
  national: { unitedStates: RigDelta; canada: RigDelta; northAmerica: RigDelta };
  usDrillFor: { gas: RigDelta; oil: RigDelta; miscellaneous: RigDelta };
  usTrajectory: { directional: RigDelta; horizontal: RigDelta; vertical: RigDelta };
  usBasins: RigBasinData[];
  trackedStateCount: number;
  states: Record<string, RigStateData>;
};
