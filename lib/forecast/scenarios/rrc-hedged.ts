import { rollForwardBalanceSheet } from "@/lib/forecast/balance-sheet";
import { calculateRrcQuarterlyHedgeSettlements } from "@/lib/forecast/data/rrc-hedge-settlements";
import { runForecastScenario } from "@/lib/forecast/engine";
import {
  buildRrcCompleteScenario,
  type RrcCompleteScenarioOptions,
  type RrcPost2027Strategy
} from "@/lib/forecast/scenarios/rrc-complete";
import type { ForecastScenario, SourcedValue } from "@/lib/forecast/types";

function quarterDates(period: string): { startDate: string; endDate: string } {
  const year = Number(period.slice(0, 4));
  const quarter = Number(period.slice(-1));
  const starts = [`${year}-01-01`, `${year}-04-01`, `${year}-07-01`, `${year}-10-01`];
  const ends = [`${year}-03-31`, `${year}-06-30`, `${year}-09-30`, `${year}-12-31`];
  if (quarter < 1 || quarter > 4) throw new Error(`Invalid quarter: ${period}`);
  return { startDate: starts[quarter - 1], endDate: ends[quarter - 1] };
}

function modeledHedgeValue(value: number | null, unit: string, period: string, notes: string): SourcedValue {
  return {
    value,
    unit,
    source: {
      name: "Range Resources derivative disclosure / RRC Peer Dashboard",
      reference: "2026 Q1 Form 10-Q, Note 7 - Derivative Activities",
      period,
      retrievedAt: "2026-08-04",
      classification: "modeled",
      notes
    }
  };
}

export function buildRrcHedgedScenario(
  strategy: RrcPost2027Strategy = "maintenance",
  options: RrcCompleteScenarioOptions = {}
): ForecastScenario {
  const scenario = buildRrcCompleteScenario(strategy, options);
  const periods = scenario.periods.map((period) => {
    const { startDate, endDate } = quarterDates(period.period);
    const settlements = calculateRrcQuarterlyHedgeSettlements({
      period: period.period,
      startDate,
      endDate,
      henryHubPerMmbtu: period.commodity.henryHubPerMmbtu.value,
      wtiPerBbl: period.commodity.wtiPerBbl.value,
      c3PerBbl: null,
      c5PerBbl: null
    });

    const days = period.days;
    const gasDaily = period.production.gasMmcfPerDay.value;
    const oilDaily = period.production.oilMbblPerDay.value;
    const gasVolumeMcf = gasDaily === null ? null : gasDaily * days * 1_000;
    const oilVolumeBbl = oilDaily === null ? null : oilDaily * days * 1_000;
    const gasSettlement = settlements.byCommodity.naturalGas.settlement;
    const oilSettlement = settlements.byCommodity.oil.settlement;
    const gasImpact = gasSettlement === null || gasVolumeMcf === null || gasVolumeMcf <= 0
      ? null
      : gasSettlement / gasVolumeMcf;
    const oilImpact = oilSettlement === null || oilVolumeBbl === null || oilVolumeBbl <= 0
      ? null
      : oilSettlement / oilVolumeBbl;

    // Hedge volume is disclosed in MMBtu while production is tracked in Mcf; the
    // comparison reuses the same MMBtu-to-Mcf approximation already used above to
    // spread the dollar settlement across production.
    const gasHedgedVolume = settlements.hedgedVolumeByCommodity.naturalGas;
    const oilHedgedVolume = settlements.hedgedVolumeByCommodity.oil;
    const gasOverhedgeNote =
      gasVolumeMcf !== null && gasHedgedVolume > gasVolumeMcf
        ? ` Warning: hedged gas volume (${gasHedgedVolume.toFixed(0)} MMBtu) exceeds forecast gas production (${gasVolumeMcf.toFixed(0)} Mcf) for this period.`
        : "";
    const oilOverhedgeNote =
      oilVolumeBbl !== null && oilHedgedVolume > oilVolumeBbl
        ? ` Warning: hedged oil volume (${oilHedgedVolume.toFixed(0)} bbl) exceeds forecast oil production (${oilVolumeBbl.toFixed(0)} bbl) for this period.`
        : "";
    const settlementWarningNote = settlements.warnings.length > 0
      ? ` Settlement warnings: ${settlements.warnings.join(" ")}`
      : "";

    return {
      ...period,
      pricing: {
        ...period.pricing,
        gasHedgeImpactPerMcf: modeledHedgeValue(
          gasImpact,
          "$/Mcf",
          period.period,
          (gasImpact === null
            ? "No calculable disclosed gas hedge settlement for this period."
            : "Calculated from disclosed daily swap/collar volumes and strikes against the scenario Henry Hub benchmark; basis swaps and unexercised swaptions are excluded.") +
            gasOverhedgeNote +
            settlementWarningNote
        ),
        oilHedgeImpactPerBbl: modeledHedgeValue(
          oilImpact,
          "$/bbl",
          period.period,
          (oilImpact === null
            ? "No calculable disclosed oil hedge settlement for this period."
            : "Calculated from disclosed oil three-way collars against the scenario WTI benchmark.") +
            oilOverhedgeNote
        ),
        nglHedgeImpactPerBbl: modeledHedgeValue(
          0,
          "$/bbl",
          period.period,
          "C3 and C5 hedge rows are stored, but no blended NGL hedge impact is applied without component-level C3/C5 market-price and production-mix assumptions."
        )
      }
    };
  });

  return {
    ...scenario,
    id: scenario.id.replace("complete", "hedged"),
    name: scenario.name.replace("Complete", "Hedged"),
    description: `${scenario.description} Disclosed commodity derivatives are mapped into quarterly realized pricing where the required market and production inputs are available.`,
    periods
  };
}

export function runRrcHedgedScenario(
  strategy: RrcPost2027Strategy = "maintenance",
  options: RrcCompleteScenarioOptions = {}
) {
  const scenario = buildRrcHedgedScenario(strategy, options);
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
      "Natural-gas swaps, collars, and three-way collars are mapped to quarterly realized pricing using disclosed contract terms.",
      "Oil three-way collars are mapped when active.",
      "Basis swaps remain excluded from settlement calculations because position-level fixed basis prices were not disclosed.",
      "Swaptions remain excluded unless exercise is confirmed.",
      "C3 and C5 hedges are retained in the derivative schedule but require component-level forward prices and production mix before blending into realized NGL pricing."
    ]
  };
}
