import { getQuarterlyFinancials, quarters, type Quarter } from "@/lib/dashboard/financials-quarterly";
import { getQuarterlyMarketCap } from "@/lib/dashboard/market-cap-quarterly";
import { getEnterpriseValue, getEvToLtmAdjustedEbitdax, getLtmFcfYield } from "@/lib/dashboard/calculated-quarterly";
import type { Ticker } from "@/lib/dashboard/company-registry";
import { compareQuarterly } from "@/lib/reports/comparisons";
import { describeFinancialSource, describeMarketDataSource } from "@/lib/reports/adapters/source-labels";
import { moneyDisplay } from "@/lib/reports/adapters/format";
import type { SourceManifestEntry, WeeklyEvidenceItem } from "@/lib/reports/weekly-report-types";

/**
 * Valuation & Share-Price Context (category "valuation"), added for the IR-
 * report enhancement (2026-09-08). Covers RRC + the same 6 tracked peers as
 * peers-adapter.ts, on the same static quarterly fixture -- QoQ/YoY
 * comparisons only, same reasoning as range-company-adapter.ts/
 * peers-adapter.ts (this fixture updates roughly once per quarter, not
 * weekly).
 *
 * Deliberately market-cap-based, not a live share-price feed: this
 * dashboard's existing live quote integrations (Finnhub/FMP) are client-only
 * React hooks with no server-callable function today, and the Overview's own
 * "Share price" card already shows that data isn't always resolvable. Rather
 * than build a new, less-reliable live dependency into report generation,
 * every metric here is derived from the same quarter-end market
 * capitalization / net debt / Adjusted EBITDAX / free cash flow values the
 * rest of the report already validates and displays -- see
 * calculated-quarterly.ts's own header note on this decision.
 */

const TICKER = "RRC" as const;
const PEER_TICKERS: Ticker[] = ["AR", "CNX", "CRK", "EQT", "EXE", "GPOR"];
const LATEST_QUARTER: Quarter = quarters[quarters.length - 1];

function multipleDisplay(value: number | null): string {
  return value === null ? "--" : `${value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}x`;
}
function pctDisplay(value: number | null): string {
  return value === null ? "--" : `${(value * 100).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

type ValuationMetricSpec = {
  metricKey: string;
  labelSuffix: string;
  unit: string;
  getValue: (ticker: Ticker, quarter: Quarter) => { value: number | null; source: string; basis?: string } | undefined;
  displayValue: (value: number | null) => string;
  describeSource: (rawSource: string) => string;
};

const METRICS: ValuationMetricSpec[] = [
  { metricKey: "market_cap", labelSuffix: "Market Cap", unit: "$MM", getValue: (t, q) => getQuarterlyMarketCap(t, q), displayValue: moneyDisplay, describeSource: (s) => describeMarketDataSource(s as Parameters<typeof describeMarketDataSource>[0]) },
  { metricKey: "enterprise_value", labelSuffix: "Enterprise Value", unit: "$MM", getValue: (t, q) => getEnterpriseValue(t, q), displayValue: moneyDisplay, describeSource: (s) => describeFinancialSource(s as Parameters<typeof describeFinancialSource>[0]) },
  { metricKey: "ev_to_ltm_ebitdax", labelSuffix: "EV / LTM Adj. EBITDAX", unit: "x", getValue: (t, q) => getEvToLtmAdjustedEbitdax(t, q), displayValue: multipleDisplay, describeSource: (s) => describeFinancialSource(s as Parameters<typeof describeFinancialSource>[0]) },
  { metricKey: "ltm_fcf_yield", labelSuffix: "LTM FCF Yield", unit: "%", getValue: (t, q) => getLtmFcfYield(t, q), displayValue: pctDisplay, describeSource: (s) => describeFinancialSource(s as Parameters<typeof describeFinancialSource>[0]) }
];

function buildItemsForTicker(ticker: Ticker, isRange: boolean): WeeklyEvidenceItem[] {
  const items: WeeklyEvidenceItem[] = [];
  for (const spec of METRICS) {
    const sourced = spec.getValue(ticker, LATEST_QUARTER);
    const value = sourced?.value ?? null;
    items.push({
      evidenceId: `valuation:${ticker}:${spec.metricKey}`,
      category: "valuation",
      metricKey: spec.metricKey,
      label: `${ticker} ${spec.labelSuffix}`,
      currentValue: value,
      displayValue: spec.displayValue(value),
      unit: spec.unit,
      period: LATEST_QUARTER,
      asOfDate: null,
      sourceIds: ["valuation_metrics"],
      freshness: "current",
      comparisons: value === null ? [] : compareQuarterly(spec.metricKey, `${ticker} ${spec.labelSuffix}`, LATEST_QUARTER, (q) => spec.getValue(ticker, q)),
      rangeDrivers: ["gas_pricing"],
      materialityInputs: { isNewThisWeek: false, changedSincePreviousReport: false, riskSeverityRank: null, riskState: null, rangeImpactDirection: null, rangeImpactStrength: null, comparisonMagnitudePct: null },
      metadata: { ticker, isRange, source: sourced ? `${spec.describeSource(sourced.source)}${sourced.basis ? ` (${sourced.basis})` : ""}` : null }
    });
  }
  return items;
}

export type ValuationCollection = {
  items: WeeklyEvidenceItem[];
  manifestEntries: SourceManifestEntry[];
  present: boolean;
};

export function collectValuationEvidence(): ValuationCollection {
  const items: WeeklyEvidenceItem[] = [...buildItemsForTicker(TICKER, true), ...PEER_TICKERS.flatMap((t) => buildItemsForTicker(t, false))];

  const manifestEntries: SourceManifestEntry[] = [
    {
      key: "valuation_metrics",
      label: "RRC & peer valuation (market cap, enterprise value, EV/EBITDAX, FCF yield -- calculated from existing quarterly financials)",
      period: LATEST_QUARTER,
      freshness: "current",
      included: true
    }
  ];

  return { items, manifestEntries, present: items.some((item) => item.currentValue !== null) };
}
