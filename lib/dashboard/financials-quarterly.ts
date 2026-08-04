/**
 * Quarterly financial and operating fixture for the 7 core RRC peer companies
 * (RRC, AR, CNX, CRK, EQT, EXE, GPOR), covering Q1 2024 through Q1 2026.
 *
 * SOURCE (priority 1 -- used for all cells below unless flagged otherwise):
 *   "Peer Comparsion site/Peer_Comp_Site_Data/Codex/
 *    Range_Peer_Quarterly_Data_Input_Template_Q1_2024_to_Q1_2026.xlsm"
 *   Built directly from each company's 10-Q/10-K filings and earnings/supplemental
 *   materials by the Codex research pass. Per the project's source-priority rule,
 *   Codex (10-Q/10-K, cell-level filing citations) outranks the FactSet workbook.
 *
 * FALLBACK (priority 2, per-cell only): 
 *   "Peer Comparsion site/Peer_Comp_Site_Data/Facset/E&P_Facset_Company_Model.xlsx"
 *   NOT USED in this extraction. FactSet's quarterly model has no rows for LOE /
 *   G&P&T / Cash G&A cost breakout or Wells Drilled / TIL / DUC Inventory, so it could
 *   not fill any of those Codex blanks. The remaining Codex blanks (CRK NGL production
 *   & realized NGL price; EXE realized NGL/oil price for Q1-Q3 2024) do have FactSet
 *   rows, but FactSet shows either an unbroken run of 0.00 (CRK NGL, all 9 quarters --
 *   indistinguishable from "not disclosed" and inconsistent with the "do not treat
 *   missing as zero" rule) or 0.00 in the same quarters other adjacent fields are also
 *   suspect (EXE Q1 2024, pre-merger entity). Both were left null with source "codex"
 *   rather than silently pulled in as a fallback -- see extraction report for detail.
 *
 * EXTRACTION DATE: 2026-08-04
 *
 * Every leaf value is a SourcedValue: { value, source, basis, note? }.
 *   - value: the number as it appears in the source workbook, or null when the
 *     source workbook itself is blank / "#N/A" / "Not disclosed". Never 0, never
 *     interpolated.
 *   - source: "codex" | "factset" -- which workbook the cell came from. Every cell
 *     in this fixture is "codex"; the tag is kept per-cell (not file-level) so a
 *     future FactSet backfill can be merged in without silently blending series.
 *   - basis: "actual" | "derived" | "guidance" -- "actual" means taken directly from
 *     a company-reported or filed figure; "derived" means Codex (or this extraction)
 *     calculated the figure from other reported figures (e.g. net debt = gross debt
 *     less cash; commodity mix % from production splits; RRC/AR CapEx = cash capex +
 *     change in accrued capex). No cell in this extraction is "guidance" -- guidance
 *     figures live in a separate Alphasense source and are out of scope here.
 *   - note: the source workbook's own definitional / methodology / caveat text for
 *     that field, preserved verbatim (trimmed) rather than paraphrased, so definitional
 *     mismatches between companies are visible rather than normalized away.
 *
 * IMPORTANT CROSS-COMPANY CAVEATS (see extraction report for full detail):
 *   - capitalExpenditures is NOT the same metric across peers: RRC and AR are Codex-
 *     computed accrual-adjusted total capital spending (basis "derived"); CNX, CRK,
 *     EQT, EXE and GPOR are the company-reported "as reported" capex figure (basis
 *     "actual"). Do not sum or chart these as one uniform series without accounting
 *     for the definitional difference.
 *   - realizedNaturalGasPrice / realizedNglPrice / realizedOilCondensatePrice are
 *     pre-hedge / unhedged for every company (confirmed by source notes for all 7
 *     tickers, and by exact cross-match against RRC's own "Pre-Hedge" normalized row).
 *   - wellsDrilled / wellsTurnedInLine / ducInventory: gross-vs-net and operated-vs-
 *     total basis is NOT explicitly specified in the source for CRK, EQT, EXE, GPOR.
 *     CNX wellsDrilled uses its own "TD" (total depth) activity metric, also not
 *     labeled gross/net. Do not treat these as a like-for-like peer series.
 */

import type { Ticker } from "./company-registry";

export type Quarter =
  | "Q1 2024" | "Q2 2024" | "Q3 2024" | "Q4 2024"
  | "Q1 2025" | "Q2 2025" | "Q3 2025" | "Q4 2025"
  | "Q1 2026";

export const quarters: Quarter[] = [
  "Q1 2024", "Q2 2024", "Q3 2024", "Q4 2024",
  "Q1 2025", "Q2 2025", "Q3 2025", "Q4 2025",
  "Q1 2026"
];

export type SourceTag = "codex" | "factset";
export type ValueBasis = "actual" | "derived" | "guidance";

export type SourcedValue = {
  value: number | null;
  source: SourceTag;
  basis: ValueBasis;
  note?: string;
};

export type QuarterlyFinancials = {
  ticker: Ticker;
  quarter: Quarter;
  revenue: SourcedValue; // $mm
  adjustedEbitdax: SourcedValue; // $mm
  capitalExpenditures: SourcedValue; // $mm -- definition varies by company, see header
  netDebt: SourcedValue; // $mm
  production: {
    total: SourcedValue; // MMcfe/d
    naturalGas: SourcedValue; // MMcf/d
    ngl: SourcedValue; // Mbbl/d
    oilCondensate: SourcedValue; // Mbbl/d
  };
  commodityMix: {
    naturalGasPct: SourcedValue; // fraction 0-1, derived from production splits
    nglPct: SourcedValue;
    oilCondensatePct: SourcedValue;
  };
  realizedPrices: {
    naturalGas: SourcedValue; // $/Mcf, pre-hedge
    ngl: SourcedValue; // $/bbl, pre-hedge
    oilCondensate: SourcedValue; // $/bbl, pre-hedge
  };
  costs: {
    leaseOperatingExpense: SourcedValue; // $/Mcfe
    gatheringProcessingTransportation: SourcedValue; // $/Mcfe
    cashGA: SourcedValue; // $/Mcfe
    totalCashUnitCosts: SourcedValue; // $/Mcfe
  };
  wells: {
    drilled: SourcedValue; // count -- basis (gross/net) not confirmed for most peers, see header
    turnedInLine: SourcedValue; // count
    ducInventory: SourcedValue; // count
  };
};

const data: Record<Ticker, Record<Quarter, QuarterlyFinancials>> = {
  RRC: {
    "Q1 2024": {
      ticker: "RRC",
      quarter: "Q1 2024",
      revenue: { value: 645.456, source: "codex", basis: "actual", note: "GAAP total revenues and other income. Q1-Q3 2024 uses the consistently reclassified comparative presentation in the corresponding 2025 Form 10-Q; Q4 is exact FY less Q1-Q3." },
      adjustedEbitdax: { value: 335.653, source: "codex", basis: "actual", note: "Company-reported EBITDAX excluding certain items from RRC supplemental Table 2; standalone quarterly values in $MM." },
      capitalExpenditures: { value: 170.0, source: "codex", basis: "derived", note: "Total company capital spending derived from filing cash additions plus the exact change in accrued capital expenditures; standalone quarters use matching YTD/FY roll-forwards." },
      netDebt: { value: 1425.906, source: "codex", basis: "derived", note: "Quarter-end face-value debt less cash and cash equivalents, in $MM, from the balance sheet and debt note." },
      production: {
        total: { value: 2141.497, source: "codex", basis: "actual" },
        naturalGas: { value: 1457.695, source: "codex", basis: "actual" },
        ngl: { value: 107.261, source: "codex", basis: "actual" },
        oilCondensate: { value: 6.706, source: "codex", basis: "actual" }
      },
      commodityMix: {
        naturalGasPct: { value: 0.6806897231, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.300521551, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.01878872583, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 2.05, source: "codex", basis: "actual" },
        ngl: { value: 26.24, source: "codex", basis: "actual" },
        oilCondensate: { value: 64.64, source: "codex", basis: "actual" }
      },
      costs: {
        leaseOperatingExpense: { value: 0.11, source: "codex", basis: "actual", note: "Lease operating expense excludes workovers and stock-based compensation. Direct 10-Q quarterly values retained; Q4 left blank where the filing does not provide an exact standalone value at sufficient precision." },
        gatheringProcessingTransportation: { value: 1.49, source: "codex", basis: "actual" },
        cashGA: { value: 0.18, source: "codex", basis: "actual" },
        totalCashUnitCosts: { value: 1.804629610624192, source: "codex", basis: "derived", note: "Cash production costs = LOE excluding workovers/stock compensation + transportation/gathering/processing/compression + taxes other than income + cash G&A, divided by production. Exact filing amounts; Q4 from exact FY less nine-month amounts." }
      },
      wells: {
        drilled: { value: null, source: "codex", basis: "actual", note: "Unavailable quarterly: RRC 10-K drilling table reports annual gross productive development wells (52 in 2024; 54 in 2025), but reviewed quarterly materials do not disclose comparable unique wells drilled by quarter. Quarterly activity-across-wells language was not used because it does not reconcile to the 10-K definition." },
        turnedInLine: { value: 9.0, source: "codex", basis: "actual", note: "Wells turned to sales / wells TIL. Standalone quarters from RRC Wells TIL tables; Q2/Q3/Q4 derived from 1H/YTD/FY totals only when definitions match." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Unavailable on workbook unit basis: RRC disclosed DUC inventory in lateral feet at year-end 2025, not a comparable quarter-end DUC well count. Wells waiting on sales/completion/infrastructure were not used as DUC inventory." }
      }
    },
    "Q2 2024": {
      ticker: "RRC",
      quarter: "Q2 2024",
      revenue: { value: 530.109, source: "codex", basis: "actual", note: "GAAP total revenues and other income. Q1-Q3 2024 uses the consistently reclassified comparative presentation in the corresponding 2025 Form 10-Q; Q4 is exact FY less Q1-Q3." },
      adjustedEbitdax: { value: 264.281, source: "codex", basis: "actual", note: "Company-reported EBITDAX excluding certain items from RRC supplemental Table 2; standalone quarterly values in $MM." },
      capitalExpenditures: { value: 175.0, source: "codex", basis: "derived", note: "Total company capital spending derived from filing cash additions plus the exact change in accrued capital expenditures; standalone quarters use matching YTD/FY roll-forwards." },
      netDebt: { value: 1470.084, source: "codex", basis: "derived", note: "Quarter-end face-value debt less cash and cash equivalents, in $MM, from the balance sheet and debt note." },
      production: {
        total: { value: 2152.946, source: "codex", basis: "actual" },
        naturalGas: { value: 1495.594, source: "codex", basis: "actual" },
        ngl: { value: 103.042, source: "codex", basis: "actual" },
        oilCondensate: { value: 6.517, source: "codex", basis: "actual" }
      },
      commodityMix: {
        naturalGasPct: { value: 0.6946732524, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.2871655861, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.01816209046, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 1.54, source: "codex", basis: "actual" },
        ngl: { value: 24.35, source: "codex", basis: "actual" },
        oilCondensate: { value: 68.32, source: "codex", basis: "actual" }
      },
      costs: {
        leaseOperatingExpense: { value: 0.11, source: "codex", basis: "actual", note: "Lease operating expense excludes workovers and stock-based compensation. Direct 10-Q quarterly values retained; Q4 left blank where the filing does not provide an exact standalone value at sufficient precision." },
        gatheringProcessingTransportation: { value: 1.44, source: "codex", basis: "actual" },
        cashGA: { value: 0.16, source: "codex", basis: "actual" },
        totalCashUnitCosts: { value: 1.736042630079931, source: "codex", basis: "derived", note: "Cash production costs = LOE excluding workovers/stock compensation + transportation/gathering/processing/compression + taxes other than income + cash G&A, divided by production. Exact filing amounts; Q4 from exact FY less nine-month amounts." }
      },
      wells: {
        drilled: { value: null, source: "codex", basis: "actual", note: "Unavailable quarterly: RRC 10-K drilling table reports annual gross productive development wells (52 in 2024; 54 in 2025), but reviewed quarterly materials do not disclose comparable unique wells drilled by quarter. Quarterly activity-across-wells language was not used because it does not reconcile to the 10-K definition." },
        turnedInLine: { value: 17.0, source: "codex", basis: "actual", note: "Wells turned to sales / wells TIL. Standalone quarters from RRC Wells TIL tables; Q2/Q3/Q4 derived from 1H/YTD/FY totals only when definitions match." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Unavailable on workbook unit basis: RRC disclosed DUC inventory in lateral feet at year-end 2025, not a comparable quarter-end DUC well count. Wells waiting on sales/completion/infrastructure were not used as DUC inventory." }
      }
    },
    "Q3 2024": {
      ticker: "RRC",
      quarter: "Q3 2024",
      revenue: { value: 615.102, source: "codex", basis: "actual", note: "GAAP total revenues and other income. Q1-Q3 2024 uses the consistently reclassified comparative presentation in the corresponding 2025 Form 10-Q; Q4 is exact FY less Q1-Q3." },
      adjustedEbitdax: { value: 276.225, source: "codex", basis: "actual", note: "Company-reported EBITDAX excluding certain items from RRC supplemental Table 2; standalone quarterly values in $MM." },
      capitalExpenditures: { value: 156.0, source: "codex", basis: "derived", note: "Total company capital spending derived from filing cash additions plus the exact change in accrued capital expenditures; standalone quarters use matching YTD/FY roll-forwards." },
      netDebt: { value: 1440.69, source: "codex", basis: "derived", note: "Quarter-end face-value debt less cash and cash equivalents, in $MM, from the balance sheet and debt note." },
      production: {
        total: { value: 2204.46, source: "codex", basis: "actual" },
        naturalGas: { value: 1502.106, source: "codex", basis: "actual" },
        ngl: { value: 111.465, source: "codex", basis: "actual" },
        oilCondensate: { value: 5.594, source: "codex", basis: "actual" }
      },
      commodityMix: {
        naturalGasPct: { value: 0.6813940829, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.3033804197, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.0152254974, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 1.69, source: "codex", basis: "actual" },
        ngl: { value: 25.96, source: "codex", basis: "actual" },
        oilCondensate: { value: 64.03, source: "codex", basis: "actual" }
      },
      costs: {
        leaseOperatingExpense: { value: 0.12, source: "codex", basis: "actual", note: "Lease operating expense excludes workovers and stock-based compensation. Direct 10-Q quarterly values retained; Q4 left blank where the filing does not provide an exact standalone value at sufficient precision." },
        gatheringProcessingTransportation: { value: 1.51, source: "codex", basis: "actual" },
        cashGA: { value: 0.16, source: "codex", basis: "actual" },
        totalCashUnitCosts: { value: 1.818174646220601, source: "codex", basis: "derived", note: "Cash production costs = LOE excluding workovers/stock compensation + transportation/gathering/processing/compression + taxes other than income + cash G&A, divided by production. Exact filing amounts; Q4 from exact FY less nine-month amounts." }
      },
      wells: {
        drilled: { value: null, source: "codex", basis: "actual", note: "Unavailable quarterly: RRC 10-K drilling table reports annual gross productive development wells (52 in 2024; 54 in 2025), but reviewed quarterly materials do not disclose comparable unique wells drilled by quarter. Quarterly activity-across-wells language was not used because it does not reconcile to the 10-K definition." },
        turnedInLine: { value: 4.0, source: "codex", basis: "actual", note: "Wells turned to sales / wells TIL. Standalone quarters from RRC Wells TIL tables; Q2/Q3/Q4 derived from 1H/YTD/FY totals only when definitions match." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Unavailable on workbook unit basis: RRC disclosed DUC inventory in lateral feet at year-end 2025, not a comparable quarter-end DUC well count. Wells waiting on sales/completion/infrastructure were not used as DUC inventory." }
      }
    },
    "Q4 2024": {
      ticker: "RRC",
      quarter: "Q4 2024",
      revenue: { value: 626.417, source: "codex", basis: "actual", note: "GAAP total revenues and other income. Q1-Q3 2024 uses the consistently reclassified comparative presentation in the corresponding 2025 Form 10-Q; Q4 is exact FY less Q1-Q3." },
      adjustedEbitdax: { value: 339.273, source: "codex", basis: "actual", note: "Company-reported EBITDAX excluding certain items from RRC supplemental Table 2; standalone quarterly values in $MM." },
      capitalExpenditures: { value: 153.0, source: "codex", basis: "derived", note: "Total company capital spending derived from filing cash additions plus the exact change in accrued capital expenditures; standalone quarters use matching YTD/FY roll-forwards." },
      netDebt: { value: 1404.212, source: "codex", basis: "derived", note: "Quarter-end face-value debt less cash and cash equivalents, in $MM, from the balance sheet and debt note." },
      production: {
        total: { value: 2202.5, source: "codex", basis: "actual" },
        naturalGas: { value: 1505.14, source: "codex", basis: "actual" },
        ngl: { value: 111.199, source: "codex", basis: "actual" },
        oilCondensate: { value: 5.028, source: "codex", basis: "actual" }
      },
      commodityMix: {
        naturalGasPct: { value: 0.6833779796, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.3029257662, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.01369716232, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 2.434960409, source: "codex", basis: "actual" },
        ngl: { value: 26.42703, source: "codex", basis: "actual" },
        oilCondensate: { value: 59.64503, source: "codex", basis: "actual" }
      },
      costs: {
        leaseOperatingExpense: { value: 0.12, source: "codex", basis: "actual", note: "Lease operating expense excludes workovers and stock-based compensation. Direct 10-Q quarterly values retained; Q4 left blank where the filing does not provide an exact standalone value at sufficient precision." },
        gatheringProcessingTransportation: { value: 1.4775748, source: "codex", basis: "actual" },
        cashGA: { value: 0.175818, source: "codex", basis: "actual" },
        totalCashUnitCosts: { value: 1.804801855598875, source: "codex", basis: "derived", note: "Cash production costs = LOE excluding workovers/stock compensation + transportation/gathering/processing/compression + taxes other than income + cash G&A, divided by production. Exact filing amounts; Q4 from exact FY less nine-month amounts." }
      },
      wells: {
        drilled: { value: null, source: "codex", basis: "actual", note: "Unavailable quarterly: RRC 10-K drilling table reports annual gross productive development wells (52 in 2024; 54 in 2025), but reviewed quarterly materials do not disclose comparable unique wells drilled by quarter. Quarterly activity-across-wells language was not used because it does not reconcile to the 10-K definition." },
        turnedInLine: { value: 14.0, source: "codex", basis: "actual", note: "Wells turned to sales / wells TIL. Standalone quarters from RRC Wells TIL tables; Q2/Q3/Q4 derived from 1H/YTD/FY totals only when definitions match." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Unavailable on workbook unit basis: RRC disclosed DUC inventory in lateral feet at year-end 2025, not a comparable quarter-end DUC well count. Wells waiting on sales/completion/infrastructure were not used as DUC inventory." }
      }
    },
    "Q1 2025": {
      ticker: "RRC",
      quarter: "Q1 2025",
      revenue: { value: 690.554, source: "codex", basis: "actual", note: "GAAP total revenues and other income. Q1-Q3 2024 uses the consistently reclassified comparative presentation in the corresponding 2025 Form 10-Q; Q4 is exact FY less Q1-Q3." },
      adjustedEbitdax: { value: 424.123, source: "codex", basis: "actual", note: "Company-reported EBITDAX excluding certain items from RRC supplemental Table 2; standalone quarterly values in $MM." },
      capitalExpenditures: { value: 147.0, source: "codex", basis: "derived", note: "Total company capital spending derived from filing cash additions plus the exact change in accrued capital expenditures; standalone quarters use matching YTD/FY roll-forwards." },
      netDebt: { value: 1361.968, source: "codex", basis: "derived", note: "Quarter-end face-value debt less cash and cash equivalents, in $MM, from the balance sheet and debt note." },
      production: {
        total: { value: 2200.276, source: "codex", basis: "actual" },
        naturalGas: { value: 1510.705, source: "codex", basis: "actual" },
        ngl: { value: 110.222, source: "codex", basis: "actual" },
        oilCondensate: { value: 4.706, source: "codex", basis: "actual" }
      },
      commodityMix: {
        naturalGasPct: { value: 0.6865979541, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.300567747, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.0128329355, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 3.61, source: "codex", basis: "actual" },
        ngl: { value: 27.79, source: "codex", basis: "actual" },
        oilCondensate: { value: 61.12, source: "codex", basis: "actual" }
      },
      costs: {
        leaseOperatingExpense: { value: 0.13, source: "codex", basis: "actual", note: "Lease operating expense excludes workovers and stock-based compensation. Direct 10-Q quarterly values retained; Q4 left blank where the filing does not provide an exact standalone value at sufficient precision." },
        gatheringProcessingTransportation: { value: 1.55, source: "codex", basis: "actual" },
        cashGA: { value: 0.16, source: "codex", basis: "actual" },
        totalCashUnitCosts: { value: 1.865850271430375, source: "codex", basis: "derived", note: "Cash production costs = LOE excluding workovers/stock compensation + transportation/gathering/processing/compression + taxes other than income + cash G&A, divided by production. Exact filing amounts; Q4 from exact FY less nine-month amounts." }
      },
      wells: {
        drilled: { value: 18.0, source: "codex", basis: "actual", note: "Unavailable quarterly: RRC 10-K drilling table reports annual gross productive development wells (52 in 2024; 54 in 2025), but reviewed quarterly materials do not disclose comparable unique wells drilled by quarter. Quarterly activity-across-wells language was not used because it does not reconcile to the 10-K definition." },
        turnedInLine: { value: 10.0, source: "codex", basis: "actual", note: "Wells turned to sales / wells TIL. Standalone quarters from RRC Wells TIL tables; Q2/Q3/Q4 derived from 1H/YTD/FY totals only when definitions match." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Unavailable on workbook unit basis: RRC disclosed DUC inventory in lateral feet at year-end 2025, not a comparable quarter-end DUC well count. Wells waiting on sales/completion/infrastructure were not used as DUC inventory." }
      }
    },
    "Q2 2025": {
      ticker: "RRC",
      quarter: "Q2 2025",
      revenue: { value: 856.275, source: "codex", basis: "actual", note: "GAAP total revenues and other income. Q1-Q3 2024 uses the consistently reclassified comparative presentation in the corresponding 2025 Form 10-Q; Q4 is exact FY less Q1-Q3." },
      adjustedEbitdax: { value: 329.024, source: "codex", basis: "actual", note: "Company-reported EBITDAX excluding certain items from RRC supplemental Table 2; standalone quarterly values in $MM." },
      capitalExpenditures: { value: 154.0, source: "codex", basis: "derived", note: "Total company capital spending derived from filing cash additions plus the exact change in accrued capital expenditures; standalone quarters use matching YTD/FY roll-forwards." },
      netDebt: { value: 1224.866, source: "codex", basis: "derived", note: "Quarter-end face-value debt less cash and cash equivalents, in $MM, from the balance sheet and debt note." },
      production: {
        total: { value: 2197.321, source: "codex", basis: "actual" },
        naturalGas: { value: 1497.771, source: "codex", basis: "actual" },
        ngl: { value: 110.209, source: "codex", basis: "actual" },
        oilCondensate: { value: 6.382, source: "codex", basis: "actual" }
      },
      commodityMix: {
        naturalGasPct: { value: 0.6816350456, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.3009364585, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.01742667548, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 2.92, source: "codex", basis: "actual" },
        ngl: { value: 23.73, source: "codex", basis: "actual" },
        oilCondensate: { value: 52.77, source: "codex", basis: "actual" }
      },
      costs: {
        leaseOperatingExpense: { value: 0.11, source: "codex", basis: "actual", note: "Lease operating expense excludes workovers and stock-based compensation. Direct 10-Q quarterly values retained; Q4 left blank where the filing does not provide an exact standalone value at sufficient precision." },
        gatheringProcessingTransportation: { value: 1.52, source: "codex", basis: "actual" },
        cashGA: { value: 0.16, source: "codex", basis: "actual" },
        totalCashUnitCosts: { value: 1.840014803256717, source: "codex", basis: "derived", note: "Cash production costs = LOE excluding workovers/stock compensation + transportation/gathering/processing/compression + taxes other than income + cash G&A, divided by production. Exact filing amounts; Q4 from exact FY less nine-month amounts." }
      },
      wells: {
        drilled: { value: 20.0, source: "codex", basis: "actual", note: "Unavailable quarterly: RRC 10-K drilling table reports annual gross productive development wells (52 in 2024; 54 in 2025), but reviewed quarterly materials do not disclose comparable unique wells drilled by quarter. Quarterly activity-across-wells language was not used because it does not reconcile to the 10-K definition." },
        turnedInLine: { value: 12.0, source: "codex", basis: "actual", note: "Wells turned to sales / wells TIL. Standalone quarters from RRC Wells TIL tables; Q2/Q3/Q4 derived from 1H/YTD/FY totals only when definitions match." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Unavailable on workbook unit basis: RRC disclosed DUC inventory in lateral feet at year-end 2025, not a comparable quarter-end DUC well count. Wells waiting on sales/completion/infrastructure were not used as DUC inventory." }
      }
    },
    "Q3 2025": {
      ticker: "RRC",
      quarter: "Q3 2025",
      revenue: { value: 748.528, source: "codex", basis: "actual", note: "GAAP total revenues and other income. Q1-Q3 2024 uses the consistently reclassified comparative presentation in the corresponding 2025 Form 10-Q; Q4 is exact FY less Q1-Q3." },
      adjustedEbitdax: { value: 301.38, source: "codex", basis: "actual", note: "Company-reported EBITDAX excluding certain items from RRC supplemental Table 2; standalone quarterly values in $MM." },
      capitalExpenditures: { value: 190.0, source: "codex", basis: "derived", note: "Total company capital spending derived from filing cash additions plus the exact change in accrued capital expenditures; standalone quarters use matching YTD/FY roll-forwards." },
      netDebt: { value: 1228.825, source: "codex", basis: "derived", note: "Quarter-end face-value debt less cash and cash equivalents, in $MM, from the balance sheet and debt note." },
      production: {
        total: { value: 2227.831, source: "codex", basis: "actual" },
        naturalGas: { value: 1534.065, source: "codex", basis: "actual" },
        ngl: { value: 110.42, source: "codex", basis: "actual" },
        oilCondensate: { value: 5.208, source: "codex", basis: "actual" }
      },
      commodityMix: {
        naturalGasPct: { value: 0.68859128, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.2973834191, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.01402619858, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 2.56, source: "codex", basis: "actual" },
        ngl: { value: 22.09, source: "codex", basis: "actual" },
        oilCondensate: { value: 54.25, source: "codex", basis: "actual" }
      },
      costs: {
        leaseOperatingExpense: { value: 0.11, source: "codex", basis: "actual", note: "Lease operating expense excludes workovers and stock-based compensation. Direct 10-Q quarterly values retained; Q4 left blank where the filing does not provide an exact standalone value at sufficient precision." },
        gatheringProcessingTransportation: { value: 1.47, source: "codex", basis: "actual" },
        cashGA: { value: 0.17, source: "codex", basis: "actual" },
        totalCashUnitCosts: { value: 1.795136635750216, source: "codex", basis: "derived", note: "Cash production costs = LOE excluding workovers/stock compensation + transportation/gathering/processing/compression + taxes other than income + cash G&A, divided by production. Exact filing amounts; Q4 from exact FY less nine-month amounts." }
      },
      wells: {
        drilled: { value: 16.0, source: "codex", basis: "actual", note: "Unavailable quarterly: RRC 10-K drilling table reports annual gross productive development wells (52 in 2024; 54 in 2025), but reviewed quarterly materials do not disclose comparable unique wells drilled by quarter. Quarterly activity-across-wells language was not used because it does not reconcile to the 10-K definition." },
        turnedInLine: { value: 15.0, source: "codex", basis: "actual", note: "Wells turned to sales / wells TIL. Standalone quarters from RRC Wells TIL tables; Q2/Q3/Q4 derived from 1H/YTD/FY totals only when definitions match." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Unavailable on workbook unit basis: RRC disclosed DUC inventory in lateral feet at year-end 2025, not a comparable quarter-end DUC well count. Wells waiting on sales/completion/infrastructure were not used as DUC inventory." }
      }
    },
    "Q4 2025": {
      ticker: "RRC",
      quarter: "Q4 2025",
      revenue: { value: 820.158, source: "codex", basis: "actual", note: "GAAP total revenues and other income. Q1-Q3 2024 uses the consistently reclassified comparative presentation in the corresponding 2025 Form 10-Q; Q4 is exact FY less Q1-Q3." },
      adjustedEbitdax: { value: 379.452, source: "codex", basis: "actual", note: "Company-reported EBITDAX excluding certain items from RRC supplemental Table 2; standalone quarterly values in $MM." },
      capitalExpenditures: { value: 183.0, source: "codex", basis: "derived", note: "Total company capital spending derived from filing cash additions plus the exact change in accrued capital expenditures; standalone quarters use matching YTD/FY roll-forwards." },
      netDebt: { value: 1217.796, source: "codex", basis: "derived", note: "Quarter-end face-value debt less cash and cash equivalents, in $MM, from the balance sheet and debt note." },
      production: {
        total: { value: 2316.485, source: "codex", basis: "actual" },
        naturalGas: { value: 1603.233, source: "codex", basis: "actual" },
        ngl: { value: 113.523, source: "codex", basis: "actual" },
        oilCondensate: { value: 5.352, source: "codex", basis: "actual" }
      },
      commodityMix: {
        naturalGasPct: { value: 0.692097294, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.2940394606, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.01386238201, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 3.259372, source: "codex", basis: "actual" },
        ngl: { value: 23.09904, source: "codex", basis: "actual" },
        oilCondensate: { value: 47.81236, source: "codex", basis: "actual" }
      },
      costs: {
        leaseOperatingExpense: { value: 0.14, source: "codex", basis: "actual", note: "Lease operating expense excludes workovers and stock-based compensation. Direct 10-Q quarterly values retained; Q4 left blank where the filing does not provide an exact standalone value at sufficient precision." },
        gatheringProcessingTransportation: { value: 1.461129, source: "codex", basis: "actual" },
        cashGA: { value: 0.183181, source: "codex", basis: "actual" },
        totalCashUnitCosts: { value: 1.827516469903714, source: "codex", basis: "derived", note: "Cash production costs = LOE excluding workovers/stock compensation + transportation/gathering/processing/compression + taxes other than income + cash G&A, divided by production. Exact filing amounts; Q4 from exact FY less nine-month amounts." }
      },
      wells: {
        drilled: { value: null, source: "codex", basis: "actual", note: "Unavailable quarterly: RRC 10-K drilling table reports annual gross productive development wells (52 in 2024; 54 in 2025), but reviewed quarterly materials do not disclose comparable unique wells drilled by quarter. Quarterly activity-across-wells language was not used because it does not reconcile to the 10-K definition." },
        turnedInLine: { value: 10.0, source: "codex", basis: "actual", note: "Wells turned to sales / wells TIL. Standalone quarters from RRC Wells TIL tables; Q2/Q3/Q4 derived from 1H/YTD/FY totals only when definitions match." },
        ducInventory: { value: 52.0, source: "codex", basis: "actual", note: "Unavailable on workbook unit basis: RRC disclosed DUC inventory in lateral feet at year-end 2025, not a comparable quarter-end DUC well count. Wells waiting on sales/completion/infrastructure were not used as DUC inventory." }
      }
    },
    "Q1 2026": {
      ticker: "RRC",
      quarter: "Q1 2026",
      revenue: { value: 1034.17, source: "codex", basis: "actual", note: "GAAP total revenues and other income. Q1-Q3 2024 uses the consistently reclassified comparative presentation in the corresponding 2025 Form 10-Q; Q4 is exact FY less Q1-Q3." },
      adjustedEbitdax: { value: 569.529, source: "codex", basis: "actual", note: "Company-reported EBITDAX excluding certain items from RRC supplemental Table 2; standalone quarterly values in $MM." },
      capitalExpenditures: { value: 139.0, source: "codex", basis: "derived", note: "Total company capital spending derived from filing cash additions plus the exact change in accrued capital expenditures; standalone quarters use matching YTD/FY roll-forwards." },
      netDebt: { value: 833.753, source: "codex", basis: "derived", note: "Quarter-end face-value debt less cash and cash equivalents, in $MM, from the balance sheet and debt note." },
      production: {
        total: { value: 2207.436, source: "codex", basis: "actual" },
        naturalGas: { value: 1508.842, source: "codex", basis: "actual" },
        ngl: { value: 108.193, source: "codex", basis: "actual" },
        oilCondensate: { value: 8.239, source: "codex", basis: "actual" }
      },
      commodityMix: {
        naturalGasPct: { value: 0.6835269516, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.2940778351, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.02239430724, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 5.18, source: "codex", basis: "actual" },
        ngl: { value: 26.62, source: "codex", basis: "actual" },
        oilCondensate: { value: 63.3, source: "codex", basis: "actual" }
      },
      costs: {
        leaseOperatingExpense: { value: 0.14, source: "codex", basis: "actual", note: "Lease operating expense excludes workovers and stock-based compensation. Direct 10-Q quarterly values retained; Q4 left blank where the filing does not provide an exact standalone value at sufficient precision." },
        gatheringProcessingTransportation: { value: 1.63, source: "codex", basis: "actual" },
        cashGA: { value: 0.18, source: "codex", basis: "actual" },
        totalCashUnitCosts: { value: 1.971787244109549, source: "codex", basis: "derived", note: "Cash production costs = LOE excluding workovers/stock compensation + transportation/gathering/processing/compression + taxes other than income + cash G&A, divided by production. Exact filing amounts; Q4 from exact FY less nine-month amounts." }
      },
      wells: {
        drilled: { value: 9.0, source: "codex", basis: "actual", note: "Unavailable quarterly: RRC 10-K drilling table reports annual gross productive development wells (52 in 2024; 54 in 2025), but reviewed quarterly materials do not disclose comparable unique wells drilled by quarter. Quarterly activity-across-wells language was not used because it does not reconcile to the 10-K definition." },
        turnedInLine: { value: 17.0, source: "codex", basis: "actual", note: "Wells turned to sales / wells TIL. Standalone quarters from RRC Wells TIL tables; Q2/Q3/Q4 derived from 1H/YTD/FY totals only when definitions match." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Unavailable on workbook unit basis: RRC disclosed DUC inventory in lateral feet at year-end 2025, not a comparable quarter-end DUC well count. Wells waiting on sales/completion/infrastructure were not used as DUC inventory." }
      }
    },
  },
  AR: {
    "Q1 2024": {
      ticker: "AR",
      quarter: "Q1 2024",
      revenue: { value: 1122.271, source: "codex", basis: "actual", note: "Quarterly total consolidated revenue. Q4 2024 and Q4 2025 calculated as full-year total revenue less Q1-Q3 standalone totals." },
      adjustedEbitdax: { value: 262.087, source: "codex", basis: "actual", note: "Company-reported Adjusted EBITDAX / Adjusted EBITDA equivalent; standalone quarterly values." },
      capitalExpenditures: { value: 219.0, source: "codex", basis: "derived", note: "Corrected to total company capital expenditures (activity basis: D&C + leasehold/acreage + other capital where disclosed). Differs from cash capex used in AR FCF reconciliation." },
      netDebt: { value: 1519.285, source: "codex", basis: "derived", note: "Net debt calculated as quarter-end total debt principal less cash and cash equivalents; AR reported zero cash at each period end reviewed." },
      production: {
        total: { value: 3426.0, source: "codex", basis: "actual", note: "Average daily total production from E&P selected operating data; Q4 2024 and Q4 2025 calculated from full-year less Q1-Q3 combined Bcfe." },
        naturalGas: { value: 2219.78021978022, source: "codex", basis: "actual", note: "Average daily natural gas production calculated from disclosed Bcf divided by calendar days; Q4 2024 and Q4 2025 from full-year less Q1-Q3 volumes." },
        ngl: { value: 190.3736263736264, source: "codex", basis: "actual", note: "Average daily NGL production calculated as C2 ethane plus C3+ NGL volumes divided by calendar days; Q4 2024 and Q4 2025 from full-year less Q1-Q3 volumes." },
        oilCondensate: { value: 11.37362637362637, source: "codex", basis: "actual", note: "Average daily oil production calculated from disclosed oil MBbl divided by calendar days; Q4 2024 and Q4 2025 from full-year less Q1-Q3 volumes." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.6479218388, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.3334038991, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.01991878524, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 2.35, source: "codex", basis: "actual", note: "Pre-hedge realized natural gas price. Q4 2024 and Q4 2025 derived from gas sales and gas volumes using full-year less Q1-Q3 data." },
        ngl: { value: 29.8882475180097, source: "codex", basis: "actual", note: "Pre-hedge realized NGL price calculated as weighted average of disclosed C2 ethane and C3+ NGL prices using volumes; Q4 2024 and Q4 2025 derived from NGL sales and volumes using full-year less Q1-Q3 data." },
        oilCondensate: { value: 62.53, source: "codex", basis: "actual", note: "Pre-hedge realized oil price. Q4 2024 and Q4 2025 derived from oil sales and oil volumes using full-year less Q1-Q3 data." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.09, source: "codex", basis: "actual", note: "LOE per Mcfe from E&P selected operating data; Q4 2024 and Q4 2025 calculated from full-year less Q1-Q3 LOE dollars divided by Q4 combined Bcfe." },
        gatheringProcessingTransportation: { value: 2.16, source: "codex", basis: "actual", note: "Sum of gathering and compression, processing, and transportation costs per Mcfe; Q4 2024 and Q4 2025 calculated from full-year less Q1-Q3 dollars divided by Q4 combined Bcfe." },
        cashGA: { value: 0.13, source: "codex", basis: "actual", note: "Cash G&A is general and administrative expense excluding equity-based compensation per Mcfe; Q4 2024 and Q4 2025 calculated from full-year less Q1-Q3 dollars divided by Q4 combined Bcfe." },
        totalCashUnitCosts: { value: 2.61, source: "codex", basis: "derived", note: "Calculated consistently as AR all-in cash expense (LOE + GP&T + production/ad valorem taxes) + net marketing expense + cash G&A, all $/Mcfe." }
      },
      wells: {
        drilled: { value: null, source: "codex", basis: "actual", note: "Unavailable: no reliable standalone quarterly wells-drilled disclosure found in provided AR filings/releases; drilling records/spud/completion language not used." },
        turnedInLine: { value: 12.0, source: "codex", basis: "actual", note: "Gross operated wells placed to sales / turned to sales during quarter; treated as TIL equivalent." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Unavailable: no consistent quarter-end DUC inventory disclosure found; wells in process/completion backlog not used as DUC inventory." }
      }
    },
    "Q2 2024": {
      ticker: "AR",
      quarter: "Q2 2024",
      revenue: { value: 978.654, source: "codex", basis: "actual", note: "Quarterly total consolidated revenue. Q4 2024 and Q4 2025 calculated as full-year total revenue less Q1-Q3 standalone totals." },
      adjustedEbitdax: { value: 151.402, source: "codex", basis: "actual", note: "Company-reported Adjusted EBITDAX / Adjusted EBITDA equivalent; standalone quarterly values." },
      capitalExpenditures: { value: 188.0, source: "codex", basis: "derived", note: "Corrected to total company capital expenditures (activity basis: D&C + leasehold/acreage + other capital where disclosed). Differs from cash capex used in AR FCF reconciliation." },
      netDebt: { value: 1599.985, source: "codex", basis: "derived", note: "Net debt calculated as quarter-end total debt principal less cash and cash equivalents; AR reported zero cash at each period end reviewed." },
      production: {
        total: { value: 3420.0, source: "codex", basis: "actual", note: "Average daily total production from E&P selected operating data; Q4 2024 and Q4 2025 calculated from full-year less Q1-Q3 combined Bcfe." },
        naturalGas: { value: 2153.846153846154, source: "codex", basis: "actual", note: "Average daily natural gas production calculated from disclosed Bcf divided by calendar days; Q4 2024 and Q4 2025 from full-year less Q1-Q3 volumes." },
        ngl: { value: 201.3736263736264, source: "codex", basis: "actual", note: "Average daily NGL production calculated as C2 ethane plus C3+ NGL volumes divided by calendar days; Q4 2024 and Q4 2025 from full-year less Q1-Q3 volumes." },
        oilCondensate: { value: 10.46153846153846, source: "codex", basis: "actual", note: "Average daily oil production calculated from disclosed oil MBbl divided by calendar days; Q4 2024 and Q4 2025 from full-year less Q1-Q3 volumes." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.6297795771, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.3532870638, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.01835357625, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 1.92, source: "codex", basis: "actual", note: "Pre-hedge realized natural gas price. Q4 2024 and Q4 2025 derived from gas sales and gas volumes using full-year less Q1-Q3 data." },
        ngl: { value: 26.69401555252388, source: "codex", basis: "actual", note: "Pre-hedge realized NGL price calculated as weighted average of disclosed C2 ethane and C3+ NGL prices using volumes; Q4 2024 and Q4 2025 derived from NGL sales and volumes using full-year less Q1-Q3 data." },
        oilCondensate: { value: 66.66, source: "codex", basis: "actual", note: "Pre-hedge realized oil price. Q4 2024 and Q4 2025 derived from oil sales and oil volumes using full-year less Q1-Q3 data." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.1, source: "codex", basis: "actual", note: "LOE per Mcfe from E&P selected operating data; Q4 2024 and Q4 2025 calculated from full-year less Q1-Q3 LOE dollars divided by Q4 combined Bcfe." },
        gatheringProcessingTransportation: { value: 2.13, source: "codex", basis: "actual", note: "Sum of gathering and compression, processing, and transportation costs per Mcfe; Q4 2024 and Q4 2025 calculated from full-year less Q1-Q3 dollars divided by Q4 combined Bcfe." },
        cashGA: { value: 0.14, source: "codex", basis: "actual", note: "Cash G&A is general and administrative expense excluding equity-based compensation per Mcfe; Q4 2024 and Q4 2025 calculated from full-year less Q1-Q3 dollars divided by Q4 combined Bcfe." },
        totalCashUnitCosts: { value: 2.57, source: "codex", basis: "derived", note: "Calculated consistently as AR all-in cash expense (LOE + GP&T + production/ad valorem taxes) + net marketing expense + cash G&A, all $/Mcfe." }
      },
      wells: {
        drilled: { value: null, source: "codex", basis: "actual", note: "Unavailable: no reliable standalone quarterly wells-drilled disclosure found in provided AR filings/releases; drilling records/spud/completion language not used." },
        turnedInLine: { value: 11.0, source: "codex", basis: "actual", note: "Gross operated wells placed to sales / turned to sales during quarter; treated as TIL equivalent." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Unavailable: no consistent quarter-end DUC inventory disclosure found; wells in process/completion backlog not used as DUC inventory." }
      }
    },
    "Q3 2024": {
      ticker: "AR",
      quarter: "Q3 2024",
      revenue: { value: 1055.92, source: "codex", basis: "actual", note: "Quarterly total consolidated revenue. Q4 2024 and Q4 2025 calculated as full-year total revenue less Q1-Q3 standalone totals." },
      adjustedEbitdax: { value: 186.9, source: "codex", basis: "actual", note: "Company-reported Adjusted EBITDAX / Adjusted EBITDA equivalent; standalone quarterly values." },
      capitalExpenditures: { value: 172.0, source: "codex", basis: "derived", note: "Corrected to total company capital expenditures (activity basis: D&C + leasehold/acreage + other capital where disclosed). Differs from cash capex used in AR FCF reconciliation." },
      netDebt: { value: 1630.685, source: "codex", basis: "derived", note: "Net debt calculated as quarter-end total debt principal less cash and cash equivalents; AR reported zero cash at each period end reviewed." },
      production: {
        total: { value: 3406.0, source: "codex", basis: "actual", note: "Average daily total production from E&P selected operating data; Q4 2024 and Q4 2025 calculated from full-year less Q1-Q3 combined Bcfe." },
        naturalGas: { value: 2173.913043478261, source: "codex", basis: "actual", note: "Average daily natural gas production calculated from disclosed Bcf divided by calendar days; Q4 2024 and Q4 2025 from full-year less Q1-Q3 volumes." },
        ngl: { value: 196.6847826086957, source: "codex", basis: "actual", note: "Average daily NGL production calculated as C2 ethane plus C3+ NGL volumes divided by calendar days; Q4 2024 and Q4 2025 from full-year less Q1-Q3 volumes." },
        oilCondensate: { value: 9.304347826086957, source: "codex", basis: "actual", note: "Average daily oil production calculated from disclosed oil MBbl divided by calendar days; Q4 2024 and Q4 2025 from full-year less Q1-Q3 volumes." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.6382598483, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.3464793587, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.01639051291, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 2.13, source: "codex", basis: "actual", note: "Pre-hedge realized natural gas price. Q4 2024 and Q4 2025 derived from gas sales and gas volumes using full-year less Q1-Q3 data." },
        ngl: { value: 27.86631610942249, source: "codex", basis: "actual", note: "Pre-hedge realized NGL price calculated as weighted average of disclosed C2 ethane and C3+ NGL prices using volumes; Q4 2024 and Q4 2025 derived from NGL sales and volumes using full-year less Q1-Q3 data." },
        oilCondensate: { value: 61.59, source: "codex", basis: "actual", note: "Pre-hedge realized oil price. Q4 2024 and Q4 2025 derived from oil sales and oil volumes using full-year less Q1-Q3 data." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.09, source: "codex", basis: "actual", note: "LOE per Mcfe from E&P selected operating data; Q4 2024 and Q4 2025 calculated from full-year less Q1-Q3 LOE dollars divided by Q4 combined Bcfe." },
        gatheringProcessingTransportation: { value: 2.18, source: "codex", basis: "actual", note: "Sum of gathering and compression, processing, and transportation costs per Mcfe; Q4 2024 and Q4 2025 calculated from full-year less Q1-Q3 dollars divided by Q4 combined Bcfe." },
        cashGA: { value: 0.12, source: "codex", basis: "actual", note: "Cash G&A is general and administrative expense excluding equity-based compensation per Mcfe; Q4 2024 and Q4 2025 calculated from full-year less Q1-Q3 dollars divided by Q4 combined Bcfe." },
        totalCashUnitCosts: { value: 2.59, source: "codex", basis: "derived", note: "Calculated consistently as AR all-in cash expense (LOE + GP&T + production/ad valorem taxes) + net marketing expense + cash G&A, all $/Mcfe." }
      },
      wells: {
        drilled: { value: null, source: "codex", basis: "actual", note: "Unavailable: no reliable standalone quarterly wells-drilled disclosure found in provided AR filings/releases; drilling records/spud/completion language not used." },
        turnedInLine: { value: 23.0, source: "codex", basis: "actual", note: "Gross operated wells placed to sales / turned to sales during quarter; treated as TIL equivalent." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Unavailable: no consistent quarter-end DUC inventory disclosure found; wells in process/completion backlog not used as DUC inventory." }
      }
    },
    "Q4 2024": {
      ticker: "AR",
      quarter: "Q4 2024",
      revenue: { value: 1168.751, source: "codex", basis: "actual", note: "Quarterly total consolidated revenue. Q4 2024 and Q4 2025 calculated as full-year total revenue less Q1-Q3 standalone totals." },
      adjustedEbitdax: { value: 331.936, source: "codex", basis: "actual", note: "Company-reported Adjusted EBITDAX / Adjusted EBITDA equivalent; standalone quarterly values." },
      capitalExpenditures: { value: 143.0, source: "codex", basis: "derived", note: "Corrected to total company capital expenditures (activity basis: D&C + leasehold/acreage + other capital where disclosed). Differs from cash capex used in AR FCF reconciliation." },
      netDebt: { value: 1497.185, source: "codex", basis: "derived", note: "Net debt calculated as quarter-end total debt principal less cash and cash equivalents; AR reported zero cash at each period end reviewed." },
      production: {
        total: { value: 3434.782608695652, source: "codex", basis: "actual", note: "Average daily total production from E&P selected operating data; Q4 2024 and Q4 2025 calculated from full-year less Q1-Q3 combined Bcfe." },
        naturalGas: { value: 2119.565217391304, source: "codex", basis: "actual", note: "Average daily natural gas production calculated from disclosed Bcf divided by calendar days; Q4 2024 and Q4 2025 from full-year less Q1-Q3 volumes." },
        ngl: { value: 207.4021739130435, source: "codex", basis: "actual", note: "Average daily NGL production calculated as C2 ethane plus C3+ NGL volumes divided by calendar days; Q4 2024 and Q4 2025 from full-year less Q1-Q3 volumes." },
        oilCondensate: { value: 9.23913043478261, source: "codex", basis: "actual", note: "Average daily oil production calculated from disclosed oil MBbl divided by calendar days; Q4 2024 and Q4 2025 from full-year less Q1-Q3 volumes." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.6170886076, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.3622974684, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.01613924051, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 2.788687179487179, source: "codex", basis: "actual", note: "Pre-hedge realized natural gas price. Q4 2024 and Q4 2025 derived from gas sales and gas volumes using full-year less Q1-Q3 data." },
        ngl: { value: 29.124416960326, source: "codex", basis: "actual", note: "Pre-hedge realized NGL price calculated as weighted average of disclosed C2 ethane and C3+ NGL prices using volumes; Q4 2024 and Q4 2025 derived from NGL sales and volumes using full-year less Q1-Q3 data." },
        oilCondensate: { value: 57.79764705882351, source: "codex", basis: "actual", note: "Pre-hedge realized oil price. Q4 2024 and Q4 2025 derived from oil sales and oil volumes using full-year less Q1-Q3 data." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.09562025316455698, source: "codex", basis: "actual", note: "LOE per Mcfe from E&P selected operating data; Q4 2024 and Q4 2025 calculated from full-year less Q1-Q3 LOE dollars divided by Q4 combined Bcfe." },
        gatheringProcessingTransportation: { value: 2.158300632911392, source: "codex", basis: "actual", note: "Sum of gathering and compression, processing, and transportation costs per Mcfe; Q4 2024 and Q4 2025 calculated from full-year less Q1-Q3 dollars divided by Q4 combined Bcfe." },
        cashGA: { value: 0.1337088607594937, source: "codex", basis: "actual", note: "Cash G&A is general and administrative expense excluding equity-based compensation per Mcfe; Q4 2024 and Q4 2025 calculated from full-year less Q1-Q3 dollars divided by Q4 combined Bcfe." },
        totalCashUnitCosts: { value: 2.643708860759494, source: "codex", basis: "derived", note: "Calculated consistently as AR all-in cash expense (LOE + GP&T + production/ad valorem taxes) + net marketing expense + cash G&A, all $/Mcfe." }
      },
      wells: {
        drilled: { value: null, source: "codex", basis: "actual", note: "Unavailable: no reliable standalone quarterly wells-drilled disclosure found in provided AR filings/releases; drilling records/spud/completion language not used." },
        turnedInLine: { value: 5.0, source: "codex", basis: "actual", note: "Gross operated wells placed to sales / turned to sales during quarter; treated as TIL equivalent." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Unavailable: no consistent quarter-end DUC inventory disclosure found; wells in process/completion backlog not used as DUC inventory." }
      }
    },
    "Q1 2025": {
      ticker: "AR",
      quarter: "Q1 2025",
      revenue: { value: 1352.707, source: "codex", basis: "actual", note: "Quarterly total consolidated revenue. Q4 2024 and Q4 2025 calculated as full-year total revenue less Q1-Q3 standalone totals." },
      adjustedEbitdax: { value: 549.428, source: "codex", basis: "actual", note: "Company-reported Adjusted EBITDAX / Adjusted EBITDA equivalent; standalone quarterly values." },
      capitalExpenditures: { value: 188.0, source: "codex", basis: "derived", note: "Corrected to total company capital expenditures (activity basis: D&C + leasehold/acreage + other capital where disclosed). Differs from cash capex used in AR FCF reconciliation." },
      netDebt: { value: 1292.575, source: "codex", basis: "derived", note: "Net debt calculated as quarter-end total debt principal less cash and cash equivalents; AR reported zero cash at each period end reviewed." },
      production: {
        total: { value: 3397.0, source: "codex", basis: "actual", note: "Average daily total production from E&P selected operating data; Q4 2024 and Q4 2025 calculated from full-year less Q1-Q3 combined Bcfe." },
        naturalGas: { value: 2166.666666666667, source: "codex", basis: "actual", note: "Average daily natural gas production calculated from disclosed Bcf divided by calendar days; Q4 2024 and Q4 2025 from full-year less Q1-Q3 volumes." },
        ngl: { value: 196.3444444444444, source: "codex", basis: "actual", note: "Average daily NGL production calculated as C2 ethane plus C3+ NGL volumes divided by calendar days; Q4 2024 and Q4 2025 from full-year less Q1-Q3 volumes." },
        oilCondensate: { value: 9.466666666666667, source: "codex", basis: "actual", note: "Average daily oil production calculated from disclosed oil MBbl divided by calendar days; Q4 2024 and Q4 2025 from full-year less Q1-Q3 volumes." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.6378176823, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.3467961927, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.01672063586, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 4.01, source: "codex", basis: "actual", note: "Pre-hedge realized natural gas price. Q4 2024 and Q4 2025 derived from gas sales and gas volumes using full-year less Q1-Q3 data." },
        ngl: { value: 31.77335464885972, source: "codex", basis: "actual", note: "Pre-hedge realized NGL price calculated as weighted average of disclosed C2 ethane and C3+ NGL prices using volumes; Q4 2024 and Q4 2025 derived from NGL sales and volumes using full-year less Q1-Q3 data." },
        oilCondensate: { value: 59.08, source: "codex", basis: "actual", note: "Pre-hedge realized oil price. Q4 2024 and Q4 2025 derived from oil sales and oil volumes using full-year less Q1-Q3 data." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.11, source: "codex", basis: "actual", note: "LOE per Mcfe from E&P selected operating data; Q4 2024 and Q4 2025 calculated from full-year less Q1-Q3 LOE dollars divided by Q4 combined Bcfe." },
        gatheringProcessingTransportation: { value: 2.27, source: "codex", basis: "actual", note: "Sum of gathering and compression, processing, and transportation costs per Mcfe; Q4 2024 and Q4 2025 calculated from full-year less Q1-Q3 dollars divided by Q4 combined Bcfe." },
        cashGA: { value: 0.15, source: "codex", basis: "actual", note: "Cash G&A is general and administrative expense excluding equity-based compensation per Mcfe; Q4 2024 and Q4 2025 calculated from full-year less Q1-Q3 dollars divided by Q4 combined Bcfe." },
        totalCashUnitCosts: { value: 2.77, source: "codex", basis: "derived", note: "Calculated consistently as AR all-in cash expense (LOE + GP&T + production/ad valorem taxes) + net marketing expense + cash G&A, all $/Mcfe." }
      },
      wells: {
        drilled: { value: null, source: "codex", basis: "actual", note: "Unavailable: no reliable standalone quarterly wells-drilled disclosure found in provided AR filings/releases; drilling records/spud/completion language not used." },
        turnedInLine: { value: 26.0, source: "codex", basis: "actual", note: "Gross operated wells placed to sales / turned to sales during quarter; treated as TIL equivalent." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Unavailable: no consistent quarter-end DUC inventory disclosure found; wells in process/completion backlog not used as DUC inventory." }
      }
    },
    "Q2 2025": {
      ticker: "AR",
      quarter: "Q2 2025",
      revenue: { value: 1297.493, source: "codex", basis: "actual", note: "Quarterly total consolidated revenue. Q4 2024 and Q4 2025 calculated as full-year total revenue less Q1-Q3 standalone totals." },
      adjustedEbitdax: { value: 379.464, source: "codex", basis: "actual", note: "Company-reported Adjusted EBITDAX / Adjusted EBITDA equivalent; standalone quarterly values." },
      capitalExpenditures: { value: 199.0, source: "codex", basis: "derived", note: "Corrected to total company capital expenditures (activity basis: D&C + leasehold/acreage + other capital where disclosed). Differs from cash capex used in AR FCF reconciliation." },
      netDebt: { value: 1105.353, source: "codex", basis: "derived", note: "Net debt calculated as quarter-end total debt principal less cash and cash equivalents; AR reported zero cash at each period end reviewed." },
      production: {
        total: { value: 3430.0, source: "codex", basis: "actual", note: "Average daily total production from E&P selected operating data; Q4 2024 and Q4 2025 calculated from full-year less Q1-Q3 combined Bcfe." },
        naturalGas: { value: 2230.769230769231, source: "codex", basis: "actual", note: "Average daily natural gas production calculated from disclosed Bcf divided by calendar days; Q4 2024 and Q4 2025 from full-year less Q1-Q3 volumes." },
        ngl: { value: 192.6593406593407, source: "codex", basis: "actual", note: "Average daily NGL production calculated as C2 ethane plus C3+ NGL volumes divided by calendar days; Q4 2024 and Q4 2025 from full-year less Q1-Q3 volumes." },
        oilCondensate: { value: 7.384615384615385, source: "codex", basis: "actual", note: "Average daily oil production calculated from disclosed oil MBbl divided by calendar days; Q4 2024 and Q4 2025 from full-year less Q1-Q3 volumes." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.6503700381, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.3370134239, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.01291769455, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 3.39, source: "codex", basis: "actual", note: "Pre-hedge realized natural gas price. Q4 2024 and Q4 2025 derived from gas sales and gas volumes using full-year less Q1-Q3 data." },
        ngl: { value: 27.4225690189368, source: "codex", basis: "actual", note: "Pre-hedge realized NGL price calculated as weighted average of disclosed C2 ethane and C3+ NGL prices using volumes; Q4 2024 and Q4 2025 derived from NGL sales and volumes using full-year less Q1-Q3 data." },
        oilCondensate: { value: 50.15, source: "codex", basis: "actual", note: "Pre-hedge realized oil price. Q4 2024 and Q4 2025 derived from oil sales and oil volumes using full-year less Q1-Q3 data." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.12, source: "codex", basis: "actual", note: "LOE per Mcfe from E&P selected operating data; Q4 2024 and Q4 2025 calculated from full-year less Q1-Q3 LOE dollars divided by Q4 combined Bcfe." },
        gatheringProcessingTransportation: { value: 2.25, source: "codex", basis: "actual", note: "Sum of gathering and compression, processing, and transportation costs per Mcfe; Q4 2024 and Q4 2025 calculated from full-year less Q1-Q3 dollars divided by Q4 combined Bcfe." },
        cashGA: { value: 0.13, source: "codex", basis: "actual", note: "Cash G&A is general and administrative expense excluding equity-based compensation per Mcfe; Q4 2024 and Q4 2025 calculated from full-year less Q1-Q3 dollars divided by Q4 combined Bcfe." },
        totalCashUnitCosts: { value: 2.67, source: "codex", basis: "derived", note: "Calculated consistently as AR all-in cash expense (LOE + GP&T + production/ad valorem taxes) + net marketing expense + cash G&A, all $/Mcfe." }
      },
      wells: {
        drilled: { value: null, source: "codex", basis: "actual", note: "Unavailable: no reliable standalone quarterly wells-drilled disclosure found in provided AR filings/releases; drilling records/spud/completion language not used." },
        turnedInLine: { value: 18.0, source: "codex", basis: "actual", note: "Gross operated wells placed to sales / turned to sales during quarter; treated as TIL equivalent." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Unavailable: no consistent quarter-end DUC inventory disclosure found; wells in process/completion backlog not used as DUC inventory." }
      }
    },
    "Q3 2025": {
      ticker: "AR",
      quarter: "Q3 2025",
      revenue: { value: 1213.994, source: "codex", basis: "actual", note: "Quarterly total consolidated revenue. Q4 2024 and Q4 2025 calculated as full-year total revenue less Q1-Q3 standalone totals." },
      adjustedEbitdax: { value: 318.24, source: "codex", basis: "actual", note: "Company-reported Adjusted EBITDAX / Adjusted EBITDA equivalent; standalone quarterly values." },
      capitalExpenditures: { value: 217.0, source: "codex", basis: "derived", note: "Corrected to total company capital expenditures (activity basis: D&C + leasehold/acreage + other capital where disclosed). Differs from cash capex used in AR FCF reconciliation." },
      netDebt: { value: 1313.553, source: "codex", basis: "derived", note: "Net debt calculated as quarter-end total debt principal less cash and cash equivalents; AR reported zero cash at each period end reviewed." },
      production: {
        total: { value: 3429.0, source: "codex", basis: "actual", note: "Average daily total production from E&P selected operating data; Q4 2024 and Q4 2025 calculated from full-year less Q1-Q3 combined Bcfe." },
        naturalGas: { value: 2195.652173913043, source: "codex", basis: "actual", note: "Average daily natural gas production calculated from disclosed Bcf divided by calendar days; Q4 2024 and Q4 2025 from full-year less Q1-Q3 volumes." },
        ngl: { value: 198.945652173913, source: "codex", basis: "actual", note: "Average daily NGL production calculated as C2 ethane plus C3+ NGL volumes divided by calendar days; Q4 2024 and Q4 2025 from full-year less Q1-Q3 volumes." },
        oilCondensate: { value: 6.728260869565218, source: "codex", basis: "actual", note: "Average daily oil production calculated from disclosed oil MBbl divided by calendar days; Q4 2024 and Q4 2025 from full-year less Q1-Q3 volumes." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.6403185109, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.3481113774, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.0117729849, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 3.12, source: "codex", basis: "actual", note: "Pre-hedge realized natural gas price. Q4 2024 and Q4 2025 derived from gas sales and gas volumes using full-year less Q1-Q3 data." },
        ngl: { value: 25.70048735180025, source: "codex", basis: "actual", note: "Pre-hedge realized NGL price calculated as weighted average of disclosed C2 ethane and C3+ NGL prices using volumes; Q4 2024 and Q4 2025 derived from NGL sales and volumes using full-year less Q1-Q3 data." },
        oilCondensate: { value: 50.65, source: "codex", basis: "actual", note: "Pre-hedge realized oil price. Q4 2024 and Q4 2025 derived from oil sales and oil volumes using full-year less Q1-Q3 data." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.1, source: "codex", basis: "actual", note: "LOE per Mcfe from E&P selected operating data; Q4 2024 and Q4 2025 calculated from full-year less Q1-Q3 LOE dollars divided by Q4 combined Bcfe." },
        gatheringProcessingTransportation: { value: 2.25, source: "codex", basis: "actual", note: "Sum of gathering and compression, processing, and transportation costs per Mcfe; Q4 2024 and Q4 2025 calculated from full-year less Q1-Q3 dollars divided by Q4 combined Bcfe." },
        cashGA: { value: 0.13, source: "codex", basis: "actual", note: "Cash G&A is general and administrative expense excluding equity-based compensation per Mcfe; Q4 2024 and Q4 2025 calculated from full-year less Q1-Q3 dollars divided by Q4 combined Bcfe." },
        totalCashUnitCosts: { value: 2.62, source: "codex", basis: "derived", note: "Calculated consistently as AR all-in cash expense (LOE + GP&T + production/ad valorem taxes) + net marketing expense + cash G&A, all $/Mcfe." }
      },
      wells: {
        drilled: { value: null, source: "codex", basis: "actual", note: "Unavailable: no reliable standalone quarterly wells-drilled disclosure found in provided AR filings/releases; drilling records/spud/completion language not used." },
        turnedInLine: { value: 16.0, source: "codex", basis: "actual", note: "Gross operated wells placed to sales / turned to sales during quarter; treated as TIL equivalent." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Unavailable: no consistent quarter-end DUC inventory disclosure found; wells in process/completion backlog not used as DUC inventory." }
      }
    },
    "Q4 2025": {
      ticker: "AR",
      quarter: "Q4 2025",
      revenue: { value: 1411.629, source: "codex", basis: "actual", note: "Quarterly total consolidated revenue. Q4 2024 and Q4 2025 calculated as full-year total revenue less Q1-Q3 standalone totals." },
      adjustedEbitdax: { value: 422.145, source: "codex", basis: "actual", note: "Company-reported Adjusted EBITDAX / Adjusted EBITDA equivalent; standalone quarterly values." },
      capitalExpenditures: { value: 193.0, source: "codex", basis: "derived", note: "Corrected to total company capital expenditures (activity basis: D&C + leasehold/acreage + other capital where disclosed). Differs from cash capex used in AR FCF reconciliation." },
      netDebt: { value: 1403.953, source: "codex", basis: "derived", note: "Net debt calculated as quarter-end total debt principal less cash and cash equivalents; AR reported zero cash at each period end reviewed." },
      production: {
        total: { value: 3510.869565217391, source: "codex", basis: "actual", note: "Average daily total production from E&P selected operating data; Q4 2024 and Q4 2025 calculated from full-year less Q1-Q3 combined Bcfe." },
        naturalGas: { value: 2260.869565217391, source: "codex", basis: "actual", note: "Average daily natural gas production calculated from disclosed Bcf divided by calendar days; Q4 2024 and Q4 2025 from full-year less Q1-Q3 volumes." },
        ngl: { value: 199.4130434782609, source: "codex", basis: "actual", note: "Average daily NGL production calculated as C2 ethane plus C3+ NGL volumes divided by calendar days; Q4 2024 and Q4 2025 from full-year less Q1-Q3 volumes." },
        oilCondensate: { value: 8.217391304347826, source: "codex", basis: "actual", note: "Average daily oil production calculated from disclosed oil MBbl divided by calendar days; Q4 2024 and Q4 2025 from full-year less Q1-Q3 volumes." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.6439628483, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.3407925697, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.01404334365, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 3.719211538461539, source: "codex", basis: "actual", note: "Pre-hedge realized natural gas price. Q4 2024 and Q4 2025 derived from gas sales and gas volumes using full-year less Q1-Q3 data." },
        ngl: { value: 25.85081216613976, source: "codex", basis: "actual", note: "Pre-hedge realized NGL price calculated as weighted average of disclosed C2 ethane and C3+ NGL prices using volumes; Q4 2024 and Q4 2025 derived from NGL sales and volumes using full-year less Q1-Q3 data." },
        oilCondensate: { value: 45.994708994709, source: "codex", basis: "actual", note: "Pre-hedge realized oil price. Q4 2024 and Q4 2025 derived from oil sales and oil volumes using full-year less Q1-Q3 data." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.09745820433436533, source: "codex", basis: "actual", note: "LOE per Mcfe from E&P selected operating data; Q4 2024 and Q4 2025 calculated from full-year less Q1-Q3 LOE dollars divided by Q4 combined Bcfe." },
        gatheringProcessingTransportation: { value: 2.321001547987616, source: "codex", basis: "actual", note: "Sum of gathering and compression, processing, and transportation costs per Mcfe; Q4 2024 and Q4 2025 calculated from full-year less Q1-Q3 dollars divided by Q4 combined Bcfe." },
        cashGA: { value: 0.1289256965944272, source: "codex", basis: "actual", note: "Cash G&A is general and administrative expense excluding equity-based compensation per Mcfe; Q4 2024 and Q4 2025 calculated from full-year less Q1-Q3 dollars divided by Q4 combined Bcfe." },
        totalCashUnitCosts: { value: 2.728925696594427, source: "codex", basis: "derived", note: "Calculated consistently as AR all-in cash expense (LOE + GP&T + production/ad valorem taxes) + net marketing expense + cash G&A, all $/Mcfe." }
      },
      wells: {
        drilled: { value: null, source: "codex", basis: "actual", note: "Unavailable: no reliable standalone quarterly wells-drilled disclosure found in provided AR filings/releases; drilling records/spud/completion language not used." },
        turnedInLine: { value: 18.0, source: "codex", basis: "actual", note: "Gross operated wells placed to sales / turned to sales during quarter; treated as TIL equivalent." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Unavailable: no consistent quarter-end DUC inventory disclosure found; wells in process/completion backlog not used as DUC inventory." }
      }
    },
    "Q1 2026": {
      ticker: "AR",
      quarter: "Q1 2026",
      revenue: { value: 1945.126, source: "codex", basis: "actual", note: "Quarterly total consolidated revenue. Q4 2024 and Q4 2025 calculated as full-year total revenue less Q1-Q3 standalone totals." },
      adjustedEbitdax: { value: 723.418, source: "codex", basis: "actual", note: "Company-reported Adjusted EBITDAX / Adjusted EBITDA equivalent; standalone quarterly values." },
      capitalExpenditures: { value: 252.0, source: "codex", basis: "derived", note: "Corrected to total company capital expenditures (activity basis: D&C + leasehold/acreage + other capital where disclosed). Differs from cash capex used in AR FCF reconciliation." },
      netDebt: { value: 2686.5, source: "codex", basis: "derived", note: "Net debt calculated as quarter-end total debt principal less cash and cash equivalents; AR reported zero cash at each period end reviewed." },
      production: {
        total: { value: 3852.0, source: "codex", basis: "actual", note: "Average daily total production from E&P selected operating data; Q4 2024 and Q4 2025 calculated from full-year less Q1-Q3 combined Bcfe." },
        naturalGas: { value: 2622.222222222222, source: "codex", basis: "actual", note: "Average daily natural gas production calculated from disclosed Bcf divided by calendar days; Q4 2024 and Q4 2025 from full-year less Q1-Q3 volumes." },
        ngl: { value: 196.7555555555556, source: "codex", basis: "actual", note: "Average daily NGL production calculated as C2 ethane plus C3+ NGL volumes divided by calendar days; Q4 2024 and Q4 2025 from full-year less Q1-Q3 volumes." },
        oilCondensate: { value: 9.066666666666666, source: "codex", basis: "actual", note: "Average daily oil production calculated from disclosed oil MBbl divided by calendar days; Q4 2024 and Q4 2025 from full-year less Q1-Q3 volumes." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.6807430483, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.306472828, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.01412253375, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 5.57, source: "codex", basis: "actual", note: "Pre-hedge realized natural gas price. Q4 2024 and Q4 2025 derived from gas sales and gas volumes using full-year less Q1-Q3 data." },
        ngl: { value: 28.44147278066524, source: "codex", basis: "actual", note: "Pre-hedge realized NGL price calculated as weighted average of disclosed C2 ethane and C3+ NGL prices using volumes; Q4 2024 and Q4 2025 derived from NGL sales and volumes using full-year less Q1-Q3 data." },
        oilCondensate: { value: 57.22, source: "codex", basis: "actual", note: "Pre-hedge realized oil price. Q4 2024 and Q4 2025 derived from oil sales and oil volumes using full-year less Q1-Q3 data." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.13, source: "codex", basis: "actual", note: "LOE per Mcfe from E&P selected operating data; Q4 2024 and Q4 2025 calculated from full-year less Q1-Q3 LOE dollars divided by Q4 combined Bcfe." },
        gatheringProcessingTransportation: { value: 2.28, source: "codex", basis: "actual", note: "Sum of gathering and compression, processing, and transportation costs per Mcfe; Q4 2024 and Q4 2025 calculated from full-year less Q1-Q3 dollars divided by Q4 combined Bcfe." },
        cashGA: { value: 0.15, source: "codex", basis: "actual", note: "Cash G&A is general and administrative expense excluding equity-based compensation per Mcfe; Q4 2024 and Q4 2025 calculated from full-year less Q1-Q3 dollars divided by Q4 combined Bcfe." },
        totalCashUnitCosts: { value: 2.85, source: "codex", basis: "derived", note: "Calculated consistently as AR all-in cash expense (LOE + GP&T + production/ad valorem taxes) + net marketing expense + cash G&A, all $/Mcfe." }
      },
      wells: {
        drilled: { value: null, source: "codex", basis: "actual", note: "Unavailable: no reliable standalone quarterly wells-drilled disclosure found in provided AR filings/releases; drilling records/spud/completion language not used." },
        turnedInLine: { value: 20.0, source: "codex", basis: "actual", note: "Gross operated wells placed to sales / turned to sales during quarter; treated as TIL equivalent." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Unavailable: no consistent quarter-end DUC inventory disclosure found; wells in process/completion backlog not used as DUC inventory." }
      }
    },
  },
  CNX: {
    "Q1 2024": {
      ticker: "CNX",
      quarter: "Q1 2024",
      revenue: { value: 384.553, source: "codex", basis: "actual", note: "Quarterly reported revenue and other operating income; Q4 values derived as FY less 9M where definitions match." },
      adjustedEbitdax: { value: 252.0, source: "codex", basis: "actual", note: "Company-reported CNX Adjusted EBITDAX from supplemental non-GAAP bridge. Includes EBIT + DD&A + exploration, adjusted for CNX-disclosed discrete items including unrealized derivative gains/losses, non-core asset sale gain/loss, stock-based compensation, debt extinguishment and Virginia flood insurance where applicable." },
      capitalExpenditures: { value: 168.0, source: "codex", basis: "actual", note: "Company-reported capital expenditures from CNX supplemental FCF reconciliation; standalone quarterly values." },
      netDebt: { value: 2277.33, source: "codex", basis: "derived", note: "Calculated as quarter-end debt principal less cash and cash equivalents, consistent with workbook row definition and RRC/AR method." },
      production: {
        total: { value: 1542.857142857143, source: "codex", basis: "actual", note: "Average daily total production converted to MMcfe/d from CNX total sales volumes." },
        naturalGas: { value: 1416.945054945055, source: "codex", basis: "actual", note: "Average daily natural gas production from CNX natural gas sales volumes." },
        ngl: { value: 20.58241758241758, source: "codex", basis: "actual", note: "Average daily NGL production from CNX NGL sales volumes." },
        oilCondensate: { value: 0.3186813186813187, source: "codex", basis: "actual", note: "Average daily oil/condensate production from CNX oil/condensate sales volumes." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.9183903134, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.08004273504, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.001239316239, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 2.17, source: "codex", basis: "actual", note: "Pre-hedge gross realized natural gas price." },
        ngl: { value: 23.94, source: "codex", basis: "actual", note: "Pre-hedge gross realized NGL price in $/Bbl." },
        oilCondensate: { value: 64.08, source: "codex", basis: "actual", note: "Pre-hedge gross realized oil/condensate price in $/Bbl." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.1262535612535612, source: "codex", basis: "actual", note: "LOE dollars divided by total sales volumes; Q4 values derived from FY less 9M where definitions match." },
        gatheringProcessingTransportation: { value: 0.6883974358974358, source: "codex", basis: "actual", note: "CNX transportation, gathering and compression cost dollars divided by total sales volumes." },
        cashGA: { value: 0.2184544159544159, source: "codex", basis: "actual", note: "Calculated from SG&A less CNX stock-based compensation adjustment, divided by total sales volumes." },
        totalCashUnitCosts: { value: 1.087407407407407, source: "codex", basis: "derived", note: "Calculated as LOE + production/ad valorem/other fees + transportation/gathering/compression + cash G&A, divided by total sales volumes." }
      },
      wells: {
        drilled: { value: 14.0, source: "codex", basis: "actual", note: "CNX Activity Summary 'TD' total; used as closest wells-drilled metric because TD reflects wells drilled to total depth. Not explicitly labeled gross/net or operated/total." },
        turnedInLine: { value: 4.0, source: "codex", basis: "actual", note: "CNX Activity Summary 'TIL' total; CNX defines TIL as turn-in-line, a well turned to sales." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Only true quarter-end drilled-but-uncompleted count populated: 2024 and 2025 year-end net development DUC wells from 10-K. Interim quarters left blank." }
      }
    },
    "Q2 2024": {
      ticker: "CNX",
      quarter: "Q2 2024",
      revenue: { value: 321.443, source: "codex", basis: "actual", note: "Quarterly reported revenue and other operating income; Q4 values derived as FY less 9M where definitions match." },
      adjustedEbitdax: { value: 242.0, source: "codex", basis: "actual", note: "Company-reported CNX Adjusted EBITDAX from supplemental non-GAAP bridge. Includes EBIT + DD&A + exploration, adjusted for CNX-disclosed discrete items including unrealized derivative gains/losses, non-core asset sale gain/loss, stock-based compensation, debt extinguishment and Virginia flood insurance where applicable." },
      capitalExpenditures: { value: 152.0, source: "codex", basis: "actual", note: "Company-reported capital expenditures from CNX supplemental FCF reconciliation; standalone quarterly values." },
      netDebt: { value: 2288.664, source: "codex", basis: "derived", note: "Calculated as quarter-end debt principal less cash and cash equivalents, consistent with workbook row definition and RRC/AR method." },
      production: {
        total: { value: 1472.527472527473, source: "codex", basis: "actual", note: "Average daily total production converted to MMcfe/d from CNX total sales volumes." },
        naturalGas: { value: 1334.626373626374, source: "codex", basis: "actual", note: "Average daily natural gas production from CNX natural gas sales volumes." },
        ngl: { value: 22.78021978021978, source: "codex", basis: "actual", note: "Average daily NGL production from CNX NGL sales volumes." },
        oilCondensate: { value: 0.1978021978021978, source: "codex", basis: "actual", note: "Average daily oil/condensate production from CNX oil/condensate sales volumes." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.9063507463, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.09282089552, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.0008059701493, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 1.6, source: "codex", basis: "actual", note: "Pre-hedge gross realized natural gas price." },
        ngl: { value: 19.68, source: "codex", basis: "actual", note: "Pre-hedge gross realized NGL price in $/Bbl." },
        oilCondensate: { value: 66.0, source: "codex", basis: "actual", note: "Pre-hedge gross realized oil/condensate price in $/Bbl." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.1329776119402985, source: "codex", basis: "actual", note: "LOE dollars divided by total sales volumes; Q4 values derived from FY less 9M where definitions match." },
        gatheringProcessingTransportation: { value: 0.6843955223880597, source: "codex", basis: "actual", note: "CNX transportation, gathering and compression cost dollars divided by total sales volumes." },
        cashGA: { value: 0.2091417910447761, source: "codex", basis: "actual", note: "Calculated from SG&A less CNX stock-based compensation adjustment, divided by total sales volumes." },
        totalCashUnitCosts: { value: 1.07605223880597, source: "codex", basis: "derived", note: "Calculated as LOE + production/ad valorem/other fees + transportation/gathering/compression + cash G&A, divided by total sales volumes." }
      },
      wells: {
        drilled: { value: 8.0, source: "codex", basis: "actual", note: "CNX Activity Summary 'TD' total; used as closest wells-drilled metric because TD reflects wells drilled to total depth. Not explicitly labeled gross/net or operated/total." },
        turnedInLine: { value: 2.0, source: "codex", basis: "actual", note: "CNX Activity Summary 'TIL' total; CNX defines TIL as turn-in-line, a well turned to sales." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Only true quarter-end drilled-but-uncompleted count populated: 2024 and 2025 year-end net development DUC wells from 10-K. Interim quarters left blank." }
      }
    },
    "Q3 2024": {
      ticker: "CNX",
      quarter: "Q3 2024",
      revenue: { value: 424.213, source: "codex", basis: "actual", note: "Quarterly reported revenue and other operating income; Q4 values derived as FY less 9M where definitions match." },
      adjustedEbitdax: { value: 253.0, source: "codex", basis: "actual", note: "Company-reported CNX Adjusted EBITDAX from supplemental non-GAAP bridge. Includes EBIT + DD&A + exploration, adjusted for CNX-disclosed discrete items including unrealized derivative gains/losses, non-core asset sale gain/loss, stock-based compensation, debt extinguishment and Virginia flood insurance where applicable." },
      capitalExpenditures: { value: 115.0, source: "codex", basis: "actual", note: "Company-reported capital expenditures from CNX supplemental FCF reconciliation; standalone quarterly values." },
      netDebt: { value: 2293.5, source: "codex", basis: "derived", note: "Calculated as quarter-end debt principal less cash and cash equivalents, consistent with workbook row definition and RRC/AR method." },
      production: {
        total: { value: 1461.95652173913, source: "codex", basis: "actual", note: "Average daily total production converted to MMcfe/d from CNX total sales volumes." },
        naturalGas: { value: 1314.130434782609, source: "codex", basis: "actual", note: "Average daily natural gas production from CNX natural gas sales volumes." },
        ngl: { value: 23.90217391304348, source: "codex", basis: "actual", note: "Average daily NGL production from CNX NGL sales volumes." },
        oilCondensate: { value: 0.717391304347826, source: "codex", basis: "actual", note: "Average daily oil/condensate production from CNX oil/condensate sales volumes." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.8988847584, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.09809665428, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.002944237918, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 1.73, source: "codex", basis: "actual", note: "Pre-hedge gross realized natural gas price." },
        ngl: { value: 21.0, source: "codex", basis: "actual", note: "Pre-hedge gross realized NGL price in $/Bbl." },
        oilCondensate: { value: 61.86, source: "codex", basis: "actual", note: "Pre-hedge gross realized oil/condensate price in $/Bbl." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.128275092936803, source: "codex", basis: "actual", note: "LOE dollars divided by total sales volumes; Q4 values derived from FY less 9M where definitions match." },
        gatheringProcessingTransportation: { value: 0.7157918215613382, source: "codex", basis: "actual", note: "CNX transportation, gathering and compression cost dollars divided by total sales volumes." },
        cashGA: { value: 0.2118810408921933, source: "codex", basis: "actual", note: "Calculated from SG&A less CNX stock-based compensation adjustment, divided by total sales volumes." },
        totalCashUnitCosts: { value: 1.105360594795539, source: "codex", basis: "derived", note: "Calculated as LOE + production/ad valorem/other fees + transportation/gathering/compression + cash G&A, divided by total sales volumes." }
      },
      wells: {
        drilled: { value: 3.0, source: "codex", basis: "actual", note: "CNX Activity Summary 'TD' total; used as closest wells-drilled metric because TD reflects wells drilled to total depth. Not explicitly labeled gross/net or operated/total." },
        turnedInLine: { value: 6.0, source: "codex", basis: "actual", note: "CNX Activity Summary 'TIL' total; CNX defines TIL as turn-in-line, a well turned to sales." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Only true quarter-end drilled-but-uncompleted count populated: 2024 and 2025 year-end net development DUC wells from 10-K. Interim quarters left blank." }
      }
    },
    "Q4 2024": {
      ticker: "CNX",
      quarter: "Q4 2024",
      revenue: { value: 136.578, source: "codex", basis: "actual", note: "Quarterly reported revenue and other operating income; Q4 values derived as FY less 9M where definitions match." },
      adjustedEbitdax: { value: 280.0, source: "codex", basis: "actual", note: "Company-reported CNX Adjusted EBITDAX from supplemental non-GAAP bridge. Includes EBIT + DD&A + exploration, adjusted for CNX-disclosed discrete items including unrealized derivative gains/losses, non-core asset sale gain/loss, stock-based compensation, debt extinguishment and Virginia flood insurance where applicable." },
      capitalExpenditures: { value: 105.3, source: "codex", basis: "actual", note: "Company-reported capital expenditures from CNX supplemental FCF reconciliation; standalone quarterly values." },
      netDebt: { value: 2158.188, source: "codex", basis: "derived", note: "Calculated as quarter-end debt principal less cash and cash equivalents, consistent with workbook row definition and RRC/AR method." },
      production: {
        total: { value: 1543.478260869565, source: "codex", basis: "actual", note: "Average daily total production converted to MMcfe/d from CNX total sales volumes." },
        naturalGas: { value: 1365.521739130435, source: "codex", basis: "actual", note: "Average daily natural gas production from CNX natural gas sales volumes." },
        ngl: { value: 29.1195652173913, source: "codex", basis: "actual", note: "Average daily NGL production from CNX NGL sales volumes." },
        oilCondensate: { value: 0.4782608695652174, source: "codex", basis: "actual", note: "Average daily oil/condensate production from CNX oil/condensate sales volumes." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.8847042254, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.1131971831, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.00185915493, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 2.414063743751393, source: "codex", basis: "actual", note: "Pre-hedge gross realized natural gas price." },
        ngl: { value: 21.86786114221724, source: "codex", basis: "actual", note: "Pre-hedge gross realized NGL price in $/Bbl." },
        oilCondensate: { value: 58.06818181818182, source: "codex", basis: "actual", note: "Pre-hedge gross realized oil/condensate price in $/Bbl." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.1256901408450705, source: "codex", basis: "actual", note: "LOE dollars divided by total sales volumes; Q4 values derived from FY less 9M where definitions match." },
        gatheringProcessingTransportation: { value: 0.6872323943661978, source: "codex", basis: "actual", note: "CNX transportation, gathering and compression cost dollars divided by total sales volumes." },
        cashGA: { value: 0.2714225352112676, source: "codex", basis: "actual", note: "Calculated from SG&A less CNX stock-based compensation adjustment, divided by total sales volumes." },
        totalCashUnitCosts: { value: 1.131140845070423, source: "codex", basis: "derived", note: "Calculated as LOE + production/ad valorem/other fees + transportation/gathering/compression + cash G&A, divided by total sales volumes." }
      },
      wells: {
        drilled: { value: 1.0, source: "codex", basis: "actual", note: "CNX Activity Summary 'TD' total; used as closest wells-drilled metric because TD reflects wells drilled to total depth. Not explicitly labeled gross/net or operated/total." },
        turnedInLine: { value: 6.0, source: "codex", basis: "actual", note: "CNX Activity Summary 'TIL' total; CNX defines TIL as turn-in-line, a well turned to sales." },
        ducInventory: { value: 4.98, source: "codex", basis: "actual", note: "Only true quarter-end drilled-but-uncompleted count populated: 2024 and 2025 year-end net development DUC wells from 10-K. Interim quarters left blank." }
      }
    },
    "Q1 2025": {
      ticker: "CNX",
      quarter: "Q1 2025",
      revenue: { value: 82.388, source: "codex", basis: "actual", note: "Quarterly reported revenue and other operating income; Q4 values derived as FY less 9M where definitions match." },
      adjustedEbitdax: { value: 325.0, source: "codex", basis: "actual", note: "Company-reported CNX Adjusted EBITDAX from supplemental non-GAAP bridge. Includes EBIT + DD&A + exploration, adjusted for CNX-disclosed discrete items including unrealized derivative gains/losses, non-core asset sale gain/loss, stock-based compensation, debt extinguishment and Virginia flood insurance where applicable." },
      capitalExpenditures: { value: 131.0, source: "codex", basis: "actual", note: "Company-reported capital expenditures from CNX supplemental FCF reconciliation; standalone quarterly values." },
      netDebt: { value: 2688.535, source: "codex", basis: "derived", note: "Calculated as quarter-end debt principal less cash and cash equivalents, consistent with workbook row definition and RRC/AR method." },
      production: {
        total: { value: 1642.222222222222, source: "codex", basis: "actual", note: "Average daily total production converted to MMcfe/d from CNX total sales volumes." },
        naturalGas: { value: 1504.533333333333, source: "codex", basis: "actual", note: "Average daily natural gas production from CNX natural gas sales volumes." },
        ngl: { value: 22.6, source: "codex", basis: "actual", note: "Average daily NGL production from CNX NGL sales volumes." },
        oilCondensate: { value: 0.3666666666666666, source: "codex", basis: "actual", note: "Average daily oil/condensate production from CNX oil/condensate sales volumes." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.9161569689, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.08257104195, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.001339648173, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 3.66, source: "codex", basis: "actual", note: "Pre-hedge gross realized natural gas price." },
        ngl: { value: 26.52, source: "codex", basis: "actual", note: "Pre-hedge gross realized NGL price in $/Bbl." },
        oilCondensate: { value: 57.66, source: "codex", basis: "actual", note: "Pre-hedge gross realized oil/condensate price in $/Bbl." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.1578687415426251, source: "codex", basis: "actual", note: "LOE dollars divided by total sales volumes; Q4 values derived from FY less 9M where definitions match." },
        gatheringProcessingTransportation: { value: 0.6438362652232746, source: "codex", basis: "actual", note: "CNX transportation, gathering and compression cost dollars divided by total sales volumes." },
        cashGA: { value: 0.2030649526387009, source: "codex", basis: "actual", note: "Calculated from SG&A less CNX stock-based compensation adjustment, divided by total sales volumes." },
        totalCashUnitCosts: { value: 1.053978349120433, source: "codex", basis: "derived", note: "Calculated as LOE + production/ad valorem/other fees + transportation/gathering/compression + cash G&A, divided by total sales volumes." }
      },
      wells: {
        drilled: { value: 5.0, source: "codex", basis: "actual", note: "CNX Activity Summary 'TD' total; used as closest wells-drilled metric because TD reflects wells drilled to total depth. Not explicitly labeled gross/net or operated/total." },
        turnedInLine: { value: 19.0, source: "codex", basis: "actual", note: "CNX Activity Summary 'TIL' total; CNX defines TIL as turn-in-line, a well turned to sales." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Only true quarter-end drilled-but-uncompleted count populated: 2024 and 2025 year-end net development DUC wells from 10-K. Interim quarters left blank." }
      }
    },
    "Q2 2025": {
      ticker: "CNX",
      quarter: "Q2 2025",
      revenue: { value: 962.422, source: "codex", basis: "actual", note: "Quarterly reported revenue and other operating income; Q4 values derived as FY less 9M where definitions match." },
      adjustedEbitdax: { value: 332.0, source: "codex", basis: "actual", note: "Company-reported CNX Adjusted EBITDAX from supplemental non-GAAP bridge. Includes EBIT + DD&A + exploration, adjusted for CNX-disclosed discrete items including unrealized derivative gains/losses, non-core asset sale gain/loss, stock-based compensation, debt extinguishment and Virginia flood insurance where applicable." },
      capitalExpenditures: { value: 114.0, source: "codex", basis: "actual", note: "Company-reported capital expenditures from CNX supplemental FCF reconciliation; standalone quarterly values." },
      netDebt: { value: 2621.496, source: "codex", basis: "derived", note: "Calculated as quarter-end debt principal less cash and cash equivalents, consistent with workbook row definition and RRC/AR method." },
      production: {
        total: { value: 1841.758241758242, source: "codex", basis: "actual", note: "Average daily total production converted to MMcfe/d from CNX total sales volumes." },
        naturalGas: { value: 1717.703296703297, source: "codex", basis: "actual", note: "Average daily natural gas production from CNX natural gas sales volumes." },
        ngl: { value: 20.35164835164835, source: "codex", basis: "actual", note: "Average daily NGL production from CNX NGL sales volumes." },
        oilCondensate: { value: 0.3406593406593407, source: "codex", basis: "actual", note: "Average daily oil/condensate production from CNX oil/condensate sales volumes." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.9326431981, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.06630071599, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.001109785203, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 2.84, source: "codex", basis: "actual", note: "Pre-hedge gross realized natural gas price." },
        ngl: { value: 21.48, source: "codex", basis: "actual", note: "Pre-hedge gross realized NGL price in $/Bbl." },
        oilCondensate: { value: 52.44, source: "codex", basis: "actual", note: "Pre-hedge gross realized oil/condensate price in $/Bbl." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.1566587112171838, source: "codex", basis: "actual", note: "LOE dollars divided by total sales volumes; Q4 values derived from FY less 9M where definitions match." },
        gatheringProcessingTransportation: { value: 0.5784785202863962, source: "codex", basis: "actual", note: "CNX transportation, gathering and compression cost dollars divided by total sales volumes." },
        cashGA: { value: 0.1436038186157518, source: "codex", basis: "actual", note: "Calculated from SG&A less CNX stock-based compensation adjustment, divided by total sales volumes." },
        totalCashUnitCosts: { value: 0.9364260143198092, source: "codex", basis: "derived", note: "Calculated as LOE + production/ad valorem/other fees + transportation/gathering/compression + cash G&A, divided by total sales volumes." }
      },
      wells: {
        drilled: { value: 3.0, source: "codex", basis: "actual", note: "CNX Activity Summary 'TD' total; used as closest wells-drilled metric because TD reflects wells drilled to total depth. Not explicitly labeled gross/net or operated/total." },
        turnedInLine: { value: 8.0, source: "codex", basis: "actual", note: "CNX Activity Summary 'TIL' total; CNX defines TIL as turn-in-line, a well turned to sales." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Only true quarter-end drilled-but-uncompleted count populated: 2024 and 2025 year-end net development DUC wells from 10-K. Interim quarters left blank." }
      }
    },
    "Q3 2025": {
      ticker: "CNX",
      quarter: "Q3 2025",
      revenue: { value: 583.84, source: "codex", basis: "actual", note: "Quarterly reported revenue and other operating income; Q4 values derived as FY less 9M where definitions match." },
      adjustedEbitdax: { value: 298.0, source: "codex", basis: "actual", note: "Company-reported CNX Adjusted EBITDAX from supplemental non-GAAP bridge. Includes EBIT + DD&A + exploration, adjusted for CNX-disclosed discrete items including unrealized derivative gains/losses, non-core asset sale gain/loss, stock-based compensation, debt extinguishment and Virginia flood insurance where applicable." },
      capitalExpenditures: { value: 76.0, source: "codex", basis: "actual", note: "Company-reported capital expenditures from CNX supplemental FCF reconciliation; standalone quarterly values." },
      netDebt: { value: 2580.492, source: "codex", basis: "derived", note: "Calculated as quarter-end debt principal less cash and cash equivalents, consistent with workbook row definition and RRC/AR method." },
      production: {
        total: { value: 1753.260869565217, source: "codex", basis: "actual", note: "Average daily total production converted to MMcfe/d from CNX total sales volumes." },
        naturalGas: { value: 1618.913043478261, source: "codex", basis: "actual", note: "Average daily natural gas production from CNX natural gas sales volumes." },
        ngl: { value: 21.81521739130435, source: "codex", basis: "actual", note: "Average daily NGL production from CNX NGL sales volumes." },
        oilCondensate: { value: 0.5760869565217391, source: "codex", basis: "actual", note: "Average daily oil/condensate production from CNX oil/condensate sales volumes." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.9233725976, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.07465592064, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.001971481711, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 2.43, source: "codex", basis: "actual", note: "Pre-hedge gross realized natural gas price." },
        ngl: { value: 18.24, source: "codex", basis: "actual", note: "Pre-hedge gross realized NGL price in $/Bbl." },
        oilCondensate: { value: 56.94, source: "codex", basis: "actual", note: "Pre-hedge gross realized oil/condensate price in $/Bbl." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.1681773093614383, source: "codex", basis: "actual", note: "LOE dollars divided by total sales volumes; Q4 values derived from FY less 9M where definitions match." },
        gatheringProcessingTransportation: { value: 0.601692498450093, source: "codex", basis: "actual", note: "CNX transportation, gathering and compression cost dollars divided by total sales volumes." },
        cashGA: { value: 0.157315561066336, source: "codex", basis: "actual", note: "Calculated from SG&A less CNX stock-based compensation adjustment, divided by total sales volumes." },
        totalCashUnitCosts: { value: 0.9750774953502789, source: "codex", basis: "derived", note: "Calculated as LOE + production/ad valorem/other fees + transportation/gathering/compression + cash G&A, divided by total sales volumes." }
      },
      wells: {
        drilled: { value: 0.0, source: "codex", basis: "actual", note: "CNX Activity Summary 'TD' total; used as closest wells-drilled metric because TD reflects wells drilled to total depth. Not explicitly labeled gross/net or operated/total." },
        turnedInLine: { value: 0.0, source: "codex", basis: "actual", note: "CNX Activity Summary 'TIL' total; CNX defines TIL as turn-in-line, a well turned to sales." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Only true quarter-end drilled-but-uncompleted count populated: 2024 and 2025 year-end net development DUC wells from 10-K. Interim quarters left blank." }
      }
    },
    "Q4 2025": {
      ticker: "CNX",
      quarter: "Q4 2025",
      revenue: { value: 610.4839999999999, source: "codex", basis: "actual", note: "Quarterly reported revenue and other operating income; Q4 values derived as FY less 9M where definitions match." },
      adjustedEbitdax: { value: 292.0, source: "codex", basis: "actual", note: "Company-reported CNX Adjusted EBITDAX from supplemental non-GAAP bridge. Includes EBIT + DD&A + exploration, adjusted for CNX-disclosed discrete items including unrealized derivative gains/losses, non-core asset sale gain/loss, stock-based compensation, debt extinguishment and Virginia flood insurance where applicable." },
      capitalExpenditures: { value: 174.0, source: "codex", basis: "actual", note: "Company-reported capital expenditures from CNX supplemental FCF reconciliation; standalone quarterly values." },
      netDebt: { value: 2428.642, source: "codex", basis: "derived", note: "Calculated as quarter-end debt principal less cash and cash equivalents, consistent with workbook row definition and RRC/AR method." },
      production: {
        total: { value: 1655.434782608696, source: "codex", basis: "actual", note: "Average daily total production converted to MMcfe/d from CNX total sales volumes." },
        naturalGas: { value: 1521.119565217391, source: "codex", basis: "actual", note: "Average daily natural gas production from CNX natural gas sales volumes." },
        ngl: { value: 21.89130434782609, source: "codex", basis: "actual", note: "Average daily NGL production from CNX NGL sales volumes." },
        oilCondensate: { value: 0.3804347826086957, source: "codex", basis: "actual", note: "Average daily oil/condensate production from CNX oil/condensate sales volumes." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.918864084, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.07934340118, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.001378857518, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 3.120106043174721, source: "codex", basis: "actual", note: "Pre-hedge gross realized natural gas price." },
        ngl: { value: 18.91310824230387, source: "codex", basis: "actual", note: "Pre-hedge gross realized NGL price in $/Bbl." },
        oilCondensate: { value: 53.91428571428571, source: "codex", basis: "actual", note: "Pre-hedge gross realized oil/condensate price in $/Bbl." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.1359225213394615, source: "codex", basis: "actual", note: "LOE dollars divided by total sales volumes; Q4 values derived from FY less 9M where definitions match." },
        gatheringProcessingTransportation: { value: 0.6168023637557449, source: "codex", basis: "actual", note: "CNX transportation, gathering and compression cost dollars divided by total sales volumes." },
        cashGA: { value: 0.241930400525279, source: "codex", basis: "actual", note: "Calculated from SG&A less CNX stock-based compensation adjustment, divided by total sales volumes." },
        totalCashUnitCosts: { value: 1.037557452396585, source: "codex", basis: "derived", note: "Calculated as LOE + production/ad valorem/other fees + transportation/gathering/compression + cash G&A, divided by total sales volumes." }
      },
      wells: {
        drilled: { value: 12.0, source: "codex", basis: "actual", note: "CNX Activity Summary 'TD' total; used as closest wells-drilled metric because TD reflects wells drilled to total depth. Not explicitly labeled gross/net or operated/total." },
        turnedInLine: { value: 6.0, source: "codex", basis: "actual", note: "CNX Activity Summary 'TIL' total; CNX defines TIL as turn-in-line, a well turned to sales." },
        ducInventory: { value: 10.0, source: "codex", basis: "actual", note: "Only true quarter-end drilled-but-uncompleted count populated: 2024 and 2025 year-end net development DUC wells from 10-K. Interim quarters left blank." }
      }
    },
    "Q1 2026": {
      ticker: "CNX",
      quarter: "Q1 2026",
      revenue: { value: 786.654, source: "codex", basis: "actual", note: "Quarterly reported revenue and other operating income; Q4 values derived as FY less 9M where definitions match." },
      adjustedEbitdax: { value: 400.0, source: "codex", basis: "actual", note: "Company-reported CNX Adjusted EBITDAX from supplemental non-GAAP bridge. Includes EBIT + DD&A + exploration, adjusted for CNX-disclosed discrete items including unrealized derivative gains/losses, non-core asset sale gain/loss, stock-based compensation, debt extinguishment and Virginia flood insurance where applicable." },
      capitalExpenditures: { value: 170.0, source: "codex", basis: "actual", note: "Company-reported capital expenditures from CNX supplemental FCF reconciliation; standalone quarterly values." },
      netDebt: { value: 2375.08, source: "codex", basis: "derived", note: "Calculated as quarter-end debt principal less cash and cash equivalents, consistent with workbook row definition and RRC/AR method." },
      production: {
        total: { value: 1693.333333333333, source: "codex", basis: "actual", note: "Average daily total production converted to MMcfe/d from CNX total sales volumes." },
        naturalGas: { value: 1543.8, source: "codex", basis: "actual", note: "Average daily natural gas production from CNX natural gas sales volumes." },
        ngl: { value: 24.22222222222222, source: "codex", basis: "actual", note: "Average daily NGL production from CNX NGL sales volumes." },
        oilCondensate: { value: 0.6444444444444445, source: "codex", basis: "actual", note: "Average daily oil/condensate production from CNX oil/condensate sales volumes." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.9116929134, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.08582677165, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.002283464567, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 4.74, source: "codex", basis: "actual", note: "Pre-hedge gross realized natural gas price." },
        ngl: { value: 27.54, source: "codex", basis: "actual", note: "Pre-hedge gross realized NGL price in $/Bbl." },
        oilCondensate: { value: 58.08, source: "codex", basis: "actual", note: "Pre-hedge gross realized oil/condensate price in $/Bbl." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.1428477690288714, source: "codex", basis: "actual", note: "LOE dollars divided by total sales volumes; Q4 values derived from FY less 9M where definitions match." },
        gatheringProcessingTransportation: { value: 0.6719225721784776, source: "codex", basis: "actual", note: "CNX transportation, gathering and compression cost dollars divided by total sales volumes." },
        cashGA: { value: 0.1722112860892388, source: "codex", basis: "actual", note: "Calculated from SG&A less CNX stock-based compensation adjustment, divided by total sales volumes." },
        totalCashUnitCosts: { value: 1.044652230971128, source: "codex", basis: "derived", note: "Calculated as LOE + production/ad valorem/other fees + transportation/gathering/compression + cash G&A, divided by total sales volumes." }
      },
      wells: {
        drilled: { value: 14.0, source: "codex", basis: "actual", note: "CNX Activity Summary 'TD' total; used as closest wells-drilled metric because TD reflects wells drilled to total depth. Not explicitly labeled gross/net or operated/total." },
        turnedInLine: { value: 12.0, source: "codex", basis: "actual", note: "CNX Activity Summary 'TIL' total; CNX defines TIL as turn-in-line, a well turned to sales." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Only true quarter-end drilled-but-uncompleted count populated: 2024 and 2025 year-end net development DUC wells from 10-K. Interim quarters left blank." }
      }
    },
  },
  CRK: {
    "Q1 2024": {
      ticker: "CRK",
      quarter: "Q1 2024",
      revenue: { value: 335.772, source: "codex", basis: "actual", note: "Quarterly reported revenue." },
      adjustedEbitdax: { value: 229.583, source: "codex", basis: "actual", note: "Company-reported adjusted EBITDA/EBITDAX; standalone quarterly values in $MM." },
      capitalExpenditures: { value: 331.035, source: "codex", basis: "actual", note: "Total quarterly capital expenditures / drilling & completion capital as reported." },
      netDebt: { value: 2722.46, source: "codex", basis: "derived", note: "Quarter-end total debt less cash, or company-reported net debt." },
      production: {
        total: { value: 1533.131868131868, source: "codex", basis: "actual", note: "Average daily total production; convert to MMcfe/d for comparability." },
        naturalGas: { value: 1532.340659340659, source: "codex", basis: "actual", note: "Average daily natural gas production." },
        ngl: { value: null, source: "codex", basis: "actual", note: "Average daily NGL production." },
        oilCondensate: { value: 0.1318681318681319, source: "codex", basis: "actual", note: "Average daily crude oil + condensate production where disclosed." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.9994839265, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.0005160735405, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 2.06, source: "codex", basis: "actual", note: "Pre-hedge realized natural gas price unless only post-hedge is disclosed; identify basis in notes." },
        ngl: { value: null, source: "codex", basis: "actual", note: "Pre-hedge realized NGL price." },
        oilCondensate: { value: 73.0, source: "codex", basis: "actual", note: "Pre-hedge realized oil / condensate price." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.25, source: "codex", basis: "actual", note: "Quarterly LOE / Mcfe." },
        gatheringProcessingTransportation: { value: 0.34, source: "codex", basis: "actual", note: "Combined or closest comparable G&P / transportation unit cost; explain composition in notes." },
        cashGA: { value: 0.0412572124861126, source: "codex", basis: "actual", note: "Cash G&A per Mcfe when disclosed or directly calculable from sourced data." },
        totalCashUnitCosts: { value: 0.7596161703042684, source: "codex", basis: "actual", note: "Company-reported total cash unit costs where available; do not force comparability if definitions differ." }
      },
      wells: {
        drilled: { value: null, source: "codex", basis: "actual", note: "Gross or net wells drilled; specify basis in notes. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        turnedInLine: { value: null, source: "codex", basis: "actual", note: "Wells placed on production / turned in line during the quarter. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Quarter-end drilled-but-uncompleted well inventory when disclosed." }
      }
    },
    "Q2 2024": {
      ticker: "CRK",
      quarter: "Q2 2024",
      revenue: { value: 246.83, source: "codex", basis: "actual", note: "Quarterly reported revenue." },
      adjustedEbitdax: { value: 166.705, source: "codex", basis: "actual", note: "Company-reported adjusted EBITDA/EBITDAX; standalone quarterly values in $MM." },
      capitalExpenditures: { value: 242.861, source: "codex", basis: "actual", note: "Total quarterly capital expenditures / drilling & completion capital as reported." },
      netDebt: { value: 2894.61, source: "codex", basis: "derived", note: "Quarter-end total debt less cash, or company-reported net debt." },
      production: {
        total: { value: 1439.0, source: "codex", basis: "actual", note: "Average daily total production; convert to MMcfe/d for comparability." },
        naturalGas: { value: 1438.032967032967, source: "codex", basis: "actual", note: "Average daily natural gas production." },
        ngl: { value: null, source: "codex", basis: "actual", note: "Average daily NGL production." },
        oilCondensate: { value: 0.1648351648351648, source: "codex", basis: "actual", note: "Average daily crude oil + condensate production where disclosed." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.9993279826, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.0006872904719, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 1.65, source: "codex", basis: "actual", note: "Pre-hedge realized natural gas price unless only post-hedge is disclosed; identify basis in notes." },
        ngl: { value: null, source: "codex", basis: "actual", note: "Pre-hedge realized NGL price." },
        oilCondensate: { value: 71.6, source: "codex", basis: "actual", note: "Pre-hedge realized oil / condensate price." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.27, source: "codex", basis: "actual", note: "Quarterly LOE / Mcfe." },
        gatheringProcessingTransportation: { value: 0.38, source: "codex", basis: "actual", note: "Combined or closest comparable G&P / transportation unit cost; explain composition in notes." },
        cashGA: { value: 0.0453458980213671, source: "codex", basis: "actual", note: "Cash G&A per Mcfe when disclosed or directly calculable from sourced data." },
        totalCashUnitCosts: { value: 0.8423038740272931, source: "codex", basis: "actual", note: "Company-reported total cash unit costs where available; do not force comparability if definitions differ." }
      },
      wells: {
        drilled: { value: null, source: "codex", basis: "actual", note: "Gross or net wells drilled; specify basis in notes. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        turnedInLine: { value: null, source: "codex", basis: "actual", note: "Wells placed on production / turned in line during the quarter. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Quarter-end drilled-but-uncompleted well inventory when disclosed." }
      }
    },
    "Q3 2024": {
      ticker: "CRK",
      quarter: "Q3 2024",
      revenue: { value: 304.472, source: "codex", basis: "actual", note: "Quarterly reported revenue." },
      adjustedEbitdax: { value: 201.671, source: "codex", basis: "actual", note: "Company-reported adjusted EBITDA/EBITDAX; standalone quarterly values in $MM." },
      capitalExpenditures: { value: 224.192, source: "codex", basis: "actual", note: "Total quarterly capital expenditures / drilling & completion capital as reported." },
      netDebt: { value: 2990.108, source: "codex", basis: "derived", note: "Quarter-end total debt less cash, or company-reported net debt." },
      production: {
        total: { value: 1447.804347826087, source: "codex", basis: "actual", note: "Average daily total production; convert to MMcfe/d for comparability." },
        naturalGas: { value: 1446.913043478261, source: "codex", basis: "actual", note: "Average daily natural gas production." },
        ngl: { value: null, source: "codex", basis: "actual", note: "Average daily NGL production." },
        oilCondensate: { value: 0.1413043478260869, source: "codex", basis: "actual", note: "Average daily crude oil + condensate production where disclosed." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.9993843751, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.0005855943783, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 1.9, source: "codex", basis: "actual", note: "Pre-hedge realized natural gas price unless only post-hedge is disclosed; identify basis in notes." },
        ngl: { value: null, source: "codex", basis: "actual", note: "Pre-hedge realized NGL price." },
        oilCondensate: { value: 75.0, source: "codex", basis: "actual", note: "Pre-hedge realized oil / condensate price." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.22, source: "codex", basis: "actual", note: "Quarterly LOE / Mcfe." },
        gatheringProcessingTransportation: { value: 0.41, source: "codex", basis: "actual", note: "Combined or closest comparable G&P / transportation unit cost; explain composition in notes." },
        cashGA: { value: 0.04521839667262272, source: "codex", basis: "actual", note: "Cash G&A per Mcfe when disclosed or directly calculable from sourced data." },
        totalCashUnitCosts: { value: 0.7696492439826425, source: "codex", basis: "actual", note: "Company-reported total cash unit costs where available; do not force comparability if definitions differ." }
      },
      wells: {
        drilled: { value: null, source: "codex", basis: "actual", note: "Gross or net wells drilled; specify basis in notes. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        turnedInLine: { value: null, source: "codex", basis: "actual", note: "Wells placed on production / turned in line during the quarter. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Quarter-end drilled-but-uncompleted well inventory when disclosed." }
      }
    },
    "Q4 2024": {
      ticker: "CRK",
      quarter: "Q4 2024",
      revenue: { value: 367.381, source: "codex", basis: "actual", note: "Quarterly reported revenue." },
      adjustedEbitdax: { value: 252.223, source: "codex", basis: "actual", note: "Company-reported adjusted EBITDA/EBITDAX; standalone quarterly values in $MM." },
      capitalExpenditures: { value: 299.601, source: "codex", basis: "actual", note: "Total quarterly capital expenditures / drilling & completion capital as reported." },
      netDebt: { value: 2997.081, source: "codex", basis: "derived", note: "Quarter-end total debt less cash, or company-reported net debt." },
      production: {
        total: { value: 1349.836956521739, source: "codex", basis: "actual", note: "Average daily total production; convert to MMcfe/d for comparability." },
        naturalGas: { value: 1349.217391304348, source: "codex", basis: "actual", note: "Average daily natural gas production." },
        ngl: { value: null, source: "codex", basis: "actual", note: "Average daily NGL production." },
        oilCondensate: { value: 0.108695652173913, source: "codex", basis: "actual", note: "Average daily crude oil + condensate production where disclosed." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.9995410074, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.0004831501389, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 2.317172596029905, source: "codex", basis: "actual", note: "Pre-hedge realized natural gas price unless only post-hedge is disclosed; identify basis in notes." },
        ngl: { value: null, source: "codex", basis: "actual", note: "Pre-hedge realized NGL price." },
        oilCondensate: { value: 67.2, source: "codex", basis: "actual", note: "Pre-hedge realized oil / condensate price." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.2526794701453476, source: "codex", basis: "actual", note: "Quarterly LOE / Mcfe." },
        gatheringProcessingTransportation: { value: 0.3578048878689052, source: "codex", basis: "actual", note: "Combined or closest comparable G&P / transportation unit cost; explain composition in notes." },
        cashGA: { value: 0.05056166203647783, source: "codex", basis: "actual", note: "Cash G&A per Mcfe when disclosed or directly calculable from sourced data." },
        totalCashUnitCosts: { value: 0.7231066553931634, source: "codex", basis: "actual", note: "Company-reported total cash unit costs where available; do not force comparability if definitions differ." }
      },
      wells: {
        drilled: { value: 18.0, source: "codex", basis: "actual", note: "Gross or net wells drilled; specify basis in notes. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        turnedInLine: { value: null, source: "codex", basis: "actual", note: "Wells placed on production / turned in line during the quarter. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Quarter-end drilled-but-uncompleted well inventory when disclosed." }
      }
    },
    "Q1 2025": {
      ticker: "CRK",
      quarter: "Q1 2025",
      revenue: { value: 512.854, source: "codex", basis: "actual", note: "Quarterly reported revenue." },
      adjustedEbitdax: { value: 293.031, source: "codex", basis: "actual", note: "Company-reported adjusted EBITDA/EBITDAX; standalone quarterly values in $MM." },
      capitalExpenditures: { value: 308.212, source: "codex", basis: "actual", note: "Total quarterly capital expenditures / drilling & completion capital as reported." },
      netDebt: { value: 3066.005, source: "codex", basis: "derived", note: "Quarter-end total debt less cash, or company-reported net debt." },
      production: {
        total: { value: 1278.788888888889, source: "codex", basis: "actual", note: "Average daily total production; convert to MMcfe/d for comparability." },
        naturalGas: { value: 1278.1, source: "codex", basis: "actual", note: "Average daily natural gas production." },
        ngl: { value: null, source: "codex", basis: "actual", note: "Average daily NGL production." },
        oilCondensate: { value: 0.1111111111111111, source: "codex", basis: "actual", note: "Average daily crude oil + condensate production where disclosed." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.9994612958, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.0005213266024, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 3.58, source: "codex", basis: "actual", note: "Pre-hedge realized natural gas price unless only post-hedge is disclosed; identify basis in notes." },
        ngl: { value: null, source: "codex", basis: "actual", note: "Pre-hedge realized NGL price." },
        oilCondensate: { value: 70.2, source: "codex", basis: "actual", note: "Pre-hedge realized oil / condensate price." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.3, source: "codex", basis: "actual", note: "Quarterly LOE / Mcfe." },
        gatheringProcessingTransportation: { value: 0.37, source: "codex", basis: "actual", note: "Combined or closest comparable G&P / transportation unit cost; explain composition in notes." },
        cashGA: { value: 0.05804102840361106, source: "codex", basis: "actual", note: "Cash G&A per Mcfe when disclosed or directly calculable from sourced data." },
        totalCashUnitCosts: { value: 0.8251728632125882, source: "codex", basis: "actual", note: "Company-reported total cash unit costs where available; do not force comparability if definitions differ." }
      },
      wells: {
        drilled: { value: 7.0, source: "codex", basis: "actual", note: "Gross or net wells drilled; specify basis in notes. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        turnedInLine: { value: 8.0, source: "codex", basis: "actual", note: "Wells placed on production / turned in line during the quarter. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Quarter-end drilled-but-uncompleted well inventory when disclosed." }
      }
    },
    "Q2 2025": {
      ticker: "CRK",
      quarter: "Q2 2025",
      revenue: { value: 470.262, source: "codex", basis: "actual", note: "Quarterly reported revenue." },
      adjustedEbitdax: { value: 259.74, source: "codex", basis: "actual", note: "Company-reported adjusted EBITDA/EBITDAX; standalone quarterly values in $MM." },
      capitalExpenditures: { value: 331.557, source: "codex", basis: "actual", note: "Total quarterly capital expenditures / drilling & completion capital as reported." },
      netDebt: { value: 3038.021, source: "codex", basis: "derived", note: "Quarter-end total debt less cash, or company-reported net debt." },
      production: {
        total: { value: 1233.384615384615, source: "codex", basis: "actual", note: "Average daily total production; convert to MMcfe/d for comparability." },
        naturalGas: { value: 1232.571428571429, source: "codex", basis: "actual", note: "Average daily natural gas production." },
        ngl: { value: null, source: "codex", basis: "actual", note: "Average daily NGL production." },
        oilCondensate: { value: 0.1428571428571428, source: "codex", basis: "actual", note: "Average daily crude oil + condensate production where disclosed." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.9993406868, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.0006949517989, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 3.02, source: "codex", basis: "actual", note: "Pre-hedge realized natural gas price unless only post-hedge is disclosed; identify basis in notes." },
        ngl: { value: null, source: "codex", basis: "actual", note: "Pre-hedge realized NGL price." },
        oilCondensate: { value: 57.0, source: "codex", basis: "actual", note: "Pre-hedge realized oil / condensate price." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.28, source: "codex", basis: "actual", note: "Quarterly LOE / Mcfe." },
        gatheringProcessingTransportation: { value: 0.37, source: "codex", basis: "actual", note: "Combined or closest comparable G&P / transportation unit cost; explain composition in notes." },
        cashGA: { value: 0.06058554143872841, source: "codex", basis: "actual", note: "Cash G&A per Mcfe when disclosed or directly calculable from sourced data." },
        totalCashUnitCosts: { value: 0.8046267752454606, source: "codex", basis: "actual", note: "Company-reported total cash unit costs where available; do not force comparability if definitions differ." }
      },
      wells: {
        drilled: { value: 12.0, source: "codex", basis: "actual", note: "Gross or net wells drilled; specify basis in notes. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        turnedInLine: { value: 13.0, source: "codex", basis: "actual", note: "Wells placed on production / turned in line during the quarter. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Quarter-end drilled-but-uncompleted well inventory when disclosed." }
      }
    },
    "Q3 2025": {
      ticker: "CRK",
      quarter: "Q3 2025",
      revenue: { value: 449.852, source: "codex", basis: "actual", note: "Quarterly reported revenue." },
      adjustedEbitdax: { value: 249.115, source: "codex", basis: "actual", note: "Company-reported adjusted EBITDA/EBITDAX; standalone quarterly values in $MM." },
      capitalExpenditures: { value: 345.005, source: "codex", basis: "actual", note: "Total quarterly capital expenditures / drilling & completion capital as reported." },
      netDebt: { value: 3149.665, source: "codex", basis: "derived", note: "Quarter-end total debt less cash, or company-reported net debt." },
      production: {
        total: { value: 1215.619565217391, source: "codex", basis: "actual", note: "Average daily total production; convert to MMcfe/d for comparability." },
        naturalGas: { value: 1214.891304347826, source: "codex", basis: "actual", note: "Average daily natural gas production." },
        ngl: { value: null, source: "codex", basis: "actual", note: "Average daily NGL production." },
        oilCondensate: { value: 0.1195652173913044, source: "codex", basis: "actual", note: "Average daily crude oil + condensate production where disclosed." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.9994009138, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.0005901445854, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 2.75, source: "codex", basis: "actual", note: "Pre-hedge realized natural gas price unless only post-hedge is disclosed; identify basis in notes." },
        ngl: { value: null, source: "codex", basis: "actual", note: "Pre-hedge realized NGL price." },
        oilCondensate: { value: 61.91, source: "codex", basis: "actual", note: "Pre-hedge realized oil / condensate price." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.26, source: "codex", basis: "actual", note: "Quarterly LOE / Mcfe." },
        gatheringProcessingTransportation: { value: 0.36, source: "codex", basis: "actual", note: "Combined or closest comparable G&P / transportation unit cost; explain composition in notes." },
        cashGA: { value: 0.05279111564151399, source: "codex", basis: "actual", note: "Cash G&A per Mcfe when disclosed or directly calculable from sourced data." },
        totalCashUnitCosts: { value: 0.7730799288249863, source: "codex", basis: "actual", note: "Company-reported total cash unit costs where available; do not force comparability if definitions differ." }
      },
      wells: {
        drilled: { value: 17.0, source: "codex", basis: "actual", note: "Gross or net wells drilled; specify basis in notes. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        turnedInLine: { value: 11.0, source: "codex", basis: "actual", note: "Wells placed on production / turned in line during the quarter. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Quarter-end drilled-but-uncompleted well inventory when disclosed." }
      }
    },
    "Q4 2025": {
      ticker: "CRK",
      quarter: "Q4 2025",
      revenue: { value: 787.321, source: "codex", basis: "actual", note: "Quarterly reported revenue." },
      adjustedEbitdax: { value: 276.834, source: "codex", basis: "actual", note: "Company-reported adjusted EBITDA/EBITDAX; standalone quarterly values in $MM." },
      capitalExpenditures: { value: 366.684, source: "codex", basis: "actual", note: "Total quarterly capital expenditures / drilling & completion capital as reported." },
      netDebt: { value: 2824.95, source: "codex", basis: "derived", note: "Quarter-end total debt less cash, or company-reported net debt." },
      production: {
        total: { value: 1209.315217391304, source: "codex", basis: "actual", note: "Average daily total production; convert to MMcfe/d for comparability." },
        naturalGas: { value: 1209.119565217391, source: "codex", basis: "actual", note: "Average daily natural gas production." },
        ngl: { value: null, source: "codex", basis: "actual", note: "Average daily NGL production." },
        oilCondensate: { value: 0.03260869565217391, source: "codex", basis: "actual", note: "Average daily crude oil + condensate production where disclosed." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.9998382124, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.0001617875729, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 3.294168412157607, source: "codex", basis: "actual", note: "Pre-hedge realized natural gas price unless only post-hedge is disclosed; identify basis in notes." },
        ngl: { value: null, source: "codex", basis: "actual", note: "Pre-hedge realized NGL price." },
        oilCondensate: { value: 56.0, source: "codex", basis: "actual", note: "Pre-hedge realized oil / condensate price." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.2496472132090565, source: "codex", basis: "actual", note: "Quarterly LOE / Mcfe." },
        gatheringProcessingTransportation: { value: 0.37537413376237, source: "codex", basis: "actual", note: "Combined or closest comparable G&P / transportation unit cost; explain composition in notes." },
        cashGA: { value: 0.0728133960110375, source: "codex", basis: "actual", note: "Cash G&A per Mcfe when disclosed or directly calculable from sourced data." },
        totalCashUnitCosts: { value: 0.765273196293267, source: "codex", basis: "actual", note: "Company-reported total cash unit costs where available; do not force comparability if definitions differ." }
      },
      wells: {
        drilled: { value: 16.0, source: "codex", basis: "actual", note: "Gross or net wells drilled; specify basis in notes. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        turnedInLine: { value: 15.0, source: "codex", basis: "actual", note: "Wells placed on production / turned in line during the quarter. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Quarter-end drilled-but-uncompleted well inventory when disclosed." }
      }
    },
    "Q1 2026": {
      ticker: "CRK",
      quarter: "Q1 2026",
      revenue: { value: 587.354, source: "codex", basis: "actual", note: "Quarterly reported revenue." },
      adjustedEbitdax: { value: 251.265, source: "codex", basis: "actual", note: "Company-reported adjusted EBITDA/EBITDAX; standalone quarterly values in $MM." },
      capitalExpenditures: { value: 417.102, source: "codex", basis: "actual", note: "Total quarterly capital expenditures / drilling & completion capital as reported." },
      netDebt: { value: 2971.095, source: "codex", basis: "derived", note: "Quarter-end total debt less cash, or company-reported net debt." },
      production: {
        total: { value: 1087.988888888889, source: "codex", basis: "actual", note: "Average daily total production; convert to MMcfe/d for comparability." },
        naturalGas: { value: 1087.277777777778, source: "codex", basis: "actual", note: "Average daily natural gas production." },
        ngl: { value: null, source: "codex", basis: "actual", note: "Average daily NGL production." },
        oilCondensate: { value: 0.1222222222222222, source: "codex", basis: "actual", note: "Average daily crude oil + condensate production where disclosed." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.9993463986, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.0006740264913, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 4.27, source: "codex", basis: "actual", note: "Pre-hedge realized natural gas price unless only post-hedge is disclosed; identify basis in notes." },
        ngl: { value: null, source: "codex", basis: "actual", note: "Pre-hedge realized NGL price." },
        oilCondensate: { value: 68.91, source: "codex", basis: "actual", note: "Pre-hedge realized oil / condensate price." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.29, source: "codex", basis: "actual", note: "Quarterly LOE / Mcfe." },
        gatheringProcessingTransportation: { value: 0.43, source: "codex", basis: "actual", note: "Combined or closest comparable G&P / transportation unit cost; explain composition in notes." },
        cashGA: { value: 0.1105199195253219, source: "codex", basis: "actual", note: "Cash G&A per Mcfe when disclosed or directly calculable from sourced data." },
        totalCashUnitCosts: { value: 0.936985467580347, source: "codex", basis: "actual", note: "Company-reported total cash unit costs where available; do not force comparability if definitions differ." }
      },
      wells: {
        drilled: { value: 17.0, source: "codex", basis: "actual", note: "Gross or net wells drilled; specify basis in notes. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        turnedInLine: { value: 13.0, source: "codex", basis: "actual", note: "Wells placed on production / turned in line during the quarter. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Quarter-end drilled-but-uncompleted well inventory when disclosed." }
      }
    },
  },
  EQT: {
    "Q1 2024": {
      ticker: "EQT",
      quarter: "Q1 2024",
      revenue: { value: 1412.268, source: "codex", basis: "actual", note: "Quarterly reported revenue." },
      adjustedEbitdax: { value: 1011.707, source: "codex", basis: "actual", note: "Company-reported Adjusted EBITDA; used as the closest disclosed peer equivalent to Adjusted EBITDAX." },
      capitalExpenditures: { value: 549.0, source: "codex", basis: "actual", note: "Total quarterly capital expenditures / drilling & completion capital as reported." },
      netDebt: { value: 4896.304, source: "codex", basis: "derived", note: "Quarter-end total debt less cash and cash equivalents; uses principal debt when explicitly disclosed, otherwise reported debt carrying amount." },
      production: {
        total: { value: 5868.681318681319, source: "codex", basis: "actual", note: "Average daily total production; convert to MMcfe/d for comparability." },
        naturalGas: { value: 5486.527472527472, source: "codex", basis: "actual", note: "Average daily natural gas production." },
        ngl: { value: 58.79120879120879, source: "codex", basis: "actual", note: "Average daily NGL production." },
        oilCondensate: { value: 4.901098901098901, source: "codex", basis: "actual", note: "Average daily crude oil + condensate production where disclosed." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.9348825016, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.06010673158, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.005010766782, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 2.255, source: "codex", basis: "actual", note: "Pre-hedge realized natural gas price unless only post-hedge is disclosed; identify basis in notes." },
        ngl: { value: 41.59, source: "codex", basis: "actual", note: "Pre-hedge realized NGL price." },
        oilCondensate: { value: 58.74, source: "codex", basis: "actual", note: "Pre-hedge realized oil / condensate price." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.1, source: "codex", basis: "actual", note: "Quarterly LOE / Mcfe." },
        gatheringProcessingTransportation: { value: 1.021, source: "codex", basis: "actual", note: "Combined or closest comparable G&P / transportation unit cost; explain composition in notes." },
        cashGA: { value: 0.117, source: "codex", basis: "actual", note: "Cash G&A per Mcfe when disclosed or directly calculable from sourced data." },
        totalCashUnitCosts: { value: 1.36, source: "codex", basis: "actual", note: "Company-reported total cash unit costs where available; do not force comparability if definitions differ." }
      },
      wells: {
        drilled: { value: null, source: "codex", basis: "actual", note: "Gross or net wells drilled; specify basis in notes. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        turnedInLine: { value: null, source: "codex", basis: "actual", note: "Wells placed on production / turned in line during the quarter. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Quarter-end drilled-but-uncompleted well inventory when disclosed." }
      }
    },
    "Q2 2024": {
      ticker: "EQT",
      quarter: "Q2 2024",
      revenue: { value: 952.512, source: "codex", basis: "actual", note: "Quarterly reported revenue." },
      adjustedEbitdax: { value: 464.147, source: "codex", basis: "actual", note: "Company-reported Adjusted EBITDA; used as the closest disclosed peer equivalent to Adjusted EBITDAX." },
      capitalExpenditures: { value: 576.0, source: "codex", basis: "actual", note: "Total quarterly capital expenditures / drilling & completion capital as reported." },
      netDebt: { value: 4958.307, source: "codex", basis: "derived", note: "Quarter-end total debt less cash and cash equivalents; uses principal debt when explicitly disclosed, otherwise reported debt carrying amount." },
      production: {
        total: { value: 5577.054945054945, source: "codex", basis: "actual", note: "Average daily total production; convert to MMcfe/d for comparability." },
        naturalGas: { value: 5209.615384615385, source: "codex", basis: "actual", note: "Average daily natural gas production." },
        ngl: { value: 57.85714285714285, source: "codex", basis: "actual", note: "Average daily NGL production." },
        oilCondensate: { value: 3.384615384615385, source: "codex", basis: "actual", note: "Average daily crude oil + condensate production where disclosed." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.9341158436, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.06224483362, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.003641293211, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 1.53, source: "codex", basis: "actual", note: "Pre-hedge realized natural gas price unless only post-hedge is disclosed; identify basis in notes." },
        ngl: { value: 37.95, source: "codex", basis: "actual", note: "Pre-hedge realized NGL price." },
        oilCondensate: { value: 61.96, source: "codex", basis: "actual", note: "Pre-hedge realized oil / condensate price." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.12, source: "codex", basis: "actual", note: "Quarterly LOE / Mcfe." },
        gatheringProcessingTransportation: { value: 1.07, source: "codex", basis: "actual", note: "Combined or closest comparable G&P / transportation unit cost; explain composition in notes." },
        cashGA: { value: 0.109, source: "codex", basis: "actual", note: "Cash G&A per Mcfe when disclosed or directly calculable from sourced data." },
        totalCashUnitCosts: { value: 1.4, source: "codex", basis: "actual", note: "Company-reported total cash unit costs where available; do not force comparability if definitions differ." }
      },
      wells: {
        drilled: { value: null, source: "codex", basis: "actual", note: "Gross or net wells drilled; specify basis in notes. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        turnedInLine: { value: null, source: "codex", basis: "actual", note: "Wells placed on production / turned in line during the quarter. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Quarter-end drilled-but-uncompleted well inventory when disclosed." }
      }
    },
    "Q3 2024": {
      ticker: "EQT",
      quarter: "Q3 2024",
      revenue: { value: 1283.802, source: "codex", basis: "actual", note: "Quarterly reported revenue." },
      adjustedEbitdax: { value: 831.943, source: "codex", basis: "actual", note: "Company-reported Adjusted EBITDA; used as the closest disclosed peer equivalent to Adjusted EBITDAX." },
      capitalExpenditures: { value: 557.889, source: "codex", basis: "actual", note: "Total quarterly capital expenditures / drilling & completion capital as reported." },
      netDebt: { value: 13763.897, source: "codex", basis: "derived", note: "Quarter-end total debt less cash and cash equivalents; uses principal debt when explicitly disclosed, otherwise reported debt carrying amount." },
      production: {
        total: { value: 6319.717391304348, source: "codex", basis: "actual", note: "Average daily total production; convert to MMcfe/d for comparability." },
        naturalGas: { value: 5948.097826086957, source: "codex", basis: "actual", note: "Average daily natural gas production." },
        ngl: { value: 58.19565217391305, source: "codex", basis: "actual", note: "Average daily NGL production." },
        oilCondensate: { value: 3.75, source: "codex", basis: "actual", note: "Average daily crude oil + condensate production where disclosed." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.9411968064, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.05525150753, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.003560285786, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 1.71, source: "codex", basis: "actual", note: "Pre-hedge realized natural gas price unless only post-hedge is disclosed; identify basis in notes." },
        ngl: { value: 35.2, source: "codex", basis: "actual", note: "Pre-hedge realized NGL price." },
        oilCondensate: { value: 61.25, source: "codex", basis: "actual", note: "Pre-hedge realized oil / condensate price." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.09, source: "codex", basis: "actual", note: "Quarterly LOE / Mcfe." },
        gatheringProcessingTransportation: { value: 0.758, source: "codex", basis: "actual", note: "Combined or closest comparable G&P / transportation unit cost; explain composition in notes." },
        cashGA: { value: -0.071, source: "codex", basis: "actual", note: "Cash G&A per Mcfe when disclosed or directly calculable from sourced data." },
        totalCashUnitCosts: { value: 1.46, source: "codex", basis: "actual", note: "Company-reported total cash unit costs where available; do not force comparability if definitions differ." }
      },
      wells: {
        drilled: { value: null, source: "codex", basis: "actual", note: "Gross or net wells drilled; specify basis in notes. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        turnedInLine: { value: null, source: "codex", basis: "actual", note: "Wells placed on production / turned in line during the quarter. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Quarter-end drilled-but-uncompleted well inventory when disclosed." }
      }
    },
    "Q4 2024": {
      ticker: "EQT",
      quarter: "Q4 2024",
      revenue: { value: 1624.727, source: "codex", basis: "actual", note: "Quarterly reported revenue." },
      adjustedEbitdax: { value: 1411.871, source: "codex", basis: "actual", note: "Company-reported Adjusted EBITDA; used as the closest disclosed peer equivalent to Adjusted EBITDAX." },
      capitalExpenditures: { value: 582.937, source: "codex", basis: "actual", note: "Total quarterly capital expenditures / drilling & completion capital as reported." },
      netDebt: { value: 9166.423, source: "codex", basis: "derived", note: "Quarter-end total debt less cash and cash equivalents; uses principal debt when explicitly disclosed, otherwise reported debt carrying amount." },
      production: {
        total: { value: 6578.076086956522, source: "codex", basis: "actual", note: "Average daily total production; convert to MMcfe/d for comparability." },
        naturalGas: { value: 6150.728260869565, source: "codex", basis: "actual", note: "Average daily natural gas production." },
        ngl: { value: 65.83514492753261, source: "codex", basis: "actual", note: "Average daily NGL production." },
        oilCondensate: { value: 5.389492753619565, source: "codex", basis: "actual", note: "Average daily crude oil + condensate production where disclosed." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.9350345267, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.06004960483, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.004915868423, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 2.77, source: "codex", basis: "actual", note: "Pre-hedge realized natural gas price unless only post-hedge is disclosed; identify basis in notes." },
        ngl: { value: 41.65, source: "codex", basis: "actual", note: "Pre-hedge realized NGL price." },
        oilCondensate: { value: 54.75, source: "codex", basis: "actual", note: "Pre-hedge realized oil / condensate price." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.09, source: "codex", basis: "actual", note: "Quarterly LOE / Mcfe." },
        gatheringProcessingTransportation: { value: 0.639, source: "codex", basis: "actual", note: "Combined or closest comparable G&P / transportation unit cost; explain composition in notes." },
        cashGA: { value: 0.178, source: "codex", basis: "actual", note: "Cash G&A per Mcfe when disclosed or directly calculable from sourced data." },
        totalCashUnitCosts: { value: 1.07, source: "codex", basis: "actual", note: "Company-reported total cash unit costs where available; do not force comparability if definitions differ." }
      },
      wells: {
        drilled: { value: null, source: "codex", basis: "actual", note: "Gross or net wells drilled; specify basis in notes. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        turnedInLine: { value: null, source: "codex", basis: "actual", note: "Wells placed on production / turned in line during the quarter. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Quarter-end drilled-but-uncompleted well inventory when disclosed." }
      }
    },
    "Q1 2025": {
      ticker: "EQT",
      quarter: "Q1 2025",
      revenue: { value: 1739.85, source: "codex", basis: "actual", note: "Quarterly reported revenue." },
      adjustedEbitdax: { value: 1780.661, source: "codex", basis: "actual", note: "Company-reported Adjusted EBITDA; used as the closest disclosed peer equivalent to Adjusted EBITDAX." },
      capitalExpenditures: { value: 497.444, source: "codex", basis: "actual", note: "Total quarterly capital expenditures / drilling & completion capital as reported." },
      netDebt: { value: 8161.398, source: "codex", basis: "derived", note: "Quarter-end total debt less cash and cash equivalents; uses principal debt when explicitly disclosed, otherwise reported debt carrying amount." },
      production: {
        total: { value: 6341.677777777778, source: "codex", basis: "actual", note: "Average daily total production; convert to MMcfe/d for comparability." },
        naturalGas: { value: 5959.311111111111, source: "codex", basis: "actual", note: "Average daily natural gas production." },
        ngl: { value: 59.33333333333334, source: "codex", basis: "actual", note: "Average daily NGL production." },
        oilCondensate: { value: 4.388888888888889, source: "codex", basis: "actual", note: "Average daily crude oil + condensate production where disclosed." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.9397057561, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.05613656393, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.004152423736, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 3.82, source: "codex", basis: "actual", note: "Pre-hedge realized natural gas price unless only post-hedge is disclosed; identify basis in notes." },
        ngl: { value: 44.49, source: "codex", basis: "actual", note: "Pre-hedge realized NGL price." },
        oilCondensate: { value: 53.05, source: "codex", basis: "actual", note: "Pre-hedge realized oil / condensate price." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.07, source: "codex", basis: "actual", note: "Quarterly LOE / Mcfe." },
        gatheringProcessingTransportation: { value: 0.663, source: "codex", basis: "actual", note: "Combined or closest comparable G&P / transportation unit cost; explain composition in notes." },
        cashGA: { value: 0.134, source: "codex", basis: "actual", note: "Cash G&A per Mcfe when disclosed or directly calculable from sourced data." },
        totalCashUnitCosts: { value: 1.05, source: "codex", basis: "actual", note: "Company-reported total cash unit costs where available; do not force comparability if definitions differ." }
      },
      wells: {
        drilled: { value: null, source: "codex", basis: "actual", note: "Gross or net wells drilled; specify basis in notes. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        turnedInLine: { value: null, source: "codex", basis: "actual", note: "Wells placed on production / turned in line during the quarter. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Quarter-end drilled-but-uncompleted well inventory when disclosed." }
      }
    },
    "Q2 2025": {
      ticker: "EQT",
      quarter: "Q2 2025",
      revenue: { value: 2557.719, source: "codex", basis: "actual", note: "Quarterly reported revenue." },
      adjustedEbitdax: { value: 1158.465, source: "codex", basis: "actual", note: "Company-reported Adjusted EBITDA; used as the closest disclosed peer equivalent to Adjusted EBITDAX." },
      capitalExpenditures: { value: 553.559, source: "codex", basis: "actual", note: "Total quarterly capital expenditures / drilling & completion capital as reported." },
      netDebt: { value: 7810.6, source: "codex", basis: "derived", note: "Quarter-end total debt less cash and cash equivalents; uses principal debt when explicitly disclosed, otherwise reported debt carrying amount." },
      production: {
        total: { value: 6244.252747252747, source: "codex", basis: "actual", note: "Average daily total production; convert to MMcfe/d for comparability." },
        naturalGas: { value: 5872.978021978022, source: "codex", basis: "actual", note: "Average daily natural gas production." },
        ngl: { value: 58.43956043956044, source: "codex", basis: "actual", note: "Average daily NGL production." },
        oilCondensate: { value: 3.43956043956044, source: "codex", basis: "actual", note: "Average daily crude oil + condensate production where disclosed." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.9405413682, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.05615361466, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.003305017185, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 2.88, source: "codex", basis: "actual", note: "Pre-hedge realized natural gas price unless only post-hedge is disclosed; identify basis in notes." },
        ngl: { value: 35.86, source: "codex", basis: "actual", note: "Pre-hedge realized NGL price." },
        oilCondensate: { value: 51.7, source: "codex", basis: "actual", note: "Pre-hedge realized oil / condensate price." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.09, source: "codex", basis: "actual", note: "Quarterly LOE / Mcfe." },
        gatheringProcessingTransportation: { value: 0.685, source: "codex", basis: "actual", note: "Combined or closest comparable G&P / transportation unit cost; explain composition in notes." },
        cashGA: { value: 0.119, source: "codex", basis: "actual", note: "Cash G&A per Mcfe when disclosed or directly calculable from sourced data." },
        totalCashUnitCosts: { value: 1.08, source: "codex", basis: "actual", note: "Company-reported total cash unit costs where available; do not force comparability if definitions differ." }
      },
      wells: {
        drilled: { value: null, source: "codex", basis: "actual", note: "Gross or net wells drilled; specify basis in notes. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        turnedInLine: { value: null, source: "codex", basis: "actual", note: "Wells placed on production / turned in line during the quarter. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Quarter-end drilled-but-uncompleted well inventory when disclosed." }
      }
    },
    "Q3 2025": {
      ticker: "EQT",
      quarter: "Q3 2025",
      revenue: { value: 1958.571, source: "codex", basis: "actual", note: "Quarterly reported revenue." },
      adjustedEbitdax: { value: 1327.734, source: "codex", basis: "actual", note: "Company-reported Adjusted EBITDA; used as the closest disclosed peer equivalent to Adjusted EBITDAX." },
      capitalExpenditures: { value: 617.893, source: "codex", basis: "actual", note: "Total quarterly capital expenditures / drilling & completion capital as reported." },
      netDebt: { value: 8033.675, source: "codex", basis: "derived", note: "Quarter-end total debt less cash and cash equivalents; uses principal debt when explicitly disclosed, otherwise reported debt carrying amount." },
      production: {
        total: { value: 6895.597826086957, source: "codex", basis: "actual", note: "Average daily total production; convert to MMcfe/d for comparability." },
        naturalGas: { value: 6474.369565217391, source: "codex", basis: "actual", note: "Average daily natural gas production." },
        ngl: { value: 64.8695652173913, source: "codex", basis: "actual", note: "Average daily NGL production." },
        oilCondensate: { value: 5.336956521739131, source: "codex", basis: "actual", note: "Average daily crude oil + condensate production where disclosed." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.938913453, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.05644432885, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.004643794481, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 2.54, source: "codex", basis: "actual", note: "Pre-hedge realized natural gas price unless only post-hedge is disclosed; identify basis in notes." },
        ngl: { value: 31.82, source: "codex", basis: "actual", note: "Pre-hedge realized NGL price." },
        oilCondensate: { value: 49.12, source: "codex", basis: "actual", note: "Pre-hedge realized oil / condensate price." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.09, source: "codex", basis: "actual", note: "Quarterly LOE / Mcfe." },
        gatheringProcessingTransportation: { value: 0.594, source: "codex", basis: "actual", note: "Combined or closest comparable G&P / transportation unit cost; explain composition in notes." },
        cashGA: { value: 0.108, source: "codex", basis: "actual", note: "Cash G&A per Mcfe when disclosed or directly calculable from sourced data." },
        totalCashUnitCosts: { value: 1.0, source: "codex", basis: "actual", note: "Company-reported total cash unit costs where available; do not force comparability if definitions differ." }
      },
      wells: {
        drilled: { value: null, source: "codex", basis: "actual", note: "Gross or net wells drilled; specify basis in notes. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        turnedInLine: { value: null, source: "codex", basis: "actual", note: "Wells placed on production / turned in line during the quarter. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Quarter-end drilled-but-uncompleted well inventory when disclosed." }
      }
    },
    "Q4 2025": {
      ticker: "EQT",
      quarter: "Q4 2025",
      revenue: { value: 2388.071, source: "codex", basis: "actual", note: "Quarterly reported revenue." },
      adjustedEbitdax: { value: 1637.381, source: "codex", basis: "actual", note: "Company-reported Adjusted EBITDA; used as the closest disclosed peer equivalent to Adjusted EBITDAX." },
      capitalExpenditures: { value: 654.741, source: "codex", basis: "actual", note: "Total quarterly capital expenditures / drilling & completion capital as reported." },
      netDebt: { value: 7744.691, source: "codex", basis: "derived", note: "Quarter-end total debt less cash and cash equivalents; uses principal debt when explicitly disclosed, otherwise reported debt carrying amount." },
      production: {
        total: { value: 6619.5, source: "codex", basis: "actual", note: "Average daily total production; convert to MMcfe/d for comparability." },
        naturalGas: { value: 6219.902173913043, source: "codex", basis: "actual", note: "Average daily natural gas production." },
        ngl: { value: 60.24637681159783, source: "codex", basis: "actual", note: "Average daily NGL production." },
        oilCondensate: { value: 6.353260869565218, source: "codex", basis: "actual", note: "Average daily crude oil + condensate production where disclosed." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.9396332312, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.05460809138, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.005758677425, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 3.71, source: "codex", basis: "actual", note: "Pre-hedge realized natural gas price unless only post-hedge is disclosed; identify basis in notes." },
        ngl: { value: 40.9, source: "codex", basis: "actual", note: "Pre-hedge realized NGL price." },
        oilCondensate: { value: 44.98, source: "codex", basis: "actual", note: "Pre-hedge realized oil / condensate price." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.1, source: "codex", basis: "actual", note: "Quarterly LOE / Mcfe." },
        gatheringProcessingTransportation: { value: 0.637, source: "codex", basis: "actual", note: "Combined or closest comparable G&P / transportation unit cost; explain composition in notes." },
        cashGA: { value: 0.078, source: "codex", basis: "actual", note: "Cash G&A per Mcfe when disclosed or directly calculable from sourced data." },
        totalCashUnitCosts: { value: 1.1, source: "codex", basis: "actual", note: "Company-reported total cash unit costs where available; do not force comparability if definitions differ." }
      },
      wells: {
        drilled: { value: null, source: "codex", basis: "actual", note: "Gross or net wells drilled; specify basis in notes. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        turnedInLine: { value: null, source: "codex", basis: "actual", note: "Wells placed on production / turned in line during the quarter. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Quarter-end drilled-but-uncompleted well inventory when disclosed." }
      }
    },
    "Q1 2026": {
      ticker: "EQT",
      quarter: "Q1 2026",
      revenue: { value: 3378.736, source: "codex", basis: "actual", note: "Quarterly reported revenue." },
      adjustedEbitdax: { value: 2679.045, source: "codex", basis: "actual", note: "Company-reported Adjusted EBITDA; used as the closest disclosed peer equivalent to Adjusted EBITDAX." },
      capitalExpenditures: { value: 607.836, source: "codex", basis: "actual", note: "Total quarterly capital expenditures / drilling & completion capital as reported." },
      netDebt: { value: 5709.889, source: "codex", basis: "derived", note: "Quarter-end total debt less cash and cash equivalents; uses principal debt when explicitly disclosed, otherwise reported debt carrying amount." },
      production: {
        total: { value: 6863.322222222222, source: "codex", basis: "actual", note: "Average daily total production; convert to MMcfe/d for comparability." },
        naturalGas: { value: 6459.188888888889, source: "codex", basis: "actual", note: "Average daily natural gas production." },
        ngl: { value: 61.58888888888889, source: "codex", basis: "actual", note: "Average daily NGL production." },
        oilCondensate: { value: 5.755555555555556, source: "codex", basis: "actual", note: "Average daily crude oil + condensate production where disclosed." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.9411169518, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.05384175788, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.005031576868, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 5.6, source: "codex", basis: "actual", note: "Pre-hedge realized natural gas price unless only post-hedge is disclosed; identify basis in notes." },
        ngl: { value: 38.25, source: "codex", basis: "actual", note: "Pre-hedge realized NGL price." },
        oilCondensate: { value: 54.94, source: "codex", basis: "actual", note: "Pre-hedge realized oil / condensate price." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.09, source: "codex", basis: "actual", note: "Quarterly LOE / Mcfe." },
        gatheringProcessingTransportation: { value: 0.648, source: "codex", basis: "actual", note: "Combined or closest comparable G&P / transportation unit cost; explain composition in notes." },
        cashGA: { value: 0.125, source: "codex", basis: "actual", note: "Cash G&A per Mcfe when disclosed or directly calculable from sourced data." },
        totalCashUnitCosts: { value: 1.09, source: "codex", basis: "actual", note: "Company-reported total cash unit costs where available; do not force comparability if definitions differ." }
      },
      wells: {
        drilled: { value: null, source: "codex", basis: "actual", note: "Gross or net wells drilled; specify basis in notes. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        turnedInLine: { value: null, source: "codex", basis: "actual", note: "Wells placed on production / turned in line during the quarter. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Quarter-end drilled-but-uncompleted well inventory when disclosed." }
      }
    },
  },
  EXE: {
    "Q1 2024": {
      ticker: "EXE",
      quarter: "Q1 2024",
      revenue: { value: 1081.0, source: "codex", basis: "actual", note: "Quarterly reported revenue." },
      adjustedEbitdax: { value: 508.0, source: "codex", basis: "actual", note: "Company-reported adjusted EBITDA/EBITDAX; standalone quarterly values in $MM." },
      capitalExpenditures: { value: 354.0, source: "codex", basis: "actual", note: "Total quarterly capital expenditures / drilling & completion capital as reported." },
      netDebt: { value: 771.0, source: "codex", basis: "derived", note: "Quarter-end face-value principal debt less cash and cash equivalents; excludes debt discounts, premiums and issuance-cost carrying-value adjustments." },
      production: {
        total: { value: 3198.0, source: "codex", basis: "actual", note: "Average daily total production; convert to MMcfe/d for comparability." },
        naturalGas: { value: 3198.0, source: "codex", basis: "actual", note: "Average daily natural gas production." },
        ngl: { value: 0.0, source: "codex", basis: "actual", note: "Average daily NGL production." },
        oilCondensate: { value: 0.0, source: "codex", basis: "actual", note: "Average daily crude oil + condensate production where disclosed." }
      },
      commodityMix: {
        naturalGasPct: { value: 1, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 2.03, source: "codex", basis: "actual", note: "Pre-hedge realized natural gas price unless only post-hedge is disclosed; identify basis in notes." },
        ngl: { value: null, source: "codex", basis: "actual", note: "Pre-hedge realized NGL price." },
        oilCondensate: { value: null, source: "codex", basis: "actual", note: "Pre-hedge realized oil / condensate price." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.2, source: "codex", basis: "actual", note: "Quarterly LOE / Mcfe." },
        gatheringProcessingTransportation: { value: 0.59, source: "codex", basis: "actual", note: "Combined or closest comparable G&P / transportation unit cost; explain composition in notes." },
        cashGA: { value: 0.131, source: "codex", basis: "actual", note: "Cash G&A per Mcfe when disclosed or directly calculable from sourced data." },
        totalCashUnitCosts: { value: 0.95, source: "codex", basis: "actual", note: "Company-reported total cash unit costs where available; do not force comparability if definitions differ." }
      },
      wells: {
        drilled: { value: 28.0, source: "codex", basis: "actual", note: "Gross or net wells drilled; specify basis in notes. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        turnedInLine: { value: 29.0, source: "codex", basis: "actual", note: "Wells placed on production / turned in line during the quarter. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        ducInventory: { value: 24.0, source: "codex", basis: "actual", note: "Quarter-end drilled-but-uncompleted well inventory when disclosed." }
      }
    },
    "Q2 2024": {
      ticker: "EXE",
      quarter: "Q2 2024",
      revenue: { value: 505.0, source: "codex", basis: "actual", note: "Quarterly reported revenue." },
      adjustedEbitdax: { value: 358.0, source: "codex", basis: "actual", note: "Company-reported adjusted EBITDA/EBITDAX; standalone quarterly values in $MM." },
      capitalExpenditures: { value: 293.0, source: "codex", basis: "actual", note: "Total quarterly capital expenditures / drilling & completion capital as reported." },
      netDebt: { value: 931.0, source: "codex", basis: "derived", note: "Quarter-end face-value principal debt less cash and cash equivalents; excludes debt discounts, premiums and issuance-cost carrying-value adjustments." },
      production: {
        total: { value: 2745.0, source: "codex", basis: "actual", note: "Average daily total production; convert to MMcfe/d for comparability." },
        naturalGas: { value: 2745.0, source: "codex", basis: "actual", note: "Average daily natural gas production." },
        ngl: { value: 0.0, source: "codex", basis: "actual", note: "Average daily NGL production." },
        oilCondensate: { value: 0.0, source: "codex", basis: "actual", note: "Average daily crude oil + condensate production where disclosed." }
      },
      commodityMix: {
        naturalGasPct: { value: 1, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 1.51, source: "codex", basis: "actual", note: "Pre-hedge realized natural gas price unless only post-hedge is disclosed; identify basis in notes." },
        ngl: { value: null, source: "codex", basis: "actual", note: "Pre-hedge realized NGL price." },
        oilCondensate: { value: null, source: "codex", basis: "actual", note: "Pre-hedge realized oil / condensate price." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.2, source: "codex", basis: "actual", note: "Quarterly LOE / Mcfe." },
        gatheringProcessingTransportation: { value: 0.62, source: "codex", basis: "actual", note: "Combined or closest comparable G&P / transportation unit cost; explain composition in notes." },
        cashGA: { value: 0.148, source: "codex", basis: "actual", note: "Cash G&A per Mcfe when disclosed or directly calculable from sourced data." },
        totalCashUnitCosts: { value: 1.08, source: "codex", basis: "actual", note: "Company-reported total cash unit costs where available; do not force comparability if definitions differ." }
      },
      wells: {
        drilled: { value: 30.0, source: "codex", basis: "actual", note: "Gross or net wells drilled; specify basis in notes. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        turnedInLine: { value: 4.0, source: "codex", basis: "actual", note: "Wells placed on production / turned in line during the quarter. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        ducInventory: { value: 29.0, source: "codex", basis: "actual", note: "Quarter-end drilled-but-uncompleted well inventory when disclosed." }
      }
    },
    "Q3 2024": {
      ticker: "EXE",
      quarter: "Q3 2024",
      revenue: { value: 648.0, source: "codex", basis: "actual", note: "Quarterly reported revenue." },
      adjustedEbitdax: { value: 365.0, source: "codex", basis: "actual", note: "Company-reported adjusted EBITDA/EBITDAX; standalone quarterly values in $MM." },
      capitalExpenditures: { value: 289.0, source: "codex", basis: "actual", note: "Total quarterly capital expenditures / drilling & completion capital as reported." },
      netDebt: { value: 906.0, source: "codex", basis: "derived", note: "Quarter-end face-value principal debt less cash and cash equivalents; excludes debt discounts, premiums and issuance-cost carrying-value adjustments." },
      production: {
        total: { value: 2647.0, source: "codex", basis: "actual", note: "Average daily total production; convert to MMcfe/d for comparability." },
        naturalGas: { value: 2647.0, source: "codex", basis: "actual", note: "Average daily natural gas production." },
        ngl: { value: 0.0, source: "codex", basis: "actual", note: "Average daily NGL production." },
        oilCondensate: { value: 0.0, source: "codex", basis: "actual", note: "Average daily crude oil + condensate production where disclosed." }
      },
      commodityMix: {
        naturalGasPct: { value: 1, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 1.67, source: "codex", basis: "actual", note: "Pre-hedge realized natural gas price unless only post-hedge is disclosed; identify basis in notes." },
        ngl: { value: null, source: "codex", basis: "actual", note: "Pre-hedge realized NGL price." },
        oilCondensate: { value: null, source: "codex", basis: "actual", note: "Pre-hedge realized oil / condensate price." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.21, source: "codex", basis: "actual", note: "Quarterly LOE / Mcfe." },
        gatheringProcessingTransportation: { value: 0.62, source: "codex", basis: "actual", note: "Combined or closest comparable G&P / transportation unit cost; explain composition in notes." },
        cashGA: { value: 0.119, source: "codex", basis: "actual", note: "Cash G&A per Mcfe when disclosed or directly calculable from sourced data." },
        totalCashUnitCosts: { value: 1.03, source: "codex", basis: "actual", note: "Company-reported total cash unit costs where available; do not force comparability if definitions differ." }
      },
      wells: {
        drilled: { value: 30.0, source: "codex", basis: "actual", note: "Gross or net wells drilled; specify basis in notes. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        turnedInLine: { value: 7.0, source: "codex", basis: "actual", note: "Wells placed on production / turned in line during the quarter. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        ducInventory: { value: 18.0, source: "codex", basis: "actual", note: "Quarter-end drilled-but-uncompleted well inventory when disclosed." }
      }
    },
    "Q4 2024": {
      ticker: "EXE",
      quarter: "Q4 2024",
      revenue: { value: 2001.0, source: "codex", basis: "actual", note: "Quarterly reported revenue." },
      adjustedEbitdax: { value: 964.0, source: "codex", basis: "actual", note: "Company-reported adjusted EBITDA/EBITDAX; standalone quarterly values in $MM." },
      capitalExpenditures: { value: 593.0, source: "codex", basis: "actual", note: "Total quarterly capital expenditures / drilling & completion capital as reported." },
      netDebt: { value: 5369.0, source: "codex", basis: "derived", note: "Quarter-end face-value principal debt less cash and cash equivalents; excludes debt discounts, premiums and issuance-cost carrying-value adjustments." },
      production: {
        total: { value: 6412.0, source: "codex", basis: "actual", note: "Average daily total production; convert to MMcfe/d for comparability." },
        naturalGas: { value: 5830.0, source: "codex", basis: "actual", note: "Average daily natural gas production." },
        ngl: { value: 85.0, source: "codex", basis: "actual", note: "Average daily NGL production." },
        oilCondensate: { value: 12.0, source: "codex", basis: "actual", note: "Average daily crude oil + condensate production where disclosed." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.9092326887, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.07953836556, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.01122894573, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 2.91, source: "codex", basis: "actual", note: "Pre-hedge realized natural gas price unless only post-hedge is disclosed; identify basis in notes." },
        ngl: { value: 26.9, source: "codex", basis: "actual", note: "Pre-hedge realized NGL price." },
        oilCondensate: { value: 61.28, source: "codex", basis: "actual", note: "Pre-hedge realized oil / condensate price." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.27, source: "codex", basis: "actual", note: "Quarterly LOE / Mcfe." },
        gatheringProcessingTransportation: { value: 0.94, source: "codex", basis: "actual", note: "Combined or closest comparable G&P / transportation unit cost; explain composition in notes." },
        cashGA: { value: 0.075, source: "codex", basis: "actual", note: "Cash G&A per Mcfe when disclosed or directly calculable from sourced data." },
        totalCashUnitCosts: { value: null, source: "codex", basis: "actual", note: "Company-reported total cash unit costs where available; do not force comparability if definitions differ." }
      },
      wells: {
        drilled: { value: 44.0, source: "codex", basis: "actual", note: "Gross or net wells drilled; specify basis in notes. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        turnedInLine: { value: 41.0, source: "codex", basis: "actual", note: "Wells placed on production / turned in line during the quarter. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        ducInventory: { value: 55.0, source: "codex", basis: "actual", note: "Quarter-end drilled-but-uncompleted well inventory when disclosed." }
      }
    },
    "Q1 2025": {
      ticker: "EXE",
      quarter: "Q1 2025",
      revenue: { value: 2196.0, source: "codex", basis: "actual", note: "Quarterly reported revenue." },
      adjustedEbitdax: { value: 1395.0, source: "codex", basis: "actual", note: "Company-reported adjusted EBITDA/EBITDAX; standalone quarterly values in $MM." },
      capitalExpenditures: { value: 662.0, source: "codex", basis: "actual", note: "Total quarterly capital expenditures / drilling & completion capital as reported." },
      netDebt: { value: 4901.0, source: "codex", basis: "derived", note: "Quarter-end face-value principal debt less cash and cash equivalents; excludes debt discounts, premiums and issuance-cost carrying-value adjustments." },
      production: {
        total: { value: 6788.0, source: "codex", basis: "actual", note: "Average daily total production; convert to MMcfe/d for comparability." },
        naturalGas: { value: 6254.0, source: "codex", basis: "actual", note: "Average daily natural gas production." },
        ngl: { value: 75.0, source: "codex", basis: "actual", note: "Average daily NGL production." },
        oilCondensate: { value: 14.0, source: "codex", basis: "actual", note: "Average daily crude oil + condensate production where disclosed." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.9213317619, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.06629345905, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.01237477902, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 3.58, source: "codex", basis: "actual", note: "Pre-hedge realized natural gas price unless only post-hedge is disclosed; identify basis in notes." },
        ngl: { value: 30.54, source: "codex", basis: "actual", note: "Pre-hedge realized NGL price." },
        oilCondensate: { value: 63.4, source: "codex", basis: "actual", note: "Pre-hedge realized oil / condensate price." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.24, source: "codex", basis: "actual", note: "Quarterly LOE / Mcfe." },
        gatheringProcessingTransportation: { value: 0.92, source: "codex", basis: "actual", note: "Combined or closest comparable G&P / transportation unit cost; explain composition in notes." },
        cashGA: { value: 0.062, source: "codex", basis: "actual", note: "Cash G&A per Mcfe when disclosed or directly calculable from sourced data." },
        totalCashUnitCosts: { value: 1.33, source: "codex", basis: "actual", note: "Company-reported total cash unit costs where available; do not force comparability if definitions differ." }
      },
      wells: {
        drilled: { value: 46.0, source: "codex", basis: "actual", note: "Gross or net wells drilled; specify basis in notes. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        turnedInLine: { value: 89.0, source: "codex", basis: "actual", note: "Wells placed on production / turned in line during the quarter. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Quarter-end drilled-but-uncompleted well inventory when disclosed." }
      }
    },
    "Q2 2025": {
      ticker: "EXE",
      quarter: "Q2 2025",
      revenue: { value: 3690.0, source: "codex", basis: "actual", note: "Quarterly reported revenue." },
      adjustedEbitdax: { value: 1176.0, source: "codex", basis: "actual", note: "Company-reported adjusted EBITDA/EBITDAX; standalone quarterly values in $MM." },
      capitalExpenditures: { value: 727.0, source: "codex", basis: "actual", note: "Total quarterly capital expenditures / drilling & completion capital as reported." },
      netDebt: { value: 4404.0, source: "codex", basis: "derived", note: "Quarter-end face-value principal debt less cash and cash equivalents; excludes debt discounts, premiums and issuance-cost carrying-value adjustments." },
      production: {
        total: { value: 7202.0, source: "codex", basis: "actual", note: "Average daily total production; convert to MMcfe/d for comparability." },
        naturalGas: { value: 6596.0, source: "codex", basis: "actual", note: "Average daily natural gas production." },
        ngl: { value: 83.0, source: "codex", basis: "actual", note: "Average daily NGL production." },
        oilCondensate: { value: 18.0, source: "codex", basis: "actual", note: "Average daily crude oil + condensate production where disclosed." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.9158567065, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.06914745904, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.01499583449, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 2.93, source: "codex", basis: "actual", note: "Pre-hedge realized natural gas price unless only post-hedge is disclosed; identify basis in notes." },
        ngl: { value: 23.19, source: "codex", basis: "actual", note: "Pre-hedge realized NGL price." },
        oilCondensate: { value: 54.47, source: "codex", basis: "actual", note: "Pre-hedge realized oil / condensate price." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.23, source: "codex", basis: "actual", note: "Quarterly LOE / Mcfe." },
        gatheringProcessingTransportation: { value: 0.86, source: "codex", basis: "actual", note: "Combined or closest comparable G&P / transportation unit cost; explain composition in notes." },
        cashGA: { value: 0.041, source: "codex", basis: "actual", note: "Cash G&A per Mcfe when disclosed or directly calculable from sourced data." },
        totalCashUnitCosts: { value: 1.34, source: "codex", basis: "actual", note: "Company-reported total cash unit costs where available; do not force comparability if definitions differ." }
      },
      wells: {
        drilled: { value: 49.0, source: "codex", basis: "actual", note: "Gross or net wells drilled; specify basis in notes. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        turnedInLine: { value: 59.0, source: "codex", basis: "actual", note: "Wells placed on production / turned in line during the quarter. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Quarter-end drilled-but-uncompleted well inventory when disclosed." }
      }
    },
    "Q3 2025": {
      ticker: "EXE",
      quarter: "Q3 2025",
      revenue: { value: 2966.0, source: "codex", basis: "actual", note: "Quarterly reported revenue." },
      adjustedEbitdax: { value: 1082.0, source: "codex", basis: "actual", note: "Company-reported adjusted EBITDA/EBITDAX; standalone quarterly values in $MM." },
      capitalExpenditures: { value: 735.0, source: "codex", basis: "actual", note: "Total quarterly capital expenditures / drilling & completion capital as reported." },
      netDebt: { value: 4412.0, source: "codex", basis: "derived", note: "Quarter-end face-value principal debt less cash and cash equivalents; excludes debt discounts, premiums and issuance-cost carrying-value adjustments." },
      production: {
        total: { value: 7333.0, source: "codex", basis: "actual", note: "Average daily total production; convert to MMcfe/d for comparability." },
        naturalGas: { value: 6721.0, source: "codex", basis: "actual", note: "Average daily natural gas production." },
        ngl: { value: 85.0, source: "codex", basis: "actual", note: "Average daily NGL production." },
        oilCondensate: { value: 17.0, source: "codex", basis: "actual", note: "Average daily crude oil + condensate production where disclosed." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.916541661, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.06954861585, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.01390972317, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 2.58, source: "codex", basis: "actual", note: "Pre-hedge realized natural gas price unless only post-hedge is disclosed; identify basis in notes." },
        ngl: { value: 21.4, source: "codex", basis: "actual", note: "Pre-hedge realized NGL price." },
        oilCondensate: { value: 53.5, source: "codex", basis: "actual", note: "Pre-hedge realized oil / condensate price." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.25, source: "codex", basis: "actual", note: "Quarterly LOE / Mcfe." },
        gatheringProcessingTransportation: { value: 0.9, source: "codex", basis: "actual", note: "Combined or closest comparable G&P / transportation unit cost; explain composition in notes." },
        cashGA: { value: 0.049, source: "codex", basis: "actual", note: "Cash G&A per Mcfe when disclosed or directly calculable from sourced data." },
        totalCashUnitCosts: { value: 1.31, source: "codex", basis: "actual", note: "Company-reported total cash unit costs where available; do not force comparability if definitions differ." }
      },
      wells: {
        drilled: { value: 41.0, source: "codex", basis: "actual", note: "Gross or net wells drilled; specify basis in notes. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        turnedInLine: { value: 57.0, source: "codex", basis: "actual", note: "Wells placed on production / turned in line during the quarter. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Quarter-end drilled-but-uncompleted well inventory when disclosed." }
      }
    },
    "Q4 2025": {
      ticker: "EXE",
      quarter: "Q4 2025",
      revenue: { value: 3272.0, source: "codex", basis: "actual", note: "Quarterly reported revenue." },
      adjustedEbitdax: { value: 1425.0, source: "codex", basis: "actual", note: "Company-reported adjusted EBITDA/EBITDAX; standalone quarterly values in $MM." },
      capitalExpenditures: { value: 728.0, source: "codex", basis: "actual", note: "Total quarterly capital expenditures / drilling & completion capital as reported." },
      netDebt: { value: 4409.0, source: "codex", basis: "derived", note: "Quarter-end face-value principal debt less cash and cash equivalents; excludes debt discounts, premiums and issuance-cost carrying-value adjustments." },
      production: {
        total: { value: 7400.0, source: "codex", basis: "actual", note: "Average daily total production; convert to MMcfe/d for comparability." },
        naturalGas: { value: 6824.0, source: "codex", basis: "actual", note: "Average daily natural gas production." },
        ngl: { value: 80.0, source: "codex", basis: "actual", note: "Average daily NGL production." },
        oilCondensate: { value: 16.0, source: "codex", basis: "actual", note: "Average daily crude oil + condensate production where disclosed." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.9221621622, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.06486486486, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.01297297297, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 3.37, source: "codex", basis: "actual", note: "Pre-hedge realized natural gas price unless only post-hedge is disclosed; identify basis in notes." },
        ngl: { value: 23.41, source: "codex", basis: "actual", note: "Pre-hedge realized NGL price." },
        oilCondensate: { value: 49.41, source: "codex", basis: "actual", note: "Pre-hedge realized oil / condensate price." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.3, source: "codex", basis: "actual", note: "Quarterly LOE / Mcfe." },
        gatheringProcessingTransportation: { value: 0.9, source: "codex", basis: "actual", note: "Combined or closest comparable G&P / transportation unit cost; explain composition in notes." },
        cashGA: { value: 0.054, source: "codex", basis: "actual", note: "Cash G&A per Mcfe when disclosed or directly calculable from sourced data." },
        totalCashUnitCosts: { value: 1.38, source: "codex", basis: "actual", note: "Company-reported total cash unit costs where available; do not force comparability if definitions differ." }
      },
      wells: {
        drilled: { value: 51.0, source: "codex", basis: "actual", note: "Gross or net wells drilled; specify basis in notes. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        turnedInLine: { value: 66.0, source: "codex", basis: "actual", note: "Wells placed on production / turned in line during the quarter. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Quarter-end drilled-but-uncompleted well inventory when disclosed." }
      }
    },
    "Q1 2026": {
      ticker: "EXE",
      quarter: "Q1 2026",
      revenue: { value: 4397.0, source: "codex", basis: "actual", note: "Quarterly reported revenue." },
      adjustedEbitdax: { value: 1968.0, source: "codex", basis: "actual", note: "Company-reported adjusted EBITDA/EBITDAX; standalone quarterly values in $MM." },
      capitalExpenditures: { value: 716.0, source: "codex", basis: "actual", note: "Total quarterly capital expenditures / drilling & completion capital as reported." },
      netDebt: { value: 2805.0, source: "codex", basis: "derived", note: "Quarter-end face-value principal debt less cash and cash equivalents; excludes debt discounts, premiums and issuance-cost carrying-value adjustments." },
      production: {
        total: { value: 7436.0, source: "codex", basis: "actual", note: "Average daily total production; convert to MMcfe/d for comparability." },
        naturalGas: { value: 6914.0, source: "codex", basis: "actual", note: "Average daily natural gas production." },
        ngl: { value: 72.0, source: "codex", basis: "actual", note: "Average daily NGL production." },
        oilCondensate: { value: 15.0, source: "codex", basis: "actual", note: "Average daily crude oil + condensate production where disclosed." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.9298009683, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.0580957504, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.01210328133, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 4.92, source: "codex", basis: "actual", note: "Pre-hedge realized natural gas price unless only post-hedge is disclosed; identify basis in notes." },
        ngl: { value: 25.49, source: "codex", basis: "actual", note: "Pre-hedge realized NGL price." },
        oilCondensate: { value: 64.37, source: "codex", basis: "actual", note: "Pre-hedge realized oil / condensate price." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.28, source: "codex", basis: "actual", note: "Quarterly LOE / Mcfe." },
        gatheringProcessingTransportation: { value: 1.03, source: "codex", basis: "actual", note: "Combined or closest comparable G&P / transportation unit cost; explain composition in notes." },
        cashGA: { value: 0.079, source: "codex", basis: "actual", note: "Cash G&A per Mcfe when disclosed or directly calculable from sourced data." },
        totalCashUnitCosts: { value: 1.53, source: "codex", basis: "actual", note: "Company-reported total cash unit costs where available; do not force comparability if definitions differ." }
      },
      wells: {
        drilled: { value: 60.0, source: "codex", basis: "actual", note: "Gross or net wells drilled; specify basis in notes. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        turnedInLine: { value: 49.0, source: "codex", basis: "actual", note: "Wells placed on production / turned in line during the quarter. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Quarter-end drilled-but-uncompleted well inventory when disclosed." }
      }
    },
  },
  GPOR: {
    "Q1 2024": {
      ticker: "GPOR",
      quarter: "Q1 2024",
      revenue: { value: 283.229, source: "codex", basis: "actual", note: "Quarterly reported revenue." },
      adjustedEbitdax: { value: 185.7, source: "codex", basis: "actual", note: "Company-reported adjusted EBITDA/EBITDAX; standalone quarterly values in $MM." },
      capitalExpenditures: { value: 124.4, source: "codex", basis: "actual", note: "Total quarterly capital expenditures / drilling & completion capital as reported." },
      netDebt: { value: 628.791, source: "codex", basis: "derived", note: "Quarter-end face-value principal debt less cash and cash equivalents; excludes unamortized debt issuance costs." },
      production: {
        total: { value: 1054.0, source: "codex", basis: "actual", note: "Average daily total production; convert to MMcfe/d for comparability." },
        naturalGas: { value: 974.0, source: "codex", basis: "actual", note: "Average daily natural gas production." },
        ngl: { value: 10.03296703296703, source: "codex", basis: "actual", note: "Average daily NGL production." },
        oilCondensate: { value: 3.32967032967033, source: "codex", basis: "actual", note: "Average daily crude oil + condensate production where disclosed." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.9240986717, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.05711366432, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.01895448006, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 2.13, source: "codex", basis: "actual", note: "Pre-hedge realized natural gas price unless only post-hedge is disclosed; identify basis in notes." },
        ngl: { value: 30.79, source: "codex", basis: "actual", note: "Pre-hedge realized NGL price." },
        oilCondensate: { value: 71.64, source: "codex", basis: "actual", note: "Pre-hedge realized oil / condensate price." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.18, source: "codex", basis: "actual", note: "Quarterly LOE / Mcfe." },
        gatheringProcessingTransportation: { value: 0.9, source: "codex", basis: "actual", note: "Combined or closest comparable G&P / transportation unit cost; explain composition in notes." },
        cashGA: { value: 0.11, source: "codex", basis: "actual", note: "Cash G&A per Mcfe when disclosed or directly calculable from sourced data." },
        totalCashUnitCosts: { value: 1.26, source: "codex", basis: "actual", note: "Company-reported total cash unit costs where available; do not force comparability if definitions differ." }
      },
      wells: {
        drilled: { value: 3.0, source: "codex", basis: "actual", note: "Gross or net wells drilled; specify basis in notes. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        turnedInLine: { value: 5.0, source: "codex", basis: "actual", note: "Wells placed on production / turned in line during the quarter. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Quarter-end drilled-but-uncompleted well inventory when disclosed." }
      }
    },
    "Q2 2024": {
      ticker: "GPOR",
      quarter: "Q2 2024",
      revenue: { value: 181.117, source: "codex", basis: "actual", note: "Quarterly reported revenue." },
      adjustedEbitdax: { value: 164.4, source: "codex", basis: "actual", note: "Company-reported adjusted EBITDA/EBITDAX; standalone quarterly values in $MM." },
      capitalExpenditures: { value: 122.2, source: "codex", basis: "actual", note: "Total quarterly capital expenditures / drilling & completion capital as reported." },
      netDebt: { value: 678.767, source: "codex", basis: "derived", note: "Quarter-end face-value principal debt less cash and cash equivalents; excludes unamortized debt issuance costs." },
      production: {
        total: { value: 1050.0, source: "codex", basis: "actual", note: "Average daily total production; convert to MMcfe/d for comparability." },
        naturalGas: { value: 972.0, source: "codex", basis: "actual", note: "Average daily natural gas production." },
        ngl: { value: 10.1978021978022, source: "codex", basis: "actual", note: "Average daily NGL production." },
        oilCondensate: { value: 2.747252747252747, source: "codex", basis: "actual", note: "Average daily crude oil + condensate production where disclosed." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.9257142857, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.05827315542, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.01569858713, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 1.63, source: "codex", basis: "actual", note: "Pre-hedge realized natural gas price unless only post-hedge is disclosed; identify basis in notes." },
        ngl: { value: 28.18, source: "codex", basis: "actual", note: "Pre-hedge realized NGL price." },
        oilCondensate: { value: 76.51, source: "codex", basis: "actual", note: "Pre-hedge realized oil / condensate price." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.17, source: "codex", basis: "actual", note: "Quarterly LOE / Mcfe." },
        gatheringProcessingTransportation: { value: 0.91, source: "codex", basis: "actual", note: "Combined or closest comparable G&P / transportation unit cost; explain composition in notes." },
        cashGA: { value: 0.12, source: "codex", basis: "actual", note: "Cash G&A per Mcfe when disclosed or directly calculable from sourced data." },
        totalCashUnitCosts: { value: 1.26, source: "codex", basis: "actual", note: "Company-reported total cash unit costs where available; do not force comparability if definitions differ." }
      },
      wells: {
        drilled: { value: null, source: "codex", basis: "actual", note: "Gross or net wells drilled; specify basis in notes. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        turnedInLine: { value: 4.0, source: "codex", basis: "actual", note: "Wells placed on production / turned in line during the quarter. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Quarter-end drilled-but-uncompleted well inventory when disclosed." }
      }
    },
    "Q3 2024": {
      ticker: "GPOR",
      quarter: "Q3 2024",
      revenue: { value: 253.912, source: "codex", basis: "actual", note: "Quarterly reported revenue." },
      adjustedEbitdax: { value: 178.1, source: "codex", basis: "actual", note: "Company-reported adjusted EBITDA/EBITDAX; standalone quarterly values in $MM." },
      capitalExpenditures: { value: 82.5, source: "codex", basis: "actual", note: "Total quarterly capital expenditures / drilling & completion capital as reported." },
      netDebt: { value: 702.482, source: "codex", basis: "derived", note: "Quarter-end face-value principal debt less cash and cash equivalents; excludes unamortized debt issuance costs." },
      production: {
        total: { value: 1057.0, source: "codex", basis: "actual", note: "Average daily total production; convert to MMcfe/d for comparability." },
        naturalGas: { value: 967.0, source: "codex", basis: "actual", note: "Average daily natural gas production." },
        ngl: { value: 10.48913043478261, source: "codex", basis: "actual", note: "Average daily NGL production." },
        oilCondensate: { value: 4.619565217391305, source: "codex", basis: "actual", note: "Average daily crude oil + condensate production where disclosed." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.9148533586, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.05954094854, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.02622269754, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 1.8, source: "codex", basis: "actual", note: "Pre-hedge realized natural gas price unless only post-hedge is disclosed; identify basis in notes." },
        ngl: { value: 27.58, source: "codex", basis: "actual", note: "Pre-hedge realized NGL price." },
        oilCondensate: { value: 69.35, source: "codex", basis: "actual", note: "Pre-hedge realized oil / condensate price." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.19, source: "codex", basis: "actual", note: "Quarterly LOE / Mcfe." },
        gatheringProcessingTransportation: { value: 0.92, source: "codex", basis: "actual", note: "Combined or closest comparable G&P / transportation unit cost; explain composition in notes." },
        cashGA: { value: 0.08, source: "codex", basis: "actual", note: "Cash G&A per Mcfe when disclosed or directly calculable from sourced data." },
        totalCashUnitCosts: { value: 1.29, source: "codex", basis: "actual", note: "Company-reported total cash unit costs where available; do not force comparability if definitions differ." }
      },
      wells: {
        drilled: { value: 5.0, source: "codex", basis: "actual", note: "Gross or net wells drilled; specify basis in notes. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        turnedInLine: { value: 10.0, source: "codex", basis: "actual", note: "Wells placed on production / turned in line during the quarter. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Quarter-end drilled-but-uncompleted well inventory when disclosed." }
      }
    },
    "Q4 2024": {
      ticker: "GPOR",
      quarter: "Q4 2024",
      revenue: { value: 239.873, source: "codex", basis: "actual", note: "Quarterly reported revenue." },
      adjustedEbitdax: { value: 202.8, source: "codex", basis: "actual", note: "Company-reported adjusted EBITDA/EBITDAX; standalone quarterly values in $MM." },
      capitalExpenditures: { value: 56.3, source: "codex", basis: "actual", note: "Total quarterly capital expenditures / drilling & completion capital as reported." },
      netDebt: { value: 712.229, source: "codex", basis: "derived", note: "Quarter-end face-value principal debt less cash and cash equivalents; excludes unamortized debt issuance costs." },
      production: {
        total: { value: 1055.472, source: "codex", basis: "actual", note: "Average daily total production; convert to MMcfe/d for comparability." },
        naturalGas: { value: 958.075, source: "codex", basis: "actual", note: "Average daily natural gas production." },
        ngl: { value: 11.004, source: "codex", basis: "actual", note: "Average daily NGL production." },
        oilCondensate: { value: 5.229, source: "codex", basis: "actual", note: "Average daily crude oil + condensate production where disclosed." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.9077218534, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.06255400427, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.02972508982, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 2.99, source: "codex", basis: "actual", note: "Pre-hedge realized natural gas price unless only post-hedge is disclosed; identify basis in notes." },
        ngl: { value: 30.98, source: "codex", basis: "actual", note: "Pre-hedge realized NGL price." },
        oilCondensate: { value: 65.75, source: "codex", basis: "actual", note: "Pre-hedge realized oil / condensate price." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.2, source: "codex", basis: "actual", note: "Quarterly LOE / Mcfe." },
        gatheringProcessingTransportation: { value: 0.91, source: "codex", basis: "actual", note: "Combined or closest comparable G&P / transportation unit cost; explain composition in notes." },
        cashGA: { value: 0.1, source: "codex", basis: "actual", note: "Cash G&A per Mcfe when disclosed or directly calculable from sourced data." },
        totalCashUnitCosts: { value: 1.34, source: "codex", basis: "actual", note: "Company-reported total cash unit costs where available; do not force comparability if definitions differ." }
      },
      wells: {
        drilled: { value: null, source: "codex", basis: "actual", note: "Gross or net wells drilled; specify basis in notes. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        turnedInLine: { value: null, source: "codex", basis: "actual", note: "Wells placed on production / turned in line during the quarter. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Quarter-end drilled-but-uncompleted well inventory when disclosed." }
      }
    },
    "Q1 2025": {
      ticker: "GPOR",
      quarter: "Q1 2025",
      revenue: { value: 197.034, source: "codex", basis: "actual", note: "Quarterly reported revenue." },
      adjustedEbitdax: { value: 218.3, source: "codex", basis: "actual", note: "Company-reported adjusted EBITDA/EBITDAX; standalone quarterly values in $MM." },
      capitalExpenditures: { value: 159.8, source: "codex", basis: "actual", note: "Total quarterly capital expenditures / drilling & completion capital as reported." },
      netDebt: { value: 705.36, source: "codex", basis: "derived", note: "Quarter-end face-value principal debt less cash and cash equivalents; excludes unamortized debt issuance costs." },
      production: {
        total: { value: 929.0, source: "codex", basis: "actual", note: "Average daily total production; convert to MMcfe/d for comparability." },
        naturalGas: { value: 838.0, source: "codex", basis: "actual", note: "Average daily natural gas production." },
        ngl: { value: 9.966666666666667, source: "codex", basis: "actual", note: "Average daily NGL production." },
        oilCondensate: { value: 5.277777777777778, source: "codex", basis: "actual", note: "Average daily crude oil + condensate production where disclosed." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.9020452099, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.06437029064, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.03408683172, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 3.73, source: "codex", basis: "actual", note: "Pre-hedge realized natural gas price unless only post-hedge is disclosed; identify basis in notes." },
        ngl: { value: 34.37, source: "codex", basis: "actual", note: "Pre-hedge realized NGL price." },
        oilCondensate: { value: 65.76, source: "codex", basis: "actual", note: "Pre-hedge realized oil / condensate price." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.24, source: "codex", basis: "actual", note: "Quarterly LOE / Mcfe." },
        gatheringProcessingTransportation: { value: 0.99, source: "codex", basis: "actual", note: "Combined or closest comparable G&P / transportation unit cost; explain composition in notes." },
        cashGA: { value: 0.07, source: "codex", basis: "actual", note: "Cash G&A per Mcfe when disclosed or directly calculable from sourced data." },
        totalCashUnitCosts: { value: 1.43, source: "codex", basis: "actual", note: "Company-reported total cash unit costs where available; do not force comparability if definitions differ." }
      },
      wells: {
        drilled: { value: null, source: "codex", basis: "actual", note: "Gross or net wells drilled; specify basis in notes. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        turnedInLine: { value: 7.0, source: "codex", basis: "actual", note: "Wells placed on production / turned in line during the quarter. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Quarter-end drilled-but-uncompleted well inventory when disclosed." }
      }
    },
    "Q2 2025": {
      ticker: "GPOR",
      quarter: "Q2 2025",
      revenue: { value: 447.616, source: "codex", basis: "actual", note: "Quarterly reported revenue." },
      adjustedEbitdax: { value: 212.3, source: "codex", basis: "actual", note: "Company-reported adjusted EBITDA/EBITDAX; standalone quarterly values in $MM." },
      capitalExpenditures: { value: 124.2, source: "codex", basis: "actual", note: "Total quarterly capital expenditures / drilling & completion capital as reported." },
      netDebt: { value: 701.206, source: "codex", basis: "derived", note: "Quarter-end face-value principal debt less cash and cash equivalents; excludes unamortized debt issuance costs." },
      production: {
        total: { value: 1006.0, source: "codex", basis: "actual", note: "Average daily total production; convert to MMcfe/d for comparability." },
        naturalGas: { value: 891.0, source: "codex", basis: "actual", note: "Average daily natural gas production." },
        ngl: { value: 11.31868131868132, source: "codex", basis: "actual", note: "Average daily NGL production." },
        oilCondensate: { value: 7.846153846153846, source: "codex", basis: "actual", note: "Average daily crude oil + condensate production where disclosed." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.8856858847, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.06750704564, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.0467961462, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 2.97, source: "codex", basis: "actual", note: "Pre-hedge realized natural gas price unless only post-hedge is disclosed; identify basis in notes." },
        ngl: { value: 27.91, source: "codex", basis: "actual", note: "Pre-hedge realized NGL price." },
        oilCondensate: { value: 58.2, source: "codex", basis: "actual", note: "Pre-hedge realized oil / condensate price." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.19, source: "codex", basis: "actual", note: "Quarterly LOE / Mcfe." },
        gatheringProcessingTransportation: { value: 0.94, source: "codex", basis: "actual", note: "Combined or closest comparable G&P / transportation unit cost; explain composition in notes." },
        cashGA: { value: 0.08, source: "codex", basis: "actual", note: "Cash G&A per Mcfe when disclosed or directly calculable from sourced data." },
        totalCashUnitCosts: { value: 1.34, source: "codex", basis: "actual", note: "Company-reported total cash unit costs where available; do not force comparability if definitions differ." }
      },
      wells: {
        drilled: { value: 19.0, source: "codex", basis: "actual", note: "Gross or net wells drilled; specify basis in notes. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        turnedInLine: { value: 14.0, source: "codex", basis: "actual", note: "Wells placed on production / turned in line during the quarter. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Quarter-end drilled-but-uncompleted well inventory when disclosed." }
      }
    },
    "Q3 2025": {
      ticker: "GPOR",
      quarter: "Q3 2025",
      revenue: { value: 379.745, source: "codex", basis: "actual", note: "Quarterly reported revenue." },
      adjustedEbitdax: { value: 213.1, source: "codex", basis: "actual", note: "Company-reported adjusted EBITDA/EBITDAX; standalone quarterly values in $MM." },
      capitalExpenditures: { value: 74.9, source: "codex", basis: "actual", note: "Total quarterly capital expenditures / drilling & completion capital as reported." },
      netDebt: { value: 697.633, source: "codex", basis: "derived", note: "Quarter-end face-value principal debt less cash and cash equivalents; excludes unamortized debt issuance costs." },
      production: {
        total: { value: 1120.0, source: "codex", basis: "actual", note: "Average daily total production; convert to MMcfe/d for comparability." },
        naturalGas: { value: 988.0, source: "codex", basis: "actual", note: "Average daily natural gas production." },
        ngl: { value: 15.09782608695652, source: "codex", basis: "actual", note: "Average daily NGL production." },
        oilCondensate: { value: 6.891304347826087, source: "codex", basis: "actual", note: "Average daily crude oil + condensate production where disclosed." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.8821428571, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.08088121118, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.03691770186, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 2.61, source: "codex", basis: "actual", note: "Pre-hedge realized natural gas price unless only post-hedge is disclosed; identify basis in notes." },
        ngl: { value: 27.89, source: "codex", basis: "actual", note: "Pre-hedge realized NGL price." },
        oilCondensate: { value: 58.99, source: "codex", basis: "actual", note: "Pre-hedge realized oil / condensate price." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.2, source: "codex", basis: "actual", note: "Quarterly LOE / Mcfe." },
        gatheringProcessingTransportation: { value: 0.94, source: "codex", basis: "actual", note: "Combined or closest comparable G&P / transportation unit cost; explain composition in notes." },
        cashGA: { value: 0.09, source: "codex", basis: "actual", note: "Cash G&A per Mcfe when disclosed or directly calculable from sourced data." },
        totalCashUnitCosts: { value: 1.33, source: "codex", basis: "actual", note: "Company-reported total cash unit costs where available; do not force comparability if definitions differ." }
      },
      wells: {
        drilled: { value: null, source: "codex", basis: "actual", note: "Gross or net wells drilled; specify basis in notes. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        turnedInLine: { value: 28.0, source: "codex", basis: "actual", note: "Wells placed on production / turned in line during the quarter. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Quarter-end drilled-but-uncompleted well inventory when disclosed." }
      }
    },
    "Q4 2025": {
      ticker: "GPOR",
      quarter: "Q4 2025",
      revenue: { value: 398.188, source: "codex", basis: "actual", note: "Quarterly reported revenue." },
      adjustedEbitdax: { value: 234.8, source: "codex", basis: "actual", note: "Company-reported adjusted EBITDA/EBITDAX; standalone quarterly values in $MM." },
      capitalExpenditures: { value: 110.5, source: "codex", basis: "actual", note: "Total quarterly capital expenditures / drilling & completion capital as reported." },
      netDebt: { value: 795.187, source: "codex", basis: "derived", note: "Quarter-end face-value principal debt less cash and cash equivalents; excludes unamortized debt issuance costs." },
      production: {
        total: { value: 1097.422, source: "codex", basis: "actual", note: "Average daily total production; convert to MMcfe/d for comparability." },
        naturalGas: { value: 988.107, source: "codex", basis: "actual", note: "Average daily natural gas production." },
        ngl: { value: 13.467, source: "codex", basis: "actual", note: "Average daily NGL production." },
        oilCondensate: { value: 4.752, source: "codex", basis: "actual", note: "Average daily crude oil + condensate production where disclosed." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.900389276, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.07362892306, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.02598088976, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 3.36, source: "codex", basis: "actual", note: "Pre-hedge realized natural gas price unless only post-hedge is disclosed; identify basis in notes." },
        ngl: { value: 29.19, source: "codex", basis: "actual", note: "Pre-hedge realized NGL price." },
        oilCondensate: { value: 62.54, source: "codex", basis: "actual", note: "Pre-hedge realized oil / condensate price." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.25, source: "codex", basis: "actual", note: "Quarterly LOE / Mcfe." },
        gatheringProcessingTransportation: { value: 0.92, source: "codex", basis: "actual", note: "Combined or closest comparable G&P / transportation unit cost; explain composition in notes." },
        cashGA: { value: 0.08, source: "codex", basis: "actual", note: "Cash G&A per Mcfe when disclosed or directly calculable from sourced data." },
        totalCashUnitCosts: { value: 1.37, source: "codex", basis: "actual", note: "Company-reported total cash unit costs where available; do not force comparability if definitions differ." }
      },
      wells: {
        drilled: { value: null, source: "codex", basis: "actual", note: "Gross or net wells drilled; specify basis in notes. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        turnedInLine: { value: null, source: "codex", basis: "actual", note: "Wells placed on production / turned in line during the quarter. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Quarter-end drilled-but-uncompleted well inventory when disclosed." }
      }
    },
    "Q1 2026": {
      ticker: "GPOR",
      quarter: "Q1 2026",
      revenue: { value: 437.532, source: "codex", basis: "actual", note: "Quarterly reported revenue." },
      adjustedEbitdax: { value: 264.2, source: "codex", basis: "actual", note: "Company-reported adjusted EBITDA/EBITDAX; standalone quarterly values in $MM." },
      capitalExpenditures: { value: 121.7, source: "codex", basis: "actual", note: "Total quarterly capital expenditures / drilling & completion capital as reported." },
      netDebt: { value: 829.079, source: "codex", basis: "derived", note: "Quarter-end face-value principal debt less cash and cash equivalents; excludes unamortized debt issuance costs." },
      production: {
        total: { value: 997.0, source: "codex", basis: "actual", note: "Average daily total production; convert to MMcfe/d for comparability." },
        naturalGas: { value: 906.0, source: "codex", basis: "actual", note: "Average daily natural gas production." },
        ngl: { value: 11.43333333333333, source: "codex", basis: "actual", note: "Average daily NGL production." },
        oilCondensate: { value: 3.733333333333333, source: "codex", basis: "actual", note: "Average daily crude oil + condensate production where disclosed." }
      },
      commodityMix: {
        naturalGasPct: { value: 0.9087261785, source: "codex", basis: "derived", note: "Calculated = natural gas production on an Mcfe-equivalent basis / total production Mcfe." },
        nglPct: { value: 0.06880641926, source: "codex", basis: "derived", note: "Calculated = NGL barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." },
        oilCondensatePct: { value: 0.02246740221, source: "codex", basis: "derived", note: "Calculated = oil/condensate barrels × 6 Mcfe per barrel / total production Mcfe. Energy-equivalent conversion only; not economic price equivalence." }
      },
      realizedPrices: {
        naturalGas: { value: 4.9, source: "codex", basis: "actual", note: "Pre-hedge realized natural gas price unless only post-hedge is disclosed; identify basis in notes." },
        ngl: { value: 30.59, source: "codex", basis: "actual", note: "Pre-hedge realized NGL price." },
        oilCondensate: { value: 66.4, source: "codex", basis: "actual", note: "Pre-hedge realized oil / condensate price." }
      },
      costs: {
        leaseOperatingExpense: { value: 0.27, source: "codex", basis: "actual", note: "Quarterly LOE / Mcfe." },
        gatheringProcessingTransportation: { value: 1.01, source: "codex", basis: "actual", note: "Combined or closest comparable G&P / transportation unit cost; explain composition in notes." },
        cashGA: { value: 0.11, source: "codex", basis: "actual", note: "Cash G&A per Mcfe when disclosed or directly calculable from sourced data." },
        totalCashUnitCosts: { value: 1.53, source: "codex", basis: "actual", note: "Company-reported total cash unit costs where available; do not force comparability if definitions differ." }
      },
      wells: {
        drilled: { value: 8.0, source: "codex", basis: "actual", note: "Gross or net wells drilled; specify basis in notes. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        turnedInLine: { value: 5.0, source: "codex", basis: "actual", note: "Wells placed on production / turned in line during the quarter. Unit basis (gross vs. net, operated vs. total) not explicitly specified in source; do not compare across peers as like-for-like without confirming basis." },
        ducInventory: { value: null, source: "codex", basis: "actual", note: "Quarter-end drilled-but-uncompleted well inventory when disclosed." }
      }
    },
  },
};

export function getQuarterlyFinancials(ticker: Ticker, quarter: Quarter): QuarterlyFinancials {
  return data[ticker][quarter];
}

export function getAllQuartersForTicker(ticker: Ticker): QuarterlyFinancials[] {
  return quarters.map((q) => data[ticker][q]);
}

export const financialsQuarterly = data;
