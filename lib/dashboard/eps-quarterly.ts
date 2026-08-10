/**
 * Quarterly diluted EPS ($/share), standalone quarter, actual (not estimate).
 *
 * Source: Peer_Comp_Site_Data/Facset/E&P_Facset_Company_Model.xlsx, RRC sheet,
 * "EPS ($/share)" row, the 9 "A" (actual) quarterly columns Q1 2024A-Q1 2026A.
 * Same file and column set already used for RRC netIncome in
 * lib/dashboard/financials-quarterly.ts (there: "Reported Net Income ($mm)", the row
 * directly below this one). Only RRC has this line extracted; the Codex workbook does
 * not carry EPS, and this file's EPS/Share Price/Market Cap/Price-Earnings rows are only
 * populated for RRC in the reviewed workbook -- other peer tickers render "--".
 */

import type { Quarter } from "./financials-quarterly";
import type { Ticker } from "./company-registry";

export type EpsValue = { value: number; source: "factset"; note: string };

const RRC_EPS: Record<Quarter, EpsValue> = {
  "Q1 2024": { value: 0.69, source: "factset", note: "FactSet E&P model, RRC sheet, EPS ($/share) row, Q1 2024A." },
  "Q2 2024": { value: 0.46, source: "factset", note: "FactSet E&P model, RRC sheet, EPS ($/share) row, Q2 2024A." },
  "Q3 2024": { value: 0.48, source: "factset", note: "FactSet E&P model, RRC sheet, EPS ($/share) row, Q3 2024A." },
  "Q4 2024": { value: 0.68, source: "factset", note: "FactSet E&P model, RRC sheet, EPS ($/share) row, Q4 2024A." },
  "Q1 2025": { value: 0.96, source: "factset", note: "FactSet E&P model, RRC sheet, EPS ($/share) row, Q1 2025A." },
  "Q2 2025": { value: 0.66, source: "factset", note: "FactSet E&P model, RRC sheet, EPS ($/share) row, Q2 2025A." },
  "Q3 2025": { value: 0.57, source: "factset", note: "FactSet E&P model, RRC sheet, EPS ($/share) row, Q3 2025A." },
  "Q4 2025": { value: 0.82, source: "factset", note: "FactSet E&P model, RRC sheet, EPS ($/share) row, Q4 2025A." },
  "Q1 2026": { value: 1.52, source: "factset", note: "FactSet E&P model, RRC sheet, EPS ($/share) row, Q1 2026A." }
};

const data: Partial<Record<Ticker, Record<Quarter, EpsValue>>> = {
  RRC: RRC_EPS
};

export function getQuarterlyEps(ticker: Ticker, quarter: Quarter): EpsValue | undefined {
  return data[ticker]?.[quarter];
}
