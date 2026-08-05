# Starter Implementation Notes for Claude

## What has been built
A runnable Next.js 14 + TypeScript starter application has been added to the repository.

Implemented files:
- `package.json`
- `tsconfig.json`
- `next-env.d.ts`
- `app/layout.tsx`
- `app/page.tsx`
- `app/globals.css`
- `components/HomeDashboard.tsx`
- `.gitignore`

## Current functionality
- Responsive dark research-tool layout
- Mock live market ribbon
- Animated activity messages
- Company selector for RRC, AR, CNX, CRK, EQT, EXE, and GPOR
- Repository logo imports that switch with the selected company
- RRC repository-supported guidance display where documented
- Explicit blank states for peer values not yet normalized
- Interactive metric selection
- Chart / Map workspace toggle
- AR comparison line toggle
- Source/detail drawer foundation
- Responsive desktop, tablet, and mobile styling

## Data integrity choices already made
- Peer financial values are not fabricated.
- Missing peer adapter values render as an em dash.
- RRC guidance values shown in the starter are labeled by context.
- The map is explicitly marked as a schematic placeholder.
- The starter does not parse raw repository data in React.

## Important next steps
1. Run `npm install`.
2. Run `npm run typecheck` and `npm run build`.
3. Fix only build/type issues before expanding features.
4. Replace local company display objects with validated data derived from `config/companies.json`.
5. Build normalized mock fixtures matching `docs/data/DASHBOARD_DATA_MODEL.md`.
6. Introduce a centralized homepage reducer/state model.
7. Replace the chart mock with normalized chart selectors.
8. Replace the schematic map with authoritative U.S. geometry and verified exposure layers.
9. Add exact source metadata to the detail drawer.
10. Add component tests for company and logo switching.

## Do not do
- Do not fill missing peer values with estimates.
- Do not treat the map placeholder as geographic data.
- Do not hard-code additional logos.
- Do not move data parsing into `HomeDashboard.tsx`.
- Do not redesign the homepage before validating the current shell with the user.

## Suggested first Claude task
Validate the starter application locally, resolve build errors, and commit only the minimum corrections needed for a clean production build. Then stop and report results before starting adapters or map work.
