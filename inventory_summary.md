# RRC Peer Dashboard — Data Inventory Summary

> **Stale snapshot notice (2026-08-12, fix/q2-data-foundation):** this file was
> generated before Q2 2026 existed and has not been regenerated since. It is kept
> as a point-in-time record of the original consolidation pass, not a live
> report -- do not treat its numbers as current. Known-stale facts, corrected:
> - **Coverage window** is now 10 quarters (Q1 2024-**Q2 2026**), not the 9
>   shown below.
> - **`data/guidance.json`** (referenced throughout as the Layer 2 source) has
>   zero imports anywhere in the app and is orphaned/deprecated. The live
>   guidance source is `data/management-guidance.json`
>   (`meta.reportingCycle: "Q2 2026"`).
> - **GPOR guidance coverage** (section 5 below shows "0 ()") is stale: GPOR
>   now has 29 entries in `data/management-guidance.json`, rebuilt 2026-08-11.
> - **EV / LTM EBITDAX** (section 2 below, "MISSING" for every quarter for
>   CRK/EQT/EXE/GPOR) is no longer unconditionally missing: this branch
>   populated Q2 2026 for those four tickers (their first-ever value for this
>   metric) once an accessible quarter-end closing-price source (Nasdaq's
>   historical trades table) was found. Q1 2024-Q1 2026 remain genuinely
>   missing for those four tickers -- that gap was not backfilled.
> - **Production/pricing/cost/wells detail at Q2 2026** for all 7 core peers
>   has been added to both `data/historical.json` and the live
>   `lib/dashboard/financials-quarterly.ts` fixture; this file's completeness
>   percentages and per-metric gap lists do not reflect that quarter at all.
>
> A full regeneration of this report against the current data was out of scope
> for the Q2 2026 data-foundation pass; treat the sections below as historical
> context only.

Consolidation pass output inventory: what data exists per company/metric/quarter across Layer 1 (Historical) and Layer 2 (Guidance), what's genuinely missing vs. intentionally null, and rough completeness by company. Generated from `data/historical.json` and `data/guidance.json`.

**Historical coverage window:** Q1 2024, Q2 2024, Q3 2024, Q4 2024, Q1 2025, Q2 2025, Q3 2025, Q4 2025, Q1 2026 (9 standalone quarters)

**Core V1 peers:** RRC, AR, CNX, CRK, EQT, EXE, GPOR

**Broader peers (included, not validated this pass):** CHRD, MGY, MTDR, MUR, OVV, SM

## 1. Historical Data Completeness by Company

Completeness = populated (non-null) values / total possible (metric x quarter) cells among the core reported metrics (rows under FINANCIAL PERFORMANCE, PRODUCTION & MIX, REALIZED PRICING, COST STRUCTURE, WELLS & DEVELOPMENT, CAPITAL EFFICIENCY / BALANCE SHEET). Cells intentionally null (e.g. CRK NGL, or metrics not yet reported in an early quarter) are excluded from the denominator when explicitly flagged `not_disclosed`; otherwise a null counts as missing.

| Ticker | Company | Core V1? | Metrics tracked | Cells populated | Cells null (missing) | Cells not_disclosed | Completeness % |
|---|---|---|---|---|---|---|---|
| RRC | Range Resources Corporation | Yes | 22 | 182 | 16 | 0 | 91.9% |
| AR | Antero Resources Corporation | Yes | 22 | 177 | 21 | 0 | 89.4% |
| CNX | CNX Resources Corporation | Yes | 22 | 188 | 10 | 0 | 94.9% |
| CRK | Comstock Resources, Inc. | Yes | 22 | 155 | 25 | 18 | 86.1% |
| EQT | EQT Corporation | Yes | 22 | 162 | 36 | 0 | 81.8% |
| EXE | Expand Energy Corporation | Yes | 22 | 184 | 14 | 0 | 92.9% |
| GPOR | Gulfport Energy Corporation | Yes | 22 | 173 | 25 | 0 | 87.4% |
| CHRD | Chord Energy Corporation | No | 22 | 122 | 76 | 0 | 61.6% |
| MGY | Magnolia Oil & Gas Corporation | No | 22 | 126 | 72 | 0 | 63.6% |
| MTDR | Matador Resources Company | No | 22 | 93 | 105 | 0 | 47.0% |
| MUR | Murphy Oil Corporation | No | 22 | 94 | 104 | 0 | 47.5% |
| OVV | Ovintiv Inc. | No | 22 | 102 | 96 | 0 | 51.5% |
| SM | SM Energy Company | No | 22 | 125 | 73 | 0 | 63.1% |

## 2. Per-Metric Gap Detail (Core V1 Peers Only)

Lists any metric/quarter combination that is missing (null, not flagged not_disclosed) for the 7 core peers. Empty list = fully populated.

### RRC
- MISSING: Wells Drilled / Q1 2024
- MISSING: Wells Drilled / Q2 2024
- MISSING: Wells Drilled / Q3 2024
- MISSING: Wells Drilled / Q4 2024
- MISSING: Wells Drilled / Q4 2025
- MISSING: DUC Inventory / Q1 2024
- MISSING: DUC Inventory / Q2 2024
- MISSING: DUC Inventory / Q3 2024
- MISSING: DUC Inventory / Q4 2024
- MISSING: DUC Inventory / Q1 2025
- MISSING: DUC Inventory / Q2 2025
- MISSING: DUC Inventory / Q3 2025
- MISSING: DUC Inventory / Q1 2026
- MISSING: EV / LTM EBITDAX / Q1 2024
- MISSING: EV / LTM EBITDAX / Q2 2024
- MISSING: EV / LTM EBITDAX / Q3 2024

### AR
- MISSING: Wells Drilled / Q1 2024
- MISSING: Wells Drilled / Q2 2024
- MISSING: Wells Drilled / Q3 2024
- MISSING: Wells Drilled / Q4 2024
- MISSING: Wells Drilled / Q1 2025
- MISSING: Wells Drilled / Q2 2025
- MISSING: Wells Drilled / Q3 2025
- MISSING: Wells Drilled / Q4 2025
- MISSING: Wells Drilled / Q1 2026
- MISSING: DUC Inventory / Q1 2024
- MISSING: DUC Inventory / Q2 2024
- MISSING: DUC Inventory / Q3 2024
- MISSING: DUC Inventory / Q4 2024
- MISSING: DUC Inventory / Q1 2025
- MISSING: DUC Inventory / Q2 2025
- MISSING: DUC Inventory / Q3 2025
- MISSING: DUC Inventory / Q4 2025
- MISSING: DUC Inventory / Q1 2026
- MISSING: EV / LTM EBITDAX / Q1 2024
- MISSING: EV / LTM EBITDAX / Q2 2024
- MISSING: EV / LTM EBITDAX / Q3 2024

### CNX
- MISSING: DUC Inventory / Q1 2024
- MISSING: DUC Inventory / Q2 2024
- MISSING: DUC Inventory / Q3 2024
- MISSING: DUC Inventory / Q1 2025
- MISSING: DUC Inventory / Q2 2025
- MISSING: DUC Inventory / Q3 2025
- MISSING: DUC Inventory / Q1 2026
- MISSING: EV / LTM EBITDAX / Q1 2024
- MISSING: EV / LTM EBITDAX / Q2 2024
- MISSING: EV / LTM EBITDAX / Q3 2024

### CRK
- MISSING: Wells Drilled / Q1 2024
- MISSING: Wells Drilled / Q2 2024
- MISSING: Wells Drilled / Q3 2024
- MISSING: Wells Turned-in-Line (TIL) / Q1 2024
- MISSING: Wells Turned-in-Line (TIL) / Q2 2024
- MISSING: Wells Turned-in-Line (TIL) / Q3 2024
- MISSING: Wells Turned-in-Line (TIL) / Q4 2024
- MISSING: DUC Inventory / Q1 2024
- MISSING: DUC Inventory / Q2 2024
- MISSING: DUC Inventory / Q3 2024
- MISSING: DUC Inventory / Q4 2024
- MISSING: DUC Inventory / Q1 2025
- MISSING: DUC Inventory / Q2 2025
- MISSING: DUC Inventory / Q3 2025
- MISSING: DUC Inventory / Q4 2025
- MISSING: DUC Inventory / Q1 2026
- MISSING: EV / LTM EBITDAX / Q1 2024
- MISSING: EV / LTM EBITDAX / Q2 2024
- MISSING: EV / LTM EBITDAX / Q3 2024
- MISSING: EV / LTM EBITDAX / Q4 2024
- MISSING: EV / LTM EBITDAX / Q1 2025
- MISSING: EV / LTM EBITDAX / Q2 2025
- MISSING: EV / LTM EBITDAX / Q3 2025
- MISSING: EV / LTM EBITDAX / Q4 2025
- MISSING: EV / LTM EBITDAX / Q1 2026

### EQT
- MISSING: Wells Drilled / Q1 2024
- MISSING: Wells Drilled / Q2 2024
- MISSING: Wells Drilled / Q3 2024
- MISSING: Wells Drilled / Q4 2024
- MISSING: Wells Drilled / Q1 2025
- MISSING: Wells Drilled / Q2 2025
- MISSING: Wells Drilled / Q3 2025
- MISSING: Wells Drilled / Q4 2025
- MISSING: Wells Drilled / Q1 2026
- MISSING: Wells Turned-in-Line (TIL) / Q1 2024
- MISSING: Wells Turned-in-Line (TIL) / Q2 2024
- MISSING: Wells Turned-in-Line (TIL) / Q3 2024
- MISSING: Wells Turned-in-Line (TIL) / Q4 2024
- MISSING: Wells Turned-in-Line (TIL) / Q1 2025
- MISSING: Wells Turned-in-Line (TIL) / Q2 2025
- MISSING: Wells Turned-in-Line (TIL) / Q3 2025
- MISSING: Wells Turned-in-Line (TIL) / Q4 2025
- MISSING: Wells Turned-in-Line (TIL) / Q1 2026
- MISSING: DUC Inventory / Q1 2024
- MISSING: DUC Inventory / Q2 2024
- MISSING: DUC Inventory / Q3 2024
- MISSING: DUC Inventory / Q4 2024
- MISSING: DUC Inventory / Q1 2025
- MISSING: DUC Inventory / Q2 2025
- MISSING: DUC Inventory / Q3 2025
- MISSING: DUC Inventory / Q4 2025
- MISSING: DUC Inventory / Q1 2026
- MISSING: EV / LTM EBITDAX / Q1 2024
- MISSING: EV / LTM EBITDAX / Q2 2024
- MISSING: EV / LTM EBITDAX / Q3 2024
- MISSING: EV / LTM EBITDAX / Q4 2024
- MISSING: EV / LTM EBITDAX / Q1 2025
- MISSING: EV / LTM EBITDAX / Q2 2025
- MISSING: EV / LTM EBITDAX / Q3 2025
- MISSING: EV / LTM EBITDAX / Q4 2025
- MISSING: EV / LTM EBITDAX / Q1 2026

### EXE
- MISSING: DUC Inventory / Q1 2025
- MISSING: DUC Inventory / Q2 2025
- MISSING: DUC Inventory / Q3 2025
- MISSING: DUC Inventory / Q4 2025
- MISSING: DUC Inventory / Q1 2026
- MISSING: EV / LTM EBITDAX / Q1 2024
- MISSING: EV / LTM EBITDAX / Q2 2024
- MISSING: EV / LTM EBITDAX / Q3 2024
- MISSING: EV / LTM EBITDAX / Q4 2024
- MISSING: EV / LTM EBITDAX / Q1 2025
- MISSING: EV / LTM EBITDAX / Q2 2025
- MISSING: EV / LTM EBITDAX / Q3 2025
- MISSING: EV / LTM EBITDAX / Q4 2025
- MISSING: EV / LTM EBITDAX / Q1 2026

### GPOR
- MISSING: Wells Drilled / Q2 2024
- MISSING: Wells Drilled / Q4 2024
- MISSING: Wells Drilled / Q1 2025
- MISSING: Wells Drilled / Q3 2025
- MISSING: Wells Drilled / Q4 2025
- MISSING: Wells Turned-in-Line (TIL) / Q4 2024
- MISSING: Wells Turned-in-Line (TIL) / Q4 2025
- MISSING: DUC Inventory / Q1 2024
- MISSING: DUC Inventory / Q2 2024
- MISSING: DUC Inventory / Q3 2024
- MISSING: DUC Inventory / Q4 2024
- MISSING: DUC Inventory / Q1 2025
- MISSING: DUC Inventory / Q2 2025
- MISSING: DUC Inventory / Q3 2025
- MISSING: DUC Inventory / Q4 2025
- MISSING: DUC Inventory / Q1 2026
- MISSING: EV / LTM EBITDAX / Q1 2024
- MISSING: EV / LTM EBITDAX / Q2 2024
- MISSING: EV / LTM EBITDAX / Q3 2024
- MISSING: EV / LTM EBITDAX / Q4 2024
- MISSING: EV / LTM EBITDAX / Q1 2025
- MISSING: EV / LTM EBITDAX / Q2 2025
- MISSING: EV / LTM EBITDAX / Q3 2025
- MISSING: EV / LTM EBITDAX / Q4 2025
- MISSING: EV / LTM EBITDAX / Q1 2026

## 3. Intentional Nulls (Never Estimate, Never Zero)

- **CRK — NGL Production**: `null` for all quarters, tagged `not_disclosed`. Average daily NGL production. [not_disclosed: CRK does not disclose NGL production/pricing]
- **CRK — Realized NGL Price**: `null` for all quarters, tagged `not_disclosed`. Pre-hedge realized NGL price. [not_disclosed: CRK does not disclose NGL production/pricing]

## 4. FactSet Override Activity (Conflict Log Summary)

Total overrides logged: **499** (see `data/conflict_log.csv` for full line-by-line detail: company, metric, quarter, old Codex value, new FactSet value, source).

| Company | Override count |
|---|---|
| RRC | 65 |
| AR | 94 |
| CNX | 67 |
| CRK | 71 |
| EQT | 76 |
| EXE | 44 |
| GPOR | 82 |

Overrides only apply to direct reported line items covered by FactSet's Actual-tagged `E&P_Facset_Company_Model.xlsx` (Revenue, Adjusted EBITDAX, Free Cash Flow, CapEx, Net Debt, Total/Gas/NGL/Oil Production, Realized Gas/NGL/Oil Pricing, Shares Outstanding). Cost-structure line items (LOE, G&P/transport, Cash G&A), wells/DUC/lateral-feet metrics, and the analyst's own Normalized/calculated metric block are Codex-only (FactSet doesn't cover them) and were left untouched per the conflict rule.

## 5. Management Guidance (Layer 2) Coverage

| Ticker | Sections captured |
|---|---|
| RRC | 8 (Production, Capital Expenditures, Operating Costs, Commodity Realizations / Differentials, Operational Activity, Infrastructure / Capacity, Financial Targets, Key Guidance Changes — Q1 2026) |
| AR | 9 (Production, Capital Expenditures, Operating Costs, Commodity Realizations / Differentials, Operational Activity, HG Energy Acquisition / Synergies, Portfolio Changes, Financial Targets, Key Guidance Changes — Q1 2026) |
| CNX | 11 (Production, Capital Expenditures, Operating Costs, Commodity Realizations / Differentials, Operational Activity, Deep Utica, Financial Guidance, New Technologies / Environmental Attributes, Hedging, Shareholder Returns / Balance Sheet, Key Guidance Changes — Q1 2026) |
| CRK | 9 (Production, Capital Expenditures, Operating Costs, Operational Activity, Midstream — Pinnacle Gas Services, Hedging, Financial / Balance Sheet, Data Center / Power Opportunity, Key 2026 Guidance Inputs) |
| EQT | 8 (Production, Capital Expenditures, Operating Costs, Operational Activity, Financial Guidance, Long-Term Financial Targets, Strategic / Growth Capital, Key 2026 Guidance Inputs) |
| EXE | 10 (Production, Capital Expenditures, Operating Costs, Operational Efficiency, Synergies / Cost Savings, East Texas / Inventory Expansion, Marketing / LNG Strategy, Financial / Balance Sheet, Hedging, Key 2026 Guidance Inputs) |
| GPOR | 0 () |
| CHRD | 8 (Production, Capital Expenditures, Financial Guidance, Operating Costs, Operational Activity, Efficiency / Cost Savings, Shareholder Returns, Key 2026 Guidance Inputs) |
| MGY | 8 (Production, Capital Expenditures, Operational Activity, WildFire Energy Acquisition, Synergies, Financial / Balance Sheet, Shareholder Returns, Key 2026 Guidance Inputs) |
| MTDR | 9 (Production, Capital Expenditures, Operating Costs, D&C Efficiency, Financial Guidance, Midstream, Operational / Inventory Strategy, Balance Sheet / Capital Allocation, Key 2026 Guidance Inputs) |
| MUR | 9 (Production, Capital Expenditures, Operating Costs, Vietnam, Gulf of Mexico / Gulf of America, Côte d’Ivoire, Shareholder Returns, Balance Sheet, Key 2026 Guidance Inputs) |
| OVV | 9 (Production, Capital Expenditures, Operating Costs, Operational Efficiency, NuVista Integration / Synergies, Inventory, Portfolio / Debt Reduction, Shareholder Returns, Key 2026 Guidance Inputs) |
| SM | 9 (Production, Capital Expenditures, Operating Costs, Operational Activity, Merger Synergies, Portfolio / Divestitures, Balance Sheet / Leverage, Shareholder Returns, Key 2026 Guidance Inputs) |

All 13 companies have a guidance record parsed from the AlphaSense docx. Per the controlling spec (Phase 2 status note in the source doc), RRC and AR were the most mature/complete guidance sets as of the doc's last update; CNX, CRK, EQT, EXE, GPOR sections exist in this docx (this pass captured them) but should still be spot-verified against primary company disclosures before being treated as final, per the Management Guidance Source Hierarchy rule (AlphaSense is a discovery layer only, not final authority).

## 6. Notes on Broader Peers (CHRD, MGY, MTDR, MUR, OVV, SM)

Included in `historical.json`, `guidance.json`, and `consensus.json` (where FactSet coverage exists) at the same structural fidelity as the core 7, since the underlying Codex/AlphaSense data already exists for them. Per task scope, these were NOT validated/polished beyond the mechanical parse — see completeness table above for their raw fill-rate.

Note: the FactSet Actual-override conflict rule and `E&P_Facset_Company_Model.xlsx` / `Peer_Comp_Site_Consensus_Actual_Facset.xlsx` only cover the 7 core peers (those workbooks contain sheets for RRC, AR, CNX, CRK, EQT, EXE, GPOR only) — broader peers' historical.json values are Codex-only, unconflicted.
