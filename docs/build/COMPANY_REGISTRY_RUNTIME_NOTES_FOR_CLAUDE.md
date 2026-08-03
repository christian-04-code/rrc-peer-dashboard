# Company Registry Runtime Notes for Claude

## What was completed

The homepage no longer defines company names, descriptions, ordering, exchange labels, map context, or logo mappings inside `components/HomeDashboard.tsx`.

A typed runtime adapter now lives at:

- `lib/dashboard/company-registry.ts`

It reads identity and business metadata from:

- `config/companies.json`

It resolves the existing repository logo assets through one centralized `logoByTicker` map because static Next.js image imports cannot be created dynamically from JSON paths at runtime.

## Runtime exports

The adapter provides:

- `Ticker`
- `CompanyRegistryEntry`
- `defaultTicker`
- `selectableCompanies`
- `companiesByTicker`
- `getCompany(ticker)`
- `isTicker(value)`

## Homepage changes

`components/HomeDashboard.tsx` now uses the adapter for:

- default company selection
- selector ordering
- selector labels
- company short name
- full logo and alt text
- exchange and ticker labeling
- company description
- map default view
- primary region and basin
- exposure keys

Selecting a company now updates the identity and map context from the same registry object. This reduces stale-branding risk and removes the duplicated company object that previously lived inside the component.

## Important constraints

1. Do not reintroduce company identity literals into React components.
2. Add new companies first to `config/companies.json`, then add an authoritative logo import to `logoByTicker` only when the asset exists.
3. Do not infer or fabricate exposure keys, route keys, basins, or coordinates.
4. Empty geographic arrays are intentional and must remain visible as missing-data states.
5. Keep `config/companies.json` as the controlling identity source.
6. The JSON logo path remains useful for audits and future asset validation even though runtime image resolution uses static imports.

## Recommended next implementation pass

1. Run `npm install`.
2. Run `npm run typecheck` and `npm run build`.
3. Fix only concrete type/build failures.
4. Add a small registry validation test that checks:
   - every display-order ticker exists
   - every enabled company has a runtime logo
   - only one default company is selected
   - selector labels are unique
   - no unknown ticker reaches `getCompany`
5. Then implement keyboard focus trapping and Escape-to-close behavior for the drawer.

## Known temporary behavior

- Metric values still come from `fixtures/homepage-mock-data.json` through `lib/dashboard/homepage-data.ts`.
- The map remains schematic and explicitly labeled as a placeholder.
- AR remains the only comparison toggle in the starter UI.
- The source drawer still carries explanatory text rather than normalized source records.

Do not broaden these temporary behaviors until build validation passes.
