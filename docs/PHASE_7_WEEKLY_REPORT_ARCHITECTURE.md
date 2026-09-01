# Phase 7 — Weekly Range Resources AI Intelligence Report: Architecture

**Status as of this document: Phase 7A only (architecture + data contracts + persistence foundation). No snapshot builder, no AI call, no chart renderer, no PDF renderer, no cron, no UI entry point exists yet.** This document is the continuity source for Phase 7 — a future session should be able to resume Phase 7B from this document alone, without rediscovering the decisions below.

See `docs/CURRENT_HANDOFF.md`'s Phase 7A closeout section for the session-level summary (files changed, test/build results, commit). This document is the durable architecture reference; the handoff doc is the point-in-time session log.

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
  → freeze weekly intelligence snapshot           [Phase 7B — NOT built]
  → deterministic calculations/comparisons        [Phase 7B — NOT built]
  → structured weekly report payload               [Phase 7A — envelope type only]
  → one bounded AI analyst assessment              [Phase 7C — NOT built; contract only]
  → deterministic charts/tables                    [Phase 7D — NOT built]
  → professional PDF renderer                      [Phase 7D — NOT built]
  → atomically publish stored artifact              [Phase 7A — DB primitive only, no caller yet]
  → latest report downloaded instantly by users     [Phase 7E — NOT built]
```

Phase 7A built the **persistence spine** (identity, lifecycle, storage contracts) that every later stage will read from and write to, plus the **type contracts** each stage's inputs/outputs must satisfy. It did not build any stage's actual logic.

## 4. Existing systems reused (read-only inputs to Phase 7)

Phase 7 is its own subsystem (`lib/reports/`), analogous to how Macro (`lib/market/`) is its own subsystem separate from News (`lib/news/`) — Phase 6A's rule was "share only the taxonomy, nothing else"; Phase 7's rule is "read validated output from Macro/News/Peers, own nothing about how they compute it." Nothing in `lib/market/` or `lib/news/` should ever import from `lib/reports/`.

Inputs Phase 7B is expected to read from (none of this was modified in Phase 7A):
- **Macro**: `lib/market/macro-fundamentals.ts`, `macro-analytics.ts` (fundamentals), `macro-risk-engine.ts` (deterministic ranked risk/opportunity signals — `MacroRiskPayload`), `macro-steo.ts`/`macro-steo-types.ts` (STEO forecast + revision history), all already-persisted via `macro_steo_snapshots`/`macro_risk_summaries`.
- **News**: validated, deduplicated, Range-impact-scored articles (`lib/news/persistence/articles-repo.ts`).
- **Peers/company data**: existing peer comparison and forecast/scenario modules (not audited file-by-file in Phase 7A per the phase's "inspect only what's directly relevant" scope — Phase 7B should confirm current shapes before consuming them).

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
  modules: Record<string, unknown>;   // Phase 7B decides the real per-module shape
  sourceManifest: SourceFreshnessManifest;
}
```

`modules` is deliberately loose — Phase 7B's snapshot builder is what will decide each evidence module's actual internal shape, informed by what each input subsystem (§4) really returns. Fixing that shape in Phase 7A, before a builder exists, would be guessing.

**Fingerprinting**: `input_fingerprint` is intended to follow the exact precedent `computeMacroSummaryFingerprint()` (`lib/market/persistence/summary-repo.ts`) already set — a SHA-256 over a canonicalized (key-sorted) JSON serialization of the deterministic inputs, so a byte-identical re-run of the same real-world week's data always produces the same fingerprint regardless of object key ordering or fetch timing. Phase 7A did not implement the actual fingerprint function (nothing to fingerprint yet without a real payload-builder), but the column and the precedent to follow are in place.

## 9. Required vs. optional data / publication readiness

`lib/reports/readiness.ts` — a **pure evaluator**, not a fetcher. It never decides what any input's real value is; Phase 7B's builder checks each real input and passes booleans in.

**Required** (block publication if missing — kept intentionally narrow, per the phase brief's "do not invent required fields that existing data cannot reliably supply"):
1. `eiaWeeklyStorageObservation` — the report's own identity basis (§2)
2. `macroFundamentalsSnapshot` — Macro's existing fundamentals (Henry Hub, supply, demand, LNG)
3. `rangeMacroRiskEngineOutput` — the deterministic ranked risk/opportunity signals, so "biggest risk"/"biggest opportunity" are never AI-invented
4. `sourceFreshnessManifest` — a valid manifest covering every included input, so the report's own Sources/Freshness section is never fabricated

**Optional** (degrade gracefully, never block): `peerComparisons`, `companyChanges`, `news`, `steoRevisionHistory`, `otherForecastScenarios`.

`evaluateReadiness()` returns `{ ready, missingRequired, degradedOptional }` — `ready` is `true` iff every required key is `true`; optional keys never affect `ready`.

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

## 19. What remains — Phase 7B through 7G (not started; not authorized by this phase)

- **7B — Snapshot builder**: the actual `weekly_report_snapshots` draft-create → building → freeze pipeline; real readiness-input wiring; real `input_fingerprint` computation; real comparison calculations (WoW/MoM/QoQ/YoY/vs-5yr/percentile/STEO-vintage/peer/forecast) against `ComparisonResult`; evidence-module selection logic deciding what "materially mattered" that week.
- **7C — AI analyst call**: a real `WeeklyIntelligenceAIProvider` implementation (Anthropic, mirroring `AnthropicMacroSummaryProvider`), called once per report, validated by `validateWeeklyIntelligenceAIOutput`.
- **7D — Chart renderer + PDF renderer**: real deterministic chart generation (4–6 charts target) and the HTML/CSS → headless-browser PDF pipeline (§16), including the actual Range-branded CSS primitives translated from the July reference (§15), plus wiring a real object/blob storage provider (§5 recommends Vercel Blob) behind the existing provider-agnostic `artifact_key` column.
- **7E — Publication + delivery surface**: an Overview "Download Weekly Report" button, a "latest report" read endpoint serving `getLatestPublishedSnapshot()`'s artifact, historical-archive browsing if wanted.
- **7F — Orchestration**: the actual gated cron (§17) — new `vercel.json` entry, `app/api/cron/reports/route.ts`, advisory-lock-guarded orchestration function mirroring `runMacroDailyOrchestration()`.
- **7G — End-to-end validation**: a real generated report, human-reviewed against the 5-page/visual-grammar requirements, before any production exposure.

## 20. Files added this phase

```
lib/reports/weekly-report-types.ts        — identity, lifecycle, payload envelope, comparison, content-model, DB-record types
lib/reports/readiness.ts                  — required/optional input contract + pure evaluateReadiness()
lib/reports/ai-contract.ts                — AI input/output types + pure validateWeeklyIntelligenceAIOutput()
lib/reports/persistence/schema.sql        — weekly_report_snapshots table + constraints
lib/reports/persistence/migrate.ts        — runWeeklyReportMigrations()
lib/reports/persistence/report-repo.ts    — create/read/lifecycle-transition persistence helpers
scripts/reports/migrate.mjs               — npm run report:migrate entry point
tests/weekly-report-identity.test.cjs     — identity/status-transition unit tests (no DB)
tests/weekly-report-readiness.test.cjs    — evaluateReadiness unit tests (no DB)
tests/weekly-report-ai-contract.test.cjs  — AI output validator unit tests (no DB, no AI call)
tests/weekly-report-repo.test.cjs         — DB-gated lifecycle/uniqueness/idempotency tests
docs/PHASE_7_WEEKLY_REPORT_ARCHITECTURE.md — this document
```

No existing file's behavior was changed. No new API route, no new UI, no new npm dependency.
