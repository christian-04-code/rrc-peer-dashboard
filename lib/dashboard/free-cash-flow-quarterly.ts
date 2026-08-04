import type { Ticker } from "@/lib/dashboard/types";
import { quarters, type Quarter, type SourcedValue } from "@/lib/dashboard/financials-quarterly";

const unavailable = (ticker: Ticker, quarter: Quarter): SourcedValue => ({
  value: null,
  source: "codex",
  basis: "derived",
  note: `${ticker} ${quarter} free cash flow has not yet been verified under the project definition.`
});

const RRC_FCF_NOTE =
  "Derived as Range cash flow from operations before changes in working capital less all-in capital spending. Both inputs are company-reported in quarterly earnings materials; values are standalone quarters in $MM. This is a non-GAAP derived measure and must not be silently mixed with a different peer FCF definition.";

const rrc: Record<Quarter, SourcedValue> = {
  "Q1 2024": { value: 137.898, source: "codex", basis: "derived", note: RRC_FCF_NOTE },
  "Q2 2024": { value: 61.902, source: "codex", basis: "derived", note: RRC_FCF_NOTE },
  "Q3 2024": { value: 94.0, source: "codex", basis: "derived", note: RRC_FCF_NOTE },
  "Q4 2024": { value: 158.654, source: "codex", basis: "derived", note: RRC_FCF_NOTE },
  "Q1 2025": { value: 250.391, source: "codex", basis: "derived", note: RRC_FCF_NOTE },
  "Q2 2025": { value: 147.0, source: "codex", basis: "derived", note: RRC_FCF_NOTE },
  "Q3 2025": { value: 89.254, source: "codex", basis: "derived", note: RRC_FCF_NOTE },
  "Q4 2025": { value: 169.532, source: "codex", basis: "derived", note: RRC_FCF_NOTE },
  "Q1 2026": { value: 406.0, source: "codex", basis: "derived", note: RRC_FCF_NOTE }
};

export const freeCashFlowQuarterly: Record<Ticker, Record<Quarter, SourcedValue>> = {
  RRC: rrc,
  AR: Object.fromEntries(quarters.map((quarter) => [quarter, unavailable("AR", quarter)])) as Record<Quarter, SourcedValue>,
  CNX: Object.fromEntries(quarters.map((quarter) => [quarter, unavailable("CNX", quarter)])) as Record<Quarter, SourcedValue>,
  CRK: Object.fromEntries(quarters.map((quarter) => [quarter, unavailable("CRK", quarter)])) as Record<Quarter, SourcedValue>,
  EQT: Object.fromEntries(quarters.map((quarter) => [quarter, unavailable("EQT", quarter)])) as Record<Quarter, SourcedValue>,
  EXE: Object.fromEntries(quarters.map((quarter) => [quarter, unavailable("EXE", quarter)])) as Record<Quarter, SourcedValue>,
  GPOR: Object.fromEntries(quarters.map((quarter) => [quarter, unavailable("GPOR", quarter)])) as Record<Quarter, SourcedValue>
};

export function getQuarterlyFreeCashFlow(ticker: Ticker, quarter: Quarter): SourcedValue {
  return freeCashFlowQuarterly[ticker][quarter];
}
