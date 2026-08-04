"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import comparisonPreferences from "@/config/comparison-preferences.json";
import { activityMessages, fixtureDisclaimer, getHomepageMetrics } from "@/lib/dashboard/homepage-data";
import {
  defaultTicker,
  getCompany,
  selectableCompanies
} from "@/lib/dashboard/company-registry";
import type { InsightRow, Metric, Ticker, View, Workspace } from "@/lib/dashboard/types";
import { MarketRibbon } from "@/components/dashboard/MarketRibbon";
import { CompanyHero } from "@/components/dashboard/CompanyHero";
import { MetricStrip } from "@/components/dashboard/MetricStrip";
import { CompanySelector } from "@/components/dashboard/CompanySelector";
import { CompanyComparisonSelector } from "@/components/dashboard/CompanyComparisonSelector";
import { ChartWorkspace } from "@/components/dashboard/ChartWorkspace";
import { MapWorkspace } from "@/components/dashboard/MapWorkspace";
import { FinancePanel } from "@/components/dashboard/FinancePanel";
import { FinancialsPanel } from "@/components/dashboard/FinancialsPanel";
import { DataActivityPanel } from "@/components/dashboard/DataActivityPanel";
import { MacroPanel } from "@/components/dashboard/MacroPanel";
import { PeersPanel } from "@/components/dashboard/PeersPanel";
import { DetailDrawer } from "@/components/dashboard/DetailDrawer";

const MAX_COMPARISONS = comparisonPreferences.maxComparisonPeers;
const DEFAULT_COMPARISONS = comparisonPreferences.defaultComparisonPeers as Ticker[];

export function HomeDashboard() {
  const [ticker, setTicker] = useState<Ticker>(defaultTicker);
  const [metric, setMetric] = useState<Metric>("production");
  const [workspace, setWorkspace] = useState<Workspace>("chart");
  const [view, setView] = useState<View>("dashboard");
  const [comparisonTickers, setComparisonTickers] = useState<Ticker[]>(DEFAULT_COMPARISONS);
  const [activity, setActivity] = useState("Market ribbon initialized");
  const [drawer, setDrawer] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const backgroundRef = useRef<HTMLDivElement>(null);

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

  function openDrawer(value: string) {
    triggerRef.current = document.activeElement as HTMLElement | null;
    setDrawer(value);
  }

  const insightRows = useMemo((): InsightRow[] => {
    if (ticker !== "RRC") {
      return [{ text: `${ticker} is selected. Detailed insights remain disabled until its normalized adapter is connected.` }];
    }
    return [
      { label: "Growth", text: "Range targets roughly 2.6 Bcfe/d by 2027." },
      { label: "Capital", text: "Annual spending remains $650–$700MM." },
      { label: "FCF", text: "More than $1.7B cumulative at the stated price case." }
    ];
  }, [ticker]);

  const financialsRows = useMemo((): InsightRow[] => {
    return metrics
      .filter((item) => item.key === "free_cash_flow" || item.key === "capital_expenditures" || item.key === "net_leverage")
      .map((item) => ({ label: item.label, text: `${item.displayValue} — ${item.note}` }));
  }, [metrics]);

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
              <button className={view === "peers" ? "active" : ""} onClick={() => setView("peers")}>Peers</button>
              <button className={view === "dashboard" && workspace === "map" ? "active" : ""} onClick={() => { setView("dashboard"); setWorkspace("map"); }}>Map</button>
              <button onClick={() => openDrawer("Source inventory and normalized record lineage")}>Sources</button>
              <button className={view === "macro" ? "active" : ""} onClick={() => setView("macro")}>Macro</button>
            </nav>
          </div>
          <div className="status-row">
            <button className="live-button" onClick={() => openDrawer("Data activity and source health")}>● 6 feeds active</button>
          </div>
        </header>

        <MarketRibbon onOpen={openDrawer} />

        <section className="content">
          {view === "macro" ? (
            <MacroPanel />
          ) : view === "peers" ? (
            <PeersPanel companies={selectableCompanies} primaryTicker={ticker} />
          ) : (
            <>
              <CompanyHero company={company} activity={activity} />

              <MetricStrip metrics={metrics} activeMetric={metric} onSelectMetric={setMetric} companyShortName={company.shortName} />

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
                    <div className="tabs">{(["production", "fcf", "capex", "debt", "valuation"] as Metric[]).map((key) => <button key={key} className={metric === key ? "active" : ""} onClick={() => setMetric(key)}>{labelMetric(key)}</button>)}</div>
                  </div>

                  {workspace === "chart" ? <ChartWorkspace ticker={ticker} comparisonTickers={comparisonTickers} title={`${company.shortName} ${labelMetric(metric)}`} metric={metric} /> : <MapWorkspace ticker={ticker} comparisonTickers={comparisonTickers} onOpen={openDrawer} />}
                </div>

                <aside>
                  <FinancePanel rows={insightRows} onOpenDetail={openDrawer} />
                  <FinancialsPanel rows={financialsRows} />
                  <DataActivityPanel />
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

function labelMetric(metric: Metric) { return ({ production: "Production", fcf: "FCF", capex: "CapEx", debt: "Net debt", valuation: "Valuation" })[metric]; }
