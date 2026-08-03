# Claude Startup Guide

## Mission
Build a clean, interactive RRC peer intelligence tool that feels alive without becoming another Excel workbook or FactSet clone.

The homepage must be simple at rest and deep on interaction. Use one central Chart / Map workspace, live-looking API activity, company switching, correct company logos, peer comparison, and source traceability.

## Read First
1. `docs/design/HOMEPAGE_VISUAL_AND_INTERACTION_SPEC.md`
2. `docs/design/COMPONENT_CONTRACTS.md`
3. `config/companies.json`
4. `config/company-logos.json`
5. `config/metric-definitions.json`
6. `docs/data/DASHBOARD_DATA_MODEL.md`
7. `docs/design/COMPANY_REGISTRY_USAGE.md`
8. `docs/design/METRIC_REGISTRY_NOTES_FOR_CLAUDE.md`
9. `docs/data/DATA_MODEL_NOTES_FOR_CLAUDE.md`

## Non-Negotiable Rules
- Never invent financial values.
- Never convert missing values to zero.
- Never merge actual, guidance, consensus, or market data silently.
- Never confuse total CapEx with D&C capital.
- Never confuse completed wells with TILs.
- Never hard-code company logos inside dashboard components.
- Selecting a company must update logo, name, metrics, chart, map, insights, and source context together.
- React components must not parse raw CSV, filing, consensus, or market files directly.
- Do not draw approximate geography. Use authoritative geometry when the map data layer is implemented.
- Preserve source metadata on every displayed datapoint.

## Current Build Status
A starter Next.js application shell is being added on branch `design/homepage-visual-spec`.

Initial implementation includes:
- responsive homepage shell
- animated market ribbon mock
- company selector
- company-aware hero and logo switching
- metric tabs
- Chart / Map workspace toggle
- mock API activity panel
- right-side source/detail drawer foundation

All live values in the starter UI are clearly mock data. Replace them only through normalized adapters defined in `docs/data/DASHBOARD_DATA_MODEL.md`.

## Build Order
1. Verify and run the starter shell.
2. Move or expose repository logo assets under a public path without changing logo mappings silently.
3. Replace local mock company data with `config/companies.json`.
4. Add centralized homepage state.
5. Build normalized selectors and fixtures.
6. Wire chart series to normalized records.
7. Implement authoritative geographic map layers.
8. Add source drawer and conflict states.
9. Integrate live APIs.
10. Add tests, accessibility checks, and polish.

## Usage Discipline
- Work in one narrow phase at a time.
- Touch only required files.
- Reuse existing structures and documentation.
- Commit after each completed phase.
- Run targeted checks before full builds.
- Stop and report ambiguity rather than guessing.
