# Dashboard Data Model

## Purpose

This document defines the normalized data contract between raw repository files and the dashboard UI.

The required pipeline is:

```text
Raw repository files
→ source-specific adapters
→ normalized dashboard records
→ selectors / derived calculations
→ components
```

UI components must not parse CSV, spreadsheet, filing, guidance, consensus, or market-response formats directly.

---

## Core principles

1. Preserve source meaning exactly.
2. Never estimate missing historical values.
3. Keep actuals, guidance, consensus, and market data distinct.
4. Preserve ranges as ranges.
5. Keep source metadata attached to every displayed value.
6. Do not silently reconcile conflicting values.
7. Do not mix standalone-quarter values with YTD values.
8. Do not treat operational synonyms as equivalent unless confirmed by the metric registry.
9. Keep raw numeric values separate from formatted display strings.
10. Components consume normalized selectors, not raw source rows.

---

## Canonical enums

```ts
export type DataType =
  | "actual"
  | "guidance"
  | "consensus"
  | "market"
  | "derived";

export type PeriodType =
  | "instant"
  | "quarter"
  | "year"
  | "date-range"
  | "live";

export type ConfidenceStatus =
  | "verified"
  | "conflict"
  | "unverified"
  | "not-applicable";

export type ValueShape =
  | "point"
  | "range"
  | "text"
  | "boolean";

export type SourceType =
  | "10-K"
  | "10-Q"
  | "8-K"
  | "earnings-release"
  | "investor-presentation"
  | "earnings-call"
  | "company-guidance"
  | "consensus-provider"
  | "market-api"
  | "calculation"
  | "other";
```

---

## Base source reference

Every normalized record must include source metadata.

```ts
export type SourceReference = {
  sourceId: string;
  sourceType: SourceType;
  sourceTitle: string;
  sourceFile?: string;
  sourceUrl?: string;
  sourceDate?: string;
  filedAt?: string;
  page?: number;
  section?: string;
  excerpt?: string;
  provider?: string;
  retrievedAt?: string;
  notes?: string[];
};
```

Rules:

- `sourceId` must be stable and unique.
- `page` is optional because not every source is paginated.
- Do not fabricate page numbers.
- `excerpt` should remain short and source-faithful.
- A displayed number may have multiple supporting sources.

---

## Canonical period

```ts
export type DashboardPeriod = {
  periodType: PeriodType;
  fiscalYear?: number;
  fiscalQuarter?: 1 | 2 | 3 | 4;
  periodLabel: string;
  startDate?: string;
  endDate?: string;
  asOfDate?: string;
  isYtd?: boolean;
  isLtm?: boolean;
  isEstimate?: boolean;
};
```

Examples:

```ts
{
  periodType: "quarter",
  fiscalYear: 2026,
  fiscalQuarter: 1,
  periodLabel: "Q1 2026",
  isYtd: false,
  isEstimate: false
}
```

```ts
{
  periodType: "year",
  fiscalYear: 2026,
  periodLabel: "FY 2026",
  isEstimate: true
}
```

Rules:

- Standalone quarterly values use `isYtd: false`.
- YTD values must remain explicitly flagged.
- Never convert YTD to standalone quarter unless the calculation is mathematically exact and documented.
- Q4 derived from full year less Q1–Q3 must use `dataType: "derived"` and include calculation lineage.

---

## Canonical dashboard record

```ts
export type DashboardDataPoint = {
  id: string;
  companyTicker: string;
  metricKey: string;
  dataType: DataType;
  valueShape: ValueShape;
  period: DashboardPeriod;

  value: number | null;
  lowValue?: number | null;
  highValue?: number | null;
  textValue?: string | null;
  booleanValue?: boolean | null;

  unit: string;
  currency?: string;
  scale?: "unit" | "thousand" | "million" | "billion";
  denominator?: string;

  displayValue?: string;
  confidence: ConfidenceStatus;
  sourceRefs: SourceReference[];

  isCompanyReported: boolean;
  isCalculated: boolean;
  isComparableAcrossPeers: boolean;
  comparisonWarnings?: string[];
  notes?: string[];

  createdAt?: string;
  updatedAt?: string;
};
```

Required fields:

- `id`
- `companyTicker`
- `metricKey`
- `dataType`
- `valueShape`
- `period`
- `unit`
- `confidence`
- `sourceRefs`
- `isCompanyReported`
- `isCalculated`
- `isComparableAcrossPeers`

---

## Point-value record

Use for actuals, consensus points, market values, and calculated values.

```ts
const exampleActual: DashboardDataPoint = {
  id: "RRC_TOTAL_PRODUCTION_2026_Q1_ACTUAL",
  companyTicker: "RRC",
  metricKey: "TOTAL_PRODUCTION",
  dataType: "actual",
  valueShape: "point",
  period: {
    periodType: "quarter",
    fiscalYear: 2026,
    fiscalQuarter: 1,
    periodLabel: "Q1 2026",
    isYtd: false,
    isEstimate: false
  },
  value: 2240,
  unit: "Mmcfe/d",
  displayValue: "2.24 Bcfe/d",
  confidence: "verified",
  sourceRefs: [],
  isCompanyReported: true,
  isCalculated: false,
  isComparableAcrossPeers: true
};
```

The example value above is illustrative only. Claude must replace examples with repository-supported records during implementation.

---

## Guidance range record

Guidance must preserve the original range.

```ts
export type GuidanceDataPoint = DashboardDataPoint & {
  dataType: "guidance";
  valueShape: "range" | "point" | "text";
  guidanceStatus?:
    | "initiated"
    | "raised"
    | "lowered"
    | "reaffirmed"
    | "narrowed"
    | "widened"
    | "withdrawn"
    | "updated"
    | "unknown";
  priorRecordId?: string;
  guidanceEffectiveDate?: string;
  assumptions?: string[];
};
```

Example:

```ts
const rangeCapitalGuidance: GuidanceDataPoint = {
  id: "RRC_TOTAL_CAPEX_2026_GUIDANCE_CURRENT",
  companyTicker: "RRC",
  metricKey: "TOTAL_CAPEX",
  dataType: "guidance",
  valueShape: "range",
  period: {
    periodType: "year",
    fiscalYear: 2026,
    periodLabel: "FY 2026",
    isEstimate: true
  },
  value: null,
  lowValue: 650,
  highValue: 700,
  unit: "USD million",
  scale: "million",
  displayValue: "$650–$700MM",
  confidence: "verified",
  sourceRefs: [],
  isCompanyReported: true,
  isCalculated: false,
  isComparableAcrossPeers: true,
  guidanceStatus: "reaffirmed"
};
```

Do not replace the range with a midpoint in storage.

A midpoint may be derived for chart positioning only when:

- the UI clearly identifies it as calculated,
- the original range remains visible,
- the calculation record links back to the range record.

---

## Consensus record

```ts
export type ConsensusDataPoint = DashboardDataPoint & {
  dataType: "consensus";
  provider: string;
  analystCount?: number;
  estimateDate: string;
  estimateVersion?: string;
};
```

Rules:

- Preserve provider and estimate date.
- Do not blend estimates from different providers unless explicitly designed.
- Consensus revisions require separate snapshots over time.
- Never present an old estimate snapshot as current.

---

## Market quote record

```ts
export type MarketQuote = {
  id: string;
  symbol: string;
  instrumentType:
    | "equity"
    | "commodity"
    | "index"
    | "basis"
    | "other";
  name: string;
  value: number | null;
  unit: string;
  currency?: string;
  absoluteChange?: number | null;
  percentChange?: number | null;
  previousClose?: number | null;
  sessionHigh?: number | null;
  sessionLow?: number | null;
  marketTimestamp?: string;
  retrievedAt: string;
  provider: string;
  status: "live" | "delayed" | "stale" | "offline";
  sourceRefs: SourceReference[];
};
```

Rules:

- API refresh animations must not alter stored historical records.
- `marketTimestamp` and `retrievedAt` are distinct.
- Stale thresholds depend on instrument type and market hours.
- Never label simulated data as live.

---

## Derived calculation record

```ts
export type CalculationLineage = {
  formula: string;
  inputRecordIds: string[];
  calculationDate: string;
  methodologyNotes?: string[];
};

export type DerivedDataPoint = DashboardDataPoint & {
  dataType: "derived";
  isCalculated: true;
  lineage: CalculationLineage;
};
```

Examples:

- Net debt = debt less cash
- FCF yield = free cash flow divided by market capitalization
- Enterprise value = market capitalization plus net debt and other adjustments
- Q4 standalone = full-year value less Q1, Q2, and Q3 when exact

Every derived value must expose its formula and inputs in the source drawer.

---

## Conflict model

```ts
export type DataConflict = {
  conflictId: string;
  companyTicker: string;
  metricKey: string;
  period: DashboardPeriod;
  recordIds: string[];
  conflictType:
    | "value-mismatch"
    | "unit-mismatch"
    | "definition-mismatch"
    | "period-mismatch"
    | "source-priority"
    | "other";
  status: "open" | "resolved" | "accepted";
  selectedRecordId?: string;
  resolutionNotes?: string[];
  resolvedAt?: string;
};
```

Rules:

- Do not overwrite conflicting records.
- Store each source-derived record independently.
- Use the conflict object to explain the disagreement.
- The UI may choose a display record only when source-priority rules support it.
- Records involved in unresolved conflicts use `confidence: "conflict"`.

---

## Missing-data behavior

Missing information must be represented by absence or `null`, not zero.

Correct:

```ts
value: null
```

Incorrect:

```ts
value: 0
```

unless the source explicitly reported zero.

UI display rules:

- Missing: `—`
- Not applicable: `N/A`
- Not disclosed: `Not disclosed`
- Conflict: display selected value with a conflict indicator
- Stale market data: display value with delayed/stale label

---

## Source-specific adapters

Recommended adapter structure:

```text
src/data/adapters/
  historical-adapter.ts
  guidance-adapter.ts
  consensus-adapter.ts
  market-adapter.ts
  conflict-adapter.ts
```

Each adapter must:

1. Read one source format.
2. Resolve source labels through `config/metric-definitions.json`.
3. Resolve company identity through `config/companies.json`.
4. Validate units and period basis.
5. Produce normalized records.
6. Attach source metadata.
7. Emit warnings for unresolved fields.
8. Never write directly to UI state.

---

## Normalized store

Recommended normalized store:

```ts
export type DashboardStore = {
  recordsById: Record<string, DashboardDataPoint>;
  recordIdsByCompany: Record<string, string[]>;
  recordIdsByMetric: Record<string, string[]>;
  conflictsById: Record<string, DataConflict>;
  marketQuotesBySymbol: Record<string, MarketQuote>;
  adapterWarnings: AdapterWarning[];
};

export type AdapterWarning = {
  warningId: string;
  sourceFile: string;
  row?: number;
  field?: string;
  rawValue?: string;
  reason: string;
  severity: "info" | "warning" | "blocking";
};
```

---

## Required selectors

Components should use selectors such as:

```ts
getCompanyMetricSeries({
  companyTicker,
  metricKey,
  dataTypes,
  periodType
});

getLatestCompanyMetric({
  companyTicker,
  metricKey,
  preferredDataTypes
});

getPeerSnapshot({
  companyTickers,
  metricKey,
  period
});

getCurrentGuidance({
  companyTicker,
  metricKey
});

getGuidanceHistory({
  companyTicker,
  metricKey
});

getSourceDetails(recordId);

getConflictsForRecord(recordId);
```

Selectors own:

- filtering,
- sorting,
- source-priority decisions,
- display-record selection,
- chart-series construction,
- peer comparison warnings.

Components must not own these decisions.

---

## Source-priority behavior

Source priority must be explicit and metric-aware.

General default:

```text
Company filing / earnings release
→ company presentation or call
→ consensus provider
→ derived calculation
→ other source
```

This is not universal.

Examples:

- Company-reported guidance should outrank third-party restatements.
- Market price must come from the selected market provider.
- Consensus must retain the provider’s snapshot.
- Actual financial results should use the controlling filing or reported release.

When sources disagree, do not silently apply the default. Create or reference a conflict record.

---

## Actual, guidance, and consensus display rules

### Actuals

- Solid chart line or point.
- Never display estimates as actuals.
- Standalone quarter required for quarterly views.

### Guidance

- Range band when low and high values exist.
- Dashed or clearly differentiated treatment for point guidance.
- Preserve effective date and status.

### Consensus

- Dotted or secondary line.
- Include estimate date and provider in tooltip.
- Do not connect consensus snapshots across incompatible forecast periods.

### Market

- Live ribbon and market context only.
- Timestamp and provider always available.
- Delayed and simulated states visually explicit.

---

## Chart-series contract

```ts
export type ChartSeries = {
  id: string;
  label: string;
  companyTicker?: string;
  metricKey: string;
  dataType: DataType;
  unit: string;
  points: Array<{
    x: string;
    y: number | null;
    low?: number | null;
    high?: number | null;
    recordId: string;
  }>;
  warnings?: string[];
};
```

A chart point must always retain `recordId` so clicking it can open its source drawer.

---

## Map data contract boundary

The financial data model should reference map entities by stable keys, not coordinates.

```ts
export type CompanyMapExposure = {
  companyTicker: string;
  basinKeys: string[];
  routeKeys: string[];
  terminalKeys: string[];
  demandCenterKeys: string[];
  sourceRefs: SourceReference[];
  confidence: ConfidenceStatus;
};
```

Geographic coordinates and shapes belong in a separate authoritative map dataset.

Do not invent basin boundaries, pipeline paths, terminal locations, or acreage polygons.

---

## Validation requirements

Adapters and normalized records must validate:

- known company ticker,
- known metric key,
- allowed data type for metric,
- expected unit,
- valid fiscal quarter,
- YTD versus standalone-quarter status,
- point versus range consistency,
- source presence,
- unique record ID,
- nonzero value not inferred from missing data,
- comparison eligibility.

Blocking errors must stop affected records from reaching production selectors.

---

## Recommended implementation order

1. Create TypeScript types from this document.
2. Add JSON schema or runtime validation.
3. Build company and metric registry loaders.
4. Build historical adapter.
5. Build guidance adapter.
6. Build conflict adapter.
7. Build consensus adapter.
8. Build market adapter.
9. Build selectors.
10. Connect fixtures to components.
11. Replace fixtures incrementally with normalized data.
12. Add source-drawer integration.

---

## Definition of done

The data layer is complete when:

- all UI-facing records use canonical company tickers and metric keys,
- components do not parse raw repository files,
- every displayed value retains source metadata,
- guidance ranges remain ranges,
- missing values do not become zeros,
- unresolved conflicts remain visible,
- quarterly and annual periods are not mixed,
- actuals, guidance, consensus, market, and derived values remain distinct,
- company switching returns a complete new selector result without stale prior-company data,
- chart points and metric values can open source details by `recordId`.
