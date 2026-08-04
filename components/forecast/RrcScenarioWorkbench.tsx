"use client";

import { useEffect, useMemo, useState } from "react";

type Preset = "bear" | "base" | "bull";
type Strategy = "maintenance" | "continued-growth";

type ScenarioResult = {
  preset: Preset;
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
  };
};

const presetDefaults = {
  bear: { targetEvToEbitdax: 4.5, discountRate: 0.12, terminalGrowthRate: -0.01 },
  base: { targetEvToEbitdax: 5.5, discountRate: 0.1, terminalGrowthRate: 0 },
  bull: { targetEvToEbitdax: 6.5, discountRate: 0.09, terminalGrowthRate: 0.01 }
};

function money(value: number | null, digits = 1) {
  return value === null ? "--" : `$${value.toFixed(digits)}`;
}

function number(value: number | null, digits = 1) {
  return value === null ? "--" : value.toFixed(digits);
}

export function RrcScenarioWorkbench() {
  const [preset, setPreset] = useState<Preset>("base");
  const [strategy, setStrategy] = useState<Strategy>("maintenance");
  const [assumptions, setAssumptions] = useState(presetDefaults.base);
  const [current, setCurrent] = useState<ScenarioResult | null>(null);
  const [comparison, setComparison] = useState<Record<Strategy, ScenarioResult | null>>({ maintenance: null, "continued-growth": null });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setAssumptions(presetDefaults[preset]), [preset]);

  async function run(selectedStrategy = strategy) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/rrc-scenarios", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ preset, strategy: selectedStrategy, assumptions })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Scenario calculation failed.");
      const result = payload as ScenarioResult;
      setCurrent(result);
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

  const fcf = useMemo(
    () => current?.result.annualFreeCashFlowMillion ?? [],
    [current]
  );

  return (
    <main style={{ maxWidth: 1280, margin: "0 auto", padding: "24px", display: "grid", gap: 18 }}>
      <header>
        <p style={{ margin: 0, opacity: 0.7, fontSize: 13 }}>RANGE RESOURCES FORECAST ENGINE</p>
        <h1 style={{ margin: "4px 0 8px" }}>Scenario Workbench</h1>
        <p style={{ margin: 0, opacity: 0.75 }}>Bear, base, and bull valuation cases with an explicit 2028 maintenance-versus-growth fork.</p>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 12 }}>
        <label>Scenario preset<select value={preset} onChange={(event) => setPreset(event.target.value as Preset)} style={{ width: "100%", padding: 10, marginTop: 6 }}><option value="bear">Bear</option><option value="base">Base</option><option value="bull">Bull</option></select></label>
        <label>Post-2027 strategy<select value={strategy} onChange={(event) => setStrategy(event.target.value as Strategy)} style={{ width: "100%", padding: 10, marginTop: 6 }}><option value="maintenance">Maintenance</option><option value="continued-growth">Continued growth</option></select></label>
        <label>Target EV / EBITDAX<input type="number" step="0.1" value={assumptions.targetEvToEbitdax} onChange={(event) => setAssumptions({ ...assumptions, targetEvToEbitdax: Number(event.target.value) })} style={{ width: "100%", padding: 10, marginTop: 6 }} /></label>
        <label>Discount rate<input type="number" step="0.005" value={assumptions.discountRate} onChange={(event) => setAssumptions({ ...assumptions, discountRate: Number(event.target.value) })} style={{ width: "100%", padding: 10, marginTop: 6 }} /></label>
        <label>Terminal growth<input type="number" step="0.005" value={assumptions.terminalGrowthRate} onChange={(event) => setAssumptions({ ...assumptions, terminalGrowthRate: Number(event.target.value) })} style={{ width: "100%", padding: 10, marginTop: 6 }} /></label>
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
