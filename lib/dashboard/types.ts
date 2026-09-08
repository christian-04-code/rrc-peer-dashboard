export type { Ticker } from "./company-registry";

export type Metric = "production" | "revenue" | "fcf" | "capex" | "debt" | "ebitdax";
export type Workspace = "chart" | "map";
export type View = "dashboard" | "macro" | "forecast" | "news";

export type InsightRow = { label?: string; text: string };
