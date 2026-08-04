"use client";

import { useMemo, useState } from "react";
import type { CompanyRegistryEntry } from "@/lib/dashboard/company-registry";
import {
  getQuarterlyFinancials,
  quarters,
  type Quarter,
  type QuarterlyFinancials,
  type SourcedValue
} from "@/lib/dashboard/financials-quarterly";
import type { Ticker } from "@/lib/dashboard/types";

type MetricGroup = "financial" | "production" | "pricing" | "costs" | "wells";
type SortDirection = "desc" | "asc";
type ChangeMode = "qoq" | "yoy";

type MetricDefinition = {
  label: string;
  unit: string;
  value: (row: QuarterlyFinancials) => SourcedValue;
};

type ChangeResult = {
  ticker: Ticker;
  current: number;
  prior: number;
  change: number;
};

type Quartile = 1 | 2 | 3 | 4;

const metricGroups: Record<MetricGroup, { label: string; metrics: MetricDefinition[] }> = {
  financial: {
    label: "Financial",
    metrics: [
      { label: "Revenue", unit: "$MM", value: (row) => row.revenue },
      { label: "Adjusted EBITDAX", unit: "$MM", value: (row) => row.adjustedEbitdax },
      { label: "Capital expenditures", unit: "$MM", value: (row) => row.capitalExpenditures },
      { label: "Net debt", unit: "$MM", value: (row) => row.netDebt }
    ]
  },
  production: {
    label: "Production",
    metrics: [
      { label: "Total production", unit: "MMcfe/d", value: (row) => row.production.total },
      { label: "Natural gas", unit: "MMcf/d", value: (row) => row.production.naturalGas },
      { label: "NGL", unit: "Mbbl/d", value: (row) => row.production.ngl },
      { label: "Oil / condensate", unit: "Mbbl/d", value: (row) => row.production.oilCondensate },
      { label: "Natural gas mix", unit: "%", value: (row) => row.commodityMix.naturalGasPct },
      { label: "NGL mix", unit: "%", value: (row) => row.commodityMix.nglPct },
      { label: "Oil / condensate mix", unit: "%", value: (row) => row.commodityMix.oilCondensatePct }
    ]
  },
  pricing: {
    label: "Realized pricing",
    metrics: [
      { label: "Natural gas", unit: "$/Mcf", value: (row) => row.realizedPrices.naturalGas },
      { label: "NGL", unit: "$/bbl", value: (row) => row.realizedPrices.ngl },
      { label: "Oil / condensate", unit: "$/bbl", value: (row) => row.realizedPrices.oilCondensate }
    ]
  },
  costs: {
    label: "Unit costs",
    metrics: [
      { label: "Lease operating expense", unit: "$/Mcfe", value: (row) => row.costs.leaseOperatingExpense },
      { label: "Gathering, processing & transportation", unit: "$/Mcfe", value: (row) => row.costs.gatheringProcessingTransportation },
      { label: "Cash G&A", unit: "$/Mcfe", value: (row) => row.costs.cashGA },
      { label: "Total cash unit costs", unit: "$/Mcfe", value: (row) => row.costs.totalCashUnitCosts }
    ]
  },
  wells: {
    label: "Wells",
    metrics: [
      { label: "Wells drilled", unit: "count", value: (row) => row.wells.drilled },
      { label: "Wells turned in line", unit: "count", value: (row) => row.wells.turnedInLine },
      { label: "DUC inventory", unit: "count", value: (row) => row.wells.ducInventory }
    ]
  }
};

export function PeersPanel({
  companies,
  primaryTicker,
  onOpenSource
}: {
  companies: CompanyRegistryEntry[];
  primaryTicker: Ticker;
  onOpenSource: (content: string) => void;
}) {
  const [quarter, setQuarter] = useState<Quarter>("Q1 2026");
  const [group, setGroup] = useState<MetricGroup>("financial");
  const [sortMetric, setSortMetric] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [changeMode, setChangeMode] = useState<ChangeMode>("qoq");
  const [analysisMetric, setAnalysisMetric] = useState("Revenue");

  const selectedGroup = metricGroups[group];
  const selectedAnalysisMetric = selectedGroup.metrics.find((metric) => metric.label === analysisMetric) ?? selectedGroup.metrics[0];
  const rows = useMemo(
    () => new Map(companies.map((company) => [company.ticker, getQuarterlyFinancials(company.ticker, quarter)])),
    [companies, quarter]
  );

  const priorQuarter = useMemo(() => {
    const index = quarters.indexOf(quarter);
    const offset = changeMode === "qoq" ? 1 : 4;
    return index >= offset ? quarters[index - offset] : null;
  }, [changeMode, quarter]);

  const changes = useMemo((): ChangeResult[] => {
    if (!priorQuarter) return [];
    return companies.flatMap((company) => {
      const current = selectedAnalysisMetric.value(getQuarterlyFinancials(company.ticker, quarter)).value;
      const prior = selectedAnalysisMetric.value(getQuarterlyFinancials(company.ticker, priorQuarter)).value;
      if (current === null || prior === null || (selectedAnalysisMetric.unit !== "%" && prior === 0)) return [];
      const change = selectedAnalysisMetric.unit === "%" ? (current - prior) * 100 : ((current - prior) / Math.abs(prior)) * 100;
      return [{ ticker: company.ticker, current, prior, change }];
    });
  }, [companies, priorQuarter, quarter, selectedAnalysisMetric]);

  const changeSummary = useMemo(() => {
    const sorted = [...changes].sort((left, right) => right.change - left.change);
    return {
      largestIncrease: sorted[0] ?? null,
      largestDecrease: sorted[sorted.length - 1] ?? null,
      primary: changes.find((item) => item.ticker === primaryTicker) ?? null
    };
  }, [changes, primaryTicker]);

  const trendQuarters = useMemo(() => {
    const endIndex = quarters.indexOf(quarter);
    return quarters.slice(Math.max(0, endIndex - 4), endIndex + 1);
  }, [quarter]);

  const quartilesByQuarter = useMemo(() => {
    return new Map(
      trendQuarters.map((trendQuarter) => {
        const ranked = companies
          .map((company) => ({
            ticker: company.ticker,
            value: selectedAnalysisMetric.value(getQuarterlyFinancials(company.ticker, trendQuarter)).value
          }))
          .filter((item): item is { ticker: Ticker; value: number } => item.value !== null)
          .sort((left, right) => right.value - left.value);

        const quartiles = new Map<Ticker, Quartile>();
        ranked.forEach((item, index) => {
          const quartile = Math.min(4, Math.floor((index * 4) / ranked.length) + 1) as Quartile;
          quartiles.set(item.ticker, quartile);
        });
        return [trendQuarter, quartiles] as const;
      })
    );
  }, [companies, selectedAnalysisMetric, trendQuarters]);

  const orderedCompanies = useMemo(() => {
    const base = [...companies];
    const metric = selectedGroup.metrics.find((item) => item.label === sortMetric);

    if (!metric) {
      return [
        ...base.filter((company) => company.ticker === primaryTicker),
        ...base.filter((company) => company.ticker !== primaryTicker)
      ];
    }

    return base.sort((left, right) => {
      const leftValue = metric.value(rows.get(left.ticker)!).value;
      const rightValue = metric.value(rows.get(right.ticker)!).value;
      if (leftValue === null && rightValue === null) return left.ticker.localeCompare(right.ticker);
      if (leftValue === null) return 1;
      if (rightValue === null) return -1;
      return sortDirection === "desc" ? rightValue - leftValue : leftValue - rightValue;
    });
  }, [companies, primaryTicker, rows, selectedGroup.metrics, sortDirection, sortMetric]);

  function toggleSort(metric: MetricDefinition) {
    setAnalysisMetric(metric.label);
    if (sortMetric === metric.label) {
      setSortDirection((current) => current === "desc" ? "asc" : "desc");
      return;
    }
    setSortMetric(metric.label);
    setSortDirection("desc");
  }

  function changeGroup(nextGroup: MetricGroup) {
    setGroup(nextGroup);
    setSortMetric(null);
    setSortDirection("desc");
    setAnalysisMetric(metricGroups[nextGroup].metrics[0].label);
  }

  return (
    <section className="peers-panel" aria-labelledby="peers-title">
      <div className="peers-head">
        <div>
          <h1 id="peers-title">Quarterly peer comparison</h1>
          <p>Click a metric to rank peers and update period-change and multi-quarter positioning analysis.</p>
        </div>
        <label className="quarter-control">
          <span>Quarter</span>
          <select value={quarter} onChange={(event) => setQuarter(event.target.value as Quarter)}>
            {[...quarters].reverse().map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
      </div>

      <div className="peer-group-tabs" role="tablist" aria-label="Peer metric groups">
        {(Object.keys(metricGroups) as MetricGroup[]).map((key) => (
          <button key={key} type="button" role="tab" aria-selected={group === key} className={group === key ? "active" : ""} onClick={() => changeGroup(key)}>
            {metricGroups[key].label}
          </button>
        ))}
      </div>

      <section className="change-analysis" aria-labelledby="change-analysis-title">
        <div className="change-analysis-head">
          <div>
            <span className="eyebrow">Period change</span>
            <h2 id="change-analysis-title">{selectedAnalysisMetric.label}</h2>
            <p>{priorQuarter ? `${quarter} compared with ${priorQuarter}` : `No ${changeMode.toUpperCase()} comparison period is available for ${quarter}.`}</p>
          </div>
          <div className="change-mode-toggle" aria-label="Change period">
            <button type="button" className={changeMode === "qoq" ? "active" : ""} onClick={() => setChangeMode("qoq")}>QoQ</button>
            <button type="button" className={changeMode === "yoy" ? "active" : ""} onClick={() => setChangeMode("yoy")}>YoY</button>
          </div>
        </div>
        <div className="change-card-grid">
          <ChangeCard label="Largest increase" result={changeSummary.largestIncrease} unit={selectedAnalysisMetric.unit} />
          <ChangeCard label="Largest decrease" result={changeSummary.largestDecrease} unit={selectedAnalysisMetric.unit} />
          <ChangeCard label={`${primaryTicker} change`} result={changeSummary.primary} unit={selectedAnalysisMetric.unit} primary />
        </div>
        <p className="change-methodology">Changes use reported quarterly values only. Percentage-mix metrics are shown in percentage points; all other metrics use percentage change. Missing values and zero denominators are excluded.</p>
      </section>

      <section className="trend-positioning" aria-labelledby="trend-positioning-title">
        <div className="trend-positioning-head">
          <div>
            <span className="eyebrow">Multi-quarter positioning</span>
            <h2 id="trend-positioning-title">{selectedAnalysisMetric.label}</h2>
            <p>Five-quarter window ending {quarter}. Quartiles rank reported numeric values from highest (Q1) to lowest (Q4).</p>
          </div>
          <div className="quartile-key" aria-label="Quartile key">
            <span className="quartile q1">Q1</span>
            <span className="quartile q2">Q2</span>
            <span className="quartile q3">Q3</span>
            <span className="quartile q4">Q4</span>
          </div>
        </div>
        <div className="trend-table-wrap">
          <table className="trend-table">
            <thead>
              <tr>
                <th scope="col">Company</th>
                {trendQuarters.map((trendQuarter) => <th key={trendQuarter} scope="col">{trendQuarter}</th>)}
              </tr>
            </thead>
            <tbody>
              {orderedCompanies.map((company) => (
                <tr key={company.ticker} className={company.ticker === primaryTicker ? "primary-row" : ""}>
                  <th scope="row">
                    <strong>{company.ticker}</strong>
                    <span>{company.shortName}</span>
                  </th>
                  {trendQuarters.map((trendQuarter) => {
                    const sourced = selectedAnalysisMetric.value(getQuarterlyFinancials(company.ticker, trendQuarter));
                    const quartile = quartilesByQuarter.get(trendQuarter)?.get(company.ticker);
                    return (
                      <td key={trendQuarter}>
                        <strong>{formatValue(sourced.value, selectedAnalysisMetric.unit)}</strong>
                        {quartile ? <span className={`quartile q${quartile}`}>Q{quartile}</span> : <span className="quartile unavailable">--</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="trend-methodology">Quartiles indicate relative numeric position only. They are not directional investment judgments: for example, a high quartile in production differs economically from a high quartile in debt or unit costs.</p>
      </section>

      {sortMetric ? (
        <div className="peer-sort-status" role="status">
          Ranked by <strong>{sortMetric}</strong> · {sortDirection === "desc" ? "highest to lowest" : "lowest to highest"}
          <button type="button" onClick={() => setSortMetric(null)}>Reset order</button>
        </div>
      ) : null}

      <div className="peer-table-wrap">
        <table className="peer-table">
          <thead>
            <tr>
              <th scope="col">Metric</th>
              {orderedCompanies.map((company) => (
                <th key={company.ticker} scope="col" className={company.ticker === primaryTicker ? "primary-company" : ""}>
                  <strong>{company.ticker}</strong>
                  <span>{company.shortName}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {selectedGroup.metrics.map((metric) => (
              <tr key={metric.label}>
                <th scope="row">
                  <button type="button" className={sortMetric === metric.label ? "metric-sort active" : "metric-sort"} onClick={() => toggleSort(metric)} aria-label={`Sort peers by ${metric.label}`}>
                    <strong>{metric.label}</strong>
                    <span>{metric.unit} {sortMetric === metric.label ? (sortDirection === "desc" ? "↓" : "↑") : "↕"}</span>
                  </button>
                </th>
                {orderedCompanies.map((company) => {
                  const sourced = metric.value(rows.get(company.ticker)!);
                  const formatted = formatValue(sourced.value, metric.unit);
                  const sourceDescription = buildSourceDescription({ ticker: company.ticker, quarter, metric: metric.label, unit: metric.unit, formatted, value: sourced });
                  return (
                    <td key={company.ticker} className={company.ticker === primaryTicker ? "primary-company" : ""}>
                      {sourced.value === null ? (
                        <span className="missing-value" title={buildSourceTitle(sourced)}>--</span>
                      ) : (
                        <button type="button" className="source-cell" title={buildSourceTitle(sourced)} onClick={() => onOpenSource(sourceDescription)}>
                          <strong>{formatted}</strong>
                          <small>{sourced.basis}</small>
                        </button>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="peer-disclosures">
        <p><strong>Capital expenditures:</strong> definitions are not fully uniform across peers. RRC and AR use accrual-adjusted total capital spending; other companies use reported CapEx.</p>
        <p><strong>Wells:</strong> gross/net and operated/total bases are not consistently disclosed. Treat well-count comparisons as directional until the basis is confirmed.</p>
        <p><strong>Ranking:</strong> missing values are always placed last and are never converted to zero.</p>
      </div>
    </section>
  );
}

function ChangeCard({ label, result, unit, primary = false }: { label: string; result: ChangeResult | null; unit: string; primary?: boolean }) {
  return (
    <article className={primary ? "change-card primary" : "change-card"}>
      <span>{label}</span>
      {result ? (
        <>
          <strong>{result.ticker}</strong>
          <em className={result.change >= 0 ? "positive" : "negative"}>{formatChange(result.change, unit)}</em>
          <small>{formatValue(result.prior, unit)} → {formatValue(result.current, unit)}</small>
        </>
      ) : (
        <><strong>--</strong><em>Unavailable</em><small>Insufficient reported data</small></>
      )}
    </article>
  );
}

function formatChange(change: number, unit: string): string {
  const sign = change > 0 ? "+" : "";
  return unit === "%" ? `${sign}${change.toFixed(1)} pts` : `${sign}${change.toFixed(1)}%`;
}

function formatValue(value: number | null, unit: string): string {
  if (value === null) return "--";
  if (unit === "%") return `${(value * 100).toFixed(1)}%`;
  if (unit === "count") return value.toLocaleString("en-US", { maximumFractionDigits: 1 });
  if (unit.startsWith("$")) return value.toLocaleString("en-US", { minimumFractionDigits: unit === "$MM" ? 0 : 2, maximumFractionDigits: unit === "$MM" ? 0 : 2 });
  return value.toLocaleString("en-US", { maximumFractionDigits: 1 });
}

function buildSourceTitle(value: SourcedValue): string {
  const parts = [`Source: ${value.source}`, `Basis: ${value.basis}`];
  if (value.note) parts.push(value.note);
  return parts.join(" · ");
}

function buildSourceDescription({ ticker, quarter, metric, unit, formatted, value }: { ticker: Ticker; quarter: Quarter; metric: string; unit: string; formatted: string; value: SourcedValue }): string {
  return [
    `${ticker} · ${quarter}`,
    `${metric}: ${formatted} ${unit}`,
    `Source tag: ${value.source}`,
    `Basis: ${value.basis}`,
    value.note ? `Methodology note: ${value.note}` : "Methodology note: none recorded"
  ].join("\n\n");
}
