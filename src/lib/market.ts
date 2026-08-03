import type { MarketData } from "./types";

export interface BackdropTile {
  label: string;
  value: number | null;
  unit: string;
  deltaLabel: string | null;
  deltaDirection: "pos" | "neg" | "flat";
  asOf: string | null;
}

/** Henry Hub: latest daily print + % change vs. the trading day ~7 calendar days prior. */
export function getHenryHubTile(market: MarketData): BackdropTile {
  const entries = Object.entries(market.henry_hub_daily_spot_price_usd_per_mmbtu).sort(
    ([a], [b]) => a.localeCompare(b),
  );
  if (entries.length === 0) {
    return { label: "Henry Hub Spot", value: null, unit: "$/MMBtu", deltaLabel: null, deltaDirection: "flat", asOf: null };
  }
  const [latestDate, latestValue] = entries[entries.length - 1] as [string, number];
  const latestMs = new Date(latestDate).getTime();
  const targetMs = latestMs - 7 * 24 * 60 * 60 * 1000;

  let priorEntry: [string, number] | null = null;
  for (let i = entries.length - 2; i >= 0; i--) {
    const [d, v] = entries[i] as [string, number];
    if (new Date(d).getTime() <= targetMs) {
      priorEntry = [d, v];
      break;
    }
  }

  let deltaLabel: string | null = null;
  let deltaDirection: "pos" | "neg" | "flat" = "flat";
  if (priorEntry && priorEntry[1] !== 0) {
    const pctChange = ((latestValue - priorEntry[1]) / Math.abs(priorEntry[1])) * 100;
    deltaDirection = pctChange > 0.05 ? "pos" : pctChange < -0.05 ? "neg" : "flat";
    const arrow = deltaDirection === "pos" ? "▲" : deltaDirection === "neg" ? "▼" : "—";
    deltaLabel = `${arrow} ${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(1)}% wk/wk`;
  }

  return {
    label: "Henry Hub Spot",
    value: latestValue,
    unit: "$/MMBtu",
    deltaLabel,
    deltaDirection,
    asOf: latestDate,
  };
}

/** L48 working gas storage: latest EIA weekly print + the raw week-over-week build/draw. */
export function getStorageTiles(market: MarketData): { level: BackdropTile; build: BackdropTile } {
  const rows = market.eia_weekly_working_gas_storage_bcf;
  if (rows.length === 0) {
    const empty: BackdropTile = { label: "", value: null, unit: "Bcf", deltaLabel: null, deltaDirection: "flat", asOf: null };
    return { level: empty, build: empty };
  }
  const latest = rows[rows.length - 1] as NonNullable<(typeof rows)[number]>;
  const prior = rows.length > 1 ? (rows[rows.length - 2] as NonNullable<(typeof rows)[number]>) : null;
  const latestVal = latest["Lower 48 (Bcf)"];
  const priorVal = prior ? prior["Lower 48 (Bcf)"] : null;
  const build = priorVal !== null && priorVal !== undefined ? latestVal - priorVal : null;

  const buildDirection: "pos" | "neg" | "flat" = build === null ? "flat" : build > 0 ? "pos" : build < 0 ? "neg" : "flat";
  const buildArrow = buildDirection === "pos" ? "▲" : buildDirection === "neg" ? "▼" : "—";

  const levelDirection: "pos" | "neg" | "flat" = build === null ? "flat" : build > 0 ? "pos" : build < 0 ? "neg" : "flat";
  const levelArrow = levelDirection === "pos" ? "▲" : levelDirection === "neg" ? "▼" : "—";

  return {
    level: {
      label: "L48 Gas Storage",
      value: latestVal,
      unit: "Bcf",
      deltaLabel: build === null ? null : `${levelArrow} ${build >= 0 ? "+" : ""}${build.toFixed(0)} Bcf wk/wk`,
      deltaDirection: levelDirection,
      asOf: latest.date,
    },
    build: {
      label: "Weekly Storage Build",
      value: build,
      unit: "Bcf",
      deltaLabel: build === null ? null : `${buildArrow} vs. prior week`,
      deltaDirection: buildDirection,
      asOf: latest.date,
    },
  };
}

/** US propane stocks (EIA weekly): latest level + wk/wk % change. Stands in for the WTI slot, which has no source data in market-data.json. */
export function getPropaneTile(market: MarketData): BackdropTile {
  const rows = market.eia_weekly_propane_stocks as Array<Record<string, unknown>>;
  if (rows.length === 0) {
    return { label: "US Propane Stocks", value: null, unit: "MMBbl", deltaLabel: null, deltaDirection: "flat", asOf: null };
  }
  const latest = rows[rows.length - 1] as Record<string, unknown>;
  const prior = rows.length > 1 ? (rows[rows.length - 2] as Record<string, unknown>) : null;
  const latestVal = latest["Stocks (MMBbl)"] as number;
  const priorVal = prior ? (prior["Stocks (MMBbl)"] as number) : null;

  let deltaLabel: string | null = null;
  let deltaDirection: "pos" | "neg" | "flat" = "flat";
  if (priorVal !== null && priorVal !== 0) {
    const pctChange = ((latestVal - priorVal) / Math.abs(priorVal)) * 100;
    deltaDirection = pctChange > 0.05 ? "pos" : pctChange < -0.05 ? "neg" : "flat";
    const arrow = deltaDirection === "pos" ? "▲" : deltaDirection === "neg" ? "▼" : "—";
    deltaLabel = `${arrow} ${pctChange >= 0 ? "+" : ""}${pctChange.toFixed(1)}% wk/wk`;
  }

  return {
    label: "US Propane Stocks",
    value: latestVal,
    unit: "MMBbl",
    deltaLabel,
    deltaDirection,
    asOf: latest.date as string,
  };
}

/** US electric demand, Total United States row: latest published wk/wk % change (value is already a delta, not a level). */
export function getElectricDemandTile(market: MarketData): BackdropTile {
  const rows = market.us_electric_demand_pct_change_vs_prior_week;
  const totalRow = rows.find((r) => r.region === "Total United States");
  if (!totalRow) {
    return { label: "US Electric Demand", value: null, unit: "% wk/wk", deltaLabel: null, deltaDirection: "flat", asOf: null };
  }
  const dateKeys = Object.keys(totalRow).filter((k) => k !== "region");
  const sortedDates = dateKeys
    .filter((k) => totalRow[k] !== null && totalRow[k] !== undefined)
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  const latestDate = sortedDates[0];
  if (!latestDate) {
    return { label: "US Electric Demand", value: null, unit: "% wk/wk", deltaLabel: null, deltaDirection: "flat", asOf: null };
  }
  const value = totalRow[latestDate] as number;
  const direction: "pos" | "neg" | "flat" = value > 0.05 ? "pos" : value < -0.05 ? "neg" : "flat";
  const arrow = direction === "pos" ? "▲" : direction === "neg" ? "▼" : "—";

  return {
    label: "US Electric Demand",
    value,
    unit: "% wk/wk",
    deltaLabel: `${arrow} vs. prior week`,
    deltaDirection: direction,
    asOf: latestDate,
  };
}
