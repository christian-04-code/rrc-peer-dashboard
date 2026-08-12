import type {
  ForecastCapability,
  ForecastCompanyMetadata,
  ForecastGetResponse,
  ForecastPostResponse,
  ForecastScenarioBody
} from "@/lib/forecast/contracts";

export type ForecastAdapterConfiguration = {
  latestDetailedActualPeriod: string | null;
  guidance: readonly unknown[] | null;
  defaults: {
    production: ForecastCapability;
    pricing: ForecastCapability;
    costs: ForecastCapability;
    capex: ForecastCapability;
  };
  balanceSheet: {
    netDebtMillion: number | null;
    dilutedSharesMillion: number | null;
    status: ForecastCapability;
  };
  hedges: ForecastCapability;
  valuationPresets: Readonly<Record<string, number>>;
  sourceMetadata: { warnings: string[] };
};

export interface ForecastCompanyAdapter<TResult = unknown> {
  readonly metadata: ForecastCompanyMetadata;
  readonly configuration: ForecastAdapterConfiguration;
  getForecast(): ForecastGetResponse<TResult>;
  runForecast(body: ForecastScenarioBody): ForecastPostResponse<TResult>;
  getLegacyDefaults?(): Record<string, unknown>;
  runLegacyForecast?(body: ForecastScenarioBody): Record<string, unknown>;
}

export class ForecastRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ForecastRequestError";
  }
}
