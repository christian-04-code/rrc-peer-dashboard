/**
 * Quarterly diluted EPS ($/share) and reported net income ($MM), standalone
 * quarter, actual (not estimate), for the seven core peers.
 *
 * Source: Peer_Comp_Site_Data/Facset/E&P_Facset_Company_Model.xlsx, each peer
 * sheet, "EPS ($/share)" and "Reported Net Income ($mm)" rows, actual columns
 * Q1 2024A-Q2 2026A. GPOR Q2 2026 is explicitly #N/A in both source rows and
 * remains unavailable. The nine previously stored RRC values were reconciled
 * exactly before the remaining actual-period cells were added.
 */

import type { Quarter, SourcedValue } from "./financials-quarterly";
import type { Ticker } from "./company-registry";

export type EpsValue = { value: number; source: "factset"; note: string };

type QuarterlyEarnings = {
  eps: number;
  netIncome: number;
};

const actuals: Record<Ticker, Partial<Record<Quarter, QuarterlyEarnings>>> = {
  RRC: {
    "Q1 2024": { eps: 0.69, netIncome: 92.138 },
    "Q2 2024": { eps: 0.46, netIncome: 28.704 },
    "Q3 2024": { eps: 0.48, netIncome: 50.656 },
    "Q4 2024": { eps: 0.68, netIncome: 94.842 },
    "Q1 2025": { eps: 0.96, netIncome: 97.052 },
    "Q2 2025": { eps: 0.66, netIncome: 237.578 },
    "Q3 2025": { eps: 0.57, netIncome: 144.307 },
    "Q4 2025": { eps: 0.82, netIncome: 179.087 },
    "Q1 2026": { eps: 1.52, netIncome: 341.63 },
    "Q2 2026": { eps: 0.79, netIncome: 195.323 }
  },
  AR: {
    "Q1 2024": { eps: 0.070755, netIncome: 36.345 },
    "Q2 2024": { eps: -0.192758, netIncome: -65.663 },
    "Q3 2024": { eps: -0.122801, netIncome: -20.444 },
    "Q4 2024": { eps: 0.578688, netIncome: 149.649 },
    "Q1 2025": { eps: 0.783247, netIncome: 207.971 },
    "Q2 2025": { eps: 0.351268, netIncome: 156.585 },
    "Q3 2025": { eps: 0.150135, netIncome: 76.179 },
    "Q4 2025": { eps: 0.424486, netIncome: 193.683 },
    "Q1 2026": { eps: 1.146459, netIncome: 535 },
    "Q2 2026": { eps: 0.761931, netIncome: 278.657 }
  },
  CNX: {
    "Q1 2024": { eps: 0.462665, netIncome: 6.851 },
    "Q2 2024": { eps: 0.358348, netIncome: -18.261 },
    "Q3 2024": { eps: 0.409081, netIncome: 65.54 },
    "Q4 2024": { eps: 0.574174, netIncome: -144.624 },
    "Q1 2025": { eps: 0.784806, netIncome: -197.715 },
    "Q2 2025": { eps: 0.59692, netIncome: 432 },
    "Q3 2025": { eps: 0.493946, netIncome: 202.103 },
    "Q4 2025": { eps: 0.678198, netIncome: 196.253 },
    "Q1 2026": { eps: 1.212994, netIncome: 348.147 },
    "Q2 2026": { eps: 0.715952, netIncome: 202.943 }
  },
  CRK: {
    "Q1 2024": { eps: -0.03, netIncome: -14.474 },
    "Q2 2024": { eps: -0.2, netIncome: -123.249 },
    "Q3 2024": { eps: -0.17, netIncome: -28.891 },
    "Q4 2024": { eps: 0.16, netIncome: -58.129 },
    "Q1 2025": { eps: 0.18, netIncome: -121.278 },
    "Q2 2025": { eps: 0.13, netIncome: 130.728 },
    "Q3 2025": { eps: 0.09, netIncome: 111.128 },
    "Q4 2025": { eps: 0.16, netIncome: 280.919 },
    "Q1 2026": { eps: 0.15, netIncome: 107.45 },
    "Q2 2026": { eps: 0.03, netIncome: 8.766 }
  },
  EQT: {
    "Q1 2024": { eps: 0.82, netIncome: 103.488 },
    "Q2 2024": { eps: -0.08, netIncome: 9.517 },
    "Q3 2024": { eps: 0.12, netIncome: -300.823 },
    "Q4 2024": { eps: 0.69, netIncome: 418.395 },
    "Q1 2025": { eps: 1.18, netIncome: 242.139 },
    "Q2 2025": { eps: 0.45, netIncome: 784.147 },
    "Q3 2025": { eps: 0.52, netIncome: 336 },
    "Q4 2025": { eps: 0.9, netIncome: 677.099 },
    "Q1 2026": { eps: 2.33, netIncome: 1487.229 },
    "Q2 2026": { eps: 0.39, netIncome: 211.425 }
  },
  EXE: {
    "Q1 2024": { eps: 0.56, netIncome: 26 },
    "Q2 2024": { eps: 0.01, netIncome: -227 },
    "Q3 2024": { eps: 0.16, netIncome: -114 },
    "Q4 2024": { eps: 0.55, netIncome: -399 },
    "Q1 2025": { eps: 2.02, netIncome: -249 },
    "Q2 2025": { eps: 1.1, netIncome: 968 },
    "Q3 2025": { eps: 0.97, netIncome: 547 },
    "Q4 2025": { eps: 2, netIncome: 553 },
    "Q1 2026": { eps: 3.83, netIncome: 1159 },
    "Q2 2026": { eps: 1.33, netIncome: 522 }
  },
  GPOR: {
    "Q1 2024": { eps: 3.774422, netIncome: 52.035 },
    "Q2 2024": { eps: 2.98, netIncome: -26.2 },
    "Q3 2024": { eps: 3.367487, netIncome: -13.967 },
    "Q4 2024": { eps: 4.743683, netIncome: -273.242 },
    "Q1 2025": { eps: 5.629513, netIncome: -0.464 },
    "Q2 2025": { eps: 5.42, netIncome: 184.5 },
    "Q3 2025": { eps: 4.933488, netIncome: 81.407 },
    "Q4 2025": { eps: 5.750792, netIncome: 132.415 },
    "Q1 2026": { eps: 7.280162, netIncome: 165.8 }
  }
};

export function getQuarterlyEps(ticker: Ticker, quarter: Quarter): EpsValue | undefined {
  const value = actuals[ticker]?.[quarter]?.eps;
  return value === undefined ? undefined : {
    value,
    source: "factset",
    note: `FactSet E&P model, ${ticker} sheet, EPS ($/share) row, ${quarter}A.`
  };
}

export function getQuarterlyNetIncome(ticker: Ticker, quarter: Quarter): SourcedValue | undefined {
  const value = actuals[ticker]?.[quarter]?.netIncome;
  return value === undefined ? undefined : {
    value,
    source: "factset",
    basis: "actual",
    note: `FactSet E&P model, ${ticker} sheet, Reported Net Income ($mm) row, ${quarter}A.`
  };
}
