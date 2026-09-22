"use client";

import { useMarketData } from "@/lib/market/use-market-data";
import { useMacroFundamentals } from "@/lib/market/use-macro-fundamentals";
import { useMacroSteo } from "@/lib/market/use-macro-steo";
import { useMacroRisk } from "@/lib/market/use-macro-risk";
import type { CurrentMarketCommodityQuote, MarketObservation, NormalizedMarketMetric } from "@/lib/market/types";
import type { SteoSeriesKey } from "@/lib/market/macro-steo-types";
import type { RangeMacroSignalKey } from "@/lib/market/macro-risk-engine";
import { snapshotMonthFrom } from "@/lib/market/macro-steo";
import { getRigDataset } from "@/lib/rigs/rig-data";
import { formatDataDate, formatRefreshTimestamp, formatWeekEnding } from "@/lib/market/format-dates";
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

// The long-form page (matching the pre-tab e61e0ac architecture) renders every
// section simultaneously -- this is no longer tab-gating, just a compact
// quick-jump row. Clicking an item scrolls to its section; it never
// hides/unmounts any other section.
const QUICK_JUMP: { id: string; label: string }[] = [
  { id: "gas-balance", label: "Gas Balance" },
  { id: "storage", label: "Storage" },
  { id: "map-rigs", label: "Map & Rigs" },
  { id: "supply", label: "Supply" },
  { id: "lng", label: "LNG" },
  { id: "demand", label: "Demand" },
  { id: "ngl", label: "NGL" },
  { id: "appalachia", label: "Appalachia" },
  { id: "eia-outlook", label: "EIA Outlook" }
];

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

const RISK_DRIVER_SECTION: Record<RangeMacroSignalKey, string> = {
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
  // A metric with status "unavailable" AND a captured .error came from a real
  // upstream fetch failure (buildNormalizedMarketMetrics only ever reaches
  // "unavailable" via a caught exception -- see normalizeFailure in
  // lib/market/build-market-metrics.ts), not from "no observation published
  // yet". Surfacing it here keeps a genuine source error from rendering
  // identically to formatMetricValue's ordinary "--" placeholder.
  const hasError = !hasCurrent && metric?.status === "unavailable" && Boolean(metric.error);
  const change = hasCurrent ? current.change24hAmount : metric ? periodChange(metric) : null;
  const value = hasCurrent ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(current.price as number) : formatMetricValue(metric);
  const currentSource = current?.dataStatus === "keyless-demo" ? "OilPriceAPI keyless current" : "OilPriceAPI current";
  const source = hasCurrent
    ? `${currentSource} · sparkline: EIA official · ${formatRefreshTimestamp(current.asOf)}`
    : hasError
      ? `Source error: ${metric!.error}`
      : `${metric?.period ?? "--"} · ${sourceShort(metric)}`;
  return (
    <article className="macro-pulse-item">
      <div className="macro-pulse-label"><span>{metric?.label ?? label}</span><i className={`freshness-dot ${hasCurrent ? "current" : hasError ? "error" : metric?.freshness ?? "unavailable"}`} aria-label={hasCurrent ? "current market" : hasError ? "source error" : metric?.freshness ?? "unavailable"} /></div>
      <div className="macro-pulse-value"><strong>{value}</strong><em>{compactUnit(metric)}</em></div>
      <div className="macro-pulse-change"><span className={change === null ? "neutral" : change >= 0 ? "positive" : "negative"}>{formatDelta(change, compactUnit(metric))}</span><small>{hasCurrent ? "24-hour move" : `vs prior ${metric?.frequency === "daily" ? "day" : metric?.frequency === "weekly" ? "week" : "month"}`}</small></div>
      <Sparkline points={metric?.history ?? []} label={metric?.label ?? label} />
      <small className={hasError ? "negative" : undefined} title={hasError ? source : undefined}>{source}</small>
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

function SectionHeader({ eyebrow, title, description, asOf }: { eyebrow?: string; title: string; description: string; asOf?: string }) {
  return <header className="macro-section-head"><div>{eyebrow ? <span>{eyebrow}</span> : null}<h2>{title}</h2></div><p>{description}{asOf ? <span className="macro-section-asof"> · {asOf}</span> : null}</p></header>;
}

/** freshness is optional -- pass it wherever the source metric carries a MarketFreshness/DemandMetric-style freshness field so a stale observation says so ("Data through Jul 2026 · Stale") instead of looking identical to a current one. Types (StateProductionMetric, the Appalachia summary) that don't carry a freshness classification at all simply omit it, rather than fabricating one. */
function observationLabel(period: string | null | undefined, frequency: "daily" | "weekly" | "monthly" | "annual" | undefined, freshness?: "current" | "lagged" | "stale" | "unavailable"): string {
  if (!period) return "--";
  let formatted: string;
  if (frequency === "monthly" && /^\d{4}-\d{2}$/.test(period)) {
    formatted = new Date(`${period}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
  } else {
    const date = new Date(`${period}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return period;
    const dateOnly = date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
    formatted = frequency === "weekly" ? `Week ending ${dateOnly}` : dateOnly;
  }
  return freshness === "stale" ? `${formatted} · Stale` : formatted;
}

export function MacroPanel() {
  const market = useMarketData();
  const fundamentals = useMacroFundamentals();
  const steo = useMacroSteo();
  const macroRisk = useMacroRisk();
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
  function steoVintageLabel(key: SteoSeriesKey): string {
    const series = steoSeries?.[key];
    return series ? `STEO ${formatDataDate(snapshotMonthFrom(series.fetchedAt))}` : "STEO --";
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

  // Every series in one STEO fetch shares a single fetchedAt (one upstream call) -- henryHubForecast
  // is always requested (see eiaOutlookMetrics above), so it's a safe representative snapshot date.
  const steoObservation = steoSeries?.henryHubForecast ? formatDataDate(snapshotMonthFrom(steoSeries.henryHubForecast.fetchedAt)) : "--";

  // Compact "N/M feeds current" footer summary (Data Sources & Freshness) --
  // reuses each feed's own already-computed status/freshness field, no new
  // business logic. "Lagged" counts as current: it is a source's own normal
  // publication cadence, not a fault (a EIA weekly series is legitimately
  // several days behind a daily one on the same page). Baker Hughes is
  // manually imported, not part of the live-fetch pipeline this count is
  // meant to describe, so it is listed in detail below but excluded here.
  const freshnessChecks: boolean[] = [
    ...metrics.map((metric) => metric.freshness !== "stale" && metric.freshness !== "unavailable"),
    ...(currentQuotes ? Object.values(currentQuotes).map((quote) => quote.status === "ok") : []),
    east ? east.freshness !== "stale" && east.freshness !== "unavailable" : false,
    steo.data?.status === "ok"
  ];
  const freshnessCurrentCount = freshnessChecks.filter(Boolean).length;
  const freshnessTotalCount = freshnessChecks.length;

  return (
    <div className="macro-panel">
      <header className="macro-page-head">
        <div><h1>Natural Gas &amp; NGL Intelligence</h1><p>U.S. EIA · EIA APIs</p></div>
        <div className="macro-asof">
          <span>LAST UPDATED</span>
          <strong>{macroRisk.loading ? "Loading…" : formatRefreshTimestamp(macroRisk.data?.lastOrchestrationAt)}</strong>
          <small className="macro-asof-note">Most recent successful Macro refresh. Sources update on different schedules; each chart shows its own reporting period.</small>
          {market.error ?? fundamentals.error ? <small>{market.error ?? fundamentals.error}</small> : null}
        </div>
      </header>

      <section className="macro-section macro-pulse" id="market-pulse">
        <SectionHeader eyebrow="01 · MARKET PULSE" title="Cross-commodity tape" description="Sources: U.S. EIA · OilPriceAPI" />
        <div className="macro-pulse-grid">{PULSE_IDS.map((id) => <PulseMetric key={id} metric={byId.get(id)} label={id.replaceAll("_", " ")} current={id === "henry_hub" ? currentQuotes?.henryHub : id === "wti" ? currentQuotes?.wti : undefined} />)}</div>
      </section>

      <nav className="macro-segmented macro-quickjump" aria-label="Macro quick jump">
        {QUICK_JUMP.map((item) => (
          <button key={item.id} type="button" onClick={() => scrollToSection(item.id)}>{item.label}</button>
        ))}
      </nav>

      <section className="macro-grid-row macro-grid-row-rrc" id="gas-balance">
        <article className="macro-section macro-grid-card">
          <SectionHeader eyebrow="02 · GAS BALANCE" title="Is the U.S. gas market tightening or loosening?" description="Storage deviation and LNG export growth only -- deliberately not a raw production-minus-consumption figure, since those EIA series differ in scope and would be an incompatible-unit aggregation." asOf={`Storage ${storageMetric?.period ? formatWeekEnding(storageMetric.period) : "--"}${storageMetric?.freshness === "stale" ? " (stale)" : ""} · LNG ${lngMetric?.period ? formatDataDate(lngMetric.period) : "--"}${lngMetric?.freshness === "stale" ? " (stale)" : ""}`} />
          <div className="macro-rrc-grid polished">
            <div className={`macro-rrc-callout ${gasBalance.gasState === "Tightening" ? "positive" : gasBalance.gasState === "Loosening" ? "negative" : ""}`}>
              <span className="rrc-macro-risk-label"><b>Gas Balance</b></span>
              <strong>{gasBalance.gasState}</strong>
              <p>Storage is {formatPct(gasBalance.storagePct)} versus its five-year average ({gasBalance.storageState}); LNG exports are {formatPct(gasBalance.lngYoY)} year over year ({gasBalance.lngState}). <span className="macro-info-tip" tabIndex={0} title="Tightening requires storage at least 5% below normal and LNG exports growing at least 5% YoY; loosening requires the inverse.">Classification rule ⓘ</span></p>
              <small>Is the environment more or less supportive for Range: a Tightening read (low storage + growing LNG demand) is directionally supportive for gas price realizations; Loosening is directionally unsupportive.</small>
            </div>
            <div className="macro-regional-grid appalachia">
              <Stat label="Storage vs 5Y avg" value={formatPct(gasBalance.storagePct)} note={gasBalance.storageState} />
              <Stat label="LNG exports YoY" value={formatPct(gasBalance.lngYoY)} note={gasBalance.lngState} />
              <Stat label="Dry gas production YoY" value={formatPct(productionMetric ? periodChangePct(productionMetric, 12) : null)} note={observationLabel(productionMetric?.period, "monthly", productionMetric?.freshness)} />
              <Stat label="Electric power demand YoY" value={formatPct(monthlyYoy(electricPower?.history ?? []))} note={observationLabel(electricPower?.period, "monthly", electricPower?.freshness)} />
              <Stat label="Industrial demand YoY" value={formatPct(monthlyYoy(industrial?.history ?? []))} note={observationLabel(industrial?.period, "monthly", industrial?.freshness)} />
              <Stat label="Henry Hub trend" value={formatDelta(henryHubMetric ? periodChange(henryHubMetric) : null, "$/MMBtu")} note="Latest official daily move" />
            </div>
          </div>
        </article>
        <article className="macro-section macro-grid-card macro-snapshot-section">
          <SectionHeader title="Macro snapshot" description="Select a row for its exact rule and inputs." />
          <div className="macro-snapshot compact" aria-label="Macro snapshot">{snapshot.map((item) => <details key={item.label} className={`macro-snapshot-item ${item.tone}`}><summary><span>{item.label}</span><strong>{item.state}</strong></summary><p>{item.rule}</p><small>{item.inputs}</small></details>)}</div>
        </article>
      </section>

      <section className="macro-section macro-storage-section" id="storage">
        <SectionHeader eyebrow="03 · U.S. NATURAL GAS STORAGE" title="U.S. natural gas storage" description="Current year against prior year, same-week five-year average, and the full historical range." />
        <div className="macro-balance-grid">
          <div className="macro-primary-chart"><div className="macro-card-title"><div><h3>Lower-48 working gas</h3><span className="macro-source-accent">{observationLabel(storageMetric?.period, "weekly", storageMetric?.freshness)} · Weekly · U.S. EIA</span></div><strong>{formatMetricValue(storageMetric)} <small>Bcf</small></strong></div><StorageChart metric={storageMetric} /></div>
          <aside className="macro-weekly-report"><div><span>LATEST WEEKLY REPORT</span><strong>{formatMetricValue(storageMetric)} <small>Bcf</small></strong><p>{observationLabel(storageMetric?.period, "weekly", storageMetric?.freshness)}</p></div><div className="macro-balance-stats">
            <Stat label="Weekly injection / withdrawal" value={formatDelta(storage?.weeklyChange ?? null, "Bcf")} note="injection (+) / withdrawal (−)" />
            <Stat label="vs 5-year average" value={formatDelta(storage?.versusAverage ?? null, "Bcf")} note={formatPct(storage?.versusAveragePct ?? null)} />
            <Stat label="vs year ago" value={formatDelta(storage?.yearOverYear ?? null, "Bcf")} note={storage?.priorYear && storage.yearOverYear !== null ? formatPct((storage.yearOverYear / storage.priorYear) * 100) : "--"} />
            <Stat label="5-year same-week range" value={storage?.fiveYearMin != null && storage?.fiveYearMax != null ? `${storage.fiveYearMin.toFixed(0)}–${storage.fiveYearMax.toFixed(0)} Bcf` : "--"} />
          </div></aside>
        </div>
        <div className="macro-subsection-head"><div><span>REGIONAL STORAGE</span><h3>Regional Working Gas Storage vs. Five-Year Average</h3></div><p>Official EIA regions · {east?.period ? formatWeekEnding(east.period) : "--"}{east?.freshness === "stale" ? " · Stale" : ""}</p></div>
        <RegionalStorageTable regions={regionalStorage} />
        {forecastSeries("workingGasStorageForecast", "#e5ad63") ? (
          <>
            <div className="macro-subsection-head compact"><div><span>EIA STEO OUTLOOK</span><h3>Working gas storage forecast</h3></div><p>{steoVintageLabel("workingGasStorageForecast")}</p></div>
            <HistoricalLineChart ariaLabel="EIA STEO working gas storage forecast" unit={steoSeries?.workingGasStorageForecast?.unit ?? "Bcf"} limit={24} series={[forecastSeries("workingGasStorageForecast", "#e5ad63") as ChartSeries]} />
          </>
        ) : null}
        <p className="macro-context-note">The interactive storage/production geography map, with the Baker Hughes rig-count overlay, is in the next section below.</p>
      </section>

      <section className="macro-section" id="map-rigs">
        <SectionHeader eyebrow="04 · INTERACTIVE ENERGY MAP + RIGS" title="Storage regions, state production and drilling activity" description="Baker Hughes weekly rig counts by basin and state, alongside the storage/production geography map." asOf={formatWeekEnding(getRigDataset().source.reportDate)} />
        <MacroEnergyMap data={fundamentals.data} />
      </section>

      <section className="macro-section" id="supply">
        <SectionHeader eyebrow="05 · U.S. GAS PRODUCTION" title="Dry-gas supply: actual vs. EIA forecast" description="Monthly national dry production converted to Bcf/d to match EIA STEO's own forecast unit; state ranking uses marketed production. Dashed line is the projection, not an observed value." />
        <div className="macro-primary-chart borderless">
          <div className="macro-card-title"><div><span className="macro-source-accent">{observationLabel(productionMetric?.period, "monthly", productionMetric?.freshness)} · Monthly · {sourceShort(productionMetric)}</span></div><strong>{productionBcfd === null ? "--" : productionBcfd.toFixed(1)} <small>Bcf/d</small></strong></div>
          <HistoricalLineChart
            ariaLabel="U.S. dry natural gas production, actual and EIA STEO forecast"
            unit="Bcf/d"
            limit={60}
            series={[{ id: "dry-gas", label: "U.S. dry gas (actual)", color: "#3db3e3", history: toBcfdSeries(productionMetric?.history ?? []) }, forecastSeries("dryGasProductionForecast", "#e5ad63")].filter((entry): entry is ChartSeries => entry !== null)}
          />
          <div className="macro-inline-stats"><Stat label="Year-over-year" value={formatPct(productionMetric ? periodChangePct(productionMetric, 12) : null)} /><Stat label="Latest native observation" value={formatMetricValue(productionMetric)} note={compactUnit(productionMetric)} /></div>
        </div>
        <div className="macro-subsection-head compact"><div><span>TOP PRODUCING STATES</span><h3>Latest marketed production</h3></div><p>{states[0]?.period ? formatDataDate(states[0].period) : "--"}</p></div><StateProductionRanking states={states} />
      </section>

      <section className="macro-section" id="lng">
        <SectionHeader eyebrow="06 · LNG" title="U.S. LNG exports: actual vs. EIA forecast" description="Observed monthly exports converted to Bcf/d to match EIA STEO's own forecast unit, plus the EIA Short-Term Energy Outlook projection, clearly separated from forward capacity assumptions." />
        <div className="macro-primary-chart borderless">
          <div className="macro-card-title"><div><span className="macro-source-accent">{observationLabel(lngMetric?.period, "monthly", lngMetric?.freshness)} · Monthly · {sourceShort(lngMetric)}</span></div><strong>{formatMetricValue(lngMetric)} <small>{compactUnit(lngMetric)}</small></strong></div>
          <HistoricalLineChart
            ariaLabel="U.S. LNG exports, actual and EIA STEO forecast"
            unit="Bcf/d"
            limit={60}
            series={[{ id: "lng", label: "LNG exports (actual)", color: "#70c99a", history: toBcfdSeries(lngMetric?.history ?? []) }, forecastSeries("lngExportsForecast", "#e5ad63")].filter((entry): entry is ChartSeries => entry !== null)}
          />
          <div className="macro-inline-stats"><Stat label="Year-over-year growth" value={formatPct(lngMetric ? periodChangePct(lngMetric, 12) : null)} /><Stat label="Latest observation" value={observationLabel(lngMetric?.period, "monthly", lngMetric?.freshness)} note="Monthly · U.S. EIA" /></div>
          <p className="macro-context-note">Rising LNG exports increase structural U.S. natural-gas demand and are strategically relevant to Range&apos;s gas exposure. The EIA-labeled LNG-specific series (NGEXPUS_LNG) is used here, not the broader total gross-exports series that also includes pipeline exports.</p>
        </div>
      </section>

      <section className="macro-grid-row macro-grid-row-demand">
        <article className="macro-section macro-grid-card" id="demand">
          <SectionHeader eyebrow="07 · NATURAL GAS DEMAND" title="Consumption by end use" description="Monthly EIA observations; electric power and industrial demand lead the visual hierarchy." />
          <div className="macro-primary-chart borderless"><div className="macro-card-title"><div><h3>U.S. demand by sector</h3><span>{observationLabel(electricPower?.period, "monthly", electricPower?.freshness)} · Monthly · U.S. EIA</span></div><small>{fundamentals.data?.demand.status === "ok" ? "Observed EIA" : "Unavailable"}</small></div><DemandChart demand={demand} /><div className="macro-inline-stats"><Stat label="Electric power YoY" value={formatPct(monthlyYoy(electricPower?.history ?? []))} note={observationLabel(electricPower?.period, "monthly", electricPower?.freshness)} /><Stat label="Industrial YoY" value={formatPct(monthlyYoy(industrial?.history ?? []))} note={observationLabel(industrial?.period, "monthly", industrial?.freshness)} /></div></div>
          <div className="macro-subsection-head compact"><div><span>EIA STEO OUTLOOK</span><h3>Electric power demand forecast</h3></div><p>{steoVintageLabel("electricPowerConsumptionForecast")}</p></div>
          {forecastSeries("electricPowerConsumptionForecast", "#e5ad63") ? (
            <HistoricalLineChart ariaLabel="Electric power demand, EIA STEO forecast" unit={steoSeries?.electricPowerConsumptionForecast?.unit ?? "Bcf"} limit={24} series={[forecastSeries("electricPowerConsumptionForecast", "#e5ad63") as ChartSeries]} />
          ) : <div className="macro-chart-empty">--<small>EIA STEO forecast unavailable</small></div>}
          <p className="macro-context-note">Not overlaid with the observed actual above: EIA reports this STEO series in "{steoSeries?.electricPowerConsumptionForecast?.unit ?? "billion cubic feet"}", a different unit convention than the other STEO consumption series, and it is not combined with the MMcf/month actual without a confirmed conversion.</p>
          <div className="macro-subsection-head compact"><div><span>EIA STEO OUTLOOK</span><h3>Industrial demand: actual vs. forecast</h3></div><p>{steoVintageLabel("industrialConsumptionForecast")}</p></div>
          <HistoricalLineChart ariaLabel="Industrial demand, actual and EIA STEO forecast" unit="Bcf/d" limit={36} series={[{ id: "industrial-actual", label: "Industrial (actual)", color: "#70c99a", history: toBcfdSeries(industrial?.history ?? []) }, forecastSeries("industrialConsumptionForecast", "#e5ad63")].filter((entry): entry is ChartSeries => entry !== null)} />
          <div className="macro-structural-outlook compact"><div><span>STRUCTURAL OUTLOOK</span><h3>Long-run drivers stay separate</h3><p>No dated project-research series is blended into observed EIA history.</p></div><UnsupportedMetric label="LNG capacity" note="Project source required" /><UnsupportedMetric label="AI / data centers" note="Third-party estimate required" /></div>
        </article>
        <article className="macro-section macro-grid-card" id="ngl">
          <SectionHeader eyebrow="08 · NGL" title="U.S. propane inventories" description="Weekly fractionated propane stocks with near-term and annual comparison." />
          <div className="macro-primary-chart borderless"><div className="macro-card-title"><div><h3>Propane inventory history</h3><span>{observationLabel(propaneMetric?.period, "weekly", propaneMetric?.freshness)} · Weekly · {sourceShort(propaneMetric)}</span></div><strong>{formatMetricValue(propaneMetric)} <small>Mbbl</small></strong></div><HistoricalLineChart ariaLabel="U.S. propane inventory history" unit="Mbbl" limit={104} series={[{ id: "propane", label: "Propane inventories", color: "#e5ad63", history: propaneMetric?.history ?? [] }]} /><div className="macro-inline-stats"><Stat label="Weekly change" value={formatDelta(propaneMetric ? periodChange(propaneMetric) : null, "Mbbl")} /><Stat label="Year-over-year" value={formatPct(propaneMetric ? periodChangePct(propaneMetric, 52) : null)} /></div></div>
          <div className="macro-unsupported-row"><UnsupportedMetric label="Ethane exports" note="No normalized series" /><UnsupportedMetric label="NGL pricing" note="No supported live series" /></div>
        </article>
      </section>

      <section className="macro-section" id="appalachia">
        <SectionHeader eyebrow="09 · APPALACHIA / RANGE" title="PA + WV + OH marketed production" description="EIA does not publish a &quot;Marcellus production&quot; series -- this sums marketed production for the three states EIA does report, the closest available Appalachia proxy." />
        <div className="macro-primary-chart borderless">
          <div className="macro-card-title"><div><span className="macro-source-accent">{observationLabel(appalachia.period, "monthly")} · Monthly · U.S. EIA</span></div><strong>{appalachia.current === null ? "--" : new Intl.NumberFormat("en-US").format(appalachia.current)} <small>MMcf/month</small></strong></div>
          <HistoricalLineChart ariaLabel="PA + WV + OH marketed production history" unit="MMcf/month" limit={36} series={[{ id: "appalachia", label: `${appalachia.statesIncluded.join(" + ") || "PA + WV + OH"} marketed production`, color: "#70c99a", history: appalachia.history }]} />
          <div className="macro-inline-stats"><Stat label="Year-over-year" value={formatPct(appalachia.yearOverYearPct)} /><Stat label="Month-over-month" value={formatPct(appalachia.monthOverMonthPct)} /></div>
          <p className="appalachia-label-note">States included: {appalachia.statesIncluded.length ? appalachia.statesIncluded.join(", ") : "none available"}. This is a state-level EIA aggregate, not an official Marcellus-play figure -- it is never labeled as "Marcellus production".</p>
        </div>
        <div className="macro-regional-grid appalachia"><Stat label="East storage vs 5Y" value={formatPct(east?.fiveYearPct ?? null)} note={`${east?.current?.toFixed(0) ?? "--"} Bcf · ${observationLabel(east?.period, "weekly", east?.freshness)}`} /><Stat label="PA production YoY" value={formatPct(pa?.yearOverYearPct ?? null)} note={`${pa?.current?.toFixed(0) ?? "--"} MMcf · ${observationLabel(pa?.period, "monthly")}`} /><Stat label="WV production YoY" value={formatPct(wv?.yearOverYearPct ?? null)} note={observationLabel(wv?.period, "monthly")} /><Stat label="OH production YoY" value={formatPct(oh?.yearOverYearPct ?? null)} note={observationLabel(oh?.period, "monthly")} /><Stat label="LNG exports YoY" value={formatPct(lngMetric ? periodChangePct(lngMetric, 12) : null)} note={observationLabel(lngMetric?.period, "monthly", lngMetric?.freshness)} /><Stat label="Henry Hub trend" value={formatDelta(henryHubMetric ? periodChange(henryHubMetric) : null, "$/MMBtu")} note="Latest official daily move" /></div>

        <MacroRiskWidget data={macroRisk.data} loading={macroRisk.loading} error={macroRisk.error} onViewDriver={(driver) => scrollToSection(RISK_DRIVER_SECTION[driver])} />
      </section>

      <section className="macro-section" id="eia-outlook">
        <SectionHeader eyebrow="10 · EIA OUTLOOK" title="Short-Term Energy Outlook" description="EIA's own forward projection, actual-vs-forecast where an observed counterpart exists, with forecast revisions once a second monthly snapshot has been captured." />
        <EiaOutlookModule steo={steo.data} loading={steo.loading} error={steo.error} metrics={eiaOutlookMetrics} forecastStartPeriod={steoForecastStartPeriod} />
      </section>

      <footer className="macro-freshness">
        <details className="macro-freshness-details">
          <summary>
            <strong>DATA FRESHNESS</strong>
            <span className={freshnessCurrentCount === freshnessTotalCount ? "macro-source-accent" : undefined}>{freshnessCurrentCount}/{freshnessTotalCount} feeds current{freshnessCurrentCount === freshnessTotalCount ? "" : ` · ${freshnessTotalCount - freshnessCurrentCount} lagged/stale`}</span>
          </summary>
          <p className="macro-context-note">Observation period and retrieval timestamp are tracked separately; publication weekdays are not assumed. "Lagged" reflects a source's normal publication cadence, not a fault.</p>
          <div className="macro-freshness-list">
            {metrics.map((metric) => <span key={metric.id}><i className={`freshness-dot ${metric.freshness}`} />EIA · {metric.label}: {observationLabel(metric.period, metric.frequency)} · {metric.frequency} · {metric.freshness} · retrieved {formatRefreshTimestamp(metric.fetchedAt)}</span>)}
            {currentQuotes ? Object.values(currentQuotes).map((quote) => <span key={quote.id}><i className={`freshness-dot ${quote.status === "ok" ? "current" : "unavailable"}`} />OilPriceAPI · {quote.label}: {formatRefreshTimestamp(quote.asOf)} · current market · {quote.dataStatus ?? quote.status}</span>) : null}
            <span><i className={`freshness-dot ${east?.freshness ?? "unavailable"}`} />EIA · regional storage: {observationLabel(east?.period, "weekly")} · weekly · {east?.freshness ?? "unavailable"} · retrieved {formatRefreshTimestamp(fundamentals.data?.generatedAt)}</span>
            <span><i className={`freshness-dot ${steo.data?.status === "ok" ? "current" : "unavailable"}`} />EIA STEO · outlook: {steoObservation} · monthly · retrieved {steo.data?.generatedAt ? formatRefreshTimestamp(steo.data.generatedAt) : "--"}</span>
            <span><i className="freshness-dot" />Baker Hughes · rigs: {formatWeekEnding(getRigDataset().source.reportDate)} · weekly · manual import</span>
          </div>
        </details>
      </footer>
    </div>
  );
}
