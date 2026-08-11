"use client";

import { useEffect, useMemo, useState } from "react";
import type { LiveMarketPricesInput, ResolvedCommodityClassification, ResolvedCommodityPrice } from "@/lib/forecast/live-market-prices";

type Preset = "bear" | "base" | "bull";
type Strategy = "maintenance" | "continued-growth";
type ProductionMode = "reported" | "override";

type LatestReportedProduction = {
  period: string;
  sourceLabel: string;
  gasMmcfPerDay: number | null;
  nglMbblPerDay: number | null;
  oilMbblPerDay: number | null;
};

type ForecastPeriod = {
  period: string;
  production: { gasMmcf: number | null; nglMbbl: number | null; oilMbbl: number | null; totalMcfe: number | null };
  revenue: { totalMillion: number | null };
};

type ScenarioResult = {
  preset: Preset;
  latestReportedProduction: LatestReportedProduction;
  result: {
    strategy: Strategy;
    assumptions: {
      targetEvToEbitdax: number;
      discountRate: number;
      terminalGrowthRate: number;
    };
    annualFreeCashFlowMillion: Array<{ year: number; value: number | null }>;
    forecast2027EbitdaxMillion: number | null;
    endingNetDebtMillion: number | null;
    multiple: { impliedSharePrice: number | null; equityValueMillion: number | null; warnings: string[] };
    dcf: { impliedSharePrice: number | null; equityValueMillion: number | null; warnings: string[] };
    complete: { forecast: { periods: ForecastPeriod[] } };
  };
};

type OverrideRow = { gasMmcfPerDay: string; nglMbblPerDay: string; oilMbblPerDay: string };

const presetDefaults = {
  bear: { targetEvToEbitdax: 4.5, discountRate: 0.12, terminalGrowthRate: -0.01 },
  base: { targetEvToEbitdax: 5.5, discountRate: 0.1, terminalGrowthRate: 0 },
  bull: { targetEvToEbitdax: 6.5, discountRate: 0.09, terminalGrowthRate: 0.01 }
};

const FUTURE_PERIODS = [2026, 2027, 2028]
  .flatMap((year) => [1, 2, 3, 4].map((quarter) => `${year}Q${quarter}`))
  .filter((period) => period !== "2026Q1");

function formatPresetAssumptions(values: (typeof presetDefaults)[Preset]) {
  const growth = values.terminalGrowthRate;
  const growthLabel = `${growth > 0 ? "+" : ""}${(growth * 100).toFixed(0)}%`;
  return `${values.targetEvToEbitdax.toFixed(1)}x EV/EBITDAX · ${(values.discountRate * 100).toFixed(0)}% discount rate · ${growthLabel} terminal growth`;
}

// Reusable, unobtrusive info control explaining what the Bear/Base/Bull presets actually
// change (valuation assumptions only) so it isn't mistaken for a commodity/operating scenario.
function PresetInfoTooltip() {
  const [open, setOpen] = useState(false);
  return (
    <span
      style={{ position: "relative", display: "inline-flex", verticalAlign: "middle", marginLeft: 6 }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label="What do the Bear, Base, and Bull presets change?"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        style={{
          width: 16,
          height: 16,
          borderRadius: "50%",
          border: "1px solid rgba(128,128,128,0.5)",
          background: "transparent",
          color: "inherit",
          fontSize: 10,
          fontWeight: 700,
          lineHeight: "14px",
          padding: 0,
          cursor: "pointer"
        }}
      >
        i
      </button>
      {open ? (
        <span
          role="tooltip"
          style={{
            position: "absolute",
            top: 22,
            left: 0,
            zIndex: 30,
            width: 268,
            background: "var(--panel-2, #102035)",
            color: "var(--text, #eef5fb)",
            border: "1px solid rgba(128,128,128,0.35)",
            borderRadius: 8,
            padding: "10px 12px",
            fontSize: 12,
            lineHeight: 1.5,
            fontWeight: 400,
            boxShadow: "0 6px 18px rgba(0,0,0,0.35)"
          }}
        >
          <div><strong>Bear</strong> — {formatPresetAssumptions(presetDefaults.bear)}</div>
          <div style={{ marginTop: 4 }}><strong>Base</strong> — {formatPresetAssumptions(presetDefaults.base)}</div>
          <div style={{ marginTop: 4 }}><strong>Bull</strong> — {formatPresetAssumptions(presetDefaults.bull)}</div>
          <div style={{ marginTop: 8, opacity: 0.75 }}>
            Valuation scenario presets only. They change the multiple/DCF assumptions above — not commodity prices, production, CapEx, or costs.
          </div>
        </span>
      ) : null}
    </span>
  );
}

function money(value: number | null, digits = 1) {
  return value === null ? "--" : `$${value.toFixed(digits)}`;
}

function number(value: number | null, digits = 1) {
  return value === null ? "--" : value.toFixed(digits);
}

function netDebtDisplay(value: number | null) {
  if (value === null) return { label: "Ending net debt", value: "--", tone: "" as const };
  if (value < 0) return { label: "Net cash", value: money(Math.abs(value)), tone: "positive" as const };
  return { label: "Ending net debt", value: money(value), tone: "" as const };
}

const COMMODITY_CLASSIFICATION_LABEL: Record<ResolvedCommodityClassification, string> = {
  current_market: "OilPriceAPI · Current Market",
  official_delayed: "EIA · Latest Official / Delayed",
  modeled: "Management Sensitivity"
};

const COMMODITY_CLASSIFICATION_BACKGROUND: Record<ResolvedCommodityClassification, string> = {
  current_market: "rgba(40,180,120,0.16)",
  official_delayed: "rgba(64,140,220,0.16)",
  modeled: "rgba(240,180,40,0.16)"
};

function formatCommodityPrice(value: number | null, unit: string | null) {
  if (value === null) return "--";
  const cleanUnit = unit?.replace(/^\$\//, "") ?? null;
  return cleanUnit ? `$${value.toFixed(2)} / ${cleanUnit}` : `$${value.toFixed(2)}`;
}

function formatChange24h(percent: number | null) {
  if (percent === null) return null;
  const sign = percent >= 0 ? "+" : "";
  return `${sign}${percent.toFixed(2)}% 24h`;
}

// Compact, read-only display of the exact commodity input feeding this scenario run --
// not a new pricing feature. Renders nothing when the parent doesn't supply
// commoditySources (e.g. the standalone /forecast route), matching the existing
// currentMarketPrices prop's no-prop-means-unchanged-behavior convention.
function CommodityPriceAssumptions({ henryHub, wti }: { henryHub: ResolvedCommodityPrice; wti: ResolvedCommodityPrice }) {
  const rows: Array<{ label: string; data: ResolvedCommodityPrice }> = [
    { label: "Henry Hub", data: henryHub },
    { label: "WTI", data: wti }
  ];

  return (
    <section style={{ border: "1px solid rgba(128,128,128,0.35)", borderRadius: 8, padding: 14, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Commodity price assumptions</h2>
        <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 999, border: "1px solid rgba(128,128,128,0.35)", background: "rgba(128,128,128,0.14)" }}>
          Price mode: Current market (read-only)
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
        {rows.map(({ label, data }) => {
          const change = formatChange24h(data.change24hPercent);
          return (
            <div key={label} style={{ border: "1px solid rgba(128,128,128,0.25)", borderRadius: 8, padding: 12, display: "grid", gap: 6 }}>
              <strong style={{ fontSize: 14 }}>{label}</strong>
              <span style={{ fontSize: 20, fontWeight: 700 }}>{formatCommodityPrice(data.value, data.unit)}</span>
              <span
                style={{
                  fontSize: 12,
                  padding: "2px 8px",
                  borderRadius: 999,
                  border: "1px solid rgba(128,128,128,0.35)",
                  background: COMMODITY_CLASSIFICATION_BACKGROUND[data.classification],
                  width: "fit-content"
                }}
              >
                {COMMODITY_CLASSIFICATION_LABEL[data.classification]}
              </span>
              {change ? <span style={{ fontSize: 12, opacity: 0.75 }}>{change}</span> : null}
              <span style={{ fontSize: 11, opacity: 0.6 }}>
                {data.asOf ? `As of ${data.asOf}` : "As of --"} · Model input for this scenario run
              </span>
            </div>
          );
        })}
      </div>

      <p style={{ margin: 0, fontSize: 11, opacity: 0.6 }}>
        Values shown are exactly what this run sends to the forecast engine as commodity price inputs. Custom price entry is not available yet -- it requires a separate modeling change.
      </p>
    </section>
  );
}

export function RrcScenarioWorkbench({
  currentMarketPrices,
  commoditySources
}: {
  currentMarketPrices?: LiveMarketPricesInput;
  commoditySources?: { wti: ResolvedCommodityPrice; henryHub: ResolvedCommodityPrice };
} = {}) {
  const [preset, setPreset] = useState<Preset>("base");
  const [strategy, setStrategy] = useState<Strategy>("maintenance");
  const [assumptions, setAssumptions] = useState(presetDefaults.base);
  const [current, setCurrent] = useState<ScenarioResult | null>(null);
  const [comparison, setComparison] = useState<Record<Strategy, ScenarioResult | null>>({ maintenance: null, "continued-growth": null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [latestReported, setLatestReported] = useState<LatestReportedProduction | null>(null);
  const [productionMode, setProductionMode] = useState<ProductionMode>("reported");
  const [overrides, setOverrides] = useState<Record<string, OverrideRow>>({});

  useEffect(() => setAssumptions(presetDefaults[preset]), [preset]);

  useEffect(() => {
    fetch("/api/rrc-scenarios")
      .then((response) => response.json())
      .then((data) => setLatestReported(data.latestReportedProduction ?? null))
      .catch(() => undefined);
  }, []);

  function overridesPayload() {
    if (productionMode !== "override") return [];
    const parse = (text: string) => (text.trim() === "" ? undefined : Number(text));
    return Object.entries(overrides)
      .filter(([, row]) => row.gasMmcfPerDay !== "" || row.nglMbblPerDay !== "" || row.oilMbblPerDay !== "")
      .map(([period, row]) => ({
        period,
        gasMmcfPerDay: parse(row.gasMmcfPerDay),
        nglMbblPerDay: parse(row.nglMbblPerDay),
        oilMbblPerDay: parse(row.oilMbblPerDay)
      }));
  }

  async function run(selectedStrategy = strategy) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/rrc-scenarios", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          preset,
          strategy: selectedStrategy,
          assumptions,
          productionMode,
          productionOverrides: overridesPayload(),
          currentMarketPrices
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Scenario calculation failed.");
      const result = payload as ScenarioResult;
      setCurrent(result);
      setLatestReported(result.latestReportedProduction);
      setComparison((existing) => ({ ...existing, [selectedStrategy]: result }));
      return result;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Scenario calculation failed.");
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function compareBoth() {
    await run("maintenance");
    await run("continued-growth");
  }

  function resetProduction() {
    setProductionMode("reported");
    setOverrides({});
  }

  function copyLatestReportedToAllPeriods() {
    if (!latestReported) return;
    const row: OverrideRow = {
      gasMmcfPerDay: latestReported.gasMmcfPerDay === null ? "" : String(latestReported.gasMmcfPerDay),
      nglMbblPerDay: latestReported.nglMbblPerDay === null ? "" : String(latestReported.nglMbblPerDay),
      oilMbblPerDay: latestReported.oilMbblPerDay === null ? "" : String(latestReported.oilMbblPerDay)
    };
    setOverrides(Object.fromEntries(FUTURE_PERIODS.map((period) => [period, row])));
  }

  function updateOverride(period: string, field: keyof OverrideRow, text: string) {
    setOverrides((existing) => {
      const row: OverrideRow = existing[period] ?? { gasMmcfPerDay: "", nglMbblPerDay: "", oilMbblPerDay: "" };
      return { ...existing, [period]: { ...row, [field]: text } };
    });
  }

  const fcf = useMemo(
    () => current?.result.annualFreeCashFlowMillion ?? [],
    [current]
  );

  const forecastPeriods = current?.result.complete.forecast.periods ?? [];

  function isOverridden(period: string) {
    if (productionMode !== "override") return false;
    const row = overrides[period];
    return !!row && (row.gasMmcfPerDay !== "" || row.nglMbblPerDay !== "" || row.oilMbblPerDay !== "");
  }

  return (
    <main style={{ maxWidth: 1280, margin: "0 auto", padding: "24px", display: "grid", gap: 18 }}>
      <header>
        <p style={{ margin: 0, opacity: 0.7, fontSize: 13 }}>RANGE RESOURCES FORECAST ENGINE</p>
        <h1 style={{ margin: "4px 0 8px" }}>Scenario Workbench</h1>
        <p style={{ margin: 0, opacity: 0.75 }}>Bear, base, and bull valuation cases with an explicit 2028 maintenance-versus-growth fork.</p>
      </header>

      <section className="wb-groups">
        <div className="wb-group">
          <h3 className="wb-group-title">Operating strategy</h3>
          <label className="wb-field">
            <span className="wb-field-label">Scenario preset<PresetInfoTooltip /></span>
            <select value={preset} onChange={(event) => setPreset(event.target.value as Preset)}><option value="bear">Bear</option><option value="base">Base</option><option value="bull">Bull</option></select>
          </label>
          <label className="wb-field">Post-2027 strategy<select value={strategy} onChange={(event) => setStrategy(event.target.value as Strategy)}><option value="maintenance">Maintenance</option><option value="continued-growth">Continued growth</option></select></label>
        </div>

        <div className="wb-group">
          <h3 className="wb-group-title">Valuation assumptions</h3>
          <label className="wb-field">
            Target EV / EBITDAX
            <span className="wb-suffix-input">
              <input type="number" step="0.1" value={assumptions.targetEvToEbitdax} onChange={(event) => setAssumptions({ ...assumptions, targetEvToEbitdax: Number(event.target.value) })} />
              <span>x</span>
            </span>
          </label>
          <label className="wb-field">
            Discount rate
            <span className="wb-suffix-input">
              <input type="number" step="0.5" value={Number((assumptions.discountRate * 100).toFixed(1))} onChange={(event) => setAssumptions({ ...assumptions, discountRate: Number(event.target.value) / 100 })} />
              <span>%</span>
            </span>
          </label>
          <label className="wb-field">
            Terminal growth
            <span className="wb-suffix-input">
              <input type="number" step="0.5" value={Number((assumptions.terminalGrowthRate * 100).toFixed(1))} onChange={(event) => setAssumptions({ ...assumptions, terminalGrowthRate: Number(event.target.value) / 100 })} />
              <span>%</span>
            </span>
          </label>
        </div>
      </section>

      <h2 className="wb-group-title" style={{ margin: "16px 0 -6px" }}>Forecast drivers</h2>

      <section className="wb-section wb-gap-bottom">
        <div className="wb-section-head">
          <h2>Production assumption</h2>
          <span className={`wb-pill ${productionMode === "override" ? "override" : "reported"}`}>
            {productionMode === "override" ? "User production assumption" : (latestReported ? `${latestReported.sourceLabel}` : "Latest reported production")}
          </span>
        </div>

        <label className="wb-field">Production mode
          <select
            value={productionMode}
            onChange={(event) => setProductionMode(event.target.value as ProductionMode)}
          >
            <option value="reported">Latest reported</option>
            <option value="override">Manual override</option>
          </select>
        </label>

        {latestReported ? (
          <div>
            <div className="wb-latest-stats">
              <div className="wb-latest-stat"><span>Gas</span><strong>{number(latestReported.gasMmcfPerDay, 1)} <small>MMcf/d</small></strong></div>
              <div className="wb-latest-stat"><span>NGL</span><strong>{number(latestReported.nglMbblPerDay, 1)} <small>Mbbl/d</small></strong></div>
              <div className="wb-latest-stat"><span>Oil</span><strong>{number(latestReported.oilMbblPerDay, 1)} <small>Mbbl/d</small></strong></div>
            </div>
            <p className="wb-latest-note">{latestReported.sourceLabel} · held constant across all future periods by default.</p>
          </div>
        ) : null}

        {productionMode === "override" ? (
          <>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={copyLatestReportedToAllPeriods} style={{ padding: "6px 10px" }}>Copy latest reported to all periods</button>
              <button type="button" onClick={resetProduction} style={{ padding: "6px 10px" }}>Reset to latest reported</button>
            </div>
            {[2026, 2027, 2028].map((year) => (
              <div className="wb-year-group" key={year}>
                <p className="wb-year-label">{year}</p>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th align="left">Period</th>
                        <th align="left">Gas (MMcf/d)</th>
                        <th align="left">NGL (Mbbl/d)</th>
                        <th align="left">Oil (Mbbl/d)</th>
                        <th align="left">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {FUTURE_PERIODS.filter((period) => period.startsWith(String(year))).map((period) => {
                        const row = overrides[period] ?? { gasMmcfPerDay: "", nglMbblPerDay: "", oilMbblPerDay: "" };
                        return (
                          <tr key={period}>
                            <td>{period}</td>
                            <td><input type="number" placeholder="reported" value={row.gasMmcfPerDay} onChange={(event) => updateOverride(period, "gasMmcfPerDay", event.target.value)} style={{ width: 90, padding: 4 }} /></td>
                            <td><input type="number" placeholder="reported" value={row.nglMbblPerDay} onChange={(event) => updateOverride(period, "nglMbblPerDay", event.target.value)} style={{ width: 90, padding: 4 }} /></td>
                            <td><input type="number" placeholder="reported" value={row.oilMbblPerDay} onChange={(event) => updateOverride(period, "oilMbblPerDay", event.target.value)} style={{ width: 90, padding: 4 }} /></td>
                            <td>{isOverridden(period) ? "Override" : "Latest reported"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </>
        ) : null}
      </section>

      {commoditySources ? <CommodityPriceAssumptions henryHub={commoditySources.henryHub} wti={commoditySources.wti} /> : null}

      <div className="wb-gap-top" style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button onClick={() => void run()} disabled={loading} style={{ padding: "10px 16px" }}>{loading ? "Calculating…" : "Run scenario"}</button>
        <button onClick={() => void compareBoth()} disabled={loading} style={{ padding: "10px 16px" }}>Compare maintenance vs growth</button>
      </div>
      {error ? <p role="alert">{error}</p> : null}

      {current ? (
        <div className="wb-result-rows wb-gap-top">
          <section className="wb-result-grid">
            <div className="wb-result-card"><small>DCF value / share</small><strong>{money(current.result.dcf.impliedSharePrice, 2)}</strong></div>
            <div className="wb-result-card"><small>Multiple value / share</small><strong>{money(current.result.multiple.impliedSharePrice, 2)}</strong></div>
            <div className="wb-result-card"><small>2027 EBITDAX</small><strong>{money(current.result.forecast2027EbitdaxMillion)}</strong></div>
            <div className="wb-result-card">
              <small>{netDebtDisplay(current.result.endingNetDebtMillion).label}</small>
              <strong className={netDebtDisplay(current.result.endingNetDebtMillion).tone}>{netDebtDisplay(current.result.endingNetDebtMillion).value}</strong>
            </div>
          </section>
          <section className="wb-result-grid">
            {fcf.map((item) => <div className="wb-result-card" key={item.year}><small>{item.year} FCF</small><strong>{money(item.value)}</strong></div>)}
          </section>
        </div>
      ) : null}

      {forecastPeriods.length > 0 ? (
        <section className="wb-section wb-gap-top">
          <h2>Quarterly production and revenue</h2>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr><th align="left">Period</th><th align="left">Production source</th><th align="right">Gas (MMcf)</th><th align="right">NGL (Mbbl)</th><th align="right">Oil (Mbbl)</th><th align="right">Total Mcfe</th><th align="right">Revenue</th></tr></thead>
              <tbody>
                {forecastPeriods.map((period) => (
                  <tr key={period.period}>
                    <td>{period.period}</td>
                    <td>{period.period === "2026Q1" ? "Latest reported (10-Q)" : isOverridden(period.period) ? "User override" : "Latest reported (held constant)"}</td>
                    <td align="right">{number(period.production.gasMmcf, 0)}</td>
                    <td align="right">{number(period.production.nglMbbl, 1)}</td>
                    <td align="right">{number(period.production.oilMbbl, 1)}</td>
                    <td align="right">{number(period.production.totalMcfe, 0)}</td>
                    <td align="right">{money(period.revenue.totalMillion)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="wb-section wb-gap-top">
        <h2>Maintenance vs. growth valuation bridge</h2>
        {comparison.maintenance && comparison["continued-growth"] ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr><th align="left">Metric</th><th align="right">Maintenance</th><th align="right">Growth</th><th align="right">Difference</th></tr></thead>
              <tbody>
                {[
                  ["2027 EBITDAX", comparison.maintenance?.result.forecast2027EbitdaxMillion ?? null, comparison["continued-growth"]?.result.forecast2027EbitdaxMillion ?? null],
                  ["Ending net debt", comparison.maintenance?.result.endingNetDebtMillion ?? null, comparison["continued-growth"]?.result.endingNetDebtMillion ?? null],
                  ["EV/EBITDAX implied share price", comparison.maintenance?.result.multiple.impliedSharePrice ?? null, comparison["continued-growth"]?.result.multiple.impliedSharePrice ?? null],
                  ["DCF implied share price", comparison.maintenance?.result.dcf.impliedSharePrice ?? null, comparison["continued-growth"]?.result.dcf.impliedSharePrice ?? null]
                ].map(([label, maintenance, growth]) => {
                  const left = maintenance as number | null;
                  const right = growth as number | null;
                  return <tr key={label as string}><td>{label}</td><td align="right">{number(left, 2)}</td><td align="right">{number(right, 2)}</td><td align="right">{left === null || right === null ? "--" : number(right - left, 2)}</td></tr>;
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="wb-compare-empty">Click "Compare maintenance vs growth" to calculate both cases and see this comparison.</p>
        )}
      </section>

      <p style={{ fontSize: 12, opacity: 0.65 }}>All forecast and valuation assumptions remain explicitly modeled. Unsupported values render "--"; the interface does not fabricate missing inputs.</p>
    </main>
  );
}
