# Notes for Claude — Dashboard Data Model

## What has been added

A normalized dashboard data model now exists at:

```text
docs/data/DASHBOARD_DATA_MODEL.md
```

This file is the controlling contract for how raw repository data must move into the dashboard.

It defines:

- canonical data types,
- period handling,
- source metadata,
- point values,
- guidance ranges,
- consensus records,
- market quotes,
- derived calculations,
- conflict records,
- missing-data behavior,
- adapters,
- normalized storage,
- selectors,
- chart-series records,
- map-exposure boundaries,
- validation rules,
- implementation order.

---

## Read these files before implementing

Use the following order:

1. `docs/design/HOMEPAGE_VISUAL_AND_INTERACTION_SPEC.md`
2. `docs/design/COMPONENT_CONTRACTS.md`
3. `config/companies.json`
4. `docs/design/COMPANY_REGISTRY_USAGE.md`
5. `config/metric-definitions.json`
6. `docs/design/METRIC_REGISTRY_NOTES_FOR_CLAUDE.md`
7. `docs/data/DASHBOARD_DATA_MODEL.md`
8. This file

The design files define the product behavior.
The registries define valid company and metric identities.
The data-model file defines the bridge between raw source files and components.

---

## Core architectural rule

Do not let React components import and parse the raw CSV, JSON, spreadsheet, filing, consensus, or market files directly.

Required flow:

```text
raw source
→ adapter
→ normalized record
→ selector
→ component
```

A component should receive already-resolved values and source IDs.

Bad:

```ts
const rows = parseCsv(rawHistoricalCsv);
const rrcProduction = rows.find(...);
```

Good:

```ts
const series = getCompanyMetricSeries({
  companyTicker: "RRC",
  metricKey: "TOTAL_PRODUCTION",
  dataTypes: ["actual", "guidance"]
});
```

---

## Do not guess

Stop and surface a warning when any of the following are unclear:

- source label maps to multiple metric keys,
- unit does not match the metric registry,
- value may be YTD rather than standalone quarter,
- completed wells may be mistaken for TILs,
- total CapEx may be mistaken for D&C capital,
- gross wells may be mistaken for net wells,
- EBITDA may be mistaken for EBITDAX,
- a guidance range has unclear low/high values,
- a record lacks a reliable company ticker,
- two credible sources conflict.

Do not silently choose whichever value is easier to render.

---

## Immediate implementation targets

When coding begins, create these modules first:

```text
src/data/types.ts
src/data/registry/companies.ts
src/data/registry/metrics.ts
src/data/validation/validate-record.ts
src/data/adapters/historical-adapter.ts
src/data/adapters/guidance-adapter.ts
src/data/adapters/conflict-adapter.ts
src/data/selectors/company-metrics.ts
src/data/selectors/guidance.ts
src/data/selectors/sources.ts
```

Do not build every adapter at once.
Start with the historical and guidance files already present in the repository.

---

## Suggested TypeScript split

### `src/data/types.ts`

Implement the contracts from the data-model document:

- `DataType`
- `PeriodType`
- `ConfidenceStatus`
- `ValueShape`
- `SourceType`
- `SourceReference`
- `DashboardPeriod`
- `DashboardDataPoint`
- `GuidanceDataPoint`
- `ConsensusDataPoint`
- `MarketQuote`
- `CalculationLineage`
- `DerivedDataPoint`
- `DataConflict`
- `DashboardStore`
- `AdapterWarning`
- `ChartSeries`
- `CompanyMapExposure`

### Registry loaders

Registry loaders should:

- validate JSON once,
- expose typed lookups,
- reject unknown keys,
- avoid repeated file parsing,
- preserve selector order.

### Runtime validation

Static types are not sufficient because repository files are external data.
Use runtime validation before records enter the normalized store.

---

## Record ID convention

Use deterministic IDs.

Recommended pattern:

```text
{TICKER}_{METRIC_KEY}_{PERIOD}_{DATA_TYPE}_{VERSION}
```

Examples:

```text
RRC_TOTAL_PRODUCTION_2026_Q1_ACTUAL
RRC_TOTAL_CAPEX_2026_FY_GUIDANCE_CURRENT
AR_NET_DEBT_2025_Q4_ACTUAL
```

Do not use random UUIDs for primary financial records because stable IDs make source drawers, tests, and conflict tracking easier.

---

## Display formatting

Do not make `displayValue` the source of truth.

Store numeric values separately:

```ts
lowValue: 650,
highValue: 700,
unit: "USD million"
```

Then format at selector or presentation-helper level:

```text
$650–$700MM
```

This enables sorting, charting, calculations, and consistent unit conversion.

---

## Guidance implementation note

Current guidance must not overwrite prior guidance.

Each guidance update should remain a separate record linked through:

```ts
priorRecordId
```

This is required for:

- raised/lowered/reaffirmed status,
- guidance history,
- homepage alerts,
- source audit,
- revision charts.

---

## Conflict implementation note

The repository already contains a conflict log.

Do not resolve it by deleting one of the source values.

Instead:

1. Normalize both source records.
2. Create or ingest a `DataConflict` object.
3. Mark affected records as `confidence: "conflict"` while unresolved.
4. Let source-priority logic choose a display record only when justified.
5. Keep the conflict accessible in the source drawer.

---

## Company-switching safeguard

When the primary company changes, all selectors must rerun using the new ticker.

The following must update atomically:

- logo,
- company name,
- hero metrics,
- chart series,
- guidance,
- insight feed,
- map exposure,
- source details.

Do not cache a previous company’s values under generic keys such as `latestProduction`.
Use keys that include `companyTicker` and `metricKey`.

---

## Map safeguard

The financial data model only stores stable geographic entity keys.

Example:

```ts
basinKeys: ["APPALACHIA"]
```

It must not invent:

- coordinates,
- acreage polygons,
- pipeline geometry,
- LNG terminal locations,
- demand-center locations.

Those belong in a separate authoritative geographic dataset.

---

## Testing priorities

Add tests for these cases first:

1. Missing value remains `null`, not `0`.
2. Guidance range retains low and high values.
3. YTD value does not enter a standalone-quarter series.
4. Unknown metric alias generates a blocking warning.
5. Unknown ticker generates a blocking warning.
6. Total CapEx does not map to D&C capital.
7. Completed wells do not map to TILs.
8. Conflict preserves both source records.
9. Chart point retains its `recordId`.
10. Company switch returns no stale prior-company records.
11. Simulated quote cannot have status `live`.
12. Derived record contains formula and input IDs.

---

## Low-usage build strategy

To conserve Claude/Codex usage, work in narrow passes:

### Pass 1

- Add types.
- Add registry loaders.
- Add runtime record validation.
- No UI changes.

### Pass 2

- Build historical adapter.
- Normalize only a small sample of RRC and AR records.
- Add tests.

### Pass 3

- Build guidance adapter.
- Preserve current and prior guidance.
- Add tests.

### Pass 4

- Build selectors.
- Connect fixture-driven homepage components.

### Pass 5

- Expand company coverage.
- Add consensus and market adapters later.

Stop after each pass, report changed files, and validate before continuing.

---

## Definition of done for Claude’s first implementation pass

The first implementation pass is complete when:

- TypeScript contracts compile.
- Company and metric registries load through typed helpers.
- One historical adapter produces valid normalized records.
- One guidance adapter produces valid range records.
- Invalid records generate warnings rather than entering selectors.
- At least one selector returns an RRC chart series with source-linked record IDs.
- No React component parses a raw data file.
- Tests cover the critical integrity rules above.

Do not start API integration or map geometry during this first data-layer pass.
