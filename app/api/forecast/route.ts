import { NextResponse } from "next/server";
import { getCompanyForecast, runCompanyForecast } from "@/lib/forecast/api";
import { ForecastRequestError } from "@/lib/forecast/companies/types";
import type { ForecastScenarioBody } from "@/lib/forecast/contracts";

export const dynamic = "force-dynamic";

function failure(error: unknown) {
  const status = error instanceof ForecastRequestError ? error.status : 400;
  return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to process forecast request." }, { status });
}

export async function GET(request: Request) {
  try {
    return NextResponse.json(getCompanyForecast(new URL(request.url).searchParams.get("company")));
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as ForecastScenarioBody;
    return NextResponse.json(runCompanyForecast(new URL(request.url).searchParams.get("company"), body));
  } catch (error) {
    return failure(error);
  }
}
