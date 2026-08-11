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
import {
  MAX_SELECTED_COMPANIES,
  focusSelectedCompany,
  updateCompanyComparison,
  type CompanyComparisonState
} from "@/lib/dashboard/company-comparison";
import type { Metric, Ticker, View } from "@/lib/dashboard/types";
import { useMarketData } from "@/lib/market/use-market-data";
import { useFinnhubQuotes } from "@/lib/market/use-finnhub-quotes";
import { buildCurrentMarketPricesFromMarketResponse } from "@/lib/forecast/live-market-prices";
import { MarketRibbon } from "@/components/dashboard/MarketRibbon";
import { CompanyHero } from "@/components/dashboard/CompanyHero";
import { MetricStrip } from "@/components/dashboard/MetricStrip";
import { CompanyComparisonSelector } from "@/components/dashboard/CompanyComparisonSelector";
import { ChartWorkspace } from "@/components/dashboard/ChartWorkspace";
import { GuidancePanel } from "@/components/dashboard/GuidancePanel";
import { ValuationsPanel } from "@/components/dashboard/ValuationsPanel";
import { MacroPanel } from "@/components/dashboard/MacroPanel";
import { ForecastWorkspacePanel } from "@/components/dashboard/ForecastWorkspacePanel";
import { DetailDrawer, type DrawerContent } from "@/components/dashboard/DetailDrawer";

const DEFAULT_COMPARISONS = comparisonPreferences.defaultComparisonPeers as Ticker[];
const DEFAULT_SELECTED_TICKERS = [defaultTicker, ...DEFAULT_COMPARISONS.filter((ticker) => ticker !== defaultTicker)];

export function HomeDashboard() {
  const [companyComparison, setCompanyComparison] = useState<CompanyComparisonState>({
    selectedTickers: DEFAULT_SELECTED_TICKERS,
    focusedTicker: defaultTicker
  });
  const [metric, setMetric] = useState<Metric>("production");
  const [view, setView] = useState<View>("dashboard");
  const [activity, setActivity] = useState("Market ribbon initialized");
  const [drawer, setDrawer] = useState<DrawerContent | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const backgroundRef = useRef<HTMLDivElement>(null);
  const market = useMarketData();
  const finnhubQuotes = useFinnhubQuotes();

  const { selectedTickers, focusedTicker } = companyComparison;
  const company = getCompany(focusedTicker);
  const brandCompany = getCompany("RRC");
  const liveSharePrice = useMemo(() => {
    const quote = finnhubQuotes.data?.equities[focusedTicker];
    if (!quote || quote.status !== "ok" || quote.price === null) return null;
    return { value: quote.price, note: `Finnhub · current market (${quote.symbol})` };
  }, [finnhubQuotes.data, focusedTicker]);
  const metrics = useMemo(() => getOverviewSummaryCards(focusedTicker, liveSharePrice), [focusedTicker, liveSharePrice]);

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

  function activateCompany(nextTicker: Ticker) {
    setCompanyComparison((current) => updateCompanyComparison(current, nextTicker));
  }

  function focusCompany(nextTicker: Ticker) {
    setCompanyComparison((current) => focusSelectedCompany(current, nextTicker));
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
              <button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}>Overview</button>
              <button className={view === "forecast" ? "active" : ""} onClick={() => setView("forecast")}>Forecast</button>
              <button className={view === "macro" ? "active" : ""} onClick={() => setView("macro")}>Macro</button>
            </nav>
          </div>
          <div className="status-row">
            <button className="live-button" onClick={() => openDrawer(market.error ?? `${activeFeedCount} of ${market.data?.metrics.length ?? 7} EIA feeds available`)}>● {activeFeedCount} feeds active</button>
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

              <section className="company-selector" aria-label="Company comparison selection">
                <CompanyComparisonSelector
                  companies={selectableCompanies}
                  selectedTickers={selectedTickers}
                  focusedTicker={focusedTicker}
                  maxSelections={MAX_SELECTED_COMPANIES}
                  onActivate={activateCompany}
                  onFocusChange={focusCompany}
                />
              </section>

              <section className="workspace-grid">
                <div className="workspace">
                  <div className="workspace-toolbar">
                    <div className="tabs">{(["production", "revenue", "fcf", "capex", "debt", "ebitdax"] as Metric[]).map((key) => <button key={key} className={metric === key ? "active" : ""} onClick={() => setMetric(key)}>{labelMetric(key)}</button>)}</div>
                  </div>

                  <ChartWorkspace selectedTickers={selectedTickers} title={`Company comparison · ${labelMetric(metric)}`} metric={metric} currentMarketPrices={currentMarketPrices} />
                </div>

                <aside>
                  <GuidancePanel ticker={focusedTicker} onOpenDetail={openDrawer} />
                  <ValuationsPanel ticker={focusedTicker} />
                </aside>
              </section>
            </>
          )}

          {view !== "macro" ? <p className="fixture-note">{fixtureDisclaimer}</p> : null}
        </section>
      </div>

      <DetailDrawer content={drawer} onClose={() => setDrawer(null)} closeButtonRef={closeButtonRef} />
    </main>
  );
}

function labelMetric(metric: Metric) { return ({ production: "Production", revenue: "Revenue", fcf: "FCF", capex: "CapEx", debt: "Net debt", ebitdax: "EBITDAX" })[metric]; }
