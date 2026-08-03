# RRC Peer Intelligence — Homepage Visual & Interaction Specification

## Purpose

This document is the controlling design brief for the first dashboard implementation.

The homepage must feel like a live investor intelligence tool, not another Excel workbook, FactSet screen, Power BI report, or static investor presentation.

The core design principle is:

> **Simple at rest. Deep on interaction.**

The page should look polished immediately, but reveal detail only when the user hovers, clicks, filters, compares, or opens a source drawer.

---

## Product goals

Within five seconds, the homepage should answer:

1. What is happening with the selected company right now?
2. How does it compare with peers?
3. What changed in guidance, valuation, operations, or market conditions?
4. How fresh and trustworthy is the underlying data?

The dashboard should feel alive through restrained API motion, live status indicators, chart transitions, map flows, and data activity updates.

---

## Visual direction

Target feel:

- Apple-like clarity
- Linear-like responsiveness
- Bloomberg-like seriousness
- Less dense than FactSet
- Much more interactive than a spreadsheet

Avoid:

- Giant KPI cards
- Excessive rounded tiles
- Large empty spaces
- Neon colors
- Crypto-terminal styling
- Heavy gradients
- Multiple competing charts on the homepage
- Static tables as the primary experience

Use:

- Deep navy or charcoal background
- Soft elevated surfaces
- Thin borders
- Strong typography
- Large readable values
- Muted secondary labels
- Minimal color used for state and emphasis
- Small, useful animations only

---

## Desktop homepage layout

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ HEADER                                                                       │
│ RRC Peer Intelligence   Overview  Peers  Guidance  Sources      ● Live Data │
├──────────────────────────────────────────────────────────────────────────────┤
│ LIVE MARKET RIBBON                                                           │
│ Henry Hub | WTI | Selected Stock | NGL | Appalachia Basis | Consensus State │
├──────────────────────────────────────────────────────────────────────────────┤
│ SELECTED COMPANY HERO                                                        │
│ Company logo + name + ticker + short descriptor                              │
│ Price | Production | FCF | Capital | Leverage                                │
├──────────────────────────────────────────────────────────────────────────────┤
│ PEER SELECTOR                                                                │
│ [RRC] [AR] [CNX] [CRK] [EQT] [EXE] [GPOR]                  + Compare Peers   │
├──────────────────────────────────────────────────────────────────────────────┤
│ MAIN WORKSPACE                                                               │
│ [Chart View] [Map View]                                                      │
│                                                                              │
│ Production | FCF | CapEx | Net Debt | Valuation                              │
│                                                                              │
│ One large interactive chart OR the interactive map                           │
├──────────────────────────────────────────────────────────────────────────────┤
│ TODAY'S INTELLIGENCE              │ LIVE DATA ENGINE                         │
│ 3–5 concise generated insights    │ APIs, parsers, refreshes, validation     │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Header

### Left

- Product name: `RRC Peer Intelligence`
- Small product mark or neutral energy icon

### Navigation

- Overview
- Peers
- Guidance
- Sources

### Right

A compact live-data control:

```text
● 6 data feeds active
```

States:

- Healthy: pulsing accent dot
- Updating: spinner and `Updating`
- Partial: amber dot and `Delayed data`
- Offline: muted/red dot and `Offline`

Clicking opens the **Data Activity Drawer**.

---

## 2. Live market ribbon

The ribbon must be thin, horizontally scrollable on mobile, and visually calm.

Default items:

- Henry Hub natural gas
- WTI crude oil
- Selected company stock
- NGL benchmark or realization reference
- Appalachia basis differential
- Consensus/feed status

Each item displays:

- Label
- Current value
- Directional arrow
- Percentage or absolute change

### Motion

When an API value changes:

1. Value transitions smoothly.
2. The item flashes softly for 300–500 ms.
3. Positive change receives a muted positive tint.
4. Negative change receives a muted negative tint.
5. No bouncing or aggressive flashing.

### Hover

Show:

- Last update timestamp
- Previous close
- Session high/low when available
- API/source name

### Click

Switch the primary workspace to **Market Context Mode** and show the selected market series against the selected company.

---

## 3. Selected company hero

The selected company is the global dashboard context.

Default company: `RRC`.

Display:

- Company logo
- Company name
- Ticker
- One-line business descriptor
- Last updated timestamp

Example Range descriptor:

> Appalachian natural gas and NGL producer

### Headline metrics

Use compact metric surfaces for:

- Share price
- Production
- Free cash flow
- Capital spending
- Net leverage

For Range, repository-supported examples include:

- 2027 production target: approximately 2.6 Bcfe/d
- 2026–2027 cumulative free cash flow: greater than $1.7 billion under the stated commodity case
- 2026–2027 annual capital: approximately $650–$700 million
- Debt / EBITDAX: approximately 0.5x

Do not hardcode these values if repository data already provides them. Bind the UI to the normalized data source.

### Metric interaction

Hover:

- Slight elevation
- Brighter border
- Secondary line changes to `View details →`

Click:

- Switch the main chart to that metric
- Recalculate insight cards
- Preserve the selected company
- Update URL state when routing exists

Only one metric should appear active at a time.

---

## 4. Company selector and logo behavior

The peer selector must use company logos from the repository.

### Required logo behavior

When a user selects a company:

- The hero logo must immediately change to the selected company logo.
- The company name, ticker, descriptor, metrics, chart, map exposure, guidance, and insights must update together.
- The active peer chip must visually change state.
- The logo must not remain the RRC logo after another company is selected.

Examples:

- Select `RRC` → show the Range Resources logo.
- Select `AR` → show the Antero Resources logo.
- Select `CNX` → show the CNX logo.
- Select `GPOR` → show the Gulfport logo.

### Logo rendering rules

- Use `object-fit: contain`.
- Preserve the original aspect ratio.
- Place logos on a neutral surface so white or dark logo variants remain visible.
- Do not crop or stretch logos.
- Use a ticker fallback only if the mapped asset fails to load.
- Keep hero logos visually prominent but not oversized.
- Peer chips may use smaller logos plus ticker labels.

### Peer chip states

- Primary company: solid accent state
- Comparison company: outlined active state
- Unselected company: muted
- Missing-data company: disabled with tooltip

### Comparison mode

`+ Compare peers` opens a selector allowing up to four additional companies.

When comparison mode is active:

- Metric cards remain focused on the primary company.
- The chart overlays selected peers.
- The map displays peer basin overlap and routes.
- The legend becomes interactive.

---

## 5. Main interactive workspace

The homepage should contain one major analytical workspace, not many separate charts.

Top-level toggle:

```text
[Chart View] [Map View]
```

The chart and map occupy the same area. Switching modes should animate smoothly without changing the overall page height dramatically.

---

## 6. Chart view

Default metric: `Production`.

Metric tabs:

- Production
- Free cash flow
- CapEx
- Net debt / leverage
- Valuation

Controls:

- Quarterly / Annual
- Actual only / Actual + estimates / Guidance only
- Absolute / Growth % when supported
- 1Y / 3Y / 5Y / Max when supported

### Chart behavior

- Selected company is the primary solid line.
- Comparison peers use distinct but restrained styles.
- Guidance ranges appear as shaded bands.
- Consensus uses a dotted or dashed line.
- Actuals use solid lines.
- Hovering shows metric, period, value, unit, source status, and timestamp.
- Clicking a point opens the Source Detail Drawer.
- Clicking the legend toggles series visibility.
- Transitions between metrics should animate smoothly.

Do not place several small charts beneath the main chart on the homepage.

---

## 7. Interactive map view

The map is a required first-class feature, not decoration.

### Default geography

Use a real U.S. basemap and real geographic data. Do not hand-draw state boundaries, basins, terminals, or routes.

### Core layers

- Operating basins
- Company operating exposure
- Pipeline / market routes
- LNG terminals
- NGL export routes
- Demand centers
- Optional demand-growth intensity

### Required map interactions

#### Company selection

Selecting a company updates:

- Highlighted operating basin(s)
- Company acreage/operating region where data exists
- Market routes
- LNG/NGL exposure
- Demand-center links
- Company logo and map legend

#### Basin click

Clicking a basin opens a right-side detail drawer with:

- Basin name
- Active peer companies
- Primary products
- Selected company exposure
- Key operational or takeaway constraint

#### Terminal click

Clicking an LNG or export terminal opens:

- Terminal name
- Status
- Capacity when available
- Connected demand region
- Selected company relevance
- Source information

#### Route hover

Hovering a route should illuminate:

```text
Production basin → processing → pipeline / transport → end market
```

#### Layer controls

Use compact toggles for:

- Basins
- Company exposure
- Pipelines/routes
- LNG terminals
- NGL exports
- Demand centers

### Map motion

Use restrained animated flow along active company routes.

The motion should be subtle enough to communicate direction and activity without looking like a gaming or crypto interface.

### Range example

When `RRC` is selected, the map should emphasize Southwest Pennsylvania / Appalachia and show market connectivity to local/Northeast, Midwest, Gulf Coast, LNG/premium Gulf, and NGL export destinations when supported by repository data.

---

## 8. Today's Intelligence

Display 3–5 concise insights derived from repository data.

Examples of the intended style:

- Range targets approximately 2.6 Bcfe/d by 2027.
- Annual capital remains approximately $650–$700 million through 2027.
- The stated 2026–2027 price case supports more than $1.7 billion of cumulative free cash flow.
- A selected peer has a guidance revision or source conflict requiring review.

Each insight must be clickable.

Clicking should open the relevant chart, map layer, guidance comparison, or source drawer.

Do not generate unsupported claims. Every insight must trace back to repository data.

---

## 9. Live data engine

This panel makes the product feel active and trustworthy.

Show statuses such as:

- Market feed: updating
- SEC filings: synced
- Guidance parser: complete
- Consensus feed: refreshed
- Peer metrics: recalculated
- Conflict checks: complete

Every few seconds, a new activity line may appear:

```text
Henry Hub refreshed
Peer metrics recalculated
Guidance records verified
Consensus feed checked
SEC filing indexed
```

The activity feed should reflect real events when APIs exist. Until then, clearly mark demo motion as simulated.

---

## 10. Source interaction system

Every displayed number should support a source interaction.

Recommended visual treatment:

```text
2.6 Bcfe/d ●
```

Hovering the dot shows:

- Source type
- Source document
- Period
- Verification state
- Last updated time

Clicking opens the Source Detail Drawer with:

- Company
- Metric
- Value
- Unit
- Fiscal period
- Source hierarchy level
- Source file
- Page or section if available
- Verification status
- Conflict notes

Do not show all source details permanently on the homepage.

---

## 11. Right-side drawer

Use a slide-out drawer instead of many modal dialogs.

The drawer handles:

- Metric details
- Source citations
- Map basin details
- LNG terminal details
- Guidance changes
- API status
- Conflict review

The drawer should preserve the current page state and close without resetting filters.

---

## 12. Responsive behavior

### Desktop

- 12-column layout
- One large workspace
- Insights and activity panel beside or beneath the workspace

### Tablet

- Metric cards wrap
- Peer selector scrolls horizontally
- Main workspace remains full width
- Insights stack below

### Mobile

- Header simplifies
- Market ribbon scrolls horizontally
- Peer chips scroll horizontally
- Metric cards become a two-column grid
- Chart and map remain full width
- Source drawer becomes a full-width bottom sheet or slide-over

---

## 13. Accessibility

- All interactive elements must be keyboard accessible.
- Buttons must be semantic buttons, not clickable divs.
- Logos require descriptive alt text.
- Charts and maps require accessible labels and text summaries.
- Color must not be the only indicator of state.
- Animations must respect reduced-motion preferences.
- Tooltips must be reachable by keyboard focus.

---

## 14. Data integrity rules

- Do not invent missing historical values.
- Do not silently estimate missing values.
- Do not mix company data.
- Use repository source hierarchy and conflict rules.
- Mark illustrative/demo values clearly.
- Use exact units and period labels from normalized repository data.
- If a metric lacks a verified source, display `Not verified` or omit it.

---

## 15. Claude implementation order

Build in this sequence:

1. App shell, theme, and responsive grid
2. Company selector with correct logo switching
3. Selected-company hero and metric binding
4. Live market ribbon and activity states
5. Single interactive chart workspace
6. Chart / Map toggle
7. Interactive map with real basemap and layer controls
8. Today's Intelligence panel
9. Source dots and right-side drawer
10. Comparison mode
11. Accessibility and reduced-motion polish
12. Tests for company isolation, logo mapping, source binding, and interaction state

---

## 16. Acceptance criteria

The homepage is complete only when:

- RRC is the default selected company.
- Selecting AR changes the hero logo to the AR logo.
- Selecting every supported peer changes the hero logo and company context correctly.
- No company selection leaves a stale logo from the previous company.
- Metric-card clicks update the main chart.
- Peer comparison overlays work.
- Chart View and Map View share the same workspace.
- The map uses real geography and supports company, basin, route, terminal, and layer interactions.
- Live data movement is subtle and useful.
- Data activity is visible.
- Every displayed metric can reveal source information.
- The page remains visually simple when no controls are open.
- The design does not resemble an Excel sheet or a dense FactSet dashboard.
