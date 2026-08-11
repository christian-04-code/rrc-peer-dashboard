import { getCompanyGuidanceSections } from "./guidance";
import type { Metric, Ticker } from "./types";

export type ChartGuidancePoint =
  | { kind: "point"; period: string; value: number; disclosure: string; target?: boolean }
  | { kind: "range"; period: string; low: number; high: number; disclosure: string; target?: boolean };

export type ChartGuidanceResult = {
  status: "provided" | "partial" | "not_provided";
  points: ChartGuidancePoint[];
};

type SafeDisclosure = {
  ticker: Ticker;
  metric: Metric;
  section: string;
  label: string;
  period: string;
  unit: "Bcfe/d";
  target?: boolean;
};

type ParsedGuidanceValue =
  | { kind: "point"; value: number }
  | { kind: "range"; low: number; high: number };

// This is deliberately an allowlist of disclosures that are explicit enough to place on
// a quarterly axis. Numeric values remain in data/guidance.json and are read through the
// existing guidance layer; annual totals, cadence language, and ambiguous periods stay blank.
const SAFE_DISCLOSURES: readonly SafeDisclosure[] = [
  { ticker: "RRC", metric: "production", section: "Production", label: "Q2 2026", period: "Q2 2026", unit: "Bcfe/d" },
  { ticker: "RRC", metric: "production", section: "Production", label: "Year-End 2026 Target", period: "Q4 2026", unit: "Bcfe/d", target: true },
  { ticker: "RRC", metric: "production", section: "Production", label: "Target", period: "Q4 2027", unit: "Bcfe/d", target: true },
  { ticker: "AR", metric: "production", section: "Production", label: "Q2 2026", period: "Q2 2026", unit: "Bcfe/d" },
  { ticker: "AR", metric: "production", section: "Production", label: "2027 Production Target", period: "Q4 2027", unit: "Bcfe/d", target: true }
];

const GUIDANCE_COVERAGE: Readonly<Record<string, "provided" | "partial">> = {
  "RRC:production": "partial",
  "AR:production": "partial"
};

/** Convert a disclosed daily Bcfe rate to the chart's MMcfe/d unit without changing precision. */
function parseBcfePerDay(value: string): ParsedGuidanceValue | null {
  const normalized = value.replaceAll(",", "");
  const numbers = [...normalized.matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0]) * 1_000);
  if (numbers.length === 0 || numbers.some((number) => !Number.isFinite(number))) return null;
  if (/[–-]|\bto\b/i.test(normalized) && numbers.length >= 2) {
    return { kind: "range", low: Math.min(numbers[0], numbers[1]), high: Math.max(numbers[0], numbers[1]) };
  }
  return { kind: "point", value: numbers[0] };
}

/** Resolve only safely chartable numeric management guidance for one company and metric. */
export function getChartGuidance(ticker: Ticker, metric: Metric): ChartGuidanceResult {
  const disclosures = SAFE_DISCLOSURES.filter((item) => item.ticker === ticker && item.metric === metric);
  if (disclosures.length === 0) return { status: "not_provided", points: [] };

  const sections = getCompanyGuidanceSections(ticker);
  const points = disclosures.flatMap<ChartGuidancePoint>((disclosure) => {
    const section = sections.find((candidate) => candidate.section === disclosure.section);
    const row = section?.rows.find((candidate) => candidate.kind === "pair" && candidate.label === disclosure.label);
    if (!row || row.kind !== "pair") return [];

    const parsed = disclosure.unit === "Bcfe/d" ? parseBcfePerDay(row.value) : null;
    if (!parsed) return [];
    return [{ ...parsed, period: disclosure.period, disclosure: `${row.label}: ${row.value}`, target: disclosure.target }];
  });

  if (points.length === 0) return { status: "not_provided", points: [] };
  const coverage = GUIDANCE_COVERAGE[`${ticker}:${metric}`] ?? "provided";
  return { status: points.length === disclosures.length ? coverage : "partial", points };
}

/** The chart toggle affects the guidance overlay only. */
export function getVisibleChartGuidance(result: ChartGuidanceResult, visible: boolean): ChartGuidancePoint[] {
  return visible ? result.points : [];
}
