# Phase 7 — Weekly Range Resources AI Intelligence Report: Architecture

**Status as of this document: Phase 7A + 7B complete.** 7A built the architecture/data-contracts/persistence spine. 7B built the real deterministic snapshot layer on top of it: subsystem adapters that collect real evidence, a real comparison engine, real deterministic change detection, a real materiality foundation, a real News inclusion window, a real fingerprint algorithm, and the snapshot-builder orchestration that carries a draft through `pending → building → ready` (never further). **No AI call, no chart renderer, no PDF renderer, no publish, no cron, no UI entry point exists yet** — those remain Phase 7C+. This document is the continuity source for Phase 7 — a future session should be able to resume Phase 7C from this document alone, without rediscovering the decisions below.

See `docs/CURRENT_HANDOFF.md`'s Phase 7A/7B closeout sections for session-level summaries (files changed, test/build results, commit). This document is the durable architecture reference; the handoff doc is the point-in-time session log.

---

## 1. Product goal

One universal weekly PDF report — **"Weekly Range Resources AI Intelligence Report"** (subtitle: *"Market, Company & Peer Intelligence" / "Week Ending [date]"*) — generated once per week from already-validated dashboard data, identical for every user, cached/stored rather than regenerated per view. It reads like an equity-research / IR briefing: dense, factual, Range-branded, hard 5-page maximum. It selects what materially mattered that week rather than mechanically restating every metric.

Non-negotiable boundary, carried over from Macro (Phase 6D/6E) and enforced structurally, not just by convention: **deterministic code owns facts, calculations, rankings, and charts; AI owns synthesis and narrative only.** Nothing in this document or its code lets AI invent a metric, date, ranking, guidance figure, chart, or source.

## 2. Report identity

**Canonical identity: the EIA Weekly Natural Gas Storage report's "week ending" date** (`StorageWeekEnding`, `YYYY-MM-DD`, always a Friday) — not a calendar week, not a generation timestamp.

Why this and not a generic week: EIA publishes the storage report every Thursday (shifting to another weekday around federal holidays), but the *reported week's end date* is always the Friday that storage week closed on, independent of when EIA actually released it. That makes the identity:

- **Idempotent** — the same real-world week always resolves to the same identity no matter which day generation actually runs.
- **Retry-safe** — a retried or duplicate cron delivery resolves to the same identity as the original attempt, not a new one.
- **Holiday-safe** — a holiday-shifted EIA release date never changes what week is being reported on.
- **Late-run-safe** — a cron that fires a day (or several) late still targets the correct, unambiguous week.

Format and Friday-validity are enforced by `isValidStorageWeekEnding()` in `lib/reports/weekly-report-types.ts`. This function deliberately does **not** check that EIA has actually published data for that date — that is a data-readiness concern (§6), kept separate so a malformed identity and a missing observation surface as two distinct, specific errors.

The underlying weekly storage series is already fetched today (`EIA_ROUTES.weeklyStorage` / `lib/eia/macro-fundamentals.ts`'s `fetchRegionalStorageTable()`, `frequency: "weekly"`) — Phase 7B's snapshot builder is expected to read the latest period from that existing fetch as the source of the identity, not add a new EIA integration.

## 3. Data flow (target end state — most stages not yet built)

```
validated dashboard data (Macro + News + Peers, all pre-existing subsystems)
  → freeze weekly intelligence snapshot           [Phase 7B — DONE, through "ready"]
  → deterministic calculations/comparisons        [Phase 7B — DONE]
  → structured weekly report payload               [Phase 7B — real WeeklyEvidenceItem/WeeklyReportModules]
  → one bounded AI analyst assessment              [Phase 7C — NOT built; contract only]
  → deterministic charts/tables                    [Phase 7D — NOT built]
  → professional PDF renderer                      [Phase 7D — NOT built]
  → atomically publish stored artifact              [Phase 7A — DB primitive built (publishSnapshot); no caller yet -- Phase 7B stops at "ready"]
  → latest report downloaded instantly by users     [Phase 7E — NOT built]
```

Phase 7A built the **persistence spine** (identity, lifecycle, storage contracts) and the **type contracts**. Phase 7B built the **real collection + transformation logic** on top of that spine — see §19 (Evidence model), §10 (Comparison engine, updated in place), §20 (Change detection), §21 (Materiality foundation), §22 (News window), and §23 (Snapshot builder) below for what Phase 7B actually implemented. It intentionally stops the moment a draft reaches `ready`; nothing in Phase 7B ever calls `publishSnapshot()`.

## 4. Existing systems reused (read-only inputs to Phase 7)

Phase 7 is its own subsystem (`lib/reports/`), analogous to how Macro (`lib/market/`) is its own subsystem separate from News (`lib/news/`) — Phase 6A's rule was "share only the taxonomy, nothing else"; Phase 7's rule is "read validated output from Macro/News/Peers, own nothing about how they compute it." Nothing in `lib/market/` or `lib/news/` should ever import from `lib/reports/`.

Inputs Phase 7B actually reads from, via one adapter per subsystem under `lib/reports/adapters/` (none of the subsystems themselves were modified):
- **Macro** (`adapters/macro-adapter.ts`): re-implements the same one-fetch-pass pattern `lib/market/macro-risk-orchestrate.ts`'s `buildMacroRiskSnapshot()` already uses (same 4 `Promise.allSettled` EIA calls, same normalizers) rather than calling that function directly, because the adapter also needs raw access to the underlying series (not just the summarized risk signals) to build full evidence items. Reuses `buildRangeMacroSignals`/`rankRangeMacroSignals`/`buildMacroRiskPayload`/`computeMacroSummaryFingerprint` verbatim for the required `rangeMacroRiskEngineOutput` input, and reuses `refreshSteoSnapshots`/`getCurrentAndPreviousSteoSnapshot`/`computeForecastRevisions` for STEO evidence + vintage comparisons when a DB pool is available.
- **Rigs** (`adapters/rigs-adapter.ts`): reads `lib/rigs/rig-data.ts`'s static Baker Hughes import directly (national U.S. + Marcellus + Utica only — see §19).
- **Range's own company data** (`adapters/range-company-adapter.ts`, category `range_company`): reads `lib/dashboard/financials-quarterly.ts`/`free-cash-flow-quarterly.ts`/`calculated-quarterly.ts`/`guidance.ts` directly — RRC's own quarterly financials/operating metrics + current management guidance.
- **Peers** (`adapters/peers-adapter.ts`, category `peers`): the same quarterly fixture, for the other 6 tickers, on a compact "headline" metric set (production/revenue/EBITDAX/FCF/net-debt-to-EBITDAX/market-cap) reusing `lib/dashboard/overview-metrics.ts`'s own established headline-card convention rather than inventing a new selection.
- **Forecast/scenarios** (`adapters/forecast-adapter.ts`, category `forecast_scenarios`): intentionally narrow — see §10's comparison-family table (the "Range default-scenario forecast" row) for why only the parameterless default scenario is surfaced, with no `forecastRevision` comparison yet.
- **News** (`adapters/news-adapter.ts`, category `news`): reads `lib/news/persistence/articles-repo.ts`'s `queryArticles()` read-only, scoped to a deterministic weekly window (§22) and status `"analyzed"` only — never re-runs News's own AI.

## 5. Storage architecture

**Preferred split (Phase 7A decision, not yet fully implemented):**
- **Postgres (Neon, existing pool via `lib/persistence/db.ts`)** — all structured history: snapshot metadata, frozen JSON payload, fingerprints, freshness manifest, lifecycle state. Built and tested this phase.
- **Object/blob storage** — the published PDF binary itself. **Not committed to Git, not stored in Postgres.** DB rows hold only a key/reference + integrity metadata (`artifact_key`, `artifact_checksum`, `artifact_size_bytes`, `artifact_content_type`).

**No blob/object storage provider is currently configured in this project** (confirmed by inspecting `package.json`'s dependencies and `vercel.json` — no `@vercel/blob`, no S3/R2 SDK, no relevant env var in `.env.example`). Per the phase brief ("do not introduce a provider-specific implementation in 7A unless it is clearly already available and low-risk"), **no provider was added.** The DB schema's artifact columns are provider-agnostic (`artifact_key` is a plain string reference — a blob store key, an S3 object key, a URL path segment — whichever provider is chosen later) specifically so wiring in a real provider in Phase 7D requires zero schema migration.

**Recommendation for Phase 7D:** **Vercel Blob**. Reasoning: this project already deploys on Vercel (per `docs/CURRENT_HANDOFF.md`'s Vercel/GitHub integration notes), Vercel Blob has a genuinely free Hobby tier sized well above one PDF/week, requires no new infrastructure account, and its SDK integrates with zero extra networking config inside a Vercel serverless/Edge function (unlike self-hosting S3 credentials). It is a paid-plan upsell only past its free allowance, which one weekly PDF (a few hundred KB–low MB) will not approach for a very long time. This is a recommendation to revisit at 7D, not a decision locked in now.

## 6. Database schema (`lib/reports/persistence/schema.sql`, table `weekly_report_snapshots`)

One row **per generation attempt**, not one row per week — this is the key design choice that makes retries, idempotency, and "never replace a valid published report" all provable at the schema level rather than only by application discipline.

| Column | Purpose |
|---|---|
| `id` | PK |
| `storage_week_ending` | `DATE`, the canonical identity (§2) |
| `status` | `pending \| building \| ready \| published \| failed` (§7) |
| `schema_version` | Versions the row's own shape/contract, independent of `WeeklyReportPayload`'s own `schemaVersion` field inside the JSON |
| `failed_reason` | Required (`CHECK`) when `status = 'failed'` |
| `data_cutoff_at`, `payload`, `input_fingerprint`, `source_manifest` | Set together, once, at the `building → ready` transition; never rewritten after — the frozen snapshot (§8) |
| `readiness` | Last readiness evaluation (§9) for this attempt, kept for audit |
| `previous_snapshot_id` | Denormalized pointer to the previously-published snapshot as of draft creation — informational convenience only; the authoritative comparison-basis lookup is always the query-time `getPreviousPublishedSnapshot()` |
| `artifact_key`, `artifact_checksum`, `artifact_size_bytes`, `artifact_content_type` | Object-storage pointer + integrity metadata, set only at `ready → published` |
| `created_at`, `updated_at`, `published_at` | Standard bookkeeping |

**Constraints doing real work:**
- `weekly_report_snapshots_active_week_key` — **partial unique index** on `storage_week_ending` `WHERE status IN ('pending','building','ready')`. At most one *in-flight* attempt per week, at the database level — a duplicate/overlapping cron delivery cannot build two concurrent drafts for the same week. A `failed` row is excluded, so a retry after failure is a plain `INSERT`, never a constraint violation.
- `weekly_report_snapshots_published_week_key` — **partial unique index** on `storage_week_ending` `WHERE status = 'published'`. At most one published row per week, ever. This is what makes idempotency and "never replace the previous valid report" true even if application-level gating has a bug — verified directly in `tests/weekly-report-repo.test.cjs` by attempting to publish a second attempt for an already-published week and asserting the raw SQL rejection.
- `weekly_report_snapshots_published_complete_check` — a `published` row must have `published_at`, `payload`, `input_fingerprint`, `source_manifest`, `artifact_key`, `artifact_checksum`, and `artifact_size_bytes` all non-null. A row can never carry the `published` label while incomplete.

Deliberately **not over-normalized**: `payload`, `source_manifest`, and `readiness` are JSONB envelopes (see §8), consistent with this project's existing precedent (`macro_risk_summaries.risk_signals`) — normalizing per-module rows now, before a single real snapshot builder exists, would be guessing at a shape nothing has validated yet.

Migration: `lib/reports/persistence/migrate.ts` (`runWeeklyReportMigrations()`), applied via `npm run report:migrate` → `scripts/reports/migrate.mjs`, mirroring the exact `lib/market/persistence/migrate.ts` / `scripts/macro/migrate.mjs` pattern byte-for-byte.

## 7. Publication lifecycle

```
pending → building → ready → published
   ↓          ↓         ↓
 failed    failed    failed
```

`published` and `failed` are both terminal for a given row (`WEEKLY_REPORT_STATUS_TRANSITIONS` in `weekly-report-types.ts`). A retry after failure is always a **new row** for the same `storage_week_ending`, never a resurrection of the failed one — this is what the active-week partial index (§6) is built to allow.

Every transition is an atomic `UPDATE ... WHERE id = $1 AND status = $expected` in `lib/reports/persistence/report-repo.ts` (`transitionToBuilding`, `freezeSnapshot`, `publishSnapshot`, `markSnapshotFailed`) — a compare-and-swap on the row's own status column. A call that doesn't match the expected prior state returns `null`, never throws and never silently no-ops in a way a caller could misinterpret as success. This is the same "let the database decide who wins a race" principle `macro_risk_summaries`' `ON CONFLICT DO NOTHING` already uses for Macro's AI-summary cache.

**"A failed new report must never replace the previous valid published report"** is enforced two ways simultaneously: (1) `markSnapshotFailed`'s `WHERE` clause never matches a `published` row, so nothing can un-publish one; (2) the published-week partial unique index means a second attempt's `publishSnapshot` call is rejected outright by Postgres even if application code tried it.

## 8. Frozen snapshot & fingerprinting

Once a draft reaches `ready`, `data_cutoff_at`, `payload`, `input_fingerprint`, and `source_manifest` are set together and never rewritten. `WeeklyReportPayload` (in `weekly-report-types.ts`) is the envelope:

```ts
{
  schemaVersion: string;
  storageWeekEnding: StorageWeekEnding;
  dataCutoffAt: string;
  modules: WeeklyReportModules;   // Phase 7B: real typed evidence, see §21
  sourceManifest: SourceFreshnessManifest;
}
```

`modules` is now `WeeklyReportModules = Partial<Record<EvidenceModuleKey, WeeklyEvidenceItem[]>>` (§21) — Phase 7A's placeholder `Record<string, unknown>` was replaced once a real builder existed to populate it.

**Fingerprinting** (`lib/reports/fingerprint.ts`, `computeWeeklyReportFingerprint()`): implemented in Phase 7B, following the exact precedent `computeMacroSummaryFingerprint()` (`lib/market/persistence/summary-repo.ts`) set — canonical (key-sorted) JSON serialization → SHA-256. Not imported from that file (its `canonicalize` helper isn't exported, and duplicating ~6 lines of a well-understood algorithm is cheaper than a cross-subsystem coupling); the same ~6-line canonicalizer is reimplemented locally. The critical addition beyond that precedent: every `WeeklyEvidenceItem` is first reduced to a curated `EvidenceFingerprintView` (`evidenceId`, `category`, `metricKey`, `currentValue`, `displayValue`, `unit`, `period`, `freshness`, a trimmed view of each comparison, sorted `rangeDrivers`) before hashing — **not** the raw object. Deliberately excluded from the fingerprint: `asOfDate` (redundant with `period`), `sourceIds` (traceability, not the fact itself), `materialityInputs` (derived *from* a comparison against the previous report, not itself a real-world input), and `metadata` (an intentionally free-form per-category bag that may legitimately carry non-deterministic bookkeeping, e.g. a fetch timestamp). Tested explicitly (`tests/weekly-report-fingerprint.test.cjs`) for: stability across repeated calls with identical input; sensitivity to a real value/comparison/added-item change; insensitivity to object-key order, array order, and volatile `metadata` contents.

## 9. Required vs. optional data / publication readiness

`lib/reports/readiness.ts` — a **pure evaluator**, not a fetcher. It never decides what any input's real value is; Phase 7B's builder checks each real input and passes booleans in.

**Required** (block publication if missing — kept intentionally narrow, per the phase brief's "do not invent required fields that existing data cannot reliably supply"):
1. `eiaWeeklyStorageObservation` — the report's own identity basis (§2)
2. `macroFundamentalsSnapshot` — Macro's existing fundamentals (Henry Hub, supply, demand, LNG)
3. `rangeMacroRiskEngineOutput` — the deterministic ranked risk/opportunity signals, so "biggest risk"/"biggest opportunity" are never AI-invented
4. `sourceFreshnessManifest` — a valid manifest covering every included input, so the report's own Sources/Freshness section is never fabricated

**Optional** (degrade gracefully, never block): `peerComparisons`, `companyChanges`, `news`, `steoRevisionHistory`, `otherForecastScenarios`.

`evaluateReadiness()` returns `{ ready, missingRequired, degradedOptional }` — `ready` is `true` iff every required key is `true`; optional keys never affect `ready`.

**Phase 7B wiring** (`lib/reports/snapshot-builder.ts`'s `evaluateReportReadiness()`): `eiaWeeklyStorageObservation` ← the Macro adapter's live storage fetch actually returning a value; `macroFundamentalsSnapshot` ← at least one of Henry Hub/dry-gas-production/LNG-exports actually returning `status: "ok"`; `rangeMacroRiskEngineOutput` ← the deterministic risk engine's `payload.signals.length > 0` (i.e. at least one signal wasn't `UNAVAILABLE`); `sourceFreshnessManifest` ← the manifest has at least one entry (always true in practice, since every adapter pushes a manifest entry even when its own source failed). Optional keys map 1:1 to each adapter's own `present` flag: `peerComparisons` ← peers adapter produced items, `companyChanges` ← range-company adapter produced items, `news` ← News adapter produced items, `steoRevisionHistory` ← at least one real STEO vintage comparison was computed, `otherForecastScenarios` ← the forecast adapter produced items. If `ready` is `false`, `runWeeklySnapshotBuild()` calls `markSnapshotFailed()` with a reason string naming every missing required key — never freezes a report on incomplete required inputs.

## 10. Comparison model

`ComparisonResult` (in `weekly-report-types.ts`) is the **contract** every future comparison calculation must return — no comparison is computed in Phase 7A.

```ts
type ComparisonPeriod = "WoW" | "MoM" | "QoQ" | "YoY" | "vs5yrAvg" | "percentileRange"
  | "steoVintage" | "priorQuarterActuals" | "peerChange" | "forecastRevision";

type ComparisonResult = {
  period: ComparisonPeriod; metricKey: string; label: string;
  currentValue: number | null; previousValue: number | null;
  delta: number | null; deltaPct: number | null;
  direction: "up" | "down" | "flat" | "unavailable";
  basisDescription: string | null;   // e.g. "vs. week ending 2026-08-21"; null iff direction is "unavailable"
};
```

`direction: "unavailable"` and null numeric fields are the required response whenever no real previous snapshot/vintage exists — mirroring `computeSignalChanges()` (`lib/market/macro-risk-engine.ts`), which returns an empty result rather than inventing a "from" state before a real prior snapshot exists. This is why `getPreviousPublishedSnapshot()` (§11) returning `null` is a normal, expected case (the very first published week), not an error.

**Phase 7B implementation** (`lib/reports/comparisons.ts`) — pure functions, no fetch/DB, operating on already-collected real history/records. The governing rule the whole file enforces: **comparison semantics follow the underlying data's own period, never the cadence of report generation.** A weekly cron re-observing the same unchanged monthly figure two weeks running produces no WoW comparison at all — production isn't a weekly series, so there is no WoW to compute, fabricated or otherwise. Supported periods by metric family, and why:

| Metric family | Periods computed | Function | Why not others |
|---|---|---|---|
| Weekly EIA storage | WoW, YoY, vs5yrAvg | `compareStorageWeekly` (reuses `buildStorageComparison`) | MoM/QoQ don't apply to a weekly-native series |
| Daily Henry Hub spot | WoW only | `compareDailyWeekly` (calendar-date-anchored, ±3-day tolerance for weekends/holidays) | No official monthly/quarterly cadence for a daily spot price |
| Monthly EIA series (production/LNG/demand/Appalachia) | MoM, YoY | `compareMonthlySeries` (exact calendar-month lookup, mirrors `monthlyYoy`'s own convention) | No WoW/vs5yrAvg -- not weekly-native |
| Quarterly Range/peer financials | QoQ, priorQuarterActuals (= YoY) | `compareQuarterly` (via the fixed `quarters` chronological array) | No WoW/MoM -- the fixture only updates once/quarter |
| Weekly rig counts | WoW, YoY | `compareRigDelta` (reuses the Baker Hughes import pipeline's own precomputed `RigDelta.wow`/`.yoy` rather than recomputing) | Avoids a second, potentially-diverging calculation of the same fact |
| STEO forecast vintages | steoVintage only | `compareSteoVintage` (one entry per real `SteoForecastRevision`) | `[]` when fewer than two real persisted vintages exist -- never a fabricated single-vintage "revision" |
| Range default-scenario forecast | **none** (`[]`) | n/a -- see `adapters/forecast-adapter.ts` | No persisted prior scenario vintage exists to diff against (§4's forecast/scenarios note) |
| Peers | QoQ, priorQuarterActuals | same `compareQuarterly`, per ticker | Same quarterly-cadence fixture as Range's own data |
| News | none | n/a | Discrete events, not a time series |

Every function returns `unavailableComparison(...)` (never fabricates/interpolates) when the calendar-exact prior point genuinely isn't in history — proven directly in `tests/weekly-report-comparisons.test.cjs` (e.g. asking for a `2026-06` MoM baseline when only `2026-01` exists in history correctly returns `direction: "unavailable"`, not a nearest-available fallback).

## 11. Previous-week linkage

`getPreviousPublishedSnapshot(pool, beforeStorageWeekEnding)` — the **query-time authority**: most recent `published` row strictly before the given week. Preferred over trusting a row's own stored `previous_snapshot_id` pointer, which is only a denormalized convenience captured at draft-creation time. `getLatestPublishedSnapshot(pool)` returns the single row the app may ever expose to end users (§12); it is `null` before any report has ever been published.

## 12. Latest-report publication

The application is only ever meant to expose `getLatestPublishedSnapshot()`'s result — never "the most recent attempt regardless of status," never a `ready`-but-not-yet-published draft. No route or UI reads this yet (that's Phase 7E's "Overview → Download Weekly Report" button + a `/api/reports/latest`-style endpoint, neither built in Phase 7A).

## 13. AI boundary

`lib/reports/ai-contract.ts` — **types and validation only; no provider, no call, anywhere in Phase 7A.**

```ts
type WeeklyIntelligenceAIInput = {
  schemaVersion: string; storageWeekEnding: string; payload: WeeklyReportPayload;
  previousReportContext: { storageWeekEnding: string; bottomLine: string } | null;
  availableEvidenceIds: string[];   // explicit allowlist
};

type WeeklyIntelligenceAIOutput = {
  schemaVersion: string; aiProvider: string; aiModel: string; generatedAt: string;
  executiveAssessment: string; biggestRisk: string; biggestOpportunity: string;
  whatChanged: string; managementWatchItems: string[]; bottomLine: string;
  selectedEvidenceIds: string[];   // must be ⊆ availableEvidenceIds
};
```

`validateWeeklyIntelligenceAIOutput(value, input)` is a pure structural validator (word-count bounds around the ~500-word executive-assessment target, non-empty narrative fields, parseable `generatedAt`, and — the one Phase-7-specific rule beyond what Macro's validator does — every `selectedEvidenceIds` entry must be a member of the input's `availableEvidenceIds` allowlist, so the AI can never reference evidence it wasn't actually given). This mirrors `validateMacroSummaryResult()` (`lib/market/ai/types.ts`) exactly in spirit: reject and retry a malformed/out-of-bounds response before it is ever persisted.

**Target: one AI call per weekly report**, mirroring Macro's one-call-per-fingerprint-change model. No provider interface (`MacroSummaryProvider`'s Phase-7 analog) was written this phase — only the input/output data contract — since a provider interface with no real implementation behind it edges toward "stubbing AI," which the phase brief explicitly excludes.

## 14. Report content contract

`ReportContentModel` (`weekly-report-types.ts`) — the shape a future PDF renderer will consume. Page 1 fields (`title`, `subtitle`, `weekEndingLabel`, `executiveAssessment`, `atAGlanceMetrics`, `biggestRisk`, `biggestOpportunity`, `whatChanged`) are fixed slots; `evidenceModules: EvidenceItem[]` (pages 2–4) is a **dynamically-populated array**, not a fixed mandatory section list — `EvidenceModuleKey` enumerates the known *candidate* modules, inclusion is a Phase 7B decision made per week. Closing fields (`keyRisksAndOpportunities`, `managementWatchItems`, `bottomLine`, `sources`) round out the model.

`ChartSpec` fixes only chart presentation metadata (`title`, `caption`, `sourceLine`) consistent with the July visual reference's figure-caption/source-line convention (§15) — not chart data itself, which stays wherever each evidence module's own deterministic builder produces it.

## 15. Visual design requirements (carried forward for Phase 7D)

The supplied `Range_Natural_Gas_Macro_Outlook_July_2026.docx` is the **controlling visual reference** for the eventual PDF renderer — its visual grammar, not its long monthly section structure (the weekly report adapts dynamically to what matters that week). Requirements to preserve, verbatim from the Phase 7 brief, for whoever builds Phase 7D:

- Range Resources visual language; Range logo; Range blue as the dominant accent; white background; restrained gray panels; institutional investor-relations appearance
- Strong title/subtitle hierarchy; blue section headers
- Compact, information-dense layout; clean tables; professional chart presentation
- Figure captions; source lines below every chart/table
- "Range Implication" style callout boxes; "Key Takeaway"/"Bottom Line" style callouts
- Footer/page numbers/reporting date/data-cutoff conventions
- No flashy consumer-dashboard styling, no excessive whitespace, no tiny unreadable charts
- Report title stays exactly **"Weekly Range Resources AI Intelligence Report"** — never labeled "Internal Use Only" or "Investor Relations Briefing"

## 16. PDF rendering approach (recommendation, not built)

**Recommended**: structured report model (`ReportContentModel`) → branded HTML/CSS → headless-browser PDF (e.g. Playwright/Puppeteer-driven Chromium), the same approach the Phase 7 brief names as the default unless repo/runtime constraints argue otherwise.

**Vercel runtime compatibility concerns to resolve in Phase 7D, not now:**
- A full headless Chromium binary is heavy for a standard Vercel serverless function; the realistic paths are (a) `@sparticuz/chromium` (a Vercel/Lambda-optimized Chromium build) with `puppeteer-core`, or (b) running the PDF stage as a longer-running/background job rather than inline in the request that triggers report generation. Neither is set up yet.
- `app/api/cron/macro/route.ts`'s existing `maxDuration = 300` (Hobby's ceiling) is the relevant precedent for how much runtime budget a Vercel Hobby cron realistically gets — a weekly report's build-then-render pipeline should be scoped/chunked with that ceiling in mind rather than assumed to fit in one request.
- No PDF-rendering dependency (`puppeteer`, `playwright`, `@sparticuz/chromium`, or similar) is currently in `package.json` — adding one is explicitly Phase 7D's job, not Phase 7A's.

**Page-break strategy**: CSS `page-break-*`/`break-*` properties scoped per section (executive assessment never splits mid-callout-box; each evidence module targets fitting on one page given the "4–6 charts maximum" / "5-page hard maximum" budget) — a Phase 7D design detail, not decided further here.

**Translating the July template**: the July `.docx`'s visual grammar (§15) should become a small set of reusable CSS primitives (title/subtitle block, blue section header, gray panel, callout box, chart-with-caption-and-source-line, footer-with-page-number) that any dynamically-selected evidence module can compose from — not one big fixed template matching the July document's specific section order.

## 17. Weekly storage gating / orchestration design (recommendation, not built)

**Do not use a blind "Thursday at X UTC" trigger as the sole authority.** Recommended gating condition for Phase 7B/7F's actual cron:

```
a new EIA storage reporting period has been ingested
  AND no snapshot is already published for that storage_week_ending
  AND evaluateReadiness(...).ready === true
  AND a validation/buffer period has elapsed since the new data first appeared
→ generate once
```

Practical shape given this project's existing Vercel Hobby cron pattern (`vercel.json`'s once-daily `news`/`macro` crons, `docs/CURRENT_HANDOFF.md`'s note that Hobby allows up to 100 cron entries but each still runs at most once/day): add one more once-daily cron (e.g. `/api/cron/reports`, offset from `news`/`macro` the same way `macro` is offset from `news`) that **checks the gating condition on every run** rather than assuming Thursday is always the right day — this correctly self-heals across holiday-shifted EIA releases and any single missed/late run, with zero additional paid infrastructure. The existing Macro orchestration's `pg_try_advisory_lock` pattern (`lib/market/macro-orchestrate-daily.ts`) is the direct precedent for guarding against a duplicate concurrent run of this new cron too, under its own distinct lock key.

Nothing above is implemented — no new cron entry exists in `vercel.json`, no `app/api/cron/reports` route exists.

## 18. Idempotency & failure behavior summary

- **Identity-level idempotency**: §2 — the storage-week identity, not calendar time, is authoritative.
- **Concurrency-level idempotency**: §6/§7 — DB partial unique indexes prevent two concurrent active attempts or two published rows for one week, independent of application discipline.
- **Content-level idempotency (planned)**: §8 — fingerprinting so an unchanged snapshot never regenerates a summary/artifact, mirroring Macro's cache-by-fingerprint model exactly.
- **Failure isolation**: a failed attempt is its own terminal row; it can never overwrite, mutate, or block a re-attempt for the same week, and it can never retroactively invalidate an already-published row for that week (§7).

## 19. Evidence model (Phase 7B)

Replaced Phase 7A's placeholder `modules: Record<string, unknown>` with real types in `weekly-report-types.ts`:

```ts
type EvidenceModuleKey =
  | "gas_pricing" | "storage" | "us_gas_supply" | "appalachia_supply" | "lng_demand"
  | "power_data_center_demand" | "industrial_demand" | "steo_outlook" | "rigs"
  | "peers" | "news" | "forecast_scenarios"
  | "range_company" | "deterministic_risk_opportunity";   // added in 7B, additive only -- see §24

type WeeklyEvidenceItem = {
  evidenceId: string; category: EvidenceModuleKey; metricKey: string; label: string;
  currentValue: number | null; displayValue: string; unit: string | null;
  period: string | null; asOfDate: string | null;
  sourceIds: string[]; freshness: "current" | "lagged" | "stale" | "unavailable";
  comparisons: ComparisonResult[]; rangeDrivers: string[];
  materialityInputs: MaterialityInputs; metadata: Record<string, unknown>;
};

type WeeklyReportModules = Partial<Record<EvidenceModuleKey, WeeklyEvidenceItem[]>>;
```

**Stable evidence IDs, decided deliberately**: for a *recurring series* (storage, Henry Hub, production, rigs, quarterly financials, STEO series, risk signals), `evidenceId` is stable **per metric, excluding the period** — e.g. `storage:lower48`, `range_company:rrc:revenue`, `rigs:basin_marcellus`, `deterministic_risk_opportunity:gas_pricing`. The current period/value live in the item's own `period`/`currentValue`/`displayValue` fields, which is what makes `changes.ts`'s diff-by-displayValue meaningful: the *same* id recurring with an *unchanged* value across weeks correctly produces no change entry. For a *discrete event* (a News article), `evidenceId` embeds the article's own stable DB id (`news:article:<id>`) — genuinely a new fact every time, never expected to recur or "change" once published.

**Category-specific evidenceId schemes** (see each `adapters/*.ts` file for the exact list): `gas_pricing:henry_hub_spot`, `storage:lower48`, `us_gas_supply:dry_gas_production`, `appalachia_supply:pa_wv_oh_marketed_production`, `lng_demand:us_lng_exports`, `power_data_center_demand:electric_power_gas_demand`, `industrial_demand:industrial_gas_demand`, `steo_outlook:<seriesKey>` (all 9 verified series), `rigs:national_us` / `rigs:basin_marcellus` / `rigs:basin_utica`, `range_company:rrc:<metric>` / `range_company:guidance:<ticker>:<metric>:<period>`, `peers:<ticker>:<metric>` (6 tickers × 6 headline metrics), `forecast_scenarios:rrc:default_scenario_<metric>`, `news:article:<id>`, `deterministic_risk_opportunity:<driver>`.

**No duplicated conflicting representations**: `deterministic_risk_opportunity` items are lightweight *pointers* (`metadata.relatedEvidenceId`, `riskRank`, `riskState`, `deterministicReason`) into the already-built underlying category's item, never a second copy of that item's metrics.

## 20. Deterministic change detection (Phase 7B)

`lib/reports/changes.ts`'s `computeWeeklyChanges(currentModules, previousModules)` diffs the current snapshot against the **previous published snapshot's** modules (never the current snapshot's own inputs) and returns structured facts only -- no prose:

```ts
type WeeklyChangeKind =
  | "new_observation" | "value_changed" | "risk_state_changed" | "risk_rank_changed"
  | "new_steo_vintage" | "new_company_result_or_guidance" | "material_peer_change"
  | "new_retained_news_item" | "forecast_revision";

type WeeklyChange = { kind: WeeklyChangeKind; evidenceId: string; category: EvidenceModuleKey; label: string; fromValue: string | null; toValue: string | null; fromState: string | null; toState: string | null };
```

**The core rule this file exists to enforce** (Phase 7B brief, verbatim concern): *"If April production is present in two consecutive weekly snapshots unchanged, that is NOT a weekly production comparison."* Because §19's evidenceId scheme excludes the period for recurring series, and the diff compares only each item's own `displayValue`, an unchanged April production figure appearing in week 1's and week 2's snapshots produces **zero** change entries -- proven directly in `tests/weekly-report-changes.test.cjs`'s "THE CORE RULE" test. A change entry only ever appears when a series' real-world value actually differs, which for a monthly/quarterly series only happens as often as that series itself updates.

`deterministic_risk_opportunity` items are diffed specially (`riskChangesFor()`), by their `metadata.riskState`/`riskRank` rather than the generic displayValue path -- avoids a redundant second entry describing the same real-world fact twice, and correctly separates "the classification flipped" (`risk_state_changed`) from "the same classification just moved in the ranking" (`risk_rank_changed`). A brand-new risk item (not previously ranked) reports `fromState: null`, never a fabricated prior state.

With no previous published snapshot at all (the very first report ever generated), every current item is honestly reported as `new_observation` -- a deliberate choice over silently returning `[]`, since "everything is new" is in fact true for an inaugural report.

## 21. Materiality foundation (Phase 7B)

`lib/reports/materiality.ts` -- deterministic **signals**, not a blended score (the phase brief explicitly warns against "arbitrary over-engineered scoring"):

```ts
type MaterialityInputs = {
  isNewThisWeek: boolean; changedSincePreviousReport: boolean;
  riskSeverityRank: number | null; riskState: RangeMacroSignalState | null;
  rangeImpactDirection: string | null; rangeImpactStrength: string | null;
  comparisonMagnitudePct: number | null;
};
```

Every adapter builds its items with these fields defaulted (`false`/`null`); `snapshot-builder.ts`'s `annotateMateriality()` is the **one** cross-cutting pass that fills `isNewThisWeek`/`changedSincePreviousReport` (by diffing against the previous published snapshot, the same lookup `changes.ts` uses) and backfills `comparisonMagnitudePct` from the item's own largest `|deltaPct|` when an adapter hasn't already set it (risk items set it directly from `pressurePct` in `macro-adapter.ts`).

Two small, transparent, tested functions build on these signals -- deliberately not a numeric formula:
- `classifyInformationLevel(inputs): "high" | "routine"` -- "high" iff new, changed, `HIGH_RISK`/`MODERATE_RISK`, a "high" News impact strength, or `|comparisonMagnitudePct| >= 5` (the same +/-5% threshold `macro-risk-engine.ts`'s `classifySignalMagnitude` already uses, reused for consistency rather than a separately-invented number).
- `rankEvidenceByMateriality(items)` -- a plain comparator (new/changed first, then risk severity, then comparison magnitude, then a deterministic evidenceId tie-break), not a weighting formula.

Both give Phase 7C/7D enough to distinguish high-information evidence from routine/no-change evidence without this phase pre-deciding the final chart/narrative-selection algorithm.

## 22. Weekly News inclusion window (Phase 7B)

`lib/reports/news-window.ts`. Window: the **7 calendar days ending at the storage week's own Friday** (`[storageWeekEnding - 6 days 00:00:00, storageWeekEnding 23:59:59.999]`) -- anchored to the report's own identity (§2), not an independent Mon-Sun/Sun-Sat calendar week that would drift out of sync with the report's own boundary.

Eligibility: status `"analyzed"` only (a real, persisted Range-impact AI analysis already exists -- News's own pipeline, run on its own schedule, is never re-invoked from here). A `"retained"`-but-unanalyzed article is excluded rather than included with fabricated/null impact fields -- the adapter's job is to select from what's already been safely analyzed, not decide what an unanalyzed article's impact might be.

Selection: rank by impact strength (`high` > `medium` > `low`, from the persisted analysis) → relevance score → recency, capped at `NEWS_WINDOW_MAX_ITEMS = 8` (keeps the News evidence set print-budget-appropriate for the 5-page hard maximum, rather than dumping every matching article from an eventful week).

## 23. Snapshot builder / orchestration (Phase 7B)

`lib/reports/snapshot-builder.ts` -- the one file that composes every other Phase 7B piece into a full run, and the only Phase 7B file that writes to `weekly_report_snapshots`. **No `app/api/...` route imports this module** -- there is no browser- or cron-reachable entry point yet (proven by inspection, not merely asserted: `app/api/` was not touched this phase).

`runWeeklySnapshotBuild(pool, now)`:
1. `collectMacroEvidence(pool, now)` first -- its live storage observation supplies `storageWeekEndingCandidate`.
2. If that candidate is null or fails `isValidStorageWeekEnding()`, return `{ status: "no_valid_storage_period" }` **without creating any DB row** -- "no fake weekly report" (Phase 7B brief).
3. `getPublishedSnapshotForWeek()` -- if already published, return `{ status: "already_published", snapshot }`.
4. `getActiveSnapshotForWeek()` -- if an attempt is already in flight, return `{ status: "active_attempt_exists", snapshot }`.
5. `getPreviousPublishedSnapshot()`, then `createDraftSnapshot()` (linked to it) → `transitionToBuilding()`.
6. `collectWeeklyIntelligenceInputs()` runs every remaining adapter (rigs/range-company/peers/forecast synchronously, News asynchronously against the now-known `storageWeekEnding`).
7. `buildSourceManifest()` + `evaluateReportReadiness()` (§9's Phase 7B wiring).
8. If not ready: `markSnapshotFailed()` with a reason naming every missing required key; return `{ status: "failed", snapshot, reason }`.
9. Merge every adapter's items into one `WeeklyReportModules`, run `annotateMateriality()` (§21) against the previous published snapshot's modules, then `computeWeeklyChanges()` (§20).
10. `buildWeeklyReportPayload()` → `computeWeeklyReportFingerprint()` → `freezeSnapshot()` (atomic `building → ready`).
11. Return `{ status: "ready", snapshot, changes }`.

**Stops there.** No call anywhere in this file (or anything it imports) reaches `publishSnapshot()`, an AI provider, a chart renderer, or a PDF renderer.

## 24. Known gaps / deviations from Phase 7A (why, and what's left)

No Phase 7A **architecture decision** was reversed -- these are additive refinements the phase brief explicitly allowed ("if implementation exposes a real correctness problem... make the smallest safe correction"):
- **`EvidenceModuleKey` gained two members** (`range_company`, `deterministic_risk_opportunity`, §19) -- Phase 7A's category list had no explicit place for Range's own company results (distinct from comparative peer positioning) or for the risk engine's own ranked output as first-class evidence. Purely additive; nothing removed or renamed.
- **`compareQuarterly`'s parameter type was widened** from `SourcedValue | undefined` to `{ value: number | null } | undefined` (`comparisons.ts`) so the same function serves `financials-quarterly.ts`'s `SourcedValue`, `market-cap-quarterly.ts`'s `MarketCapValue`, and `eps-quarterly.ts`'s `EpsValue` without three near-duplicate functions.

Genuine **data gaps**, documented rather than papered over with a weak substitute (per the phase brief's explicit instruction):
- **No `forecastRevision` comparison for Range's forecast** (§4, §10): `lib/forecast/` has no persisted history of scenario runs (unlike STEO's `macro_steo_snapshots`), and the only parameterless, genuinely-canonical forecast output is the "default scenario" (`getCompanyForecast()`) -- the full interactive Scenario Workbench requires caller-supplied assumptions, so there is no single "the current forecast" to snapshot beyond that default. Closing this gap requires a future phase to add real scenario-state persistence; inventing a substitute comparison now (e.g. diffing against last week's frozen report row) would conflate "the model was re-run" with "a real prior forecast state."
- **`peerChange` as a distinct comparison period is not separately computed** -- peers get the same QoQ/`priorQuarterActuals` comparisons Range's own data gets (§10), not a bespoke "Range-vs-peer relative positioning" delta. Judged out of scope for a deterministic *data* layer; a relative-positioning delta is closer to a synthesis/selection decision, better suited to Phase 7C/7D.
- **DB-gated tests (including the full `runWeeklySnapshotBuild` lifecycle test) have not run against a real Postgres** -- see `docs/CURRENT_HANDOFF.md`'s Phase 7B closeout for the same sandbox limitation already noted in Phase 7A's closeout.

## 25. What remains — Phase 7C through 7G (not started; not authorized by this phase)

- **7C — AI analyst call**: a real `WeeklyIntelligenceAIProvider` implementation (Anthropic, mirroring `AnthropicMacroSummaryProvider`), called once per report, validated by `validateWeeklyIntelligenceAIOutput`. Its input is now real: `runWeeklySnapshotBuild()`'s frozen `WeeklyReportPayload` + `WeeklyChange[]` + materiality-ranked evidence (§21) give 7C a genuine dataset to synthesize over, not a placeholder.
- **7D — Chart renderer + PDF renderer**: real deterministic chart generation (4–6 charts target) and the HTML/CSS → headless-browser PDF pipeline (§16), including the actual Range-branded CSS primitives translated from the July reference (§15), plus wiring a real object/blob storage provider (§5 recommends Vercel Blob) behind the existing provider-agnostic `artifact_key` column.
- **7E — Publication + delivery surface**: an Overview "Download Weekly Report" button, a "latest report" read endpoint serving `getLatestPublishedSnapshot()`'s artifact, historical-archive browsing if wanted. Also where `publishSnapshot()` gets its first real caller.
- **7F — Orchestration**: the actual gated cron (§17) — new `vercel.json` entry, `app/api/cron/reports/route.ts`, advisory-lock-guarded orchestration function that calls `runWeeklySnapshotBuild()` (now real) and then, once 7C/7D exist, carries a `ready` snapshot the rest of the way to `published`.
- **7G — End-to-end validation**: a real generated report, human-reviewed against the 5-page/visual-grammar requirements, before any production exposure.

## 26. Files added

**Phase 7A**: `lib/reports/weekly-report-types.ts`, `readiness.ts`, `ai-contract.ts`, `persistence/{schema.sql,migrate.ts,report-repo.ts}`, `scripts/reports/migrate.mjs`, `tests/weekly-report-{identity,readiness,ai-contract,repo}.test.cjs`.

**Phase 7B**:
```
lib/reports/comparisons.ts                        — deterministic comparison engine (§10)
lib/reports/changes.ts                             — deterministic change detection (§20)
lib/reports/materiality.ts                          — materiality foundation (§21)
lib/reports/fingerprint.ts                          — real computeWeeklyReportFingerprint() (§8)
lib/reports/news-window.ts                          — weekly News window/selection (§22)
lib/reports/snapshot-builder.ts                     — orchestration through "ready" (§23)
lib/reports/adapters/macro-adapter.ts                — Macro evidence + risk-engine payload
lib/reports/adapters/rigs-adapter.ts                 — Baker Hughes rig evidence
lib/reports/adapters/range-company-adapter.ts        — RRC's own quarterly financials + guidance
lib/reports/adapters/peers-adapter.ts                — peer quarterly financials
lib/reports/adapters/forecast-adapter.ts             — RRC default-scenario forecast
lib/reports/adapters/news-adapter.ts                 — weekly News evidence
lib/reports/weekly-report-types.ts (modified)        — real WeeklyEvidenceItem/WeeklyReportModules/WeeklyChange types; +2 EvidenceModuleKey members
tests/weekly-report-comparisons.test.cjs             — comparison-family semantics (no DB)
tests/weekly-report-changes.test.cjs                 — change-detection semantics incl. the core "no fake weekly change" rule (no DB)
tests/weekly-report-materiality.test.cjs             — classifyInformationLevel / rankEvidenceByMateriality (no DB)
tests/weekly-report-fingerprint.test.cjs             — stability/sensitivity/insensitivity (no DB)
tests/weekly-report-news-window.test.cjs             — window + selection rules (no DB)
tests/weekly-report-macro-adapter.test.cjs           — Macro adapter, EIA-fetch-mocked (no DB)
tests/weekly-report-static-adapters.test.cjs         — rigs/range-company/peers/forecast adapters, real static data (no DB)
tests/weekly-report-snapshot-builder.test.cjs        — full lifecycle through "ready" (DB-gated, EIA-fetch-mocked)
docs/PHASE_7_WEEKLY_REPORT_ARCHITECTURE.md (updated) — this document
```

No existing file outside `lib/reports/` was modified. No new API route, no new UI, no new npm dependency, no publish/AI/PDF code anywhere.
