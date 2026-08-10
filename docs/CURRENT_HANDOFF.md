# Current Handoff

- **Repository**: christian-04-code/rrc-peer-dashboard
- **Active branch**: modeling/production-engine
- **Latest commit**: `366132d` — "Replace Overview mock/guidance content with normalized live data"
- **Pushed to origin**: yes, `origin/modeling/production-engine` == local HEAD

## Validation Results
- `npm test`: 77/77 pass
- `npm run typecheck`: clean
- `npm run build`: succeeds (all routes compile, including `/forecast` and `/api/rrc-scenarios`)

## Current Dashboard Navigation
`components/HomeDashboard.tsx` renders tabs: **Overview**, **Companies**, **Map**, **Forecast**, **Macro**. The Live Data Engine widget (`DataActivityPanel.tsx`) and Sources tab (`SourcesPanel.tsx`) have been removed (both files deleted, `View` type no longer has a `"sources"` variant). Peers was renamed to **Companies** (`view === "peers"` still backs it — peer comparison logic in `PeersPanel.tsx` is unchanged). The new **Forecast** tab renders `components/dashboard/ForecastPanel.tsx`, which calls the existing `/api/rrc-scenarios` route (same deterministic engine as the standalone `/forecast` page) rather than duplicating forecast logic.

## Financials Widget
`components/dashboard/FinancialsPanel.tsx` now renders three `StatementSection`s — Income statement, Cash flow statement, Balance sheet — each sourced from `lib/dashboard/financials-quarterly.ts` / `lib/dashboard/free-cash-flow-quarterly.ts`, with YoY comparisons against the same quarter last year. **Missing normalized metrics** (not present anywhere in the `QuarterlyFinancials` type): Net income, Operating cash flow, Cash & equivalents, Total debt. These render as `--` rather than being fabricated; Revenue, EBITDAX, CapEx, Free cash flow, and Net debt are populated from real normalized data.

## Forecast Engine
`lib/forecast/` — deterministic, pure-function pipeline (`calculations.ts`, `engine.ts`). Production is now a **flat hold of the latest reported Q1 2026 10-Q baseline** (`lib/forecast/production-engine.ts::buildFlatProductionForecast`), not a decline curve or annual ramp. `lib/forecast/scenarios/rrc-complete.ts` wires this in and supports an optional `currentMarketPrices` override (not yet connected to a live fetch) and optional per-period production overrides. Chain: `rrc-complete.ts` → `rrc-hedged.ts` → `rrc-valued.ts` → `app/api/rrc-scenarios/route.ts`.

## Forecast Page
`app/forecast/page.tsx` renders `components/forecast/RrcScenarioWorkbench.tsx`: scenario preset/strategy controls, a compact "Production assumption" sidebar section (Latest reported / Manual override, per-period table, Copy/Reset), a quarterly production+revenue table, FCF/valuation cards, and a maintenance-vs-growth bridge table. This page is not linked from the main dashboard nav.

## Current API Integrations
- `app/api/market/route.ts` — live EIA data (Henry Hub, WTI, Brent, storage, LNG exports) via `lib/eia/client.ts`.
- `app/api/rrc-scenarios/route.ts` — GET/POST, runs the deterministic forecast/valuation chain; still defaults commodity price to the modeled sensitivity case ($3.75 HH / $65 WTI) unless a caller supplies `currentMarketPrices`.
- `app/api/geography/basins` — not reviewed this session.

## Known Risks
- Live market prices are not yet wired end-to-end into the forecast page (`currentMarketPrices` param exists but nothing calls it with live EIA data yet).
- NGL has no live price feed anywhere in the repo; NGL revenue still depends on the modeled `nglRealizationPctOfWti` ratio.
- The standalone `/forecast` route (`RrcScenarioWorkbench`) is still separate from the dashboard's own `ForecastPanel` — both call the same `/api/rrc-scenarios` engine but are two different UI implementations (workbench has scenario/strategy controls and manual overrides; the dashboard tab is a compact read-only summary). Not a data-integrity issue, just a UI duplication worth reconciling later if desired.
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
