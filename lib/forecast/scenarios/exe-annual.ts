/**
 * EXE (Expand Energy) annual Forecast orchestration -- the same "simplified
 * annual" pattern as rrc-annual.ts / ar-annual.ts / cnx-annual.ts / eqt-annual.ts
 * / crk-annual.ts, built on the shared mechanical helpers in annual-shared.ts.
 * EXE is the post-Chesapeake/Southwestern combined entity, guides only a total
 * MMcfe/d production rate (not a per-commodity split), so gas/NGL/oil is split
 * using EXE's own Q2 2026 reported production mix ratio, the same technique
 * eqt-annual.ts uses when no per-commodity guidance exists. EXE guides its cash
 * cost structure component-by-component (production expense, gathering/
 * processing/transportation, severance/ad valorem taxes, G&A) plus gas/oil
 * differentials and an absolute NGL realization price this cycle, and a total
 * FY2026 cash-interest dollar figure (handled via a small guidance-layer
 * extension in guidance/exe.ts, mirroring crk-annual.ts's cash-interest
 * technique). EXE does not guide a cash-tax rate this cycle.
 *
 * NOT MODELED: EXE's Marketing (Twin Eagle) segment. EXE's Q2 2026 Form 10-Q
 * shows Marketing revenue of $681mm against Marketing expense of $649mm (a
 * ~$32mm/quarter net margin currently) -- materially smaller than the guided
 * long-term "$750mm annual run-rate" marketing_commercial_fcf_target, which is
 * an explicitly forward, post-synergy target (see twin_eagle_synergies_total:
 * "$150mm annually by YE 2028"), not a current-cycle confirmed FY2026 figure.
 * Consistent with this engine's existing convention of excluding un-reconfirmed
 * multi-year targets (see ar-annual.ts's note on AR's excluded FY2027 target),
 * this engine's commodity-only revenue/EBITDAX calculation does not add back any
 * Marketing segment contribution -- a real, disclosed, unmodeled value item, not
 * a fabricated omission.
 */

import { exeLatestDetailedBaseline, EXE_VALUATION_PRESETS } from "@/lib/forecast/data/exe-baseline";
import { exeManagementGuidance, exeGuidedInterestExpenseMillion, exeGuidedNglPricePerBbl } from "@/lib/forecast/guidance/exe";
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

export const EXE_FORECAST_YEARS = ["2026", "2027", "2028"] as const;
export type ExeForecastYear = (typeof EXE_FORECAST_YEARS)[number];

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

export function resolveAnnualProductionDefault(year: ExeForecastYear): ResolvedAnnualValue {
  const guided = resolveGuidedOrCarriedForward(exeManagementGuidance, "totalProductionBcfePerDay", year, EXE_FORECAST_YEARS);
  if (guided) return guided;
  return fromBaseline({
    value:
      exeLatestDetailedBaseline.gasMmcfPerDay.value === null ||
      exeLatestDetailedBaseline.nglMbblPerDay.value === null ||
      exeLatestDetailedBaseline.oilMbblPerDay.value === null
        ? null
        : (exeLatestDetailedBaseline.gasMmcfPerDay.value + (exeLatestDetailedBaseline.nglMbblPerDay.value + exeLatestDetailedBaseline.oilMbblPerDay.value) * 6) / 1000,
    unit: "Bcfe/d",
    source: exeLatestDetailedBaseline.gasMmcfPerDay.source
  });
}

/** EXE guides only a total MMcfe/d rate, not a per-commodity split; gas/NGL/oil is split using EXE's own Q2 2026 reported production mix ratio, the same technique eqt-annual.ts uses when no per-commodity guidance exists. */
export function resolveAnnualCommodityProductionDefaults(year: ExeForecastYear): {
  gasMmcfPerDay: ResolvedAnnualValue;
  nglMbblPerDay: ResolvedAnnualValue;
  oilMbblPerDay: ResolvedAnnualValue;
} {
  const total = resolveAnnualProductionDefault(year);
  if (total.value === null) {
    const unavailable = modeled(null, "Total production is unavailable, so the commodity mix cannot be split.");
    return { gasMmcfPerDay: unavailable, nglMbblPerDay: unavailable, oilMbblPerDay: unavailable };
  }

  const mix = {
    gasMmcfPerDay: exeLatestDetailedBaseline.gasMmcfPerDay.value ?? 0,
    nglMbblPerDay: exeLatestDetailedBaseline.nglMbblPerDay.value ?? 0,
    oilMbblPerDay: exeLatestDetailedBaseline.oilMbblPerDay.value ?? 0
  };
  const mixTotalMcfe = mix.gasMmcfPerDay + (mix.nglMbblPerDay + mix.oilMbblPerDay) * 6;
  if (mixTotalMcfe <= 0) {
    const unavailable = modeled(null, "No reported production mix is available to split this year's total.");
    return { gasMmcfPerDay: unavailable, nglMbblPerDay: unavailable, oilMbblPerDay: unavailable };
  }
  const scale = (total.value * 1000) / mixTotalMcfe;
  const notes = `${total.notes} Commodity split applied using EXE's Q2 2026 reported production mix ratio (no per-commodity guidance this cycle).`.trim();
  return {
    gasMmcfPerDay: { ...total, value: mix.gasMmcfPerDay * scale, notes },
    nglMbblPerDay: { ...total, value: mix.nglMbblPerDay * scale, notes },
    oilMbblPerDay: { ...total, value: mix.oilMbblPerDay * scale, notes }
  };
}

export function resolveAnnualCostDefaults(year: ExeForecastYear): {
  loePerMcfe: ResolvedAnnualValue;
  gatheringTransportPerMcfe: ResolvedAnnualValue;
  productionTaxPctRevenue: ResolvedAnnualValue;
  cashGaPerMcfe: ResolvedAnnualValue;
  explorationMillion: ResolvedAnnualValue;
  cashInterestMillion: ResolvedAnnualValue;
  cashTaxRate: ResolvedAnnualValue;
} {
  const guidedInterestTotal = exeGuidedInterestExpenseMillion();
  const cashInterestMillion: ResolvedAnnualValue =
    guidedInterestTotal !== null
      ? {
          value: guidedInterestTotal / 4,
          classification: "guided",
          sourceName: "Expand Energy Corporation",
          sourceReference: "EXE Q2 2026 Earnings (interest_expense guidance)",
          sourceDate: "2026-07-30",
          notes: `EXE's guided FY2026 total interest expense ($${guidedInterestTotal}mm), quarterized (/4).${year === "2026" ? "" : " Carried forward flat (no separate 2027/2028 guidance)."}`
        }
      : fromBaseline(exeLatestDetailedBaseline.cashInterestMillionPerQuarter);

  return {
    loePerMcfe: resolveGuidedOrCarriedForward(exeManagementGuidance, "loePerMcfe", year, EXE_FORECAST_YEARS) ?? fromBaseline(exeLatestDetailedBaseline.loePerMcfe),
    gatheringTransportPerMcfe: resolveGuidedOrCarriedForward(exeManagementGuidance, "gatheringTransportPerMcfe", year, EXE_FORECAST_YEARS) ?? fromBaseline(exeLatestDetailedBaseline.gatheringTransportPerMcfe),
    productionTaxPctRevenue: resolveGuidedOrCarriedForward(exeManagementGuidance, "productionTaxPerMcfe", year, EXE_FORECAST_YEARS) ?? fromBaseline(exeLatestDetailedBaseline.productionTaxPctRevenue),
    cashGaPerMcfe: resolveGuidedOrCarriedForward(exeManagementGuidance, "cashGaPerMcfe", year, EXE_FORECAST_YEARS) ?? fromBaseline(exeLatestDetailedBaseline.cashGaPerMcfe, "EXE's own Q2 2026 reported cash G&A was not independently re-derived (see exe-baseline.ts); this fallback is unavailable when no guidance applies."),
    explorationMillion: fromBaseline(exeLatestDetailedBaseline.explorationMillionPerQuarter),
    cashInterestMillion,
    cashTaxRate: modeled(
      modeledCashTaxRateByPosition(EXE_FORECAST_YEARS.indexOf(year)),
      `No cash-tax-rate guidance is current for EXE this cycle; modeled ${year === "2026" ? 2 : year === "2027" ? 6 : 8}% assumption reflecting the sector-wide pattern of NOL/IDC tax shelters being used up over the forecast horizon.`
    )
  };
}

export function resolveAnnualCapexDefault(year: ExeForecastYear): ResolvedAnnualValue {
  return (
    resolveGuidedOrCarriedForward(exeManagementGuidance, "capexTotalMillion", year, EXE_FORECAST_YEARS) ??
    fromBaseline({ ...exeLatestDetailedBaseline.capexMillionPerQuarter, value: (exeLatestDetailedBaseline.capexMillionPerQuarter.value ?? 0) * 4 })
  );
}

export function resolveAnnualPricingDefaults(year: ExeForecastYear): {
  gasBasisPerMcf: ResolvedAnnualValue;
  oilDifferentialPerBbl: ResolvedAnnualValue;
} {
  return {
    gasBasisPerMcf: resolveGuidedOrCarriedForward(exeManagementGuidance, "gasBasisPerMcf", year, EXE_FORECAST_YEARS) ?? fromBaseline(exeLatestDetailedBaseline.gasBasisPerMcf),
    oilDifferentialPerBbl: resolveGuidedOrCarriedForward(exeManagementGuidance, "oilDifferentialPerBbl", year, EXE_FORECAST_YEARS) ?? fromBaseline(exeLatestDetailedBaseline.oilDifferentialPerBbl)
  };
}

/** EXE's FY2026 guided absolute NGL price, held flat for 2027/2028 (no separate guidance); falls back to the Q2 2026 reported WTI-relative realization if EXE stops guiding this metric. */
function resolveAnnualNglPricePerBbl(year: ExeForecastYear): ResolvedAnnualValue {
  const guided = exeGuidedNglPricePerBbl();
  if (guided !== null) {
    return {
      value: guided,
      classification: "guided",
      sourceName: "Expand Energy Corporation",
      sourceReference: "EXE Q2 2026 Earnings (ngl_realized_price guidance)",
      sourceDate: "2026-07-30",
      notes: `EXE's guided FY2026 NGL realization ($${guided}/bbl), held flat across 2026-2028 (no separate 2027/2028 guidance).${year === "2026" ? "" : " Carried forward from the FY2026 cycle."}`
    };
  }
  return modeled(26.26, "EXE did not guide an NGL price this cycle; the Q2 2026 reported realization ($26.26/bbl) is held flat.");
}

export const EXE_LATEST_ACTUAL_PERIOD = "2026Q2";

export type ExeAnnualForecastRequest = AnnualForecastRequest;
export type ExeAnnualForecastResult = AnnualForecastResult;

export function runExeAnnualForecast(request: AnnualForecastRequest): AnnualForecastResult {
  const notes: string[] = [];
  const quarterly: AnnualForecastResult["quarterly"] = [];
  const annual: Record<string, AnnualPeriodSummary> = {};
  const productionResolution: Record<string, ResolvedAnnualValue> = {};
  const yearlyQuarters: Array<{ period: string; quarters: AnnualForecastResult["quarterly"] }> = [];

  const henryHubPerMmbtu: SourcedValue =
    (request.customCommodity?.henryHubPerMmbtu !== undefined
      ? { value: request.customCommodity.henryHubPerMmbtu, unit: "$/MMBtu", source: { name: "User input", period: "current", retrievedAt: new Date(0).toISOString(), classification: "user", notes: "User-entered Henry Hub price." } }
      : request.liveCommodity?.henryHubPerMmbtu) ??
    { value: 2.89, unit: "$/MMBtu", source: { name: "NYMEX", period: "Q2 2026", retrievedAt: new Date(0).toISOString(), classification: "modeled", notes: "Q2 2026 NYMEX Henry Hub average held flat; no live/custom price supplied and EXE did not guide a price assumption this cycle." } };
  const wtiPerBbl: SourcedValue =
    (request.customCommodity?.wtiPerBbl !== undefined
      ? { value: request.customCommodity.wtiPerBbl, unit: "$/bbl", source: { name: "User input", period: "current", retrievedAt: new Date(0).toISOString(), classification: "user", notes: "User-entered WTI price." } }
      : request.liveCommodity?.wtiPerBbl) ??
    { value: 93.58, unit: "$/bbl", source: { name: "NYMEX", period: "Q2 2026", retrievedAt: new Date(0).toISOString(), classification: "modeled", notes: "Q2 2026 NYMEX WTI average held flat; no live/custom price supplied." } };

  for (const year of EXE_FORECAST_YEARS) {
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
    const nglPrice = resolveAnnualNglPricePerBbl(year);
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
      nglMarketingUpliftPerBbl: nglPrice.value,
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

  const startingNetDebt = exeLatestDetailedBaseline.netDebtMillion.value ?? 0;
  const netDebtByPeriod = rollForwardNetDebt(startingNetDebt, yearlyQuarters);
  for (const year of EXE_FORECAST_YEARS) {
    annual[year].endingNetDebtMillion = netDebtByPeriod[`${year}Q4`] ?? null;
  }

  const forwardYear = (request.valuation.forwardYear as ExeForecastYear) ?? "2027";
  const valuation = computeAnnualValuation({
    forwardYear,
    forwardEbitdaxMillion: annual[forwardYear]?.ebitdaxMillion ?? null,
    targetEvToEbitdax: request.valuation.targetEvToEbitdax,
    forecastEndingNetDebtMillion: netDebtByPeriod[`${forwardYear}Q4`] ?? null,
    netDebtMillionOverride: request.valuation.netDebtMillionOverride,
    dilutedSharesMillion: exeLatestDetailedBaseline.dilutedSharesMillion.value ?? 0,
    dilutedSharesMillionOverride: request.valuation.dilutedSharesMillionOverride
  });

  const dcf = computeAnnualDcf({
    annualFreeCashFlowMillion: EXE_FORECAST_YEARS.map((year, index) => ({ year: index + 1, value: annual[year].freeCashFlowMillion })),
    currentNetDebtMillion: exeLatestDetailedBaseline.netDebtMillion.value ?? 0,
    dilutedSharesMillion: exeLatestDetailedBaseline.dilutedSharesMillion.value ?? 0
  });

  notes.push(
    "EXE guides only a total FY2026 MMcfe/d production rate (7,400-7,600, mid 7,500 -- the corrected midpoint following the prior data-foundation fix), not a per-commodity split; gas/NGL/oil is derived using EXE's own Q2 2026 reported production mix ratio.",
    "EXE guides its cash cost structure component-by-component (production expense, gathering/processing/transportation -- itself a sum of a base rate plus a fair-value-liability adjustment -- severance/ad valorem taxes, G&A) plus gas/oil differentials and an absolute FY2026 NGL realization price ($22-26/bbl, mid $24/bbl, used directly) this cycle, and a total FY2026 cash-interest dollar figure.",
    "EXE's Marketing (Twin Eagle) segment is not modeled: its current Q2 2026 net margin (~$32mm/quarter) is materially smaller than the guided long-term $750mm annual run-rate target, which is an explicit forward/post-synergy figure, not a current-cycle confirmed FY2026 number -- a real, disclosed, unmodeled value item.",
    "Net debt is projected to decline dollar-for-dollar with cumulative forecast free cash flow only; dividends, buybacks, and debt issuance/repayment are not modeled."
  );

  return { quarterly, annual, productionResolution, valuation, dcf, notes };
}

export { EXE_VALUATION_PRESETS };
