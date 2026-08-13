/**
 * Shared mechanical orchestration for the "simplified annual Forecast" pattern
 * established by rrc-annual.ts, generalized so AR/CNX/EQT can reuse the same
 * quarter-building / engine-execution / aggregation / balance-sheet / valuation
 * machinery instead of re-implementing it three times.
 *
 * This module contains NO company-specific numbers and makes NO decisions about
 * what a company's default production, pricing, or cost assumption should be --
 * that decision (guidance vs. reported-actual-held-flat vs. modeled) stays in each
 * company's own scenarios/<ticker>-annual.ts file, mirroring rrc-annual.ts's
 * resolveAnnualProductionDefault / resolveAnnualCostDefaults / etc. pattern. This
 * file only does the arithmetic every company needs identically: turning a set of
 * already-resolved annual assumptions into quarterly ForecastPeriodAssumptions,
 * running the existing deterministic engine (lib/forecast/engine.ts) unchanged,
 * summing 4 quarters into an annual table, rolling forward net debt via
 * lib/forecast/balance-sheet.ts, and computing the EV/EBITDAX + DCF valuation via
 * lib/forecast/valuation.ts -- unchanged from the RRC reference model's own
 * conventions (10% DCF discount rate, 0% terminal growth, $0 valuation net-debt
 * floor with the true forecast ending net debt always reported separately).
 *
 * Unlike rrc-annual.ts, there is no immutable-actual-quarter / H2-reconciliation
 * split here: every requested year (including the first, e.g. 2026) is modeled as
 * 4 uniform quarters at that year's resolved annual rate. This is a deliberate
 * simplification for peers whose FY guidance (reaffirmed or raised well after H1
 * actuals were reported) already reflects the real first-half results -- using the
 * guided full-year figure directly avoids reconstructing a quarter-by-quarter
 * actual/estimate blend from data this integration does not have at that
 * granularity, and avoids mixing a standalone-quarter actual with a YTD or annual
 * guidance figure on an inconsistent basis.
 */

import { runForecastPeriod } from "@/lib/forecast/engine";
import { rollForwardBalanceSheet } from "@/lib/forecast/balance-sheet";
import { calculateMultipleValuation, calculateDcf, type DcfResult, type MultipleValuationResult } from "@/lib/forecast/valuation";
import { findGuidance, type GuidanceEntry, type GuidanceMetricKey } from "@/lib/forecast/guidance/types";
import type { RrcCurrentMarketPrices } from "@/lib/forecast/scenarios/rrc-complete";
import type { AssumptionClassification, ForecastPeriodAssumptions, ForecastPeriodResult, SourcedValue } from "@/lib/forecast/types";

export type ResolvedAnnualValue = {
  value: number | null;
  classification: AssumptionClassification;
  sourceName: string;
  sourceReference: string;
  sourceDate: string;
  notes: string;
};

export function guidanceToResolved(guidance: GuidanceEntry): ResolvedAnnualValue {
  return {
    value: guidance.midpoint,
    classification: "guided",
    sourceName: guidance.sourceName,
    sourceReference: guidance.sourceReference,
    sourceDate: guidance.sourceDate,
    notes: guidance.notes ?? ""
  };
}

/**
 * Priority 1: exact-year guidance for `year`. Priority 2: the nearest EARLIER year
 * in `forecastYears` that management did guide this metric for, held flat forward
 * ("current-cycle guided carried forward" -- the same policy the RRC reference
 * model uses when no exact-year replacement guidance exists). Returns null when
 * neither exists so the caller's own reported-actual-held-flat fallback applies --
 * this function never fabricates a value.
 */
export function resolveGuidedOrCarriedForward(
  guidance: GuidanceEntry[],
  metric: GuidanceMetricKey,
  year: string,
  forecastYears: readonly string[]
): ResolvedAnnualValue | null {
  const exact = findGuidance(guidance, metric, year as GuidanceEntry["year"]);
  if (exact && exact.midpoint !== null) return guidanceToResolved(exact);
  for (const candidateYear of forecastYears) {
    if (candidateYear === year) break;
    const carried = findGuidance(guidance, metric, candidateYear as GuidanceEntry["year"]);
    if (carried && carried.midpoint !== null) {
      const resolved = guidanceToResolved(carried);
      return {
        ...resolved,
        notes: `${resolved.notes} No ${metric} guidance for ${year}; the ${candidateYear} cycle figure is carried forward flat as the current-cycle assumption.`.trim()
      };
    }
  }
  return null;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** [Q1, Q2, Q3, Q4] calendar day counts for a given year. */
export function quarterDays(year: number): [number, number, number, number] {
  const feb = isLeapYear(year) ? 29 : 28;
  return [31 + feb + 31, 30 + 31 + 30, 31 + 31 + 30, 31 + 30 + 31];
}

/**
 * Generic modeled cash-tax-rate ramp (2% / 6% / 8% by position in the forecast
 * window), used ONLY as the last-resort fallback when a company has no current
 * cash-tax-rate guidance -- the same convention the RRC reference model applies,
 * reflecting the sector-wide pattern of E&P NOL/IDC tax shelters being used up
 * over a multi-year horizon. This is a disclosed modeling convention, not a
 * company-specific figure.
 */
export function modeledCashTaxRateByPosition(index: number): number {
  return index === 0 ? 0.02 : index === 1 ? 0.06 : 0.08;
}

export const DCF_DISCOUNT_RATE = 0.1;
export const DCF_TERMINAL_GROWTH_RATE = 0;

function sv(value: number | null, unit: string, classification: AssumptionClassification = "modeled"): SourcedValue {
  return { value, unit, source: { name: "", period: "", retrievedAt: "", classification } };
}

export type YearAssumptions = {
  year: string;
  gasMmcfPerDay: number | null;
  nglMbblPerDay: number | null;
  oilMbblPerDay: number | null;
  henryHubPerMmbtu: SourcedValue;
  wtiPerBbl: SourcedValue;
  gasBasisPerMcf: number | null;
  oilDifferentialPerBbl: number | null;
  /** WTI-relative NGL realization (0 when using an absolute guided price instead). */
  nglRealizationPctOfWti: number | null;
  /** Absolute $/bbl add-on; carries the ENTIRE guided NGL price when nglRealizationPctOfWti is 0. */
  nglMarketingUpliftPerBbl: number | null;
  loePerMcfe: number | null;
  gatheringTransportPerMcfe: number | null;
  productionTaxPctRevenue: number | null;
  cashGaPerMcfe: number | null;
  /** Quarterly (not annual) run-rate -- caller divides an annual guided figure by 4 before this point. */
  explorationMillionPerQuarter: number | null;
  /** Quarterly (not annual) run-rate. */
  cashInterestMillionPerQuarter: number | null;
  cashTaxRate: number | null;
  /** Quarterly (not annual) run-rate -- caller divides an annual guided total by 4 before this point. */
  capexMillionPerQuarter: number | null;
};

export type AnnualPeriodSummary = {
  year: string;
  production: { gasMmcf: number | null; nglMbbl: number | null; oilMbbl: number | null; totalMcfe: number | null };
  revenueMillion: number | null;
  ebitdaxMillion: number | null;
  capexMillion: number | null;
  freeCashFlowMillion: number | null;
  fcfYield: number | null;
  endingNetDebtMillion: number | null;
};

function totalMcfe(gasMmcf: number | null, nglMbbl: number | null, oilMbbl: number | null): number | null {
  if (gasMmcf === null || nglMbbl === null || oilMbbl === null) return null;
  return gasMmcf + (nglMbbl + oilMbbl) * 6;
}

function buildQuarterAssumptions(period: string, days: number, a: YearAssumptions): ForecastPeriodAssumptions {
  const gasMmcf = a.gasMmcfPerDay === null ? null : a.gasMmcfPerDay * days;
  const nglMbbl = a.nglMbblPerDay === null ? null : a.nglMbblPerDay * days;
  const oilMbbl = a.oilMbblPerDay === null ? null : a.oilMbblPerDay * days;
  const quarterMcfe = totalMcfe(gasMmcf, nglMbbl, oilMbbl);
  const cashGaMillion = a.cashGaPerMcfe === null || quarterMcfe === null ? null : (quarterMcfe * a.cashGaPerMcfe) / 1000;

  return {
    period,
    days,
    commodity: {
      henryHubPerMmbtu: a.henryHubPerMmbtu,
      wtiPerBbl: a.wtiPerBbl,
      nglRealizationPctOfWti: sv(a.nglRealizationPctOfWti, "% of WTI")
    },
    pricing: {
      gasBasisPerMcf: sv(a.gasBasisPerMcf, "$/Mcf"),
      gasTransportMarketingPerMcf: sv(0, "$/Mcf"),
      gasHedgeImpactPerMcf: sv(0, "$/Mcf"),
      nglMarketingUpliftPerBbl: sv(a.nglMarketingUpliftPerBbl, "$/bbl"),
      nglHedgeImpactPerBbl: sv(0, "$/bbl"),
      oilDifferentialPerBbl: sv(a.oilDifferentialPerBbl, "$/bbl"),
      oilHedgeImpactPerBbl: sv(0, "$/bbl")
    },
    production: {
      gasMmcfPerDay: sv(a.gasMmcfPerDay, "MMcf/d"),
      nglMbblPerDay: sv(a.nglMbblPerDay, "Mbbl/d"),
      oilMbblPerDay: sv(a.oilMbblPerDay, "Mbbl/d")
    },
    costs: {
      loePerMcfe: sv(a.loePerMcfe, "$/Mcfe"),
      gatheringTransportPerMcfe: sv(a.gatheringTransportPerMcfe, "$/Mcfe"),
      productionTaxPctRevenue: sv(a.productionTaxPctRevenue, "decimal"),
      cashGaMillion: sv(cashGaMillion, "$mm"),
      cashInterestMillion: sv(a.cashInterestMillionPerQuarter, "$mm"),
      explorationMillion: sv(a.explorationMillionPerQuarter, "$mm"),
      cashTaxRate: sv(a.cashTaxRate, "decimal")
    },
    capex: {
      maintenanceDcMillion: sv(null, "$mm"),
      growthDcMillion: sv(null, "$mm"),
      landLeaseholdMillion: sv(null, "$mm"),
      facilitiesMillion: sv(null, "$mm"),
      environmentalMillion: sv(null, "$mm"),
      otherMillion: sv(null, "$mm"),
      totalOverrideMillion: sv(a.capexMillionPerQuarter, "$mm")
    }
  };
}

/** Runs one year's 4 (uniform-rate) quarters through the unchanged deterministic engine and sums them. */
export function runAnnualPeriod(assumptions: YearAssumptions): { quarters: ForecastPeriodResult[]; production: AnnualPeriodSummary["production"]; revenueMillion: number | null; ebitdaxMillion: number | null; capexMillion: number | null; freeCashFlowMillion: number | null } {
  const yearNumber = Number(assumptions.year);
  const days = quarterDays(yearNumber);
  const quarters = ([1, 2, 3, 4] as const).map((q, index) =>
    runForecastPeriod(buildQuarterAssumptions(`${assumptions.year}Q${q}`, days[index], assumptions))
  );

  function sumNullable(values: Array<number | null>): number | null {
    return values.some((v) => v === null) ? null : (values as number[]).reduce((s, v) => s + v, 0);
  }

  return {
    quarters,
    production: {
      gasMmcf: sumNullable(quarters.map((q) => q.production.gasMmcf)),
      nglMbbl: sumNullable(quarters.map((q) => q.production.nglMbbl)),
      oilMbbl: sumNullable(quarters.map((q) => q.production.oilMbbl)),
      totalMcfe: sumNullable(quarters.map((q) => q.production.totalMcfe))
    },
    revenueMillion: sumNullable(quarters.map((q) => q.revenue.totalMillion)),
    ebitdaxMillion: sumNullable(quarters.map((q) => q.ebitdaxMillion)),
    capexMillion: sumNullable(quarters.map((q) => q.capex.totalMillion)),
    freeCashFlowMillion: sumNullable(quarters.map((q) => q.freeCashFlowMillion))
  };
}

/**
 * Sequential net-debt roll-forward across every quarter of every requested year,
 * via the unchanged generic balance-sheet.ts. No dividends, buybacks, debt
 * issuance, or debt repayment are modeled (all fixed at $0 every period) -- net
 * debt is projected to decline dollar-for-dollar with cumulative forecast free
 * cash flow only. This is a deliberate, disclosed simplification (this
 * integration does not have a verified per-company capital-return/financing
 * schedule), NOT a claim that the company will make no such distributions.
 * beginningDebtMillion carries the running net-debt balance forward each period
 * (beginningCash pinned at $0), which reproduces a pure net-debt roll-forward
 * while still reusing the shared, generic rollForwardBalanceSheet function
 * unchanged.
 */
export function rollForwardNetDebt(
  startingNetDebtMillion: number,
  yearlyQuarters: Array<{ period: string; quarters: ForecastPeriodResult[] }>
): Record<string, number | null> {
  const endingByPeriod: Record<string, number | null> = {};
  let runningNetDebt = startingNetDebtMillion;
  for (const year of yearlyQuarters) {
    for (const quarter of year.quarters) {
      const rolled = rollForwardBalanceSheet({
        period: quarter.period,
        beginningCashMillion: 0,
        beginningDebtMillion: runningNetDebt,
        freeCashFlowMillion: quarter.freeCashFlowMillion,
        dividendsMillion: 0,
        buybacksMillion: 0,
        debtIssuedMillion: 0,
        debtRepaidMillion: 0,
        ebitdaxMillion: quarter.ebitdaxMillion
      });
      runningNetDebt = rolled.netDebtMillion ?? runningNetDebt;
      endingByPeriod[quarter.period] = rolled.netDebtMillion;
    }
  }
  return endingByPeriod;
}

export type AnnualValuationResult = MultipleValuationResult & {
  forwardYear: string;
  forwardEbitdaxMillion: number | null;
  netDebtMillion: number | null;
  forecastEndingNetDebtMillion: number | null;
  valuationNetDebtFloorApplied: boolean;
  netDebtPeriod: string;
  ebitdaxPeriod: string;
  dilutedSharesMillion: number | null;
};

export function computeAnnualValuation(input: {
  forwardYear: string;
  forwardEbitdaxMillion: number | null;
  targetEvToEbitdax: number;
  forecastEndingNetDebtMillion: number | null;
  netDebtMillionOverride?: number;
  dilutedSharesMillion: number;
  dilutedSharesMillionOverride?: number;
}): AnnualValuationResult {
  const userOverride = input.netDebtMillionOverride;
  const netDebtMillion =
    userOverride !== undefined
      ? userOverride
      : input.forecastEndingNetDebtMillion === null
        ? null
        : Math.max(0, input.forecastEndingNetDebtMillion);
  const valuationNetDebtFloorApplied =
    userOverride === undefined && input.forecastEndingNetDebtMillion !== null && input.forecastEndingNetDebtMillion < 0;
  const dilutedShares = input.dilutedSharesMillionOverride ?? input.dilutedSharesMillion;

  const multiple = calculateMultipleValuation({
    forecastEbitdaxMillion: input.forwardEbitdaxMillion,
    targetEvToEbitdax: input.targetEvToEbitdax,
    netDebtMillion,
    dilutedSharesMillion: dilutedShares
  });

  return {
    ...multiple,
    forwardYear: input.forwardYear,
    forwardEbitdaxMillion: input.forwardEbitdaxMillion,
    netDebtMillion,
    forecastEndingNetDebtMillion: input.forecastEndingNetDebtMillion,
    valuationNetDebtFloorApplied,
    netDebtPeriod: `${input.forwardYear}Q4`,
    ebitdaxPeriod: input.forwardYear,
    dilutedSharesMillion: dilutedShares
  };
}

export function computeAnnualDcf(input: {
  annualFreeCashFlowMillion: Array<{ year: number; value: number | null }>;
  currentNetDebtMillion: number;
  dilutedSharesMillion: number;
}): DcfResult & { discountRate: number; terminalGrowthRate: number } {
  const dcf = calculateDcf({
    annualFreeCashFlowMillion: input.annualFreeCashFlowMillion,
    discountRate: DCF_DISCOUNT_RATE,
    terminalGrowthRate: DCF_TERMINAL_GROWTH_RATE,
    netDebtMillion: input.currentNetDebtMillion,
    dilutedSharesMillion: input.dilutedSharesMillion
  });
  return { ...dcf, discountRate: DCF_DISCOUNT_RATE, terminalGrowthRate: DCF_TERMINAL_GROWTH_RATE };
}

export type AnnualForecastResult = {
  quarterly: ForecastPeriodResult[];
  annual: Record<string, AnnualPeriodSummary>;
  productionResolution: Record<string, ResolvedAnnualValue>;
  valuation: AnnualValuationResult;
  dcf: DcfResult & { discountRate: number; terminalGrowthRate: number };
  notes: string[];
};

export type AnnualProductionInput = { gasMmcfPerDay?: number; nglMbblPerDay?: number; oilMbblPerDay?: number };
export type AnnualCostsInput = {
  loePerMcfe?: number;
  gatheringTransportPerMcfe?: number;
  cashGaPerMcfe?: number;
  explorationMillion?: number;
  cashInterestMillion?: number;
  cashTaxRate?: number;
};
export type AnnualCapexInput = { totalMillion?: number };
export type AnnualPricingInput = { gasBasisPerMcf?: number; oilDifferentialPerBbl?: number };
export type AnnualCustomCommodityInput = { henryHubPerMmbtu?: number; wtiPerBbl?: number; nglPerBbl?: number };

export type AnnualForecastRequest = {
  production: Record<string, AnnualProductionInput>;
  costs: Record<string, AnnualCostsInput>;
  capex: Record<string, AnnualCapexInput>;
  pricing: Record<string, AnnualPricingInput>;
  commodityMode: "current-market" | "custom";
  customCommodity?: AnnualCustomCommodityInput;
  liveCommodity?: RrcCurrentMarketPrices;
  valuation: {
    targetEvToEbitdax: number;
    forwardYear: string;
    netDebtMillionOverride?: number;
    dilutedSharesMillionOverride?: number;
  };
};

/**
 * Shared shape for a peer's "latest detailed actual" baseline (mirrors
 * RrcOperatingBaseline's fields exactly, minus RRC-specific quarterly labeling),
 * used as the reported-actual-held-flat fallback whenever a metric has no current
 * or carried-forward guidance. Every field is a single SourcedValue so its origin
 * filing/derivation is preserved next to the number, matching the RRC reference
 * model's baseline convention.
 */
export type PeerOperatingBaseline = {
  ticker: string;
  period: string;
  gasMmcfPerDay: SourcedValue;
  nglMbblPerDay: SourcedValue;
  oilMbblPerDay: SourcedValue;
  loePerMcfe: SourcedValue;
  gatheringTransportPerMcfe: SourcedValue;
  productionTaxPctRevenue: SourcedValue;
  cashGaPerMcfe: SourcedValue;
  explorationMillionPerQuarter: SourcedValue;
  cashInterestMillionPerQuarter: SourcedValue;
  capexMillionPerQuarter: SourcedValue;
  gasBasisPerMcf: SourcedValue;
  oilDifferentialPerBbl: SourcedValue;
  /** WTI-relative NGL realization ratio, used only when the company has no absolute guided NGL price to anchor to instead. */
  nglRealizationPctOfWti: SourcedValue;
  netDebtMillion: SourcedValue;
  dilutedSharesMillion: SourcedValue;
};

export { findGuidance };
export type { GuidanceEntry, GuidanceMetricKey };
