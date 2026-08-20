import type { Ticker } from "@/lib/dashboard/types";
import {
  getQuarterlyFinancials,
  quarters,
  type Quarter,
  type SourcedValue
} from "@/lib/dashboard/financials-quarterly";

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
