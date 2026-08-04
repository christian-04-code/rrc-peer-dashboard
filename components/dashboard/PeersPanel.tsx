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

type MetricDefinition = {
  label: string;
  unit: string;
  value: (row: QuarterlyFinancials) => SourcedValue;
};

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

  const selectedGroup = metricGroups[group];
  const rows = useMemo(
    () => new Map(companies.map((company) => [company.ticker, getQuarterlyFinancials(company.ticker, quarter)])),
    [companies, quarter]
  );

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
  }

  return (
    <section className="peers-panel" aria-labelledby="peers-title">
      <div className="peers-head">
        <div>
          <h1 id="peers-title">Quarterly peer comparison</h1>
          <p>Click a metric to rank peers. Click a populated value to inspect its lineage and methodology.</p>
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
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={group === key}
            className={group === key ? "active" : ""}
            onClick={() => changeGroup(key)}
          >
            {metricGroups[key].label}
          </button>
        ))}
      </div>

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
                  <button
                    type="button"
                    className={sortMetric === metric.label ? "metric-sort active" : "metric-sort"}
                    onClick={() => toggleSort(metric)}
                    aria-label={`Sort peers by ${metric.label}`}
                  >
                    <strong>{metric.label}</strong>
                    <span>{metric.unit} {sortMetric === metric.label ? (sortDirection === "desc" ? "↓" : "↑") : "↕"}</span>
                  </button>
                </th>
                {orderedCompanies.map((company) => {
                  const sourced = metric.value(rows.get(company.ticker)!);
                  const formatted = formatValue(sourced.value, metric.unit);
                  const sourceDescription = buildSourceDescription({
                    ticker: company.ticker,
                    quarter,
                    metric: metric.label,
                    unit: metric.unit,
                    formatted,
                    value: sourced
                  });
                  return (
                    <td
                      key={company.ticker}
                      className={company.ticker === primaryTicker ? "primary-company" : ""}
                    >
                      {sourced.value === null ? (
                        <span className="missing-value" title={buildSourceTitle(sourced)}>--</span>
                      ) : (
                        <button
                          type="button"
                          className="source-cell"
                          title={buildSourceTitle(sourced)}
                          onClick={() => onOpenSource(sourceDescription)}
                        >
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

function buildSourceDescription({
  ticker,
  quarter,
  metric,
  unit,
  formatted,
  value
}: {
  ticker: Ticker;
  quarter: Quarter;
  metric: string;
  unit: string;
  formatted: string;
  value: SourcedValue;
}): string {
  return [
    `${ticker} · ${quarter}`,
    `${metric}: ${formatted} ${unit}`,
    `Source tag: ${value.source}`,
    `Basis: ${value.basis}`,
    value.note ? `Methodology note: ${value.note}` : "Methodology note: none recorded"
  ].join("\n\n");
}
