import { rrcLatestDetailedBaseline } from "@/lib/forecast/data/rrc-baseline";
import { rrcActualQuarters, isRrcActualPeriod, type RrcActualPeriod } from "@/lib/forecast/data/rrc-actuals";
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

/** The only reported production anchor this scenario uses: the latest detailed 10-Q baseline (rrcLatestDetailedBaseline, currently Q2 2026), held flat unless overridden. */
export const latestReportedProduction: ProductionBeginningState = {
  period: rrcLatestDetailedBaseline.period.replace("-", ""),
  gasMmcfPerDay: rrcLatestDetailedBaseline.naturalGasMmcfPerDay,
  nglMbblPerDay: rrcLatestDetailedBaseline.nglMbblPerDay,
  oilMbblPerDay: rrcLatestDetailedBaseline.oilMbblPerDay
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
 * Looks up a management-guided value (differential, per-Mcfe cost, annual total, ...) for
 * a given year directly from the canonical guidance adapter, using the sign/units exactly
 * as disclosed (e.g. a guided "0.35-0.40/Mcf premium vs. Henry Hub" resolves to a +0.375
 * midpoint; an old "NYMEX minus $0.35-$0.45/Mcf" framing would have resolved to -0.40 --
 * whichever the CURRENT guidance cycle actually says). Returns null when RRC did not guide
 * that metric for that year, so the caller falls back to the existing modeled/reported
 * anchor rather than fabricating a guided figure. Because this reads rrcManagementGuidance
 * (itself sourced live from data/management-guidance.json) rather than a hardcoded number,
 * a future guidance update flows through automatically without touching this file.
 */
function guidedAnnualValue(metric: GuidanceMetricKey, year: GuidanceYear, unit: string, period: string): SourcedValue | null {
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

/**
 * For market-driven pricing differentials only (gasBasisPerMcf today; oilDifferentialPerBbl
 * would use this too if RRC ever guides one): when RRC did not guide this exact year, prefer
 * the current reporting cycle's OWN guided figure (year "2026", the only year this cycle
 * guides) held flat over falling straight to a single reported quarter's realized outcome.
 * Rationale (feat/rrc-q2-baseline follow-up, 2026-08-12): a realized quarterly differential is
 * a backward-looking, market-driven, potentially one-off outcome (basis-hedge settlement
 * timing, seasonal takeaway constraints, etc.); management's own current guidance -- issued
 * the SAME day as the Q2 2026 actuals, and explicitly "improved"/"raised" this cycle -- is a
 * more informative forward view of a structurally-driven basis position (gathering/takeaway
 * contracts) than one quarter's noisy realized print. Falls through to null (letting the
 * caller use its reported-anchor default) only when the metric has NO guidance in ANY year of
 * the current cycle -- e.g. RRC does not guide an oil differential at all, so
 * oilDifferentialPerBbl is unaffected by this helper and keeps using the reported anchor.
 * Cost/opex per-Mcfe fields (LOE, GP&T, cash G&A, ...) are NOT routed through this: those are
 * comparatively stable across quarters (the Q1->Q2 move was a few cents, not a sign flip) and
 * changing their fallback policy is outside this narrow review's scope.
 */
function guidedOrCurrentCycleValue(metric: GuidanceMetricKey, yearKey: GuidanceYear, unit: string, period: string): SourcedValue | null {
  const exact = guidedAnnualValue(metric, yearKey, unit, period);
  if (exact) return exact;
  if (yearKey === "2026") return null;
  const currentCycle = guidedAnnualValue(metric, "2026", unit, period);
  if (!currentCycle) return null;
  return {
    ...currentCycle,
    source: {
      ...currentCycle.source,
      notes: `${currentCycle.source.notes} RRC did not separately guide this differential for ${yearKey}; the current cycle's only guided figure (FY 2026) is held flat rather than falling back to a single realized quarter's differential.`.trim()
    }
  };
}

/**
 * Modeled cash tax rate fallback when no current-cycle guidance exists, by year: 2%
 * (2026) -> 6% (2027) -> 8% (2028), as NOL shelter is used up. Single source of truth for
 * this scenario assumption -- both the engine's own periodAssumptions (below) and
 * rrc-annual.ts's reference-panel default (resolveAnnualCostDefaults) call this function
 * rather than each hardcoding the by-year values separately, so the displayed default and
 * the value the engine actually computes with can never silently diverge again. Always
 * takes a numeric year (not a "2026"-style string) to avoid the string-comparison bug this
 * replaced.
 */
export function modeledCashTaxRateForYear(year: number): number {
  return year === 2026 ? 0.02 : year === 2027 ? 0.06 : 0.08;
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

type AnnualDefault = { value: number | null; classification: AssumptionClassification; name: string; reference: string; notes: string };

/** Default annual total capex ($mm) absent an explicit override: reads the current-cycle guided total for 2026/2027 directly from rrcManagementGuidance, or the 2028 maintenance/growth case. */
function defaultAnnualCapexMillion(year: number, strategy: RrcPost2027Strategy, period: string): AnnualDefault {
  if (year <= 2027) {
    const guided = guidedAnnualValue("capexTotalMillion", String(year) as GuidanceYear, "$mm", period);
    if (guided && guided.value !== null) return { value: guided.value, classification: "guided", name: guided.source.name, reference: guided.source.reference ?? "", notes: guided.source.notes ?? "" };
    return { value: null, classification: "modeled", name: "RRC Peer Dashboard", reference: "Unsupported input", notes: `No capital budget is guided for ${year}; left unsupported rather than estimated.` };
  }
  if (strategy === "maintenance") {
    const guided = guidedAnnualValue("capexTotalMillion", "2028", "$mm", period);
    if (guided && guided.value !== null) return { value: guided.value, classification: "guided", name: guided.source.name, reference: guided.source.reference ?? "", notes: guided.source.notes ?? "" };
    return { value: 600, classification: "modeled", name: "RRC Peer Dashboard", reference: "Scenario convention", notes: "No 2028+ maintenance capital figure is currently guided; carried forward as a modeled assumption." };
  }
  return { value: 675, classification: "modeled", name: "RRC Peer Dashboard", reference: "Scenario convention", notes: "No 2028 continued-growth capital figure is guided; this scenario models it as a continuation of the 2026-2027 capital level." };
}

type CapexCategorySplit = { maintenance: number; growth: number; land: number; facilities: number };

/**
 * Returns the source-backed capex category breakdown for a year/strategy, or null when no
 * such breakdown exists. Never scales or reuses another year's proportions against an
 * arbitrary total: this is consulted ONLY when the period is using the unmodified default
 * annual total (see periodAssumptions below) -- the moment a caller overrides the total,
 * there is no longer a disclosed split for that specific number, so the category fields
 * fall back to unsupported/null rather than an invented proportional estimate.
 *
 * The current (Q2 2026) guidance cycle discloses only an aggregate CapEx figure for every
 * year -- no maintenance/growth/land/facilities breakdown for 2026 or 2027, unlike the
 * prior (Q1 2026) cycle. Category lines are therefore unsupported for every year except the
 * 2028+ maintenance case, where "Maintenance D&C: ~$600MM annually" IS the maintenance
 * category by definition; growth/land/facilities are not addressed there either and stay
 * null rather than being assumed to be zero.
 */
function sourceBackedCapexCategories(year: number, strategy: RrcPost2027Strategy): Partial<CapexCategorySplit> | null {
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
    classification: "modeled",
    name: "RRC Peer Dashboard",
    reference: "Scenario convention",
    notes: "Benchmark assumption carried forward from a prior guidance cycle's stated NYMEX natural gas pricing case; the current (Q2 2026) guidance cycle does not restate a Henry Hub pricing case. Not a realized price or a current-market quote; used only as the default when no current-market or custom price was supplied for this run."
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
        classification: "modeled",
        name: "RRC Peer Dashboard",
        reference: "Scenario convention",
        notes: "Derived from a prior guidance cycle's stated $24/bbl NGL realization case divided by its $65/bbl WTI working assumption. The current (Q2 2026) guidance cycle instead states an NGL differential vs. Mont Belvieu (see the guidance reference panel), which this engine does not yet have a Mont Belvieu benchmark to apply; WTI itself remains unguided by RRC."
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
          guidedOrCurrentCycleValue("gasBasisPerMcf", yearKey, "$/Mcf", period) ??
          value({
            value: -0.47,
            unit: "$/Mcf",
            period,
            classification: "modeled",
            name: "Range Resources",
            reference: "Q2 2026 Form 10-Q realized-pricing disclosure",
            notes: `Uses the Q2 2026 differential to NYMEX including basis hedges as the forward anchor, held flat; RRC did not guide a gas differential for ${year}.`
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
          guidedOrCurrentCycleValue("oilDifferentialPerBbl", yearKey, "$/bbl", period) ??
          value({
            value: -9.62,
            unit: "$/bbl",
            period,
            classification: "modeled",
            name: "Range Resources",
            reference: "Q2 2026 Form 10-Q realized-pricing disclosure",
            notes: `Uses the Q2 2026 oil differential as the forward anchor, held flat; RRC did not guide an oil differential for ${year}.`
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
        : annualOverride?.loePerMcfe ??
          guidedAnnualValue("loePerMcfe", yearKey, "$/Mcfe", period) ??
          value({
            value: 0.133,
            unit: "$/Mcfe",
            period,
            classification: "modeled",
            name: "Range Resources",
            reference: "Q2 2026 Form 10-Q",
            notes: `Uses Q2 2026 direct operating expense per Mcfe as the forward anchor, held flat; RRC did not guide LOE for ${year}.`
          }),
      gatheringTransportPerMcfe: isQ1Actual
        ? value({
            value: 1.63,
            unit: "$/Mcfe",
            period,
            classification: "reported",
            name: "Range Resources",
            reference: "Q1 2026 Form 10-Q",
            notes: "Reported Q1 2026 transportation, gathering, processing, and compression per Mcfe. Historical actual; never overridden by guidance or a user assumption."
          })
        : annualOverride?.gatheringTransportPerMcfe ??
          guidedAnnualValue("gatheringTransportPerMcfe", yearKey, "$/Mcfe", period) ??
          value({
            value: 1.516,
            unit: "$/Mcfe",
            period,
            classification: "modeled",
            name: "Range Resources",
            reference: "Q2 2026 Form 10-Q",
            notes: `Uses Q2 2026 GP&T per Mcfe as the forward anchor, held flat; RRC did not guide GP&T for ${year}.`
          }),
      productionTaxPctRevenue: value({
        value: 5.823 / 1010.252,
        unit: "decimal",
        period,
        classification: isQ1Actual ? "reported" : "modeled",
        name: "Range Resources",
        reference: "Q1 2026 Form 10-Q",
        notes: "Derived from Q1 2026 taxes other than income divided by natural gas, NGL, and oil sales, held flat. Not re-verified against Q2 2026 in the feat/rrc-q2-baseline recalibration (2026-08-12) -- doing so would require Q2's own taxes-other-than-income and total commodity-sales figures, not yet pulled -- so this ratio remains Q1-anchored pending a future update; see rrc-baseline.ts's rrcQ2_2026Baseline.productionTaxesPerMcfe. RRC's current $/Mcfe production/ad valorem tax guidance uses a different unit basis (see productionTaxPerMcfe in the guidance reference panel) and is not wired into this percent-of-revenue field."
      }),
      cashGaMillion: isQ1Actual
        ? value({
            value: flatProduction.volumes.totalMcfe === null ? null : (flatProduction.volumes.totalMcfe * 0.18) / 1000,
            unit: "$mm",
            period,
            classification: "reported",
            name: "Range Resources",
            reference: "Q1 2026 Form 10-Q",
            notes: "Reported Q1 2026 cash G&A of $0.18/Mcfe (excludes stock-based compensation) applied to reported Q1 production. Historical actual; never overridden by guidance or a user assumption."
          })
        : annualOverride?.cashGaMillion ??
          (() => {
            const guided = guidedAnnualValue("cashGaPerMcfe", yearKey, "$/Mcfe", period);
            const rate = guided?.value ?? 0.18;
            if (flatProduction.volumes.totalMcfe === null) {
              return value({
                value: null,
                unit: "$mm",
                period,
                classification: "modeled",
                name: "RRC Peer Dashboard",
                reference: "Unsupported input",
                notes: "This period's production volume is unavailable to convert a $/Mcfe G&A rate into a dollar figure."
              });
            }
            if (guided && guided.value !== null) {
              return value({
                value: (flatProduction.volumes.totalMcfe * rate) / 1000,
                unit: "$mm",
                period,
                classification: "guided",
                name: guided.source.name,
                reference: guided.source.reference ?? "",
                notes: `${guided.source.notes ?? ""} Applied to this period's forecast Mcfe production.`.trim()
              });
            }
            return value({
              value: (flatProduction.volumes.totalMcfe * rate) / 1000,
              unit: "$mm",
              period,
              classification: "modeled",
              name: "Range Resources",
              reference: "Q2 2026 Form 10-Q",
              notes: `Uses reported Q2 2026 cash G&A of $0.18/Mcfe (independently verified via the 10-Q's G&A/stock-comp breakout table; numerically unchanged from the Q1 2026 anchor) as the forward anchor, held flat and applied to this period's forecast Mcfe production; RRC did not guide G&A for ${year}.`
            });
          })(),
      cashInterestMillion: isQ1Actual
        ? value({
            value: 19.419,
            unit: "$mm",
            period,
            classification: "reported",
            name: "Range Resources",
            reference: "Q1 2026 Form 10-Q",
            notes: "Reported Q1 2026 interest expense. Historical actual; not separately reconciled to cash interest paid; never overridden by guidance or a user assumption."
          })
        : annualOverride?.cashInterestMillion ??
          (() => {
            const guided = guidedAnnualValue("cashInterestPerMcfe", yearKey, "$/Mcfe", period);
            if (!guided || guided.value === null || flatProduction.volumes.totalMcfe === null) {
              return value({
                value: 14.4,
                unit: "$mm",
                period,
                classification: "modeled",
                name: "Range Resources",
                reference: "Q2 2026 Form 10-Q",
                notes: `Uses reported Q2 2026 interest expense as the forward run-rate, held flat; RRC did not guide net interest for ${year}.`
              });
            }
            return value({
              value: (flatProduction.volumes.totalMcfe * guided.value) / 1000,
              unit: "$mm",
              period,
              classification: "guided",
              name: guided.source.name,
              reference: guided.source.reference ?? "",
              notes: `${guided.source.notes ?? ""} Applied to this period's forecast Mcfe production.`.trim()
            });
          })(),
      explorationMillion: isQ1Actual
        ? value({
            value: 6.03,
            unit: "$mm",
            period,
            classification: "reported",
            name: "Range Resources",
            reference: "Q1 2026 Form 10-Q",
            notes: "Reported Q1 2026 exploration expense. Historical actual; never overridden by guidance or a user assumption."
          })
        : annualOverride?.explorationMillion ??
          (() => {
            const guided = guidedAnnualValue("explorationMillion", yearKey, "$mm", period);
            if (!guided || guided.value === null) {
              return value({
                value: 6.498,
                unit: "$mm",
                period,
                classification: "modeled",
                name: "Range Resources",
                reference: "Q2 2026 Form 10-Q",
                notes: `Uses reported Q2 2026 exploration expense as the forward run-rate, held flat; RRC did not guide exploration expense for ${year}.`
              });
            }
            return value({
              value: guided.value / 4,
              unit: "$mm",
              period,
              classification: "guided",
              name: guided.source.name,
              reference: guided.source.reference ?? "",
              notes: `${guided.source.notes ?? ""} Even quarterly allocation of the guided ${year} annual exploration-expense figure.`.trim()
            });
          })(),
      cashTaxRate: isQ1Actual
        ? value({
            value: 0.02,
            unit: "decimal",
            period,
            classification: "modeled",
            name: "RRC Peer Dashboard",
            reference: "Scenario convention",
            notes: "No cash-tax-rate guidance is current for this cycle; 2% carried forward as a modeled assumption from the prior (Q1 2026) guidance cycle. Historical actual quarter; never overridden by a user assumption."
          })
        : annualOverride?.cashTaxRate ??
          guidedAnnualValue("cashTaxRate", yearKey, "decimal", period) ??
          value({
            value: modeledCashTaxRateForYear(year),
            unit: "decimal",
            period,
            classification: "modeled",
            name: "RRC Peer Dashboard",
            reference: "Scenario convention",
            notes: `No cash-tax-rate guidance is current for this cycle; modeled ${year === 2026 ? 2 : year === 2027 ? 6 : 8}% assumption${year === 2026 ? " carried forward from the prior guidance cycle" : " as NOL shelter is used up"}.`
          })
    },
    capex: (() => {
      const fallback = defaultAnnualCapexMillion(year, strategy, period);
      const totalOverride = annualOverride?.capexTotalMillion;
      const isUsingDefaultTotal = !totalOverride;
      const totalMillion = totalOverride?.value ?? fallback.value;
      const totalClassification: AssumptionClassification = totalOverride ? totalOverride.source.classification : fallback.classification;
      const totalName = totalOverride ? totalOverride.source.name : fallback.name;
      const totalReference = totalOverride ? totalOverride.source.reference ?? "" : fallback.reference;
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

/**
 * Overrides revenue, EBITDAX, CapEx, free cash flow, and total production for the
 * immutable reported quarters (2026Q1, 2026Q2) with the canonical reported actuals,
 * discarding the bottom-up production x price x cost calculation for exactly those two
 * periods. Even with fully accurate per-unit inputs, a bottom-up build does not exactly
 * reconcile to GAAP revenue (hedge settlements, purchased-gas marketing sales, and similar
 * items are recognized as revenue but are not part of a simple production x realized-price
 * calculation) -- so historical quarters use the real reported figures directly rather than
 * a forecast reconstruction. Every other quarter (Q3 2026 onward) is untouched.
 */
export function applyActualQuarterOverrides(forecast: ReturnType<typeof runForecastScenario>): ReturnType<typeof runForecastScenario> {
  const periods = forecast.periods.map((period) => {
    if (!isRrcActualPeriod(period.period)) return period;
    const actual = rrcActualQuarters[period.period];
    const totalMcfe =
      actual.totalProductionMmcfePerDay === null
        ? period.production.totalMcfe
        : actual.totalProductionMmcfePerDay * quarterDays(period.period);

    // Gas/NGL/oil sub-components are not independently known for Q2 2026 (outside the
    // accepted integration scope; see rrc-actuals.ts), so they keep whatever the bottom-up
    // calculation produced (Q1's mix held flat) -- but that no longer sums exactly to the
    // now-overridden reported total. Rescale the three components proportionally so they
    // still sum to the real total exactly (summarizeAnnualProduction's cross-check would
    // otherwise null out the whole year, and the components would silently misstate the
    // real total anyway). This changes only the LEVEL, never the assumed mix proportions.
    const rawProduction = period.production;
    const rescale =
      totalMcfe !== null && rawProduction.totalMcfe !== null && rawProduction.totalMcfe !== 0
        ? totalMcfe / rawProduction.totalMcfe
        : null;
    const production =
      rescale === null || rawProduction.gasMmcf === null || rawProduction.nglMbbl === null || rawProduction.oilMbbl === null
        ? { ...rawProduction, totalMcfe }
        : {
            gasMmcf: rawProduction.gasMmcf * rescale,
            nglMbbl: rawProduction.nglMbbl * rescale,
            oilMbbl: rawProduction.oilMbbl * rescale,
            totalMcfe
          };

    return {
      ...period,
      production,
      revenue: { ...period.revenue, totalMillion: actual.revenueMillion },
      ebitdaxMillion: actual.ebitdaxMillion,
      capex: { ...period.capex, totalMillion: actual.capexMillion },
      freeCashFlowMillion: actual.freeCashFlowMillion,
      warnings: [
        ...period.warnings,
        `Reported ${period.period} actual applied for revenue/EBITDAX/CapEx/FCF/total production; the bottom-up production x price forecast calculation was not used for this immutable historical quarter. ${actual.sourceNotes}`
      ]
    };
  });
  return { ...forecast, periods };
}

/** RRC's observed minimal-cash operating pattern (Q1 2026 reported cash: $0.247mm); used only to split a reported actual quarter's NET debt into a cash/debt component pair for the rollforward's next-quarter starting state. Never affects the net debt figure itself, which is always exactly the reported number for 2026Q1/2026Q2. */
const ASSUMED_MINIMAL_CASH_MILLION = 0.247;

/**
 * Balance-sheet series where 2026Q1 and 2026Q2 use the reported net debt directly (not a
 * rolled-forward estimate) and Q3 2026 onward rolls forward from Q2's actual position --
 * never from Q1, and never mixing a rolled-forward estimate into an immutable historical
 * quarter. Reuses rollForwardBalanceSheet unchanged for every non-actual quarter.
 */
export function buildRrcBalanceSheet(forecast: ReturnType<typeof runForecastScenario>): ReturnType<typeof rollForwardBalanceSheet>[] {
  const results: ReturnType<typeof rollForwardBalanceSheet>[] = [];
  let beginningCash = ASSUMED_MINIMAL_CASH_MILLION;
  let beginningDebt = ASSUMED_MINIMAL_CASH_MILLION;

  for (const period of forecast.periods) {
    if (isRrcActualPeriod(period.period)) {
      const actual = rrcActualQuarters[period.period as RrcActualPeriod];
      const netDebtMillion = actual.netDebtMillion;
      const netLeverage =
        netDebtMillion !== null && actual.ebitdaxMillion !== null && actual.ebitdaxMillion > 0
          ? netDebtMillion / (actual.ebitdaxMillion * 4)
          : null;
      results.push({
        period: period.period,
        endingCashMillion: null,
        endingDebtMillion: null,
        netDebtMillion,
        netLeverage,
        warnings: netDebtMillion === null ? [`Reported net debt is unavailable for ${period.period}.`] : []
      });
      if (netDebtMillion !== null) {
        // Seed the next (non-actual) quarter's rollforward from this quarter's reported net
        // debt, split against the assumed minimal cash balance -- the split is an
        // approximation for rollforward mechanics only; net debt itself is exact.
        beginningCash = ASSUMED_MINIMAL_CASH_MILLION;
        beginningDebt = netDebtMillion + ASSUMED_MINIMAL_CASH_MILLION;
      }
      continue;
    }

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
    results.push(result);
    if (result.endingCashMillion !== null) beginningCash = result.endingCashMillion;
    if (result.endingDebtMillion !== null) beginningDebt = result.endingDebtMillion;
  }

  return results;
}

export function runRrcCompleteScenario(
  strategy: RrcPost2027Strategy = "maintenance",
  options: RrcCompleteScenarioOptions = {}
): RrcCompleteScenarioResult {
  const scenario = buildRrcCompleteScenario(strategy, options);
  const forecast = applyActualQuarterOverrides(runForecastScenario(scenario));
  const balanceSheet = buildRrcBalanceSheet(forecast);

  return {
    scenario,
    forecast,
    balanceSheet,
    notes: [
      ...rrcHedgeBookQ1_2026.notes,
      "The model is fully calculable, but hedge impacts remain zero until contract-level derivative rows are loaded.",
      "2026Q1 and 2026Q2 are immutable reported actuals (revenue, EBITDAX, CapEx, FCF, total production, and net debt); forward production/cost/pricing assumptions for Q3 2026 onward do not affect them.",
      "Forward production holds the latest reported Q2 2026 production mix constant by default (feat/rrc-q2-baseline, 2026-08-12); no decline, growth, or annual target ramp is applied unless the caller supplies an explicit per-period override.",
      "Reported G&A and interest expense are used as forecast anchors and are not presented as separately reconciled cash-only measures."
    ]
  };
}
