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

const CNX_FCF_NOTE =
  "FactSet E&P workbook per-cell fallback because the primary Codex quarterly template does not contain a CNX free cash flow series. Values come from the historical quarterly Free Cash Flow row in the CNX staging sheet, are standalone quarters in $MM, and remain source-tagged FactSet. They must be replaced rather than blended if a filing-verified Codex series is added later.";

const CRK_FCF_NOTE =
  "FactSet E&P workbook per-cell fallback because the primary Codex quarterly template does not contain a CRK free cash flow series. FactSet models FCF from its quarterly operating cash flow and capital expenditure rows. Values are standalone quarters in $MM, source-tagged FactSet, and must not overwrite or be silently blended with a future filing-verified Codex series.";

const EXE_FCF_NOTE =
  "FactSet E&P workbook per-cell fallback because the primary Codex quarterly template does not contain an EXE free cash flow series. Values come from the historical quarterly Free Cash Flow row in the EXE staging sheet, are standalone quarters in $MM, and remain source-tagged FactSet. They must be replaced rather than blended if a filing-verified Codex series is added later.";

const GPOR_FCF_NOTE =
  "FactSet E&P workbook per-cell fallback because the primary Codex quarterly template does not contain a GPOR free cash flow series. Values come from the historical quarterly Free Cash Flow row in the GPOR staging sheet, are standalone quarters in $MM, and remain source-tagged FactSet. They must be replaced rather than blended if a filing-verified Codex series is added later.";

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

const cnx: Record<Quarter, SourcedValue> = {
  "Q1 2024": { value: 25.0, source: "factset", basis: "derived", note: CNX_FCF_NOTE },
  "Q2 2024": { value: 47.0, source: "factset", basis: "derived", note: CNX_FCF_NOTE },
  "Q3 2024": { value: 60.0, source: "factset", basis: "derived", note: CNX_FCF_NOTE },
  "Q4 2024": { value: 199.0, source: "factset", basis: "derived", note: CNX_FCF_NOTE },
  "Q1 2025": { value: 100.0, source: "factset", basis: "derived", note: CNX_FCF_NOTE },
  "Q2 2025": { value: 188.0, source: "factset", basis: "derived", note: CNX_FCF_NOTE },
  "Q3 2025": { value: 226.0, source: "factset", basis: "derived", note: CNX_FCF_NOTE },
  "Q4 2025": { value: 132.0, source: "factset", basis: "derived", note: CNX_FCF_NOTE },
  "Q1 2026": { value: 139.0, source: "factset", basis: "derived", note: CNX_FCF_NOTE }
};

const crk: Record<Quarter, SourcedValue> = {
  "Q1 2024": { value: -73.536, source: "factset", basis: "derived", note: CRK_FCF_NOTE },
  "Q2 2024": { value: -109.5855, source: "factset", basis: "derived", note: CRK_FCF_NOTE },
  "Q3 2024": { value: -41.674, source: "factset", basis: "derived", note: CRK_FCF_NOTE },
  "Q4 2024": { value: -51.0, source: "factset", basis: "derived", note: CRK_FCF_NOTE },
  "Q1 2025": { value: -22.004, source: "factset", basis: "derived", note: CRK_FCF_NOTE },
  "Q2 2025": { value: -68.498, source: "factset", basis: "derived", note: CRK_FCF_NOTE },
  "Q3 2025": { value: -92.35, source: "factset", basis: "derived", note: CRK_FCF_NOTE },
  "Q4 2025": { value: -67.0, source: "factset", basis: "derived", note: CRK_FCF_NOTE },
  "Q1 2026": { value: -151.4, source: "factset", basis: "derived", note: CRK_FCF_NOTE }
};

const exe: Record<Quarter, SourcedValue> = {
  "Q1 2024": { value: 112.0, source: "factset", basis: "derived", note: EXE_FCF_NOTE },
  "Q2 2024": { value: -119.0, source: "factset", basis: "derived", note: EXE_FCF_NOTE },
  "Q3 2024": { value: 98.0, source: "factset", basis: "derived", note: EXE_FCF_NOTE },
  "Q4 2024": { value: -154.0, source: "factset", basis: "derived", note: EXE_FCF_NOTE },
  "Q1 2025": { value: 577.0, source: "factset", basis: "derived", note: EXE_FCF_NOTE },
  "Q2 2025": { value: 692.0, source: "factset", basis: "derived", note: EXE_FCF_NOTE },
  "Q3 2025": { value: 423.0, source: "factset", basis: "derived", note: EXE_FCF_NOTE },
  "Q4 2025": { value: 218.0, source: "factset", basis: "derived", note: EXE_FCF_NOTE },
  "Q1 2026": { value: 1704.0, source: "factset", basis: "derived", note: EXE_FCF_NOTE }
};

const gpor: Record<Quarter, SourcedValue> = {
  "Q1 2024": { value: 53.0, source: "factset", basis: "derived", note: GPOR_FCF_NOTE },
  "Q2 2024": { value: 26.0, source: "factset", basis: "derived", note: GPOR_FCF_NOTE },
  "Q3 2024": { value: 58.0, source: "factset", basis: "derived", note: GPOR_FCF_NOTE },
  "Q4 2024": { value: 125.21, source: "factset", basis: "derived", note: GPOR_FCF_NOTE },
  "Q1 2025": { value: 36.6, source: "factset", basis: "derived", note: GPOR_FCF_NOTE },
  "Q2 2025": { value: 73.85, source: "factset", basis: "derived", note: GPOR_FCF_NOTE },
  "Q3 2025": { value: 105.0, source: "factset", basis: "derived", note: GPOR_FCF_NOTE },
  "Q4 2025": { value: 129.25, source: "factset", basis: "derived", note: GPOR_FCF_NOTE },
  "Q1 2026": { value: 124.2, source: "factset", basis: "derived", note: GPOR_FCF_NOTE }
};

export const freeCashFlowQuarterly: Record<Ticker, Record<Quarter, SourcedValue>> = {
  RRC: rrc,
  AR: Object.fromEntries(quarters.map((quarter) => [quarter, unavailable("AR", quarter)])) as Record<Quarter, SourcedValue>,
  CNX: cnx,
  CRK: crk,
  EQT: Object.fromEntries(quarters.map((quarter) => [quarter, unavailable("EQT", quarter)])) as Record<Quarter, SourcedValue>,
  EXE: exe,
  GPOR: gpor
};

export function getQuarterlyFreeCashFlow(ticker: Ticker, quarter: Quarter): SourcedValue {
  return freeCashFlowQuarterly[ticker][quarter];
}
