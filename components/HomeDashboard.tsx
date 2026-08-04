"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import comparisonPreferences from "@/config/comparison-preferences.json";
import {
  activityMessages,
  fixtureDisclaimer,
  getHomepageMetrics,
  marketRibbon
} from "@/lib/dashboard/homepage-data";
import {
  defaultTicker,
  getCompany,
  selectableCompanies,
  type Ticker
} from "@/lib/dashboard/company-registry";

type Metric = "production" | "fcf" | "capex" | "debt" | "valuation";
type Workspace = "chart" | "map";

const MAX_COMPARISONS = comparisonPreferences.maxComparisonPeers;
const DEFAULT_COMPARISONS = comparisonPreferences.defaultComparisonPeers as Ticker[];

export function HomeDashboard() {
  const [ticker, setTicker] = useState<Ticker>(defaultTicker);
  const [metric, setMetric] = useState<Metric>("production");
  const [workspace, setWorkspace] = useState<Workspace>("chart");
  const [comparisonTickers, setComparisonTickers] = useState<Ticker[]>(DEFAULT_COMPARISONS);
  const [activity, setActivity] = useState("Market ribbon initialized");
  const [drawer, setDrawer] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const company = getCompany(ticker);
  const brandCompany = getCompany("RRC");
  const metrics = useMemo(() => getHomepageMetrics(ticker), [ticker]);

  useEffect(() => {
    let index = 0;
    const timer = window.setInterval(() => {
      setActivity(activityMessages[index % activityMessages.length]);
      index += 1;
    }, 2600);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!drawer) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawer(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawer]);

  const insightRows = useMemo((): { label?: string; text: string }[] => {
    if (ticker !== "RRC") {
      return [{ text: `${ticker} is selected. Detailed insights remain disabled until its normalized adapter is connected.` }];
    }
    return [
      { label: "Growth", text: "Range targets roughly 2.6 Bcfe/d by 2027." },
      { label: "Capital", text: "Annual spending remains $650–$700MM." },
      { label: "FCF", text: "More than $1.7B cumulative at the stated price case." }
    ];
  }, [ticker]);
  const insightSummary = insightRows.map((row) => row.text).join(" ");

  function selectPrimaryCompany(nextTicker: Ticker) {
    setTicker(nextTicker);
    setComparisonTickers((current) => current.filter((peer) => peer !== nextTicker));
  }

  function toggleComparison(peer: Ticker) {
    if (peer === ticker) return;
    setComparisonTickers((current) => {
      if (current.includes(peer)) return current.filter((item) => item !== peer);
      if (current.length >= MAX_COMPARISONS) return current;
      return [...current, peer];
    });
  }

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div className="topbar-main">
          <div className="brand">
            <strong>RRC Peer Intelligence</strong>
            <span>Interactive energy research workspace</span>
          </div>
          <div className="topbar-right">
            <nav aria-label="Primary navigation"><button className="active">Overview</button><button>Peers</button><button>Guidance</button><button>Sources</button></nav>
            <div className="brand-mark"><Image src={brandCompany.logo} alt={brandCompany.logoAlt} fill sizes="32px" /></div>
          </div>
        </div>
        <div className="status-row">
          <button className="live-button" onClick={() => setDrawer("Data activity and source health")}>● 6 feeds active</button>
        </div>
      </header>

      <section className="market-ribbon" aria-label="Mock live market ribbon">
        {marketRibbon.map((item) => (
          <button key={item.key} onClick={() => setDrawer(`${item.label}: ${item.status} market context, timestamp, range, and source details.`)}>
            <span>{item.label}</span><strong>{item.displayValue}</strong><em>{item.change}</em>
          </button>
        ))}
      </section>

      <section className="content">
        <div className="company-header">
          <div className="company-identity">
            <div><h1>{company.shortName}</h1><p>{company.ticker} · {company.exchange} · {company.description}</p></div>
          </div>
          <div className="updated"><span>Mock environment</span><strong>{activity}</strong></div>
        </div>

        <section className="metric-grid" aria-label={`${company.shortName} key metrics`}>
          {metrics.map((item, index) => (
            <button key={item.key} className={index === metricIndex(metric) ? "metric active" : "metric"} onClick={() => setMetric(metricFromIndex(index))}>
              <span>{item.label}</span><strong>{item.displayValue}</strong><small>{item.note}</small>
            </button>
          ))}
        </section>

        <section className="company-selector" aria-label="Company and peer selection">
          <div className="selector-block">
            <span className="selector-label">Primary company</span>
            <div>{selectableCompanies.map((entry) => <button key={entry.ticker} className={ticker === entry.ticker ? "active" : ""} onClick={() => selectPrimaryCompany(entry.ticker)}>{entry.selectorLabel}</button>)}</div>
          </div>
          <div className="selector-block comparison-block">
            <span className="selector-label">Compare peers · {comparisonTickers.length}/{MAX_COMPARISONS}</span>
            <div>{selectableCompanies.filter((entry) => entry.ticker !== ticker).map((entry) => <button key={entry.ticker} className={comparisonTickers.includes(entry.ticker) ? "comparison-active" : ""} aria-pressed={comparisonTickers.includes(entry.ticker)} onClick={() => toggleComparison(entry.ticker)}>{entry.selectorLabel}</button>)}</div>
            <button className="clear-comparisons" onClick={() => setComparisonTickers([])} disabled={comparisonTickers.length === 0}>Clear</button>
          </div>
        </section>

        <section className="workspace-grid">
          <div className="workspace">
            <div className="workspace-toolbar">
              <div className="tabs">{(["production", "fcf", "capex", "debt", "valuation"] as Metric[]).map((key) => <button key={key} className={metric === key ? "active" : ""} onClick={() => setMetric(key)}>{labelMetric(key)}</button>)}</div>
              <div className="view-toggle"><button className={workspace === "chart" ? "active" : ""} onClick={() => setWorkspace("chart")}>Chart</button><button className={workspace === "map" ? "active" : ""} onClick={() => setWorkspace("map")}>Map</button></div>
            </div>

            {workspace === "chart" ? <ChartMock comparisonTickers={comparisonTickers} title={`${company.shortName} ${labelMetric(metric)}`} /> : <MapMock ticker={ticker} comparisonTickers={comparisonTickers} onOpen={setDrawer} />}
          </div>

          <aside>
            <div className="panel">
              <h2>Today’s intelligence</h2>
              <div className="insight-list">
                {insightRows.map((row) => (
                  <div className="insight-row" key={row.label ?? row.text}>
                    {row.label ? <b>{row.label}: </b> : null}
                    {row.text}
                  </div>
                ))}
              </div>
              <button onClick={() => setDrawer(insightSummary)}>Explore supporting data →</button>
            </div>
            <div className="panel">
              <div className="panel-head"><h2>Live data engine</h2><span className="badge">Simulated</span></div>
              <ul>{activityMessages.map((message) => <li key={message}><span>{message}</span><strong>now</strong></li>)}</ul>
            </div>
          </aside>
        </section>

        <p className="fixture-note">{fixtureDisclaimer}</p>
      </section>

      {drawer && <div className="drawer-backdrop" onClick={() => setDrawer(null)}><aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" onClick={(event) => event.stopPropagation()}><button ref={closeButtonRef} onClick={() => setDrawer(null)}>Close</button><h2 id="drawer-title">Detail drawer</h2><p>{drawer}</p><p className="muted">Production build must attach exact source metadata and normalized record IDs here.</p></aside></div>}
    </main>
  );
}

function ChartMock({ comparisonTickers, title }: { comparisonTickers: Ticker[]; title: string }) {
  const peerPaths = [
    "M70 205 C180 198 250 184 330 170 S490 146 570 132 S665 120 715 108",
    "M70 220 C180 205 250 200 330 182 S490 165 570 145 S665 135 715 122",
    "M70 190 C180 186 250 177 330 162 S490 154 570 138 S665 127 715 118",
    "M70 235 C180 226 250 217 330 204 S490 178 570 158 S665 145 715 136",
    "M70 198 C180 190 250 178 330 165 S490 140 570 126 S665 116 715 105",
    "M70 214 C180 208 250 198 330 188 S490 160 570 148 S665 134 715 125"
  ];
  return <div className="chart-area"><div><h2>{title}</h2><p>Primary company with up to six selected peer overlays</p></div><svg viewBox="0 0 760 300" role="img" aria-label={`${title} mock chart`}><g className="grid-lines"><line x1="55" y1="50" x2="730" y2="50"/><line x1="55" y1="115" x2="730" y2="115"/><line x1="55" y1="180" x2="730" y2="180"/><line x1="55" y1="245" x2="730" y2="245"/></g><path className="primary-line" d="M70 230 C180 220 250 210 330 195 S490 150 570 110 S665 78 715 62"/>{comparisonTickers.map((peer, index) => <path key={peer} className={`peer-line peer-${index + 1}`} d={peerPaths[index]} />)}<circle cx="715" cy="62" r="6"/></svg><div className="chart-legend"><span className="primary-legend">Primary</span>{comparisonTickers.map((peer) => <span key={peer}>{peer}</span>)}</div></div>;
}

function MapMock({ ticker, comparisonTickers, onOpen }: { ticker: Ticker; comparisonTickers: Ticker[]; onOpen: (value: string) => void }) {
  const company = getCompany(ticker);
  return <div className="map-area"><div className="map-toolbar"><div><h2>U.S. energy exposure map</h2><p>{company.primaryRegion} · {company.primaryBasin} · default view: {company.defaultMapView}</p></div><div><button>Basins</button><button>Routes</button><button>LNG</button><button>Demand</button></div></div><div className="map-placeholder"><span className="basin appalachia" onClick={() => onOpen(`${ticker} Appalachian exposure detail`)}>Appalachia</span><span className="basin haynesville" onClick={() => onOpen(`${ticker} Haynesville exposure detail`)}>Haynesville</span><span className="basin permian" onClick={() => onOpen(`${ticker} Permian exposure detail`)}>Permian</span><i className="route one"/><i className="route two"/><strong>{ticker} selected · peers: {comparisonTickers.length ? comparisonTickers.join(", ") : "none"}</strong></div><p>Placeholder only. Claude must replace this schematic with authoritative geographic geometry and verified company exposure data.</p></div>;
}

function metricIndex(metric: Metric) { return ({ production: 1, fcf: 2, capex: 3, debt: 4, valuation: 0 })[metric]; }
function metricFromIndex(index: number): Metric { return (["valuation", "production", "fcf", "capex", "debt"] as Metric[])[index] ?? "production"; }
function labelMetric(metric: Metric) { return ({ production: "Production", fcf: "FCF", capex: "CapEx", debt: "Net debt", valuation: "Valuation" })[metric]; }
