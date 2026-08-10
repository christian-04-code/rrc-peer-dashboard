# Current Handoff

- **Repository**: christian-04-code/rrc-peer-dashboard
- **Active branch**: modeling/production-engine
- **Latest commit**: "Wire live EIA Henry Hub/WTI prices into the dashboard Forecast tab"
- **Pushed to origin**: yes, `origin/modeling/production-engine` == local HEAD

## Validation Results
- `npm test`: 82/82 pass (77 pre-existing + 5 new in `tests/live-market-prices.test.cjs`)
- `npm run typecheck`: clean
- `npm run build`: succeeds (all routes compile, including `/forecast` and `/api/rrc-scenarios`)

## Current Dashboard Navigation
`components/HomeDashboard.tsx` renders tabs: **Overview**, **Companies**, **Map**, **Forecast**, **Macro**. The Live Data Engine widget (`DataActivityPanel.tsx`) and Sources tab (`SourcesPanel.tsx`) have been removed (both files deleted, `View` type no longer has a `"sources"` variant). Peers was renamed to **Companies** (`view === "peers"` still backs it — peer comparison logic in `PeersPanel.tsx` is unchanged). The new **Forecast** tab renders `components/dashboard/ForecastPanel.tsx`, which calls the existing `/api/rrc-scenarios` route (same deterministic engine as the standalone `/forecast` page) rather than duplicating forecast logic.

## Financials Widget
`components/dashboard/FinancialsPanel.tsx` now renders three `StatementSection`s — Income statement, Cash flow statement, Balance sheet — each sourced from `lib/dashboard/financials-quarterly.ts` / `lib/dashboard/free-cash-flow-quarterly.ts`, with YoY comparisons against the same quarter last year. **Missing normalized metrics** (not present anywhere in the `QuarterlyFinancials` type): Net income, Operating cash flow, Cash & equivalents, Total debt. These render as `--` rather than being fabricated; Revenue, EBITDAX, CapEx, Free cash flow, and Net debt are populated from real normalized data.

## Forecast Engine
`lib/forecast/` — deterministic, pure-function pipeline (`calculations.ts`, `engine.ts`). Production is now a **flat hold of the latest reported Q1 2026 10-Q baseline** (`lib/forecast/production-engine.ts::buildFlatProductionForecast`), not a decline curve or annual ramp. `lib/forecast/scenarios/rrc-complete.ts` supports an optional `currentMarketPrices` override (`{ henryHubPerMmbtu?, wtiPerBbl? }` as `SourcedValue`s) — when a field is `undefined`, `periodAssumptions` falls back to the modeled sensitivity case via `??`, unchanged. Chain: `rrc-complete.ts` → `rrc-hedged.ts` → `rrc-valued.ts` → `app/api/rrc-scenarios/route.ts`.

**Live price wiring (new):** `lib/forecast/live-market-prices.ts` exports a pure `buildCurrentMarketPrices({ henryHub, wti })` that converts raw live metrics into `SourcedValue`s with `classification: "live"`, or `undefined` for a commodity when its live value is missing/non-numeric (never a fabricated or zeroed price). `app/api/rrc-scenarios/route.ts` now accepts an optional `currentMarketPrices: { henryHub, wti }` in the POST body and threads the result into `runRrcValuedScenario`. `components/dashboard/ForecastPanel.tsx` calls the existing `useMarketData()` hook (same one `HomeDashboard.tsx` already used), waits for it to settle, extracts the `henry_hub` and `wti` metrics, and includes them in its `/api/rrc-scenarios` POST body. The two commodity assumption cards now show **"Live market"** or **"Model fallback"** based on `source.classification`. NGL is untouched — still `nglRealizationPctOfWti`, no live NGL feed. The standalone `/forecast` workbench does not send `currentMarketPrices` and is unaffected (defaults to the modeled case exactly as before).

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
- `QuarterlyFinancials` has no `netIncome`, `operatingCashFlow`, `cashAndEquivalents`, or `totalDebt` fields — FinancialsPanel shows `--` for these rather than fabricating them. Add them to `lib/dashboard/financials-quarterly.ts` only when there's a real normalized source for them.

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
Wired the existing `/api/market` EIA feed into the dashboard Forecast tab's `currentMarketPrices` override, with the smallest change that made sense: a new pure helper (`lib/forecast/live-market-prices.ts`), a small addition to `app/api/rrc-scenarios/route.ts`'s POST body/handler, and `ForecastPanel.tsx` now calling `useMarketData()` and forwarding `henry_hub`/`wti`. No forecast/hedge/valuation formulas, production assumptions, historical data, or EIA fetch logic (`lib/eia/client.ts`) were touched. NGL remains fully modeled (`nglRealizationPctOfWti`) — no new API. See "Live price wiring (new)" under Forecast Engine above for the exact mechanism.
