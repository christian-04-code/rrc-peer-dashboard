"use client";

import Image, { type StaticImageData } from "next/image";
import { useEffect, useMemo, useState } from "react";
import rrcLogo from "@/assets/logos/RRC.png";
import arLogo from "@/assets/logos/AR.png";
import cnxLogo from "@/assets/logos/CNX.png";
import crkLogo from "@/assets/logos/CRK.png";
import eqtLogo from "@/assets/logos/EQT.png";
import exeLogo from "@/assets/logos/EXE.png";
import gporLogo from "@/assets/logos/GPOR.svg";
import {
  activityMessages,
  fixtureDisclaimer,
  getHomepageMetrics,
  marketRibbon,
  type Ticker
} from "@/lib/dashboard/homepage-data";

type Metric = "production" | "fcf" | "capex" | "debt" | "valuation";
type Workspace = "chart" | "map";

type CompanyView = {
  name: string;
  subtitle: string;
  logo: StaticImageData | string;
};

const companies: Record<Ticker, CompanyView> = {
  RRC: { name: "Range Resources", subtitle: "Appalachian natural gas and NGL producer", logo: rrcLogo },
  AR: { name: "Antero Resources", subtitle: "Appalachian gas and NGL producer", logo: arLogo },
  CNX: { name: "CNX Resources", subtitle: "Appalachian natural gas producer", logo: cnxLogo },
  CRK: { name: "Comstock Resources", subtitle: "Haynesville natural gas producer", logo: crkLogo },
  EQT: { name: "EQT Corporation", subtitle: "Large-scale Appalachian gas producer", logo: eqtLogo },
  EXE: { name: "Expand Energy", subtitle: "Diversified U.S. natural gas producer", logo: exeLogo },
  GPOR: { name: "Gulfport Energy", subtitle: "Appalachian-focused gas producer", logo: gporLogo }
};

export function HomeDashboard() {
  const [ticker, setTicker] = useState<Ticker>("RRC");
  const [metric, setMetric] = useState<Metric>("production");
  const [workspace, setWorkspace] = useState<Workspace>("chart");
  const [compareAR, setCompareAR] = useState(false);
  const [activity, setActivity] = useState("Market ribbon initialized");
  const [drawer, setDrawer] = useState<string | null>(null);
  const company = companies[ticker];
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
    if (ticker !== "RRC") return `${ticker} is selected. Detailed insights remain disabled until its normalized adapter is connected.`;
    if (metric === "production") return "Range targets approximately 2.6 Bcfe/d by 2027 while holding annual capital near $650–$700MM.";
    if (metric === "fcf") return "The repository guidance framework references more than $1.7B of cumulative 2026–2027 free cash flow at the stated commodity case.";
    return "Click any metric, company, market item, or workspace control to change analytical context.";
  }, [ticker, metric]);

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div>
          <strong>RRC Peer Intelligence</strong>
          <span>Interactive energy research workspace</span>
        </div>
        <nav><button className="active">Overview</button><button>Peers</button><button>Guidance</button><button>Sources</button></nav>
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
            <div className="logo-frame"><Image src={company.logo} alt={`${company.name} logo`} fill sizes="64px" /></div>
            <div><h1>{company.name}</h1><p>{company.subtitle}</p></div>
          </div>
          <div className="updated"><span>Mock environment</span><strong>{activity}</strong></div>
        </div>

        <section className="metric-grid">
          {metrics.map((item, index) => (
            <button key={item.key} className={index === metricIndex(metric) ? "metric active" : "metric"} onClick={() => setMetric(metricFromIndex(index))}>
              <span>{item.label}</span><strong>{item.displayValue}</strong><small>{item.note}</small>
            </button>
          ))}
        </section>

        <section className="company-selector">
          <div>{(Object.keys(companies) as Ticker[]).map((key) => <button key={key} className={ticker === key ? "active" : ""} onClick={() => setTicker(key)}>{key}</button>)}</div>
          <button onClick={() => setCompareAR((value) => !value)}>{compareAR ? "Remove AR comparison" : "+ Compare AR"}</button>
        </section>

        <section className="workspace-grid">
          <div className="workspace">
            <div className="workspace-toolbar">
              <div className="tabs">{(["production", "fcf", "capex", "debt", "valuation"] as Metric[]).map((key) => <button key={key} className={metric === key ? "active" : ""} onClick={() => setMetric(key)}>{labelMetric(key)}</button>)}</div>
              <div className="view-toggle"><button className={workspace === "chart" ? "active" : ""} onClick={() => setWorkspace("chart")}>Chart</button><button className={workspace === "map" ? "active" : ""} onClick={() => setWorkspace("map")}>Map</button></div>
            </div>

            {workspace === "chart" ? <ChartMock compare={compareAR} title={`${company.name} ${labelMetric(metric)}`} /> : <MapMock ticker={ticker} onOpen={setDrawer} />}
          </div>

          <aside>
            <div className="panel"><h2>Today’s intelligence</h2><p>{insight}</p><button onClick={() => setDrawer(insight)}>Explore supporting data →</button></div>
            <div className="panel"><h2>Live data engine</h2><ul><li><span>Market prices</span><strong>Updating</strong></li><li><span>SEC filings</span><strong>Synced</strong></li><li><span>Guidance parser</span><strong>Complete</strong></li><li><span>Peer metrics</span><strong>Ready</strong></li></ul></div>
          </aside>
        </section>

        <p className="fixture-note">{fixtureDisclaimer}</p>
      </section>

      {drawer && <div className="drawer-backdrop" onClick={() => setDrawer(null)}><aside className="drawer" onClick={(event) => event.stopPropagation()}><button onClick={() => setDrawer(null)}>Close</button><h2>Detail drawer</h2><p>{drawer}</p><p className="muted">Production build must attach exact source metadata and normalized record IDs here.</p></aside></div>}
    </main>
  );
}

function ChartMock({ compare, title }: { compare: boolean; title: string }) {
  return <div className="chart-area"><div><h2>{title}</h2><p>Interactive series foundation · repository-supported Range guidance and explicit mock states</p></div><svg viewBox="0 0 760 300" role="img" aria-label={`${title} mock chart`}><g className="grid-lines"><line x1="55" y1="50" x2="730" y2="50"/><line x1="55" y1="115" x2="730" y2="115"/><line x1="55" y1="180" x2="730" y2="180"/><line x1="55" y1="245" x2="730" y2="245"/></g><path className="primary-line" d="M70 230 C180 220 250 210 330 195 S490 150 570 110 S665 78 715 62"/>{compare && <path className="peer-line" d="M70 205 C180 198 250 184 330 170 S490 146 570 132 S665 120 715 108"/>}<circle cx="715" cy="62" r="6"/></svg></div>;
}

function MapMock({ ticker, onOpen }: { ticker: Ticker; onOpen: (value: string) => void }) {
  return <div className="map-area"><div className="map-toolbar"><h2>U.S. energy exposure map</h2><div><button>Basins</button><button>Routes</button><button>LNG</button><button>Demand</button></div></div><div className="map-placeholder"><span className="basin appalachia" onClick={() => onOpen(`${ticker} Appalachian exposure detail`)}>Appalachia</span><span className="basin haynesville" onClick={() => onOpen(`${ticker} Haynesville exposure detail`)}>Haynesville</span><span className="basin permian" onClick={() => onOpen(`${ticker} Permian exposure detail`)}>Permian</span><i className="route one"/><i className="route two"/><strong>{ticker} selected</strong></div><p>Placeholder only. Claude must replace this schematic with authoritative geographic geometry and verified company exposure data.</p></div>;
}

function metricIndex(metric: Metric) { return ({ production: 1, fcf: 2, capex: 3, debt: 4, valuation: 0 })[metric]; }
function metricFromIndex(index: number): Metric { return (["valuation", "production", "fcf", "capex", "debt"] as Metric[])[index] ?? "production"; }
function labelMetric(metric: Metric) { return ({ production: "Production", fcf: "FCF", capex: "CapEx", debt: "Net debt", valuation: "Valuation" })[metric]; }
