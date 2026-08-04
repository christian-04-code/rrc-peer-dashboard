import type { HedgePosition } from "@/lib/forecast/hedges";

export type RrcHedgeBook = {
  asOf: string;
  source: string;
  positions: HedgePosition[];
  notes: string[];
};

/**
 * Source-backed hedge-book container for RRC.
 *
 * The Q1 2026 10-Q reports that more than 35% of projected natural-gas
 * production for the remainder of 2026 was hedged, but the exact contract
 * rows must be loaded from the filing's derivative tables before the model
 * calculates quarterly settlement impacts. Until those rows are entered,
 * positions remains empty rather than fabricating volumes or strikes.
 */
export const rrcHedgeBookQ1_2026: RrcHedgeBook = {
  asOf: "2026-03-31",
  source: "Range Resources Form 10-Q for the quarter ended March 31, 2026, Note 7 — Derivative Activities",
  positions: [],
  notes: [
    "Range disclosed that more than 35% of projected natural-gas production for the remainder of 2026 was hedged.",
    "Exact swap, collar, three-way collar, and basis-swap rows must be loaded from the derivative tables before settlement impacts are calculated.",
    "Do not allocate the aggregate hedged percentage across quarters without contract-level support."
  ]
};
