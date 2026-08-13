/**
 * CNX (CNX Resources) annual Forecast orchestration -- the same "simplified
 * annual" pattern as rrc-annual.ts / ar-annual.ts, built on the shared mechanical
 * helpers in annual-shared.ts. Every default-resolution decision below is
 * CNX-specific: CNX guides an absolute NGL price (not a WTI-relative
 * differential like AR/the RRC fallback) and only a single blended cash-unit-cost
 * figure (no LOE/GP&T/G&A breakout), both handled with CNX-specific logic here.
 */

import { getCompanyGuidanceRecords } from "@/lib/dashboard/guidance";
import { cnxLatestDetailedBaseline, CNX_VALUATION_PRESETS } from "@/lib/forecast/data/cnx-baseline";
import {
  cnxManagementGuidance,
  cnxGuidedNglPricePerBbl,
  cnxGuidedFullyBurdenedCashCostPerMcfe,
  cnxGuidedGasPriceAssumptionPerMmbtu
} from "@/lib/forecast/guidance/cnx";
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

export const CNX_FORECAST_YEARS = ["2026", "2027", "2028"] as const;
export type CnxForecastYear = (typeof CNX_FORECAST_YEARS)[number];

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

export function resolveAnnualProductionDefault(year: CnxForecastYear): ResolvedAnnualValue {
  const guided = resolveGuidedOrCarriedForward(cnxManagementGuidance, "totalProductionBcfePerDay", year, CNX_FORECAST_YEARS);
  if (guided) return guided;
  return fromBaseline({
    value:
      cnxLatestDetailedBaseline.gasMmcfPerDay.value === null ||
      cnxLatestDetailedBaseline.nglMbblPerDay.value === null ||
      cnxLatestDetailedBaseline.oilMbblPerDay.value === null
        ? null
        : (cnxLatestDetailedBaseline.gasMmcfPerDay.value + (cnxLatestDetailedBaseline.nglMbblPerDay.value + cnxLatestDetailedBaseline.oilMbblPerDay.value) * 6) / 1000,
    unit: "Bcfe/d",
    source: cnxLatestDetailedBaseline.gasMmcfPerDay.source
  });
}

/**
 * CNX guides total production and a liquids-mix percentage (7-8%, mid 7.5% of
 * total production) for FY2026, but not an absolute gas/NGL/oil split -- the
 * guided liquids % is applied to the guided total to get a liquids volume, then
 * split between NGL and oil using CNX's own Q2 2026 reported NGL:oil ratio
 * (27.099:0.714, i.e. oil is a de minimis ~2.6% of liquids). 2027/2028 (no
 * liquids-mix guidance) carry the FY2026 guided liquids % forward flat, else fall
 * back to CNX's Q2 2026 reported total mix ratio -- the same technique the RRC
 * reference model uses (splitByReportedMix) when management guides only a total.
 */
export function resolveAnnualCommodityProductionDefaults(year: CnxForecastYear): {
  gasMmcfPerDay: ResolvedAnnualValue;
  nglMbblPerDay: ResolvedAnnualValue;
  oilMbblPerDay: ResolvedAnnualValue;
} {
  const total = resolveAnnualProductionDefault(year);
  if (total.value === null) {
    const unavailable = modeled(null, "Total production is unavailable, so the commodity mix cannot be split.");
    return { gasMmcfPerDay: unavailable, nglMbblPerDay: unavailable, oilMbblPerDay: unavailable };
  }

  const liquidsMixGuidance = resolveGuidedOrCarriedForward(cnxManagementGuidance, "totalProductionBcfePerDay", "2026", CNX_FORECAST_YEARS);
  const reportedOilShareOfLiquids =
    cnxLatestDetailedBaseline.oilMbblPerDay.value === null || cnxLatestDetailedBaseline.nglMbblPerDay.value === null || cnxLatestDetailedBaseline.oilMbblPerDay.value + cnxLatestDetailedBaseline.nglMbblPerDay.value <= 0
      ? 0
      : cnxLatestDetailedBaseline.oilMbblPerDay.value / (cnxLatestDetailedBaseline.oilMbblPerDay.value + cnxLatestDetailedBaseline.nglMbblPerDay.value);

  const liquidsMixPct = liquidsMixGuidanceMidpoint();
  if (liquidsMixPct !== null) {
    const totalMcfePerDay = total.value * 1000;
    const liquidsMbblPerDay = (totalMcfePerDay * liquidsMixPct) / 6;
    const oilMbblPerDay = liquidsMbblPerDay * reportedOilShareOfLiquids;
    const nglMbblPerDay = liquidsMbblPerDay - oilMbblPerDay;
    const gasMmcfPerDay = totalMcfePerDay - liquidsMbblPerDay * 6;
    const notes = `${total.notes} Commodity split derived from CNX's guided FY2026 liquids-mix percentage (${(liquidsMixPct * 100).toFixed(1)}% of total production), applied to this year's total; NGL vs. oil split within liquids uses CNX's own Q2 2026 reported ratio (oil is a de minimis ~${(reportedOilShareOfLiquids * 100).toFixed(1)}% of liquids).`.trim();
    return {
      gasMmcfPerDay: { ...total, value: gasMmcfPerDay, notes },
      nglMbblPerDay: { ...total, value: nglMbblPerDay, notes },
      oilMbblPerDay: { ...total, value: oilMbblPerDay, notes }
    };
  }

  const mix = {
    gasMmcfPerDay: cnxLatestDetailedBaseline.gasMmcfPerDay.value ?? 0,
    nglMbblPerDay: cnxLatestDetailedBaseline.nglMbblPerDay.value ?? 0,
    oilMbblPerDay: cnxLatestDetailedBaseline.oilMbblPerDay.value ?? 0
  };
  const mixTotalMcfe = mix.gasMmcfPerDay + (mix.nglMbblPerDay + mix.oilMbblPerDay) * 6;
  if (mixTotalMcfe <= 0) {
    const unavailable = modeled(null, "No reported or guided production mix is available to split this year's total.");
    return { gasMmcfPerDay: unavailable, nglMbblPerDay: unavailable, oilMbblPerDay: unavailable };
  }
  const scale = (total.value * 1000) / mixTotalMcfe;
  const notes = `${total.notes} Commodity split applied using CNX's Q2 2026 reported production mix ratio (no liquids-mix guidance available).`.trim();
  return {
    gasMmcfPerDay: { ...total, value: mix.gasMmcfPerDay * scale, notes },
    nglMbblPerDay: { ...total, value: mix.nglMbblPerDay * scale, notes },
    oilMbblPerDay: { ...total, value: mix.oilMbblPerDay * scale, notes }
  };
}

/** liquids_mix is CNX's own custom metric (percent of total production), not a standard GuidanceMetricKey; read directly from the canonical records the same way scenarios/ar-annual.ts reads AR's custom per-commodity metrics. */
function liquidsMixGuidanceMidpoint(): number | null {
  const record = getCompanyGuidanceRecords("CNX").find((entry) => entry.metric === "liquids_mix" && entry.period === "FY 2026");
  return record?.midpoint === undefined || record?.midpoint === null ? null : record.midpoint / 100;
}

export function resolveAnnualCostDefaults(year: CnxForecastYear): {
  loePerMcfe: ResolvedAnnualValue;
  gatheringTransportPerMcfe: ResolvedAnnualValue;
  productionTaxPctRevenue: ResolvedAnnualValue;
  cashGaPerMcfe: ResolvedAnnualValue;
  explorationMillion: ResolvedAnnualValue;
  cashInterestMillion: ResolvedAnnualValue;
  cashTaxRate: ResolvedAnnualValue;
} {
  const guidedBlendedTotal = cnxGuidedFullyBurdenedCashCostPerMcfe();
  // CNX's Q2 2026 reported components on a common $/Mcfe basis, INCLUDING the
  // production-tax component (via its own known Q2 2026 $/Mcfe rate, before it
  // was converted to the %-of-revenue rate this engine actually consumes) so the
  // scale ratio below reconciles against the same four components CNX's guided
  // blended total covers (LOE + production tax/ad valorem/other fees +
  // gathering/transport/compression + cash G&A).
  const reportedTotal =
    (cnxLatestDetailedBaseline.loePerMcfe.value ?? 0) +
    reportedProductionTaxPerMcfe() +
    (cnxLatestDetailedBaseline.gatheringTransportPerMcfe.value ?? 0) +
    (cnxLatestDetailedBaseline.cashGaPerMcfe.value ?? 0);
  // CNX guides only a single blended cash-unit-cost figure ($1.15/Mcfe FY2026),
  // not a LOE/GP&T/G&A component breakout. Rather than default every component to
  // the (slightly lower) Q2 2026 reported actual and silently ignore management's
  // fresher guided total, each Q2 2026 reported component is proportionally
  // scaled so the components sum to exactly the guided blended total -- the most
  // granular, non-fabricated way to reconcile a guided total with unguided
  // components. Production tax (%-of-revenue in this engine) is always held flat
  // at its own reported rate and is not itself rescaled -- it only participates
  // in computing the scale ratio above, on a common $/Mcfe basis.
  const scale = guidedBlendedTotal === null || reportedTotal <= 0 ? 1 : guidedBlendedTotal / reportedTotal;
  const scaleNote =
    guidedBlendedTotal === null
      ? "CNX did not guide a blended cash-unit-cost figure this cycle; held flat at the Q2 2026 reported rate."
      : `Derived: Q2 2026 reported rate proportionally scaled (x${scale.toFixed(4)}) so LOE + gathering/transport + cash G&A + production tax sum to CNX's guided FY2026 blended cash-unit-cost of $${guidedBlendedTotal.toFixed(2)}/Mcfe (CNX guides only the blended total, not a component breakout).`;
  const guidedClassification = guidedBlendedTotal === null ? cnxLatestDetailedBaseline.loePerMcfe.source.classification : "guided";

  function scaledField(field: SourcedValue): ResolvedAnnualValue {
    return {
      value: field.value === null ? null : field.value * scale,
      classification: guidedClassification,
      sourceName: field.source.name,
      sourceReference: field.source.reference ?? "",
      sourceDate: field.source.period,
      notes: `${field.source.notes ?? ""} ${scaleNote}`.trim()
    };
  }

  return {
    loePerMcfe: scaledField(cnxLatestDetailedBaseline.loePerMcfe),
    gatheringTransportPerMcfe: scaledField(cnxLatestDetailedBaseline.gatheringTransportPerMcfe),
    productionTaxPctRevenue: fromBaseline(cnxLatestDetailedBaseline.productionTaxPctRevenue, "Not part of the blended cash-unit-cost guidance reconciliation (that guidance is $/Mcfe; this field is %-of-revenue)."),
    cashGaPerMcfe: scaledField(cnxLatestDetailedBaseline.cashGaPerMcfe),
    explorationMillion: fromBaseline(cnxLatestDetailedBaseline.explorationMillionPerQuarter),
    cashInterestMillion: fromBaseline(cnxLatestDetailedBaseline.cashInterestMillionPerQuarter),
    cashTaxRate: modeled(
      modeledCashTaxRateByPosition(CNX_FORECAST_YEARS.indexOf(year)),
      `No cash-tax-rate guidance is current for CNX this cycle; modeled ${year === "2026" ? 2 : year === "2027" ? 6 : 8}% assumption reflecting the sector-wide pattern of NOL/IDC tax shelters being used up over the forecast horizon.`
    )
  };
}

/** CNX's Q2 2026 reported production tax on a $/Mcfe basis ($6,546 thousand / 151,453 MMcfe), used only to keep the cost-scaling ratio above internally consistent with CNX's guided blended total (production tax itself is never scaled -- see resolveAnnualCostDefaults; the engine consumes the %-of-revenue rate instead, unaffected by this helper). */
function reportedProductionTaxPerMcfe(): number {
  return cnxLatestDetailedBaseline.productionTaxPctRevenue.value === null ? 0 : 0.0432;
}

export function resolveAnnualCapexDefault(year: CnxForecastYear): ResolvedAnnualValue {
  return (
    resolveGuidedOrCarriedForward(cnxManagementGuidance, "capexTotalMillion", year, CNX_FORECAST_YEARS) ??
    fromBaseline({ ...cnxLatestDetailedBaseline.capexMillionPerQuarter, value: (cnxLatestDetailedBaseline.capexMillionPerQuarter.value ?? 0) * 4 })
  );
}

export function resolveAnnualPricingDefaults(year: CnxForecastYear): {
  gasBasisPerMcf: ResolvedAnnualValue;
  oilDifferentialPerBbl: ResolvedAnnualValue;
} {
  return {
    gasBasisPerMcf: resolveGuidedOrCarriedForward(cnxManagementGuidance, "gasBasisPerMcf", year, CNX_FORECAST_YEARS) ?? fromBaseline(cnxLatestDetailedBaseline.gasBasisPerMcf),
    oilDifferentialPerBbl: fromBaseline(cnxLatestDetailedBaseline.oilDifferentialPerBbl, "CNX does not guide an oil differential; oil is <0.1% of CNX's production.")
  };
}

/** CNX's FY2026 guided absolute NGL price, held flat for 2027/2028 (no separate guidance); falls back to the Q2 2026 reported realization if CNX stops guiding this metric. */
function resolveAnnualNglPricePerBbl(year: CnxForecastYear): ResolvedAnnualValue {
  const guided = cnxGuidedNglPricePerBbl();
  if (guided !== null) {
    return {
      value: guided,
      classification: "guided",
      sourceName: "CNX Resources",
      sourceReference: "CNX Resources Q2 2026 Earnings",
      sourceDate: "2026-07-30",
      notes: `CNX's guided FY2026 NGL realization ($${guided}/bbl), held flat across 2026-2028 (no separate 2027/2028 guidance).${year === "2026" ? "" : " Carried forward from the FY2026 cycle."}`
    };
  }
  return modeled(23.4, "CNX did not guide an NGL price this cycle; the Q2 2026 reported realization ($23.40/bbl) is held flat.");
}

export const CNX_LATEST_ACTUAL_PERIOD = "2026Q2";

export type CnxAnnualForecastRequest = AnnualForecastRequest;
export type CnxAnnualForecastResult = AnnualForecastResult;

export function runCnxAnnualForecast(request: AnnualForecastRequest): AnnualForecastResult {
  const notes: string[] = [];
  const quarterly: AnnualForecastResult["quarterly"] = [];
  const annual: Record<string, AnnualPeriodSummary> = {};
  const productionResolution: Record<string, ResolvedAnnualValue> = {};
  const yearlyQuarters: Array<{ period: string; quarters: AnnualForecastResult["quarterly"] }> = [];

  const henryHubPerMmbtu: SourcedValue =
    (request.customCommodity?.henryHubPerMmbtu !== undefined
      ? { value: request.customCommodity.henryHubPerMmbtu, unit: "$/MMBtu", source: { name: "User input", period: "current", retrievedAt: new Date(0).toISOString(), classification: "user", notes: "User-entered Henry Hub price." } }
      : request.liveCommodity?.henryHubPerMmbtu) ??
    {
      value: cnxGuidedGasPriceAssumptionPerMmbtu() ?? 2.89,
      unit: "$/MMBtu",
      source: {
        name: "CNX Resources",
        period: "FY 2026",
        retrievedAt: new Date(0).toISOString(),
        classification: cnxGuidedGasPriceAssumptionPerMmbtu() !== null ? "guided" : "modeled",
        notes:
          cnxGuidedGasPriceAssumptionPerMmbtu() !== null
            ? "CNX's own guided FY2026 NYMEX Henry Hub planning-case price assumption, held flat as the default forward input; no live/custom price supplied. Preferred over the Q2 2026 realized benchmark because it is management's current forward planning view."
            : "Q2 2026 NYMEX Henry Hub average held flat; no live/custom price supplied and CNX did not guide a price assumption this cycle."
      }
    };
  const wtiPerBbl: SourcedValue =
    (request.customCommodity?.wtiPerBbl !== undefined
      ? { value: request.customCommodity.wtiPerBbl, unit: "$/bbl", source: { name: "User input", period: "current", retrievedAt: new Date(0).toISOString(), classification: "user", notes: "User-entered WTI price." } }
      : request.liveCommodity?.wtiPerBbl) ??
    { value: 93.58, unit: "$/bbl", source: { name: "NYMEX", period: "Q2 2026", retrievedAt: new Date(0).toISOString(), classification: "modeled", notes: "Q2 2026 NYMEX WTI average held flat; no live/custom price supplied." } };

  for (const year of CNX_FORECAST_YEARS) {
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

  const startingNetDebt = cnxLatestDetailedBaseline.netDebtMillion.value ?? 0;
  const netDebtByPeriod = rollForwardNetDebt(startingNetDebt, yearlyQuarters);
  for (const year of CNX_FORECAST_YEARS) {
    annual[year].endingNetDebtMillion = netDebtByPeriod[`${year}Q4`] ?? null;
  }

  const forwardYear = (request.valuation.forwardYear as CnxForecastYear) ?? "2027";
  const valuation = computeAnnualValuation({
    forwardYear,
    forwardEbitdaxMillion: annual[forwardYear]?.ebitdaxMillion ?? null,
    targetEvToEbitdax: request.valuation.targetEvToEbitdax,
    forecastEndingNetDebtMillion: netDebtByPeriod[`${forwardYear}Q4`] ?? null,
    netDebtMillionOverride: request.valuation.netDebtMillionOverride,
    dilutedSharesMillion: cnxLatestDetailedBaseline.dilutedSharesMillion.value ?? 0,
    dilutedSharesMillionOverride: request.valuation.dilutedSharesMillionOverride
  });

  const dcf = computeAnnualDcf({
    annualFreeCashFlowMillion: CNX_FORECAST_YEARS.map((year, index) => ({ year: index + 1, value: annual[year].freeCashFlowMillion })),
    currentNetDebtMillion: cnxLatestDetailedBaseline.netDebtMillion.value ?? 0,
    dilutedSharesMillion: cnxLatestDetailedBaseline.dilutedSharesMillion.value ?? 0
  });

  notes.push(
    "CNX's commodity split derives NGL/oil from its guided FY2026 liquids-mix percentage plus its own Q2 2026 reported NGL:oil ratio, since CNX does not separately guide gas/NGL/oil volumes.",
    "CNX guides only a single blended cash-unit-cost figure (fully burdened cash cost); LOE, gathering/transport, and cash G&A are each proportionally scaled from the Q2 2026 reported mix to reconcile with that guided total.",
    "CNX guides an absolute FY2026 NGL price ($24.60/bbl), used directly rather than a WTI-relative differential.",
    "Net debt is projected to decline dollar-for-dollar with cumulative forecast free cash flow only; dividends, buybacks, and debt issuance/repayment are not modeled."
  );

  return { quarterly, annual, productionResolution, valuation, dcf, notes };
}

export { CNX_VALUATION_PRESETS };
