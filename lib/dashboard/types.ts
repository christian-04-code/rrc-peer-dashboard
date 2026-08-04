export type { Ticker } from "./company-registry";

export type Metric = "production" | "fcf" | "capex" | "debt" | "valuation";
export type Workspace = "chart" | "map";
export type FinancePanelTab = "guidance" | "financials";

export type InsightRow = { label?: string; text: string };
