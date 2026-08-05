# Homepage Acceptance Tests

## Purpose

This file is the behavioral definition of done for the first production homepage. Claude should use it before expanding features or integrating live APIs.

## Company selection

### Default state
- RRC is selected on first load.
- The Range Resources logo, name, description, metrics, chart context, map context, insights, and sources all agree.

### Switching companies
Given RRC is selected, when the user selects AR:
- AR becomes the primary selected ticker.
- The Antero logo replaces the Range logo immediately.
- The company name and subtitle update immediately.
- RRC-specific metrics do not remain visible.
- Unsupported AR values render as an em dash, never zero.
- Notes explain that the normalized adapter is pending.
- The chart title and map context update to AR.
- No stale RRC branding remains outside the market ribbon item explicitly labeled RRC.

Repeat this test for CNX, CRK, EQT, EXE, and GPOR.

## Logo integrity

- Every company must load its path from the registry or a single logo adapter.
- Broken images must have a readable ticker fallback.
- Logo aspect ratio must be preserved.
- The logo must never be inferred from company name text.

## Metric interaction

- Clicking a metric changes the active metric state.
- The matching metric card and workspace tab become active.
- Chart title and insight context update together.
- Missing values remain blank or em dash.
- Guidance ranges remain ranges.

## Peer comparison

- Comparison series are visually distinct from the primary company.
- Removing a comparison removes only that peer series.
- Unsupported peer data must not be replaced with illustrative values in production mode.
- The primary company remains primary after adding or removing peers.

## Chart and map workspace

- Chart and Map are mutually exclusive views in the same workspace.
- Switching views preserves selected company and metric.
- Map controls do not alter chart data state unexpectedly.
- Chart controls do not clear map layer preferences unexpectedly.
- The map must eventually use authoritative geography; schematic geography is permitted only while clearly labeled as a placeholder.

## Market ribbon

- Each item is interactive.
- Clicking an item opens context or changes analytical mode.
- Every quote displays source status and timestamp once live integration exists.
- Stale or delayed feeds are visibly labeled.
- Mock quotes are never labeled live.

## Detail drawer

- Drawer opens from metrics, market items, map features, insights, and source indicators.
- Drawer closes with the close button, backdrop click, and Escape key.
- Focus returns to the triggering control.
- Production drawers include normalized record ID, source file, source type, date, page or location when available, and confidence status.

## Data integrity

- Null never renders as 0.
- Total CapEx is not silently replaced by drilling-and-completion capital.
- Completed wells are not treated as TILs.
- Actual, guidance, consensus, market, and derived values remain distinguishable.
- Conflicting values remain traceable rather than silently overwritten.
- Unsupported insights are disabled or explicitly labeled pending.

## Responsive behavior

### Desktop
- Main content fits without excessive whitespace.
- One primary chart or map dominates the workspace.
- Intelligence and data-engine panels remain secondary.

### Tablet
- Metric cards wrap cleanly.
- Company selector remains usable.
- Workspace and sidebar stack without overlap.

### Mobile
- Market ribbon may scroll horizontally.
- Company selector may scroll or wrap.
- Chart remains readable without page-level horizontal overflow.
- Map controls remain accessible.
- Drawer uses available width without clipping.

## Accessibility

- All interactive elements are keyboard reachable.
- Active controls expose state using aria-pressed, aria-selected, or equivalent semantics.
- Images have meaningful alt text.
- Charts and maps have text alternatives.
- Color is not the only indicator of positive, negative, selected, delayed, or conflict states.
- Motion respects prefers-reduced-motion.

## Claude completion checklist

Before calling the homepage complete:
1. Run typecheck and production build.
2. Test every ticker transition.
3. Verify every logo asset.
4. Verify every empty state.
5. Test Chart/Map state preservation.
6. Test drawers with keyboard and pointer.
7. Confirm no raw CSV or JSON parsing occurs in React components.
8. Confirm mock data is unmistakably labeled.
9. Record any unsupported data requirements in implementation notes rather than inventing values.
