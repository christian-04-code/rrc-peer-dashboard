export type HedgeCommodity = "natural_gas" | "oil" | "ngl";
export type HedgeInstrument = "swap" | "collar" | "three_way_collar" | "basis_swap";

export type HedgePosition = {
  id: string;
  commodity: HedgeCommodity;
  instrument: HedgeInstrument;
  index: string;
  startPeriod: string;
  endPeriod: string;
  volume: number | null;
  volumeUnit: "Mcf" | "MMBtu" | "bbl";
  fixedPrice?: number | null;
  fixedBasis?: number | null;
  floorPrice?: number | null;
  soldPutPrice?: number | null;
  ceilingPrice?: number | null;
  source: {
    name: string;
    reference?: string;
    period: string;
    retrievedAt: string;
    classification: "reported" | "guided" | "modeled";
    notes?: string;
  };
};

export type HedgeSettlementInput = {
  position: HedgePosition;
  marketPrice: number | null;
  observedBasis?: number | null;
};

export type HedgeSettlementResult = {
  positionId: string;
  settlement: number | null;
  unit: "$";
  warnings: string[];
};

function finite(value: number | null | undefined): value is number {
  return value !== null && value !== undefined && Number.isFinite(value);
}

export function calculateHedgeSettlement(
  input: HedgeSettlementInput
): HedgeSettlementResult {
  const { position, marketPrice, observedBasis } = input;
  const warnings: string[] = [];

  if (!finite(position.volume) || position.volume < 0) {
    warnings.push("Hedge volume is unavailable or invalid.");
    return { positionId: position.id, settlement: null, unit: "$", warnings };
  }

  if (position.instrument === "basis_swap") {
    if (!finite(position.fixedBasis) || !finite(observedBasis)) {
      warnings.push("Basis-swap fixed or observed basis is unavailable.");
      return { positionId: position.id, settlement: null, unit: "$", warnings };
    }
    return {
      positionId: position.id,
      settlement: position.volume * (position.fixedBasis - observedBasis),
      unit: "$",
      warnings
    };
  }

  if (!finite(marketPrice)) {
    warnings.push("Market price is unavailable.");
    return { positionId: position.id, settlement: null, unit: "$", warnings };
  }

  if (position.instrument === "swap") {
    if (!finite(position.fixedPrice)) {
      warnings.push("Swap fixed price is unavailable.");
      return { positionId: position.id, settlement: null, unit: "$", warnings };
    }
    return {
      positionId: position.id,
      settlement: position.volume * (position.fixedPrice - marketPrice),
      unit: "$",
      warnings
    };
  }

  if (position.instrument === "collar") {
    if (!finite(position.floorPrice) || !finite(position.ceilingPrice)) {
      warnings.push("Collar floor or ceiling is unavailable.");
      return { positionId: position.id, settlement: null, unit: "$", warnings };
    }
    const payoff =
      Math.max(position.floorPrice - marketPrice, 0) -
      Math.max(marketPrice - position.ceilingPrice, 0);
    return {
      positionId: position.id,
      settlement: position.volume * payoff,
      unit: "$",
      warnings
    };
  }

  if (
    !finite(position.floorPrice) ||
    !finite(position.soldPutPrice) ||
    !finite(position.ceilingPrice)
  ) {
    warnings.push("Three-way collar strikes are incomplete.");
    return { positionId: position.id, settlement: null, unit: "$", warnings };
  }

  const payoff =
    Math.max(position.floorPrice - marketPrice, 0) -
    Math.max(position.soldPutPrice - marketPrice, 0) -
    Math.max(marketPrice - position.ceilingPrice, 0);

  return {
    positionId: position.id,
    settlement: position.volume * payoff,
    unit: "$",
    warnings
  };
}

export function calculateHedgePortfolioSettlement(
  inputs: HedgeSettlementInput[]
): { settlement: number | null; results: HedgeSettlementResult[]; warnings: string[] } {
  const results = inputs.map(calculateHedgeSettlement);
  const warnings = results.flatMap((result) => result.warnings);
  if (results.some((result) => result.settlement === null)) {
    return { settlement: null, results, warnings };
  }
  return {
    settlement: results.reduce((sum, result) => sum + (result.settlement ?? 0), 0),
    results,
    warnings
  };
}
