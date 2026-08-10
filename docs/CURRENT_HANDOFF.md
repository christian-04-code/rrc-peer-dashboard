# Current Handoff

- **Repository**: christian-04-code/rrc-peer-dashboard
- **Active branch**: modeling/production-engine
- **Latest commit**: "Add RRC net income, operating cash flow, cash, and total debt to Financials"
- **Pushed to origin**: yes, `origin/modeling/production-engine` == local HEAD
- Note: `7b6dbc2` ("Add RRC SEC filing discovery" — `scripts/sec/discover.mjs`, `config/companies.json` CIK, `npm run sec:discover`) landed on this branch from a separate, unrelated session in between the price-labeling and Financials work below. Not touched or built on by this Financials task.

## Validation Results
- `npm test`: 93/93 pass (83 from prior sessions + 5 unrelated SEC-discovery tests from `7b6dbc2` + 5 new in `tests/financials-quarterly.test.cjs`)
- `npm run typecheck`: clean
- `npm run build`: succeeds (all routes compile, including `/forecast` and `/api/rrc-scenarios`)

## Current Dashboard Navigation
`components/HomeDashboard.tsx` renders tabs: **Overview**, **Companies**, **Map**, **Forecast**, **Macro**. The Live Data Engine widget (`DataActivityPanel.tsx`) and Sources tab (`SourcesPanel.tsx`) have been removed (both files deleted, `View` type no longer has a `"sources"` variant). Peers was renamed to **Companies** (`view === "peers"` still backs it — peer comparison logic in `PeersPanel.tsx` is unchanged). The new **Forecast** tab renders `components/dashboard/ForecastPanel.tsx`, which calls the existing `/api/rrc-scenarios` route (same deterministic engine as the standalone `/forecast` page) rather than duplicating forecast logic.

## Financials Widget
`components/dashboard/FinancialsPanel.tsx` renders three `StatementSection`s — Income statement, Cash flow statement, Balance sheet — each sourced from `lib/dashboard/financials-quarterly.ts` / `lib/dashboard/free-cash-flow-quarterly.ts`, with YoY comparisons against the same quarter last year. As of this session, **RRC only** has all nine line items populated (Revenue, EBITDAX, Net income, Operating cash flow, CapEx, Free cash flow, Cash & equivalents, Total debt, Net debt) across Q1 2024–Q1 2026. The four fields added this session — `netIncome`, `operatingCashFlow`, `cashAndEquivalents`, `totalDebt` — are optional on `QuarterlyFinancials` and are **only set for RRC**; the other 6 peer tickers (AR, CNX, CRK, EQT, EXE, GPOR) still render `--` for these four rows exactly as before (field is `undefined`, not fabricated or copied from RRC).

## Forecast Engine
`lib/forecast/` — deterministic, pure-function pipeline (`calculations.ts`, `engine.ts`). Production is now a **flat hold of the latest reported Q1 2026 10-Q baseline** (`lib/forecast/production-engine.ts::buildFlatProductionForecast`), not a decline curve or annual ramp. `lib/forecast/scenarios/rrc-complete.ts` supports an optional `currentMarketPrices` override (`{ henryHubPerMmbtu?, wtiPerBbl? }` as `SourcedValue`s) — when a field is `undefined`, `periodAssumptions` falls back to the modeled sensitivity case via `??`, unchanged. Chain: `rrc-complete.ts` → `rrc-hedged.ts` → `rrc-valued.ts` → `app/api/rrc-scenarios/route.ts`.

**Live price wiring:** `lib/forecast/live-market-prices.ts` exports a pure `buildCurrentMarketPrices({ henryHub, wti })` that converts raw live metrics into `SourcedValue`s with `classification: "live"`, or `undefined` for a commodity when its live value is missing/non-numeric (never a fabricated or zeroed price). `app/api/rrc-scenarios/route.ts` accepts an optional `currentMarketPrices: { henryHub, wti }` in the POST body and threads the result into `runRrcValuedScenario`. `components/dashboard/ForecastPanel.tsx` calls the existing `useMarketData()` hook (same one `HomeDashboard.tsx` already used), waits for it to settle, extracts the `henry_hub` and `wti` metrics, and includes them in its `/api/rrc-scenarios` POST body. NGL is untouched — still `nglRealizationPctOfWti`, no live NGL feed. The standalone `/forecast` workbench does not send `currentMarketPrices` and is unaffected (defaults to the modeled case exactly as before).

**Methodology labeling (corrected):** Because `currentMarketPrices` is applied as the same scalar to every forecast period (2026Q1–2028Q4, per the pre-existing `rrc-complete.ts` design — not changed), it must not read as a forward curve. The commodity cards now show **"Current market — flat scenario"** (live) or **"Management sensitivity"** (fallback, $3.75 HH / $65 WTI) instead of the earlier "Live market"/"Model fallback" wording, plus a note directly under the assumptions grid: *"Current-market prices are held flat across forecast periods and are not a futures/forward curve."* The `SourcedValue.source.notes` text in `live-market-prices.ts` was also reworded to say the same thing at the data layer. Purely labeling/metadata — no calculation, classification value, or fallback behavior changed.

## Forecast Page
`app/forecast/page.tsx` renders `components/forecast/RrcScenarioWorkbench.tsx`: scenario preset/strategy controls, a compact "Production assumption" sidebar section (Latest reported / Manual override, per-period table, Copy/Reset), a quarterly production+revenue table, FCF/valuation cards, and a maintenance-vs-growth bridge table. This page is not linked from the main dashboard nav.

## Current API Integrations
- `app/api/market/route.ts` — live EIA data (Henry Hub, WTI, Brent, storage, LNG exports) via `lib/eia/client.ts`.
- `app/api/rrc-scenarios/route.ts` — GET/POST, runs the deterministic forecast/valuation chain. POST now accepts `currentMarketPrices: { henryHub, wti }` from the caller (the dashboard Forecast tab supplies live EIA values here); still defaults to the modeled sensitivity case ($3.75 HH / $65 WTI) whenever a live value is missing, invalid, or not supplied (e.g. the GET handler and the standalone `/forecast` workbench, neither of which send it).
- `app/api/geography/basins` — not reviewed this session.

## Known Risks
- Live prices are only wired into the dashboard `ForecastPanel` tab (`/api/rrc-scenarios` POST from `HomeDashboard.tsx` → Forecast). The standalone `/forecast` workbench (`RrcScenarioWorkbench.tsx`) still always uses the modeled sensitivity case — not updated in this task, since it wasn't in scope and no shared type required it.
- NGL has no live price feed anywhere in the repo; NGL revenue still depends on the modeled `nglRealizationPctOfWti` ratio (unchanged, out of scope by design).
- The live price applies uniformly to every forecast period (2026Q1–2028Q4), not just the current quarter — this mirrors the pre-existing `currentMarketPrices` design in `rrc-complete.ts` (a scalar override, not a forward curve) and was not changed.
- The standalone `/forecast` route (`RrcScenarioWorkbench`) is still a separate UI implementation from the dashboard's own `ForecastPanel` — both call the same `/api/rrc-scenarios` engine (workbench has scenario/strategy controls and manual overrides; the dashboard tab is a compact read-only summary, now with live/fallback price wiring). Not a data-integrity issue, just a UI duplication worth reconciling later if desired.
- `netIncome`/`operatingCashFlow`/`cashAndEquivalents`/`totalDebt` are populated for **RRC only**; the other 6 peer tickers still show `--` for these four Financials rows. Backfill them the same way (Codex workbook first, `E&P_Facset_Company_Model.xlsx` fallback for net income specifically) only when actually needed — do not fabricate or copy RRC's values across.
- RRC Q3 2024: `totalDebt` (1717.383) − `cashAndEquivalents` (277.45) = 1439.933, which is $0.757mm off the already-existing `netDebt` value (1440.69) for that quarter. Both the new fields and the pre-existing `netDebt` come directly from the Codex workbook as currently synced; the discrepancy is noted in that quarter's `totalDebt.source.note` and was not investigated further (not one of the four target metrics for this task). All other 8 quarters reconcile exactly.
- RRC `netIncome` is FactSet-sourced (`source: "factset"`), not Codex — the only non-Codex cell in `financials-quarterly.ts`. It comes from `E&P_Facset_Company_Model.xlsx`, RRC sheet, "Reported Net Income ($mm)" row, actual (not estimate) columns.

## Project Rules (must hold for all future work)
- Never fabricate historical financial data.
- Missing historical values remain `null` or "--".
- Preserve normalized source metadata.
- Company filings remain the primary historical source.
- Do not blend actuals, guidance, consensus, and market data silently.
- Preserve existing forecast and valuation formulas unless explicitly instructed otherwise.
- Keep future tasks narrow to reduce token usage and improve efficiency.

## Main Dashboard Navigation/UI Integration — Done
Completed across `c742747` and `366132d`: removed the Live Data Engine widget (`DataActivityPanel.tsx` deleted) and Sources tab (`SourcesPanel.tsx` deleted); renamed Peers → Companies in the nav (peer comparison logic unchanged); added a Forecast tab (`ForecastPanel.tsx`) that reuses the existing `/api/rrc-scenarios` engine rather than duplicating it; expanded `FinancialsPanel.tsx` into Income statement / Cash flow statement / Balance sheet sections built only from normalized data, with YoY comparisons and `--` for unavailable lines.

## Live Market Price Wiring — Done
Wired the existing `/api/market` EIA feed into the dashboard Forecast tab's `currentMarketPrices` override, with the smallest change that made sense: a new pure helper (`lib/forecast/live-market-prices.ts`), a small addition to `app/api/rrc-scenarios/route.ts`'s POST body/handler, and `ForecastPanel.tsx` now calling `useMarketData()` and forwarding `henry_hub`/`wti`. No forecast/hedge/valuation formulas, production assumptions, historical data, or EIA fetch logic (`lib/eia/client.ts`) were touched. NGL remains fully modeled (`nglRealizationPctOfWti`) — no new API.

## Commodity-Price Methodology Labeling — Done
Follow-up to the wiring above: the live scalar is applied flat across every forecast period, so the UI could be misread as a forward curve. Fixed by relabeling only — `components/dashboard/ForecastPanel.tsx` (card labels + new note) and `lib/forecast/live-market-prices.ts` (`source.notes` text). No forward-curve API was added; no calculation, `classification` value, or fallback logic changed. See "Methodology labeling (corrected)" under Forecast Engine above.

## RRC Financials Metrics (Net Income / OCF / Cash / Total Debt) — Done
Added the four previously-missing Financials rows for **RRC only**, using the existing consolidated data sources per the documented source-priority (Codex workbook first, FactSet fallback), no filing scans:
- **Operating cash flow** — Codex workbook (`Range_Peer_Quarterly_Data_Input_Template_Q1_2024_to_Q1_2026.xlsm`, RRC sheet, row 63 "GAAP Cash Flow from Operations"). All 9 quarters, with per-quarter 10-Q/10-K citations already in the workbook.
- **Cash & equivalents** — same workbook, row 69 "Cash & Cash Equivalents" (quarter-end balance-sheet point-in-time). All 9 quarters.
- **Total debt** — same workbook, row 68 "Face-Value Gross Debt" (quarter-end balance-sheet point-in-time). All 9 quarters.
- **Net income** — absent from Codex (only appears inside the EBITDAX-bridge methodology note, never stored as its own row), so per Phase 2 fell back to `Peer_Comp_Site_Data/Facset/E&P_Facset_Company_Model.xlsx`, RRC sheet, row 41 "Reported Net Income ($mm)", the 9 "A" (actual, not estimate) quarterly columns.

None of the four values were derived from other stored fields (no total debt from net debt+cash, no cash from debt−net debt, no OCF from FCF+CapEx) — each is an independently sourced figure, per task constraint. `lib/dashboard/financials-quarterly.ts`: added 4 new **optional** fields to `QuarterlyFinancials` (`netIncome?`, `operatingCashFlow?`, `cashAndEquivalents?`, `totalDebt?`) so the 6 other peer tickers are untouched and still render `--`, not required-but-null placeholders. Wired into `components/dashboard/FinancialsPanel.tsx`. See "Known Risks" above for the RRC Q3 2024 debt/cash-vs-netDebt rounding note and the FactSet net-income sourcing detail.
