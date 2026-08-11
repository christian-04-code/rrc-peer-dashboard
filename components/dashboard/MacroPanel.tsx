"use client";

import { useMarketData } from "@/lib/market/use-market-data";
import { useMacroFundamentals } from "@/lib/market/use-macro-fundamentals";
import type { CurrentMarketCommodityQuote, MarketObservation, NormalizedMarketMetric } from "@/lib/market/types";
import {
  buildMacroSnapshot,
  buildStorageComparison,
  buildStorageProfile,
  formatDelta,
  formatMetricValue,
  formatPct,
  monthlyMmcfToBcfd,
  periodChange,
  periodChangePct
} from "@/lib/market/macro-analytics";
import { MacroEnergyMap } from "@/components/dashboard/MacroEnergyMap";
import {
  DemandChart,
  HistoricalLineChart,
  RegionalStorageTable,
  StateProductionRanking
} from "@/components/dashboard/MacroVisuals";

const PULSE_IDS = ["henry_hub", "wti", "brent", "storage", "lng_exports", "dry_gas_production", "propane_stocks"];

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

function SectionHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <header className="macro-section-head"><div><span>{eyebrow}</span><h2>{title}</h2></div><p>{description}</p></header>;
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

function monthlyYoy(history: MarketObservation[]): number | null {
  const latest = history[0];
  if (!latest || !/^\d{4}-\d{2}$/.test(latest.period)) return null;
  const [year, month] = latest.period.split("-").map(Number);
  const target = `${year - 1}-${String(month).padStart(2, "0")}`;
  const prior = history.find((point) => point.period === target);
  if (!prior || prior.value === 0) return null;
  return ((latest.value - prior.value) / Math.abs(prior.value)) * 100;
}

export function MacroPanel() {
  const market = useMarketData();
  const fundamentals = useMacroFundamentals();
  const metrics = market.data?.metrics ?? [];
  const byId = new Map(metrics.map((metric) => [metric.id, metric]));
  const storageMetric = byId.get("storage");
  const lngMetric = byId.get("lng_exports");
  const productionMetric = byId.get("dry_gas_production");
  const propaneMetric = byId.get("propane_stocks");
  const henryHubMetric = byId.get("henry_hub");
  const storage = buildStorageComparison(storageMetric?.history ?? []);
  const regionalStorage = Object.values(fundamentals.data?.storage.regions ?? {});
  const states = Object.values(fundamentals.data?.production.states ?? {});
  const demand = Object.values(fundamentals.data?.demand.series ?? {});
  const east = fundamentals.data?.storage.regions.east;
  const pa = fundamentals.data?.production.states.PA;
  const wv = fundamentals.data?.production.states.WV;
  const oh = fundamentals.data?.production.states.OH;
  const electricPower = fundamentals.data?.demand.series.electricPower;
  const industrial = fundamentals.data?.demand.series.industrial;
  const snapshot = buildMacroSnapshot(metrics, {
    eastStoragePct: east?.fiveYearPct,
    paProductionYoyPct: pa?.yearOverYearPct
  });
  const rrcState = snapshot.find((item) => item.label === "Appalachia");
  const rrcSetup = rrcState?.tone === "positive" ? "Supportive" : rrcState?.tone === "negative" ? "Challenging" : rrcState?.state === "Unavailable" ? "Unavailable" : "Neutral";
  const productionBcfd = monthlyMmcfToBcfd(productionMetric?.value ?? null, productionMetric?.period ?? null);
  const currentQuotes = market.data?.currentMarket;

  return (
    <div className="macro-panel">
      <header className="macro-page-head">
        <div><span className="macro-kicker">RRC ENERGY FUNDAMENTALS</span><h1>Natural Gas &amp; NGL Intelligence</h1><p>Market indicators, historical evidence, geographic fundamentals, and transparent RRC read-throughs.</p></div>
        <div className="macro-asof"><span>Market API generated</span><strong>{market.data?.generatedAt ? new Date(market.data.generatedAt).toLocaleString() : market.loading ? "Loading…" : "--"}</strong><small>{market.error ?? fundamentals.error ?? `${metrics.filter((metric) => metric.status === "ok").length} of ${metrics.length || 7} official feeds · ${Object.values(currentQuotes ?? {}).filter((quote) => quote.status === "ok").length} current quotes`}</small></div>
      </header>

      <section className="macro-section macro-pulse">
        <SectionHeader eyebrow="01 · MARKET PULSE" title="Cross-commodity tape" description="OilPriceAPI current Henry Hub/WTI where valid; EIA official observations and history remain distinct." />
        <div className="macro-pulse-grid">{PULSE_IDS.map((id) => <PulseMetric key={id} metric={byId.get(id)} label={id.replaceAll("_", " ")} current={id === "henry_hub" ? currentQuotes?.henryHub : id === "wti" ? currentQuotes?.wti : undefined} />)}</div>
      </section>

      <section className="macro-section macro-storage-section">
        <SectionHeader eyebrow="02 · WEEKLY CENTERPIECE" title="U.S. natural gas storage" description="Current year against prior year, same-week five-year average, and the full historical range." />
        <div className="macro-balance-grid">
          <div className="macro-primary-chart"><div className="macro-card-title"><div><h3>Lower-48 working gas</h3><span>{observationLabel(storageMetric?.period, "weekly")} · Weekly · U.S. EIA</span></div><strong>{formatMetricValue(storageMetric)} <small>Bcf</small></strong></div><StorageChart metric={storageMetric} /></div>
          <aside className="macro-weekly-report"><div><span>LATEST WEEKLY REPORT</span><strong>{formatMetricValue(storageMetric)} <small>Bcf</small></strong><p>{observationLabel(storageMetric?.period, "weekly")}</p></div><div className="macro-balance-stats">
            <Stat label="Weekly injection / withdrawal" value={formatDelta(storage?.weeklyChange ?? null, "Bcf")} note="injection (+) / withdrawal (−)" />
            <Stat label="vs 5-year average" value={formatDelta(storage?.versusAverage ?? null, "Bcf")} note={formatPct(storage?.versusAveragePct ?? null)} />
            <Stat label="vs year ago" value={formatDelta(storage?.yearOverYear ?? null, "Bcf")} note={storage?.priorYear && storage.yearOverYear !== null ? formatPct((storage.yearOverYear / storage.priorYear) * 100) : "--"} />
            <Stat label="5-year same-week range" value={storage?.fiveYearMin != null && storage?.fiveYearMax != null ? `${storage.fiveYearMin.toFixed(0)}–${storage.fiveYearMax.toFixed(0)} Bcf` : "--"} />
          </div><small>Observation and retrieval timestamps are tracked separately.</small></aside>
        </div>
        <div className="macro-subsection-head"><div><span>REGIONAL STORAGE</span><h3>Tightness versus five-year norms</h3></div><p>Official EIA regions; state storage is not inferred.</p></div>
        <RegionalStorageTable regions={regionalStorage} />
      </section>

      <section className="macro-section">
        <SectionHeader eyebrow="03 · INTERACTIVE ENERGY MAP" title="Storage regions and state production" description="Switch layer and production view; hover or focus for context, click to persist geography." />
        <MacroEnergyMap data={fundamentals.data} />
      </section>

      <section className="macro-grid-row macro-grid-row-equal">
        <article className="macro-section macro-grid-card">
          <SectionHeader eyebrow="04 · U.S. GAS PRODUCTION" title="Dry-gas supply trend" description="Monthly national dry production; state ranking uses marketed production." />
          <div className="macro-primary-chart borderless"><div className="macro-card-title"><div><h3>U.S. dry natural gas production</h3><span>{observationLabel(productionMetric?.period, "monthly")} · Monthly · {sourceShort(productionMetric)}</span></div><strong>{productionBcfd === null ? "--" : productionBcfd.toFixed(1)} <small>Bcf/d</small></strong></div><HistoricalLineChart ariaLabel="U.S. dry natural gas production history" unit="MMcf/month" limit={60} series={[{ id: "dry-gas", label: "U.S. dry gas", color: "#3db3e3", history: productionMetric?.history ?? [] }]} /><div className="macro-inline-stats"><Stat label="Year-over-year" value={formatPct(productionMetric ? periodChangePct(productionMetric, 12) : null)} /><Stat label="Latest native observation" value={formatMetricValue(productionMetric)} note={compactUnit(productionMetric)} /></div></div>
          <div className="macro-subsection-head compact"><div><span>TOP PRODUCING STATES</span><h3>Latest marketed production</h3></div></div><StateProductionRanking states={states} />
        </article>
        <article className="macro-section macro-grid-card">
          <SectionHeader eyebrow="05 · LNG" title="U.S. LNG exports" description="Observed monthly exports, separated from forward capacity assumptions." />
          <div className="macro-primary-chart borderless"><div className="macro-card-title"><div><h3>Monthly LNG export trend</h3><span>{observationLabel(lngMetric?.period, "monthly")} · Monthly · {sourceShort(lngMetric)}</span></div><strong>{formatMetricValue(lngMetric)} <small>{compactUnit(lngMetric)}</small></strong></div><HistoricalLineChart ariaLabel="U.S. LNG exports history" unit="MMcf/month" limit={60} series={[{ id: "lng", label: "LNG exports", color: "#70c99a", history: lngMetric?.history ?? [] }]} /><div className="macro-inline-stats"><Stat label="Year-over-year growth" value={formatPct(lngMetric ? periodChangePct(lngMetric, 12) : null)} /><Stat label="Latest observation" value={observationLabel(lngMetric?.period, "monthly")} note="Monthly · U.S. EIA" /></div><p className="macro-context-note">Rising LNG exports increase structural U.S. natural-gas demand and are strategically relevant to Range&apos;s gas exposure.</p></div>
        </article>
      </section>

      <section className="macro-grid-row macro-grid-row-demand">
        <article className="macro-section macro-grid-card">
          <SectionHeader eyebrow="06 · NATURAL GAS DEMAND" title="Consumption by end use" description="Monthly EIA observations; electric power and industrial demand lead the visual hierarchy." />
          <div className="macro-primary-chart borderless"><div className="macro-card-title"><div><h3>U.S. demand by sector</h3><span>{observationLabel(electricPower?.period, "monthly")} · Monthly · U.S. EIA</span></div><small>{fundamentals.data?.demand.status === "ok" ? "Observed EIA" : "Unavailable"}</small></div><DemandChart demand={demand} /><div className="macro-inline-stats"><Stat label="Electric power YoY" value={formatPct(monthlyYoy(electricPower?.history ?? []))} note={observationLabel(electricPower?.period, "monthly")} /><Stat label="Industrial YoY" value={formatPct(monthlyYoy(industrial?.history ?? []))} note={observationLabel(industrial?.period, "monthly")} /></div></div>
          <div className="macro-structural-outlook compact"><div><span>STRUCTURAL OUTLOOK</span><h3>Long-run drivers stay separate</h3><p>No dated project-research series is blended into observed EIA history.</p></div><UnsupportedMetric label="LNG capacity" note="Project source required" /><UnsupportedMetric label="AI / data centers" note="Third-party estimate required" /></div>
        </article>
        <article className="macro-section macro-grid-card">
          <SectionHeader eyebrow="07 · NGL" title="U.S. propane inventories" description="Weekly fractionated propane stocks with near-term and annual comparison." />
          <div className="macro-primary-chart borderless"><div className="macro-card-title"><div><h3>Propane inventory history</h3><span>{observationLabel(propaneMetric?.period, "weekly")} · Weekly · {sourceShort(propaneMetric)}</span></div><strong>{formatMetricValue(propaneMetric)} <small>Mbbl</small></strong></div><HistoricalLineChart ariaLabel="U.S. propane inventory history" unit="Mbbl" limit={104} series={[{ id: "propane", label: "Propane inventories", color: "#e5ad63", history: propaneMetric?.history ?? [] }]} /><div className="macro-inline-stats"><Stat label="Weekly change" value={formatDelta(propaneMetric ? periodChange(propaneMetric) : null, "Mbbl")} /><Stat label="Year-over-year" value={formatPct(propaneMetric ? periodChangePct(propaneMetric, 52) : null)} /></div></div>
          <div className="macro-unsupported-row"><UnsupportedMetric label="Ethane exports" note="No normalized series" /><UnsupportedMetric label="NGL pricing" note="No supported live series" /></div>
        </article>
      </section>

      <section className="macro-grid-row macro-grid-row-rrc">
        <article className="macro-section macro-grid-card">
          <SectionHeader eyebrow="08 · APPALACHIA / RANGE" title="Appalachia fundamentals" description="East storage, PA/WV/OH supply, LNG, and Henry Hub tied directly to Range context." />
          <div className="macro-rrc-grid polished">
            <div className={`macro-rrc-callout ${rrcState?.tone ?? "neutral"}`}><span>OVERALL RRC MACRO SETUP</span><strong>{rrcSetup}</strong><p>East storage, Appalachia supply, LNG exports, and Henry Hub frame the demand and pricing environment for Range.</p><small>Rule state: {rrcState?.state ?? "Unavailable"} · {rrcState?.inputs ?? "--"}</small></div>
            <div className="macro-regional-grid appalachia"><Stat label="East storage vs 5Y" value={formatPct(east?.fiveYearPct ?? null)} note={`${east?.current?.toFixed(0) ?? "--"} Bcf · ${observationLabel(east?.period, "weekly")}`} /><Stat label="PA production YoY" value={formatPct(pa?.yearOverYearPct ?? null)} note={`${pa?.current?.toFixed(0) ?? "--"} MMcf · ${observationLabel(pa?.period, "monthly")}`} /><Stat label="WV production YoY" value={formatPct(wv?.yearOverYearPct ?? null)} note={observationLabel(wv?.period, "monthly")} /><Stat label="OH production YoY" value={formatPct(oh?.yearOverYearPct ?? null)} note={observationLabel(oh?.period, "monthly")} /><Stat label="LNG exports YoY" value={formatPct(lngMetric ? periodChangePct(lngMetric, 12) : null)} note={observationLabel(lngMetric?.period, "monthly")} /><Stat label="Henry Hub trend" value={formatDelta(henryHubMetric ? periodChange(henryHubMetric) : null, "$/MMBtu")} note="Latest official daily move" /></div>
          </div>
        </article>
        <article className="macro-section macro-grid-card macro-snapshot-section">
          <SectionHeader eyebrow="09 · MACRO SNAPSHOT" title="Evidence summary" description="Deterministic classifications; select a row for its rule and inputs." />
          <div className="macro-snapshot compact" aria-label="Macro snapshot">{snapshot.map((item) => <details key={item.label} className={`macro-snapshot-item ${item.tone}`}><summary><span>{item.label}</span><strong>{item.state}</strong></summary><p>{item.rule}</p><small>{item.inputs}</small></details>)}</div>
        </article>
      </section>

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
