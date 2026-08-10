"use client";

import { useMarketData } from "@/lib/market/use-market-data";
import { useMacroFundamentals } from "@/lib/market/use-macro-fundamentals";
import type { MarketObservation, NormalizedMarketMetric } from "@/lib/market/types";
import {
  buildMacroSnapshot,
  buildStorageComparison,
  buildStorageProfile,
  formatDelta,
  formatMetricValue,
  formatPct,
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

function PulseMetric({ metric, label }: { metric?: NormalizedMarketMetric; label: string }) {
  const change = metric ? periodChange(metric) : null;
  return (
    <article className="macro-pulse-item">
      <div className="macro-pulse-label"><span>{metric?.label ?? label}</span><i className={`freshness-dot ${metric?.freshness ?? "unavailable"}`} aria-label={metric?.freshness ?? "unavailable"} /></div>
      <div className="macro-pulse-value"><strong>{formatMetricValue(metric)}</strong><em>{compactUnit(metric)}</em></div>
      <div className="macro-pulse-change"><span className={change === null ? "neutral" : change >= 0 ? "positive" : "negative"}>{formatDelta(change, compactUnit(metric))}</span><small>vs prior {metric?.frequency === "daily" ? "day" : metric?.frequency === "weekly" ? "week" : "month"}</small></div>
      <Sparkline points={metric?.history ?? []} label={metric?.label ?? label} />
      <small>{metric?.period ?? "--"} · {sourceShort(metric)}</small>
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
  const snapshot = buildMacroSnapshot(metrics, {
    eastStoragePct: east?.fiveYearPct,
    paProductionYoyPct: pa?.yearOverYearPct
  });
  const rrcState = snapshot.find((item) => item.label === "Appalachia");

  return (
    <div className="macro-panel">
      <header className="macro-page-head">
        <div><span className="macro-kicker">RRC ENERGY FUNDAMENTALS</span><h1>Natural Gas &amp; NGL Intelligence</h1><p>Market indicators, historical evidence, geographic fundamentals, and transparent RRC read-throughs.</p></div>
        <div className="macro-asof"><span>Market API generated</span><strong>{market.data?.generatedAt ? new Date(market.data.generatedAt).toLocaleString() : market.loading ? "Loading…" : "--"}</strong><small>{market.error ?? fundamentals.error ?? `${metrics.filter((metric) => metric.status === "ok").length} of ${metrics.length || 7} market feeds available`}</small></div>
      </header>

      <section className="macro-section macro-pulse">
        <SectionHeader eyebrow="01 · MARKET PULSE" title="Cross-commodity tape" description="Official EIA observations; source classification and native frequency remain explicit." />
        <div className="macro-pulse-grid">{PULSE_IDS.map((id) => <PulseMetric key={id} metric={byId.get(id)} label={id.replaceAll("_", " ")} />)}</div>
      </section>

      <section className="macro-section">
        <SectionHeader eyebrow="02 · WEEKLY NATURAL GAS STORAGE" title="Lower-48 storage versus history" description="Weekly working gas compared with prior year and same-week five-year average and range." />
        <div className="macro-balance-grid">
          <div className="macro-primary-chart"><div className="macro-card-title"><div><h3>Current Lower-48 storage</h3><span>Weekly · report week ending {storageMetric?.period ?? "--"} · U.S. EIA</span></div><strong>{formatMetricValue(storageMetric)} <small>Bcf</small></strong></div><StorageChart metric={storageMetric} /></div>
          <div className="macro-balance-stats">
            <Stat label="vs 5-year average" value={formatDelta(storage?.versusAverage ?? null, "Bcf")} note={formatPct(storage?.versusAveragePct ?? null)} />
            <Stat label="vs year ago" value={formatDelta(storage?.yearOverYear ?? null, "Bcf")} note={storage?.priorYear && storage.yearOverYear !== null ? formatPct((storage.yearOverYear / storage.priorYear) * 100) : "--"} />
            <Stat label="Latest weekly flow" value={formatDelta(storage?.weeklyChange ?? null, "Bcf")} note="injection (+) / withdrawal (−)" />
            <Stat label="5-year same-week range" value={storage?.fiveYearMin != null && storage?.fiveYearMax != null ? `${storage.fiveYearMin.toFixed(0)}–${storage.fiveYearMax.toFixed(0)} Bcf` : "--"} />
          </div>
        </div>
      </section>

      <section className="macro-section">
        <SectionHeader eyebrow="03 · STORAGE BY REGION" title="Regional tightness and weekly flows" description="Five official EIA storage regions; no state-level storage is inferred." />
        <RegionalStorageTable regions={regionalStorage} />
      </section>

      <section className="macro-section">
        <SectionHeader eyebrow="04 · INTERACTIVE U.S. ENERGY MAP" title="Storage regions and state production" description="Switch layers, hover for current context, and click a state to persist detail." />
        <MacroEnergyMap data={fundamentals.data} />
      </section>

      <section className="macro-section">
        <SectionHeader eyebrow="05 · U.S. GAS PRODUCTION" title="National dry-gas trend and state marketed production" description="National and state measures are intentionally labeled separately." />
        <div className="macro-two-column production">
          <div className="macro-primary-chart"><div className="macro-card-title"><div><h3>U.S. dry natural gas production</h3><span>Observed EIA data · Monthly</span></div><strong>{formatMetricValue(productionMetric)} <small>{compactUnit(productionMetric)}</small></strong></div><HistoricalLineChart ariaLabel="U.S. dry natural gas production history" unit="MMcf/month" limit={60} series={[{ id: "dry-gas", label: "U.S. dry gas", color: "#3db3e3", history: productionMetric?.history ?? [] }]} /></div>
          <div className="macro-primary-chart"><div className="macro-card-title"><div><h3>Top producing states</h3><span>Marketed natural gas · latest monthly observation</span></div></div><StateProductionRanking states={states} /></div>
        </div>
      </section>

      <section className="macro-section">
        <SectionHeader eyebrow="06 · LNG" title="U.S. LNG export trend" description="Historical EIA observations remain separate from structural capacity outlooks." />
        <div className="macro-primary-chart"><div className="macro-card-title"><div><h3>Monthly LNG exports</h3><span>Observed EIA data · {lngMetric?.period ?? "--"}</span></div><strong>{formatMetricValue(lngMetric)} <small>{compactUnit(lngMetric)}</small></strong></div><HistoricalLineChart ariaLabel="U.S. LNG exports history" unit="MMcf/month" limit={60} series={[{ id: "lng", label: "LNG exports", color: "#70c99a", history: lngMetric?.history ?? [] }]} /><div className="macro-inline-stats"><Stat label="Year-over-year growth" value={formatPct(lngMetric ? periodChangePct(lngMetric, 12) : null)} /><Stat label="Observation month" value={lngMetric?.period ?? "--"} note={sourceShort(lngMetric)} /></div></div>
      </section>

      <section className="macro-section">
        <SectionHeader eyebrow="07 · NATURAL GAS DEMAND" title="Consumption by end use" description="Monthly official EIA consumption; not presented as live data." />
        <div className="macro-primary-chart"><div className="macro-card-title"><div><h3>U.S. demand by sector</h3><span>Electric power · industrial · residential · commercial</span></div><small>{fundamentals.data?.demand.status === "ok" ? "Observed EIA" : "Unavailable"}</small></div><DemandChart demand={demand} /></div>
        <div className="macro-structural-outlook">
          <div><span>STRUCTURAL DEMAND OUTLOOK</span><h3>Long-run drivers stay distinct from observations</h3><p>No dated project-research series has been normalized into this branch, so outlook values are not plotted as EIA history.</p></div>
          <UnsupportedMetric label="LNG capacity expansion" note="Project research source required" />
          <UnsupportedMetric label="AI / data-center demand" note="Third-party estimate required" />
          <UnsupportedMetric label="Industrial reshoring" note="Project research source required" />
          <UnsupportedMetric label="Appalachia demand growth" note="Range outlook source required" />
        </div>
      </section>

      <section className="macro-section">
        <SectionHeader eyebrow="08 · APPALACHIA / RANGE RELEVANCE" title="Appalachia fundamentals" description="East storage and returned PA/WV/OH production are tied directly to RRC context." />
        <div className="macro-rrc-grid">
          <div className={`macro-rrc-callout ${rrcState?.tone ?? "neutral"}`}><span>WHY THIS MATTERS TO RRC</span><strong>{rrcState?.state ?? "Unavailable"}</strong><p>East storage, Appalachia state supply, LNG exports, and Henry Hub direction frame the demand and pricing environment for Range.</p><small>{rrcState?.inputs ?? "--"}</small></div>
          <div className="macro-regional-grid appalachia">
            <Stat label="East storage vs 5Y" value={formatPct(east?.fiveYearPct ?? null)} note={`${east?.current?.toFixed(0) ?? "--"} Bcf · ${east?.period ?? "--"}`} />
            <Stat label="Pennsylvania production YoY" value={formatPct(pa?.yearOverYearPct ?? null)} note={`${pa?.current?.toFixed(0) ?? "--"} MMcf · ${pa?.period ?? "--"}`} />
            <Stat label="West Virginia production YoY" value={formatPct(wv?.yearOverYearPct ?? null)} note={`${wv?.current?.toFixed(0) ?? "--"} MMcf · ${wv?.period ?? "--"}`} />
            <Stat label="Ohio production YoY" value={formatPct(oh?.yearOverYearPct ?? null)} note={`${oh?.current?.toFixed(0) ?? "--"} MMcf · ${oh?.period ?? "--"}`} />
            <Stat label="LNG exports YoY" value={formatPct(lngMetric ? periodChangePct(lngMetric, 12) : null)} note={lngMetric?.period ?? "--"} />
            <Stat label="Henry Hub prior-day move" value={formatDelta(henryHubMetric ? periodChange(henryHubMetric) : null, "$/MMBtu")} note={henryHubMetric?.period ?? "--"} />
          </div>
        </div>
      </section>

      <section className="macro-section">
        <SectionHeader eyebrow="09 · NGL INTELLIGENCE" title="Propane inventory history" description="Weekly Petroleum Status Report inventory observations with YoY comparison." />
        <div className="macro-two-column">
          <div className="macro-primary-chart"><div className="macro-card-title"><div><h3>U.S. propane inventories</h3><span>Fractionated and ready for sale · Weekly</span></div><strong>{formatMetricValue(propaneMetric)} <small>Mbbl</small></strong></div><HistoricalLineChart ariaLabel="U.S. propane inventory history" unit="Mbbl" limit={104} series={[{ id: "propane", label: "Propane inventories", color: "#e5ad63", history: propaneMetric?.history ?? [] }]} /><div className="macro-inline-stats"><Stat label="Weekly change" value={formatDelta(propaneMetric ? periodChange(propaneMetric) : null, "Mbbl")} /><Stat label="Year-over-year change" value={formatPct(propaneMetric ? periodChangePct(propaneMetric, 52) : null)} /></div></div>
          <div className="macro-demand-stack"><h3>NGL coverage</h3><Stat label="Propane inventories" value={formatMetricValue(propaneMetric)} note="Observed EIA · weekly" /><UnsupportedMetric label="Propane days of supply" note="No supported denominator in contract" /><UnsupportedMetric label="Ethane exports" note="No normalized series" /><UnsupportedMetric label="LPG export capacity" note="No dated structural source normalized" /><UnsupportedMetric label="NGL pricing" note="No supported live series" /></div>
        </div>
      </section>

      <section className="macro-section macro-snapshot-section">
        <SectionHeader eyebrow="10 · MACRO SNAPSHOT" title="Evidence-based classification" description="Deterministic rules summarize the charts above; no AI macro score." />
        <div className="macro-snapshot" aria-label="Macro snapshot">{snapshot.map((item) => <details key={item.label} className={`macro-snapshot-item ${item.tone}`}><summary><span>{item.label}</span><strong>{item.state}</strong></summary><p>{item.rule}</p><small>{item.inputs}</small></details>)}</div>
      </section>

      <footer className="macro-freshness">
        <div><strong>DATA FRESHNESS</strong><span>Observation period and retrieval timestamp are tracked separately; publication weekdays are not assumed.</span></div>
        <div className="macro-freshness-list">
          {metrics.map((metric) => <span key={metric.id}><i className={`freshness-dot ${metric.freshness}`} />EIA · {metric.label}: {metric.period ?? "--"} · {metric.frequency} · {metric.freshness} · retrieved {new Date(metric.fetchedAt).toLocaleString()}</span>)}
          <span><i className={`freshness-dot ${east?.freshness ?? "unavailable"}`} />EIA · regional storage: {east?.period ?? "--"} · weekly · {east?.freshness ?? "unavailable"} · retrieved {fundamentals.data?.generatedAt ? new Date(fundamentals.data.generatedAt).toLocaleString() : "--"}</span>
        </div>
      </footer>
    </div>
  );
}
