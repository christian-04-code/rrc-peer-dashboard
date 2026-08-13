/**
 * EQT (EQT Corporation) annual Forecast orchestration -- the same "simplified
 * annual" pattern as rrc-annual.ts / ar-annual.ts / cnx-annual.ts, built on the
 * shared mechanical helpers in annual-shared.ts. EQT is the mirror case of CNX:
 * EQT guides its full cost structure component-by-component (LOE, gathering,
 * transmission, processing, production taxes, SG&A -- all used directly, tier-1
 * precedence, no proportional scaling needed) but guides NO gas, oil, or NGL
 * price/differential this cycle, so pricing falls back to EQT's own Q2 2026
 * realized-price decomposition (see eqt-baseline.ts).
 */

import { eqtLatestDetailedBaseline, EQT_VALUATION_PRESETS } from "@/lib/forecast/data/eqt-baseline";
import { eqtManagementGuidance, eqtGuidedLiquidsMbblPerDay } from "@/lib/forecast/guidance/eqt";
import {
  resolveGuidedOrCarriedForward,
  modeledCashTaxRateByPosition,
  runAnnualPeriod,
  rollForwardNetDebt,
  computeAnnualValuation,
  computeAnnualDcf,
  type ResolvedAnnualValue,
  type AnnualForecastRequest,
  type AnnualForecastResult,
  type AnnualPeriodSummary
} from "@/lib/forecast/scenarios/annual-shared";
import type { SourcedValue } from "@/lib/forecast/types";

export const EQT_FORECAST_YEARS = ["2026", "2027", "2028"] as const;
export type EqtForecastYear = (typeof EQT_FORECAST_YEARS)[number];

function modeled(value: number | null, notes: string): ResolvedAnnualValue {
  return { value, classification: "modeled", sourceName: "RRC Peer Dashboard", sourceReference: "Scenario convention", sourceDate: "2026-08-12", notes };
}

function fromBaseline(field: SourcedValue, extraNote = ""): ResolvedAnnualValue {
  return {
    value: field.value,
    classification: field.source.classification,
    sourceName: field.source.name,
    sourceReference: field.source.reference ?? "",
    sourceDate: field.source.period,
    notes: `${field.source.notes ?? ""} Held flat as the forward anchor.${extraNote ? ` ${extraNote}` : ""}`.trim()
  };
}

export function resolveAnnualProductionDefault(year: EqtForecastYear): ResolvedAnnualValue {
  const guided = resolveGuidedOrCarriedForward(eqtManagementGuidance, "totalProductionBcfePerDay", year, EQT_FORECAST_YEARS);
  if (guided) return guided;
  return fromBaseline({
    value:
      eqtLatestDetailedBaseline.gasMmcfPerDay.value === null ||
      eqtLatestDetailedBaseline.nglMbblPerDay.value === null ||
      eqtLatestDetailedBaseline.oilMbblPerDay.value === null
        ? null
        : (eqtLatestDetailedBaseline.gasMmcfPerDay.value + (eqtLatestDetailedBaseline.nglMbblPerDay.value + eqtLatestDetailedBaseline.oilMbblPerDay.value) * 6) / 1000,
    unit: "Bcfe/d",
    source: eqtLatestDetailedBaseline.gasMmcfPerDay.source
  });
}

/**
 * EQT guides a total liquids sales volume (NGL + ethane + oil combined, 14,200-
 * 15,000 MBbl FY2026, mid 14,600) but not a separate gas volume or an NGL:oil
 * split. Gas is derived as this year's guided/resolved total less the guided
 * liquids volume; NGL vs. oil within liquids uses EQT's own Q2 2026 reported
 * ratio (oil is a de minimis ~7.5% of liquids). 2027/2028 (no liquids guidance)
 * carry the FY2026 guided liquids rate forward flat; if no liquids guidance
 * exists at all, falls back to EQT's Q2 2026 reported production mix ratio --
 * the same technique the RRC reference model uses (splitByReportedMix).
 */
export function resolveAnnualCommodityProductionDefaults(year: EqtForecastYear): {
  gasMmcfPerDay: ResolvedAnnualValue;
  nglMbblPerDay: ResolvedAnnualValue;
  oilMbblPerDay: ResolvedAnnualValue;
} {
  const total = resolveAnnualProductionDefault(year);
  if (total.value === null) {
    const unavailable = modeled(null, "Total production is unavailable, so the commodity mix cannot be split.");
    return { gasMmcfPerDay: unavailable, nglMbblPerDay: unavailable, oilMbblPerDay: unavailable };
  }

  const reportedOilShareOfLiquids =
    eqtLatestDetailedBaseline.oilMbblPerDay.value === null || eqtLatestDetailedBaseline.nglMbblPerDay.value === null || eqtLatestDetailedBaseline.oilMbblPerDay.value + eqtLatestDetailedBaseline.nglMbblPerDay.value <= 0
      ? 0
      : eqtLatestDetailedBaseline.oilMbblPerDay.value / (eqtLatestDetailedBaseline.oilMbblPerDay.value + eqtLatestDetailedBaseline.nglMbblPerDay.value);

  const liquidsMbblPerDay = eqtGuidedLiquidsMbblPerDay();
  if (liquidsMbblPerDay !== null) {
    const totalMcfePerDay = total.value * 1000;
    const oilMbblPerDay = liquidsMbblPerDay * reportedOilShareOfLiquids;
    const nglMbblPerDay = liquidsMbblPerDay - oilMbblPerDay;
    const gasMmcfPerDay = totalMcfePerDay - liquidsMbblPerDay * 6;
    const notes = `${total.notes} Commodity split derived from EQT's guided FY2026 total liquids sales volume (${liquidsMbblPerDay.toFixed(1)} Mbbl/d), applied to this year's total; NGL vs. oil split within liquids uses EQT's own Q2 2026 reported ratio (oil is a de minimis ~${(reportedOilShareOfLiquids * 100).toFixed(1)}% of liquids).`.trim();
    return {
      gasMmcfPerDay: { ...total, value: gasMmcfPerDay, notes },
      nglMbblPerDay: { ...total, value: nglMbblPerDay, notes },
      oilMbblPerDay: { ...total, value: oilMbblPerDay, notes }
    };
  }

  const mix = {
    gasMmcfPerDay: eqtLatestDetailedBaseline.gasMmcfPerDay.value ?? 0,
    nglMbblPerDay: eqtLatestDetailedBaseline.nglMbblPerDay.value ?? 0,
    oilMbblPerDay: eqtLatestDetailedBaseline.oilMbblPerDay.value ?? 0
  };
  const mixTotalMcfe = mix.gasMmcfPerDay + (mix.nglMbblPerDay + mix.oilMbblPerDay) * 6;
  if (mixTotalMcfe <= 0) {
    const unavailable = modeled(null, "No reported or guided production mix is available to split this year's total.");
    return { gasMmcfPerDay: unavailable, nglMbblPerDay: unavailable, oilMbblPerDay: unavailable };
  }
  const scale = (total.value * 1000) / mixTotalMcfe;
  const notes = `${total.notes} Commodity split applied using EQT's Q2 2026 reported production mix ratio (no liquids-volume guidance available).`.trim();
  return {
    gasMmcfPerDay: { ...total, value: mix.gasMmcfPerDay * scale, notes },
    nglMbblPerDay: { ...total, value: mix.nglMbblPerDay * scale, notes },
    oilMbblPerDay: { ...total, value: mix.oilMbblPerDay * scale, notes }
  };
}

export function resolveAnnualCostDefaults(year: EqtForecastYear): {
  loePerMcfe: ResolvedAnnualValue;
  gatheringTransportPerMcfe: ResolvedAnnualValue;
  productionTaxPctRevenue: ResolvedAnnualValue;
  cashGaPerMcfe: ResolvedAnnualValue;
  explorationMillion: ResolvedAnnualValue;
  cashInterestMillion: ResolvedAnnualValue;
  cashTaxRate: ResolvedAnnualValue;
} {
  return {
    loePerMcfe: resolveGuidedOrCarriedForward(eqtManagementGuidance, "loePerMcfe", year, EQT_FORECAST_YEARS) ?? fromBaseline(eqtLatestDetailedBaseline.loePerMcfe),
    gatheringTransportPerMcfe: resolveGuidedOrCarriedForward(eqtManagementGuidance, "gatheringTransportPerMcfe", year, EQT_FORECAST_YEARS) ?? fromBaseline(eqtLatestDetailedBaseline.gatheringTransportPerMcfe),
    productionTaxPctRevenue: resolveGuidedOrCarriedForward(eqtManagementGuidance, "productionTaxPerMcfe", year, EQT_FORECAST_YEARS) ?? fromBaseline(eqtLatestDetailedBaseline.productionTaxPctRevenue),
    cashGaPerMcfe: resolveGuidedOrCarriedForward(eqtManagementGuidance, "cashGaPerMcfe", year, EQT_FORECAST_YEARS) ?? fromBaseline(eqtLatestDetailedBaseline.cashGaPerMcfe, "EQT's own reported Q2 2026 cash G&A was not independently re-derived; this fallback is unavailable when no guidance applies."),
    explorationMillion: fromBaseline(eqtLatestDetailedBaseline.explorationMillionPerQuarter),
    cashInterestMillion: fromBaseline(eqtLatestDetailedBaseline.cashInterestMillionPerQuarter),
    cashTaxRate: modeled(
      modeledCashTaxRateByPosition(EQT_FORECAST_YEARS.indexOf(year)),
      `No cash-tax-rate guidance is current for EQT this cycle; modeled ${year === "2026" ? 2 : year === "2027" ? 6 : 8}% assumption reflecting the sector-wide pattern of NOL/IDC tax shelters being used up over the forecast horizon.`
    )
  };
}

export function resolveAnnualCapexDefault(year: EqtForecastYear): ResolvedAnnualValue {
  return (
    resolveGuidedOrCarriedForward(eqtManagementGuidance, "capexTotalMillion", year, EQT_FORECAST_YEARS) ??
    fromBaseline({ ...eqtLatestDetailedBaseline.capexMillionPerQuarter, value: (eqtLatestDetailedBaseline.capexMillionPerQuarter.value ?? 0) * 4 })
  );
}

export function resolveAnnualPricingDefaults(year: EqtForecastYear): {
  gasBasisPerMcf: ResolvedAnnualValue;
  oilDifferentialPerBbl: ResolvedAnnualValue;
} {
  return {
    gasBasisPerMcf: fromBaseline(eqtLatestDetailedBaseline.gasBasisPerMcf, "EQT does not guide a gas differential this cycle."),
    oilDifferentialPerBbl: fromBaseline(eqtLatestDetailedBaseline.oilDifferentialPerBbl, "EQT does not guide an oil differential; oil is <1% of EQT's production.")
  };
}

export const EQT_LATEST_ACTUAL_PERIOD = "2026Q2";

export type EqtAnnualForecastRequest = AnnualForecastRequest;
export type EqtAnnualForecastResult = AnnualForecastResult;

export function runEqtAnnualForecast(request: AnnualForecastRequest): AnnualForecastResult {
  const notes: string[] = [];
  const quarterly: AnnualForecastResult["quarterly"] = [];
  const annual: Record<string, AnnualPeriodSummary> = {};
  const productionResolution: Record<string, ResolvedAnnualValue> = {};
  const yearlyQuarters: Array<{ period: string; quarters: AnnualForecastResult["quarterly"] }> = [];

  const henryHubPerMmbtu: SourcedValue =
    (request.customCommodity?.henryHubPerMmbtu !== undefined
      ? { value: request.customCommodity.henryHubPerMmbtu, unit: "$/MMBtu", source: { name: "User input", period: "current", retrievedAt: new Date(0).toISOString(), classification: "user", notes: "User-entered Henry Hub price." } }
      : request.liveCommodity?.henryHubPerMmbtu) ??
    { value: 2.89, unit: "$/MMBtu", source: { name: "NYMEX", period: "Q2 2026", retrievedAt: new Date(0).toISOString(), classification: "modeled", notes: "Q2 2026 NYMEX Henry Hub average held flat; no live/custom price supplied and EQT did not guide a price assumption this cycle." } };
  const wtiPerBbl: SourcedValue =
    (request.customCommodity?.wtiPerBbl !== undefined
      ? { value: request.customCommodity.wtiPerBbl, unit: "$/bbl", source: { name: "User input", period: "current", retrievedAt: new Date(0).toISOString(), classification: "user", notes: "User-entered WTI price." } }
      : request.liveCommodity?.wtiPerBbl) ??
    { value: 93.58, unit: "$/bbl", source: { name: "NYMEX", period: "Q2 2026", retrievedAt: new Date(0).toISOString(), classification: "modeled", notes: "Q2 2026 NYMEX WTI average held flat; no live/custom price supplied." } };

  for (const year of EQT_FORECAST_YEARS) {
    const productionOverride = request.production[year] ?? {};
    const commodityDefaults = resolveAnnualCommodityProductionDefaults(year);
    const totalDefault = resolveAnnualProductionDefault(year);
    productionResolution[year] = totalDefault;

    const gasMmcfPerDay = productionOverride.gasMmcfPerDay ?? commodityDefaults.gasMmcfPerDay.value;
    const nglMbblPerDay = productionOverride.nglMbblPerDay ?? commodityDefaults.nglMbblPerDay.value;
    const oilMbblPerDay = productionOverride.oilMbblPerDay ?? commodityDefaults.oilMbblPerDay.value;

    const costsDefault = resolveAnnualCostDefaults(year);
    const costsOverride = request.costs[year] ?? {};
    const pricingDefault = resolveAnnualPricingDefaults(year);
    const pricingOverride = request.pricing[year] ?? {};
    const capexDefault = resolveAnnualCapexDefault(year);
    const capexOverride = request.capex[year]?.totalMillion;
    const capexMillionPerQuarter =
      capexOverride !== undefined ? capexOverride / 4 : capexDefault.classification === "guided" ? (capexDefault.value ?? null) === null ? null : (capexDefault.value as number) / 4 : capexDefault.value;

    const { quarters, production, revenueMillion, ebitdaxMillion, capexMillion, freeCashFlowMillion } = runAnnualPeriod({
      year,
      gasMmcfPerDay,
      nglMbblPerDay,
      oilMbblPerDay,
      henryHubPerMmbtu,
      wtiPerBbl,
      gasBasisPerMcf: pricingOverride.gasBasisPerMcf ?? pricingDefault.gasBasisPerMcf.value,
      oilDifferentialPerBbl: pricingOverride.oilDifferentialPerBbl ?? pricingDefault.oilDifferentialPerBbl.value,
      nglRealizationPctOfWti: eqtLatestDetailedBaseline.nglRealizationPctOfWti.value,
      nglMarketingUpliftPerBbl: 0,
      loePerMcfe: costsOverride.loePerMcfe ?? costsDefault.loePerMcfe.value,
      gatheringTransportPerMcfe: costsOverride.gatheringTransportPerMcfe ?? costsDefault.gatheringTransportPerMcfe.value,
      productionTaxPctRevenue: costsDefault.productionTaxPctRevenue.value,
      cashGaPerMcfe: costsOverride.cashGaPerMcfe ?? costsDefault.cashGaPerMcfe.value,
      explorationMillionPerQuarter: costsOverride.explorationMillion ?? costsDefault.explorationMillion.value,
      cashInterestMillionPerQuarter: costsOverride.cashInterestMillion ?? costsDefault.cashInterestMillion.value,
      cashTaxRate: costsOverride.cashTaxRate ?? costsDefault.cashTaxRate.value,
      capexMillionPerQuarter
    });

    quarterly.push(...quarters);
    yearlyQuarters.push({ period: year, quarters });
    annual[year] = { year, production, revenueMillion, ebitdaxMillion, capexMillion, freeCashFlowMillion, fcfYield: null, endingNetDebtMillion: null };
  }

  const startingNetDebt = eqtLatestDetailedBaseline.netDebtMillion.value ?? 0;
  const netDebtByPeriod = rollForwardNetDebt(startingNetDebt, yearlyQuarters);
  for (const year of EQT_FORECAST_YEARS) {
    annual[year].endingNetDebtMillion = netDebtByPeriod[`${year}Q4`] ?? null;
  }

  const forwardYear = (request.valuation.forwardYear as EqtForecastYear) ?? "2027";
  const valuation = computeAnnualValuation({
    forwardYear,
    forwardEbitdaxMillion: annual[forwardYear]?.ebitdaxMillion ?? null,
    targetEvToEbitdax: request.valuation.targetEvToEbitdax,
    forecastEndingNetDebtMillion: netDebtByPeriod[`${forwardYear}Q4`] ?? null,
    netDebtMillionOverride: request.valuation.netDebtMillionOverride,
    dilutedSharesMillion: eqtLatestDetailedBaseline.dilutedSharesMillion.value ?? 0,
    dilutedSharesMillionOverride: request.valuation.dilutedSharesMillionOverride
  });

  const dcf = computeAnnualDcf({
    annualFreeCashFlowMillion: EQT_FORECAST_YEARS.map((year, index) => ({ year: index + 1, value: annual[year].freeCashFlowMillion })),
    currentNetDebtMillion: eqtLatestDetailedBaseline.netDebtMillion.value ?? 0,
    dilutedSharesMillion: eqtLatestDetailedBaseline.dilutedSharesMillion.value ?? 0
  });

  notes.push(
    "EQT's commodity split derives gas as the guided total less its guided FY2026 total liquids sales volume; NGL vs. oil within liquids uses EQT's own Q2 2026 reported ratio.",
    "EQT guides its cost structure component-by-component (LOE, gathering, transmission, processing, production taxes, SG&A) -- each used directly rather than scaled from a blended total, unlike CNX.",
    "EQT does not guide a gas, oil, or NGL price/differential this cycle; all three default to EQT's own Q2 2026 realized-price decomposition (verified directly against EQT's Form 10-Q reconciliation table), held flat.",
    "Net debt is projected to decline dollar-for-dollar with cumulative forecast free cash flow only; dividends, buybacks, and debt issuance/repayment are not modeled."
  );

  return { quarterly, annual, productionResolution, valuation, dcf, notes };
}

export { EQT_VALUATION_PRESETS };
