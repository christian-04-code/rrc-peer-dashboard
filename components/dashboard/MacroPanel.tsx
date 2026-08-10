"use client";

import { useMarketData } from "@/lib/market/use-market-data";
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

const PULSE_IDS = ["henry_hub", "wti", "brent", "storage", "lng_exports", "dry_gas_production"];

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

  return (
    <svg className="macro-spark" viewBox="0 0 100 32" role="img" aria-label={`${label} recent trend`}>
      <polyline points={plotted} />
    </svg>
  );
}

function PulseMetric({ metric, label }: { metric?: NormalizedMarketMetric; label: string }) {
  const change = metric ? periodChange(metric) : null;
  const changeClass = change === null ? "neutral" : change >= 0 ? "positive" : "negative";
  return (
    <article className="macro-pulse-item">
      <div className="macro-pulse-label">
        <span>{metric?.label ?? label}</span>
        <i className={`freshness-dot ${metric?.freshness ?? "unavailable"}`} aria-label={metric?.freshness ?? "unavailable"} />
      </div>
      <div className="macro-pulse-value"><strong>{formatMetricValue(metric)}</strong><em>{compactUnit(metric)}</em></div>
      <div className="macro-pulse-change">
        <span className={changeClass}>{formatDelta(change, compactUnit(metric))}</span>
        <small>vs prior {metric?.frequency === "daily" ? "day" : metric?.frequency === "weekly" ? "week" : "month"}</small>
      </div>
      <Sparkline points={metric?.history ?? []} label={metric?.label ?? label} />
      <small>{metric?.period ?? "--"} · {sourceShort(metric)}</small>
    </article>
  );
}

function TrendChart({ metric, label, limit = 36 }: { metric?: NormalizedMarketMetric; label: string; limit?: number }) {
  const points = metric?.history.slice(0, limit).reverse() ?? [];
  if (points.length < 2) return <div className="macro-chart-empty">--<small>No supported observations</small></div>;
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const path = points.map((point, index) => {
    const x = 10 + (index / (points.length - 1)) * 580;
    const y = 174 - ((point.value - min) / range) * 142;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const first = points[0];
  const last = points[points.length - 1];

  return (
    <div className="macro-trend-wrap">
      <svg className="macro-trend" viewBox="0 0 600 190" role="img" aria-label={`${label} history from ${first.period} to ${last.period}`}>
        <line x1="10" x2="590" y1="174" y2="174" />
        <line x1="10" x2="590" y1="103" y2="103" />
        <line x1="10" x2="590" y1="32" y2="32" />
        <polyline points={path} />
      </svg>
      <div className="macro-chart-axis"><span>{first.period}</span><span>{last.period}</span></div>
    </div>
  );
}

function StorageChart({ metric }: { metric?: NormalizedMarketMetric }) {
  const profile = buildStorageProfile(metric?.history ?? []);
  const available = profile.filter((point) => point.current !== null || point.priorYear !== null || point.fiveYearAverage !== null);
  const allValues = available.flatMap((point) => [point.current, point.priorYear, point.fiveYearMin, point.fiveYearMax]).filter((value): value is number => value !== null);
  if (allValues.length < 2) return <div className="macro-chart-empty">--<small>Storage history unavailable</small></div>;
  const min = Math.min(...allValues) * 0.92;
  const max = Math.max(...allValues) * 1.04;
  const y = (value: number) => 178 - ((value - min) / (max - min || 1)) * 150;
  const x = (week: number) => 10 + ((week - 1) / 52) * 580;
  const line = (key: "current" | "priorYear" | "fiveYearAverage") => profile
    .filter((point) => point[key] !== null)
    .map((point) => `${x(point.week).toFixed(1)},${y(point[key] as number).toFixed(1)}`).join(" ");
  const ranged = profile.filter((point) => point.fiveYearMin !== null && point.fiveYearMax !== null);
  const band = [
    ...ranged.map((point) => `${x(point.week).toFixed(1)},${y(point.fiveYearMax as number).toFixed(1)}`),
    ...ranged.slice().reverse().map((point) => `${x(point.week).toFixed(1)},${y(point.fiveYearMin as number).toFixed(1)}`)
  ].join(" ");

  return (
    <div className="macro-trend-wrap">
      <svg className="macro-storage-chart" viewBox="0 0 600 194" role="img" aria-label="Lower 48 storage current year, prior year, five-year average and range">
        {[28, 103, 178].map((lineY) => <line key={lineY} x1="10" x2="590" y1={lineY} y2={lineY} />)}
        {band ? <polygon className="storage-band" points={band} /> : null}
        <polyline className="storage-average" points={line("fiveYearAverage")} />
        <polyline className="storage-prior" points={line("priorYear")} />
        <polyline className="storage-current" points={line("current")} />
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
  const { data, loading, error } = useMarketData();
  const metrics = data?.metrics ?? [];
  const byId = new Map(metrics.map((metric) => [metric.id, metric]));
  const storageMetric = byId.get("storage");
  const lngMetric = byId.get("lng_exports");
  const productionMetric = byId.get("dry_gas_production");
  const propaneMetric = byId.get("propane_stocks");
  const storage = buildStorageComparison(storageMetric?.history ?? []);
  const snapshot = buildMacroSnapshot(metrics);
  const rrcState = snapshot.find((item) => item.label === "Appalachia");

  return (
    <div className="macro-panel">
      <header className="macro-page-head">
        <div><span className="macro-kicker">RRC MACRO INTELLIGENCE</span><h1>Natural Gas &amp; NGL Market Monitor</h1><p>Observed EIA fundamentals, native-frequency history, and transparent RRC read-throughs.</p></div>
        <div className="macro-asof"><span>API generated</span><strong>{data?.generatedAt ? new Date(data.generatedAt).toLocaleString() : loading ? "Loading…" : "--"}</strong><small>{error ?? `${metrics.filter((metric) => metric.status === "ok").length} of ${metrics.length || 7} feeds available`}</small></div>
      </header>

      <section className="macro-snapshot" aria-label="Macro snapshot">
        {snapshot.map((item) => (
          <details key={item.label} className={`macro-snapshot-item ${item.tone}`}>
            <summary><span>{item.label}</span><strong>{item.state}</strong></summary>
            <p>{item.rule}</p><small>{item.inputs}</small>
          </details>
        ))}
      </section>

      <section className="macro-section macro-pulse">
        <SectionHeader eyebrow="01 · MARKET PULSE" title="Cross-commodity tape" description="Latest observations with change versus the prior native-frequency period." />
        <div className="macro-pulse-grid">
          {PULSE_IDS.map((id) => <PulseMetric key={id} metric={byId.get(id)} label={id.replaceAll("_", " ")} />)}
        </div>
      </section>

      <section className="macro-section">
        <SectionHeader eyebrow="02 · U.S. NATURAL GAS BALANCE" title="Lower-48 storage is the balancing signal" description="Weekly working gas compared with prior year and same-week five-year norms." />
        <div className="macro-balance-grid">
          <div className="macro-primary-chart">
            <div className="macro-card-title"><div><h3>Lower-48 natural gas storage</h3><span>Weekly · Bcf</span></div><strong>{formatMetricValue(storageMetric)} <small>Bcf</small></strong></div>
            <StorageChart metric={storageMetric} />
          </div>
          <div className="macro-balance-stats">
            <Stat label="vs 5-year average" value={formatDelta(storage?.versusAverage ?? null, "Bcf")} note={formatPct(storage?.versusAveragePct ?? null)} />
            <Stat label="Year over year" value={formatDelta(storage?.yearOverYear ?? null, "Bcf")} />
            <Stat label="Latest weekly flow" value={formatDelta(storage?.weeklyChange ?? null, "Bcf")} note="injection (+) / withdrawal (−)" />
            <Stat label="5-year range" value={storage?.fiveYearMin !== null && storage?.fiveYearMin !== undefined && storage?.fiveYearMax !== null && storage?.fiveYearMax !== undefined ? `${storage.fiveYearMin.toFixed(0)}–${storage.fiveYearMax.toFixed(0)} Bcf` : "--"} />
          </div>
        </div>
        <div className="macro-flow-strip">
          <div><span>SUPPLY</span><Stat label="U.S. dry gas production" value={formatMetricValue(productionMetric)} note={`${compactUnit(productionMetric)} · ${productionMetric?.period ?? "--"}`} /></div>
          <div className="macro-flow-arrow" aria-hidden="true">→</div>
          <div><span>DEMAND / EXPORTS</span><Stat label="U.S. LNG exports" value={formatMetricValue(lngMetric)} note={`${compactUnit(lngMetric)} · ${lngMetric?.period ?? "--"}`} /></div>
          <div><span>BALANCER</span><Stat label="Storage weekly flow" value={formatDelta(storage?.weeklyChange ?? null, "Bcf")} note={storageMetric?.period ?? "--"} /></div>
        </div>
      </section>

      <section className="macro-section">
        <SectionHeader eyebrow="03 · LNG & STRUCTURAL DEMAND" title="Export pull is the observed structural-demand proxy" description="Observed EIA history is separated from unsupported project and management outlooks." />
        <div className="macro-two-column">
          <div className="macro-primary-chart">
            <div className="macro-card-title"><div><h3>U.S. LNG exports</h3><span>Observed EIA data · Monthly</span></div><strong>{formatMetricValue(lngMetric)} <small>{compactUnit(lngMetric)}</small></strong></div>
            <TrendChart metric={lngMetric} label="U.S. LNG exports" />
            <div className="macro-inline-stats"><Stat label="YoY growth" value={formatPct(lngMetric ? periodChangePct(lngMetric, 12) : null)} /><Stat label="Latest period" value={lngMetric?.period ?? "--"} /></div>
          </div>
          <div className="macro-demand-stack">
            <h3>Structural demand monitor</h3>
            <Stat label="LNG exports" value={formatMetricValue(lngMetric)} note="Observed EIA · monthly" />
            <UnsupportedMetric label="Electric power demand" note="No normalized series" />
            <UnsupportedMetric label="Industrial demand" note="No normalized series" />
            <UnsupportedMetric label="AI / data centers" note="Structural outlook not yet normalized" />
            <UnsupportedMetric label="Mexico exports" note="No normalized series" />
          </div>
        </div>
      </section>

      <section className="macro-section">
        <SectionHeader eyebrow="04 · APPALACHIA / RRC RELEVANCE" title="National balance read-through, regional gaps made explicit" description="No regional dataset is inferred from national observations." />
        <div className="macro-rrc-grid">
          <div className={`macro-rrc-callout ${rrcState?.tone ?? "neutral"}`}>
            <span>WHY THIS MATTERS TO RRC</span><strong>{rrcState?.state ?? "Unavailable"}</strong>
            <p>{rrcState?.rule ?? "Classification inputs unavailable."}</p><small>{rrcState?.inputs ?? "--"}</small>
          </div>
          <div className="macro-regional-grid">
            <UnsupportedMetric label="Appalachia production" note="Regional API series not normalized" />
            <UnsupportedMetric label="Northeast power demand" note="Regional API series not normalized" />
            <UnsupportedMetric label="Takeaway conditions" note="No normalized project dataset" />
            <UnsupportedMetric label="Regional basis" note="No supported live pricing series" />
          </div>
        </div>
      </section>

      <section className="macro-section">
        <SectionHeader eyebrow="05 · NGL MARKET INTELLIGENCE" title="Propane inventory is the live NGL anchor" description="Weekly Petroleum Status Report observations; unsupported ethane and capacity data remain blank." />
        <div className="macro-two-column">
          <div className="macro-primary-chart">
            <div className="macro-card-title"><div><h3>U.S. propane inventories</h3><span>Observed EIA data · Weekly</span></div><strong>{formatMetricValue(propaneMetric)} <small>Mbbl</small></strong></div>
            <TrendChart metric={propaneMetric} label="U.S. propane inventories" limit={104} />
            <div className="macro-inline-stats"><Stat label="Weekly change" value={formatDelta(propaneMetric ? periodChange(propaneMetric) : null, "Mbbl")} /><Stat label="4-week change" value={formatPct(propaneMetric ? periodChangePct(propaneMetric, 4) : null)} /></div>
          </div>
          <div className="macro-demand-stack">
            <h3>NGL coverage</h3>
            <Stat label="Propane inventories" value={formatMetricValue(propaneMetric)} note="Observed EIA · weekly" />
            <UnsupportedMetric label="Propane days of supply" note="No supported denominator in contract" />
            <UnsupportedMetric label="Ethane exports" note="No normalized series" />
            <UnsupportedMetric label="LPG export capacity" note="Structural outlook not yet normalized" />
            <UnsupportedMetric label="NGL pricing" note="No supported live series" />
          </div>
        </div>
      </section>

      <footer className="macro-freshness">
        <div><strong>DATA FRESHNESS</strong><span>Freshness follows the newest returned observation—not an assumed publication weekday.</span></div>
        <div className="macro-freshness-list">
          {metrics.map((metric) => <span key={metric.id}><i className={`freshness-dot ${metric.freshness}`} />{metric.label}: {metric.period ?? "--"} · {metric.frequency} · {metric.freshness}</span>)}
        </div>
      </footer>
    </div>
  );
}
