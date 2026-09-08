import { getQuarterlyFinancials, quarters, type Quarter } from "@/lib/dashboard/financials-quarterly";
import { getQuarterlyFreeCashFlow } from "@/lib/dashboard/free-cash-flow-quarterly";
import { getNetDebtToLtmAdjustedEbitdax } from "@/lib/dashboard/calculated-quarterly";
import { getQuarterlyMarketCap } from "@/lib/dashboard/market-cap-quarterly";
import type { Ticker } from "@/lib/dashboard/company-registry";
import { compareQuarterly } from "@/lib/reports/comparisons";
import { describeFinancialSource, describeMarketDataSource } from "@/lib/reports/adapters/source-labels";
import { moneyDisplay } from "@/lib/reports/adapters/format";
import type { SourceManifestEntry, WeeklyEvidenceItem } from "@/lib/reports/weekly-report-types";

/**
 * Comparative peer-company positioning (category "peers"), distinct from
 * "range_company" (Range's own results). Deliberately a compact "headline"
 * metric set -- production, revenue, EBITDAX, FCF, net debt / LTM EBITDAX,
 * market cap -- reusing the exact set lib/dashboard/overview-metrics.ts's
 * getOverviewSummaryCards() already treats as this dashboard's own
 * established "headline" convention, rather than inventing a new selection
 * or dumping the full ~14-row Peer Comparison Matrix into every weekly
 * snapshot. Same static quarterly fixture as range-company-adapter.ts (see
 * that file's header for the update-cadence/comparison-semantics reasoning
 * -- QoQ/YoY only, never WoW/MoM).
 */

const PEER_TICKERS: Ticker[] = ["AR", "CNX", "CRK", "EQT", "EXE", "GPOR"];
const LATEST_QUARTER: Quarter = quarters[quarters.length - 1];

function productionDisplay(value: number | null): string {
  return value === null ? "--" : `${value.toLocaleString("en-US", { maximumFractionDigits: 0 })} MMcfe/d`;
}
function multipleDisplay(value: number | null): string {
  return value === null ? "--" : `${value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}x`;
}

type PeerMetricSpec = {
  metricKey: string;
  labelSuffix: string;
  unit: string;
  getValue: (ticker: Ticker, quarter: Quarter) => { value: number | null; source: string; basis?: string } | undefined;
  displayValue: (value: number | null) => string;
  /** market_cap's SourceTag domain is disjoint from every other metric's (market data, not a filing) -- kept distinct so it is never described as filing-sourced. */
  describeSource: (rawSource: string) => string;
};

const METRICS: PeerMetricSpec[] = [
  { metricKey: "production", labelSuffix: "Production", unit: "MMcfe/d", getValue: (t, q) => getQuarterlyFinancials(t, q).production.total, displayValue: productionDisplay, describeSource: (s) => describeFinancialSource(s as Parameters<typeof describeFinancialSource>[0]) },
  { metricKey: "revenue", labelSuffix: "Revenue", unit: "$MM", getValue: (t, q) => getQuarterlyFinancials(t, q).revenue, displayValue: moneyDisplay, describeSource: (s) => describeFinancialSource(s as Parameters<typeof describeFinancialSource>[0]) },
  { metricKey: "ebitdax", labelSuffix: "Adjusted EBITDAX", unit: "$MM", getValue: (t, q) => getQuarterlyFinancials(t, q).adjustedEbitdax, displayValue: moneyDisplay, describeSource: (s) => describeFinancialSource(s as Parameters<typeof describeFinancialSource>[0]) },
  { metricKey: "fcf", labelSuffix: "Free Cash Flow", unit: "$MM", getValue: (t, q) => getQuarterlyFreeCashFlow(t, q), displayValue: moneyDisplay, describeSource: (s) => describeFinancialSource(s as Parameters<typeof describeFinancialSource>[0]) },
  { metricKey: "net_debt_to_ebitdax", labelSuffix: "Net Debt / LTM EBITDAX", unit: "x", getValue: (t, q) => getNetDebtToLtmAdjustedEbitdax(t, q), displayValue: multipleDisplay, describeSource: (s) => describeFinancialSource(s as Parameters<typeof describeFinancialSource>[0]) },
  { metricKey: "market_cap", labelSuffix: "Market Cap", unit: "$MM", getValue: (t, q) => getQuarterlyMarketCap(t, q), displayValue: moneyDisplay, describeSource: (s) => describeMarketDataSource(s as Parameters<typeof describeMarketDataSource>[0]) }
];

export type PeersCollection = {
  items: WeeklyEvidenceItem[];
  manifestEntries: SourceManifestEntry[];
  present: boolean;
};

export function collectPeersEvidence(): PeersCollection {
  const items: WeeklyEvidenceItem[] = [];

  for (const ticker of PEER_TICKERS) {
    for (const spec of METRICS) {
      const sourced = spec.getValue(ticker, LATEST_QUARTER);
      const value = sourced?.value ?? null;
      items.push({
        evidenceId: `peers:${ticker}:${spec.metricKey}`,
        category: "peers",
        metricKey: spec.metricKey,
        label: `${ticker} ${spec.labelSuffix}`,
        currentValue: value,
        displayValue: spec.displayValue(value),
        unit: spec.unit,
        period: LATEST_QUARTER,
        asOfDate: null,
        sourceIds: ["peer_financials"],
        freshness: "current",
        comparisons: value === null ? [] : compareQuarterly(spec.metricKey, `${ticker} ${spec.labelSuffix}`, LATEST_QUARTER, (q) => spec.getValue(ticker, q)),
        rangeDrivers: ["gas_pricing"],
        materialityInputs: { isNewThisWeek: false, changedSincePreviousReport: false, riskSeverityRank: null, riskState: null, rangeImpactDirection: null, rangeImpactStrength: null, comparisonMagnitudePct: null },
        metadata: { ticker, source: sourced ? `${spec.describeSource(sourced.source)}${sourced.basis ? ` (${sourced.basis})` : ""}` : null }
      });
    }
  }

  const manifestEntries: SourceManifestEntry[] = [
    { key: "peer_financials", label: "Peer quarterly financials (SEC filings, earnings materials & FactSet)", period: LATEST_QUARTER, freshness: "current", included: true }
  ];

  return { items, manifestEntries, present: items.length > 0 };
}
