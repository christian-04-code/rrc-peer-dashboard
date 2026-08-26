"use client";

import { useState } from "react";
import { useMarketData } from "@/lib/market/use-market-data";
import { useMacroFundamentals } from "@/lib/market/use-macro-fundamentals";
import { useMacroSteo } from "@/lib/market/use-macro-steo";
import { useMacroRisk } from "@/lib/market/use-macro-risk";
import type { CurrentMarketCommodityQuote, MarketObservation, NormalizedMarketMetric } from "@/lib/market/types";
import type { SteoSeriesKey } from "@/lib/market/macro-steo-types";
import type { RangeMacroSignalKey } from "@/lib/market/macro-risk-engine";
import {
  buildAppalachiaProduction,
  buildMacroSnapshot,
  buildStorageComparison,
  buildStorageProfile,
  classifyGasBalance,
  filterToForecastHorizon,
  formatDelta,
  formatMetricValue,
  formatPct,
  monthlyMmcfToBcfd,
  monthlyYoy,
  periodChange,
  periodChangePct,
  shiftMonth,
  toBcfdSeries
} from "@/lib/market/macro-analytics";
import { MacroEnergyMap } from "@/components/dashboard/MacroEnergyMap";
import {
  ChartSeries,
  DemandChart,
  HistoricalLineChart,
  RegionalStorageTable,
  StateProductionRanking
} from "@/components/dashboard/MacroVisuals";
import { EiaOutlookModule, type EiaOutlookMetricOption } from "@/components/dashboard/EiaOutlookModule";
import { MacroRiskWidget } from "@/components/dashboard/MacroRiskWidget";

const PULSE_IDS = ["henry_hub", "wti", "brent", "storage", "lng_exports", "dry_gas_production", "propane_stocks"];

type Topic = "gas-balance" | "storage" | "supply" | "appalachia" | "lng" | "demand" | "eia-outlook" | "rigs";
const TOPICS: { id: Topic; label: string }[] = [
  { id: "gas-balance", label: "Gas Balance" },
  { id: "storage", label: "Storage" },
  { id: "supply", label: "Supply" },
  { id: "appalachia", label: "Appalachia" },
  { id: "lng", label: "LNG" },
  { id: "demand", label: "Demand" },
  { id: "eia-outlook", label: "EIA Outlook" },
  { id: "rigs", label: "Rigs" }
];

const RISK_DRIVER_TOPIC: Record<RangeMacroSignalKey, Topic> = {
  gas_pricing: "gas-balance",
  storage_levels: "storage",
  us_gas_supply: "supply",
  appalachia_supply: "appalachia",
  lng_demand: "lng",
  power_data_center_demand: "demand",
  industrial_demand: "demand"
};

function sourceShort(metric?: NormalizedMarketMetric): string {
  return metric?.seriesId ? `EIA · ${metric.seriesId}` : "U.S. EIA";
}

function compactUnit(metric?: NormalizedMarketMetric): string {
  return metric?.unit.replace("MMcf/month", "MMcf/mo") ?? "";
}

function Sparkline({ points, label }: { points: MarketObservation[]; label: string }) {
  const values = points.slice(0, 24).reverse();
  if (values.length < 2) return <span className="macro-no-chart">No history</span>;
  const min = Math.min(...values.map((point) => point.value));
  const max = Math.max(...values.map((point) => point.value));
  const range = max - min || 1;
  const plotted = values.map((point, index) => {
    const x = (index / (values.length - 1)) * 100;
    const y = 28 - ((point.value - min) / range) * 24;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return <svg className="macro-spark" viewBox="0 0 100 32" role="img" aria-label={`${label} recent trend`}><polyline points={plotted} /></svg>;
}

function PulseMetric({ metric, label, current }: { metric?: NormalizedMarketMetric; label: string; current?: CurrentMarketCommodityQuote }) {
  const hasCurrent = current?.status === "ok" && current.price !== null;
  const change = hasCurrent ? current.change24hAmount : metric ? periodChange(metric) : null;
  const value = hasCurrent ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(current.price as number) : formatMetricValue(metric);
  const currentSource = current?.dataStatus === "keyless-demo" ? "OilPriceAPI keyless current" : "OilPriceAPI current";
  const source = hasCurrent ? `${currentSource} · sparkline: EIA official · ${current.asOf ? new Date(current.asOf).toLocaleString() : "--"}` : `${metric?.period ?? "--"} · ${sourceShort(metric)}`;
  return (
    <article className="macro-pulse-item">
      <div className="macro-pulse-label"><span>{metric?.label ?? label}</span><i className={`freshness-dot ${hasCurrent ? "current" : metric?.freshness ?? "unavailable"}`} aria-label={hasCurrent ? "current market" : metric?.freshness ?? "unavailable"} /></div>
      <div className="macro-pulse-value"><strong>{value}</strong><em>{compactUnit(metric)}</em></div>
      <div className="macro-pulse-change"><span className={change === null ? "neutral" : change >= 0 ? "positive" : "negative"}>{formatDelta(change, compactUnit(metric))}</span><small>{hasCurrent ? "24-hour move" : `vs prior ${metric?.frequency === "daily" ? "day" : metric?.frequency === "weekly" ? "week" : "month"}`}</small></div>
      <Sparkline points={metric?.history ?? []} label={metric?.label ?? label} />
      <small>{source}</small>
    </article>
  );
}

function StorageChart({ metric }: { metric?: NormalizedMarketMetric }) {
  const profile = buildStorageProfile(metric?.history ?? []);
  const available = profile.filter((point) => point.current !== null || point.priorYear !== null || point.fiveYearAverage !== null);
  const values = available.flatMap((point) => [point.current, point.priorYear, point.fiveYearMin, point.fiveYearMax]).filter((value): value is number => value !== null);
  if (values.length < 2) return <div className="macro-chart-empty">--<small>Storage history unavailable</small></div>;
  const min = Math.min(...values) * .92;
  const max = Math.max(...values) * 1.04;
  const y = (value: number) => 190 - ((value - min) / (max - min || 1)) * 155;
  const x = (week: number) => 50 + ((week - 1) / 52) * 590;
  const line = (key: "current" | "priorYear" | "fiveYearAverage") => profile.filter((point) => point[key] !== null).map((point) => `${x(point.week).toFixed(1)},${y(point[key] as number).toFixed(1)}`).join(" ");
  const ranged = profile.filter((point) => point.fiveYearMin !== null && point.fiveYearMax !== null);
  const band = [...ranged.map((point) => `${x(point.week).toFixed(1)},${y(point.fiveYearMax as number).toFixed(1)}`), ...ranged.slice().reverse().map((point) => `${x(point.week).toFixed(1)},${y(point.fiveYearMin as number).toFixed(1)}`)].join(" ");
  return (
    <div className="macro-trend-wrap">
      <svg className="macro-storage-chart" viewBox="0 0 660 220" role="img" aria-label="Lower 48 storage current year, prior year, five-year average and range">
        {[35, 112.5, 190].map((lineY) => <line key={lineY} x1="50" x2="640" y1={lineY} y2={lineY} />)}
        <text x="44" y="39" textAnchor="end">{max.toFixed(0)}</text><text x="44" y="116" textAnchor="end">{((min + max) / 2).toFixed(0)}</text><text x="44" y="194" textAnchor="end">{min.toFixed(0)}</text><text className="macro-axis-unit" x="50" y="17">Bcf</text>
        {band ? <polygon className="storage-band" points={band} /> : null}
        <polyline className="storage-average" points={line("fiveYearAverage")} /><polyline className="storage-prior" points={line("priorYear")} /><polyline className="storage-current" points={line("current")} />
        {profile.filter((point) => point.current !== null).map((point) => <circle key={point.week} cx={x(point.week)} cy={y(point.current as number)} r="2.3" className="storage-current-point"><title>Week {point.week}: {point.current} Bcf</title></circle>)}
      </svg>
      <div className="macro-chart-axis"><span>Jan</span><span>Apr</span><span>Jul</span><span>Oct</span><span>Dec</span></div>
      <div className="macro-chart-legend"><span className="current">Current year</span><span className="prior">Prior year</span><span className="average">5-year avg</span><span className="range">5-year range</span></div>
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return <div className="macro-stat"><span>{label}</span><strong>{value}</strong>{note ? <small>{note}</small> : null}</div>;
}

function UnsupportedMetric({ label, note }: { label: string; note: string }) {
  return <div className="macro-unsupported"><span>{label}</span><strong>--</strong><small>{note}</small></div>;
}

function SectionHeader({ eyebrow, title, description }: { eyebrow?: string; title: string; description: string }) {
  return <header className="macro-section-head"><div>{eyebrow ? <span>{eyebrow}</span> : null}<h2>{title}</h2></div><p>{description}</p></header>;
}

function observationLabel(period: string | null | undefined, frequency: "daily" | "weekly" | "monthly" | "annual" | undefined): string {
  if (!period) return "--";
  if (frequency === "monthly" && /^\d{4}-\d{2}$/.test(period)) {
    return new Date(`${period}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  }
  const date = new Date(`${period}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return period;
  const formatted = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return frequency === "weekly" ? `Week ending ${formatted}` : formatted;
}

export function MacroPanel() {
  const market = useMarketData();
  const fundamentals = useMacroFundamentals();
  const steo = useMacroSteo();
  const macroRisk = useMacroRisk();
  const [topic, setTopic] = useState<Topic>("gas-balance");
  const metrics = market.data?.metrics ?? [];
  const byId = new Map(metrics.map((metric) => [metric.id, metric]));
  const storageMetric = byId.get("storage");
  const lngMetric = byId.get("lng_exports");
  const productionMetric = byId.get("dry_gas_production");
  const propaneMetric = byId.get("propane_stocks");
  const henryHubMetric = byId.get("henry_hub");
  const storage = buildStorageComparison(storageMetric?.history ?? []);
  const regionalStorage = Object.values(fundamentals.data?.storage.regions ?? {});
  const productionStates = fundamentals.data?.production.states ?? {};
  const states = Object.values(productionStates);
  const demand = Object.values(fundamentals.data?.demand.series ?? {});
  const east = fundamentals.data?.storage.regions.east;
  const pa = fundamentals.data?.production.states.PA;
  const wv = fundamentals.data?.production.states.WV;
  const oh = fundamentals.data?.production.states.OH;
  const electricPower = fundamentals.data?.demand.series.electricPower;
  const industrial = fundamentals.data?.demand.series.industrial;
  const residential = fundamentals.data?.demand.series.residential;
  const commercial = fundamentals.data?.demand.series.commercial;
  const appalachia = buildAppalachiaProduction(productionStates);
  const snapshot = buildMacroSnapshot(metrics, {
    eastStoragePct: east?.fiveYearPct,
    paProductionYoyPct: pa?.yearOverYearPct
  });
  const gasBalance = classifyGasBalance(storage?.versusAveragePct ?? null, lngMetric ? periodChangePct(lngMetric, 12) : null);
  const productionBcfd = monthlyMmcfToBcfd(productionMetric?.value ?? null, productionMetric?.period ?? null);
  const currentQuotes = market.data?.currentMarket;

  const steoSeries = steo.data?.status === "ok" ? steo.data.series : undefined;
  // EIA STEO series carry ~16 years of historical tail alongside the genuine
  // forecast horizon in one array (confirmed live). Every series in a single
  // STEO fetch shares one forecast-start month; derive it from the most
  // reliable monthly actual available (dry gas production) so the dashed
  // "(forecast)" styling is only ever applied to real forward projections,
  // never to STEO's own historical estimate.
  const steoForecastStartPeriod = productionMetric?.period ? shiftMonth(productionMetric.period, 1) : null;
  function forecastSeries(key: SteoSeriesKey, color: string): ChartSeries | null {
    const series = steoSeries?.[key];
    if (!series) return null;
    const horizon = filterToForecastHorizon(series.points, steoForecastStartPeriod);
    if (!horizon.length) return null;
    return { id: `${key}-forecast`, label: series.label, color, history: horizon, forecast: true };
  }

  // Actual EIA fundamentals are all MMcf/month; EIA STEO forecasts are mostly Bcf/d.
  // Every actual paired with a forecast below is converted to Bcf/d via toBcfdSeries
  // first, so the two lines share one real unit -- never overlaid raw. Henry Hub
  // (actual is $/MMBtu, STEO is $/Mcf -- a different, unconverted price basis) and
  // electric power consumption (STEO reports this one series in a bare "billion
  // cubic feet" with no confirmed daily-rate convention) are deliberately shown
  // forecast-only rather than combined with an unverified conversion.
  const eiaOutlookMetrics: EiaOutlookMetricOption[] = [
    { key: "henryHubForecast", fallbackLabel: "Henry Hub forecast" },
    { key: "dryGasProductionForecast", fallbackLabel: "Dry gas production forecast", actual: productionMetric ? { history: toBcfdSeries(productionMetric.history), label: "U.S. dry gas production (actual)", unit: "Bcf/d", frequency: productionMetric.frequency } : undefined },
    { key: "workingGasStorageForecast", fallbackLabel: "Working gas storage forecast", actual: storageMetric ? { history: storageMetric.history, label: "Lower-48 working gas (actual, weekly)", unit: storageMetric.unit, frequency: storageMetric.frequency } : undefined },
    { key: "lngExportsForecast", fallbackLabel: "LNG exports forecast", actual: lngMetric ? { history: toBcfdSeries(lngMetric.history), label: "U.S. LNG exports (actual)", unit: "Bcf/d", frequency: lngMetric.frequency } : undefined },
    { key: "electricPowerConsumptionForecast", fallbackLabel: "Electric power consumption forecast" },
    { key: "industrialConsumptionForecast", fallbackLabel: "Industrial consumption forecast", actual: industrial ? { history: toBcfdSeries(industrial.history), label: "Industrial demand (actual)", unit: "Bcf/d", frequency: industrial.frequency } : undefined },
    { key: "residentialConsumptionForecast", fallbackLabel: "Residential consumption forecast", actual: residential ? { history: toBcfdSeries(residential.history), label: "Residential demand (actual)", unit: "Bcf/d", frequency: residential.frequency } : undefined },
    { key: "commercialConsumptionForecast", fallbackLabel: "Commercial consumption forecast", actual: commercial ? { history: toBcfdSeries(commercial.history), label: "Commercial demand (actual)", unit: "Bcf/d", frequency: commercial.frequency } : undefined },
    { key: "totalConsumptionForecast", fallbackLabel: "Total consumption forecast" }
  ];

  return (
    <div className="macro-panel">
      <header className="macro-page-head">
        <div><h1>Natural Gas &amp; NGL Intelligence</h1><p>U.S. EIA · EIA APIs</p></div>
        <div className="macro-asof"><span>Market API generated</span><strong>{market.data?.generatedAt ? new Date(market.data.generatedAt).toLocaleString() : market.loading ? "Loading…" : "--"}</strong>{market.error ?? fundamentals.error ? <small>{market.error ?? fundamentals.error}</small> : null}</div>
      </header>

      <section className="macro-section macro-pulse">
        <SectionHeader eyebrow="MARKET PULSE" title="Cross-commodity tape" description="Sources: U.S. EIA · OilPriceAPI" />
        <div className="macro-pulse-grid">{PULSE_IDS.map((id) => <PulseMetric key={id} metric={byId.get(id)} label={id.replaceAll("_", " ")} current={id === "henry_hub" ? currentQuotes?.henryHub : id === "wti" ? currentQuotes?.wti : undefined} />)}</div>
      </section>

      <nav className="macro-segmented macro-topic-tabs" aria-label="Macro topic">
        {TOPICS.map((item) => (
          <button key={item.id} type="button" aria-pressed={topic === item.id} className={topic === item.id ? "active" : ""} onClick={() => setTopic(item.id)}>{item.label}</button>
        ))}
      </nav>

      {topic === "gas-balance" ? (
        <section className="macro-grid-row macro-grid-row-rrc">
          <article className="macro-section macro-grid-card">
            <SectionHeader eyebrow="GAS BALANCE" title="Is the U.S. gas market tightening or loosening?" description="Storage deviation and LNG export growth only -- deliberately not a raw production-minus-consumption figure, since those EIA series differ in scope and would be an incompatible-unit aggregation." />
            <div className="macro-rrc-grid polished">
              <div className={`macro-rrc-callout ${gasBalance.gasState === "Tightening" ? "positive" : gasBalance.gasState === "Loosening" ? "negative" : ""}`}>
                <span className="rrc-macro-risk-label"><b>NATIONAL</b> <em>Gas Balance</em></span>
                <strong>{gasBalance.gasState}</strong>
                <p>Storage is {formatPct(gasBalance.storagePct)} versus its five-year average ({gasBalance.storageState}); LNG exports are {formatPct(gasBalance.lngYoY)} year over year ({gasBalance.lngState}). Tightening requires storage at least 5% below normal and LNG exports growing at least 5% YoY; loosening requires the inverse.</p>
                <small>Is the environment more or less supportive for Range: a Tightening read (low storage + growing LNG demand) is directionally supportive for gas price realizations; Loosening is directionally unsupportive.</small>
              </div>
              <div className="macro-regional-grid appalachia">
                <Stat label="Storage vs 5Y avg" value={formatPct(gasBalance.storagePct)} note={gasBalance.storageState} />
                <Stat label="LNG exports YoY" value={formatPct(gasBalance.lngYoY)} note={gasBalance.lngState} />
                <Stat label="Dry gas production YoY" value={formatPct(productionMetric ? periodChangePct(productionMetric, 12) : null)} note={observationLabel(productionMetric?.period, "monthly")} />
                <Stat label="Electric power demand YoY" value={formatPct(monthlyYoy(electricPower?.history ?? []))} note={observationLabel(electricPower?.period, "monthly")} />
                <Stat label="Industrial demand YoY" value={formatPct(monthlyYoy(industrial?.history ?? []))} note={observationLabel(industrial?.period, "monthly")} />
                <Stat label="Henry Hub trend" value={formatDelta(henryHubMetric ? periodChange(henryHubMetric) : null, "$/MMBtu")} note="Latest official daily move" />
              </div>
            </div>
          </article>
          <article className="macro-section macro-grid-card macro-snapshot-section">
            <SectionHeader eyebrow="EVIDENCE" title="Macro snapshot" description="Deterministic classifications; select a row for its rule and inputs." />
            <div className="macro-snapshot compact" aria-label="Macro snapshot">{snapshot.map((item) => <details key={item.label} className={`macro-snapshot-item ${item.tone}`}><summary><span>{item.label}</span><strong>{item.state}</strong></summary><p>{item.rule}</p><small>{item.inputs}</small></details>)}</div>
          </article>
        </section>
      ) : null}

      {topic === "storage" ? (
        <section className="macro-section macro-storage-section">
          <SectionHeader title="U.S. natural gas storage" description="Current year against prior year, same-week five-year average, and the full historical range." />
          <div className="macro-balance-grid">
            <div className="macro-primary-chart"><div className="macro-card-title"><div><h3>Lower-48 working gas</h3><span className="macro-source-accent">{observationLabel(storageMetric?.period, "weekly")} · Weekly · U.S. EIA</span></div><strong>{formatMetricValue(storageMetric)} <small>Bcf</small></strong></div><StorageChart metric={storageMetric} /></div>
            <aside className="macro-weekly-report"><div><span>LATEST WEEKLY REPORT</span><strong>{formatMetricValue(storageMetric)} <small>Bcf</small></strong><p>{observationLabel(storageMetric?.period, "weekly")}</p></div><div className="macro-balance-stats">
              <Stat label="Weekly injection / withdrawal" value={formatDelta(storage?.weeklyChange ?? null, "Bcf")} note="injection (+) / withdrawal (−)" />
              <Stat label="vs 5-year average" value={formatDelta(storage?.versusAverage ?? null, "Bcf")} note={formatPct(storage?.versusAveragePct ?? null)} />
              <Stat label="vs year ago" value={formatDelta(storage?.yearOverYear ?? null, "Bcf")} note={storage?.priorYear && storage.yearOverYear !== null ? formatPct((storage.yearOverYear / storage.priorYear) * 100) : "--"} />
              <Stat label="5-year same-week range" value={storage?.fiveYearMin != null && storage?.fiveYearMax != null ? `${storage.fiveYearMin.toFixed(0)}–${storage.fiveYearMax.toFixed(0)} Bcf` : "--"} />
            </div></aside>
          </div>
          <div className="macro-subsection-head"><div><span>REGIONAL STORAGE</span><h3>Regional Working Gas Storage vs. Five-Year Average</h3></div><p>Official EIA regions</p></div>
          <RegionalStorageTable regions={regionalStorage} />
          {forecastSeries("workingGasStorageForecast", "#e5ad63") ? (
            <>
              <div className="macro-subsection-head compact"><div><span>EIA STEO OUTLOOK</span><h3>Working gas storage forecast</h3></div></div>
              <HistoricalLineChart ariaLabel="EIA STEO working gas storage forecast" unit={steoSeries?.workingGasStorageForecast?.unit ?? "Bcf"} limit={24} series={[forecastSeries("workingGasStorageForecast", "#e5ad63") as ChartSeries]} />
            </>
          ) : null}
          <p className="macro-context-note">The interactive storage/production geography map lives under the Rigs tab, alongside the Baker Hughes rig-count overlay it shares a toggle with.</p>
        </section>
      ) : null}

      {topic === "supply" ? (
        <section className="macro-section">
          <SectionHeader eyebrow="SUPPLY" title="Dry-gas supply: actual vs. EIA forecast" description="Monthly national dry production converted to Bcf/d to match EIA STEO's own forecast unit; state ranking uses marketed production. Dashed line is the projection, not an observed value." />
          <div className="macro-primary-chart borderless">
            <div className="macro-card-title"><div><h3>U.S. dry natural gas production</h3><span>{observationLabel(productionMetric?.period, "monthly")} · Monthly · {sourceShort(productionMetric)}</span></div><strong>{productionBcfd === null ? "--" : productionBcfd.toFixed(1)} <small>Bcf/d</small></strong></div>
            <HistoricalLineChart
              ariaLabel="U.S. dry natural gas production, actual and EIA STEO forecast"
              unit="Bcf/d"
              limit={60}
              series={[{ id: "dry-gas", label: "U.S. dry gas (actual)", color: "#3db3e3", history: toBcfdSeries(productionMetric?.history ?? []) }, forecastSeries("dryGasProductionForecast", "#e5ad63")].filter((entry): entry is ChartSeries => entry !== null)}
            />
            <div className="macro-inline-stats"><Stat label="Year-over-year" value={formatPct(productionMetric ? periodChangePct(productionMetric, 12) : null)} /><Stat label="Latest native observation" value={formatMetricValue(productionMetric)} note={compactUnit(productionMetric)} /></div>
          </div>
          <div className="macro-subsection-head compact"><div><span>TOP PRODUCING STATES</span><h3>Latest marketed production</h3></div></div><StateProductionRanking states={states} />
        </section>
      ) : null}

      {topic === "appalachia" ? (
        <section className="macro-section">
          <SectionHeader eyebrow="APPALACHIA / RANGE" title="PA + WV + OH marketed production" description="EIA does not publish a &quot;Marcellus production&quot; series -- this sums marketed production for the three states EIA does report, the closest available Appalachia proxy." />
          <div className="macro-primary-chart borderless">
            <div className="macro-card-title"><div><h3>PA + WV + OH marketed production</h3><span>{observationLabel(appalachia.period, "monthly")} · Monthly · U.S. EIA</span></div><strong>{appalachia.current === null ? "--" : new Intl.NumberFormat("en-US").format(appalachia.current)} <small>MMcf/month</small></strong></div>
            <HistoricalLineChart ariaLabel="PA + WV + OH marketed production history" unit="MMcf/month" limit={36} series={[{ id: "appalachia", label: `${appalachia.statesIncluded.join(" + ") || "PA + WV + OH"} marketed production`, color: "#70c99a", history: appalachia.history }]} />
            <div className="macro-inline-stats"><Stat label="Year-over-year" value={formatPct(appalachia.yearOverYearPct)} /><Stat label="Month-over-month" value={formatPct(appalachia.monthOverMonthPct)} /></div>
            <p className="appalachia-label-note">States included: {appalachia.statesIncluded.length ? appalachia.statesIncluded.join(", ") : "none available"}. This is a state-level EIA aggregate, not an official Marcellus-play figure -- it is never labeled as "Marcellus production".</p>
          </div>
          <div className="macro-regional-grid appalachia"><Stat label="East storage vs 5Y" value={formatPct(east?.fiveYearPct ?? null)} note={`${east?.current?.toFixed(0) ?? "--"} Bcf · ${observationLabel(east?.period, "weekly")}`} /><Stat label="PA production YoY" value={formatPct(pa?.yearOverYearPct ?? null)} note={`${pa?.current?.toFixed(0) ?? "--"} MMcf · ${observationLabel(pa?.period, "monthly")}`} /><Stat label="WV production YoY" value={formatPct(wv?.yearOverYearPct ?? null)} note={observationLabel(wv?.period, "monthly")} /><Stat label="OH production YoY" value={formatPct(oh?.yearOverYearPct ?? null)} note={observationLabel(oh?.period, "monthly")} /><Stat label="LNG exports YoY" value={formatPct(lngMetric ? periodChangePct(lngMetric, 12) : null)} note={observationLabel(lngMetric?.period, "monthly")} /><Stat label="Henry Hub trend" value={formatDelta(henryHubMetric ? periodChange(henryHubMetric) : null, "$/MMBtu")} note="Latest official daily move" /></div>

          <MacroRiskWidget data={macroRisk.data} loading={macroRisk.loading} error={macroRisk.error} onViewDriver={(driver) => setTopic(RISK_DRIVER_TOPIC[driver])} />
        </section>
      ) : null}

      {topic === "lng" ? (
        <section className="macro-section">
          <SectionHeader eyebrow="LNG" title="U.S. LNG exports: actual vs. EIA forecast" description="Observed monthly exports converted to Bcf/d to match EIA STEO's own forecast unit, plus the EIA Short-Term Energy Outlook projection, clearly separated from forward capacity assumptions." />
          <div className="macro-primary-chart borderless">
            <div className="macro-card-title"><div><h3>Monthly LNG export trend</h3><span>{observationLabel(lngMetric?.period, "monthly")} · Monthly · {sourceShort(lngMetric)}</span></div><strong>{formatMetricValue(lngMetric)} <small>{compactUnit(lngMetric)}</small></strong></div>
            <HistoricalLineChart
              ariaLabel="U.S. LNG exports, actual and EIA STEO forecast"
              unit="Bcf/d"
              limit={60}
              series={[{ id: "lng", label: "LNG exports (actual)", color: "#70c99a", history: toBcfdSeries(lngMetric?.history ?? []) }, forecastSeries("lngExportsForecast", "#e5ad63")].filter((entry): entry is ChartSeries => entry !== null)}
            />
            <div className="macro-inline-stats"><Stat label="Year-over-year growth" value={formatPct(lngMetric ? periodChangePct(lngMetric, 12) : null)} /><Stat label="Latest observation" value={observationLabel(lngMetric?.period, "monthly")} note="Monthly · U.S. EIA" /></div>
            <p className="macro-context-note">Rising LNG exports increase structural U.S. natural-gas demand and are strategically relevant to Range&apos;s gas exposure. The EIA-labeled LNG-specific series (NGEXPUS_LNG) is used here, not the broader total gross-exports series that also includes pipeline exports.</p>
          </div>
        </section>
      ) : null}

      {topic === "demand" ? (
        <section className="macro-grid-row macro-grid-row-demand">
          <article className="macro-section macro-grid-card">
            <SectionHeader eyebrow="NATURAL GAS DEMAND" title="Consumption by end use" description="Monthly EIA observations; electric power and industrial demand lead the visual hierarchy." />
            <div className="macro-primary-chart borderless"><div className="macro-card-title"><div><h3>U.S. demand by sector</h3><span>{observationLabel(electricPower?.period, "monthly")} · Monthly · U.S. EIA</span></div><small>{fundamentals.data?.demand.status === "ok" ? "Observed EIA" : "Unavailable"}</small></div><DemandChart demand={demand} /><div className="macro-inline-stats"><Stat label="Electric power YoY" value={formatPct(monthlyYoy(electricPower?.history ?? []))} note={observationLabel(electricPower?.period, "monthly")} /><Stat label="Industrial YoY" value={formatPct(monthlyYoy(industrial?.history ?? []))} note={observationLabel(industrial?.period, "monthly")} /></div></div>
            <div className="macro-subsection-head compact"><div><span>EIA STEO OUTLOOK</span><h3>Electric power demand forecast</h3></div></div>
            {forecastSeries("electricPowerConsumptionForecast", "#e5ad63") ? (
              <HistoricalLineChart ariaLabel="Electric power demand, EIA STEO forecast" unit={steoSeries?.electricPowerConsumptionForecast?.unit ?? "Bcf"} limit={24} series={[forecastSeries("electricPowerConsumptionForecast", "#e5ad63") as ChartSeries]} />
            ) : <div className="macro-chart-empty">--<small>EIA STEO forecast unavailable</small></div>}
            <p className="macro-context-note">Not overlaid with the observed actual above: EIA reports this STEO series in "{steoSeries?.electricPowerConsumptionForecast?.unit ?? "billion cubic feet"}", a different unit convention than the other STEO consumption series, and it is not combined with the MMcf/month actual without a confirmed conversion.</p>
            <div className="macro-subsection-head compact"><div><span>EIA STEO OUTLOOK</span><h3>Industrial demand: actual vs. forecast</h3></div></div>
            <HistoricalLineChart ariaLabel="Industrial demand, actual and EIA STEO forecast" unit="Bcf/d" limit={36} series={[{ id: "industrial-actual", label: "Industrial (actual)", color: "#70c99a", history: toBcfdSeries(industrial?.history ?? []) }, forecastSeries("industrialConsumptionForecast", "#e5ad63")].filter((entry): entry is ChartSeries => entry !== null)} />
            <div className="macro-structural-outlook compact"><div><span>STRUCTURAL OUTLOOK</span><h3>Long-run drivers stay separate</h3><p>No dated project-research series is blended into observed EIA history.</p></div><UnsupportedMetric label="LNG capacity" note="Project source required" /><UnsupportedMetric label="AI / data centers" note="Third-party estimate required" /></div>
          </article>
          <article className="macro-section macro-grid-card">
            <SectionHeader eyebrow="NGL" title="U.S. propane inventories" description="Weekly fractionated propane stocks with near-term and annual comparison." />
            <div className="macro-primary-chart borderless"><div className="macro-card-title"><div><h3>Propane inventory history</h3><span>{observationLabel(propaneMetric?.period, "weekly")} · Weekly · {sourceShort(propaneMetric)}</span></div><strong>{formatMetricValue(propaneMetric)} <small>Mbbl</small></strong></div><HistoricalLineChart ariaLabel="U.S. propane inventory history" unit="Mbbl" limit={104} series={[{ id: "propane", label: "Propane inventories", color: "#e5ad63", history: propaneMetric?.history ?? [] }]} /><div className="macro-inline-stats"><Stat label="Weekly change" value={formatDelta(propaneMetric ? periodChange(propaneMetric) : null, "Mbbl")} /><Stat label="Year-over-year" value={formatPct(propaneMetric ? periodChangePct(propaneMetric, 52) : null)} /></div></div>
            <div className="macro-unsupported-row"><UnsupportedMetric label="Ethane exports" note="No normalized series" /><UnsupportedMetric label="NGL pricing" note="No supported live series" /></div>
          </article>
        </section>
      ) : null}

      {topic === "eia-outlook" ? (
        <section className="macro-section">
          <SectionHeader eyebrow="EIA OUTLOOK" title="Short-Term Energy Outlook" description="EIA's own forward projection, actual-vs-forecast where an observed counterpart exists, with forecast revisions once a second monthly snapshot has been captured." />
          <EiaOutlookModule steo={steo.data} loading={steo.loading} error={steo.error} metrics={eiaOutlookMetrics} forecastStartPeriod={steoForecastStartPeriod} />
        </section>
      ) : null}

      {topic === "rigs" ? (
        <section className="macro-section">
          <SectionHeader eyebrow="RIGS" title="Drilling activity" description="Baker Hughes weekly rig counts by basin and state, alongside the storage/production geography map." />
          <MacroEnergyMap data={fundamentals.data} />
        </section>
      ) : null}

      <footer className="macro-freshness">
        <div><strong>DATA FRESHNESS</strong><span>Observation period and retrieval timestamp are tracked separately; publication weekdays are not assumed.</span></div>
        <div className="macro-freshness-list">
          {metrics.map((metric) => <span key={metric.id}><i className={`freshness-dot ${metric.freshness}`} />EIA · {metric.label}: {observationLabel(metric.period, metric.frequency)} · {metric.frequency} · {metric.freshness} · retrieved {new Date(metric.fetchedAt).toLocaleString()}</span>)}
          {currentQuotes ? Object.values(currentQuotes).map((quote) => <span key={quote.id}><i className={`freshness-dot ${quote.status === "ok" ? "current" : "unavailable"}`} />OilPriceAPI · {quote.label}: {quote.asOf ? new Date(quote.asOf).toLocaleString() : "--"} · current market · {quote.dataStatus ?? quote.status}</span>) : null}
          <span><i className={`freshness-dot ${east?.freshness ?? "unavailable"}`} />EIA · regional storage: {observationLabel(east?.period, "weekly")} · weekly · {east?.freshness ?? "unavailable"} · retrieved {fundamentals.data?.generatedAt ? new Date(fundamentals.data.generatedAt).toLocaleString() : "--"}</span>
        </div>
      </footer>
    </div>
  );
}
