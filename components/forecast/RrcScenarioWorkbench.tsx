"use client";

import { useEffect, useMemo, useState } from "react";
import { useMarketData } from "@/lib/market/use-market-data";
import {
  extractLiveMarketMetricsFromMarketResponse,
  resolveCommoditySources,
  type LiveMarketPricesInput,
  type ResolvedCommodityPrice
} from "@/lib/forecast/live-market-prices";
import type {
  RrcForecastYear,
  RrcAnnualForecastResult,
  ResolvedAnnualValue
} from "@/lib/forecast/scenarios/rrc-annual";
import type { GuidanceEntry } from "@/lib/forecast/guidance/types";

const YEARS: RrcForecastYear[] = ["2026", "2027", "2028"];

/** 2026 blends Q1/Q2 2026 immutable reported actuals with a Q3/Q4 2026 estimate; 2027/2028 are fully estimated years. */
function yearLabel(year: RrcForecastYear): string {
  return `${year}E`;
}

const PRESET_MULTIPLES = { bear: 4.5, base: 5.5, bull: 6.5 } as const;
type Preset = keyof typeof PRESET_MULTIPLES;

type ApiDefaults = {
  guidance: GuidanceEntry[];
  productionDefaults: Record<RrcForecastYear, ResolvedAnnualValue>;
  commodityProductionDefaults: Record<
    RrcForecastYear,
    { gasMmcfPerDay: ResolvedAnnualValue; nglMbblPerDay: ResolvedAnnualValue; oilMbblPerDay: ResolvedAnnualValue }
  >;
  capexDefaults: Record<RrcForecastYear, ResolvedAnnualValue>;
  currentNetDebtMillion: number | null;
  dilutedSharesMillion: number | null;
  result: RrcAnnualForecastResult;
};

type RrcScenarioWorkbenchProps = {
  /** Current main passes the already-normalized /api/market values from the dashboard. */
  currentMarketPrices?: LiveMarketPricesInput;
  commoditySources?: { wti: ResolvedCommodityPrice; henryHub: ResolvedCommodityPrice };
};

const EMPTY_YEAR_STRINGS = { "2026": "", "2027": "", "2028": "" } as Record<RrcForecastYear, string>;

function money(value: number | null, digits = 1) {
  return value === null || value === undefined ? "--" : `$${value.toFixed(digits)}`;
}

function num(value: number | null, digits = 2) {
  return value === null || value === undefined ? "--" : value.toFixed(digits);
}

function parsedOrUndefined(text: string): number | undefined {
  const trimmed = text.trim();
  if (trimmed === "") return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function bcfePerDay(totalMcfe: number | null): string {
  return totalMcfe === null ? "--" : num(totalMcfe / 365 / 1000, 2);
}

/** Compact info icon carrying its explanation in the native title attribute -- the same convention this dashboard already uses for source tooltips (see PeersPanel.tsx), rather than introducing a second popover component. */
function InfoTip({ text }: { text: string }) {
  return (
    <span className="info-tip" tabIndex={0} title={text} aria-label={text}>
      <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="8" cy="4.6" r="0.9" fill="currentColor" />
        <rect x="7.1" y="6.8" width="1.8" height="5" rx="0.6" fill="currentColor" />
      </svg>
    </span>
  );
}

const COMMODITY_SOURCE_LABELS = {
  current_market: "OilPriceAPI · Current Market",
  official_delayed: "EIA · Latest Official / Delayed",
  modeled: "Management Sensitivity · Modeled"
} as const;

function formatCommodityPrice(value: number | null, unit: string | null): string {
  return value === null ? "--" : `${value.toFixed(2)} ${unit ?? ""}`.trim();
}

function formatChange24h(percent: number | null): string | null {
  if (percent === null) return null;
  const sign = percent > 0 ? "+" : "";
  return `${sign}${percent.toFixed(2)}% 24h`;
}

function CommodityPriceCard({ label, data }: { label: string; data: ResolvedCommodityPrice }) {
  const change = formatChange24h(data.change24hPercent);
  return (
    <div className="wb-latest-stat">
      <span>{label}</span>
      <strong>{formatCommodityPrice(data.value, data.unit)}</strong>
      <small>{COMMODITY_SOURCE_LABELS[data.classification]}</small>
      {change ? <small>{change}</small> : null}
      <small className="muted">Model input for this scenario run</small>
    </div>
  );
}

export function RrcScenarioWorkbench({ currentMarketPrices, commoditySources: providedCommoditySources }: RrcScenarioWorkbenchProps = {}) {
  const market = useMarketData();
  const liveCommodity = useMemo(
    () => currentMarketPrices ?? extractLiveMarketMetricsFromMarketResponse(market.data),
    [currentMarketPrices, market.data]
  );
  const commoditySources = useMemo(
    () => providedCommoditySources ?? resolveCommoditySources(market.data),
    [providedCommoditySources, market.data]
  );

  const [defaults, setDefaults] = useState<ApiDefaults | null>(null);
  const [defaultResult, setDefaultResult] = useState<RrcAnnualForecastResult | null>(null);

  const [multiple, setMultiple] = useState<string>(String(PRESET_MULTIPLES.base));
  const [preset, setPreset] = useState<Preset>("base");
  const [forwardYear, setForwardYear] = useState<RrcForecastYear>("2027");

  const [gasProd, setGasProd] = useState<Record<RrcForecastYear, string>>({ ...EMPTY_YEAR_STRINGS });
  const [nglProd, setNglProd] = useState<Record<RrcForecastYear, string>>({ ...EMPTY_YEAR_STRINGS });
  const [oilProd, setOilProd] = useState<Record<RrcForecastYear, string>>({ ...EMPTY_YEAR_STRINGS });
  const [gasPrice, setGasPrice] = useState("");
  const [nglPrice, setNglPrice] = useState("");
  const [oilPrice, setOilPrice] = useState("");

  const [customResult, setCustomResult] = useState<RrcAnnualForecastResult | null>(null);
  const [customActive, setCustomActive] = useState(false);
  const [applyLoading, setApplyLoading] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const hasOverrideInput =
    YEARS.some((year) => gasProd[year].trim() !== "" || nglProd[year].trim() !== "" || oilProd[year].trim() !== "") ||
    gasPrice.trim() !== "" ||
    nglPrice.trim() !== "" ||
    oilPrice.trim() !== "";

  useEffect(() => {
    fetch("/api/rrc-scenarios")
      .then((response) => response.json())
      .then((data: ApiDefaults) => {
        setDefaults(data);
        setDefaultResult((current) => current ?? data.result);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => setMultiple(String(PRESET_MULTIPLES[preset])), [preset]);

  async function computeForecast(useOverrides: boolean): Promise<RrcAnnualForecastResult> {
    const response = await fetch("/api/rrc-scenarios", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        strategy: "maintenance",
        production: Object.fromEntries(
          YEARS.map((year) => [
            year,
            useOverrides
              ? {
                  gasMmcfPerDay: parsedOrUndefined(gasProd[year]),
                  nglMbblPerDay: parsedOrUndefined(nglProd[year]),
                  oilMbblPerDay: parsedOrUndefined(oilProd[year])
                }
              : {}
          ])
        ),
        costs: {},
        capex: {},
        pricing: {},
        customCommodity: useOverrides
          ? {
              henryHubPerMmbtu: parsedOrUndefined(gasPrice),
              wtiPerBbl: parsedOrUndefined(oilPrice),
              nglPerBbl: parsedOrUndefined(nglPrice)
            }
          : {},
        liveCommodity,
        valuation: { targetEvToEbitdax: parsedOrUndefined(multiple) ?? PRESET_MULTIPLES[preset], forwardYear }
      })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Forecast calculation failed.");
    return payload.result as RrcAnnualForecastResult;
  }

  // Default Forecast recomputes automatically -- no user action required -- whenever live
  // market pricing resolves/changes or the forward year / target multiple change.
  useEffect(() => {
    let cancelled = false;
    computeForecast(false)
      .then((result) => {
        if (!cancelled) setDefaultResult(result);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveCommodity, multiple, forwardYear]);

  async function applyOverrides() {
    setApplyLoading(true);
    setApplyError(null);
    try {
      const result = await computeForecast(true);
      setCustomResult(result);
      setCustomActive(true);
    } catch (cause) {
      setApplyError(cause instanceof Error ? cause.message : "Forecast calculation failed.");
    } finally {
      setApplyLoading(false);
    }
  }

  function resetToDefault() {
    setGasProd({ ...EMPTY_YEAR_STRINGS });
    setNglProd({ ...EMPTY_YEAR_STRINGS });
    setOilProd({ ...EMPTY_YEAR_STRINGS });
    setGasPrice("");
    setNglPrice("");
    setOilPrice("");
    setCustomActive(false);
    setCustomResult(null);
    setApplyError(null);
  }

  const result = customActive ? customResult ?? defaultResult : defaultResult;

  return (
    <main className="forecast-panel" style={{ maxWidth: 1180, margin: "0 auto", padding: "24px" }}>
      <header className="forecast-head">
        <div>
          <h1>Forecast</h1>
          <p>Range Resources (RRC) -- updates automatically from the latest reported actuals, management guidance, and current market pricing.</p>
        </div>
      </header>

      <div className="wb-context-row">
        <span className="badge">
          Latest Reported
          <InfoTip text="Q1 and Q2 2026 are completed, reported quarters and are never overwritten by forecast assumptions -- 2026E always equals those two actual quarters plus a Q3/Q4 estimate." />
        </span>
        <span className="badge">
          Management Guidance
          <InfoTip text="Used automatically where RRC has explicitly guided a metric for the current cycle. Metrics management did not guide fall back to existing modeled/reported methodology -- nothing is invented." />
        </span>
        <span className="badge">
          Market Pricing
          <InfoTip text="Henry Hub and WTI use OilPriceAPI's current market quote (EIA latest-official as fallback), held flat across 2026E-2028E -- this is not an approved forward curve. Enter your own price view in Customize Production & Prices below." />
        </span>
      </div>

      <section className="wb-section">
        <div className="wb-section-head">
          <h2>{customActive ? "Forecast (custom overrides applied)" : "Default Forecast"}</h2>
          {applyLoading ? <span className="muted" style={{ fontSize: 12 }}>Updating…</span> : null}
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="forecast-table">
            <thead>
              <tr>
                <th align="left">Metric</th>
                {YEARS.map((year) => (
                  <th key={year} align="right">{yearLabel(year)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  Total Production (Bcfe/d)
                  <InfoTip text="Management's guided total production target when available, else the latest reported total held flat. Gas/NGL/oil mix follows the latest reported product split unless overridden below." />
                </td>
                {YEARS.map((year) => (
                  <td key={year} align="right">{result ? bcfePerDay(result.annual[year].production.totalMcfe) : "--"}</td>
                ))}
              </tr>
              <tr>
                <td>
                  Revenue
                  <InfoTip text="Production times realized commodity price (benchmark plus differential plus hedge impact) for gas, NGL, and oil, summed." />
                </td>
                {YEARS.map((year) => (
                  <td key={year} align="right">{result ? money(result.annual[year].revenueMillion) : "--"}</td>
                ))}
              </tr>
              <tr>
                <td>
                  Adjusted EBITDAX
                  <InfoTip text="Revenue less modeled cash operating costs (LOE, gathering/transport, G&A, production taxes), per the existing cost methodology." />
                </td>
                {YEARS.map((year) => (
                  <td key={year} align="right">{result ? money(result.annual[year].ebitdaxMillion) : "--"}</td>
                ))}
              </tr>
              <tr>
                <td>
                  CapEx
                  <InfoTip text="Q1/Q2 2026 use actual reported CapEx. Forecast periods use management's guided capital budget where available, else a modeled continuation of the current run-rate." />
                </td>
                {YEARS.map((year) => (
                  <td key={year} align="right">{result ? money(result.annual[year].capexMillion) : "--"}</td>
                ))}
              </tr>
              <tr>
                <td>
                  Free Cash Flow
                  <InfoTip text="EBITDAX less cash interest, cash taxes, and CapEx. No separate working-capital adjustment is layered on top." />
                </td>
                {YEARS.map((year) => (
                  <td key={year} align="right">{result ? money(result.annual[year].freeCashFlowMillion) : "--"}</td>
                ))}
              </tr>
              <tr>
                <td>
                  Ending Net Debt
                  <InfoTip text="Beginning net debt rolled forward by free cash flow (less dividends) each quarter. 2026 Q1/Q2 use the actual reported net debt directly, not a rolled-forward estimate." />
                </td>
                {YEARS.map((year) => (
                  <td key={year} align="right">{result ? money(result.annual[year].endingNetDebtMillion) : "--"}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <details className="ann-details">
        <summary>
          Customize Production &amp; Prices
          <InfoTip text="Optional hardcoded overrides on top of the Default Forecast. Only the values you enter here change -- every other assumption keeps using Default Forecast logic." />
        </summary>

        <div className="wb-gap-top">
          <h3 className="wb-group-title">Production (daily rate)</h3>
          <p className="muted panel-note" style={{ marginTop: -4 }}>
            For 2026E this sets the Q3/Q4 rate -- Q1/Q2 actuals are always preserved. Leave a field blank to keep the Default Forecast rate for that commodity.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table className="forecast-table ann-guidance-table">
              <thead>
                <tr>
                  <th align="left">Commodity</th>
                  {YEARS.map((year) => (
                    <th key={year} align="right">{yearLabel(year)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th align="left">Natural Gas (MMcf/d)</th>
                  {YEARS.map((year) => (
                    <td key={year} align="right">
                      <input
                        type="number"
                        step="1"
                        placeholder={num(defaults?.commodityProductionDefaults[year]?.gasMmcfPerDay.value ?? null, 0)}
                        value={gasProd[year]}
                        onChange={(event) => setGasProd((prev) => ({ ...prev, [year]: event.target.value }))}
                      />
                    </td>
                  ))}
                </tr>
                <tr>
                  <th align="left">NGL (Mbbl/d)</th>
                  {YEARS.map((year) => (
                    <td key={year} align="right">
                      <input
                        type="number"
                        step="0.1"
                        placeholder={num(defaults?.commodityProductionDefaults[year]?.nglMbblPerDay.value ?? null, 1)}
                        value={nglProd[year]}
                        onChange={(event) => setNglProd((prev) => ({ ...prev, [year]: event.target.value }))}
                      />
                    </td>
                  ))}
                </tr>
                <tr>
                  <th align="left">Oil / Condensate (Mbbl/d)</th>
                  {YEARS.map((year) => (
                    <td key={year} align="right">
                      <input
                        type="number"
                        step="0.1"
                        placeholder={num(defaults?.commodityProductionDefaults[year]?.oilMbblPerDay.value ?? null, 1)}
                        value={oilProd[year]}
                        onChange={(event) => setOilProd((prev) => ({ ...prev, [year]: event.target.value }))}
                      />
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="muted panel-note">
            Overriding one or two commodities produces a resulting total production that may differ from management&apos;s guided total -- the Default Forecast table above always shows the actual resulting total.
          </p>
        </div>

        <div className="wb-gap-top">
          <h3 className="wb-group-title">Commodity Prices</h3>
          <p className="muted panel-note" style={{ marginTop: -4 }}>
            Applies flat across 2026E-2028E, matching the Default Forecast&apos;s current-market methodology -- this model does not project a forward curve.
          </p>
          <div className="wb-latest-stats" style={{ marginBottom: 10 }}>
            <CommodityPriceCard label="Henry Hub" data={commoditySources.henryHub} />
            <CommodityPriceCard label="WTI" data={commoditySources.wti} />
          </div>
          <div className="ann-year-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))" }}>
            <label className="wb-field">
              Natural Gas Price ($/MMBtu)
              <input type="number" step="0.01" placeholder="Default: current market" value={gasPrice} onChange={(event) => setGasPrice(event.target.value)} />
            </label>
            <label className="wb-field">
              NGL Price ($/bbl)
              <input type="number" step="0.01" placeholder="Default: modeled from WTI" value={nglPrice} onChange={(event) => setNglPrice(event.target.value)} />
            </label>
            <label className="wb-field">
              Oil Price ($/bbl)
              <input type="number" step="0.01" placeholder="Default: current market" value={oilPrice} onChange={(event) => setOilPrice(event.target.value)} />
            </label>
          </div>
          <p className="muted panel-note">No approved public forward-price curve is wired into this model. Range employees with internal forward assumptions can hardcode them here.</p>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button className="wb-btn-primary" onClick={() => void applyOverrides()} disabled={applyLoading}>
            {applyLoading ? "Applying…" : "Apply overrides"}
          </button>
          <button className="wb-btn-secondary" onClick={resetToDefault} disabled={!customActive && !hasOverrideInput}>
            Reset to Default
          </button>
        </div>
        {applyError ? <p role="alert" className="muted" style={{ color: "var(--negative)" }}>{applyError}</p> : null}
      </details>

      <section className="wb-section">
        <div className="wb-section-head">
          <h2>
            Valuation
            <InfoTip text="Enterprise value = forward-year EBITDAX x target multiple. Equity value = enterprise value minus net debt (floored at $0). Implied share price = equity value / diluted shares." />
          </h2>
        </div>
        <div className="wb-groups">
          <div className="wb-group">
            <label className="wb-field">
              Forward EBITDAX Year
              <select value={forwardYear} onChange={(event) => setForwardYear(event.target.value as RrcForecastYear)}>
                {YEARS.map((year) => (
                  <option key={year} value={year}>{yearLabel(year)}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="wb-group">
            <label className="wb-field">
              Scenario preset
              <select value={preset} onChange={(event) => setPreset(event.target.value as Preset)}>
                <option value="bear">Bear</option>
                <option value="base">Base</option>
                <option value="bull">Bull</option>
              </select>
            </label>
            <label className="wb-field">
              Target EV / EBITDAX
              <span className="wb-suffix-input">
                <input type="number" step="0.1" value={multiple} onChange={(event) => setMultiple(event.target.value)} />
                <span>x</span>
              </span>
            </label>
          </div>
        </div>

        {result ? (
          <>
            <section className="wb-result-grid wb-gap-top">
              <div className="wb-result-card"><small>{result.valuation.forwardYear}E EBITDAX x multiple</small><strong>{money(result.valuation.forwardEbitdaxMillion)} <small style={{ fontWeight: 400 }}>at {multiple}x</small></strong></div>
              <div className="wb-result-card"><small>Enterprise value</small><strong>{money(result.valuation.enterpriseValueMillion)}</strong></div>
              <div className="wb-result-card"><small>Net debt ({result.valuation.netDebtPeriod})</small><strong>{money(result.valuation.netDebtMillion)}</strong></div>
              <div className="wb-result-card"><small>Equity value</small><strong>{money(result.valuation.equityValueMillion)}</strong></div>
              <div className="wb-result-card"><small>Implied share price</small><strong>{money(result.valuation.impliedSharePrice, 2)}</strong></div>
            </section>
            {result.valuation.warnings.length > 0 ? <p className="muted panel-note">{result.valuation.warnings.join(" ")}</p> : null}

            <details className="ann-details wb-gap-top">
              <summary>
                Secondary: DCF
                <InfoTip text="A secondary discounted-cash-flow cross-check using today's reported net debt, not a future ending net debt. EV/EBITDAX above remains the primary valuation method." />
              </summary>
              <section className="wb-result-grid" style={{ marginTop: 10 }}>
                <div className="wb-result-card"><small>DCF enterprise value</small><strong>{money(result.dcf.enterpriseValueMillion)}</strong></div>
                <div className="wb-result-card"><small>DCF equity value</small><strong>{money(result.dcf.equityValueMillion)}</strong></div>
                <div className="wb-result-card"><small>DCF implied share price</small><strong>{money(result.dcf.impliedSharePrice, 2)}</strong></div>
              </section>
            </details>
          </>
        ) : null}
      </section>

      <p style={{ fontSize: 12, opacity: 0.65 }}>
        Historical/reported periods are immutable. Unsupported or missing values render &quot;--&quot;; nothing is fabricated.
      </p>
    </main>
  );
}
