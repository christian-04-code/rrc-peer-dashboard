"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import comparisonPreferences from "@/config/comparison-preferences.json";
import { activityMessages, fixtureDisclaimer } from "@/lib/dashboard/homepage-data";
import { getOverviewSummaryCards } from "@/lib/dashboard/overview-metrics";
import {
  defaultTicker,
  getCompany,
  selectableCompanies
} from "@/lib/dashboard/company-registry";
import type { Metric, Ticker, View, Workspace } from "@/lib/dashboard/types";
import { useMarketData } from "@/lib/market/use-market-data";
import { useFinnhubQuotes } from "@/lib/market/use-finnhub-quotes";
import { buildCurrentMarketPricesFromMarketResponse } from "@/lib/forecast/live-market-prices";
import { MarketRibbon } from "@/components/dashboard/MarketRibbon";
import { CompanyHero } from "@/components/dashboard/CompanyHero";
import { MetricStrip } from "@/components/dashboard/MetricStrip";
import { CompanySelector } from "@/components/dashboard/CompanySelector";
import { CompanyComparisonSelector } from "@/components/dashboard/CompanyComparisonSelector";
import { ChartWorkspace } from "@/components/dashboard/ChartWorkspace";
import { MapWorkspace } from "@/components/dashboard/MapWorkspace";
import { GuidancePanel } from "@/components/dashboard/GuidancePanel";
import { ValuationsPanel } from "@/components/dashboard/ValuationsPanel";
import { MacroPanel } from "@/components/dashboard/MacroPanel";
import { ForecastWorkspacePanel } from "@/components/dashboard/ForecastWorkspacePanel";
import { DetailDrawer, type DrawerContent } from "@/components/dashboard/DetailDrawer";

const MAX_COMPARISONS = comparisonPreferences.maxComparisonPeers;
const DEFAULT_COMPARISONS = comparisonPreferences.defaultComparisonPeers as Ticker[];

export function HomeDashboard() {
  const [ticker, setTicker] = useState<Ticker>(defaultTicker);
  const [metric, setMetric] = useState<Metric>("production");
  const [workspace, setWorkspace] = useState<Workspace>("chart");
  const [view, setView] = useState<View>("dashboard");
  const [comparisonTickers, setComparisonTickers] = useState<Ticker[]>(DEFAULT_COMPARISONS);
  const [activity, setActivity] = useState("Market ribbon initialized");
  const [drawer, setDrawer] = useState<DrawerContent | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const backgroundRef = useRef<HTMLDivElement>(null);
  const market = useMarketData();
  const finnhubQuotes = useFinnhubQuotes();

  const company = getCompany(ticker);
  const brandCompany = getCompany("RRC");
  const liveSharePrice = useMemo(() => {
    const quote = finnhubQuotes.data?.equities[ticker];
    if (!quote || quote.status !== "ok" || quote.price === null) return null;
    return { value: quote.price, note: `Finnhub · current market (${quote.symbol})` };
  }, [finnhubQuotes.data, ticker]);
  const metrics = useMemo(() => getOverviewSummaryCards(ticker, liveSharePrice), [ticker, liveSharePrice]);

  useEffect(() => {
    let index = 0;
    const timer = window.setInterval(() => {
      setActivity(activityMessages[index % activityMessages.length]);
      index += 1;
    }, 2600);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const backgroundNode = backgroundRef.current;
    if (backgroundNode) backgroundNode.inert = Boolean(drawer);
    if (!drawer) return;
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawer(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      if (backgroundNode) backgroundNode.inert = false;
      triggerRef.current?.focus();
    };
  }, [drawer]);

  function openDrawer(value: DrawerContent) {
    triggerRef.current = document.activeElement as HTMLElement | null;
    setDrawer(value);
  }

  const currentMarketPrices = useMemo(
    () => buildCurrentMarketPricesFromMarketResponse(market.data),
    [market.data]
  );

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

  const activeFeedCount = market.data?.metrics.filter((item) => item.status === "ok").length ?? 0;

  return (
    <main className="dashboard-shell">
      <div ref={backgroundRef}>
        <header className="topbar">
          <div className="topbar-main">
            <div className="topbar-left">
              <div className="brand-mark"><Image src={brandCompany.logo} alt={brandCompany.logoAlt} fill sizes="32px" /></div>
              <div className="brand">
                <strong>RRC Peer Intelligence</strong>
                <span>Interactive energy research workspace</span>
              </div>
            </div>
            <nav aria-label="Primary navigation">
              <button className={view === "dashboard" && workspace === "chart" ? "active" : ""} onClick={() => { setView("dashboard"); setWorkspace("chart"); }}>Overview</button>
              <button className={view === "forecast" ? "active" : ""} onClick={() => setView("forecast")}>Forecast</button>
              <button className={view === "dashboard" && workspace === "map" ? "active" : ""} onClick={() => { setView("dashboard"); setWorkspace("map"); }}>Map</button>
              <button className={view === "macro" ? "active" : ""} onClick={() => setView("macro")}>Macro</button>
            </nav>
          </div>
          <div className="status-row">
            <button className="live-button" onClick={() => openDrawer(market.error ?? `${activeFeedCount} of 5 EIA feeds available`)}>● {activeFeedCount} feeds active</button>
          </div>
        </header>

        <MarketRibbon onOpen={openDrawer} />

        <section className="content">
          {view === "macro" ? (
            <MacroPanel />
          ) : view === "forecast" ? (
            <ForecastWorkspacePanel />
          ) : (
            <>
              <CompanyHero company={company} activity={activity} />

              <MetricStrip metrics={metrics} companyShortName={company.shortName} />

              <section className="company-selector" aria-label="Company and peer selection">
                <CompanySelector companies={selectableCompanies} ticker={ticker} onSelect={selectPrimaryCompany} />
                <CompanyComparisonSelector
                  companies={selectableCompanies}
                  ticker={ticker}
                  comparisonTickers={comparisonTickers}
                  maxComparisons={MAX_COMPARISONS}
                  onToggle={toggleComparison}
                  onClear={() => setComparisonTickers([])}
                />
              </section>

              <section className="workspace-grid">
                <div className="workspace">
                  <div className="workspace-toolbar">
                    <div className="tabs">{(["production", "revenue", "fcf", "capex", "debt", "ebitdax"] as Metric[]).map((key) => <button key={key} className={metric === key ? "active" : ""} onClick={() => setMetric(key)}>{labelMetric(key)}</button>)}</div>
                  </div>

                  {workspace === "chart" ? <ChartWorkspace ticker={ticker} comparisonTickers={comparisonTickers} title={`${company.shortName} ${labelMetric(metric)}`} metric={metric} currentMarketPrices={currentMarketPrices} /> : <MapWorkspace ticker={ticker} comparisonTickers={comparisonTickers} onOpen={openDrawer} />}
                </div>

                <aside>
                  <GuidancePanel ticker={ticker} onOpenDetail={openDrawer} />
                  <ValuationsPanel ticker={ticker} />
                </aside>
              </section>
            </>
          )}

          <p className="fixture-note">{fixtureDisclaimer}</p>
        </section>
      </div>

      <DetailDrawer content={drawer} onClose={() => setDrawer(null)} closeButtonRef={closeButtonRef} />
    </main>
  );
}

function labelMetric(metric: Metric) { return ({ production: "Production", revenue: "Revenue", fcf: "FCF", capex: "CapEx", debt: "Net debt", ebitdax: "EBITDAX" })[metric]; }
