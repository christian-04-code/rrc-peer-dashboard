import { NextResponse } from "next/server";
import { ForecastRequestError } from "@/lib/forecast/companies/types";
import { getRrcLegacyDefaults, runRrcLegacyForecast } from "@/lib/forecast/companies/rrc";
import type { ForecastScenarioBody } from "@/lib/forecast/contracts";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getRrcLegacyDefaults());
}

export async function POST(request: Request) {
  try {
    return NextResponse.json(runRrcLegacyForecast((await request.json()) as ForecastScenarioBody));
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to calculate RRC scenario." },
      { status: error instanceof ForecastRequestError ? error.status : 400 }
    );
  }
}
