# Current Handoff

- **Repository**: christian-04-code/rrc-peer-dashboard
- **Active branch**: modeling/production-engine
- **Latest commit**: `9fc3236` — "Add flat-production and revenue tests"
- **Pushed to origin**: yes, `origin/modeling/production-engine` == local HEAD

## Validation Results
- `npm test`: 77/77 pass
- `npm run typecheck`: clean
- `npm run build`: succeeds (all routes compile, including `/forecast` and `/api/rrc-scenarios`)

## Current Dashboard Navigation
`components/HomeDashboard.tsx` renders tabs: **Overview**, **Peers**, **Map**, **Sources**, **Macro**. No **Forecast** tab exists in the main dashboard nav (the forecast workbench lives only at the standalone `/forecast` route, not linked from this nav). `components/dashboard/DataActivityPanel.tsx` renders a **"Live data engine"** widget (labeled "Simulated").

## Financials Widget
`components/dashboard/FinancialsPanel.tsx` renders a generic list of `InsightRow` text/label pairs passed in from `HomeDashboard.tsx`. It does not yet present structured income statement, cash flow statement, or balance sheet sections — "Expand" and full quarterly history are both explicitly disabled/"coming soon".

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
- The Forecast page/workbench is orphaned from primary navigation.
- FinancialsPanel and the main dashboard nav still reflect the pre-simplification structure described in the next task below.

## Project Rules (must hold for all future work)
- Never fabricate historical financial data.
- Missing historical values remain `null` or "--".
- Preserve normalized source metadata.
- Company filings remain the primary historical source.
- Do not blend actuals, guidance, consensus, and market data silently.
- Preserve existing forecast and valuation formulas unless explicitly instructed otherwise.
- Keep future tasks narrow to reduce token usage and improve efficiency.

## Exact Next Recommended Task
Update the dashboard UI by removing the Live Data Engine widget, removing the Sources tab, renaming Peers to Companies, adding a Forecast tab and dedicated Forecast page, and expanding the Financials widget to show key income statement, cash flow statement, and balance sheet metrics using normalized data only.

(Confirmed not yet done: `DataActivityPanel` "Live data engine" widget, `SourcesPanel`/"Sources" tab, and the "Peers" tab label are all still present in `components/HomeDashboard.tsx`; `FinancialsPanel` still renders generic rows, not structured statement sections.)

### Files most likely needed
- `components/HomeDashboard.tsx` (tab list, view switching, widget wiring)
- `components/dashboard/DataActivityPanel.tsx` (Live Data Engine widget to remove)
- `components/dashboard/SourcesPanel.tsx` (Sources tab to remove)
- `components/dashboard/PeersPanel.tsx` (rename Peers → Companies)
- `components/dashboard/FinancialsPanel.tsx` (expand to income statement / cash flow / balance sheet)
- `lib/dashboard/financials-quarterly.ts` (normalized source data for the expanded Financials widget)
- `lib/dashboard/types.ts` (`InsightRow` and related normalized types)
- `app/forecast/page.tsx` and `components/forecast/RrcScenarioWorkbench.tsx` (existing Forecast page to link into nav, not rebuild)
- `docs/design/COMPONENT_CONTRACTS.md` and `docs/data/DASHBOARD_DATA_MODEL.md` (existing UI/data contracts to follow)
