import { rrcQ1_2026Baseline } from "@/lib/forecast/data/rrc-baseline";
import { rrcHedgeBookQ1_2026 } from "@/lib/forecast/data/rrc-hedges";
import { FORECAST_ENGINE_VERSION, runForecastScenario } from "@/lib/forecast/engine";
import { rollForwardBalanceSheet } from "@/lib/forecast/balance-sheet";
import { rrcManagementGuidance } from "@/lib/forecast/guidance/rrc";
import { findGuidance, type GuidanceMetricKey, type GuidanceYear } from "@/lib/forecast/guidance/types";
import {
  buildFlatProductionForecast,
  toProductionAssumptions,
  type FlatProductionPeriodResult,
  type ProductionBeginningState,
  type ProductionOverrideInput
} from "@/lib/forecast/production-engine";
import type {
  AssumptionClassification,
  ForecastPeriodAssumptions,
  ForecastScenario,
  SourcedValue
} from "@/lib/forecast/types";

export type RrcPost2027Strategy = "maintenance" | "continued-growth";
export type { ProductionOverrideInput } from "@/lib/forecast/production-engine";

/**
 * Explicit commodity price inputs for this scenario run. Used by both the CURRENT
 * MARKET flow (live-market-prices.ts, classification "live") and the CUSTOM flow (UI
 * user entry, classification "user") -- the shape is the injection point, not a claim
 * about where the numbers came from; each SourcedValue carries its own classification.
 * nglPerBbl is a direct $/bbl realization; when supplied it is divided by the resolved
 * WTI price to populate the engine's existing nglRealizationPctOfWti field rather than
 * adding a second NGL pricing mechanism to the engine.
 */
export type RrcCurrentMarketPrices = {
  henryHubPerMmbtu?: SourcedValue;
  wtiPerBbl?: SourcedValue;
  nglPerBbl?: SourcedValue;
};

export type RrcAnnualYear = "2026" | "2027" | "2028";

/**
 * Explicit per-year overrides for cost and capex assumptions. Omitted fields fall back
 * to the existing default resolution (management guidance midpoint when it exists,
 * otherwise the prior modeled/reported anchor) -- additive and backward compatible with
 * every caller that does not pass annualOverrides.
 */
export type RrcAnnualOverride = {
  loePerMcfe?: SourcedValue;
  gatheringTransportPerMcfe?: SourcedValue;
  cashGaMillion?: SourcedValue;
  explorationMillion?: SourcedValue;
  cashInterestMillion?: SourcedValue;
  cashTaxRate?: SourcedValue;
  capexTotalMillion?: SourcedValue;
  /** Realized gas price = Henry Hub + this differential (sign exactly as disclosed, e.g. a guided "NYMEX minus $0.35-$0.45/Mcf" resolves to -0.40). */
  gasBasisPerMcf?: SourcedValue;
  /** Realized oil price = WTI + this differential (sign exactly as disclosed). */
  oilDifferentialPerBbl?: SourcedValue;
};

export type RrcAnnualOverrides = Partial<Record<RrcAnnualYear, RrcAnnualOverride>>;

export type RrcCompleteScenarioOptions = {
  productionOverrides?: ProductionOverrideInput[];
  currentMarketPrices?: RrcCurrentMarketPrices;
  annualOverrides?: RrcAnnualOverrides;
};

/** The only reported production anchor this scenario uses: the latest 10-Q baseline, held flat unless overridden. */
export const latestReportedProduction: ProductionBeginningState = {
  period: rrcQ1_2026Baseline.period.replace("-", ""),
  gasMmcfPerDay: rrcQ1_2026Baseline.naturalGasMmcfPerDay,
  nglMbblPerDay: rrcQ1_2026Baseline.nglMbblPerDay,
  oilMbblPerDay: rrcQ1_2026Baseline.oilMbblPerDay
};

export type RrcCompleteScenarioResult = {
  scenario: ForecastScenario;
  forecast: ReturnType<typeof runForecastScenario>;
  balanceSheet: ReturnType<typeof rollForwardBalanceSheet>[];
  notes: string[];
};

const SOURCE_DATE = "2026-08-04";

function value(params: {
  value: number | null;
  unit: string;
  period: string;
  classification: AssumptionClassification;
  name: string;
  reference: string;
  notes: string;
}): SourcedValue {
  return {
    value: params.value,
    unit: params.unit,
    source: {
      name: params.name,
      reference: params.reference,
      period: params.period,
      retrievedAt: SOURCE_DATE,
      classification: params.classification,
      notes: params.notes
    }
  };
}

function unavailable(unit: string, period: string, notes: string): SourcedValue {
  return value({
    value: null,
    unit,
    period,
    classification: "modeled",
    name: "RRC Peer Dashboard",
    reference: "Unsupported input",
    notes
  });
}

/**
 * Looks up a management-guided pricing differential midpoint for a given year, using the
 * sign exactly as disclosed (e.g. a guided "NYMEX minus $0.35-$0.45/Mcf" range resolves to
 * a -0.40 midpoint, matching guidance/rrc.ts's stored low/high). Returns null when RRC did
 * not guide that metric for that year, so the caller falls back to the existing
 * modeled/reported anchor rather than fabricating a guided figure.
 */
function guidedDifferentialValue(metric: GuidanceMetricKey, year: GuidanceYear, unit: string, period: string): SourcedValue | null {
  const guidance = findGuidance(rrcManagementGuidance, metric, year);
  if (!guidance || guidance.midpoint === null) return null;
  const rangeText = guidance.low !== null && guidance.high !== null ? ` Midpoint of the guided ${guidance.low} to ${guidance.high} ${unit} range.` : "";
  return value({
    value: guidance.midpoint,
    unit,
    period,
    classification: "guided",
    name: guidance.sourceName,
    reference: guidance.sourceReference,
    notes: `${guidance.notes ?? ""}${rangeText}`.trim()
  });
}

export function quarterDays(period: string): number {
  const year = Number(period.slice(0, 4));
  const quarter = Number(period.slice(-1));
  if (quarter === 1) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 91 : 90;
  }
  return quarter === 2 ? 91 : 92;
}

/** Guided 2026 capital category mix ($mm): $500 maintenance D&C + $130 growth D&C (mid of $120-140MM) + $25 land/acreage (mid of $15-35MM) + $20 facilities (mid of $15-25MM) = $675MM, matching the guided 2026 total capex midpoint exactly. This is the ONLY year RRC discloses a category-level capex breakdown. */
const GUIDED_2026_CAPEX_SPLIT = { maintenance: 500, growth: 130, land: 25, facilities: 20 };
const GUIDED_2026_CAPEX_TOTAL =
  GUIDED_2026_CAPEX_SPLIT.maintenance +
  GUIDED_2026_CAPEX_SPLIT.growth +
  GUIDED_2026_CAPEX_SPLIT.land +
  GUIDED_2026_CAPEX_SPLIT.facilities;

/** Default annual total capex ($mm) absent an explicit override: the guided 2026-2027 range midpoint, or the 2028 maintenance/growth case. */
function defaultAnnualCapexMillion(year: number, strategy: RrcPost2027Strategy): { value: number; classification: AssumptionClassification; notes: string } {
  if (year <= 2027) {
    return { value: GUIDED_2026_CAPEX_TOTAL, classification: "guided", notes: "Midpoint of the guided $650-$700MM 2026 (and 2026-2027 annual) capital budget range." };
  }
  if (strategy === "maintenance") {
    return { value: 600, classification: "guided", notes: "Guided 2028+ long-term maintenance D&C case (~$600MM/year)." };
  }
  return { value: 675, classification: "modeled", notes: "No 2028 continued-growth capital figure is guided; this scenario models it as a continuation of the 2026-2027 capital level." };
}

type CapexCategorySplit = { maintenance: number; growth: number; land: number; facilities: number };

/**
 * Returns the source-backed capex category breakdown for a year/strategy, or null when no
 * such breakdown exists. Never scales or reuses another year's proportions against an
 * arbitrary total: this is consulted ONLY when the period is using the unmodified default
 * annual total (see periodAssumptions below) -- the moment a caller overrides the total,
 * there is no longer a disclosed split for that specific number, so the category fields
 * fall back to unsupported/null rather than an invented proportional estimate.
 *   - 2026: RRC discloses the full maintenance/growth/land/facilities breakdown.
 *   - 2028 maintenance strategy: RRC's "2028+ Maintenance D&C: ~$600MM annually" figure IS
 *     the maintenance category by definition; growth/land/facilities are not addressed and
 *     stay null rather than being assumed to be zero.
 *   - Everything else (2027; 2028 continued-growth): no category-level guidance exists.
 */
function sourceBackedCapexCategories(year: number, strategy: RrcPost2027Strategy): Partial<CapexCategorySplit> | null {
  if (year === 2026) return { ...GUIDED_2026_CAPEX_SPLIT };
  if (year >= 2028 && strategy === "maintenance") return { maintenance: 600 };
  return null;
}

function periodAssumptions(
  flatProduction: FlatProductionPeriodResult,
  strategy: RrcPost2027Strategy,
  currentMarketPrices?: RrcCurrentMarketPrices,
  annualOverrides?: RrcAnnualOverrides
): ForecastPeriodAssumptions {
  const period = flatProduction.period;
  const isQ1Actual = period === "2026Q1";
  const year = Number(period.slice(0, 4));
  const yearKey = period.slice(0, 4) as RrcAnnualYear;
  const annualOverride = annualOverrides?.[yearKey];

  const resolvedWti: SourcedValue = currentMarketPrices?.wtiPerBbl ?? value({
    value: 65,
    unit: "$/bbl",
    period,
    classification: "modeled",
    name: "Range Resources management sensitivity case",
    reference: "Range Resources April 2026 presentation",
    notes: "Benchmark assumption. No current market price was supplied for this run. RRC (gas-weighted) does not publish a WTI guidance case."
  });
  const resolvedHenryHub: SourcedValue = currentMarketPrices?.henryHubPerMmbtu ?? value({
    value: 3.75,
    unit: "$/MMBtu",
    period,
    classification: "guided",
    name: "Range Resources management guidance (Q1 2026)",
    reference: "Peer Comp Site 1Q26 Guidance",
    notes: "Management's stated NYMEX natural gas pricing case behind its 2026-2027 cumulative free-cash-flow target. Not a realized price or a current-market quote; used only as the default when no current-market or custom price was supplied for this run."
  });
  const resolvedNglRealizationPctOfWti: SourcedValue = currentMarketPrices?.nglPerBbl
    ? (() => {
        const nglPerBbl = currentMarketPrices.nglPerBbl as SourcedValue;
        const wtiValue = resolvedWti.value;
        const pct = nglPerBbl.value === null || wtiValue === null || wtiValue === 0
          ? null
          : nglPerBbl.value / wtiValue;
        return {
          value: pct,
          unit: "decimal",
          source: {
            ...nglPerBbl.source,
            period,
            notes: `Derived by dividing the supplied NGL realization ($${nglPerBbl.value ?? "n/a"}/bbl) by the resolved WTI price ($${wtiValue ?? "n/a"}/bbl) to populate the engine's existing NGL-percent-of-WTI field, rather than adding a second NGL pricing mechanism. ${nglPerBbl.source.notes ?? ""}`.trim()
          }
        };
      })()
    : value({
        value: 24 / 65,
        unit: "decimal",
        period,
        classification: "guided",
        name: "Range Resources management guidance (Q1 2026)",
        reference: "Peer Comp Site 1Q26 Guidance",
        notes: "Derived from management's stated $24/bbl NGL realization case divided by its $65/bbl WTI working assumption (WTI itself is not guided by RRC)."
      });

  return {
    period,
    days: quarterDays(period),
    commodity: {
      henryHubPerMmbtu: resolvedHenryHub,
      wtiPerBbl: resolvedWti,
      nglRealizationPctOfWti: resolvedNglRealizationPctOfWti
    },
    pricing: {
      gasBasisPerMcf: isQ1Actual
        ? value({
            value: 0.18,
            unit: "$/Mcf",
            period,
            classification: "reported",
            name: "Range Resources",
            reference: "Q1 2026 Form 10-Q realized-pricing disclosure",
            notes: "Reported Q1 2026 premium to NYMEX including basis hedges. Historical actual; never overridden by guidance or a user assumption."
          })
        : annualOverride?.gasBasisPerMcf ??
          guidedDifferentialValue("gasBasisPerMcf", yearKey, "$/Mcf", period) ??
          value({
            value: 0.18,
            unit: "$/Mcf",
            period,
            classification: "modeled",
            name: "Range Resources",
            reference: "Q1 2026 Form 10-Q realized-pricing disclosure",
            notes: `Uses the Q1 2026 premium to NYMEX including basis hedges as the forward anchor, held flat; RRC did not guide a gas differential for ${year}.`
          }),
      gasTransportMarketingPerMcf: value({
        value: 0,
        unit: "$/Mcf",
        period,
        classification: "modeled",
        name: "RRC Peer Dashboard",
        reference: "Scenario convention",
        notes: "No separate transport/marketing pricing adjustment is added because the basis anchor already reflects realized pricing context."
      }),
      gasHedgeImpactPerMcf: value({
        value: 0,
        unit: "$/Mcf",
        period,
        classification: "modeled",
        name: "RRC Peer Dashboard",
        reference: rrcHedgeBookQ1_2026.source,
        notes: "Set to zero until contract-level hedge rows are loaded; not a claim that hedge impact is economically zero."
      }),
      nglMarketingUpliftPerBbl: value({
        value: 0,
        unit: "$/bbl",
        period,
        classification: "modeled",
        name: "RRC Peer Dashboard",
        reference: "Scenario convention",
        notes: "NGL realization is already embedded in the benchmark percentage."
      }),
      nglHedgeImpactPerBbl: value({
        value: 0,
        unit: "$/bbl",
        period,
        classification: "modeled",
        name: "RRC Peer Dashboard",
        reference: "No source-backed NGL hedge impact loaded",
        notes: "No separate NGL hedge adjustment applied."
      }),
      oilDifferentialPerBbl: isQ1Actual
        ? value({
            value: -10.68,
            unit: "$/bbl",
            period,
            classification: "reported",
            name: "Range Resources",
            reference: "Q1 2026 Form 10-Q realized-pricing disclosure",
            notes: "Reported Q1 2026 oil differential to WTI. Historical actual; never overridden by guidance or a user assumption."
          })
        : annualOverride?.oilDifferentialPerBbl ??
          guidedDifferentialValue("oilDifferentialPerBbl", yearKey, "$/bbl", period) ??
          value({
            value: -10.68,
            unit: "$/bbl",
            period,
            classification: "modeled",
            name: "Range Resources",
            reference: "Q1 2026 Form 10-Q realized-pricing disclosure",
            notes: `Uses the Q1 2026 oil differential as the forward anchor, held flat; RRC did not guide an oil differential for ${year}.`
          }),
      oilHedgeImpactPerBbl: value({
        value: 0,
        unit: "$/bbl",
        period,
        classification: "modeled",
        name: "RRC Peer Dashboard",
        reference: "No source-backed oil hedge impact loaded",
        notes: "No separate oil hedge adjustment applied."
      })
    },
    production: toProductionAssumptions(flatProduction),
    costs: {
      loePerMcfe: isQ1Actual
        ? value({
            value: 0.14,
            unit: "$/Mcfe",
            period,
            classification: "reported",
            name: "Range Resources",
            reference: "Q1 2026 Form 10-Q",
            notes: "Reported Q1 2026 direct operating expense per Mcfe. Historical actual; never overridden by guidance or a user assumption."
          })
        : annualOverride?.loePerMcfe ?? value({
            value: 0.15,
            unit: "$/Mcfe",
            period,
            classification: "guided",
            name: "Range Resources management guidance (Q1 2026)",
            reference: "Peer Comp Site 1Q26 Guidance",
            notes: "Midpoint of the guided $0.14-$0.16/Mcfe 2026 LOE range, held flat; RRC did not issue separate 2027/2028 LOE guidance."
          }),
      gatheringTransportPerMcfe: annualOverride?.gatheringTransportPerMcfe ?? value({
        value: 1.63,
        unit: "$/Mcfe",
        period,
        classification: isQ1Actual ? "reported" : "modeled",
        name: "Range Resources",
        reference: "Q1 2026 Form 10-Q",
        notes: "Uses Q1 2026 transportation, gathering, processing, and compression per Mcfe as the initial forward anchor, held flat. Management guides only qualitative price sensitivities for GP&T, not a per-Mcfe rate."
      }),
      productionTaxPctRevenue: value({
        value: 5.823 / 1010.252,
        unit: "decimal",
        period,
        classification: isQ1Actual ? "reported" : "modeled",
        name: "Range Resources",
        reference: "Q1 2026 Form 10-Q",
        notes: "Derived from taxes other than income divided by natural gas, NGL, and oil sales, held flat. No separate production-tax guidance was issued."
      }),
      cashGaMillion: isQ1Actual
        ? value({
            value: 45.351,
            unit: "$mm",
            period,
            classification: "reported",
            name: "Range Resources",
            reference: "Q1 2026 Form 10-Q",
            notes: "Reported Q1 2026 G&A. Historical actual; not separately reconciled to a cash-only G&A measure."
          })
        : annualOverride?.cashGaMillion ?? value({
            value: flatProduction.volumes.totalMcfe === null ? null : (flatProduction.volumes.totalMcfe * 0.23) / 1000,
            unit: "$mm",
            period,
            classification: "guided",
            name: "Range Resources management guidance (Q1 2026)",
            reference: "Peer Comp Site 1Q26 Guidance",
            notes: "Guided ~$0.23/Mcfe G&A (includes ~$0.05/Mcfe stock-based compensation) applied to this period's forecast Mcfe production; RRC did not issue separate 2027/2028 G&A guidance."
          }),
      cashInterestMillion: annualOverride?.cashInterestMillion ?? value({
        value: 19.419,
        unit: "$mm",
        period,
        classification: isQ1Actual ? "reported" : "modeled",
        name: "Range Resources",
        reference: "Q1 2026 Form 10-Q",
        notes: "Uses reported interest expense as the initial quarterly run-rate, held flat; this is not separately reconciled to cash interest paid. No interest guidance was issued."
      }),
      explorationMillion: annualOverride?.explorationMillion ?? value({
        value: 6.03,
        unit: "$mm",
        period,
        classification: isQ1Actual ? "reported" : "modeled",
        name: "Range Resources",
        reference: "Q1 2026 Form 10-Q",
        notes: "Uses reported exploration expense as the initial quarterly run-rate, held flat. No exploration-expense guidance was issued."
      }),
      cashTaxRate: isQ1Actual
        ? value({
            value: 0.02,
            unit: "decimal",
            period,
            classification: "guided",
            name: "Range Resources management guidance (Q1 2026)",
            reference: "Peer Comp Site 1Q26 Guidance",
            notes: "Guided ~2% 2026 cash tax rate."
          })
        : annualOverride?.cashTaxRate ?? value({
            value: year === 2026 ? 0.02 : year === 2027 ? 0.06 : 0.08,
            unit: "decimal",
            period,
            classification: year === 2026 ? "guided" : "modeled",
            name: year === 2026 ? "Range Resources management guidance (Q1 2026)" : "RRC Peer Dashboard",
            reference: year === 2026 ? "Peer Comp Site 1Q26 Guidance" : "Scenario convention",
            notes: year === 2026
              ? "Guided ~2% 2026 cash tax rate."
              : `Modeled ${year === 2027 ? 6 : 8}% cash tax rate for ${year}, an explicit scenario assumption as NOL shelter is used up. RRC has not issued 2027/2028 cash tax guidance.`
          })
    },
    capex: (() => {
      const fallback = defaultAnnualCapexMillion(year, strategy);
      const totalOverride = annualOverride?.capexTotalMillion;
      const isUsingDefaultTotal = !totalOverride;
      const totalMillion = totalOverride?.value ?? fallback.value;
      const totalClassification: AssumptionClassification = totalOverride ? totalOverride.source.classification : fallback.classification;
      const totalName = totalOverride ? totalOverride.source.name : "Range Resources management guidance (Q1 2026)";
      const totalReference = totalOverride ? totalOverride.source.reference ?? "" : "Peer Comp Site 1Q26 Guidance";
      const totalNotes = totalOverride ? totalOverride.source.notes ?? "" : fallback.notes;

      // Drives CapexResult.totalMillion (and therefore free cash flow) directly, independent
      // of whether the category lines below are fully populated -- see calculateCapex, which
      // prefers this field over the categorical sum. Quarterly = 1/4 of the annual figure.
      const totalOverrideMillion = value({
        value: totalMillion === null ? null : totalMillion / 4,
        unit: "$mm",
        period,
        classification: totalClassification,
        name: totalName,
        reference: totalReference,
        notes: `${totalNotes} Total annual CapEx for ${year} (used directly for FCF); category lines are populated only where a source-backed breakdown exists for this exact total.`.trim()
      });

      // Category-level detail is populated ONLY when this period is using the unmodified
      // default annual total for a year RRC actually disclosed a category breakdown for
      // (see sourceBackedCapexCategories) -- never scaled or reused from another year's or
      // another total's proportions. The moment a caller overrides the annual total, there
      // is no longer a disclosed split for that specific number, so every category becomes
      // unsupported/null rather than an invented estimate.
      const categories = isUsingDefaultTotal ? sourceBackedCapexCategories(year, strategy) : null;

      function categoryLine(field: keyof CapexCategorySplit, label: string): SourcedValue {
        const annualCategoryValue = categories?.[field];
        if (annualCategoryValue === undefined) {
          return value({
            value: null,
            unit: "$mm",
            period,
            classification: "modeled",
            name: "RRC Peer Dashboard",
            reference: "Unsupported input",
            notes: `No source-backed ${label} figure exists for ${year}${isUsingDefaultTotal ? "" : " at this user-entered total"}; left unsupported rather than estimated from another year's or another total's proportions. Total annual CapEx (which drives FCF) is unaffected.`
          });
        }
        return value({
          value: annualCategoryValue / 4,
          unit: "$mm",
          period,
          classification: "guided",
          name: "Range Resources management guidance (Q1 2026)",
          reference: "Peer Comp Site 1Q26 Guidance",
          notes: `${label} allocation of the guided ${year} annual capital case (evenly split across quarters).`
        });
      }

      return {
        maintenanceDcMillion: categoryLine("maintenance", "Maintenance D&C"),
        growthDcMillion: categoryLine("growth", "Growth D&C"),
        landLeaseholdMillion: categoryLine("land", "Land and leasehold"),
        facilitiesMillion: categoryLine("facilities", "Facilities/software/other"),
        environmentalMillion: value({ value: 0, unit: "$mm", period, classification: "modeled", name: "RRC Peer Dashboard", reference: "Scenario convention", notes: "No separate amount assumed; not guided." }),
        otherMillion: value({ value: 0, unit: "$mm", period, classification: "modeled", name: "RRC Peer Dashboard", reference: "Scenario convention", notes: "No separate amount assumed; not guided." }),
        totalOverrideMillion
      };
    })()
  };
}

export function buildRrcCompleteScenario(
  strategy: RrcPost2027Strategy = "maintenance",
  options: RrcCompleteScenarioOptions = {}
): ForecastScenario {
  const periodLabels = [2026, 2027, 2028].flatMap((year) => [1, 2, 3, 4].map((quarter) => `${year}Q${quarter}`));
  const flatProduction = buildFlatProductionForecast(
    latestReportedProduction,
    periodLabels.map((period) => ({ period, days: quarterDays(period) })),
    options.productionOverrides ?? []
  );
  const periods = flatProduction.map((flat) => periodAssumptions(flat, strategy, options.currentMarketPrices, options.annualOverrides));

  return {
    id: `rrc-complete-${strategy}-2026-2028`,
    name: strategy === "maintenance"
      ? "RRC Complete Base — 2028 Maintenance"
      : "RRC Complete Base — 2028 Continued Growth",
    description:
      "First end-to-end calculable RRC scenario. Reported Q1 2026 facts anchor production mix, costs, pricing differentials, shares, and net debt. Forward periods are explicit modeled assumptions and remain distinguishable from reported data.",
    kind: strategy === "maintenance" ? "base" : "custom",
    createdAt: SOURCE_DATE,
    updatedAt: SOURCE_DATE,
    author: "RRC Peer Dashboard",
    engineVersion: FORECAST_ENGINE_VERSION,
    periods
  };
}

export function runRrcCompleteScenario(
  strategy: RrcPost2027Strategy = "maintenance",
  options: RrcCompleteScenarioOptions = {}
): RrcCompleteScenarioResult {
  const scenario = buildRrcCompleteScenario(strategy, options);
  const forecast = runForecastScenario(scenario);
  const balanceSheet: ReturnType<typeof rollForwardBalanceSheet>[] = [];

  let beginningCash = 0.247;
  let beginningDebt = 819.254;

  for (const period of forecast.periods) {
    const result = rollForwardBalanceSheet({
      period: period.period,
      beginningCashMillion: beginningCash,
      beginningDebtMillion: beginningDebt,
      freeCashFlowMillion: period.freeCashFlowMillion,
      dividendsMillion: 23.8,
      buybacksMillion: 0,
      debtIssuedMillion: 0,
      debtRepaidMillion: 0,
      ebitdaxMillion: period.ebitdaxMillion
    });
    balanceSheet.push(result);
    if (result.endingCashMillion !== null) beginningCash = result.endingCashMillion;
    if (result.endingDebtMillion !== null) beginningDebt = result.endingDebtMillion;
  }

  return {
    scenario,
    forecast,
    balanceSheet,
    notes: [
      ...rrcHedgeBookQ1_2026.notes,
      "The model is fully calculable, but hedge impacts remain zero until contract-level derivative rows are loaded.",
      "Forward production holds the latest reported Q1 2026 production constant by default; no decline, growth, or annual target ramp is applied unless the caller supplies an explicit per-period override.",
      "Reported G&A and interest expense are used as forecast anchors and are not presented as separately reconciled cash-only measures."
    ]
  };
}
