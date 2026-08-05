import { NextResponse } from "next/server";
import { runRrcValuedScenario, type RrcValuationAssumptions } from "@/lib/forecast/scenarios/rrc-valued";
import { latestReportedProduction, type RrcPost2027Strategy } from "@/lib/forecast/scenarios/rrc-complete";
import type { ProductionOverrideInput } from "@/lib/forecast/production-engine";

export const dynamic = "force-dynamic";

const PRESETS = {
  bear: { targetEvToEbitdax: 4.5, discountRate: 0.12, terminalGrowthRate: -0.01 },
  base: { targetEvToEbitdax: 5.5, discountRate: 0.1, terminalGrowthRate: 0 },
  bull: { targetEvToEbitdax: 6.5, discountRate: 0.09, terminalGrowthRate: 0.01 }
} satisfies Record<string, RrcValuationAssumptions>;

type ScenarioRequest = {
  preset?: keyof typeof PRESETS;
  strategy?: RrcPost2027Strategy;
  assumptions?: Partial<RrcValuationAssumptions>;
  productionMode?: "reported" | "override";
  productionOverrides?: ProductionOverrideInput[];
};

function validNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

const LATEST_REPORTED_PRODUCTION_SUMMARY = {
  period: latestReportedProduction.period,
  sourceLabel: `Latest reported production — Q1 2026 10-Q`,
  gasMmcfPerDay: latestReportedProduction.gasMmcfPerDay.value,
  nglMbblPerDay: latestReportedProduction.nglMbblPerDay.value,
  oilMbblPerDay: latestReportedProduction.oilMbblPerDay.value
};

function sanitizeOverrides(mode: unknown, overrides: unknown): ProductionOverrideInput[] {
  if (mode !== "override" || !Array.isArray(overrides)) return [];
  return overrides.filter(
    (row): row is ProductionOverrideInput => typeof row === "object" && row !== null && typeof (row as { period?: unknown }).period === "string"
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ScenarioRequest;
    const preset = body.preset && body.preset in PRESETS ? body.preset : "base";
    const strategy = body.strategy === "continued-growth" ? "continued-growth" : "maintenance";
    const base = PRESETS[preset];
    const assumptions: RrcValuationAssumptions = {
      targetEvToEbitdax: validNumber(body.assumptions?.targetEvToEbitdax)
        ? body.assumptions.targetEvToEbitdax
        : base.targetEvToEbitdax,
      discountRate: validNumber(body.assumptions?.discountRate)
        ? body.assumptions.discountRate
        : base.discountRate,
      terminalGrowthRate: validNumber(body.assumptions?.terminalGrowthRate)
        ? body.assumptions.terminalGrowthRate
        : base.terminalGrowthRate
    };
    const productionOverrides = sanitizeOverrides(body.productionMode, body.productionOverrides);

    return NextResponse.json({
      preset,
      latestReportedProduction: LATEST_REPORTED_PRODUCTION_SUMMARY,
      result: runRrcValuedScenario(strategy, assumptions, { productionOverrides })
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to calculate RRC scenario." },
      { status: 400 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    presets: PRESETS,
    latestReportedProduction: LATEST_REPORTED_PRODUCTION_SUMMARY,
    maintenance: runRrcValuedScenario("maintenance", PRESETS.base),
    continuedGrowth: runRrcValuedScenario("continued-growth", PRESETS.base)
  });
}
