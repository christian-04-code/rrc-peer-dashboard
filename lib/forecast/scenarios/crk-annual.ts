/**
 * CRK (Comstock Resources) annual Forecast orchestration -- the same "simplified
 * annual" pattern as rrc-annual.ts / ar-annual.ts / cnx-annual.ts / eqt-annual.ts,
 * built on the shared mechanical helpers in annual-shared.ts. CRK is predominantly
 * natural gas (Haynesville/Bossier) and does not disclose a separate NGL stream --
 * nglMbblPerDay is fixed at 0 throughout rather than fabricated. CRK guides its
 * cash cost structure component-by-component (LOE, gathering/transportation,
 * production/other taxes, cash G&A -- all used directly, tier-1 precedence) plus a
 * total FY2026 cash-interest dollar figure and an effective/deferred tax-rate pair
 * (both handled via small guidance-layer extensions in guidance/crk.ts, mirroring
 * EQT's capex-total/gathering-transport/production-tax derived-entry technique).
 * CRK guides no gas or oil price/differential this cycle, so pricing falls back to
 * CRK's own Q2 2026 realized-price decomposition (see crk-baseline.ts).
 */

import { crkLatestDetailedBaseline, CRK_VALUATION_PRESETS } from "@/lib/forecast/data/crk-baseline";
import { crkManagementGuidance, crkGuidedCashInterestMillion } from "@/lib/forecast/guidance/crk";
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

export const CRK_FORECAST_YEARS = ["2026", "2027", "2028"] as const;
export type CrkForecastYear = (typeof CRK_FORECAST_YEARS)[number];

function modeled(value: number | null, notes: string): ResolvedAnnualValue {
  return { value, classification: "modeled", sourceName: "RRC Peer Dashboard", sourceReference: "Scenario convention", sourceDate: "2026-08-13", notes };
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

export function resolveAnnualProductionDefault(year: CrkForecastYear): ResolvedAnnualValue {
  const guided = resolveGuidedOrCarriedForward(crkManagementGuidance, "totalProductionBcfePerDay", year, CRK_FORECAST_YEARS);
  if (guided) return guided;
  return fromBaseline({
    value:
      crkLatestDetailedBaseline.gasMmcfPerDay.value === null || crkLatestDetailedBaseline.oilMbblPerDay.value === null
        ? null
        : (crkLatestDetailedBaseline.gasMmcfPerDay.value + crkLatestDetailedBaseline.oilMbblPerDay.value * 6) / 1000,
    unit: "Bcfe/d",
    source: crkLatestDetailedBaseline.gasMmcfPerDay.source
  });
}

/**
 * CRK guides only a total MMcfe/d rate, not a gas/oil split. Oil is derived using
 * CRK's own Q2 2026 reported oil share of total Mcfe (an immaterial ~0.03%);
 * NGL is fixed at 0 throughout -- CRK does not disclose a separate NGL stream, and
 * this model does not fabricate one (see crk-baseline.ts).
 */
export function resolveAnnualCommodityProductionDefaults(year: CrkForecastYear): {
  gasMmcfPerDay: ResolvedAnnualValue;
  nglMbblPerDay: ResolvedAnnualValue;
  oilMbblPerDay: ResolvedAnnualValue;
} {
  const total = resolveAnnualProductionDefault(year);
  const nglMbblPerDay: ResolvedAnnualValue = modeled(0, "CRK does not disclose a separate NGL stream; fixed at 0 rather than fabricated.");
  if (total.value === null) {
    const unavailable = modeled(null, "Total production is unavailable, so the commodity mix cannot be split.");
    return { gasMmcfPerDay: unavailable, nglMbblPerDay, oilMbblPerDay: unavailable };
  }

  const gasBaseline = crkLatestDetailedBaseline.gasMmcfPerDay.value ?? 0;
  const oilBaseline = crkLatestDetailedBaseline.oilMbblPerDay.value ?? 0;
  const reportedTotalMcfe = gasBaseline + oilBaseline * 6;
  const reportedOilShare = reportedTotalMcfe <= 0 ? 0 : (oilBaseline * 6) / reportedTotalMcfe;

  const totalMcfePerDay = total.value * 1000;
  const oilMcfePerDay = totalMcfePerDay * reportedOilShare;
  const oilMbblPerDay = oilMcfePerDay / 6;
  const gasMmcfPerDay = totalMcfePerDay - oilMcfePerDay;
  const notes = `${total.notes} Commodity split derived using CRK's Q2 2026 reported oil share of total Mcfe (${(reportedOilShare * 100).toFixed(3)}%, an immaterial fraction of total production); CRK does not disclose a separate NGL stream (fixed at 0).`.trim();
  return {
    gasMmcfPerDay: { ...total, value: gasMmcfPerDay, notes },
    nglMbblPerDay,
    oilMbblPerDay: { ...total, value: oilMbblPerDay, notes }
  };
}

export function resolveAnnualCostDefaults(year: CrkForecastYear): {
  loePerMcfe: ResolvedAnnualValue;
  gatheringTransportPerMcfe: ResolvedAnnualValue;
  productionTaxPctRevenue: ResolvedAnnualValue;
  cashGaPerMcfe: ResolvedAnnualValue;
  explorationMillion: ResolvedAnnualValue;
  cashInterestMillion: ResolvedAnnualValue;
  cashTaxRate: ResolvedAnnualValue;
} {
  const guidedCashInterestTotal = crkGuidedCashInterestMillion();
  const cashInterestMillion: ResolvedAnnualValue =
    guidedCashInterestTotal !== null
      ? {
          value: guidedCashInterestTotal / 4,
          classification: "guided",
          sourceName: "Comstock Resources, Inc.",
          sourceReference: "CRK Q2 2026 Earnings (cash_interest guidance)",
          sourceDate: "2026-07-30",
          notes: `CRK's guided FY2026 total cash interest ($${guidedCashInterestTotal}mm), quarterized (/4).${year === "2026" ? "" : " Carried forward flat (no separate 2027/2028 guidance)."}`
        }
      : fromBaseline(crkLatestDetailedBaseline.cashInterestMillionPerQuarter);

  return {
    loePerMcfe: resolveGuidedOrCarriedForward(crkManagementGuidance, "loePerMcfe", year, CRK_FORECAST_YEARS) ?? fromBaseline(crkLatestDetailedBaseline.loePerMcfe),
    gatheringTransportPerMcfe: resolveGuidedOrCarriedForward(crkManagementGuidance, "gatheringTransportPerMcfe", year, CRK_FORECAST_YEARS) ?? fromBaseline(crkLatestDetailedBaseline.gatheringTransportPerMcfe),
    productionTaxPctRevenue: resolveGuidedOrCarriedForward(crkManagementGuidance, "productionTaxPerMcfe", year, CRK_FORECAST_YEARS) ?? fromBaseline(crkLatestDetailedBaseline.productionTaxPctRevenue),
    cashGaPerMcfe: resolveGuidedOrCarriedForward(crkManagementGuidance, "cashGaPerMcfe", year, CRK_FORECAST_YEARS) ?? fromBaseline(crkLatestDetailedBaseline.cashGaPerMcfe),
    explorationMillion: fromBaseline(crkLatestDetailedBaseline.explorationMillionPerQuarter),
    cashInterestMillion,
    cashTaxRate:
      resolveGuidedOrCarriedForward(crkManagementGuidance, "cashTaxRate", year, CRK_FORECAST_YEARS) ??
      modeled(
        modeledCashTaxRateByPosition(CRK_FORECAST_YEARS.indexOf(year)),
        `No cash-tax-rate guidance is current for CRK this cycle; modeled ${year === "2026" ? 2 : year === "2027" ? 6 : 8}% assumption reflecting the sector-wide pattern of NOL/IDC tax shelters being used up over the forecast horizon.`
      )
  };
}

export function resolveAnnualCapexDefault(year: CrkForecastYear): ResolvedAnnualValue {
  return (
    resolveGuidedOrCarriedForward(crkManagementGuidance, "capexTotalMillion", year, CRK_FORECAST_YEARS) ??
    fromBaseline({ ...crkLatestDetailedBaseline.capexMillionPerQuarter, value: (crkLatestDetailedBaseline.capexMillionPerQuarter.value ?? 0) * 4 })
  );
}

export function resolveAnnualPricingDefaults(year: CrkForecastYear): {
  gasBasisPerMcf: ResolvedAnnualValue;
  oilDifferentialPerBbl: ResolvedAnnualValue;
} {
  return {
    gasBasisPerMcf: fromBaseline(crkLatestDetailedBaseline.gasBasisPerMcf, "CRK does not guide a gas differential this cycle."),
    oilDifferentialPerBbl: fromBaseline(crkLatestDetailedBaseline.oilDifferentialPerBbl, "CRK does not guide an oil differential; oil is <0.03% of CRK's production.")
  };
}

export const CRK_LATEST_ACTUAL_PERIOD = "2026Q2";

export type CrkAnnualForecastRequest = AnnualForecastRequest;
export type CrkAnnualForecastResult = AnnualForecastResult;

export function runCrkAnnualForecast(request: AnnualForecastRequest): AnnualForecastResult {
  const notes: string[] = [];
  const quarterly: AnnualForecastResult["quarterly"] = [];
  const annual: Record<string, AnnualPeriodSummary> = {};
  const productionResolution: Record<string, ResolvedAnnualValue> = {};
  const yearlyQuarters: Array<{ period: string; quarters: AnnualForecastResult["quarterly"] }> = [];

  const henryHubPerMmbtu: SourcedValue =
    (request.customCommodity?.henryHubPerMmbtu !== undefined
      ? { value: request.customCommodity.henryHubPerMmbtu, unit: "$/MMBtu", source: { name: "User input", period: "current", retrievedAt: new Date(0).toISOString(), classification: "user", notes: "User-entered Henry Hub price." } }
      : request.liveCommodity?.henryHubPerMmbtu) ??
    { value: 2.89, unit: "$/MMBtu", source: { name: "NYMEX", period: "Q2 2026", retrievedAt: new Date(0).toISOString(), classification: "modeled", notes: "Q2 2026 NYMEX Henry Hub average held flat; no live/custom price supplied and CRK did not guide a price assumption this cycle." } };
  const wtiPerBbl: SourcedValue =
    (request.customCommodity?.wtiPerBbl !== undefined
      ? { value: request.customCommodity.wtiPerBbl, unit: "$/bbl", source: { name: "User input", period: "current", retrievedAt: new Date(0).toISOString(), classification: "user", notes: "User-entered WTI price." } }
      : request.liveCommodity?.wtiPerBbl) ??
    { value: 93.58, unit: "$/bbl", source: { name: "NYMEX", period: "Q2 2026", retrievedAt: new Date(0).toISOString(), classification: "modeled", notes: "Q2 2026 NYMEX WTI average held flat; no live/custom price supplied." } };

  for (const year of CRK_FORECAST_YEARS) {
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
      nglRealizationPctOfWti: 0,
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

  const startingNetDebt = crkLatestDetailedBaseline.netDebtMillion.value ?? 0;
  const netDebtByPeriod = rollForwardNetDebt(startingNetDebt, yearlyQuarters);
  for (const year of CRK_FORECAST_YEARS) {
    annual[year].endingNetDebtMillion = netDebtByPeriod[`${year}Q4`] ?? null;
  }

  const forwardYear = (request.valuation.forwardYear as CrkForecastYear) ?? "2027";
  const valuation = computeAnnualValuation({
    forwardYear,
    forwardEbitdaxMillion: annual[forwardYear]?.ebitdaxMillion ?? null,
    targetEvToEbitdax: request.valuation.targetEvToEbitdax,
    forecastEndingNetDebtMillion: netDebtByPeriod[`${forwardYear}Q4`] ?? null,
    netDebtMillionOverride: request.valuation.netDebtMillionOverride,
    dilutedSharesMillion: crkLatestDetailedBaseline.dilutedSharesMillion.value ?? 0,
    dilutedSharesMillionOverride: request.valuation.dilutedSharesMillionOverride
  });

  const dcf = computeAnnualDcf({
    annualFreeCashFlowMillion: CRK_FORECAST_YEARS.map((year, index) => ({ year: index + 1, value: annual[year].freeCashFlowMillion })),
    currentNetDebtMillion: crkLatestDetailedBaseline.netDebtMillion.value ?? 0,
    dilutedSharesMillion: crkLatestDetailedBaseline.dilutedSharesMillion.value ?? 0
  });

  notes.push(
    "CRK is predominantly natural gas; it does not disclose a separate NGL stream, so nglMbblPerDay is fixed at 0 throughout rather than fabricated. Oil (an immaterial <0.03% of production) is split from the guided MMcfe/d total using CRK's own Q2 2026 reported oil share.",
    "CRK guides its cash cost structure component-by-component (LOE, gathering/transportation, production/other taxes, cash G&A) -- each used directly, plus a total FY2026 cash-interest dollar figure and an effective/deferred tax-rate pair, both handled via small guidance-layer extensions (see guidance/crk.ts).",
    "CRK does not guide a gas or oil price/differential this cycle; both default to CRK's own Q2 2026 realized-price decomposition, held flat.",
    "CRK's guided FY2026 'Total capital expenditures' figure ($1,450-1,550mm, mid $1,500mm, 'updated' this cycle) is used as-is as the default capex default. CRK separately guides a $100-150mm FY2026 Pinnacle Gas Services (midstream) capital figure; unlike GPOR's explicitly-labeled 'additional' discretionary program, CRK's materials do not state whether this Pinnacle figure is included within or incremental to the guided total (Pinnacle also carries an outside Sixth Street equity investment per CRK's guidance, per the pinnacle_fixed_charge_reduction record), so it is disclosed here rather than assumed either way.",
    "Net debt is projected to decline dollar-for-dollar with cumulative forecast free cash flow only; dividends, buybacks, and debt issuance/repayment are not modeled."
  );

  return { quarterly, annual, productionResolution, valuation, dcf, notes };
}

export { CRK_VALUATION_PRESETS };
