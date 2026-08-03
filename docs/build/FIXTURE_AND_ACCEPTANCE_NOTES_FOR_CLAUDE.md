# Fixture and Acceptance Notes for Claude

## What was added

The homepage no longer owns all of its display data directly.

New files:
- `fixtures/homepage-mock-data.json`
- `lib/dashboard/homepage-data.ts`
- `docs/design/HOMEPAGE_ACCEPTANCE_TESTS.md`

Updated file:
- `components/HomeDashboard.tsx`

## Current architecture

`homepage-mock-data.json` is the temporary source for the current UI shell.

`lib/dashboard/homepage-data.ts` is the adapter boundary. React components should consume its typed selectors rather than importing the fixture directly.

`HomeDashboard.tsx` now consumes:
- `getHomepageMetrics`
- `marketRibbon`
- `activityMessages`
- `fixtureDisclaimer`

This is intentionally a small example of the larger architecture defined in `docs/data/DASHBOARD_DATA_MODEL.md`.

## Important data labeling

RRC production, FCF, and annual capital guidance are marked `supported` because they reflect the repository-supported project assumptions used in the design work.

RRC share price, leverage, and all market-ribbon quotes are marked `mock`.

Other company metrics are `null` at the fixture level and become explicit `pending` display states in the adapter. Do not populate those fields with estimates merely to make the UI look complete.

## What Claude should do next

1. Run the install, typecheck, and production build.
2. Fix only actual compiler or framework issues.
3. Add component tests for `getHomepageMetrics`:
   - RRC returns five records.
   - AR and every unsupported peer return five pending records.
   - Pending records display em dash and never zero.
4. Replace the temporary local company identity map in `HomeDashboard.tsx` with a typed adapter over `config/companies.json`.
5. Add ARIA selected/pressed state to selector, metric, comparison, and workspace controls.
6. Add Escape-key and focus-return behavior to the detail drawer.
7. Do not start live API integration until these acceptance tests pass.

## Known transitional duplication

Company identity currently exists in both:
- `config/companies.json`
- the temporary `companies` map in `components/HomeDashboard.tsx`

This duplication is deliberate only as a starter-shell bridge. Remove it by creating a typed company-registry adapter; do not delete the canonical JSON registry.

## Stop conditions

Stop and report rather than guessing when:
- a registry company has no verified logo asset;
- a metric alias maps to multiple canonical definitions;
- actual and guidance values cannot be separated;
- a peer value lacks a source or period basis;
- map exposure requires invented coordinates or boundaries.
