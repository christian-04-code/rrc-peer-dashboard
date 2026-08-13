import type { Ticker } from "@/lib/dashboard/types";
import type { ForecastCompanyAdapter } from "@/lib/forecast/companies/types";
import { ForecastRequestError } from "@/lib/forecast/companies/types";
import { rrcForecastAdapter } from "@/lib/forecast/companies/rrc";
import { arForecastAdapter } from "@/lib/forecast/companies/ar";
import { cnxForecastAdapter } from "@/lib/forecast/companies/cnx";
import { eqtForecastAdapter } from "@/lib/forecast/companies/eqt";
import { crkForecastAdapter } from "@/lib/forecast/companies/crk";
import { exeForecastAdapter } from "@/lib/forecast/companies/exe";
import { gporForecastAdapter } from "@/lib/forecast/companies/gpor";

const adapters: Record<Ticker, ForecastCompanyAdapter> = {
  RRC: rrcForecastAdapter,
  AR: arForecastAdapter,
  CNX: cnxForecastAdapter,
  CRK: crkForecastAdapter,
  EQT: eqtForecastAdapter,
  EXE: exeForecastAdapter,
  GPOR: gporForecastAdapter
};

function isForecastTicker(value: string): value is Ticker {
  return value in adapters;
}

export function getForecastCompanyAdapter(company: string | null): ForecastCompanyAdapter {
  const ticker = (company ?? "").trim().toUpperCase();
  if (!ticker) throw new ForecastRequestError("The company query parameter is required.", 400);
  if (!isForecastTicker(ticker)) throw new ForecastRequestError(`Unknown company ticker: ${ticker}`, 404);
  return adapters[ticker];
}
