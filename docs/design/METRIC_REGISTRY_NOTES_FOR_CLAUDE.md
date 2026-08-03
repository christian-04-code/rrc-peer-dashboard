# Metric Registry — Implementation Notes for Claude

## Purpose

`config/metric-definitions.json` is the controlling metric vocabulary for the dashboard UI, adapters, charts, peer tables, tooltips, source drawers, and future intelligence rules.

Do not hard-code display labels, units, aliases, homepage eligibility, or peer-comparison behavior inside React components when the registry already provides them.

The registry defines the dashboard language. It does **not** authorize creating, estimating, inferring, or reconciling financial values.

---

## Read these files first

Before implementing metric-driven UI or adapters, read:

1. `docs/design/HOMEPAGE_VISUAL_AND_INTERACTION_SPEC.md`
2. `docs/design/COMPONENT_CONTRACTS.md`
3. `config/companies.json`
4. `config/company-logos.json`
5. `config/metric-definitions.json`
6. This file

---

## Non-negotiable data rules

### 1. Never invent historical values

If a source value is absent, render an empty, unavailable, or not-disclosed state. Do not estimate, interpolate, annualize, forecast backward, or silently backsolve historical periods.

### 2. Do not silently merge unlike definitions

Some aliases are intentionally grouped for discovery, but they may not be economically identical.

Examples:

- Adjusted EBITDAX versus Adjusted EBITDA
- Gross wells versus net wells
- Completed wells versus TILs
- Total CapEx versus D&C capital
- Pre-tax FCF versus after-tax FCF
- EV/EBITDA versus EV/EBITDAX
- Company-reported leverage versus a provider-calculated leverage ratio

When definitions differ:

- retain the original source label;
- retain definition metadata;
- flag comparability as conditional;
- show the distinction in the source drawer or tooltip;
- do not collapse the values into a clean peer ranking unless the basis is truly comparable.

### 3. Every displayed number requires provenance

Every metric value passed to the UI should carry source metadata sufficient for the source dot and source drawer.

Minimum expected fields:

```ts
interface MetricSource {
  sourceFile: string;
  sourceType: "10-K" | "10-Q" | "8-K" | "earnings-release" | "supplement" | "presentation" | "consensus" | "market-api" | "other";
  sourceDate?: string;
  page?: number | null;
  url?: string | null;
  confidence: "verified" | "conflict" | "unverified";
  originalLabel?: string;
  definitionNote?: string;
}
```

### 4. Preserve period basis

Do not confuse:

- quarterly values with year-to-date values;
- period averages with period-end values;
- annual guidance with quarterly actuals;
- current-year consensus with next-year consensus;
- latest market values with reporting-period values.

The `aggregation` field in the registry is a UI and adapter hint, not permission to derive missing values.

---

## Canonical metric keys

Use registry keys such as:

```ts
"TOTAL_PRODUCTION"
"ADJUSTED_EBITDAX"
"FREE_CASH_FLOW"
"CAPITAL_EXPENDITURES"
"NET_DEBT"
"EV_TO_EBITDAX"
```

Do not pass arbitrary source labels through the component tree as the metric identifier.

Preferred pattern:

```ts
type MetricKey = keyof typeof metricDefinitions.metrics;
```

Source labels should be normalized by an adapter, while the original label remains attached to the source record.

---

## Recommended normalized value contract

```ts
interface DashboardMetricValue {
  companyTicker: string;
  metricKey: MetricKey;
  period: string;
  periodType: "quarter" | "year" | "latest";
  dataType: "actual" | "guidance" | "consensus" | "market";
  value: number | null;
  rangeLow?: number | null;
  rangeHigh?: number | null;
  displayValue?: string;
  source: MetricSource;
}
```

For guidance ranges, preserve `rangeLow` and `rangeHigh`. Do not replace the range with the midpoint unless the UI explicitly offers a midpoint view and labels it as calculated.

---

## Alias resolution strategy

Use a deterministic resolver.

Suggested order:

1. exact canonical key match;
2. exact case-insensitive alias match;
3. normalized punctuation and whitespace alias match;
4. explicit company-specific mapping table;
5. unresolved state.

Do not use loose semantic matching in production without an audit trail. For example, `Capital` alone should not automatically become `CAPITAL_EXPENDITURES` unless the source context confirms the meaning.

Suggested resolver result:

```ts
interface MetricResolution {
  metricKey: MetricKey | null;
  confidence: "exact" | "mapped" | "unresolved";
  originalLabel: string;
  warning?: string;
}
```

Unresolved labels should go to a review queue or conflict log rather than being silently assigned.

---

## Component usage

### CompanyHero and metric strip

Use metrics where:

```ts
metric.ui.homepage === true
```

The final homepage subset may be further constrained by a page-level configuration, but components must not independently invent labels or units.

### Main chart

Only allow metrics where:

```ts
metric.ui.chartable === true
```

Chart titles should use `displayName`; compact tabs should use `shortLabel`.

### Peer comparison

Respect:

- `true`: generally comparable;
- `false`: do not rank across peers;
- `"conditional"`: compare only when definitions and periods match, and display a comparability warning.

### Map tooltips

Only expose metrics where:

```ts
metric.ui.mapTooltip === true
```

A metric being eligible for a map tooltip does not mean geographic data exists. Do not invent coordinates, basin boundaries, routes, or company exposure.

### Source dot

Every production UI path must respect:

```ts
metric.ui.sourceRequired === true
```

If source metadata is missing, render the metric as unverified or withhold it according to the page’s data-quality policy.

---

## Formatting rules

Create one centralized formatter rather than formatting within components.

Suggested API:

```ts
formatMetricValue(metricKey, value, options)
```

Formatter responsibilities:

- currency symbols;
- millions and billions display;
- percentage signs;
- `x` suffix for multiples;
- unit labels;
- ranges;
- negative values and parenthetical formatting where appropriate;
- unavailable states.

Do not change the underlying numerical value for presentation convenience.

Examples:

- `650` with `USD millions` → `$650MM`
- range `650–700` → `$650–$700MM`
- `0.5` with `x` → `0.5x`
- null → `Not disclosed` or `—`, based on context

---

## Guidance handling

Guidance records should preserve:

- prior range;
- current range;
- effective date;
- status such as raised, lowered, narrowed, widened, or reaffirmed;
- exact company wording;
- source citation;
- whether the apparent change is favorable or unfavorable.

Do not infer that a numerically lower value is always negative. Lower operating-cost guidance may be favorable, while lower production guidance may be unfavorable.

The intelligence layer should use metric-aware rules rather than a generic up/down rule.

---

## Homepage interaction expectations

When a user selects a metric:

1. update the active metric key;
2. update the central chart title and unit;
3. load actual, guidance, consensus, or market series only when allowed by `supports`;
4. update peer overlays using the comparability rule;
5. refresh insights derived from the same metric key;
6. retain source metadata for every visible datapoint;
7. update URL state where applicable.

Never leave a chart title, axis unit, tooltip, or insight from the previously selected metric.

---

## Required implementation helpers

Claude should create equivalents of:

```ts
getMetricDefinition(metricKey)
resolveMetricAlias(sourceLabel, companyTicker?)
formatMetricValue(metricKey, value, options?)
canCompareMetric(metricKey, records)
getHomepageMetrics()
getChartableMetrics()
```

Keep these functions outside presentation components.

---

## Tests to add

At minimum:

1. Every metric key is unique.
2. Every alias resolves deterministically or remains unresolved.
3. Every homepage metric is chartable or intentionally documented otherwise.
4. Every source-required metric rejects or flags source-less records.
5. Total CapEx is not replaced by D&C capital.
6. Completed wells are not mapped to TILs.
7. Gross and net well counts do not rank together without a warning.
8. Guidance ranges retain low and high values.
9. Switching metrics updates title, units, tooltips, and source context.
10. Conditional metrics show a comparability warning.

---

## Stop conditions

Pause implementation and flag the issue when:

- a source label could map to more than one canonical metric;
- a unit conflicts with the registry;
- a company reports a materially different definition;
- a value lacks source metadata;
- a peer ranking would combine non-comparable definitions;
- a historical value appears to require estimation or unsupported derivation.

Do not solve these situations by guessing.

---

## Future extension

New metrics must be added through the registry first. Each addition should include:

- canonical key;
- labels;
- category;
- unit;
- value type;
- aggregation basis;
- aliases;
- supported data types;
- UI eligibility;
- definition warning where needed.

The next logical implementation layer after this registry is the normalized dashboard data model and adapter specification.
