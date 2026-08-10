import type { Ticker } from "./company-registry";

// Stable per-company identity color, independent of primary/comparison selection
// order or which chart metric is active. Chosen for readability against the
// dark dashboard background (--bg: #06111f).
const COMPANY_COLORS: Record<Ticker, string> = {
  RRC: "#0081c6", // blue -- matches the existing site accent color
  AR: "#74c7a2", // green
  EQT: "#e98ca8", // pink
  CNX: "#9b8cff", // violet
  CRK: "#e0b56f", // amber
  EXE: "#c2cf72", // olive
  GPOR: "#4fd1c5" // teal
};

export function getCompanyColor(ticker: Ticker): string {
  return COMPANY_COLORS[ticker];
}
