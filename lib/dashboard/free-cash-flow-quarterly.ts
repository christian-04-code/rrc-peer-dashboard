import type { Ticker } from "@/lib/dashboard/types";
import { type Quarter, type SourcedValue } from "@/lib/dashboard/financials-quarterly";

const RRC_FCF_NOTE =
  "Derived as Range cash flow from operations before changes in working capital less all-in capital spending. Both inputs are company-reported in quarterly earnings materials; values are standalone quarters in $MM. This is a non-GAAP derived measure and must not be silently mixed with a different peer FCF definition.";

const AR_FCF_NOTE =
  "FactSet E&P workbook per-cell fallback because the primary Codex quarterly template does not contain an AR free cash flow series. Values come from the historical quarterly Free Cash Flow row in the AR staging sheet, are standalone quarters in $MM, and remain source-tagged FactSet. They must be replaced rather than blended if a filing-verified Codex series is added later.";

const CNX_FCF_NOTE =
  "FactSet E&P workbook per-cell fallback because the primary Codex quarterly template does not contain a CNX free cash flow series. Values come from the historical quarterly Free Cash Flow row in the CNX staging sheet, are standalone quarters in $MM, and remain source-tagged FactSet. They must be replaced rather than blended if a filing-verified Codex series is added later.";

const CRK_FCF_NOTE =
  "FactSet E&P workbook per-cell fallback because the primary Codex quarterly template does not contain a CRK free cash flow series. FactSet models FCF from its quarterly operating cash flow and capital expenditure rows. Values are standalone quarters in $MM, source-tagged FactSet, and must not overwrite or be silently blended with a future filing-verified Codex series.";

const EQT_FCF_NOTE =
  "FactSet E&P workbook per-cell fallback because the primary Codex quarterly template does not contain an EQT free cash flow series. Values come from the historical quarterly Free Cash Flow row in the EQT staging sheet, are standalone quarters in $MM, and remain source-tagged FactSet. They must be replaced rather than blended if a filing-verified Codex series is added later.";

const EXE_FCF_NOTE =
  "FactSet E&P workbook per-cell fallback because the primary Codex quarterly template does not contain an EXE free cash flow series. Values come from the historical quarterly Free Cash Flow row in the EXE staging sheet, are standalone quarters in $MM, and remain source-tagged FactSet. They must be replaced rather than blended if a filing-verified Codex series is added later.";

const GPOR_FCF_NOTE =
  "FactSet E&P workbook per-cell fallback because the primary Codex quarterly template does not contain a GPOR free cash flow series. Values come from the historical quarterly Free Cash Flow row in the GPOR staging sheet, are standalone quarters in $MM, and remain source-tagged FactSet. They must be replaced rather than blended if a filing-verified Codex series is added later.";

const rrc: Partial<Record<Quarter, SourcedValue>> = {
  "Q1 2024": { value: 137.898, source: "codex", basis: "derived", note: RRC_FCF_NOTE },
  "Q2 2024": { value: 61.902, source: "codex", basis: "derived", note: RRC_FCF_NOTE },
  "Q3 2024": { value: 94.0, source: "codex", basis: "derived", note: RRC_FCF_NOTE },
  "Q4 2024": { value: 158.654, source: "codex", basis: "derived", note: RRC_FCF_NOTE },
  "Q1 2025": { value: 250.391, source: "codex", basis: "derived", note: RRC_FCF_NOTE },
  "Q2 2025": { value: 147.0, source: "codex", basis: "derived", note: RRC_FCF_NOTE },
  "Q3 2025": { value: 89.254, source: "codex", basis: "derived", note: RRC_FCF_NOTE },
  "Q4 2025": { value: 169.532, source: "codex", basis: "derived", note: RRC_FCF_NOTE },
  "Q1 2026": { value: 406.0, source: "codex", basis: "derived", note: RRC_FCF_NOTE },
  "Q2 2026": { value: 111.0, source: "codex", basis: "derived", note: `${RRC_FCF_NOTE} Exact underlying Q2 2026 derivation is $332.510MM less $222.000MM, or $110.510MM; stored as $111MM under the site's nearest-$MM convention.` }
};

const ar: Partial<Record<Quarter, SourcedValue>> = {
  "Q1 2024": { value: 29.874, source: "factset", basis: "derived", note: AR_FCF_NOTE },
  "Q2 2024": { value: -42.8755, source: "factset", basis: "derived", note: AR_FCF_NOTE },
  "Q3 2024": { value: -6.0, source: "factset", basis: "derived", note: AR_FCF_NOTE },
  "Q4 2024": { value: 160.0, source: "factset", basis: "derived", note: AR_FCF_NOTE },
  "Q1 2025": { value: 336.4715, source: "factset", basis: "derived", note: AR_FCF_NOTE },
  "Q2 2025": { value: 179.0, source: "factset", basis: "derived", note: AR_FCF_NOTE },
  "Q3 2025": { value: -145.5, source: "factset", basis: "derived", note: AR_FCF_NOTE },
  "Q4 2025": { value: 186.5, source: "factset", basis: "derived", note: AR_FCF_NOTE },
  "Q1 2026": { value: 464.55, source: "factset", basis: "derived", note: AR_FCF_NOTE },
  "Q2 2026": { value: 219.759, source: "codex", basis: "actual", note: "Approved audited AR standalone Q2 2026 free cash flow under the existing live-series definition." }
};

const cnx: Partial<Record<Quarter, SourcedValue>> = {
  "Q1 2024": { value: 25.0, source: "factset", basis: "derived", note: CNX_FCF_NOTE },
  "Q2 2024": { value: 47.0, source: "factset", basis: "derived", note: CNX_FCF_NOTE },
  "Q3 2024": { value: 60.0, source: "factset", basis: "derived", note: CNX_FCF_NOTE },
  "Q4 2024": { value: 199.0, source: "factset", basis: "derived", note: CNX_FCF_NOTE },
  "Q1 2025": { value: 100.0, source: "factset", basis: "derived", note: CNX_FCF_NOTE },
  "Q2 2025": { value: 188.0, source: "factset", basis: "derived", note: CNX_FCF_NOTE },
  "Q3 2025": { value: 226.0, source: "factset", basis: "derived", note: CNX_FCF_NOTE },
  "Q4 2025": { value: 132.0, source: "factset", basis: "derived", note: CNX_FCF_NOTE },
  "Q1 2026": { value: 139.0, source: "factset", basis: "derived", note: CNX_FCF_NOTE },
  "Q2 2026": { value: 138.0, source: "codex", basis: "actual", note: "Approved audited CNX standalone Q2 2026 free cash flow under the existing live-series definition." }
};

const crk: Partial<Record<Quarter, SourcedValue>> = {
  "Q1 2024": { value: -73.536, source: "factset", basis: "derived", note: CRK_FCF_NOTE },
  "Q2 2024": { value: -109.5855, source: "factset", basis: "derived", note: CRK_FCF_NOTE },
  "Q3 2024": { value: -41.674, source: "factset", basis: "derived", note: CRK_FCF_NOTE },
  "Q4 2024": { value: -51.0, source: "factset", basis: "derived", note: CRK_FCF_NOTE },
  "Q1 2025": { value: -22.004, source: "factset", basis: "derived", note: CRK_FCF_NOTE },
  "Q2 2025": { value: -68.498, source: "factset", basis: "derived", note: CRK_FCF_NOTE },
  "Q3 2025": { value: -92.35, source: "factset", basis: "derived", note: CRK_FCF_NOTE },
  "Q4 2025": { value: -67.0, source: "factset", basis: "derived", note: CRK_FCF_NOTE },
  "Q1 2026": { value: -151.4, source: "factset", basis: "derived", note: CRK_FCF_NOTE },
  "Q2 2026": { value: null, source: "codex", basis: "actual", note: "CRK Q2 2026 free cash flow was not safely resolved in the approved audit; intentionally unavailable, never zero, carried forward, or estimated." }
};

const eqt: Partial<Record<Quarter, SourcedValue>> = {
  "Q1 2024": { value: 401.554, source: "factset", basis: "derived", note: EQT_FCF_NOTE },
  "Q2 2024": { value: -171.0, source: "factset", basis: "derived", note: EQT_FCF_NOTE },
  "Q3 2024": { value: -47.0, source: "factset", basis: "derived", note: EQT_FCF_NOTE },
  "Q4 2024": { value: 580.223, source: "factset", basis: "derived", note: EQT_FCF_NOTE },
  "Q1 2025": { value: 1151.0, source: "factset", basis: "derived", note: EQT_FCF_NOTE },
  "Q2 2025": { value: 240.0, source: "factset", basis: "derived", note: EQT_FCF_NOTE },
  "Q3 2025": { value: 601.0, source: "factset", basis: "derived", note: EQT_FCF_NOTE },
  "Q4 2025": { value: 743.866, source: "factset", basis: "derived", note: EQT_FCF_NOTE },
  "Q1 2026": { value: 1832.0, source: "factset", basis: "derived", note: EQT_FCF_NOTE },
  "Q2 2026": { value: 329.666, source: "codex", basis: "actual", note: "Approved audited EQT standalone Q2 2026 free cash flow under the existing live-series definition." }
};

const exe: Partial<Record<Quarter, SourcedValue>> = {
  "Q1 2024": { value: 112.0, source: "factset", basis: "derived", note: EXE_FCF_NOTE },
  "Q2 2024": { value: -119.0, source: "factset", basis: "derived", note: EXE_FCF_NOTE },
  "Q3 2024": { value: 98.0, source: "factset", basis: "derived", note: EXE_FCF_NOTE },
  "Q4 2024": { value: -154.0, source: "factset", basis: "derived", note: EXE_FCF_NOTE },
  "Q1 2025": { value: 577.0, source: "factset", basis: "derived", note: EXE_FCF_NOTE },
  "Q2 2025": { value: 692.0, source: "factset", basis: "derived", note: EXE_FCF_NOTE },
  "Q3 2025": { value: 423.0, source: "factset", basis: "derived", note: EXE_FCF_NOTE },
  "Q4 2025": { value: 218.0, source: "factset", basis: "derived", note: EXE_FCF_NOTE },
  "Q1 2026": { value: 1704.0, source: "factset", basis: "derived", note: EXE_FCF_NOTE },
  "Q2 2026": { value: 343.0, source: "codex", basis: "actual", note: "Approved audited EXE standalone Q2 2026 free cash flow under the existing live-series definition." }
};

const gpor: Partial<Record<Quarter, SourcedValue>> = {
  "Q1 2024": { value: 53.0, source: "factset", basis: "derived", note: GPOR_FCF_NOTE },
  "Q2 2024": { value: 26.0, source: "factset", basis: "derived", note: GPOR_FCF_NOTE },
  "Q3 2024": { value: 58.0, source: "factset", basis: "derived", note: GPOR_FCF_NOTE },
  "Q4 2024": { value: 125.21, source: "factset", basis: "derived", note: GPOR_FCF_NOTE },
  "Q1 2025": { value: 36.6, source: "factset", basis: "derived", note: GPOR_FCF_NOTE },
  "Q2 2025": { value: 73.85, source: "factset", basis: "derived", note: GPOR_FCF_NOTE },
  "Q3 2025": { value: 105.0, source: "factset", basis: "derived", note: GPOR_FCF_NOTE },
  "Q4 2025": { value: 129.25, source: "factset", basis: "derived", note: GPOR_FCF_NOTE },
  "Q1 2026": { value: 124.2, source: "factset", basis: "derived", note: GPOR_FCF_NOTE },
  "Q2 2026": { value: 6.4, source: "codex", basis: "actual", note: "Approved audited GPOR standalone Q2 2026 free cash flow under the existing live-series definition." }
};

export const freeCashFlowQuarterly: Record<Ticker, Partial<Record<Quarter, SourcedValue>>> = {
  RRC: rrc,
  AR: ar,
  CNX: cnx,
  CRK: crk,
  EQT: eqt,
  EXE: exe,
  GPOR: gpor
};

export function getQuarterlyFreeCashFlow(ticker: Ticker, quarter: Quarter): SourcedValue {
  const row = freeCashFlowQuarterly[ticker][quarter];
  if (!row) throw new Error(`No reported free cash flow for ${ticker} ${quarter}`);
  return row;
}
