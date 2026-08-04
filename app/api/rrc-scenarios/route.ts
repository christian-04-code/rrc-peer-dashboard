import { NextResponse } from "next/server";
import { runRrcValuedScenario, type RrcValuationAssumptions } from "@/lib/forecast/scenarios/rrc-valued";
import type { RrcPost2027Strategy } from "@/lib/forecast/scenarios/rrc-complete";

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
};

function validNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
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

    return NextResponse.json({
      preset,
      result: runRrcValuedScenario(strategy, assumptions)
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
    maintenance: runRrcValuedScenario("maintenance", PRESETS.base),
    continuedGrowth: runRrcValuedScenario("continued-growth", PRESETS.base)
  });
}
