import { rrcQ1_2026Baseline } from "@/lib/forecast/data/rrc-baseline";
import { rrcHedgeBookQ1_2026 } from "@/lib/forecast/data/rrc-hedges";
import { FORECAST_ENGINE_VERSION, runForecastScenario } from "@/lib/forecast/engine";
import { rollForwardBalanceSheet } from "@/lib/forecast/balance-sheet";
import type {
  AssumptionClassification,
  ForecastPeriodAssumptions,
  ForecastScenario,
  SourcedValue
} from "@/lib/forecast/types";

export type RrcPost2027Strategy = "maintenance" | "continued-growth";

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

function quarterDays(period: string): number {
  const year = Number(period.slice(0, 4));
  const quarter = Number(period.slice(-1));
  if (quarter === 1) {
    const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    return leap ? 91 : 90;
  }
  return quarter === 2 ? 91 : 92;
}

function annualTargetBcfePerDay(year: number, strategy: RrcPost2027Strategy): number {
  if (year === 2026) return 2.35;
  if (year === 2027) return 2.6;
  return strategy === "maintenance" ? 2.6 : 2.68;
}

function quarterlyTotalBcfePerDay(period: string, strategy: RrcPost2027Strategy): number {
  const year = Number(period.slice(0, 4));
  const quarter = Number(period.slice(-1));
  const start = year === 2026 ? rrcQ1_2026Baseline.totalProductionBcfePerDay.value ?? 2.21 :
    year === 2027 ? 2.35 : 2.6;
  const end = annualTargetBcfePerDay(year, strategy);
  // Quarter 1 must reproduce `start` exactly (Q1 2026 is the reported baseline,
  // and each later year's start is the prior year's Q4 target) and quarter 4 must
  // reach `end` exactly so the ramp is continuous across year boundaries.
  const progress = (quarter - 1) / 3;
  return start + (end - start) * progress;
}

function scaleProductMix(totalBcfePerDay: number) {
  const baselineTotal = rrcQ1_2026Baseline.totalProductionBcfePerDay.value!;
  const scale = totalBcfePerDay / baselineTotal;
  return {
    gasMmcfPerDay: rrcQ1_2026Baseline.naturalGasMmcfPerDay.value! * scale,
    nglMbblPerDay: rrcQ1_2026Baseline.nglMbblPerDay.value! * scale,
    oilMbblPerDay: rrcQ1_2026Baseline.oilMbblPerDay.value! * scale
  };
}

function quarterlyCapex(period: string, strategy: RrcPost2027Strategy): number {
  const year = Number(period.slice(0, 4));
  if (year <= 2027) return 675 / 4;
  return (strategy === "maintenance" ? 600 : 675) / 4;
}

function periodAssumptions(
  period: string,
  strategy: RrcPost2027Strategy
): ForecastPeriodAssumptions {
  const total = quarterlyTotalBcfePerDay(period, strategy);
  const mix = scaleProductMix(total);
  const capex = quarterlyCapex(period, strategy);
  const isQ1Actual = period === "2026Q1";

  return {
    period,
    days: quarterDays(period),
    commodity: {
      henryHubPerMmbtu: value({
        value: 3.75,
        unit: "$/MMBtu",
        period,
        classification: "modeled",
        name: "Range Resources management sensitivity case",
        reference: "Range Resources April 2026 presentation",
        notes: "Benchmark assumption; not a realized price."
      }),
      wtiPerBbl: value({
        value: 65,
        unit: "$/bbl",
        period,
        classification: "modeled",
        name: "Range Resources management sensitivity case",
        reference: "Range Resources April 2026 presentation",
        notes: "Benchmark assumption."
      }),
      nglRealizationPctOfWti: value({
        value: 24 / 65,
        unit: "decimal",
        period,
        classification: "modeled",
        name: "Range Resources management sensitivity case",
        reference: "Range Resources April 2026 presentation",
        notes: "Derived exactly from $24/bbl NGL and $65/bbl WTI assumptions."
      })
    },
    pricing: {
      gasBasisPerMcf: value({
        value: 0.18,
        unit: "$/Mcf",
        period,
        classification: isQ1Actual ? "reported" : "modeled",
        name: "Range Resources",
        reference: "Q1 2026 Form 10-Q realized-pricing disclosure",
        notes: "Uses the Q1 2026 premium to NYMEX including basis hedges as the initial forward anchor."
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
      oilDifferentialPerBbl: value({
        value: -10.68,
        unit: "$/bbl",
        period,
        classification: isQ1Actual ? "reported" : "modeled",
        name: "Range Resources",
        reference: "Q1 2026 Form 10-Q realized-pricing disclosure",
        notes: "Uses the Q1 2026 oil differential as the forward anchor."
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
    production: {
      gasMmcfPerDay: value({
        value: mix.gasMmcfPerDay,
        unit: "MMcf/d",
        period,
        classification: isQ1Actual ? "reported" : "modeled",
        name: "Range Resources / RRC Peer Dashboard",
        reference: isQ1Actual ? "Q1 2026 Form 10-Q" : "Modeled production ramp using Q1 2026 product mix",
        notes: "Forward periods preserve the Q1 2026 product mix and scale to the explicit total-production path."
      }),
      nglMbblPerDay: value({
        value: mix.nglMbblPerDay,
        unit: "Mbbl/d",
        period,
        classification: isQ1Actual ? "reported" : "modeled",
        name: "Range Resources / RRC Peer Dashboard",
        reference: isQ1Actual ? "Q1 2026 Form 10-Q" : "Modeled production ramp using Q1 2026 product mix",
        notes: "Forward periods preserve the Q1 2026 product mix."
      }),
      oilMbblPerDay: value({
        value: mix.oilMbblPerDay,
        unit: "Mbbl/d",
        period,
        classification: isQ1Actual ? "reported" : "modeled",
        name: "Range Resources / RRC Peer Dashboard",
        reference: isQ1Actual ? "Q1 2026 Form 10-Q" : "Modeled production ramp using Q1 2026 product mix",
        notes: "Forward periods preserve the Q1 2026 product mix."
      })
    },
    costs: {
      loePerMcfe: value({
        value: 0.14,
        unit: "$/Mcfe",
        period,
        classification: isQ1Actual ? "reported" : "modeled",
        name: "Range Resources",
        reference: "Q1 2026 Form 10-Q",
        notes: "Uses Q1 2026 direct operating expense per Mcfe as the initial forward anchor."
      }),
      gatheringTransportPerMcfe: value({
        value: 1.63,
        unit: "$/Mcfe",
        period,
        classification: isQ1Actual ? "reported" : "modeled",
        name: "Range Resources",
        reference: "Q1 2026 Form 10-Q",
        notes: "Uses Q1 2026 transportation, gathering, processing, and compression per Mcfe as the initial forward anchor."
      }),
      productionTaxPctRevenue: value({
        value: 5.823 / 1010.252,
        unit: "decimal",
        period,
        classification: isQ1Actual ? "reported" : "modeled",
        name: "Range Resources",
        reference: "Q1 2026 Form 10-Q",
        notes: "Derived from taxes other than income divided by natural gas, NGL, and oil sales."
      }),
      cashGaMillion: value({
        value: 45.351,
        unit: "$mm",
        period,
        classification: isQ1Actual ? "reported" : "modeled",
        name: "Range Resources",
        reference: "Q1 2026 Form 10-Q",
        notes: "Uses reported G&A as the initial quarterly run-rate; this is not separately reconciled to a cash-only G&A measure."
      }),
      cashInterestMillion: value({
        value: 19.419,
        unit: "$mm",
        period,
        classification: isQ1Actual ? "reported" : "modeled",
        name: "Range Resources",
        reference: "Q1 2026 Form 10-Q",
        notes: "Uses reported interest expense as the initial quarterly run-rate; this is not separately reconciled to cash interest paid."
      }),
      explorationMillion: value({
        value: 6.03,
        unit: "$mm",
        period,
        classification: isQ1Actual ? "reported" : "modeled",
        name: "Range Resources",
        reference: "Q1 2026 Form 10-Q",
        notes: "Uses reported exploration expense as the initial quarterly run-rate."
      }),
      cashTaxRate: value({
        value: period.startsWith("2026") ? 0.02 : period.startsWith("2027") ? 0.06 : 0.08,
        unit: "decimal",
        period,
        classification: period.startsWith("2028") ? "modeled" : "guided",
        name: "Range Resources management sensitivity case / RRC Peer Dashboard",
        reference: "Range Resources April 2026 presentation",
        notes: period.startsWith("2028")
          ? "Modeled 8% cash tax rate for 2028; explicit scenario assumption."
          : "Management sensitivity case."
      })
    },
    capex: {
      maintenanceDcMillion: value({
        value: strategy === "maintenance" && period.startsWith("2028") ? capex : 0,
        unit: "$mm",
        period,
        classification: "modeled",
        name: "Range Resources / RRC Peer Dashboard",
        reference: "Range Resources April 2026 presentation",
        notes: "Even quarterly allocation of the selected annual capital case."
      }),
      growthDcMillion: value({
        value: strategy === "maintenance" && period.startsWith("2028") ? 0 : capex,
        unit: "$mm",
        period,
        classification: "modeled",
        name: "Range Resources / RRC Peer Dashboard",
        reference: "Range Resources April 2026 presentation",
        notes: "Even quarterly allocation of the selected annual capital case."
      }),
      landLeaseholdMillion: value({ value: 0, unit: "$mm", period, classification: "modeled", name: "RRC Peer Dashboard", reference: "Scenario convention", notes: "No separate amount assumed." }),
      facilitiesMillion: value({ value: 0, unit: "$mm", period, classification: "modeled", name: "RRC Peer Dashboard", reference: "Scenario convention", notes: "No separate amount assumed." }),
      environmentalMillion: value({ value: 0, unit: "$mm", period, classification: "modeled", name: "RRC Peer Dashboard", reference: "Scenario convention", notes: "No separate amount assumed." }),
      otherMillion: value({ value: 0, unit: "$mm", period, classification: "modeled", name: "RRC Peer Dashboard", reference: "Scenario convention", notes: "No separate amount assumed." })
    }
  };
}

export function buildRrcCompleteScenario(
  strategy: RrcPost2027Strategy = "maintenance"
): ForecastScenario {
  const periods = [2026, 2027, 2028].flatMap((year) =>
    [1, 2, 3, 4].map((quarter) => periodAssumptions(`${year}Q${quarter}`, strategy))
  );

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
  strategy: RrcPost2027Strategy = "maintenance"
): RrcCompleteScenarioResult {
  const scenario = buildRrcCompleteScenario(strategy);
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
      "Forward production preserves the Q1 2026 product mix and follows an explicit modeled total-production ramp.",
      "Reported G&A and interest expense are used as forecast anchors and are not presented as separately reconciled cash-only measures."
    ]
  };
}
