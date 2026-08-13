"use client";

import { useState } from "react";
import { CompanySelector } from "@/components/dashboard/CompanySelector";
import { RrcScenarioWorkbench } from "@/components/forecast/RrcScenarioWorkbench";
import { useMarketData } from "@/lib/market/use-market-data";
import { extractLiveMarketMetricsFromMarketResponse, resolveCommoditySources } from "@/lib/forecast/live-market-prices";
import { defaultTicker, getCompany, selectableCompanies } from "@/lib/dashboard/company-registry";
import type { Ticker } from "@/lib/dashboard/types";

const FORECAST_SUPPORTED_TICKERS: ReadonlySet<Ticker> = new Set(["RRC", "AR", "CNX", "EQT"]);

/**
 * Opened from the top-nav Forecast tab. Reuses the existing deterministic forecast
 * engine and RrcScenarioWorkbench (a company-generic component despite its name) rather
 * than the old top-level peer-ranking page. AR, CNX, and EQT gained company-specific
 * deterministic models on feat/peer-forecast-ar-cnx-eqt; CRK, EXE, and GPOR remain
 * unsupported, so selecting one of those renders an explicit unsupported state instead
 * of a fabricated forecast.
 */
export function ForecastWorkspacePanel() {
  const [ticker, setTicker] = useState<Ticker>(defaultTicker);
  const market = useMarketData();
  const company = getCompany(ticker);
  const isSupported = FORECAST_SUPPORTED_TICKERS.has(ticker);

  return (
    <section className="forecast-panel" aria-label="Forecast">
      <section className="company-selector" aria-label="Forecast company selection">
        <CompanySelector companies={selectableCompanies} ticker={ticker} onSelect={setTicker} />
      </section>

      {isSupported ? (
        <RrcScenarioWorkbench
          key={ticker}
          company={ticker}
          currentMarketPrices={extractLiveMarketMetricsFromMarketResponse(market.data)}
          commoditySources={resolveCommoditySources(market.data)}
        />
      ) : (
        <div className="panel">
          <div className="panel-head">
            <h2>Forecast unavailable for {company.shortName}</h2>
          </div>
          <p className="muted">
            The deterministic forecast engine currently supports RRC only. {company.shortName} production, revenue,
            EBITDAX, free cash flow, and valuation outputs remain unavailable (&quot;--&quot;) until a company-specific
            model is built -- the interface does not fabricate a forecast for unsupported tickers.
          </p>
        </div>
      )}
    </section>
  );
}
