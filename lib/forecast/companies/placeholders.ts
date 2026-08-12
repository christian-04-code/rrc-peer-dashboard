import rawRegistry from "@/config/companies.json";
import type { Ticker } from "@/lib/dashboard/types";
import type { ForecastCompanyMetadata, ForecastScenarioBody } from "@/lib/forecast/contracts";
import type { ForecastCompanyAdapter } from "@/lib/forecast/companies/types";
import { ForecastRequestError } from "@/lib/forecast/companies/types";

const UNITS = {
  gasRate: "MMcf/d",
  liquidsRate: "Mbbl/d",
  combinedRate: "Bcfe/d",
  money: "$MM",
  gasPrice: "$/MMBtu",
  liquidsPrice: "$/bbl"
} as const;

export function createUnsupportedForecastAdapter(ticker: Exclude<Ticker, "RRC">): ForecastCompanyAdapter {
  const company = rawRegistry.companies[ticker];
  const warning = `${company.shortName} does not yet have a company-specific deterministic forecast model.`;
  const unavailable = { status: "unavailable", warning } as const;
  const metadata: ForecastCompanyMetadata = {
    ticker,
    name: company.name,
    shortName: company.shortName,
    supported: false,
    units: UNITS,
    periods: null,
    productStreams: [],
    capabilities: {
      guidance: unavailable,
      balanceSheet: unavailable,
      hedges: unavailable,
      valuation: unavailable
    },
    warnings: [warning]
  };

  return {
    metadata,
    configuration: {
      latestDetailedActualPeriod: null,
      guidance: null,
      defaults: { production: unavailable, pricing: unavailable, costs: unavailable, capex: unavailable },
      balanceSheet: { netDebtMillion: null, dilutedSharesMillion: null, status: unavailable },
      hedges: unavailable,
      valuationPresets: {},
      sourceMetadata: { warnings: [warning] }
    },
    getForecast: () => ({ company: metadata, provenanceClasses: [], defaults: null, result: null, warnings: [warning] }),
    runForecast: (_body: ForecastScenarioBody) => {
      throw new ForecastRequestError(warning, 422);
    }
  };
}
