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
import type { Ticker } from "@/lib/dashboard/types";

/** Annual columns are estimates; the first year may blend immutable reported quarters with forecast quarters. */
function yearLabel(year: string): string {
  return `${year}E`;
}

type Preset = "bear" | "base" | "bull";

type ApiDefaults = {
  guidance: GuidanceEntry[];
  latestActualPeriod?: string;
  productionDefaults: Record<string, ResolvedAnnualValue>;
  commodityProductionDefaults: Record<
    string,
    { gasMmcfPerDay: ResolvedAnnualValue; nglMbblPerDay: ResolvedAnnualValue; oilMbblPerDay: ResolvedAnnualValue }
  >;
  capexDefaults: Record<string, ResolvedAnnualValue>;
  currentNetDebtMillion: number | null;
  dilutedSharesMillion: number | null;
  valuationPresets: Record<Preset, number>;
  result: RrcAnnualForecastResult;
};

type RrcScenarioWorkbenchProps = {
  company?: Ticker;
  /** Current main passes the already-normalized /api/market values from the dashboard. */
  currentMarketPrices?: LiveMarketPricesInput;
  commoditySources?: { wti: ResolvedCommodityPrice; henryHub: ResolvedCommodityPrice };
};

type GenericDefaultsResponse = {
  company: { ticker: Ticker; periods: { latestActualPeriod: string; latestDetailedActualPeriod: string; forecastYears: string[]; defaultForwardYear: string } | null };
  defaults: Omit<ApiDefaults, "result">;
  result: RrcAnnualForecastResult;
};

function emptyYearStrings(years: readonly string[]): Record<string, string> {
  return Object.fromEntries(years.map((year) => [year, ""]));
}

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

/** "2026Q2" -> "Q2 2026" */
function formatPeriodLabel(period: string | undefined): string {
  if (!period || !/^\d{4}Q[1-4]$/.test(period)) return "--";
  return `${period.slice(4)} ${period.slice(0, 4)}`;
}

type TooltipPlacement = "top" | "bottom";

/**
 * Working hover/focus tooltip. The dashboard has no existing reusable tooltip/popover
 * component (only ad hoc native `title` attributes elsewhere), and a native title tooltip
 * is exactly what previously failed to display reliably here -- so this is a small
 * CSS-driven popover (hover + :focus-within, no JS state) reusing the dashboard's existing
 * panel/border/text tokens, applied consistently everywhere an info icon appears.
 */
function InfoTip({ text, placement = "top", align = "center" }: { text: string; placement?: TooltipPlacement; align?: "center" | "left" }) {
  return (
    <span className={`info-tip info-tip--${placement}${align === "left" ? " info-tip--left" : ""}`}>
      <button
        type="button"
        className="info-tip-trigger"
        aria-label={text}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        i
      </button>
      <span className="info-tip-bubble" role="tooltip">{text}</span>
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

/** Reuses the dashboard's existing positive/negative semantic color classes (see app/globals.css) rather than hardcoding a color. */
function change24hClass(percent: number | null): string | undefined {
  if (percent === null || percent === 0) return undefined;
  return percent > 0 ? "positive" : "negative";
}

/** The benchmark name (label) is now shown in the enclosing price card's header row (see wb-price-card-head) instead of as its own line here, so the card body starts directly with the price. */
function CommodityPriceCard({ label, data }: { label: string; data: ResolvedCommodityPrice }) {
  const change = formatChange24h(data.change24hPercent);
  return (
    <div className="wb-latest-stat" aria-label={`${label} benchmark price`}>
      <strong>{formatCommodityPrice(data.value, data.unit)}</strong>
      <small>{COMMODITY_SOURCE_LABELS[data.classification]}</small>
      {change ? <small className={change24hClass(data.change24hPercent)}>{change}</small> : null}
    </div>
  );
}

export function RrcScenarioWorkbench({ company = "RRC", currentMarketPrices, commoditySources: providedCommoditySources }: RrcScenarioWorkbenchProps = {}) {
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
  const [years, setYears] = useState<RrcForecastYear[]>([]);
  const [presetMultiples, setPresetMultiples] = useState<Record<Preset, number> | null>(null);

  const [multiple, setMultiple] = useState<string>("");
  const [preset, setPreset] = useState<Preset>("base");
  const [forwardYear, setForwardYear] = useState<RrcForecastYear | "">("");

  const [gasProd, setGasProd] = useState<Record<string, string>>({});
  const [nglProd, setNglProd] = useState<Record<string, string>>({});
  const [oilProd, setOilProd] = useState<Record<string, string>>({});
  const [gasPrice, setGasPrice] = useState("");
  const [nglPrice, setNglPrice] = useState("");
  const [oilPrice, setOilPrice] = useState("");

  const [customResult, setCustomResult] = useState<RrcAnnualForecastResult | null>(null);
  const [customActive, setCustomActive] = useState(false);
  const [runLoading, setRunLoading] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const overrideCount =
    years.reduce(
      (count, year) => count + ((gasProd[year] ?? "").trim() !== "" ? 1 : 0) + ((nglProd[year] ?? "").trim() !== "" ? 1 : 0) + ((oilProd[year] ?? "").trim() !== "" ? 1 : 0),
      0
    ) + (gasPrice.trim() !== "" ? 1 : 0) + (nglPrice.trim() !== "" ? 1 : 0) + (oilPrice.trim() !== "" ? 1 : 0);
  const hasOverrideInput = overrideCount > 0;

  useEffect(() => {
    let cancelled = false;
    setDefaults(null);
    setDefaultResult(null);
    setCustomResult(null);
    setCustomActive(false);
    setYears([]);
    setForwardYear("");
    setPreset("base");
    setPresetMultiples(null);
    setMultiple("");
    setGasProd({});
    setNglProd({});
    setOilProd({});
    setGasPrice("");
    setNglPrice("");
    setOilPrice("");
    setRunError(null);
    fetch(`/api/forecast?company=${encodeURIComponent(company)}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error ?? "Unable to load forecast defaults.");
        return payload as GenericDefaultsResponse;
      })
      .then((data) => {
        if (cancelled || !data.company.periods) return;
        const activeYears = data.company.periods.forecastYears as RrcForecastYear[];
        const nextDefaults = { ...data.defaults, result: data.result } as ApiDefaults;
        setYears(activeYears);
        setForwardYear(data.company.periods.defaultForwardYear as RrcForecastYear);
        setPresetMultiples(nextDefaults.valuationPresets);
        setMultiple(String(nextDefaults.valuationPresets.base));
        setGasProd(emptyYearStrings(activeYears));
        setNglProd(emptyYearStrings(activeYears));
        setOilProd(emptyYearStrings(activeYears));
        setDefaults(nextDefaults);
        setDefaultResult(data.result);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [company]);

  useEffect(() => {
    if (presetMultiples) setMultiple(String(presetMultiples[preset]));
  }, [preset, presetMultiples]);

  async function computeForecast(useOverrides: boolean): Promise<RrcAnnualForecastResult> {
    const response = await fetch(`/api/forecast?company=${encodeURIComponent(company)}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        strategy: "maintenance",
        production: Object.fromEntries(
          years.map((year) => [
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
        valuation: { targetEvToEbitdax: parsedOrUndefined(multiple) ?? presetMultiples![preset], forwardYear }
      })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Forecast calculation failed.");
    return payload.result as RrcAnnualForecastResult;
  }

  // Default Forecast recomputes automatically -- no user action required -- whenever live
  // market pricing resolves/changes or the forward year / target multiple change. Custom
  // production/price overrides are a separate, explicit action (Run Scenario, below) and
  // never trigger this effect.
  useEffect(() => {
    if (!defaults || !forwardYear) return;
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
  }, [company, defaults, liveCommodity, multiple, forwardYear]);

  async function runScenario() {
    setRunLoading(true);
    setRunError(null);
    try {
      const result = await computeForecast(true);
      setCustomResult(result);
      setCustomActive(true);
    } catch (cause) {
      setRunError(cause instanceof Error ? cause.message : "Forecast calculation failed.");
    } finally {
      setRunLoading(false);
    }
  }

  function resetToDefault() {
    setGasProd(emptyYearStrings(years));
    setNglProd(emptyYearStrings(years));
    setOilProd(emptyYearStrings(years));
    setGasPrice("");
    setNglPrice("");
    setOilPrice("");
    setCustomActive(false);
    setCustomResult(null);
    setRunError(null);
  }

  const result = customActive ? customResult ?? defaultResult : defaultResult;

  return (
    <main className="forecast-panel" style={{ maxWidth: 1440, margin: "0 auto", padding: "24px" }}>
      <header className="forecast-head">
        <div>
          <h1>Forecast</h1>
          <p>Automatically updated from reported results, management guidance, and market pricing.</p>
        </div>
      </header>

      <div className="wb-source-grid">
        <div className="wb-source-card wb-source-card--positive">
          <span className="wb-source-label">
            Latest Reported
            <InfoTip placement="bottom" text="Reported quarters are historical actuals and are never overwritten by forecast assumptions." />
          </span>
          <strong>{formatPeriodLabel(defaults?.latestActualPeriod)} Actuals</strong>
          <small>Source: Company filings</small>
        </div>
        <div className="wb-source-card wb-source-card--negative">
          <span className="wb-source-label">
            Management Guidance
            <InfoTip placement="bottom" text="Used when explicitly provided by management; unguided items are filled by the existing model methodology, never invented." />
          </span>
          <strong>{years.length ? `${yearLabel(years[0])}–${yearLabel(years[years.length - 1])}` : "--"} Outlook</strong>
          <small>Source: Management guidance</small>
        </div>
        <div className="wb-source-card wb-source-card--accent">
          <span className="wb-source-label">
            Market Pricing
            <InfoTip placement="bottom" align="left" text="The default model uses the existing current-market pricing methodology and does not yet use an approved forward curve." />
          </span>
          <strong>Current Market Prices</strong>
          <small>Source: {COMMODITY_SOURCE_LABELS[commoditySources.henryHub.classification]}</small>
        </div>
      </div>

      <section className="wb-section">
        <div className="wb-section-head">
          <h2>{customActive ? "Forecast (custom scenario)" : "Default Forecast"}</h2>
          {runLoading ? <span className="muted" style={{ fontSize: 12 }}>Running…</span> : null}
        </div>
        <p className="muted" style={{ margin: "-4px 0 0", fontSize: 12 }}>
          Built automatically from current reported results, guidance, and market assumptions.
        </p>
        <div className="wb-table-scroll">
          <table className="forecast-table wb-primary-table">
            <colgroup>
              <col style={{ width: "34%" }} />
              {years.map((year) => (
                <col key={year} style={{ width: "22%" }} />
              ))}
            </colgroup>
            <thead>
              <tr>
                <th align="left">Metric</th>
                {years.map((year) => (
                  <th key={year} align="right">{yearLabel(year)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th align="left">
                  Total Production (Bcfe/d)
                  <InfoTip text={`${years[0] ?? "Current-year"}E includes immutable actuals through ${formatPeriodLabel(defaults?.latestActualPeriod)} and estimates only the remaining quarters; later years use management guidance where available, else the model default.`} />
                </th>
                {years.map((year) => (
                  <td key={year}>{result ? bcfePerDay(result.annual[year].production.totalMcfe) : "--"}</td>
                ))}
              </tr>
              <tr>
                <th align="left">
                  Revenue ($mm)
                  <InfoTip text="Production times realized commodity price (benchmark plus differential plus hedge impact) for gas, NGL, and oil, summed." />
                </th>
                {years.map((year) => (
                  <td key={year}>{result ? money(result.annual[year].revenueMillion) : "--"}</td>
                ))}
              </tr>
              <tr>
                <th align="left">
                  Adjusted EBITDAX ($mm)
                  <InfoTip text="Forecast revenue flows through the existing operating-cost methodology (LOE, gathering/transport, G&A, production taxes) to arrive at EBITDAX." />
                </th>
                {years.map((year) => (
                  <td key={year}>{result ? money(result.annual[year].ebitdaxMillion) : "--"}</td>
                ))}
              </tr>
              <tr>
                <th align="left">
                  Capital Expenditures ($mm)
                  <InfoTip text={`Periods through ${formatPeriodLabel(defaults?.latestActualPeriod)} use actual reported CapEx. Forecast periods use management's guided capital budget where available, else the company model default.`} />
                </th>
                {years.map((year) => (
                  <td key={year}>{result ? money(result.annual[year].capexMillion) : "--"}</td>
                ))}
              </tr>
              <tr className="wb-row-emphasis">
                <th align="left">
                  Free Cash Flow ($mm)
                  <InfoTip text="The model calculates forecast cash generation after the existing cash-flow and capital-spending methodology: EBITDAX less cash interest, cash taxes, and CapEx." />
                </th>
                {years.map((year) => (
                  <td key={year}>{result ? money(result.annual[year].freeCashFlowMillion) : "--"}</td>
                ))}
              </tr>
              <tr>
                <th align="left">
                  Ending Net Debt ($mm)
                  <InfoTip text={`Free cash flow flows through the net-debt roll-forward each quarter. Periods through ${formatPeriodLabel(defaults?.latestActualPeriod)} use reported net debt directly, not a rolled-forward estimate.`} />
                </th>
                {years.map((year) => {
                  const value = result ? result.annual[year].endingNetDebtMillion : null;
                  return (
                    <td key={year} className={value !== null && value < 0 ? "positive" : undefined}>
                      {money(value)}
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <details className="ann-details">
        <summary>
          <span className="wb-summary-row">
            <span className="wb-summary-title">
              Customize Production &amp; Prices
              <InfoTip text="Optional overrides on top of the Default Forecast. Only the values you enter here change -- every other assumption keeps using Default Forecast logic." />
            </span>
            <span className={`wb-override-count${hasOverrideInput ? " active" : ""}`}>Overrides: {overrideCount}</span>
          </span>
        </summary>

        <div className="wb-customize-grid wb-gap-top">
          <div className="wb-customize-col">
            <h3 className="wb-group-title">Production</h3>
            <div className="wb-table-scroll">
              <table className="forecast-table ann-guidance-table">
                <thead>
                  <tr>
                    <th align="left">Commodity</th>
                    {years.map((year) => (
                      <th key={year} align="right">{yearLabel(year)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th align="left">Natural Gas (MMcf/d)</th>
                    {years.map((year) => (
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
                    {years.map((year) => (
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
                    {years.map((year) => (
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
          </div>

          <div className="wb-customize-col">
            <h3 className="wb-group-title">Commodity Prices</h3>
            <div className="wb-latest-stats">
              <div className="wb-price-card">
                <div className="wb-price-card-head">
                  <span className="wb-price-card-label">Natural Gas</span>
                  <span className="wb-price-card-benchmark">Henry Hub</span>
                </div>
                <CommodityPriceCard label="Henry Hub" data={commoditySources.henryHub} />
                <label className="wb-price-override">
                  <input
                    type="number"
                    step="0.01"
                    aria-label="Natural Gas price override ($/MMBtu)"
                    placeholder="Default: current market"
                    value={gasPrice}
                    onChange={(event) => setGasPrice(event.target.value)}
                  />
                </label>
              </div>
              <div className="wb-price-card">
                <div className="wb-price-card-head">
                  <span className="wb-price-card-label">NGL</span>
                  <span className="wb-price-card-benchmark">Realization</span>
                </div>
                <div className="wb-latest-stat">
                  <strong>--</strong>
                  <small>Management Sensitivity · Modeled</small>
                </div>
                <label className="wb-price-override">
                  <input
                    type="number"
                    step="0.01"
                    aria-label="NGL price override ($/bbl)"
                    placeholder="Default: modeled from WTI"
                    value={nglPrice}
                    onChange={(event) => setNglPrice(event.target.value)}
                  />
                </label>
              </div>
              <div className="wb-price-card">
                <div className="wb-price-card-head">
                  <span className="wb-price-card-label">Oil</span>
                  <span className="wb-price-card-benchmark">WTI</span>
                </div>
                <CommodityPriceCard label="WTI" data={commoditySources.wti} />
                <label className="wb-price-override">
                  <input
                    type="number"
                    step="0.01"
                    aria-label="Oil price override ($/bbl)"
                    placeholder="Default: current market"
                    value={oilPrice}
                    onChange={(event) => setOilPrice(event.target.value)}
                  />
                </label>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
          <button className="wb-btn-primary" onClick={() => void runScenario()} disabled={runLoading}>
            {runLoading ? "Running…" : "▶ Run Scenario"}
          </button>
          <button className="wb-btn-secondary" onClick={resetToDefault} disabled={!customActive && !hasOverrideInput}>
            Reset to Default
          </button>
        </div>
        {runError ? <p role="alert" className="muted" style={{ color: "var(--negative)" }}>{runError}</p> : null}
      </details>

      <section className="wb-section">
        <div className="wb-section-head">
          <h2>
            Valuation
            <InfoTip text="EV/EBITDAX: forward-year EBITDAX x target multiple = enterprise value. Enterprise value minus net debt = equity value. Equity value / diluted shares = implied share price." />
          </h2>
        </div>
        <div className="wb-group wb-valuation-controls">
          <label className="wb-field">
            Forward EBITDAX Year
            <select value={forwardYear} onChange={(event) => setForwardYear(event.target.value as RrcForecastYear)}>
              {years.map((year) => (
                <option key={year} value={year}>{yearLabel(year)}</option>
              ))}
            </select>
          </label>
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

        {result ? (
          <>
            <section className="wb-result-grid wb-gap-top">
              <div className="wb-result-card"><small>{result.valuation.forwardYear}E EBITDAX x multiple</small><strong>{money(result.valuation.forwardEbitdaxMillion)} <small style={{ fontWeight: 400 }}>at {multiple}x</small></strong></div>
              <div className="wb-result-card"><small>Enterprise value</small><strong>{money(result.valuation.enterpriseValueMillion)}</strong></div>
              <div className="wb-result-card">
                <small>Net debt ({result.valuation.netDebtPeriod})</small>
                <strong>{money(result.valuation.netDebtMillion)}</strong>
                {result.valuation.valuationNetDebtFloorApplied ? (
                  <small className="muted">Net cash position ({money(result.valuation.forecastEndingNetDebtMillion)}); floored at $0 for this bridge.</small>
                ) : null}
              </div>
              <div className="wb-result-card"><small>Equity value</small><strong>{money(result.valuation.equityValueMillion)}</strong></div>
              <div className="wb-result-card wb-result-card--primary"><small>Implied share price</small><strong>{money(result.valuation.impliedSharePrice, 2)}</strong></div>
            </section>
            {result.valuation.warnings.length > 0 ? <p className="muted panel-note">{result.valuation.warnings.join(" ")}</p> : null}

            <details className="ann-details wb-gap-top">
              <summary>
                Secondary: DCF
                <InfoTip text="A secondary discounted-cash-flow reference, not the primary valuation method -- it uses today's reported net debt, not a future ending net debt." />
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
        Historical reported periods remain immutable. Missing or unsupported values display as &quot;--&quot;.
      </p>
    </main>
  );
}

/** Company-neutral name for new callers; RrcScenarioWorkbench remains as the compatibility export. */
export const GenericForecastWorkbench = RrcScenarioWorkbench;
