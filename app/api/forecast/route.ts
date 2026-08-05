import { NextResponse } from "next/server";
import { runForecastScenario } from "@/lib/forecast/engine";
import type { ForecastScenario } from "@/lib/forecast/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let scenario: ForecastScenario;
  try {
    scenario = (await request.json()) as ForecastScenario;
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 }
    );
  }

  if (!scenario || typeof scenario !== "object") {
    return NextResponse.json(
      { error: "A forecast scenario is required." },
      { status: 400 }
    );
  }

  try {
    const result = runForecastScenario(scenario);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Forecast calculation failed." },
      { status: 422 }
    );
  }
}
