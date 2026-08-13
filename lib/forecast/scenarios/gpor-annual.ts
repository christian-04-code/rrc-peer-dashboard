/**
 * GPOR (Gulfport Energy) annual Forecast orchestration -- the same "simplified
 * annual" pattern as rrc-annual.ts / ar-annual.ts / cnx-annual.ts / eqt-annual.ts
 * / crk-annual.ts / exe-annual.ts, built on the shared mechanical helpers in
 * annual-shared.ts. GPOR guides production directly as a daily Bcfe/d rate (no
 * unit conversion needed) and a combined liquids (NGL + oil) sales volume that
 * splits from the guided total using GPOR's own Q2 2026 reported NGL:oil ratio
 * within liquids -- the same "guided combined liquids, split by reported intra-
 * liquids ratio" technique eqt-annual.ts uses for EQT. GPOR guides its cash cost
 * structure component-by-component (LOE, gathering/processing/transportation/
 * compression, taxes other than income, cash G&A) plus gas/oil differentials and
 * an NGL realization guided directly as a %-of-WTI this cycle. GPOR does not
 * guide an interest-expense figure or a standard-basis cash-tax rate this cycle.
 *
 * CAPEX: GPOR's default capex uses ONLY the $430mm base operated program
 * (capex_base_operated) -- the separately-guided $140mm discretionary acreage
 * program is explicitly "additional" per management's own wording and is never
 * silently summed into the default (see guidance/gpor.ts's buildCapexTotalEntry
 * and gporGuidedDiscretionaryAcreageCapexMillion for the full commitment-logic
 * rationale). A user can model the combined $570mm scenario via a capex override.
 */

import { gporLatestDetailedBaseline, GPOR_VALUATION_PRESETS } from "@/lib/forecast/data/gpor-baseline";
import { gporManagementGuidance, gporGuidedLiquidsMbblPerDay, gporGuidedNglRealizationPctOfWti } from "@/lib/forecast/guidance/gpor";
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

export const GPOR_FORECAST_YEARS = ["2026", "2027", "2028"] as const;
export type GporForecastYear = (typeof GPOR_FORECAST_YEARS)[number];

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

export function resolveAnnualProductionDefault(year: GporForecastYear): ResolvedAnnualValue {
  const guided = resolveGuidedOrCarriedForward(gporManagementGuidance, "totalProductionBcfePerDay", year, GPOR_FORECAST_YEARS);
  if (guided) return guided;
  return fromBaseline({
    value:
      gporLatestDetailedBaseline.gasMmcfPerDay.value === null ||
      gporLatestDetailedBaseline.nglMbblPerDay.value === null ||
      gporLatestDetailedBaseline.oilMbblPerDay.value === null
        ? null
        : (gporLatestDetailedBaseline.gasMmcfPerDay.value + (gporLatestDetailedBaseline.nglMbblPerDay.value + gporLatestDetailedBaseline.oilMbblPerDay.value) * 6) / 1000,
    unit: "Bcfe/d",
    source: gporLatestDetailedBaseline.gasMmcfPerDay.source
  });
}

/**
 * GPOR guides a combined FY2026 liquids (NGL + oil) sales volume (18.0-21.0
 * MBbl/d, mid 19.5) but not a separate gas volume or an NGL:oil split within
 * that. Gas is derived as this year's guided/resolved total less the guided
 * liquids volume; NGL vs. oil within liquids uses GPOR's own Q2 2026 reported
 * ratio -- the same technique eqt-annual.ts uses for EQT. 2027/2028 (no liquids
 * guidance) carry the FY2026 guided liquids rate forward flat; if no liquids
 * guidance exists at all, falls back to GPOR's Q2 2026 reported production mix.
 */
export function resolveAnnualCommodityProductionDefaults(year: GporForecastYear): {
  gasMmcfPerDay: ResolvedAnnualValue;
  nglMbblPerDay: ResolvedAnnualValue;
  oilMbblPerDay: ResolvedAnnualValue;
} {
  const total = resolveAnnualProductionDefault(year);
  if (total.value === null) {
    const unavailable = modeled(null, "Total production is unavailable, so the commodity mix cannot be split.");
    return { gasMmcfPerDay: unavailable, nglMbblPerDay: unavailable, oilMbblPerDay: unavailable };
  }

  const reportedNglShareOfLiquids =
    gporLatestDetailedBaseline.nglMbblPerDay.value === null || gporLatestDetailedBaseline.oilMbblPerDay.value === null || gporLatestDetailedBaseline.nglMbblPerDay.value + gporLatestDetailedBaseline.oilMbblPerDay.value <= 0
      ? 0
      : gporLatestDetailedBaseline.nglMbblPerDay.value / (gporLatestDetailedBaseline.nglMbblPerDay.value + gporLatestDetailedBaseline.oilMbblPerDay.value);

  const liquidsMbblPerDay = gporGuidedLiquidsMbblPerDay();
  if (liquidsMbblPerDay !== null) {
    const totalMcfePerDay = total.value * 1000;
    const nglMbblPerDay = liquidsMbblPerDay * reportedNglShareOfLiquids;
    const oilMbblPerDay = liquidsMbblPerDay - nglMbblPerDay;
    const gasMmcfPerDay = totalMcfePerDay - liquidsMbblPerDay * 6;
    const notes = `${total.notes} Commodity split derived from GPOR's guided FY2026 combined liquids (NGL + oil) sales volume (${liquidsMbblPerDay.toFixed(1)} Mbbl/d), applied to this year's total; NGL vs. oil split within liquids uses GPOR's own Q2 2026 reported ratio (${(reportedNglShareOfLiquids * 100).toFixed(1)}% NGL).`.trim();
    return {
      gasMmcfPerDay: { ...total, value: gasMmcfPerDay, notes },
      nglMbblPerDay: { ...total, value: nglMbblPerDay, notes },
      oilMbblPerDay: { ...total, value: oilMbblPerDay, notes }
    };
  }

  const mix = {
    gasMmcfPerDay: gporLatestDetailedBaseline.gasMmcfPerDay.value ?? 0,
    nglMbblPerDay: gporLatestDetailedBaseline.nglMbblPerDay.value ?? 0,
    oilMbblPerDay: gporLatestDetailedBaseline.oilMbblPerDay.value ?? 0
  };
  const mixTotalMcfe = mix.gasMmcfPerDay + (mix.nglMbblPerDay + mix.oilMbblPerDay) * 6;
  if (mixTotalMcfe <= 0) {
    const unavailable = modeled(null, "No reported or guided production mix is available to split this year's total.");
    return { gasMmcfPerDay: unavailable, nglMbblPerDay: unavailable, oilMbblPerDay: unavailable };
  }
  const scale = (total.value * 1000) / mixTotalMcfe;
  const notes = `${total.notes} Commodity split applied using GPOR's Q2 2026 reported production mix ratio (no liquids-volume guidance available).`.trim();
  return {
    gasMmcfPerDay: { ...total, value: mix.gasMmcfPerDay * scale, notes },
    nglMbblPerDay: { ...total, value: mix.nglMbblPerDay * scale, notes },
    oilMbblPerDay: { ...total, value: mix.oilMbblPerDay * scale, notes }
  };
}

export function resolveAnnualCostDefaults(year: GporForecastYear): {
  loePerMcfe: ResolvedAnnualValue;
  gatheringTransportPerMcfe: ResolvedAnnualValue;
  productionTaxPctRevenue: ResolvedAnnualValue;
  cashGaPerMcfe: ResolvedAnnualValue;
  explorationMillion: ResolvedAnnualValue;
  cashInterestMillion: ResolvedAnnualValue;
  cashTaxRate: ResolvedAnnualValue;
} {
  return {
    loePerMcfe: resolveGuidedOrCarriedForward(gporManagementGuidance, "loePerMcfe", year, GPOR_FORECAST_YEARS) ?? fromBaseline(gporLatestDetailedBaseline.loePerMcfe),
    gatheringTransportPerMcfe: resolveGuidedOrCarriedForward(gporManagementGuidance, "gatheringTransportPerMcfe", year, GPOR_FORECAST_YEARS) ?? fromBaseline(gporLatestDetailedBaseline.gatheringTransportPerMcfe),
    productionTaxPctRevenue: resolveGuidedOrCarriedForward(gporManagementGuidance, "productionTaxPerMcfe", year, GPOR_FORECAST_YEARS) ?? fromBaseline(gporLatestDetailedBaseline.productionTaxPctRevenue),
    cashGaPerMcfe: resolveGuidedOrCarriedForward(gporManagementGuidance, "cashGaPerMcfe", year, GPOR_FORECAST_YEARS) ?? fromBaseline(gporLatestDetailedBaseline.cashGaPerMcfe),
    explorationMillion: fromBaseline(gporLatestDetailedBaseline.explorationMillionPerQuarter),
    cashInterestMillion: fromBaseline(gporLatestDetailedBaseline.cashInterestMillionPerQuarter, "GPOR does not guide an interest-expense figure this cycle."),
    cashTaxRate: modeled(
      modeledCashTaxRateByPosition(GPOR_FORECAST_YEARS.indexOf(year)),
      `GPOR's only current cash-tax guidance (cash_tax_outlook: "10% of cumulative 5-yr Adjusted FCF") is on a cumulative multi-year basis, not this engine's annual %-of-EBITDAX/pretax-income convention, so it is not mapped directly; modeled ${year === "2026" ? 2 : year === "2027" ? 6 : 8}% assumption reflecting the sector-wide pattern of NOL/IDC tax shelters being used up over the forecast horizon.`
    )
  };
}

/** GPOR's default capex uses ONLY the guided $430mm base operated program -- the separately-guided $140mm discretionary acreage program is explicitly incremental and never silently summed in (see guidance/gpor.ts). */
export function resolveAnnualCapexDefault(year: GporForecastYear): ResolvedAnnualValue {
  return (
    resolveGuidedOrCarriedForward(gporManagementGuidance, "capexTotalMillion", year, GPOR_FORECAST_YEARS) ??
    fromBaseline({ ...gporLatestDetailedBaseline.capexMillionPerQuarter, value: (gporLatestDetailedBaseline.capexMillionPerQuarter.value ?? 0) * 4 })
  );
}

export function resolveAnnualPricingDefaults(year: GporForecastYear): {
  gasBasisPerMcf: ResolvedAnnualValue;
  oilDifferentialPerBbl: ResolvedAnnualValue;
} {
  return {
    gasBasisPerMcf: resolveGuidedOrCarriedForward(gporManagementGuidance, "gasBasisPerMcf", year, GPOR_FORECAST_YEARS) ?? fromBaseline(gporLatestDetailedBaseline.gasBasisPerMcf),
    oilDifferentialPerBbl: resolveGuidedOrCarriedForward(gporManagementGuidance, "oilDifferentialPerBbl", year, GPOR_FORECAST_YEARS) ?? fromBaseline(gporLatestDetailedBaseline.oilDifferentialPerBbl)
  };
}

/** GPOR's FY2026 guided NGL realization, guided directly as a %-of-WTI (40-50%, mid 45%) -- used directly (unlike CNX/EXE's absolute guided prices). Falls back to GPOR's Q2 2026 reported WTI-relative realization if GPOR stops guiding this metric. */
function resolveAnnualNglRealizationPctOfWti(year: GporForecastYear): ResolvedAnnualValue {
  const guided = gporGuidedNglRealizationPctOfWti();
  if (guided !== null) {
    return {
      value: guided,
      classification: "guided",
      sourceName: "Gulfport Energy Corporation",
      sourceReference: "GPOR Q2 2026 Earnings (ngl_realized_price guidance)",
      sourceDate: "2026-08-03",
      notes: `GPOR's guided FY2026 NGL realization (${(guided * 100).toFixed(1)}% of WTI), held flat across 2026-2028 (no separate 2027/2028 guidance).${year === "2026" ? "" : " Carried forward from the FY2026 cycle."}`
    };
  }
  return fromBaseline(gporLatestDetailedBaseline.nglRealizationPctOfWti, "GPOR did not guide an NGL realization this cycle.");
}

export const GPOR_LATEST_ACTUAL_PERIOD = "2026Q2";

export type GporAnnualForecastRequest = AnnualForecastRequest;
export type GporAnnualForecastResult = AnnualForecastResult;

export function runGporAnnualForecast(request: AnnualForecastRequest): AnnualForecastResult {
  const notes: string[] = [];
  const quarterly: AnnualForecastResult["quarterly"] = [];
  const annual: Record<string, AnnualPeriodSummary> = {};
  const productionResolution: Record<string, ResolvedAnnualValue> = {};
  const yearlyQuarters: Array<{ period: string; quarters: AnnualForecastResult["quarterly"] }> = [];

  const henryHubPerMmbtu: SourcedValue =
    (request.customCommodity?.henryHubPerMmbtu !== undefined
      ? { value: request.customCommodity.henryHubPerMmbtu, unit: "$/MMBtu", source: { name: "User input", period: "current", retrievedAt: new Date(0).toISOString(), classification: "user", notes: "User-entered Henry Hub price." } }
      : request.liveCommodity?.henryHubPerMmbtu) ??
    { value: 2.89, unit: "$/MMBtu", source: { name: "NYMEX", period: "Q2 2026", retrievedAt: new Date(0).toISOString(), classification: "modeled", notes: "Q2 2026 NYMEX Henry Hub average held flat; no live/custom price supplied and GPOR did not guide a price assumption this cycle." } };
  const wtiPerBbl: SourcedValue =
    (request.customCommodity?.wtiPerBbl !== undefined
      ? { value: request.customCommodity.wtiPerBbl, unit: "$/bbl", source: { name: "User input", period: "current", retrievedAt: new Date(0).toISOString(), classification: "user", notes: "User-entered WTI price." } }
      : request.liveCommodity?.wtiPerBbl) ??
    { value: 93.58, unit: "$/bbl", source: { name: "NYMEX", period: "Q2 2026", retrievedAt: new Date(0).toISOString(), classification: "modeled", notes: "Q2 2026 NYMEX WTI average held flat; no live/custom price supplied." } };

  for (const year of GPOR_FORECAST_YEARS) {
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
    const nglRealizationPctOfWti = resolveAnnualNglRealizationPctOfWti(year);
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
      nglRealizationPctOfWti: nglRealizationPctOfWti.value,
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

  const startingNetDebt = gporLatestDetailedBaseline.netDebtMillion.value ?? 0;
  const netDebtByPeriod = rollForwardNetDebt(startingNetDebt, yearlyQuarters);
  for (const year of GPOR_FORECAST_YEARS) {
    annual[year].endingNetDebtMillion = netDebtByPeriod[`${year}Q4`] ?? null;
  }

  const forwardYear = (request.valuation.forwardYear as GporForecastYear) ?? "2027";
  const valuation = computeAnnualValuation({
    forwardYear,
    forwardEbitdaxMillion: annual[forwardYear]?.ebitdaxMillion ?? null,
    targetEvToEbitdax: request.valuation.targetEvToEbitdax,
    forecastEndingNetDebtMillion: netDebtByPeriod[`${forwardYear}Q4`] ?? null,
    netDebtMillionOverride: request.valuation.netDebtMillionOverride,
    dilutedSharesMillion: gporLatestDetailedBaseline.dilutedSharesMillion.value ?? 0,
    dilutedSharesMillionOverride: request.valuation.dilutedSharesMillionOverride
  });

  const dcf = computeAnnualDcf({
    annualFreeCashFlowMillion: GPOR_FORECAST_YEARS.map((year, index) => ({ year: index + 1, value: annual[year].freeCashFlowMillion })),
    currentNetDebtMillion: gporLatestDetailedBaseline.netDebtMillion.value ?? 0,
    dilutedSharesMillion: gporLatestDetailedBaseline.dilutedSharesMillion.value ?? 0
  });

  notes.push(
    "GPOR's commodity split derives gas as the guided total less its guided FY2026 combined liquids (NGL + oil) sales volume; NGL vs. oil within liquids uses GPOR's own Q2 2026 reported ratio.",
    "GPOR guides its cash cost structure component-by-component (LOE, gathering/processing/transportation/compression, taxes other than income, cash G&A) -- each used directly.",
    "GPOR's default capex uses ONLY the guided $430mm base operated program. GPOR separately guides a $140mm FY2026 discretionary acreage acquisition program that management's own Q2 2026 earnings release describes as \"additional\" to the base program -- explicitly incremental, not included by default. A combined $570mm total-2026-capital-outlay scenario can be modeled via a capex override, but is never silently assumed.",
    "GPOR does not guide an interest-expense figure this cycle, so cash interest defaults to its Q2 2026 reported actual, held flat. GPOR's only current cash-tax guidance (10% of cumulative 5-year Adjusted FCF) is on a cumulative multi-year basis incompatible with this engine's annual-rate convention, so cash tax rate defaults to the sector-wide modeled ramp instead.",
    "Net debt is projected to decline dollar-for-dollar with cumulative forecast free cash flow only; dividends, buybacks, and debt issuance/repayment are not modeled."
  );

  return { quarterly, annual, productionResolution, valuation, dcf, notes };
}

export { GPOR_VALUATION_PRESETS };
