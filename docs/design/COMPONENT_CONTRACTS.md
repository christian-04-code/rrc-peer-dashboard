# Homepage Component Contracts

## Purpose

This document converts the approved homepage vision into build-ready UI contracts for Claude or any future implementation agent.

The homepage must feel like a live investor intelligence tool, not an Excel workbook, static report, or generic SaaS dashboard.

Core rule:

> Simple at rest. Deep on interaction.

The contracts below define component responsibility, required props, emitted events, data states, loading behavior, source behavior, logo behavior, and acceptance conditions.

---

# 1. Shared Domain Types

```ts
export type Ticker =
  | "RRC"
  | "AR"
  | "CNX"
  | "CRK"
  | "CTRA"
  | "EQT"
  | "EXE"
  | "GPOR"
  | "MGY"
  | "MTDR"
  | "MUR"
  | "OVV"
  | "SM";

export type MetricKey =
  | "sharePrice"
  | "production"
  | "adjustedEbitdax"
  | "freeCashFlow"
  | "capitalExpenditures"
  | "netDebt"
  | "netLeverage"
  | "evEbitdax"
  | "fcfYield"
  | "wellsDrilled"
  | "tils"
  | "lateralFeet";

export type DataClassification =
  | "actual"
  | "guidance"
  | "consensus"
  | "market";

export type VerificationStatus =
  | "verified"
  | "conflict"
  | "unverified"
  | "notAvailable";

export type WorkspaceMode = "chart" | "map";
export type PeriodMode = "quarterly" | "annual";
export type DataViewMode =
  | "actual"
  | "actualAndConsensus"
  | "actualAndGuidance"
  | "all";

export interface CompanyProfile {
  ticker: Ticker;
  name: string;
  shortName: string;
  exchange?: string;
  description: string;
  logoPath: string;
  primaryBasin?: string;
  products?: string[];
  isEnabled: boolean;
}

export interface SourceReference {
  id: string;
  company: Ticker;
  sourceType:
    | "10-K"
    | "10-Q"
    | "8-K"
    | "earnings-release"
    | "supplement"
    | "investor-presentation"
    | "consensus"
    | "market-api"
    | "internal-calculation";
  title: string;
  filingDate?: string;
  page?: number | null;
  url?: string | null;
  filePath?: string | null;
  verificationStatus: VerificationStatus;
  note?: string | null;
}

export interface DisplayMetric {
  key: MetricKey;
  label: string;
  value: number | null;
  displayValue: string;
  unit?: string;
  context?: string;
  direction?: "up" | "down" | "flat" | null;
  rank?: number | null;
  peerCount?: number | null;
  classification: DataClassification;
  verificationStatus: VerificationStatus;
  source?: SourceReference | null;
}

export interface TimeSeriesPoint {
  period: string;
  value: number | null;
  displayValue?: string;
  classification: DataClassification;
  source?: SourceReference | null;
}

export interface CompanySeries {
  ticker: Ticker;
  label: string;
  points: TimeSeriesPoint[];
}
```

---

# 2. Homepage State Contract

One parent container owns homepage state. Child components must not maintain conflicting copies of selected company, active metric, active comparisons, or workspace mode.

```ts
export interface HomepageState {
  primaryCompany: Ticker;
  comparisonCompanies: Ticker[];
  activeMetric: MetricKey;
  workspaceMode: WorkspaceMode;
  periodMode: PeriodMode;
  dataViewMode: DataViewMode;
  selectedMapLayers: MapLayerKey[];
  activeDrawer: DrawerState | null;
  selectedMapEntityId: string | null;
}
```

## State rules

1. Exactly one primary company must always be selected.
2. The primary company may not also appear in `comparisonCompanies`.
3. Comparison companies should be limited to four on the homepage.
4. Company selection updates the hero, logo, metrics, chart, map, insights, and source context in one state transition.
5. Switching from chart to map must preserve primary company and comparison company selections.
6. Opening a drawer must not reset chart or map state.
7. State should be URL-addressable when practical.

Recommended URL shape:

```text
/?company=RRC&metric=production&view=chart&period=quarterly&compare=AR,EQT
```

---

# 3. `HomepageShell`

## Responsibility

Own the homepage composition and canonical state. Coordinate all child components. Prevent stale company branding or partial UI updates.

## Required props

```ts
export interface HomepageShellProps {
  companies: CompanyProfile[];
  initialState: HomepageState;
  marketItems: MarketRibbonItem[];
  companyMetrics: Record<Ticker, DisplayMetric[]>;
  chartSeries: Record<Ticker, Partial<Record<MetricKey, CompanySeries>>>;
  mapData: InteractiveMapData;
  insights: Record<Ticker, InsightItem[]>;
  dataFeeds: DataFeedStatus[];
}
```

## Required behavior

- Render header, live market ribbon, company hero, metric strip, company selector, chart/map workspace, insight feed, and data activity surface.
- Own all selection callbacks.
- Replace company context atomically.
- Preserve selected metric when switching companies when that metric exists for the new company.
- Fall back to `production` when the selected metric is unavailable.
- Never silently substitute another company's values.

## Failure behavior

If a company has incomplete data:

- Keep the company selected.
- Show unavailable states for missing metrics.
- Do not reuse values from the previously selected company.
- Surface missing-data status in the source drawer or tooltip.

---

# 4. `AppHeader`

## Responsibility

Provide primary navigation and a compact live-data status trigger.

## Props

```ts
export interface AppHeaderProps {
  activeRoute: "overview" | "peers" | "guidance" | "sources";
  feedHealth: "healthy" | "partial" | "offline" | "refreshing";
  activeFeedCount: number;
  lastRefreshLabel: string;
  onOpenDataActivity: () => void;
}
```

## Interaction contract

- Clicking the data-status control opens `DataActivityDrawer`.
- Status control must show both color and text; never rely only on color.
- Refreshing state may animate subtly.
- Header must remain visually compact.

## Visual rule

Do not add a global search bar to the homepage unless separately approved.

---

# 5. `LiveMarketRibbon`

## Responsibility

Make the page feel alive through live or simulated market movement while remaining calm and readable.

## Types

```ts
export interface MarketRibbonItem {
  id: string;
  label: string;
  value: number | null;
  displayValue: string;
  absoluteChange?: number | null;
  percentChange?: number | null;
  direction: "up" | "down" | "flat";
  sourceLabel: string;
  updatedAt: string;
  isDelayed: boolean;
  marketContextMetric?: MetricKey | null;
}

export interface LiveMarketRibbonProps {
  items: MarketRibbonItem[];
  onSelectItem: (item: MarketRibbonItem) => void;
}
```

## Default items

- Henry Hub natural gas
- WTI crude oil
- RRC share price
- NGL benchmark or company-relevant NGL realization marker
- Appalachian basis differential

## Interaction contract

### Hover

Show:

- current value
- absolute change
- percentage change
- latest update time
- source label
- delayed status when applicable

### Click

Open market context or switch the primary workspace to relevant market context without losing company selection.

### Update animation

- Use a 300–500 ms restrained flash or transition.
- Upward movement may use a muted positive tint.
- Downward movement may use a muted negative tint.
- Do not bounce, blink continuously, or flash aggressively.

### Delayed state

Clearly label delayed data.

```text
Delayed · 14m
```

---

# 6. `CompanyHero`

## Responsibility

Display the active company identity and ensure correct logo switching.

## Props

```ts
export interface CompanyHeroProps {
  company: CompanyProfile;
  metrics: DisplayMetric[];
  updatedAtLabel: string;
  isLoading: boolean;
  onMetricSelect: (metric: MetricKey) => void;
  activeMetric: MetricKey;
}
```

## Logo contract

The displayed image source must always come from the selected company registry entry.

```ts
<img
  src={company.logoPath}
  alt={`${company.name} logo`}
/>
```

Required examples:

- RRC selected → `assets/logos/RRC.png`
- AR selected → `assets/logos/AR.png`
- CNX selected → `assets/logos/CNX.png`
- CRK selected → `assets/logos/CRK.png`
- EQT selected → `assets/logos/EQT.png`
- EXE selected → `assets/logos/EXE.png`
- GPOR selected → `assets/logos/GPOR.svg`

The repository's centralized logo mapping remains the controlling source for actual paths.

## Critical acceptance rule

When company selection changes:

- logo changes immediately
- company name changes immediately
- company description changes immediately
- company metrics change immediately
- stale logo from the prior company may never remain visible

## Missing-logo fallback

If a logo file cannot load:

- render a ticker-based fallback badge
- preserve company name and context
- log the missing asset in development
- never substitute another company's logo

---

# 7. `MetricStrip`

## Responsibility

Show a small number of important active-company metrics and act as a navigation control for the main workspace.

## Props

```ts
export interface MetricStripProps {
  metrics: DisplayMetric[];
  activeMetric: MetricKey;
  onSelectMetric: (metric: MetricKey) => void;
  onOpenSource: (source: SourceReference) => void;
}
```

## Homepage target

Display approximately five metrics at once.

Recommended RRC defaults:

- Share price
- Production or production target
- Free cash flow
- Capital expenditures
- Net leverage or EV/EBITDAX

## Interaction contract

### Hover

- reveal action text such as `View trend →`
- slightly strengthen border or elevation
- show source dot tooltip when a source exists

### Click

- set `activeMetric`
- update chart or map context
- update contextual insights
- preserve selected company

### Source dot

A small source indicator should be available beside sourced values.

Hover or click exposes:

- source title
- source type
- page if available
- verification status
- last update

## Missing values

Render `Not disclosed` or `Unavailable`, not zero.

---

# 8. `CompanySelector`

## Responsibility

Switch the active company and manage optional peer overlays.

## Props

```ts
export interface CompanySelectorProps {
  companies: CompanyProfile[];
  primaryCompany: Ticker;
  comparisonCompanies: Ticker[];
  maxComparisons?: number;
  onSelectPrimary: (ticker: Ticker) => void;
  onToggleComparison: (ticker: Ticker) => void;
}
```

## Visual contract

Each selectable company should show:

- company logo when space permits
- ticker
- selected state

The logo must use the same registry path used by `CompanyHero`.

## Selection behavior

### Primary selection

Clicking a company chip as primary must update the entire dashboard context.

### Comparison selection

Comparison companies overlay the chart and may optionally appear as secondary map layers.

### Limits

- maximum four comparison companies on homepage
- disabled state once maximum is reached
- clear message explaining the limit

## Keyboard behavior

- all chips must be native buttons
- selection state must be exposed with `aria-pressed`
- focus indicator must remain visible

---

# 9. `ChartMapWorkspace`

## Responsibility

Provide one main analytical workspace with a mode toggle instead of stacking multiple dense visualizations.

## Props

```ts
export interface ChartMapWorkspaceProps {
  mode: WorkspaceMode;
  activeMetric: MetricKey;
  primaryCompany: CompanyProfile;
  comparisonCompanies: CompanyProfile[];
  periodMode: PeriodMode;
  dataViewMode: DataViewMode;
  chartSeries: CompanySeries[];
  mapData: InteractiveMapData;
  selectedMapLayers: MapLayerKey[];
  onModeChange: (mode: WorkspaceMode) => void;
  onPeriodModeChange: (mode: PeriodMode) => void;
  onDataViewModeChange: (mode: DataViewMode) => void;
  onMapLayerChange: (layers: MapLayerKey[]) => void;
  onOpenSource: (source: SourceReference) => void;
  onOpenMapEntity: (entity: MapEntity) => void;
}
```

## Required toggle

```text
Chart View | Map View
```

Switching modes must not reset:

- primary company
- comparison companies
- active metric
- period selection

## Layout rule

Only one primary analytical workspace appears at a time on the homepage.

---

# 10. `InteractiveMetricChart`

## Responsibility

Render one flexible chart that changes metric, company, comparison, period, and data classification.

## Props

```ts
export interface InteractiveMetricChartProps {
  metric: MetricKey;
  primarySeries: CompanySeries;
  comparisonSeries: CompanySeries[];
  periodMode: PeriodMode;
  dataViewMode: DataViewMode;
  onPointSelect: (point: TimeSeriesPoint, ticker: Ticker) => void;
  onSeriesToggle: (ticker: Ticker) => void;
}
```

## Visual rules

- Primary company uses the strongest visual treatment.
- Comparison companies use restrained secondary treatments.
- Actuals use solid lines or marks.
- Consensus uses dashed or dotted treatment.
- Guidance uses a shaded range or clearly distinct styling.
- RRC is not permanently hard-coded as primary; active selection controls emphasis.

## Interaction contract

### Hover

Show:

- company
- period
- exact value
- classification
- source status

### Click point

Open `SourceDrawer` for the specific point when a source exists.

### Legend

Legend items must be interactive and allow series visibility toggling.

### Empty state

If selected metric has no usable data:

```text
No verified data is available for this company and metric.
```

Do not fabricate a line.

---

# 11. `InteractiveMap`

## Responsibility

Turn geography into an analytical tool for basin exposure, routes, LNG access, demand centers, and company positioning.

## Types

```ts
export type MapLayerKey =
  | "operatingBasins"
  | "companyExposure"
  | "pipelineRoutes"
  | "lngTerminals"
  | "nglExports"
  | "demandCenters";

export interface MapEntity {
  id: string;
  type:
    | "basin"
    | "company-area"
    | "pipeline-route"
    | "lng-terminal"
    | "ngl-export-terminal"
    | "demand-center";
  label: string;
  companyTickers?: Ticker[];
  source?: SourceReference | null;
  metadata: Record<string, string | number | null>;
}

export interface InteractiveMapData {
  entities: MapEntity[];
  geographySource: string;
  coverageNote?: string;
}

export interface InteractiveMapProps {
  primaryCompany: CompanyProfile;
  comparisonCompanies: CompanyProfile[];
  data: InteractiveMapData;
  activeLayers: MapLayerKey[];
  onLayerChange: (layers: MapLayerKey[]) => void;
  onEntitySelect: (entity: MapEntity) => void;
}
```

## Required layers

- Operating basins
- Company exposure
- Pipeline routes
- LNG terminals
- NGL export routes or terminals
- Demand centers

## Selected-company behavior

Selecting a company must change map emphasis.

For RRC, the map should support highlighting:

- Appalachian operating exposure
- Midwest market access
- Gulf Coast access
- LNG-linked markets
- local and Northeast markets
- NGL export pathways

## Interaction contract

### Hover basin or route

Show a compact tooltip with relevant company and market information.

### Click basin, route, terminal, or demand center

Open the right-side detail drawer.

### Flow animation

- restrained directional movement may be used on active routes
- animation must stop or simplify under reduced-motion preferences
- do not animate every route simultaneously

## Geographic integrity requirement

Use authoritative geographic data.

Do not:

- hand-draw state or basin boundaries
- invent coordinates
- approximate pipeline routes as factual
- display unsupported company acreage polygons

If authoritative geometry is not yet available, render a clearly labeled implementation placeholder rather than fake geography.

---

# 12. `InsightFeed`

## Responsibility

Translate data into a short list of investor-relevant conclusions.

## Types

```ts
export interface InsightItem {
  id: string;
  company: Ticker;
  category:
    | "guidance"
    | "valuation"
    | "operations"
    | "consensus"
    | "market"
    | "data-quality";
  headline: string;
  detail: string;
  severity: "positive" | "negative" | "neutral" | "warning";
  sourceIds: string[];
  actionLabel?: string;
}

export interface InsightFeedProps {
  items: InsightItem[];
  onSelectInsight: (item: InsightItem) => void;
}
```

## Content rule

Insights must be based on repository data, API data, or explicit calculations.

Do not generate unsupported statements that sound analytical but cannot be traced.

## Interaction contract

Clicking an insight should open either:

- supporting source details
- the relevant metric in the main chart
- relevant map context

## Homepage limit

Show approximately three to five insights at once.

---

# 13. `DataActivityPanel`

## Responsibility

Make the data system visibly active and improve user trust.

## Types

```ts
export interface DataFeedStatus {
  id: string;
  label: string;
  status: "updating" | "synced" | "complete" | "idle" | "delayed" | "error";
  lastUpdatedAt?: string | null;
  detail?: string | null;
}

export interface DataActivityPanelProps {
  feeds: DataFeedStatus[];
  recentEvents: DataActivityEvent[];
  onOpenFullActivity: () => void;
}

export interface DataActivityEvent {
  id: string;
  message: string;
  createdAt: string;
  severity: "info" | "success" | "warning" | "error";
}
```

## Example feeds

- Market prices
- SEC filing sync
- Consensus data
- Guidance parser
- Peer calculations
- Conflict validation

## Animation rule

Recent events may update or fade in subtly.

Do not simulate live activity in production unless it is clearly labeled as simulated or demo data.

---

# 14. `SourceDot`

## Responsibility

Provide compact traceability for every material number without cluttering the default view.

## Props

```ts
export interface SourceDotProps {
  source: SourceReference | null;
  verificationStatus: VerificationStatus;
  onOpen: (source: SourceReference) => void;
}
```

## Interaction contract

### Hover

Display:

- source title
- source type
- page
- verification status
- updated date

### Click

Open `SourceDrawer`.

## Missing source

If a number lacks a verified source:

- show unverified or unavailable state
- do not hide the issue
- do not label the number verified

---

# 15. `SourceDrawer`

## Responsibility

Show source details, metric context, and verification status without navigating away from the homepage.

## Props

```ts
export interface SourceDrawerProps {
  isOpen: boolean;
  source: SourceReference | null;
  metric?: DisplayMetric | null;
  onClose: () => void;
  onOpenDocument?: (source: SourceReference) => void;
}
```

## Required content

- company
- metric label
- metric value
- source title
- source type
- filing date
- page when available
- verification status
- notes
- document action when supported

## Behavior

- slide in from right
- preserve background state
- close by button and Escape key
- trap focus while open
- restore focus to the triggering element on close

---

# 16. `MapEntityDrawer`

## Responsibility

Display selected basin, route, terminal, or demand-center details.

## Props

```ts
export interface MapEntityDrawerProps {
  isOpen: boolean;
  entity: MapEntity | null;
  primaryCompany: CompanyProfile;
  onClose: () => void;
}
```

## Example basin content

```text
Marcellus / Utica
Active peers: RRC, AR, CNX, EQT, GPOR
Primary products: Natural gas and NGLs
Selected company: RRC
```

## Example route content

```text
Production Basin → Processing → Pipeline → End Market
```

Only include details supported by the map dataset and sources.

---

# 17. Loading, Error, and Transition Contracts

## Company transition

When primary company changes:

1. update selected chip state
2. begin a brief transition state
3. replace logo and identity
4. replace metrics
5. replace chart data
6. replace map emphasis
7. replace insights
8. clear stale drawer content if it belongs to prior company

All changes should occur within one coordinated render cycle where practical.

## Skeleton behavior

Use lightweight skeletons for:

- hero identity
- metric values
- chart area
- insight feed

Do not show the prior company's values underneath a new company's logo.

## Error behavior

Errors should be local whenever possible.

Examples:

- market feed error should not break historical charts
- one missing logo should not break company selection
- missing map geometry should not break chart mode

---

# 18. Responsive Contracts

## Desktop

- header in one row where space allows
- market ribbon horizontal
- five compact metrics
- company selector horizontal or wrapping
- chart/map workspace dominant
- insight and activity modules beside or below workspace

## Tablet

- metrics wrap into two or three columns
- chart/map remains full-width
- right-side modules stack below

## Mobile

- header condenses
- market ribbon uses horizontal scrolling
- metric strip becomes two-column or single-column
- company selector uses horizontally scrollable chips
- chart and map controls stack
- dense tables are not shown on homepage
- drawers may become full-screen sheets

---

# 19. Accessibility Contracts

- Use native buttons, selects, and links.
- Every logo needs useful alt text.
- Do not use color alone for status or direction.
- Preserve visible keyboard focus.
- Provide reduced-motion handling.
- Chart values must be available through tooltips and a text alternative.
- Map must include a concise text summary of visible layers and selected company exposure.
- Drawers must manage focus correctly.

---

# 20. Non-Goals

The homepage must not become:

- a complete financial statement grid
- an Excel replacement
- a full FactSet replica
- a page containing every available metric
- a wall of KPI cards
- a permanent multi-chart mosaic
- a decorative map with no analytical interaction

Detailed data belongs in drill-down pages or drawers.

---

# 21. Recommended Component Tree

```text
HomepageShell
├── AppHeader
│   └── LiveDataStatusButton
├── LiveMarketRibbon
│   └── MarketRibbonItem
├── CompanyHero
│   ├── CompanyLogo
│   └── MetricStrip
│       └── MetricItem + SourceDot
├── CompanySelector
│   └── CompanyChip + CompanyLogo
├── ChartMapWorkspace
│   ├── WorkspaceModeToggle
│   ├── MetricTabs
│   ├── PeriodControls
│   ├── InteractiveMetricChart
│   └── InteractiveMap
│       ├── MapLayerControls
│       └── MapTooltip
├── InsightFeed
├── DataActivityPanel
├── SourceDrawer
└── MapEntityDrawer
```

---

# 22. Implementation Order

Claude should build in this order:

1. Shared types and homepage state container
2. Company registry integration and logo resolution
3. Company selector and company hero switching
4. Metric strip and active-metric behavior
5. Chart/map workspace shell
6. Interactive chart
7. Interactive map placeholder using valid geometry strategy
8. Insight feed and data activity panel
9. Source dots and drawers
10. Loading, errors, responsiveness, and accessibility

Do not start with API wiring before company state, logo switching, and workspace interactions work with local fixtures.

---

# 23. Definition of Done

The component system is complete when all of the following are true:

- Selecting RRC shows the RRC logo and RRC context.
- Selecting AR shows the AR logo and AR context.
- Selecting CNX, CRK, EQT, EXE, and GPOR does the same using repository assets.
- No stale logo or metric remains after company selection.
- Metric selection updates the central chart.
- Chart and map modes switch without losing company selection.
- Comparison companies overlay without replacing the primary company.
- Map layers are interactive and open detail drawers.
- Source dots expose traceable source information.
- Missing data renders as unavailable, not zero.
- Live-data movement is subtle and clearly distinguishes live, delayed, and simulated states.
- The homepage remains visually simple and does not become a dense table dashboard.
- Keyboard and reduced-motion behavior work.

This document is a controlling implementation contract. Material changes to these behaviors should be discussed before implementation.