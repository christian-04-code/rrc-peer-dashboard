# User Decisions and Comparison Notes for Claude

## Locked user decisions

These are explicit product decisions from the user and should be treated as controlling unless the user later changes them.

1. The homepage supports one primary company plus up to six comparison peers.
2. The default comparison peers when RRC loads are AR, EQT, and CNX.
3. The product should use a dark theme aligned with Range Resources branding and should feel like a polished company website/product, not a generic SaaS dashboard, spreadsheet, or FactSet clone.
4. The user did not like the prior Claude visual direction. Do not restore or recreate that earlier design without explicit approval.

## What was implemented

- Added `config/comparison-preferences.json` as the controlling source for the comparison limit, default peers, and visual direction.
- Replaced the AR-only comparison toggle with registry-driven peer selection.
- Added a six-peer maximum and a visible selected-count indicator.
- Added default peer selection for AR, EQT, and CNX.
- Added clear-all behavior.
- Prevented the primary company from also appearing as a comparison peer.
- When a comparison peer becomes the primary company, it is removed from the comparison set.
- Passed comparison state into both chart and map workspaces.
- Added multiple mock peer paths to the chart foundation.
- Added Escape-to-close, dialog semantics, and initial close-button focus to the detail drawer.
- Refined the dark theme toward restrained Range-aligned navy and blue tones.

## Important implementation notes

The chart peer paths remain presentation fixtures. They are not real financial series and must be replaced by normalized chart-series records before production. Do not infer or fabricate peer values to populate them.

The map is still schematic. The comparison state is wired into it, but authoritative geometry and verified company exposure data remain required.

## Next recommended work

1. Run `npm install`, `npm run typecheck`, and `npm run build`.
2. Fix only concrete build errors before extending functionality.
3. Extract `CompanyComparisonSelector` into its own component.
4. Add full focus trapping and focus restoration to the drawer.
5. Build a typed chart-series adapter that returns actual, guidance, consensus, and peer series.
6. Add automated tests for the six-peer limit, default peers, primary-company exclusion, and clear-all behavior.

## Do not do

- Do not revert to an AR-only comparison control.
- Do not exceed six comparison peers.
- Do not remove AR, EQT, and CNX as the initial RRC comparison set without user approval.
- Do not switch the homepage to a light-first theme.
- Do not introduce neon colors, excessive gradients, giant KPI tiles, or dense spreadsheet-like tables on the homepage.
- Do not reuse a prior design merely because code already exists; the current product direction controls.
