"use client";

import { useEffect, useMemo, useState } from "react";
import type { LiveMarketPricesInput } from "@/lib/forecast/live-market-prices";

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

export function RrcScenarioWorkbench({ currentMarketPrices }: { currentMarketPrices?: LiveMarketPricesInput } = {}) {
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

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
        <label>
          Scenario preset
          <PresetInfoTooltip />
          <select value={preset} onChange={(event) => setPreset(event.target.value as Preset)} style={{ width: "100%", padding: 10, marginTop: 6 }}><option value="bear">Bear</option><option value="base">Base</option><option value="bull">Bull</option></select>
        </label>
        <label>Post-2027 strategy<select value={strategy} onChange={(event) => setStrategy(event.target.value as Strategy)} style={{ width: "100%", padding: 10, marginTop: 6 }}><option value="maintenance">Maintenance</option><option value="continued-growth">Continued growth</option></select></label>
        <label>Target EV / EBITDAX<input type="number" step="0.1" value={assumptions.targetEvToEbitdax} onChange={(event) => setAssumptions({ ...assumptions, targetEvToEbitdax: Number(event.target.value) })} style={{ width: "100%", padding: 10, marginTop: 6 }} /></label>
        <label>Discount rate<input type="number" step="0.005" value={assumptions.discountRate} onChange={(event) => setAssumptions({ ...assumptions, discountRate: Number(event.target.value) })} style={{ width: "100%", padding: 10, marginTop: 6 }} /></label>
        <label>Terminal growth<input type="number" step="0.005" value={assumptions.terminalGrowthRate} onChange={(event) => setAssumptions({ ...assumptions, terminalGrowthRate: Number(event.target.value) })} style={{ width: "100%", padding: 10, marginTop: 6 }} /></label>
      </section>

      <section style={{ border: "1px solid rgba(128,128,128,0.35)", borderRadius: 8, padding: 14, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Production assumption</h2>
          <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 999, border: "1px solid rgba(128,128,128,0.35)", background: productionMode === "override" ? "rgba(240,180,40,0.16)" : "rgba(40,180,120,0.16)" }}>
            {productionMode === "override" ? "User production assumption" : (latestReported ? `${latestReported.sourceLabel}` : "Latest reported production")}
          </span>
        </div>

        <label>Production mode
          <select
            value={productionMode}
            onChange={(event) => setProductionMode(event.target.value as ProductionMode)}
            style={{ width: "100%", padding: 10, marginTop: 6 }}
          >
            <option value="reported">Latest reported</option>
            <option value="override">Manual override</option>
          </select>
        </label>

        {latestReported ? (
          <p style={{ margin: 0, fontSize: 12, opacity: 0.75 }}>
            {latestReported.sourceLabel}: gas {number(latestReported.gasMmcfPerDay, 1)} MMcf/d, NGL {number(latestReported.nglMbblPerDay, 1)} Mbbl/d, oil {number(latestReported.oilMbblPerDay, 1)} Mbbl/d. Held constant across all future periods by default.
          </p>
        ) : null}

        {productionMode === "override" ? (
          <>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" onClick={copyLatestReportedToAllPeriods} style={{ padding: "6px 10px" }}>Copy latest reported to all periods</button>
              <button type="button" onClick={resetProduction} style={{ padding: "6px 10px" }}>Reset to latest reported</button>
            </div>
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
                  {FUTURE_PERIODS.map((period) => {
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
          </>
        ) : null}
      </section>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <button onClick={() => void run()} disabled={loading} style={{ padding: "10px 16px" }}>{loading ? "Calculating…" : "Run scenario"}</button>
        <button onClick={() => void compareBoth()} disabled={loading} style={{ padding: "10px 16px" }}>Compare maintenance vs growth</button>
      </div>
      {error ? <p role="alert">{error}</p> : null}

      {current ? (
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 12 }}>
          <article><small>2027 EBITDAX</small><h2>{money(current.result.forecast2027EbitdaxMillion)}</h2></article>
          <article><small>Ending net debt</small><h2>{money(current.result.endingNetDebtMillion)}</h2></article>
          <article><small>Multiple value / share</small><h2>{money(current.result.multiple.impliedSharePrice, 2)}</h2></article>
          <article><small>DCF value / share</small><h2>{money(current.result.dcf.impliedSharePrice, 2)}</h2></article>
          {fcf.map((item) => <article key={item.year}><small>{item.year} FCF</small><h2>{money(item.value)}</h2></article>)}
        </section>
      ) : null}

      {forecastPeriods.length > 0 ? (
        <section>
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

      <section>
        <h2>Maintenance vs. growth valuation bridge</h2>
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
      </section>

      <p style={{ fontSize: 12, opacity: 0.65 }}>All forecast and valuation assumptions remain explicitly modeled. Unsupported values render “--”; the interface does not fabricate missing inputs.</p>
    </main>
  );
}
