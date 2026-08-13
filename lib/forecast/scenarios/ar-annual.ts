/**
 * AR (Antero Resources) annual Forecast orchestration -- the same "simplified
 * annual" pattern as rrc-annual.ts, built on the shared mechanical helpers in
 * annual-shared.ts. Every default-resolution decision below is AR-specific: AR's
 * own guided production/pricing/cost components (not RRC's), preferring exact-year
 * guidance, then the current cycle's guidance carried flat forward, then AR's own
 * Q2 2026 reported actual held flat, in that order -- never a fabricated value.
 *
 * AR guides its per-commodity production mix explicitly (natural_gas_production,
 * c3_ngl_production, ethane_production, oil_production), unlike RRC, which only
 * guides a total and relies on a reported-mix split. Those custom metric keys
 * aren't part of the standard GuidanceMetricKey enum (which only has a single
 * "totalProductionBcfePerDay"), so this file reads them directly via
 * getCompanyGuidanceRecords("AR") rather than through arManagementGuidance.
 */

import { getCompanyGuidanceRecords } from "@/lib/dashboard/guidance";
import { arLatestDetailedBaseline, AR_VALUATION_PRESETS } from "@/lib/forecast/data/ar-baseline";
import { arManagementGuidance } from "@/lib/forecast/guidance/ar";
import {
  resolveGuidedOrCarriedForward,
  guidanceToResolved,
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

export const AR_FORECAST_YEARS = ["2026", "2027", "2028"] as const;
export type ArForecastYear = (typeof AR_FORECAST_YEARS)[number];

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

export function resolveAnnualProductionDefault(year: ArForecastYear): ResolvedAnnualValue {
  const guided = resolveGuidedOrCarriedForward(arManagementGuidance, "totalProductionBcfePerDay", year, AR_FORECAST_YEARS);
  if (guided) return guided;
  return fromBaseline({
    value:
      arLatestDetailedBaseline.gasMmcfPerDay.value === null ||
      arLatestDetailedBaseline.nglMbblPerDay.value === null ||
      arLatestDetailedBaseline.oilMbblPerDay.value === null
        ? null
        : (arLatestDetailedBaseline.gasMmcfPerDay.value + (arLatestDetailedBaseline.nglMbblPerDay.value + arLatestDetailedBaseline.oilMbblPerDay.value) * 6) / 1000,
    unit: "Bcfe/d",
    source: arLatestDetailedBaseline.gasMmcfPerDay.source
  });
}

/** AR's own guided FY2026 per-commodity production mix (Bcf/d gas, Bbl/d liquids split by C3/ethane/oil), converted to this engine's MMcf/d + Mbbl/d units. Returns null when the current cycle didn't guide these metrics. */
function guided2026CommodityMix(): { gasMmcfPerDay: number; nglMbblPerDay: number; oilMbblPerDay: number } | null {
  const records = getCompanyGuidanceRecords("AR");
  const gas = records.find((r) => r.metric === "natural_gas_production" && r.period === "FY 2026")?.midpoint;
  const c3 = records.find((r) => r.metric === "c3_ngl_production" && r.period === "FY 2026")?.midpoint;
  const ethane = records.find((r) => r.metric === "ethane_production" && r.period === "FY 2026")?.midpoint;
  const oil = records.find((r) => r.metric === "oil_production" && r.period === "FY 2026")?.midpoint;
  if (gas === undefined || gas === null || c3 === undefined || c3 === null || ethane === undefined || ethane === null || oil === undefined || oil === null) return null;
  return { gasMmcfPerDay: gas * 1000, nglMbblPerDay: (c3 + ethane) / 1000, oilMbblPerDay: oil / 1000 };
}

export function resolveAnnualCommodityProductionDefaults(year: ArForecastYear): {
  gasMmcfPerDay: ResolvedAnnualValue;
  nglMbblPerDay: ResolvedAnnualValue;
  oilMbblPerDay: ResolvedAnnualValue;
} {
  const mix2026 = guided2026CommodityMix();
  const total = resolveAnnualProductionDefault(year);
  if (total.value === null) {
    const unavailable = modeled(null, "Total production is unavailable, so the commodity mix cannot be split.");
    return { gasMmcfPerDay: unavailable, nglMbblPerDay: unavailable, oilMbblPerDay: unavailable };
  }
  // AR's guided FY2026 per-commodity components (natural_gas_production +
  // c3_ngl_production + ethane_production + oil_production, summing to ~4.078
  // Bcfe/d) do not exactly reconcile with AR's separately guided FY2026 total
  // production line (4.175 Bcfe/d, the "raised" headline figure) -- a ~2.4% gap,
  // most likely a rounding/measurement-convention difference between the two
  // guidance tables rather than an error in either. Rather than let the annual
  // total silently diverge from the more prominent headline "production"
  // guidance figure, the guided components are used only for their MIX RATIO
  // (gas/NGL/oil shares of total Mcfe) and scaled to exactly match the guided
  // total -- the same technique the RRC reference model uses (splitByReportedMix)
  // when management guides only a total, applied here even though AR guides
  // components too, specifically to keep the annual total internally consistent.
  // Falls back to AR's Q2 2026 reported mix ratio when no guided components exist
  // for any year in the window.
  const mix =
    mix2026 ?? {
      gasMmcfPerDay: arLatestDetailedBaseline.gasMmcfPerDay.value ?? 0,
      nglMbblPerDay: arLatestDetailedBaseline.nglMbblPerDay.value ?? 0,
      oilMbblPerDay: arLatestDetailedBaseline.oilMbblPerDay.value ?? 0
    };
  const mixTotalMcfe = mix.gasMmcfPerDay + (mix.nglMbblPerDay + mix.oilMbblPerDay) * 6;
  if (mixTotalMcfe <= 0) {
    const unavailable = modeled(null, "No reported or guided production mix is available to split this year's total.");
    return { gasMmcfPerDay: unavailable, nglMbblPerDay: unavailable, oilMbblPerDay: unavailable };
  }
  const scale = (total.value * 1000) / mixTotalMcfe;
  const mixLabel = mix2026 ? "AR's guided FY2026 production mix ratio (components derived/rescaled to reconcile with the separately guided total; see code comment)" : "AR's Q2 2026 reported production mix ratio";
  const withNote = (v: number) => ({ ...total, value: v, notes: `${total.notes} Commodity split derived by applying ${mixLabel}.`.trim() });
  return {
    gasMmcfPerDay: withNote(mix.gasMmcfPerDay * scale),
    nglMbblPerDay: withNote(mix.nglMbblPerDay * scale),
    oilMbblPerDay: withNote(mix.oilMbblPerDay * scale)
  };
}

export function resolveAnnualCostDefaults(year: ArForecastYear): {
  loePerMcfe: ResolvedAnnualValue;
  gatheringTransportPerMcfe: ResolvedAnnualValue;
  productionTaxPctRevenue: ResolvedAnnualValue;
  cashGaPerMcfe: ResolvedAnnualValue;
  explorationMillion: ResolvedAnnualValue;
  cashInterestMillion: ResolvedAnnualValue;
  cashTaxRate: ResolvedAnnualValue;
} {
  const cashGa = resolveGuidedOrCarriedForward(arManagementGuidance, "cashGaPerMcfe", year, AR_FORECAST_YEARS) ?? fromBaseline(arLatestDetailedBaseline.cashGaPerMcfe);
  return {
    loePerMcfe: fromBaseline(arLatestDetailedBaseline.loePerMcfe, "AR does not guide LOE separately from its blended cash-production-expense range."),
    gatheringTransportPerMcfe: fromBaseline(arLatestDetailedBaseline.gatheringTransportPerMcfe, "AR does not guide gathering/transport separately from its blended cash-production-expense range."),
    productionTaxPctRevenue: fromBaseline(arLatestDetailedBaseline.productionTaxPctRevenue, "AR does not guide production tax separately from its blended cash-production-expense range."),
    cashGaPerMcfe: cashGa,
    explorationMillion: fromBaseline(arLatestDetailedBaseline.explorationMillionPerQuarter),
    cashInterestMillion: fromBaseline(arLatestDetailedBaseline.cashInterestMillionPerQuarter),
    cashTaxRate: modeled(
      modeledCashTaxRateByPosition(AR_FORECAST_YEARS.indexOf(year)),
      `No cash-tax-rate guidance is current for AR this cycle; modeled ${year === "2026" ? 2 : year === "2027" ? 6 : 8}% assumption reflecting the sector-wide pattern of NOL/IDC tax shelters being used up over the forecast horizon.`
    )
  };
}

export function resolveAnnualCapexDefault(year: ArForecastYear): ResolvedAnnualValue {
  return (
    resolveGuidedOrCarriedForward(arManagementGuidance, "capexTotalMillion", year, AR_FORECAST_YEARS) ??
    fromBaseline({ ...arLatestDetailedBaseline.capexMillionPerQuarter, value: (arLatestDetailedBaseline.capexMillionPerQuarter.value ?? 0) * 4 })
  );
}

export function resolveAnnualPricingDefaults(year: ArForecastYear): {
  gasBasisPerMcf: ResolvedAnnualValue;
  oilDifferentialPerBbl: ResolvedAnnualValue;
} {
  return {
    gasBasisPerMcf: resolveGuidedOrCarriedForward(arManagementGuidance, "gasBasisPerMcf", year, AR_FORECAST_YEARS) ?? modeled(null, "AR did not guide a gas differential this cycle and no fallback benchmark decomposition is used (see ar-baseline.ts)."),
    oilDifferentialPerBbl: resolveGuidedOrCarriedForward(arManagementGuidance, "oilDifferentialPerBbl", year, AR_FORECAST_YEARS) ?? modeled(null, "AR did not guide an oil differential this cycle.")
  };
}

export const AR_LATEST_ACTUAL_PERIOD = "2026Q2";

export type ArAnnualForecastRequest = AnnualForecastRequest;
export type ArAnnualForecastResult = AnnualForecastResult;

export function runArAnnualForecast(request: AnnualForecastRequest): AnnualForecastResult {
  const notes: string[] = [];
  const quarterly: AnnualForecastResult["quarterly"] = [];
  const annual: Record<string, AnnualPeriodSummary> = {};
  const productionResolution: Record<string, ResolvedAnnualValue> = {};
  const yearlyQuarters: Array<{ period: string; quarters: AnnualForecastResult["quarterly"] }> = [];

  const henryHubPerMmbtu: SourcedValue =
    (request.customCommodity?.henryHubPerMmbtu !== undefined
      ? { value: request.customCommodity.henryHubPerMmbtu, unit: "$/MMBtu", source: { name: "User input", period: "current", retrievedAt: new Date(0).toISOString(), classification: "user", notes: "User-entered Henry Hub price." } }
      : request.liveCommodity?.henryHubPerMmbtu) ??
    { value: 2.89, unit: "$/MMBtu", source: { name: "NYMEX", period: "Q2 2026", retrievedAt: new Date(0).toISOString(), classification: "modeled", notes: "Q2 2026 NYMEX Henry Hub average held flat; no live/custom price supplied." } };
  const wtiPerBbl: SourcedValue =
    (request.customCommodity?.wtiPerBbl !== undefined
      ? { value: request.customCommodity.wtiPerBbl, unit: "$/bbl", source: { name: "User input", period: "current", retrievedAt: new Date(0).toISOString(), classification: "user", notes: "User-entered WTI price." } }
      : request.liveCommodity?.wtiPerBbl) ??
    { value: 93.58, unit: "$/bbl", source: { name: "NYMEX", period: "Q2 2026", retrievedAt: new Date(0).toISOString(), classification: "modeled", notes: "Q2 2026 NYMEX WTI average held flat; no live/custom price supplied." } };

  for (const year of AR_FORECAST_YEARS) {
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
      nglRealizationPctOfWti: arLatestDetailedBaseline.nglRealizationPctOfWti.value,
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
    annual[year] = {
      year,
      production,
      revenueMillion,
      ebitdaxMillion,
      capexMillion,
      freeCashFlowMillion,
      fcfYield: null,
      endingNetDebtMillion: null
    };
  }

  const startingNetDebt = arLatestDetailedBaseline.netDebtMillion.value ?? 0;
  const netDebtByPeriod = rollForwardNetDebt(startingNetDebt, yearlyQuarters);
  for (const year of AR_FORECAST_YEARS) {
    annual[year].endingNetDebtMillion = netDebtByPeriod[`${year}Q4`] ?? null;
  }

  const forwardYear = (request.valuation.forwardYear as ArForecastYear) ?? "2027";
  const valuation = computeAnnualValuation({
    forwardYear,
    forwardEbitdaxMillion: annual[forwardYear]?.ebitdaxMillion ?? null,
    targetEvToEbitdax: request.valuation.targetEvToEbitdax,
    forecastEndingNetDebtMillion: netDebtByPeriod[`${forwardYear}Q4`] ?? null,
    netDebtMillionOverride: request.valuation.netDebtMillionOverride,
    dilutedSharesMillion: arLatestDetailedBaseline.dilutedSharesMillion.value ?? 0,
    dilutedSharesMillionOverride: request.valuation.dilutedSharesMillionOverride
  });

  const dcf = computeAnnualDcf({
    annualFreeCashFlowMillion: AR_FORECAST_YEARS.map((year, index) => ({ year: index + 1, value: annual[year].freeCashFlowMillion })),
    currentNetDebtMillion: arLatestDetailedBaseline.netDebtMillion.value ?? 0,
    dilutedSharesMillion: arLatestDetailedBaseline.dilutedSharesMillion.value ?? 0
  });

  notes.push(
    "AR's FY2027 production target (4.3-4.5 Bcfe/d, guided in the Q1 2026 cycle) was not reconfirmed in the current Q2 2026 reporting cycle, so it is intentionally excluded here in favor of carrying the current-cycle FY2026 guided rate forward -- consistent with this site's existing reportingCycle-current-only guidance convention.",
    "AR's NGL pricing default uses a WTI-relative realization ratio derived from the Q2 2026 actual, because AR's own guided ethane/C3 differentials are quoted against Mont Belvieu, which this system has no live benchmark for.",
    "AR does not separately break out LOE, gathering/transport, or production tax within its blended cash-production-expense guidance range; those three cost lines default to the Q2 2026 reported actual held flat.",
    "Net debt is projected to decline dollar-for-dollar with cumulative forecast free cash flow only; dividends, buybacks, and debt issuance/repayment are not modeled."
  );

  return {
    quarterly,
    annual,
    productionResolution,
    valuation,
    dcf,
    notes
  };
}

export { AR_VALUATION_PRESETS };
