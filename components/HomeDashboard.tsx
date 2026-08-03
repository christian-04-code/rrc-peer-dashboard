"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
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
  type CompanyRegistryEntry,
  type Ticker
} from "@/lib/dashboard/company-registry";

type Metric = "production" | "fcf" | "capex" | "debt" | "valuation";
type Workspace = "chart" | "map";

export function HomeDashboard() {
  const [ticker, setTicker] = useState<Ticker>(defaultTicker);
  const [metric, setMetric] = useState<Metric>("production");
  const [workspace, setWorkspace] = useState<Workspace>("chart");
  const [compareAR, setCompareAR] = useState(false);
  const [activity, setActivity] = useState("Market ribbon initialized");
  const [drawer, setDrawer] = useState<string | null>(null);
  const company = getCompany(ticker);
  const metrics = useMemo(() => getHomepageMetrics(ticker), [ticker]);

  useEffect(() => {
    let index = 0;
    const timer = window.setInterval(() => {
      setActivity(activityMessages[index % activityMessages.length]);
      index += 1;
    }, 2600);
    return () => window.clearInterval(timer);
  }, []);

  const insight = useMemo(() => {
    if (ticker !== "RRC") {
      return `${company.shortName} is selected. Detailed insights remain disabled until its normalized adapter is connected.`;
    }
    if (metric === "production") {
      return "Range targets approximately 2.6 Bcfe/d by 2027 while holding annual capital near $650–$700MM.";
    }
    if (metric === "fcf") {
      return "The repository guidance framework references more than $1.7B of cumulative 2026–2027 free cash flow at the stated commodity case.";
    }
    return "Click any metric, company, market item, or workspace control to change analytical context.";
  }, [company.shortName, ticker, metric]);

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div>
          <strong>RRC Peer Intelligence</strong>
          <span>Interactive energy research workspace</span>
        </div>
        <nav aria-label="Primary navigation">
          <button className="active">Overview</button><button>Peers</button><button>Guidance</button><button>Sources</button>
        </nav>
        <button className="live-button" onClick={() => setDrawer("Data activity and source health")}>● 6 feeds active</button>
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
            <div className="logo-frame">
              <Image src={company.logo} alt={company.logoAlt} fill sizes="64px" priority={ticker === defaultTicker} />
            </div>
            <div>
              <h1>{company.shortName}</h1>
              <p>{company.description} · {company.exchange}: {company.ticker}</p>
            </div>
          </div>
          <div className="updated"><span>Mock environment</span><strong>{activity}</strong></div>
        </div>

        <section className="metric-grid" aria-label={`${company.shortName} headline metrics`}>
          {metrics.map((item, index) => (
            <button key={item.key} className={index === metricIndex(metric) ? "metric active" : "metric"} onClick={() => setMetric(metricFromIndex(index))}>
              <span>{item.label}</span><strong>{item.displayValue}</strong><small>{item.note}</small>
            </button>
          ))}
        </section>

        <section className="company-selector" aria-label="Select primary company">
          <div>
            {selectableCompanies.map((entry) => (
              <button
                key={entry.ticker}
                className={ticker === entry.ticker ? "active" : ""}
                onClick={() => setTicker(entry.ticker)}
                aria-pressed={ticker === entry.ticker}
                title={`Select ${entry.shortName}`}
              >
                {entry.selectorLabel}
              </button>
            ))}
          </div>
          <button onClick={() => setCompareAR((value) => !value)} aria-pressed={compareAR}>
            {compareAR ? "Remove AR comparison" : "+ Compare AR"}
          </button>
        </section>

        <section className="workspace-grid">
          <div className="workspace">
            <div className="workspace-toolbar">
              <div className="tabs">
                {(["production", "fcf", "capex", "debt", "valuation"] as Metric[]).map((key) => (
                  <button key={key} className={metric === key ? "active" : ""} onClick={() => setMetric(key)} aria-pressed={metric === key}>
                    {labelMetric(key)}
                  </button>
                ))}
              </div>
              <div className="view-toggle">
                <button className={workspace === "chart" ? "active" : ""} onClick={() => setWorkspace("chart")} aria-pressed={workspace === "chart"}>Chart</button>
                <button className={workspace === "map" ? "active" : ""} onClick={() => setWorkspace("map")} aria-pressed={workspace === "map"}>Map</button>
              </div>
            </div>

            {workspace === "chart"
              ? <ChartMock compare={compareAR} title={`${company.shortName} ${labelMetric(metric)}`} />
              : <MapMock company={company} onOpen={setDrawer} />}
          </div>

          <aside>
            <div className="panel"><h2>Today’s intelligence</h2><p>{insight}</p><button onClick={() => setDrawer(insight)}>Explore supporting data →</button></div>
            <div className="panel"><h2>Live data engine</h2><ul><li><span>Market prices</span><strong>Updating</strong></li><li><span>SEC filings</span><strong>Synced</strong></li><li><span>Guidance parser</span><strong>Complete</strong></li><li><span>Peer metrics</span><strong>Ready</strong></li></ul></div>
          </aside>
        </section>

        <p className="fixture-note">{fixtureDisclaimer}</p>
      </section>

      {drawer && (
        <div className="drawer-backdrop" onClick={() => setDrawer(null)}>
          <aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="drawer-title" onClick={(event) => event.stopPropagation()}>
            <button onClick={() => setDrawer(null)}>Close</button>
            <h2 id="drawer-title">Detail drawer</h2>
            <p>{drawer}</p>
            <p className="muted">Production build must attach exact source metadata and normalized record IDs here.</p>
          </aside>
        </div>
      )}
    </main>
  );
}

function ChartMock({ compare, title }: { compare: boolean; title: string }) {
  return <div className="chart-area"><div><h2>{title}</h2><p>Interactive series foundation · repository-supported Range guidance and explicit mock states</p></div><svg viewBox="0 0 760 300" role="img" aria-label={`${title} mock chart`}><g className="grid-lines"><line x1="55" y1="50" x2="730" y2="50"/><line x1="55" y1="115" x2="730" y2="115"/><line x1="55" y1="180" x2="730" y2="180"/><line x1="55" y1="245" x2="730" y2="245"/></g><path className="primary-line" d="M70 230 C180 220 250 210 330 195 S490 150 570 110 S665 78 715 62"/>{compare && <path className="peer-line" d="M70 205 C180 198 250 184 330 170 S490 146 570 132 S665 120 715 108"/>}<circle cx="715" cy="62" r="6"/></svg></div>;
}

function MapMock({ company, onOpen }: { company: CompanyRegistryEntry; onOpen: (value: string) => void }) {
  const exposureSummary = company.exposureKeys.length > 0 ? company.exposureKeys.join(", ") : "No verified exposure keys loaded";
  return <div className="map-area"><div className="map-toolbar"><div><h2>U.S. energy exposure map</h2><p>{company.primaryRegion} · {company.primaryBasin}</p></div><div><button>Basins</button><button>Routes</button><button>LNG</button><button>Demand</button></div></div><div className="map-placeholder"><span className="basin appalachia" onClick={() => onOpen(`${company.ticker} Appalachian exposure detail`)}>Appalachia</span><span className="basin haynesville" onClick={() => onOpen(`${company.ticker} Haynesville exposure detail`)}>Haynesville</span><span className="basin permian" onClick={() => onOpen(`${company.ticker} Permian exposure detail`)}>Permian</span><i className="route one"/><i className="route two"/><strong>{company.ticker} selected · {company.defaultMapView}</strong></div><p>Registry exposure keys: {exposureSummary}. Placeholder only; replace with authoritative geometry and verified company exposure data.</p></div>;
}

function metricIndex(metric: Metric) { return ({ production: 1, fcf: 2, capex: 3, debt: 4, valuation: 0 })[metric]; }
function metricFromIndex(index: number): Metric { return (["valuation", "production", "fcf", "capex", "debt"] as Metric[])[index] ?? "production"; }
function labelMetric(metric: Metric) { return ({ production: "Production", fcf: "FCF", capex: "CapEx", debt: "Net debt", valuation: "Valuation" })[metric]; }
