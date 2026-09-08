import type { ComparisonDirection } from "@/lib/reports/weekly-report-types";

/**
 * Shared "signed percentage" annotation used by table-builder.ts (At a
 * Glance comparison tags) and evidence-sections.ts (STEO vintage deltas).
 * Both previously built this inline with a leading Unicode arrow
 * (↑/↓/→) -- a real Preview PDF showed every one of those glyphs render
 * as a blank gap: `@sparticuz/chromium`'s bundled fonts on Vercel's
 * serverless Linux runtime don't cover the arrow code points, so "up 3.6%"
 * silently printed as "  3.6%" with no directional indicator at all (the
 * exact defect flagged in the Phase 7 release review). A leading algebraic
 * sign is both guaranteed-renderable ASCII and the more standard financial-
 * report convention anyway, and doubles as the "minus sign for a decline"
 * the review also asked for.
 */
export function formatSignedPct(deltaPct: number, direction: Exclude<ComparisonDirection, "unavailable">): string {
  if (direction === "flat") return "flat";
  const sign = direction === "up" ? "+" : "-";
  return `${sign}${Math.abs(deltaPct).toFixed(1)}%`;
}
