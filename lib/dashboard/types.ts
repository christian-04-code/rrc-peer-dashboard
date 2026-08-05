export type { Ticker } from "./company-registry";

export type Metric = "production" | "fcf" | "capex" | "debt" | "valuation";
export type Workspace = "chart" | "map";
export type View = "dashboard" | "peers" | "macro" | "forecast";

export type InsightRow = { label?: string; text: string };
