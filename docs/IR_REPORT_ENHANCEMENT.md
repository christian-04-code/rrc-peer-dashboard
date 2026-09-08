# IR Report Enhancement (2026-09-08)

Deliberately kept as its own document, on its own branch (`feat/ir-report-enhancement`, cut from `main` at commit `8fff1c9`), rather than folded into `docs/PHASE_7_WEEKLY_REPORT_ARCHITECTURE.md` or Issue #14 -- Phase 7's release-audit history stays intact and closed. This document covers only what changed for the Investor Questions / IR-preparation expansion.

## Objective

Turn the weekly Range Resources AI Report into a more useful Investor Relations preparation document by adding conditional, evidence-driven sections. **Conditional** is the operative word throughout this document and the code it describes: every new section is independently gated on real, sufficient evidence existing that week, never padded to a fixed count or shown as an empty placeholder. A quiet week can (and should) omit most or all of these sections.

## What was requested vs. what shipped

| # | Requested section | Status | Notes |
|---|---|---|---|
| 1 | Investor Questions to Prepare For | **Shipped** | The one genuinely new AI-synthesized field this release adds. |
| 3 | What Changed Since Last Week | **Already existed** | No new code -- `computeWeeklyChanges`/`whatChanged` (Phase 7B, hardened in the Phase 7 release review) already does exactly this, including correct first-report baseline handling. |
| 4 | Investor Sentiment & Narrative Watch | **Not shipped -- documented gap** | See "Data-source gaps" below. |
| 5 | Company-Specific News & Implications | **Shipped** | Partitioned from the existing News pipeline by its own `"range"` category tag. |
| 6 | Peer Developments That Matter to Range | **Shipped** | Partitioned from the existing News pipeline by its own `"peers"` category tag. |
| 7 | Valuation & Share-Price Context | **Shipped** | Market-cap-based (see "Deliberate scope decisions" below), not a live share-price feed. |
| 8 | Upcoming Catalysts Calendar | **Shipped, deliberately minimal** | Only the next EIA weekly storage release -- the one future date this codebase can state with real confidence. |
| 9 | Key Metrics to Watch Next Week | **Shipped** | Limited to categories with a genuine near-weekly observation cadence. |
| 11 | Guidance & Consensus Watch | **Shipped as "Guidance Watch"** | Consensus half not shipped -- see "Data-source gaps." |

## Reused vs. new

**Reused, unchanged in behavior:** the persisted/analyzed News pipeline (`news-adapter.ts`, `news-window.ts`), Range and peer financial datasets (`financials-quarterly.ts`, `free-cash-flow-quarterly.ts`), SEC/XBRL sourcing and provenance labeling (`source-labels.ts`, the Phase 7 release review's `sec-xbrl` tagging), EIA Macro/STEO evidence (`macro-adapter.ts`), the Forecast workbench (`forecast-adapter.ts`), the deterministic risk/opportunity engine, the previous-report comparison framework (`changes.ts`), the evidence allowlist/AI contract (`ai-contract.ts`), the PDF renderer and content-budget system, and the report persistence/publication workflow. None of these were rebuilt.

**New:**
- `lib/dashboard/calculated-quarterly.ts`: `getLtmFreeCashFlow`, `getEnterpriseValue`, `getEvToLtmAdjustedEbitdax`, `getLtmFcfYield` -- four new deterministic derivations, same file, same `SourcedValue`/`unavailable()` pattern as the existing `getLtmAdjustedEbitdax`/`getNetDebtToLtmAdjustedEbitdax`.
- `lib/reports/adapters/valuation-adapter.ts` (new adapter, new `"valuation"` `EvidenceModuleKey`): RRC + 6 peers' market cap / enterprise value / EV-EBITDAX / FCF yield, wired into `snapshot-builder.ts` exactly like every other adapter.
- `lib/reports/render/evidence-sections.ts`: News partitioned into three candidates (Company-Specific, Peer Developments, generic Material News) instead of one; two new candidates (Guidance Watch, Key Metrics to Watch Next Week); a Valuation candidate. All compete for the same materiality-ranked budget slots every other section already competes for -- no special-cased "always show" treatment.
- `lib/reports/render/table-builder.ts`: `buildValuationComparisonTable`, `buildKeyMetricsToWatchTable`, `buildGuidanceWatchTable`, `buildCatalystsCalendarTable`.
- `lib/reports/ai-contract.ts` / `lib/reports/ai/prompt.ts` / `lib/reports/ai/anthropic-provider.ts`: `investorQuestions` added to the existing single weekly-analyst call's schema (schema version bumped to `1.2.0`) -- **no new AI call**, this rides the same one-call-per-report budget Phase 7C established.
- `lib/reports/render/render-model.ts` / `render-model-builder.ts` / `html-template.ts`: render the above.

## Deliberate scope decisions

**Valuation is market-cap-based, not a live share-price feed.** This dashboard's existing live quote integrations (`use-fmp-quotes.ts`, `use-finnhub-quotes.ts`) are client-only React hooks with no server-callable function today, and the Overview's own "Share price" card already shows that data isn't always resolvable. Building a new live-fetch path into report generation for this release would have been a new, less-reliable dependency for a feature explicitly asked to avoid that ("do not add a new external API... unless necessary"). Every valuation metric instead derives from the same quarter-end market cap / net debt / Adjusted EBITDAX / free cash flow this dashboard already validates and displays elsewhere.

**Catalysts Calendar is one line, on purpose.** The only future date this codebase can state with real confidence is the next EIA weekly storage release (always the following Thursday, computed deterministically from the report's own `dataCutoffAt`). Range/peer earnings dates, STEO's exact release day, and regulatory/pipeline milestones all require a real calendar data source this project doesn't have. Per the explicit "do not invent a date... if no reliable date exists, do not place the event on the calendar" instruction, none of those are guessed.

**Key Metrics to Watch Next Week excludes quarterly-only categories.** `range_company`, `peers`, `valuation`, and `forecast_scenarios` don't have a genuine "next week" data point (the next observation is ~3 months away) -- including them in a NEXT-WEEK watch list would misrepresent their cadence. Only categories with a real near-weekly release (storage, gas pricing, supply/demand, rigs) are eligible.

**Guidance Watch, not "Guidance & Consensus Watch."** See the next section.

## Data-source gaps (not built, and why)

**Investor Sentiment & Narrative Watch -- not shipped at all.** This section explicitly requires analyst commentary, earnings-call transcripts, or credible financial news commentary about market/investor sentiment. This dashboard has no such data source: the persisted News pipeline analyzes *reported developments* (what happened), not analyst opinion or investor sentiment about those developments, and has no "analyst"/"sentiment"/"market reaction" category. Building this from price movement alone was explicitly forbidden by the brief ("do not infer investor sentiment solely from price movement or the AI's opinion"), and building a new scraping/API integration for analyst commentary was out of scope ("do not add a new external API... unless necessary"). There is no code path for this section anywhere in the render pipeline (`tests/weekly-report-ir-enhancement.test.cjs` has a standing guard test enforcing this stays true rather than silently regressing into an unsupported claim). If a real, approved commentary/transcript data source is added in the future, this section can be built the same way Company-Specific News was: partition an existing evidence pool by category, never infer sentiment from a price alone.

**Analyst consensus -- not shipped.** This dashboard has no analyst-consensus data source anywhere (confirmed by inspecting the SEC pipeline, the dashboard config, and every existing adapter before writing this feature). "Guidance Watch" shows only company-reported guidance (already-existing evidence, reused unchanged), with an explicit, permanent `sourceLine` stating no consensus comparison is implied. The section is deliberately titled "Guidance Watch," not "Guidance & Consensus Watch," for exactly this reason -- the title itself must not imply data that isn't there.

**Live share price -- not used as report evidence.** See "Valuation is market-cap-based" above.

## Evidence & AI safeguards

- `ai-contract.ts`'s `checkGuardedText` (filler / guaranteed-outcome / forecast-overclaim denylists) now also runs against every `investorQuestions` field (`question`, `whyNow`, `context`, `responseFramework`, `followUpNeeded`).
- Every `investorQuestions` item requires >=1 `evidenceIds`, validated against the exact same allowlist every other AI field uses -- an ungrounded question is a hard validation failure, not a warning.
- `responseFramework` is optional and, whenever present, is rendered in the PDF with an explicit, un-skippable label ("Preparation Note -- based on public information only, not an official Range statement") -- see `html-template.ts`. The AI prompt (`prompt.ts` rules 16-18) separately instructs the model never to invent a management position, commitment, or guidance in this field.
- `investorQuestions` has no minimum count (0 is normal and expected) and a schema/render-time ceiling only (`MAX_INVESTOR_QUESTIONS = 6` in the contract; `content-budget.ts`'s `maxInvestorQuestions` at render time) -- never a target the model is encouraged to fill.
- Every new deterministic value (valuation metrics) carries the same `SourcedValue`/`source`/`basis`/`note` provenance shape as everything else in this codebase, translated through the existing `describeFinancialSource`/`describeMarketDataSource` labels (Phase 7 release review) -- never a raw internal tag.

## Content budget additions

`content-budget.ts` gained three new caps (`maxKeyMetricsToWatch`, `maxGuidanceRows`, `maxInvestorQuestions`), each a safety ceiling only, each `REDUCED_BUDGET` value `<=` its `STANDARD_BUDGET` counterpart (enforced by an existing standing test). No existing cap changed.

## New environment variables / external dependencies

**None.** No new API key, no new paid data service, no new package.

## Tests / validation

Targeted: `tests/weekly-report-ir-enhancement.test.cjs` (21 tests: conditional inclusion/omission for every new section, News partition correctness including the both-tags-counts-as-range case, a standing guard that no Investor Sentiment section exists anywhere in the render pipeline, content-budget cap ordering, and a high-materiality-week-vs-quiet-week comparative scenario) + extended `tests/calculated-quarterly.test.cjs` (9 new tests for the four valuation functions) + extended `tests/weekly-report-ai-contract.test.cjs` (9 new tests for `investorQuestions` validation/grounding/guardrails). Full suite: **1503 tests, 1422 pass, 0 fail, 81 skipped** (unchanged pre-existing DB-gated limitation). `npm run typecheck` and `npm run build`: both clean.

Every layout-sensitive change (new sections, Investor Questions callout styling, Catalysts Calendar table) was additionally rendered through the real `html-template.ts` + a local headless-Chrome PDF pass and visually inspected, not just unit-asserted -- confirmed the standard-tier sample fixture still renders to exactly 5 pages (the hard maximum) with the new content included, and confirmed each new section's actual visual presentation (Investor Questions' preparation-note labeling, Catalysts Calendar's honest single-row disclosure, the corrected news category-array rendering).

A real, pre-existing bug was found and fixed while building this: `buildNewsTable`'s "Category" column checked `typeof item.metadata.category === "string"`, but a News article's real category is `NewsCategory[]` (an array) -- the column always rendered `"--"` in production. Fixed to join the array; a realistic-shaped test was added (the previous test used an unrealistic bare-string fixture that had masked this).

A second bug was found and fixed during this work: `evidence-sections.ts`'s final candidate-ranking step matched ranked representatives back to their candidate by `evidenceId`, which breaks when two different candidates legitimately share the same top evidence item (e.g. "Storage" and "Key Metrics to Watch Next Week" both draw from `payload.modules.storage`) -- one candidate would silently vanish, resolved to whichever the ranking happened to hit first. Fixed by ranking distinct shallow clones and mapping back by object identity, without duplicating `rankEvidenceByMateriality`'s own scoring rule.

## Release status

Not merged, not deployed. See the session's own final checkpoint (delivered in chat, not duplicated here) for exact commit SHA, PR/issue draft text, and the precise next action required from the project owner.
