# Range Resources — Interactive Peer Comparison & Dynamic Financial Modeling Project

_Converted from `Peer_Comp_Site_Project_Insturctions.docx` (V1 structured section, controlling spec). This is the authoritative architecture document for the RRC peer comparison dashboard project._

## RANGE RESOURCES — INTERACTIVE PEER COMPARISON & DYNAMIC FINANCIAL MODELING PROJECT
### PROJECT PURPOSE
Build a polished, interactive peer-comparison and financial-modeling website centered on Range Resources Corporation (RRC).

The tool should allow Range Resources Investor Relations to quickly understand:

How RRC compares with its closest peers historically.

Where RRC outperforms or underperforms.

What operational, pricing, cost, capital-allocation, and balance-sheet factors explain those differences.

How peer financial results may evolve under current management guidance.

How changes in commodity prices affect projected revenue, Adjusted EBITDAX, Free Cash Flow, leverage, valuation, and other important metrics.

How RRC compares with peers under different commodity-price and operating scenarios.

The project should evolve beyond a static historical peer-comparison dashboard.

The intended end state is:

Historical Truth + Management Guidance + Live Market Inputs + Dynamic Forecast Engine + Interactive Peer Comparison

The website should behave like a lightweight interactive financial model, not merely display hard-coded forecast numbers.

## CORE ANALYTICAL QUESTION
The system should answer:

How does Range Resources compare with its peers historically, how is each company positioned going forward based on management guidance, and how do changes in commodity prices and operating assumptions affect future financial performance, capital efficiency, leverage, and valuation?

RRC is always the benchmark/reference company.

## PRODUCT PHILOSOPHY
The project should remain:

Simple enough to present and share easily.

Sophisticated enough to provide real analytical value.

Audit-ready.

Source-supported.

Dynamic where modeling adds value.

Transparent about assumptions.

Consistent across peers.

This is not intended to become a massive enterprise software platform.

Do not automatically expand the project into:

Enterprise authentication systems.

Large production databases.

Autonomous AI research infrastructure.

Complex automated SEC ingestion.

Institutional-scale market-data infrastructure.

The objective is a high-value Investor Relations analysis and presentation tool.

The original Notion project already establishes that the dashboard should make peer analysis faster and clearer than static Excel tables, preserve source traceability, and use normalized data rather than hard-coded values scattered through UI components.

## FUNDAMENTAL ARCHITECTURE
The project must be built as four separate but connected layers.

### LAYER 1 — HISTORICAL TRUTH DATABASE
The existing peer workbook serves as the historical source-of-truth and calibration database.

Historical data must remain:

Verified.

Source-supported.

Standalone quarterly.

Apples-to-apples where possible.

Clearly labeled when company definitions differ.

Separate from forecasts and assumptions.

Historical values must never change dynamically because commodity prices move.

Historical reported results are facts.

They should not be overwritten by APIs, forecasts, assumptions, or scenario logic.

### LAYER 2 — MANAGEMENT GUIDANCE DATABASE
A separate structured dataset should capture current forward-looking company guidance.

For each company, collect all material guidance affecting future financial performance.

Examples include:

#### Production
Total production.

Natural gas production.

NGL production.

Oil / condensate production.

Growth rates.

Quarterly production cadence.

Expected production ramp.

Maintenance vs growth volumes.

#### Capital
Total capital expenditures.

Drilling and completion capital.

Maintenance capital.

Growth capital.

Land / leasehold.

Infrastructure.

Facilities.

Other material capital categories.

#### Costs
LOE.

Gathering.

Processing.

Transportation.

Compression.

Production taxes.

Cash G&A.

Total cash unit costs.

#### Operations
Wells drilled.

TILs / wells turned to sales.

Lateral feet drilled.

Lateral feet TIL.

Rig count.

Completion crews.

DUC inventory.

Expected well costs.

#### Pricing
Natural gas differential guidance.

NGL realization guidance.

Oil / condensate realization assumptions.

Benchmark relationships.

Marketing / transportation assumptions.

#### Financial
Cash taxes.

Interest expense.

Free Cash Flow guidance.

EBITDAX / EBITDA guidance.

Reinvestment rate.

Debt targets.

Leverage.

Buybacks.

Dividends.

Shareholder-return framework.

#### Multi-Year Guidance
Where disclosed:

Longer-term production targets.

Capital targets.

FCF outlook.

Growth expectations.

Demand / takeaway capacity.

Processing capacity.

Management guidance should be treated as a separate forward-looking dataset, not mixed into historical reported data.

## LAYER 3 — DYNAMIC FORECAST ENGINE
This is the core modeling layer.

The system should calculate forecasts dynamically using:

Historical company data.

Management guidance.

Company-specific modeling assumptions.

Live or delayed market data.

User-controlled scenario assumptions.

Codex or any development agent should build the calculation logic, not manually calculate forecast outputs and hard-code them.

This distinction is critical.

### WRONG APPROACH
Hard-code:

RRC 2026 EBITDAX = $1.5 billion.

The website displays $1.5 billion permanently.

If commodity prices change, nothing changes.

This is not the intended architecture.

### CORRECT APPROACH
Build formulas such as:

Forecast Production

Then:

Forecast Revenue

Then:

Adjusted EBITDAX

Then:

Prior Net Debt

Then:

Forecast Net Debt / Forecast LTM EBITDAX

These relationships should recalculate whenever assumptions change.

## LAYER 4 — INTERACTIVE WEBSITE
The website is the presentation and interaction layer.

It consumes:

Historical normalized data.

Management guidance.

Dynamic forecast outputs.

Live/delayed market data.

User scenario inputs.

The frontend should never contain random hard-coded financial numbers spread across chart components.

The frontend should consume a clean normalized data contract.

The original Notion design correctly established that the frontend should depend on normalized structured data and that the data/backend layer owns truth.

## PEER UNIVERSE
### CORE NATURAL GAS / CLOSEST PEERS
These are the priority companies for Version 1:

RRC — Range Resources Corporation

AR — Antero Resources Corporation

CNX — CNX Resources Corporation

CRK — Comstock Resources, Inc.

EQT — EQT Corporation

EXE — Expand Energy Corporation

GPOR — Gulfport Energy Corporation

RRC must always be visually identifiable as the benchmark company.

The original Notion project defines these seven companies as the priority peer set and explicitly states that broader peers should not delay Version 1.

### BROADER E&P PEERS — LATER EXPANSION
CHRD — Chord Energy

MGY — Magnolia Oil & Gas

MTDR — Matador Resources

MUR — Murphy Oil

OVV — Ovintiv

SM — SM Energy

Do not delay Version 1 to fully model the broader peer set.

## HISTORICAL PERIOD
Current workbook coverage should be treated as:

Q1 2024 through Q1 2026

Nine standalone quarters:

Q1 2024

Q2 2024

Q3 2024

Q4 2024

Q1 2025

Q2 2025

Q3 2025

Q4 2025

Q1 2026

Note:

The original Notion page still references Q2 2024 through Q1 2026, but the current working workbook has evolved to include Q1 2024.

The current workbook structure should control the historical dataset.

## HISTORICAL SOURCE-OF-TRUTH WORKBOOK
The master workbook is the analyst-controlled historical database.

Use the current:

Range_Peer_Quarterly_Data_Input_Template_Q1_2024_to_Q1_2026.xlsx

Each company has its own worksheet.

Historical data collection should remain isolated company by company to reduce cross-company contamination.

## HISTORICAL METRIC UNIVERSE
### FINANCIAL PERFORMANCE
Revenue

Adjusted EBITDAX

Free Cash Flow

Capital Expenditures

Net Debt

### PRODUCTION & MIX
Total Production

Natural Gas Production

NGL Production

Oil / Condensate Production

### REALIZED PRICING
Realized Natural Gas Price

Realized NGL Price

Realized Oil / Condensate Price

### COST STRUCTURE
Lease Operating Expense / Mcfe

Gathering / Processing / Transportation / Mcfe

Cash G&A / Mcfe

Total Cash Unit Costs / Mcfe

### WELLS & DEVELOPMENT
Wells Drilled

Wells Turned-in-Line

DUC Inventory

### CAPITAL EFFICIENCY / BALANCE SHEET / VALUATION
Reinvestment Rate

Production Growth

Shares Outstanding

Net Debt / LTM EBITDAX

EV / LTM EBITDAX

Free Cash Flow Yield where methodology is consistent

Calculated metrics must always be labeled Calculated, not Company Reported.

## APPLES-TO-APPLES METHODOLOGY
RRC and AR currently serve as the primary methodology references for peer normalization.

For each new company:

Understand how RRC measures the metric.

Understand how AR measures the metric.

Determine the underlying economic concept.

Find the closest company-specific equivalent.

Normalize only when directly supported by disclosed source data.

Clearly document remaining methodological differences.

Do not normalize simply to make numbers look comparable.

A misleading standardized number is worse than a documented blank.

## HISTORICAL DATA RULES
Historical data discipline is strict.

Never:

Estimate missing historical values.

Forecast historical quarters.

Fill unavailable cells with zero.

Invent data.

Silently mix definitions.

Use analyst estimates in place of reported historical results.

Annualize partial periods unless explicitly instructed.

Infer unsupported values.

Exact mathematical derivation is permitted only where source definitions match.

Examples:

Q2 = 6M YTD − Q1

Q3 = 9M YTD − 6M YTD

Q4 = FY − 9M YTD

This is allowed only when:

Definitions are identical.

Units are identical.

Scope is identical.

There are no restructuring/reclassification issues that invalidate subtraction.

Ratios and pricing metrics must not be subtracted directly.

Derive numerator and denominator first.

## SOURCE HIERARCHY — HISTORICAL
Use:

SEC filings — 10-K / 10-Q / relevant 8-K

Earnings releases

Supplemental earnings packages

Investor presentations

If sources conflict:

Flag the discrepancy.

Do not silently choose a preferred value.

Every material number should retain:

Source document.

Source type.

Page / table / section.

Calculation basis if derived.

Verification status.

## MANAGEMENT GUIDANCE SOURCE HIERARCHY
For forward guidance use:

Latest company earnings release / supplemental guidance.

Latest earnings call transcript.

Latest 10-Q / 10-K.

Latest investor presentation.

Other company-issued guidance disclosures.

AlphaSense may be used as the search/discovery layer.

AlphaSense is not the final authority.

Material guidance should be verified against actual company disclosures whenever practical.

## STANDARD HISTORICAL DATA RECORD
Every historical metric should conceptually include:

Company

Ticker

Metric

Category

Value

Unit

Fiscal Quarter

Fiscal Year

Period End

Reported vs Calculated

Definition / Methodology

Source Document

Source Type

Source Page / Location

Source URL

Date Retrieved

Notes

Verification Status

## STANDARD GUIDANCE DATA RECORD
Every forward-looking guidance item should conceptually include:

Company

Ticker

Guidance Metric

Category

Fiscal Period

Low

Midpoint

High

Unit

Formal Guidance vs Commentary

Management Definition

Prior Guidance

Updated?

Source Document

Source Date

Source Page / Transcript Location

Notes

Verification Status

Do not convert qualitative management commentary into a precise numerical forecast unless the modeling assumption is explicitly labeled as an analyst/model assumption.

## FORECAST DATA CLASSIFICATION
Every forecast value displayed by the site must be classified as one of:

#### COMPANY GUIDANCE
Direct company-provided guidance.

#### MODEL CALCULATION
A value mathematically generated by the forecast engine.

#### MODEL ASSUMPTION
An input chosen by the analyst/system.

#### LIVE / DELAYED MARKET DATA
An external market-data input.

#### COMPANY-REPORTED HISTORICAL
An actual reported historical result.

These classifications must never be blended silently.

## DYNAMIC MARKET INPUTS
The forecast engine should eventually support live or delayed inputs such as:

### EQUITY
RRC

AR

CNX

CRK

EQT

EXE

GPOR

### COMMODITIES
Priority:

Henry Hub natural gas

WTI crude oil

Potential later expansion:

Ethane

Propane

Normal Butane

Isobutane

Natural Gasoline

NGL physical benchmark licensing and availability can be complex.

Never present:

A futures quote

A forward quote

A financial derivative quote

as though it were a physical spot assessment unless accurately labeled.

## COMPANY-SPECIFIC REALIZATION MODELS
Commodity API price does not equal company realized price.

This is a critical modeling rule.

Do not model:

Realized Gas Price = Henry Hub

Instead model company-specific relationships.

Conceptually:

Forecast Realized Gas Price

/ − Company-Specific Differential

Potential inputs include:

Historical realization differential.

Management guidance.

Basis exposure.

Transportation.

Marketing.

Geographic exposure.

LNG exposure.

Fixed-price contracts.

Other disclosed pricing structures.

For NGLs:

Do not assume one benchmark equals the company’s realized NGL basket.

The model may need:

Management realization guidance.

Historical realization relationships.

Commodity-basket assumptions.

For oil:

Use:

WTI

/ − company-specific realization adjustment

where methodologically appropriate.

## HEDGING
The model architecture should preserve the ability to distinguish:

### PRE-HEDGE ECONOMICS
Commodity-price-driven operating economics before derivatives.

### POST-HEDGE ECONOMICS
Economics after hedge settlements.

Conceptually:

Market Price

Hedge modeling may be simplified or deferred for the first MVP.

However, the architecture should not prevent future integration.

## FORECAST MODELING PRIORITY
Do not attempt to dynamically forecast every metric immediately.

Version 1 dynamic modeling should prioritize:

### 1. PRODUCTION
Historical actuals

### 2. REALIZED PRICING
Market benchmark

### 3. REVENUE
Commodity volumes

### 4. ADJUSTED EBITDAX
Revenue

### 5. FREE CASH FLOW
Modeled operating cash generation

### 6. REINVESTMENT RATE
Use the standardized methodology adopted for the peer set.

### 7. NET DEBT / LEVERAGE
Forecast balance-sheet impact from modeled FCF and company capital-allocation assumptions.

### 8. VALUATION
Potential dynamic outputs:

EV / EBITDAX

FCF Yield

Equity Value

Net Debt / EBITDAX

These can react to:

Live share price.

Live commodity inputs.

Forecast EBITDAX.

Forecast FCF.

Forecast debt.

## SCENARIO ENGINE
The website should eventually support three primary forecast views.

### 1. MANAGEMENT CASE
Uses company management guidance and management-provided assumptions where available.

Purpose:

Show the economic outcome implied by management’s stated plan.

### 2. LIVE MARKET CASE
Uses current/delayed market commodity prices with company-specific guidance and realization logic.

Purpose:

Answer:

What might current economics look like if today’s commodity environment were applied to the company’s operating plan?

Live Market Case outputs must be clearly labeled as modeled estimates.

They are not company guidance.

### 3. CUSTOM CASE
Users can adjust assumptions.

Potential inputs:

Henry Hub

WTI

NGL assumptions

Production

CapEx

Unit costs

Realization differential

Cash taxes

Interest

Other relevant drivers

Changing assumptions should automatically recalculate model outputs.

## MODEL ENGINE PRINCIPLE
The website should calculate forecasts from dependencies.

Do not hard-code forecast answers.

For example:

Wrong:

RRC 2026 EBITDAX = $1.5B

Correct conceptual structure:

Forecast Gas Volume

× Forecast Gas Realization

+

Forecast NGL Volume

× Forecast NGL Realization

+

Forecast Oil Volume

× Forecast Oil Realization

=

Forecast Commodity Revenue

−

Modeled Cash Costs

=

Modeled Adjusted EBITDAX

Then calculate downstream metrics from that output.

The purpose is to make the model responsive.

A change in commodity price or operating assumptions should flow through the entire model.

## MODEL DEPENDENCY / DRIVER MAPPING
Every modeled output should have explicit upstream drivers.

Example:

### REVENUE
Drivers:

Production

Commodity mix

Realized pricing

### EBITDAX
Drivers:

Revenue

LOE

G&P / transport

Production taxes

Cash G&A

Other normalized cash costs

### FCF
Drivers:

EBITDAX

Cash interest

Cash taxes

CapEx

Other cash items

### NET DEBT
Drivers:

Beginning debt

FCF allocation

Acquisitions/divestitures

Buybacks/dividends where modeled

Other financing changes

### VALUATION
Drivers:

Share price

Shares outstanding

Net debt

LTM / forward EBITDAX

FCF

No output should exist without a traceable dependency path.

## HISTORICAL DATA AS MODEL CALIBRATION
Historical data serves two purposes:

### PURPOSE 1 — PEER COMPARISON
Show actual company performance.

### PURPOSE 2 — MODEL CALIBRATION
Historical relationships may help determine:

Realization differentials.

Unit-cost behavior.

Capital efficiency.

Production sensitivity.

Cost run rates.

Margin structure.

Historical reinvestment behavior.

Historical relationships may inform model assumptions.

They must not automatically be treated as management guidance.

Any assumption derived from historical averages or medians must be labeled clearly as:

Model Assumption

## COMPANY GUIDANCE VS MODEL ASSUMPTIONS
Always separate:

#### EXACT COMPANY GUIDANCE
Example:

Production = 2.2–2.3 Bcfe/d

#### MODEL INPUT
Example:

Production midpoint = 2.25 Bcfe/d

#### MODEL OUTPUT
Example:

Modeled EBITDAX = $X

Never present modeled output as though management provided it.

## FRONTEND EXPERIENCE
The website should remain clean and focused.

Suggested sections:

### OVERVIEW
RRC vs peer median

Rankings

Key financial/operational metrics

Historical vs forecast summary

### FINANCIALS
Revenue

Adjusted EBITDAX

FCF

CapEx

Leverage

### PRODUCTION
Total production

Gas

NGL

Oil

Growth trends

### PRICING
Realized gas

NGL

Oil

Benchmark differentials

### COSTS & CAPITAL
LOE

G&P / transportation

Cash G&A

Total Cash Unit Costs

Reinvestment Rate

### FORECAST / SCENARIO MODEL
Management Case

Live Market Case

Custom Case

Assumptions panel

Forecast outputs

### VALUATION
Potential:

EV / EBITDAX

FCF Yield

Leverage

Peer valuation ranges

### SOURCES / METHODOLOGY
Allow users to understand:

Data source.

Reported vs calculated.

Historical vs modeled.

Key methodology differences.

## VISUALIZATION PRINCIPLES
Use charts only when they improve analysis.

### BAR CHARTS
Good for:

Peer rankings

Revenue

EBITDAX

FCF

CapEx

Unit costs

Leverage

### LINE CHARTS
Good for:

Historical trends

Historical + forecast periods

Pricing

Production

Costs

Historical vs forecast periods must be visually distinct.

Example:

Historical = solid line

Forecast = dashed or shaded area

### SCATTERPLOTS
Useful examples:

Production Growth vs Reinvestment Rate

FCF Yield vs Leverage

EV / EBITDAX vs FCF Yield

Unit Costs vs Production Growth

### TABLES
Use for:

Exact numbers

Sources

Definitions

Assumptions

Guidance ranges

## RRC SCORECARD
The Overview should prominently show RRC versus peers using real underlying metrics.

Potential fields:

RRC value

Peer median

Difference vs median

Peer rank

Percentile

Potential focus metrics:

FCF

EBITDAX

Unit costs

Leverage

NGL realizations

Production growth

Reinvestment rate

Forward modeled FCF

Forward modeled leverage

Do not use arbitrary AI-generated scores when direct financial metrics can answer the question.

## DATA / SOFTWARE RESPONSIBILITIES
### CHATGPT
Primary responsibilities:

Historical data QA

Apples-to-apples methodology

Workbook logic

Guidance data structure

Forecast model architecture

Formula definitions

Data contracts

API architecture

Validation rules

Peer comparability review

### ALPHASENSE
Primary responsibilities:

Research acceleration

Locating guidance

Locating filings/disclosures

Finding management commentary

Not final authority.

### CODEX
Primary responsibilities:

Implement forecast calculation engine

Implement APIs/serverless logic

Build normalized data transformations

Implement formulas and dependencies

Testing

Data validation

Deployment integration as needed

Codex should calculate outputs at runtime or through reusable functions.

Codex should not manually calculate forecast values once and hard-code them.

### CLAUDE
Primary responsibilities:

UI / UX

HTML/dashboard design

Visual presentation

Interactive controls

Chart design

Principle:

Frontend owns presentation. Data/model layer owns truth.

## RECOMMENDED TECHNICAL DATA FLOW
Conceptual architecture:

Historical Workbook

↓

Normalized Historical Dataset

↓

├──────────────┐

│              │

Management Guidance   Market APIs

│              │

└──────┬───────┘

↓

Forecast Engine

↓

Scenario Outputs

↓

Interactive Peer Website

Potential structured data inputs:

historical.json

guidance.json

assumptions.json

market-data.json

Forecast engine returns normalized model outputs.

Do not hard-code financial forecast numbers inside frontend chart files.

## LIVE MARKET DATA ARCHITECTURE
Preferred concept:

External API

Example:

/api/market

The frontend should not depend directly on vendor-specific response formats.

Normalize external data first.

Do not expose private API keys in client-side code.

## DATA LABELING IN UI
Every value should be identifiable as one of:

Actual

Company Guidance

Modeled

Live / Delayed

User Scenario

Example:

Q1 2026A

Actual historical.

2026E — Management Case

Modeled using management assumptions.

2026E — Live Market Case

Modeled using current market inputs.

2026E — Custom Case

Modeled using user assumptions.

## MODEL AUDITABILITY
Every forecast output should be explainable.

For any modeled number, the system should be able to answer:

What assumptions drove it?

What company guidance was used?

What market prices were used?

What historical relationships were used?

What formula produced the output?

Avoid black-box scoring.

The model should behave like an analyst-built financial model.

## KEY MODELING RISKS
### 1. FALSE COMPARABILITY
Do not force company definitions into identical categories when economics differ.

### 2. COMMODITY PRICE ≠ REALIZED PRICE
Always consider company-specific realization.

### 3. GUIDANCE ≠ FORECAST
Guidance is an input.

Forecast is an output.

### 4. HISTORICAL ≠ FORECAST
Never overwrite reported actuals.

### 5. PRE-HEDGE ≠ POST-HEDGE
Preserve pricing basis.

### 6. STATIC CALCULATIONS
Do not hard-code forward numbers that should respond to changing assumptions.

### 7. DOUBLE COUNTING
Be careful with:

transportation

marketing

hedges

taxes

CapEx

non-cash adjustments

when calculating revenue, EBITDAX, and FCF.

### 8. API DATA QUALITY
Every API field should include:

Timestamp

Unit

Source

Real-time / delayed classification

## CURRENT PROJECT PRIORITY
Execute in this order.

### PHASE 1 — HISTORICAL FOUNDATION
Finish the seven core gas peers:

RRC

AR

CNX

CRK

EQT

EXE

GPOR

Normalize key historical metrics.

Do not delay Version 1 for broader peers.

### PHASE 2 — GUIDANCE DATABASE
Collect Q1 2026 / current 2026 management guidance for each core peer.

Standardize the guidance schema.

### PHASE 3 — MODEL SPECIFICATION
For each dynamic metric define:

Inputs

Formula

Source

Company-specific treatment

Fallback assumption hierarchy

Output

Do this before Codex builds the forecast engine.

### PHASE 4 — FORECAST ENGINE
Implement reusable calculation functions.

Do not manually hard-code forecast outputs.

### PHASE 5 — MARKET API INTEGRATION
Start with:

Henry Hub

WTI

Equity prices

Only add NGL benchmarks when reliable and legally usable data is identified.

### PHASE 6 — INTERACTIVE FRONTEND
Build:

Historical mode

Management Case

Live Market Case

Custom Case

### PHASE 7 — QA
Test:

Formula integrity

Scenario changes

API fallback behavior

Peer comparability

Source traceability

Historical/model separation

## DEFINITION OF SUCCESS
The project succeeds when a Range Resources IR team member can open the website and quickly answer:

#### HISTORICAL
How does RRC compare with peers?

Who has the strongest FCF?

Who has the lowest unit costs?

Who has the strongest balance sheet?

Who has the best realized pricing?

Who is growing most efficiently?

How has RRC changed relative to peers?

#### FORWARD
What is each company guiding for production and capital?

What does management’s plan imply financially?

How does current commodity pricing affect modeled results?

What happens if Henry Hub rises or falls?

Which peer has the most commodity-price sensitivity?

Which company generates the most modeled FCF?

How does leverage change?

How do valuation multiples change?

How does RRC compare under identical commodity scenarios?

#### INTERACTIVE
A user should be able to change:

Henry Hub

WTI

Production

CapEx

Costs

Other assumptions

and immediately see:

Revenue

EBITDAX

FCF

Reinvestment Rate

Net Debt

Leverage

Valuation

Peer Ranking

update dynamically.

## ULTIMATE PROJECT VISION
This project should become a lightweight E&P Peer Intelligence and Scenario Modeling Tool.

It should combine the reliability of an analyst-built financial model with the accessibility of an interactive website.

The core system is:

VERIFIED HISTORICALS

+

MANAGEMENT GUIDANCE

+

LIVE / DELAYED MARKET INPUTS

+

COMPANY-SPECIFIC MODEL LOGIC

↓

DYNAMIC FINANCIAL FORECASTS

↓

APPLES-TO-APPLES PEER COMPARISON

↓

INTERACTIVE IR DECISION TOOL

The most important design principle is:

Do not hard-code the forecast. Hard-code the modeling logic.

Historical values are facts.

Guidance defines management’s plan.

Market APIs provide changing external inputs.

The calculation engine converts those inputs into dynamic financial outputs.

The website makes those outputs understandable, comparable, and interactive.

## INSTRUCTIONS FOR ALL FUTURE AI / CHAT SESSIONS
When working on this project:

Treat this document as the controlling project objective and architecture.

Do not reduce the project to a static historical dashboard.

Historical peer data remains the verified calibration and comparison layer.

The long-term value is the dynamic forecast/scenario model.

Preserve strict separation between:

Historical actuals

Company guidance

Model assumptions

Model outputs

Live market data

Never invent unsupported historical data.

RRC and AR serve as key apples-to-apples methodology references.

Prioritize the seven core natural gas peers.

Do not hard-code forward financial outputs that should respond to model inputs.

Build reusable financial relationships and calculation functions.

Preserve company-specific pricing, cost, hedge, and operational differences.

Every modeled output must have traceable assumptions and formulas.

Keep the product lightweight, polished, and presentation-ready.

Do not sacrifice analytical correctness for visual simplicity.

The final goal is an interactive peer model that helps Range Resources understand:

historical relative performance,

future management plans,

commodity sensitivity,

financial outcomes,

capital efficiency,

leverage,

valuation,

and RRC’s strategic positioning versus peers.
