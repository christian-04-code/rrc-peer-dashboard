import { getForecastCompanyAdapter } from "@/lib/forecast/companies";
import type { ForecastScenarioBody } from "@/lib/forecast/contracts";

export function getCompanyForecast(company: string | null) {
  return getForecastCompanyAdapter(company).getForecast();
}

export function runCompanyForecast(company: string | null, body: ForecastScenarioBody) {
  return getForecastCompanyAdapter(company).runForecast(body);
}
