"use client";

import { useEffect, useState } from "react";

type Preset = "bear" | "base" | "bull";

type ForecastPeriod = {
  period: string;
  production: { totalMcfe: number | null };
  revenue: { totalMillion: number | null };
  capex: { totalMillion: number | null };
  ebitdaxMillion: number | null;
  freeCashFlowMillion: number | null;
};

type BalanceSheetPeriod = { period: string; netDebtMillion: number | null };

type CommodityAssumption = { value: number | null; unit: string; source: { classification: string } };

type ScenarioResponse = {
  result: {
    forecast2027EbitdaxMillion: number | null;
    forecast2027FcfMillion: number | null;
    endingNetDebtMillion: number | null;
    multiple: { impliedSharePrice: number | null };
    complete: {
      scenario: { periods: Array<{ commodity: { henryHubPerMmbtu: CommodityAssumption; wtiPerBbl: CommodityAssumption } }> };
      forecast: { periods: ForecastPeriod[] };
      balanceSheet: BalanceSheetPeriod[];
    };
  };
};

const PRESETS: Preset[] = ["bear", "base", "bull"];
const PRESET_LABEL: Record<Preset, string> = { bear: "Bear", base: "Base", bull: "Bull" };

function money(value: number | null, digits = 0): string {
  return value === null ? "--" : `$${value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function perShare(value: number | null): string {
  return value === null ? "--" : `$${value.toFixed(2)}`;
}

function sumYear(periods: ForecastPeriod[], year: number): number | null {
  const values = periods.filter((period) => period.period.startsWith(String(year))).map((period) => period.revenue.totalMillion);
  if (values.length !== 4 || values.some((value) => value === null)) return null;
  return (values as number[]).reduce((sum, value) => sum + value, 0);
}

export function ForecastPanel() {
  const [preset, setPreset] = useState<Preset>("base");
  const [cache, setCache] = useState<Partial<Record<Preset, ScenarioResponse>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cache[preset]) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch("/api/rrc-scenarios", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ preset, strategy: "maintenance" })
    })
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;
        if (data.error) throw new Error(data.error);
        setCache((existing) => ({ ...existing, [preset]: data as ScenarioResponse }));
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Forecast unavailable.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [preset, cache]);

  const active = cache[preset];
  const periods = active?.result.complete.forecast.periods ?? [];
  const netDebtByPeriod = new Map((active?.result.complete.balanceSheet ?? []).map((row) => [row.period, row.netDebtMillion]));
  const commodity = active?.result.complete.scenario.periods[0]?.commodity;
  const anchorProduction = periods[0]?.production.totalMcfe ?? null;
  const anchorCapex = periods[0]?.capex.totalMillion ?? null;
  const revenue2027 = sumYear(periods, 2027);

  return (
    <section className="forecast-panel" aria-labelledby="forecast-title">
      <div className="forecast-head">
        <div>
          <span className="eyebrow">Range Resources forecast engine</span>
          <h1 id="forecast-title">Forecast</h1>
          <p>Deterministic quarterly forecast built on the held-flat production baseline and hedge book.</p>
        </div>
        <div className="change-mode-toggle" role="tablist" aria-label="Scenario">
          {PRESETS.map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={preset === item}
              className={preset === item ? "active" : ""}
              onClick={() => setPreset(item)}
            >
              {PRESET_LABEL[item]}
            </button>
          ))}
        </div>
      </div>

      {error ? <p role="alert" className="muted">{error}</p> : null}

      <div className="macro-section">
        <h2>Assumptions · {periods[0]?.period ?? "2026Q1"}</h2>
        <div className="macro-market-grid forecast-card-grid">
          <div className="macro-market-card">
            <span>Henry Hub</span>
            <strong>{commodity ? money(commodity.henryHubPerMmbtu.value, 2) : loading ? "…" : "--"}</strong>
            <em>{commodity?.henryHubPerMmbtu.unit ?? "$/MMBtu"}</em>
            <small>{commodity?.henryHubPerMmbtu.source.classification ?? "--"}</small>
          </div>
          <div className="macro-market-card">
            <span>WTI</span>
            <strong>{commodity ? money(commodity.wtiPerBbl.value, 2) : loading ? "…" : "--"}</strong>
            <em>{commodity?.wtiPerBbl.unit ?? "$/bbl"}</em>
            <small>{commodity?.wtiPerBbl.source.classification ?? "--"}</small>
          </div>
          <div className="macro-market-card">
            <span>Production</span>
            <strong>{anchorProduction === null ? (loading ? "…" : "--") : Math.round(anchorProduction).toLocaleString("en-US")}</strong>
            <em>MMcfe / quarter</em>
            <small>Latest reported, held flat</small>
          </div>
          <div className="macro-market-card">
            <span>CapEx</span>
            <strong>{anchorCapex === null ? (loading ? "…" : "--") : money(anchorCapex)}</strong>
            <em>$MM / quarter</em>
            <small>Modeled capital case</small>
          </div>
        </div>
      </div>

      <div className="macro-section">
        <h2>2027 forecast output</h2>
        <div className="macro-market-grid forecast-card-grid">
          <div className="macro-market-card">
            <span>Revenue</span>
            <strong>{loading ? "…" : money(revenue2027)}</strong>
            <em>$MM, FY2027</em>
          </div>
          <div className="macro-market-card">
            <span>EBITDAX</span>
            <strong>{loading ? "…" : money(active?.result.forecast2027EbitdaxMillion ?? null)}</strong>
            <em>$MM, FY2027</em>
          </div>
          <div className="macro-market-card">
            <span>Free cash flow</span>
            <strong>{loading ? "…" : money(active?.result.forecast2027FcfMillion ?? null)}</strong>
            <em>$MM, FY2027</em>
          </div>
          <div className="macro-market-card">
            <span>Net debt</span>
            <strong>{loading ? "…" : money(active?.result.endingNetDebtMillion ?? null)}</strong>
            <em>$MM, ending 2028Q4</em>
          </div>
          <div className="macro-market-card">
            <span>Implied share price</span>
            <strong>{loading ? "…" : perShare(active?.result.multiple.impliedSharePrice ?? null)}</strong>
            <em>EV / EBITDAX multiple</em>
          </div>
        </div>
      </div>

      <div className="trend-table-wrap">
        <table className="trend-table forecast-table">
          <thead>
            <tr>
              <th scope="col">Quarter</th>
              <th scope="col">Production (MMcfe)</th>
              <th scope="col">Revenue</th>
              <th scope="col">EBITDAX</th>
              <th scope="col">CapEx</th>
              <th scope="col">Free cash flow</th>
              <th scope="col">Net debt</th>
            </tr>
          </thead>
          <tbody>
            {periods.map((period) => (
              <tr key={period.period}>
                <th scope="row">{period.period}</th>
                <td>{period.production.totalMcfe === null ? "--" : Math.round(period.production.totalMcfe).toLocaleString("en-US")}</td>
                <td>{money(period.revenue.totalMillion)}</td>
                <td>{money(period.ebitdaxMillion)}</td>
                <td>{money(period.capex.totalMillion)}</td>
                <td>{money(period.freeCashFlowMillion)}</td>
                <td>{money(netDebtByPeriod.get(period.period) ?? null)}</td>
              </tr>
            ))}
            {periods.length === 0 ? (
              <tr>
                <td colSpan={7}>{loading ? "Calculating forecast…" : "No forecast data available."}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <p className="muted panel-note">
        All figures come from the deterministic RRC forecast engine (production, revenue, EBITDAX, CapEx, and free cash flow per quarter; net debt is the balance-sheet roll-forward ending each quarter). Unsupported values render &quot;--&quot; and are never estimated.
      </p>
    </section>
  );
}
