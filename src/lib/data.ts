import "server-only";
import fs from "node:fs";
import path from "node:path";
import type { DifferentialNormalizedData, GuidanceNormalizedData, HistoricalData, MarketData } from "./types";

const DATA_DIR = path.join(process.cwd(), "data");

function readJson<T>(filename: string): T {
  const filePath = path.join(DATA_DIR, filename);
  const raw = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(raw) as T;
}

export function getHistoricalData(): HistoricalData {
  return readJson<HistoricalData>("historical.json");
}

export function getMarketData(): MarketData {
  return readJson<MarketData>("market-data.json");
}

export function getGuidanceNormalized(): GuidanceNormalizedData {
  return readJson<GuidanceNormalizedData>("guidance_normalized.json");
}

export function getDifferentialsNormalized(): DifferentialNormalizedData {
  return readJson<DifferentialNormalizedData>("differentials_normalized.json");
}
