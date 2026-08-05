import { rrcDisclosedCommodityHedges } from "@/lib/forecast/data/rrc-derivatives";
import { calculateHedgePortfolioSettlement, type HedgePosition } from "@/lib/forecast/hedges";

export type RrcHedgeMarketInputs = {
  period: string;
  startDate: string;
  endDate: string;
  henryHubPerMmbtu: number | null;
  wtiPerBbl: number | null;
  c3PerBbl: number | null;
  c5PerBbl: number | null;
};

function dateOnly(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date: ${value}`);
  return date;
}

function overlapDays(
  periodStart: string,
  periodEnd: string,
  hedgeStart: string,
  hedgeEnd: string
): number {
  const start = Math.max(dateOnly(periodStart).getTime(), dateOnly(hedgeStart).getTime());
  const end = Math.min(dateOnly(periodEnd).getTime(), dateOnly(hedgeEnd).getTime());
  if (end < start) return 0;
  return Math.floor((end - start) / 86_400_000) + 1;
}

function marketPrice(position: HedgePosition, inputs: RrcHedgeMarketInputs): number | null {
  if (position.commodity === "natural_gas") return inputs.henryHubPerMmbtu;
  if (position.commodity === "oil") return inputs.wtiPerBbl;
  if (position.index === "C3 propane") return inputs.c3PerBbl;
  if (position.index === "C5 natural gasoline") return inputs.c5PerBbl;
  return null;
}

export function calculateRrcQuarterlyHedgeSettlements(inputs: RrcHedgeMarketInputs) {
  const active = rrcDisclosedCommodityHedges
    .map((position) => ({
      position,
      days: overlapDays(inputs.startDate, inputs.endDate, position.startPeriod, position.endPeriod)
    }))
    .filter(({ days }) => days > 0)
    .map(({ position, days }) => ({
      position: {
        ...position,
        volume: position.volume === null ? null : position.volume * days,
        source: {
          ...position.source,
          notes: `${position.source.notes ?? ""} Settlement volume expanded from disclosed daily volume across ${days} covered days.`.trim()
        }
      },
      marketPrice: marketPrice(position, inputs)
    }));

  const byCommodity = {
    naturalGas: calculateHedgePortfolioSettlement(
      active.filter(({ position }) => position.commodity === "natural_gas")
    ),
    oil: calculateHedgePortfolioSettlement(
      active.filter(({ position }) => position.commodity === "oil")
    ),
    ngl: calculateHedgePortfolioSettlement(
      active.filter(({ position }) => position.commodity === "ngl")
    )
  };

  function hedgedVolume(commodity: "natural_gas" | "oil" | "ngl"): number {
    return active
      .filter((entry) => entry.position.commodity === commodity)
      .reduce((sum, entry) => sum + (entry.position.volume ?? 0), 0);
  }

  const hedgedVolumeByCommodity = {
    naturalGas: hedgedVolume("natural_gas"),
    oil: hedgedVolume("oil"),
    ngl: hedgedVolume("ngl")
  };

  return {
    period: inputs.period,
    activePositionCount: active.length,
    byCommodity,
    hedgedVolumeByCommodity,
    warnings: [
      ...byCommodity.naturalGas.warnings,
      ...byCommodity.oil.warnings,
      ...byCommodity.ngl.warnings
    ],
    notes: [
      "Settlement values are scenario calculations based on disclosed contract terms and supplied market prices; they are not reported realized settlements.",
      "Natural-gas swaptions are excluded unless exercise is confirmed.",
      "Aggregate basis swaps are excluded because the filing does not disclose position-level fixed basis prices."
    ]
  };
}
