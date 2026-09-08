import type { Ticker } from "@/lib/dashboard/types";
import {
  getQuarterlyFinancials,
  quarters,
  type Quarter,
  type SourcedValue
} from "@/lib/dashboard/financials-quarterly";
import { getQuarterlyFreeCashFlow } from "@/lib/dashboard/free-cash-flow-quarterly";
import { getQuarterlyMarketCap } from "@/lib/dashboard/market-cap-quarterly";

export function getLtmAdjustedEbitdax(ticker: Ticker, quarter: Quarter): SourcedValue {
  const index = quarters.indexOf(quarter);
  if (index < 3) {
    return unavailable("Four reported quarters are required to calculate LTM Adjusted EBITDAX.");
  }

  const period = quarters.slice(index - 3, index + 1);
  const values = period.map((item) => getQuarterlyFinancials(ticker, item).adjustedEbitdax.value);
  if (values.some((value) => value === null)) {
    return unavailable("LTM Adjusted EBITDAX is unavailable because at least one underlying quarter is blank.");
  }

  return {
    value: (values as number[]).reduce((sum, value) => sum + value, 0),
    source: "codex",
    basis: "derived",
    note: `Calculated as the sum of reported Adjusted EBITDAX for ${period.join(", ")}.`
  };
}

export function getLtmNetIncome(ticker: Ticker, quarter: Quarter): SourcedValue {
  const index = quarters.indexOf(quarter);
  if (index < 3) {
    return unavailable("Four reported quarters are required to calculate LTM net income.");
  }

  const period = quarters.slice(index - 3, index + 1);
  const values = period.map((item) => getQuarterlyFinancials(ticker, item).netIncome?.value ?? null);
  if (values.some((value) => value === null)) {
    return unavailable("LTM net income is unavailable because at least one underlying quarter is blank.");
  }

  return {
    value: (values as number[]).reduce((sum, value) => sum + value, 0),
    source: "factset",
    basis: "derived",
    note: `Calculated as the sum of reported net income for ${period.join(", ")}.`
  };
}

export function getNetDebtToLtmAdjustedEbitdax(ticker: Ticker, quarter: Quarter): SourcedValue {
  const netDebt = getQuarterlyFinancials(ticker, quarter).netDebt;
  const ltmEbitdax = getLtmAdjustedEbitdax(ticker, quarter);

  if (netDebt.value === null) {
    return unavailable("Leverage is unavailable because quarter-end net debt is blank.");
  }
  if (ltmEbitdax.value === null || ltmEbitdax.value === 0) {
    return unavailable("Leverage is unavailable because LTM Adjusted EBITDAX is blank or zero.");
  }

  return {
    value: netDebt.value / ltmEbitdax.value,
    source: "codex",
    basis: "derived",
    note: "Calculated as quarter-end net debt divided by LTM Adjusted EBITDAX. Calculated metric; not company reported."
  };
}

const QUARTER_RE = /^Q([1-4]) (\d{4})$/;

/**
 * Exact calendar days in a "Q# YYYY" period, via the same Date.UTC fiscal-quarter
 * arithmetic already used for guidance Bcfe/day conversions (see
 * daysInGuidancePeriod in lib/dashboard/chart-guidance.ts). Duplicated here rather
 * than imported so this module has no dependency on the chart-guidance module.
 */
export function daysInQuarter(quarter: Quarter): number | null {
  const match = QUARTER_RE.exec(quarter);
  if (!match) return null;
  const quarterNumber = Number(match[1]);
  const year = Number(match[2]);
  const startMonth = (quarterNumber - 1) * 3;
  return (Date.UTC(year, startMonth + 3, 1) - Date.UTC(year, startMonth, 1)) / 86_400_000;
}

/**
 * Total company capital expenditures ($MM, standalone quarter) divided by total
 * quarterly production converted from MMcfe/d to Mcfe: MMcfe/d x calendar days x
 * 1,000 = Mcfe for the quarter. capitalExpenditures is the dashboard's existing
 * "total company capital expenditures" field (not a D&C-only or maintenance-only
 * line) -- see the capitalExpenditures cross-company caveat in
 * lib/dashboard/financials-quarterly.ts: definitions still vary by company
 * (accrual-adjusted vs as-reported), which the note on this SourcedValue repeats.
 */
export function getCapexPerMcfe(ticker: Ticker, quarter: Quarter): SourcedValue {
  const financials = getQuarterlyFinancials(ticker, quarter);
  const capex = financials.capitalExpenditures.value;
  const production = financials.production.total.value;
  const days = daysInQuarter(quarter);

  if (capex === null) return unavailable("CapEx / Mcfe is unavailable because total company capital expenditures is blank.");
  if (production === null || production <= 0) return unavailable("CapEx / Mcfe is unavailable because total quarterly production is blank or zero.");
  if (days === null) return unavailable(`CapEx / Mcfe is unavailable because ${quarter} could not be resolved to a calendar period.`);

  const quarterlyMcfe = production * days * 1000;
  return {
    value: (capex * 1_000_000) / quarterlyMcfe,
    source: "codex",
    basis: "derived",
    note: `Calculated as total company capital expenditures ($MM, ${financials.capitalExpenditures.basis} basis) / (total production ${production} MMcfe/d x ${days} calendar days in ${quarter} x 1,000 = ${quarterlyMcfe.toLocaleString("en-US")} Mcfe). Capital expenditures definitions are not fully uniform across peers -- see the capitalExpenditures header caveat in financials-quarterly.ts.`
  };
}

type PricedComponent = { key: "naturalGas" | "ngl" | "oilCondensate"; volume: number | null; price: number | null; volumeUnit: "Mcf" | "bbl" };

/**
 * Blended realized price per Mcfe: (gas $/Mcf x gas Mcf) + (NGL $/bbl x NGL bbl x
 * ) + (oil/condensate $/bbl x oil bbl), all converted from the dashboard's daily
 * MMcf/d / Mbbl/d rates to quarterly totals via the same days-in-quarter factor
 * as getCapexPerMcfe, divided by total quarterly Mcfe production. Every
 * realizedPrices.* field in financials-quarterly.ts is documented pre-hedge /
 * unhedged for every peer, so this blended figure is pre-hedge too -- consistent
 * with (not a redefinition of) the existing per-commodity prices, not GAAP total
 * revenue (which also includes hedging and other income). If a component has
 * nonzero reported production but no reported price (or production itself is
 * unresolved), the metric is left unavailable rather than guessing a price.
 */
export function getRealizedPricePerMcfe(ticker: Ticker, quarter: Quarter): SourcedValue {
  const financials = getQuarterlyFinancials(ticker, quarter);
  const days = daysInQuarter(quarter);
  if (days === null) return unavailable(`Realized Price / Mcfe is unavailable because ${quarter} could not be resolved to a calendar period.`);

  const totalProduction = financials.production.total.value;
  if (totalProduction === null || totalProduction <= 0) {
    return unavailable("Realized Price / Mcfe is unavailable because total quarterly production is blank or zero.");
  }

  const components: PricedComponent[] = [
    { key: "naturalGas", volume: financials.production.naturalGas.value, price: financials.realizedPrices.naturalGas.value, volumeUnit: "Mcf" },
    { key: "ngl", volume: financials.production.ngl.value, price: financials.realizedPrices.ngl.value, volumeUnit: "bbl" },
    { key: "oilCondensate", volume: financials.production.oilCondensate.value, price: financials.realizedPrices.oilCondensate.value, volumeUnit: "bbl" }
  ];

  let totalRevenue = 0;
  for (const component of components) {
    if (component.volume === null) {
      return unavailable(`Realized Price / Mcfe is unavailable because ${ticker} ${quarter} ${component.key} production is blank.`);
    }
    if (component.volume === 0) continue;
    if (component.price === null) {
      return unavailable(`Realized Price / Mcfe is unavailable because ${ticker} ${quarter} ${component.key} realized price is blank while reported production is nonzero.`);
    }
    // MMcf/d or Mbbl/d x days = MMcf or Mbbl for the quarter; x 1,000 converts to native Mcf/bbl units to price against.
    const quarterlyVolumeNative = component.volume * days * 1000;
    totalRevenue += quarterlyVolumeNative * component.price;
  }

  const quarterlyMcfe = totalProduction * days * 1000;
  return {
    value: totalRevenue / quarterlyMcfe,
    source: "codex",
    basis: "derived",
    note: `Calculated as pre-hedge realized commodity revenue (gas $/Mcf x Mcf + NGL $/bbl x bbl + oil/condensate $/bbl x bbl, each volume derived from the reported MMcf/d or Mbbl/d rate x ${days} calendar days in ${quarter}) / total quarterly Mcfe production. Pre-hedge, consistent with the underlying realizedPrices fields; not GAAP total revenue (excludes hedging gains/losses and other income).`
  };
}

function unavailable(note: string): SourcedValue {
  return { value: null, source: "codex", basis: "derived", note };
}

/**
 * Added for the IR-report Valuation & Share-Price Context section (2026-09-08).
 * Deliberately built ONLY from data this dashboard already validates quarter-
 * end (market cap, net debt, Adjusted EBITDAX, free cash flow) rather than a
 * live share-price feed: the existing Overview "Share price" card already
 * shows live Finnhub/FMP quotes are not reliably available server-side (both
 * are client-only React hooks today, with no existing server-callable
 * function), and this project's own rule is to omit rather than build a new,
 * unreliable dependency. Market-cap-based valuation is the more stable
 * existing alternative -- same convention getNetDebtToLtmAdjustedEbitdax
 * above already established for leverage.
 */

/** Sum of the last 4 reported quarters' free cash flow -- same LTM windowing convention as getLtmAdjustedEbitdax/getLtmNetIncome above, not a mix of quarterly and annualized figures. */
export function getLtmFreeCashFlow(ticker: Ticker, quarter: Quarter): SourcedValue {
  const index = quarters.indexOf(quarter);
  if (index < 3) {
    return unavailable("Four reported quarters are required to calculate LTM free cash flow.");
  }

  const period = quarters.slice(index - 3, index + 1);
  const values = period.map((item) => getQuarterlyFreeCashFlow(ticker, item)?.value ?? null);
  if (values.some((value) => value === null)) {
    return unavailable("LTM free cash flow is unavailable because at least one underlying quarter is blank.");
  }

  return {
    value: (values as number[]).reduce((sum, value) => sum + value, 0),
    source: "codex",
    basis: "derived",
    note: `Calculated as the sum of reported free cash flow for ${period.join(", ")}.`
  };
}

/** Enterprise value = quarter-end market capitalization + quarter-end net debt. Both are point-in-time balance-sheet/market figures for the same quarter-end date, not mixed periods. */
export function getEnterpriseValue(ticker: Ticker, quarter: Quarter): SourcedValue {
  const marketCap = getQuarterlyMarketCap(ticker, quarter);
  const netDebt = getQuarterlyFinancials(ticker, quarter).netDebt;

  if (!marketCap || marketCap.value === null) {
    return unavailable("Enterprise value is unavailable because quarter-end market capitalization is blank.");
  }
  if (netDebt.value === null) {
    return unavailable("Enterprise value is unavailable because quarter-end net debt is blank.");
  }

  return {
    value: marketCap.value + netDebt.value,
    source: "codex",
    basis: "derived",
    note: `Calculated as quarter-end market capitalization (source: ${marketCap.source}) + quarter-end net debt (source: ${netDebt.source}), both as of the ${quarter} quarter-end.`
  };
}

/** EV / LTM Adjusted EBITDAX -- a calculated multiple, never a company-reported or consensus figure. */
export function getEvToLtmAdjustedEbitdax(ticker: Ticker, quarter: Quarter): SourcedValue {
  const ev = getEnterpriseValue(ticker, quarter);
  const ltmEbitdax = getLtmAdjustedEbitdax(ticker, quarter);

  if (ev.value === null) return unavailable("EV / LTM Adjusted EBITDAX is unavailable because enterprise value is blank.");
  if (ltmEbitdax.value === null || ltmEbitdax.value === 0) {
    return unavailable("EV / LTM Adjusted EBITDAX is unavailable because LTM Adjusted EBITDAX is blank or zero.");
  }

  return {
    value: ev.value / ltmEbitdax.value,
    source: "codex",
    basis: "derived",
    note: "Calculated as enterprise value (quarter-end market cap + net debt) divided by LTM Adjusted EBITDAX. Calculated metric; not company reported or consensus."
  };
}

/** LTM free cash flow / quarter-end market capitalization -- an LTM yield, never a quarterly figure silently annualized. */
export function getLtmFcfYield(ticker: Ticker, quarter: Quarter): SourcedValue {
  const ltmFcf = getLtmFreeCashFlow(ticker, quarter);
  const marketCap = getQuarterlyMarketCap(ticker, quarter);

  if (ltmFcf.value === null) return unavailable("LTM FCF yield is unavailable because LTM free cash flow is blank.");
  if (!marketCap || marketCap.value === null || marketCap.value === 0) {
    return unavailable("LTM FCF yield is unavailable because quarter-end market capitalization is blank or zero.");
  }

  return {
    value: ltmFcf.value / marketCap.value,
    source: "codex",
    basis: "derived",
    note: `Calculated as LTM free cash flow divided by quarter-end market capitalization (source: ${marketCap.source}), as of the ${quarter} quarter-end. Expressed as a fraction (multiply by 100 for a percentage).`
  };
}
