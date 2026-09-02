# Phase 7 — Weekly Range Resources AI Intelligence Report: Architecture

**Status as of this document: Phase 7A + 7B + 7B.1 + 7C + 7C.1 + 7D complete.** 7A built the architecture/data-contracts/persistence spine. 7B built the real deterministic snapshot layer on top of it: subsystem adapters that collect real evidence, a real comparison engine, real deterministic change detection, a real materiality foundation, a real News inclusion window, a real fingerprint algorithm, and the snapshot-builder orchestration that carries a draft through `pending → building → ready` (never further). 7B.1 was a small corrective pass that (1) re-anchored the News inclusion window to the report's own **data cutoff** instead of the storage-week identity Friday, and (2) replaced `displayValue`-text-based change/materiality/fingerprint comparisons with a **semantic** comparison rule (`currentValue`/`period`/category state) — see §8, §20, §22, §23. **7C built the AI analyst layer** (§26): deterministic evidence selection, a bounded structured AI input/output contract with real grounding validation, one Anthropic call per report (Claude Haiku 4.5, forced tool-use), a fingerprinted/cached persistence layer, and safe-failure behavior. **7C.1** (§26.12) shortened `executiveAssessment` from a ~450-550 word target down to ~150-250 words / 2-3 paragraphs, now that Phase 7D's evidence sections carry the detailed analysis instead. **7D built the deterministic chart/table/report-model/PDF rendering layer** (§28-§29): a typed render model, deterministic bar-chart and table construction (values traced only to frozen evidence, never AI-influenced), a materiality-ranked/budget-capped evidence-section selector, an HTML/CSS report template, a real headless-Chromium PDF renderer behind a swappable interface, a deterministic content-budget/page-limit policy (initial render + one reduced-content retry + fail-safe), and a provider-agnostic artifact-storage abstraction. **7D stops at PDF bytes in memory — no publish, no download route, no cron, no UI entry point exists yet.** This document is the continuity source for Phase 7 — a future session should be able to resume Phase 7E from this document alone, without rediscovering the decisions below.

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

**Fingerprinting** (`lib/reports/fingerprint.ts`, `computeWeeklyReportFingerprint()`): implemented in Phase 7B, following the exact precedent `computeMacroSummaryFingerprint()` (`lib/market/persistence/summary-repo.ts`) set — canonical (key-sorted) JSON serialization → SHA-256. Not imported from that file (its `canonicalize` helper isn't exported, and duplicating ~6 lines of a well-understood algorithm is cheaper than a cross-subsystem coupling); the same ~6-line canonicalizer is reimplemented locally. The critical addition beyond that precedent: every `WeeklyEvidenceItem` is first reduced to a curated `EvidenceFingerprintView` (`evidenceId`, `category`, `metricKey`, `currentValue`, `qualitativeFact`, `unit`, `period`, `freshness`, a trimmed view of each comparison, sorted `rangeDrivers`) before hashing — **not** the raw object. Deliberately excluded from the fingerprint: `asOfDate` (redundant with `period`), `sourceIds` (traceability, not the fact itself), `materialityInputs` (derived *from* a comparison against the previous report, not itself a real-world input), and `metadata` (an intentionally free-form per-category bag that may legitimately carry non-deterministic bookkeeping, e.g. a fetch timestamp). Tested explicitly (`tests/weekly-report-fingerprint.test.cjs`) for: stability across repeated calls with identical input; sensitivity to a real value/comparison/added-item change; insensitivity to object-key order, array order, and volatile `metadata` contents.

**Phase 7B.1 correction — `displayValue` is not unconditionally fingerprinted.** `displayValue` is presentation-only (rounding, formatting, unit suffixes). The original Phase 7B implementation fingerprinted it directly alongside `currentValue`, which meant a pure formatting change (with no real data change) *could* in principle have altered the fingerprint, and — the more serious direction — was safe only by accident, not by design. `qualitativeFact` replaces it: `null` whenever `currentValue` is a real number (in which case `currentValue` + `period` already fully carry the semantic fact, matching `changes.ts`'s `isEvidenceItemChanged()` rule below), and set to the item's `displayValue` only when `currentValue` is `null` on that item (genuinely non-numeric/qualitative evidence, e.g. text-only guidance wording, where the text *is* the only available fact and must not become invisible to the fingerprint). Tested explicitly: a `currentValue` change that happens to round to the same `displayValue` string still changes the fingerprint; a `displayValue`-only formatting change with an unchanged `currentValue` does not; a qualitative-only item's real text change does change the fingerprint.

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

**Stable evidence IDs, decided deliberately**: for a *recurring series* (storage, Henry Hub, production, rigs, quarterly financials, STEO series, risk signals), `evidenceId` is stable **per metric, excluding the period** — e.g. `storage:lower48`, `range_company:rrc:revenue`, `rigs:basin_marcellus`, `deterministic_risk_opportunity:gas_pricing`. The current period/value live in the item's own `period`/`currentValue`/`displayValue` fields, which is what makes `changes.ts`'s semantic diff meaningful (§20): the *same* id recurring with an *unchanged* `currentValue`/`period` across weeks correctly produces no change entry. (Phase 7B originally diffed by `displayValue` text; Phase 7B.1 corrected this to compare `currentValue`/`period` directly — see §20.) For a *discrete event* (a News article), `evidenceId` embeds the article's own stable DB id (`news:article:<id>`) — genuinely a new fact every time, never expected to recur or "change" once published.

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

**The core rule this file exists to enforce** (Phase 7B brief, verbatim concern): *"If April production is present in two consecutive weekly snapshots unchanged, that is NOT a weekly production comparison."* Because §19's evidenceId scheme excludes the period for recurring series, an unchanged April production figure appearing in week 1's and week 2's snapshots produces **zero** change entries -- proven directly in `tests/weekly-report-changes.test.cjs`'s "THE CORE RULE" test. A change entry only ever appears when a series' real-world value actually differs, which for a monthly/quarterly series only happens as often as that series itself updates.

**Phase 7B.1 correction -- semantic comparison, not `displayValue` text.** The original Phase 7B implementation compared `prior.displayValue !== item.displayValue`, which made truth detection dependent on formatting/rounding: a real underlying change that happened to round to the same display string (e.g. `3.326` → `3.334`, both rendering `"$3.33"`) would have gone undetected, while a pure formatting change with no real data change could in principle have registered as one. `isEvidenceItemChanged(current, prior)` is the single, exported, semantic-equality rule now used consistently by **both** `computeWeeklyChanges()` here **and** `snapshot-builder.ts`'s `annotateMateriality()` (`changedSincePreviousReport`) -- there is exactly one definition of "changed" in this subsystem:

- **`deterministic_risk_opportunity`**: `metadata.riskState`/`riskRank` only -- a risk item's `currentValue` (pressurePct) and `displayValue` are both largely a restatement of its classification, so a small pressurePct drift that doesn't cross a classification threshold is correctly "unchanged" here even though the raw number moved.
- **`news`**: always `false` -- discrete events, identity-based (a News item's evidenceId embeds its own article id and never recurs across weeks in practice).
- **everything else**: `current.period !== prior.period` → changed (a new observation period arrived -- case B: recognized as new/updated evidence even when the number happens to coincide with the prior period's). Else, if both sides have a real numeric `currentValue`, compare it directly (case C vs. A). Else (neither side has a numeric fact -- genuinely qualitative evidence, e.g. text-only guidance wording), fall back to comparing `displayValue`, since text is the only fact available in that case.

`computeWeeklyChanges()`'s generic branch additionally distinguishes, for the `WeeklyChangeKind` label only (not for whether a change occurred at all): a period-advance (case B) uses the same "new_*" kind vocabulary as a brand-new evidenceId (`newObservationKind()`), while a same-period value revision (case C) uses `valueChangedKind()` (`"value_changed"` or a category-specific kind).

`deterministic_risk_opportunity` items are diffed specially (`riskChangesFor()`), by their `metadata.riskState`/`riskRank` -- avoids a redundant second entry describing the same real-world fact twice, and correctly separates "the classification flipped" (`risk_state_changed`) from "the same classification just moved in the ranking" (`risk_rank_changed`). A brand-new risk item (not previously ranked) reports `fromState: null`, never a fabricated prior state.

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

Every adapter builds its items with these fields defaulted (`false`/`null`); `snapshot-builder.ts`'s `annotateMateriality()` is the **one** cross-cutting pass that fills `isNewThisWeek`/`changedSincePreviousReport` and backfills `comparisonMagnitudePct` from the item's own largest `|deltaPct|` when an adapter hasn't already set it (risk items set it directly from `pressurePct` in `macro-adapter.ts`). `changedSincePreviousReport` uses `changes.ts`'s exported `isEvidenceItemChanged()` (§20) -- the exact same semantic-equality rule `computeWeeklyChanges()` uses, not a separate `displayValue` comparison (Phase 7B.1 correction; both now share one definition of "changed").

Two small, transparent, tested functions build on these signals -- deliberately not a numeric formula:
- `classifyInformationLevel(inputs): "high" | "routine"` -- "high" iff new, changed, `HIGH_RISK`/`MODERATE_RISK`, a "high" News impact strength, or `|comparisonMagnitudePct| >= 5` (the same +/-5% threshold `macro-risk-engine.ts`'s `classifySignalMagnitude` already uses, reused for consistency rather than a separately-invented number).
- `rankEvidenceByMateriality(items)` -- a plain comparator (new/changed first, then risk severity, then comparison magnitude, then a deterministic evidenceId tie-break), not a weighting formula.

Both give Phase 7C/7D enough to distinguish high-information evidence from routine/no-change evidence without this phase pre-deciding the final chart/narrative-selection algorithm.

## 22. Weekly News inclusion window (Phase 7B; re-anchored in Phase 7B.1)

`lib/reports/news-window.ts`. **Report IDENTITY remains `storageWeekEnding` (§2), unchanged.** News *windowing* is a separate concern and, as of Phase 7B.1, follows the report's own **data cutoff** instead.

**Why re-anchored**: the original Phase 7B window was `[storageWeekEnding - 6 days, storageWeekEnding]` -- the 7 calendar days ending at the storage week's own Friday. But the EIA storage report for a Friday week-ending date is normally released the *following Thursday*, and a report generated after that release (the realistic case) must not omit the Saturday-through-Thursday News that occurred between storage-week close and actual report generation. The Friday-anchored window silently dropped that entire span. Re-anchoring to the data cutoff closes this gap without touching report identity at all.

**Window**: `(previousDataCutoffAt, currentDataCutoffAt]` -- **start EXCLUSIVE, end INCLUSIVE**. `computeNewsWindow(previousDataCutoffAt, currentDataCutoffAt)`:
- An article published exactly at the previous report's cutoff was already eligible as of that cutoff (its own end-inclusive boundary already covered it) -- excluding it here prevents a double-count across two published reports.
- An article published exactly at the current cutoff is new since the previous report and belongs in this one.
- This makes consecutive reports' windows **partition real time with no gap and no double-count**, by construction -- proven directly in `tests/weekly-report-news-window.test.cjs` (window 2's `start` literally equals window 1's `end`; an article placed exactly at that shared boundary is selected by exactly one of the two windows, never both, never neither).

**First-report fallback**: when `previousDataCutoffAt` is `null` (no report has ever been published), the window falls back to `NEWS_WINDOW_FALLBACK_DAYS = 7` calendar days before `currentDataCutoffAt` -- a documented, deterministic constant, not `Date.now()` computed independently of the snapshot builder.

**Both cutoffs are supplied by the caller, never computed here**: `previousDataCutoffAt` comes from the previous *published* snapshot's own frozen `data_cutoff_at` column (via `getPreviousPublishedSnapshot()`); `currentDataCutoffAt` comes from `snapshot-builder.ts`'s single, run-wide `dataCutoffAt` (§23). `news-window.ts` and `adapters/news-adapter.ts` never call `new Date()`.

Eligibility beyond the window: status `"analyzed"` only (a real, persisted Range-impact AI analysis already exists -- News's own pipeline, run on its own schedule, is never re-invoked from here). A `"retained"`-but-unanalyzed article is excluded rather than included with fabricated/null impact fields -- the adapter's job is to select from what's already been safely analyzed, not decide what an unanalyzed article's impact might be.

Selection: rank by impact strength (`high` > `medium` > `low`, from the persisted analysis) → relevance score → recency, capped at `NEWS_WINDOW_MAX_ITEMS = 8` (keeps the News evidence set print-budget-appropriate for the 5-page hard maximum, rather than dumping every matching article from an eventful week).

## 23. Snapshot builder / orchestration (Phase 7B)

`lib/reports/snapshot-builder.ts` -- the one file that composes every other Phase 7B piece into a full run, and the only Phase 7B file that writes to `weekly_report_snapshots`. **No `app/api/...` route imports this module** -- there is no browser- or cron-reachable entry point yet (proven by inspection, not merely asserted: `app/api/` was not touched this phase).

`runWeeklySnapshotBuild(pool, now)`:
1. `collectMacroEvidence(pool, now)` first -- its live storage observation supplies `storageWeekEndingCandidate`. (`storageWeekEnding` remains the sole report identity, §2 -- unaffected by anything below.)
2. If that candidate is null or fails `isValidStorageWeekEnding()`, return `{ status: "no_valid_storage_period" }` **without creating any DB row** -- "no fake weekly report" (Phase 7B brief).
3. `getPublishedSnapshotForWeek()` -- if already published, return `{ status: "already_published", snapshot }`.
4. `getActiveSnapshotForWeek()` -- if an attempt is already in flight, return `{ status: "active_attempt_exists", snapshot }`.
5. `getPreviousPublishedSnapshot()`. **Phase 7B.1**: `dataCutoffAt = now.toISOString()` is established **exactly once, right here** -- this call's single wall-clock input, `now`, converted to the one string every downstream piece uses. It is a *snapshot cut-off* (when this run froze its inputs), not an observation date; no evidence item's own `period`/`asOfDate` is ever overwritten with it (those stay whatever each adapter derived from the real underlying data). `getPreviousPublishedSnapshot()`'s own `dataCutoffAt` becomes `previousDataCutoffAt`. Then `createDraftSnapshot()` (linked to the previous snapshot) → `transitionToBuilding()`.
6. `collectWeeklyIntelligenceInputs(pool, { dataCutoffAt, previousDataCutoffAt }, now)` runs every remaining adapter (rigs/range-company/peers/forecast synchronously; News asynchronously, receiving `previousDataCutoffAt`/`dataCutoffAt` explicitly -- §22, not `storageWeekEnding`). No adapter computes its own "now".
7. `buildSourceManifest()` + `evaluateReportReadiness()` (§9's Phase 7B wiring).
8. If not ready: `markSnapshotFailed()` with a reason naming every missing required key; return `{ status: "failed", snapshot, reason }`.
9. Merge every adapter's items into one `WeeklyReportModules`, run `annotateMateriality()` (§21) against the previous published snapshot's modules, then `computeWeeklyChanges()` (§20) -- both now via the semantic `isEvidenceItemChanged()` rule (Phase 7B.1).
10. `buildWeeklyReportPayload()` (using the same `dataCutoffAt` from step 5) → `computeWeeklyReportFingerprint()` → `freezeSnapshot()` (atomic `building → ready`).
11. Return `{ status: "ready", snapshot, changes }`.

**Stops there.** No call anywhere in this file (or anything it imports) reaches `publishSnapshot()`, an AI provider, a chart renderer, or a PDF renderer.

## 24. Known gaps / deviations from Phase 7A (why, and what's left)

**Phase 7B.1 corrections** (both fixed real correctness bugs found in control-hub review of Phase 7B, not architecture reversals):
- **News window re-anchored from `storageWeekEnding` to the report's own `dataCutoffAt`** (§22) -- the original window silently dropped News published between the storage-week Friday and the report's actual (later) generation date. Report identity itself (§2) is untouched.
- **Change/materiality/fingerprint comparison switched from `displayValue` text to a semantic rule** (`isEvidenceItemChanged()`, §20/§21; `qualitativeFact`, §8) -- the original `prior.displayValue !== item.displayValue` comparison made truth detection dependent on formatting/rounding, so a real change that happened to round to the same display string could go undetected. One semantic-equality rule is now shared by `computeWeeklyChanges()`, `annotateMateriality()`, and (in its own curated form) `computeWeeklyReportFingerprint()`.

No Phase 7A **architecture decision** was reversed -- these are additive refinements the phase brief explicitly allowed ("if implementation exposes a real correctness problem... make the smallest safe correction"):
- **`EvidenceModuleKey` gained two members** (`range_company`, `deterministic_risk_opportunity`, §19) -- Phase 7A's category list had no explicit place for Range's own company results (distinct from comparative peer positioning) or for the risk engine's own ranked output as first-class evidence. Purely additive; nothing removed or renamed.
- **`compareQuarterly`'s parameter type was widened** from `SourcedValue | undefined` to `{ value: number | null } | undefined` (`comparisons.ts`) so the same function serves `financials-quarterly.ts`'s `SourcedValue`, `market-cap-quarterly.ts`'s `MarketCapValue`, and `eps-quarterly.ts`'s `EpsValue` without three near-duplicate functions.

Genuine **data gaps**, documented rather than papered over with a weak substitute (per the phase brief's explicit instruction):
- **No `forecastRevision` comparison for Range's forecast** (§4, §10): `lib/forecast/` has no persisted history of scenario runs (unlike STEO's `macro_steo_snapshots`), and the only parameterless, genuinely-canonical forecast output is the "default scenario" (`getCompanyForecast()`) -- the full interactive Scenario Workbench requires caller-supplied assumptions, so there is no single "the current forecast" to snapshot beyond that default. Closing this gap requires a future phase to add real scenario-state persistence; inventing a substitute comparison now (e.g. diffing against last week's frozen report row) would conflate "the model was re-run" with "a real prior forecast state."
- **`peerChange` as a distinct comparison period is not separately computed** -- peers get the same QoQ/`priorQuarterActuals` comparisons Range's own data gets (§10), not a bespoke "Range-vs-peer relative positioning" delta. Judged out of scope for a deterministic *data* layer; a relative-positioning delta is closer to a synthesis/selection decision, better suited to Phase 7C/7D.
- **DB-gated tests (including the full `runWeeklySnapshotBuild` lifecycle test) have not run against a real Postgres** -- unchanged status as of Phase 7B.1; see `docs/CURRENT_HANDOFF.md`'s closeout sections for the same sandbox limitation noted in every Phase 7 session so far.

## 25. What remains — Phase 7E through 7G (not started; not authorized by this phase)

- **7C — AI analyst call — DONE, see §26.**
- **7C.1 — Executive assessment shortened to ~150-250 words — DONE, see §26.12.**
- **7D — Chart/table/report-model/PDF renderer — DONE, see §28-§29.** Deterministic chart/table construction, a typed render model, an HTML/CSS report template, a real headless-Chromium PDF renderer (behind a swappable interface), a deterministic content-budget/page-limit policy, and a provider-agnostic artifact-storage abstraction (not yet wired to any publish flow).
- **7E — Publication + delivery surface**: an Overview "Download Weekly Report" button (tooltip copy locked, §26.11), a "latest report" read endpoint serving `getLatestPublishedSnapshot()`'s artifact, historical-archive browsing if wanted. Also where `publishSnapshot()` and `ArtifactStorageProvider.put()` (§29.7) get their first real callers -- wiring the already-built PDF bytes (§29) to a real Vercel Blob upload + `publishSnapshot()`'s artifact fields.
- **7F — Orchestration**: the actual gated cron (§17) — new `vercel.json` entry, `app/api/cron/reports/route.ts`, advisory-lock-guarded orchestration function that calls `runWeeklySnapshotBuild()`, `generateWeeklyAnalysisIfNeeded()` (§26.9), then `renderWeeklyReportPdf()` (§29.6) and (once 7E exists) carries a `ready` snapshot + assessment + PDF the rest of the way to `published`. Also where the first real (paid) Anthropic call AND the first real headless-Chromium PDF render for this subsystem should happen, via the same controlled-Preview-validation pattern Phase 6 established (§26.10, §29.8).
- **7G — End-to-end validation**: a real generated report, human-reviewed against the 5-page/visual-grammar requirements, before any production exposure.

## 26. Weekly AI Analyst layer (Phase 7C)

Phase 7C turns a `ready` frozen snapshot (Phase 7B) into ONE validated, structured, Range-focused analyst assessment. **Stops there** -- no chart/HTML/PDF rendering, no publish, no download route, no cron. The AI boundary from Phase 7A/7B is unchanged and now enforced with real grounding checks: deterministic code owns every fact, metric, period, comparison, ranking, and risk state; the model owns only prioritization, synthesis, interpretation, and narrative framing.

**Files**: `lib/reports/ai-contract.ts` (rewritten -- replaces Phase 7A's placeholder flat-narrative contract), `lib/reports/analyst-evidence-selection.ts` (pure selection), `lib/reports/analyst-input-builder.ts` (DB-touching orchestration step), `lib/reports/analyst-service.ts` (cache/generate/persist), `lib/reports/persistence/analysis-repo.ts` + a `weekly_report_analyses` table added to `schema.sql`, `lib/reports/ai/{provider.ts,model-config.ts,prompt.ts,anthropic-provider.ts}`.

### 26.1 AI input contract

`WeeklyAnalystInput` (`ai-contract.ts`):

```ts
type WeeklyAnalystInput = {
  schemaVersion: string;
  report: { storageWeekEnding: string; dataCutoffAt: string };
  marketBackdrop: WeeklyAnalystEvidenceRef[];
  riskCandidates: WeeklyAnalystRiskCandidate[];        // HIGH_RISK/MODERATE_RISK/WATCH
  opportunityCandidates: WeeklyAnalystRiskCandidate[]; // SUPPORTIVE
  whatChanged: WeeklyAnalystChangeRef[];
  range: WeeklyAnalystEvidenceRef[];
  peers: WeeklyAnalystEvidenceRef[];
  news: WeeklyAnalystEvidenceRef[];
  outlook: WeeklyAnalystEvidenceRef[];
  sourcesFreshness: WeeklyAnalystSourceFreshness[];
  previousReportContext: { storageWeekEnding: string; bottomLine: string } | null;
  evidenceAllowlist: string[]; // union of every evidenceId above -- the ONLY ids the AI may cite
};
```

`WeeklyAnalystEvidenceRef = { evidenceId, category, label, displayValue, period }`; `WeeklyAnalystRiskCandidate` adds `driver, state, rank, reason` (straight from the deterministic risk engine, via `deterministic_risk_opportunity` evidence items' own `metadata`); `WeeklyAnalystChangeRef` mirrors `WeeklyChange` (§20) directly. This is a compact, bounded, purpose-built payload -- never the raw DB row, never arbitrary unrestricted JSON.

### 26.2 Deterministic evidence selection (`analyst-evidence-selection.ts`)

Pure function `selectAnalystEvidence(payload, changes, previousReportContext) -> WeeklyAnalystInput`. Reuses Phase 7B's `rankEvidenceByMateriality()` (§21) to prefer new/changed evidence over routine unchanged metrics when a category must be capped. Hard, documented ceilings (never silently unbounded):

| Section | Limit | Why |
|---|---|---|
| marketBackdrop | 10 | Typically ≤7 items exist today (one per Macro category) -- a safety ceiling for future category growth, not an active truncation in practice |
| range (Range's own company evidence) | 8 | 9 headline metrics + variable guidance records |
| peers | 6 | Up to 36 raw items (6 tickers × 6 metrics) -- most unchanged most weeks |
| news | 5 | news-window.ts (§22) already caps at 8; re-capped tighter for what reaches the model |
| outlook (STEO + forecast_scenarios) | 6 | 9 STEO series + 2 forecast items |
| whatChanged (raw candidates offered to the model) | 8 | The model may then synthesize down to ≤5 narrative items (§26.3) |
| riskCandidates / opportunityCandidates | 5 total | Inherited directly from `macro-adapter.ts`'s existing `rankRangeMacroSignals(allSignals, 5)` cap (Phase 7B) -- not re-capped again here |

`whatChanged` raw-candidate prioritization (deterministic tie-break, not a score): `risk_state_changed`/`risk_rank_changed` first, then category-specific "new information" kinds (`new_steo_vintage`, `new_company_result_or_guidance`, `material_peer_change`, `new_retained_news_item`, `forecast_revision`), then `new_observation`, then `value_changed`; ties break by `evidenceId`. Selection is fully deterministic: identical payload + changes always produces byte-identical output (tested).

`WeeklyChange[]` is not persisted (Phase 7B decision, §20) -- `analyst-input-builder.ts` recomputes it from the target snapshot's own frozen payload and the previous *published* snapshot's payload via the same `computeWeeklyChanges()` runWeeklySnapshotBuild() itself uses, so it is always exactly reproducible from already-persisted data. `previousReportContext.bottomLine` comes from the previous snapshot's own latest **ready** analysis (`getLatestAnalysisForSnapshot`), not from the snapshot itself.

### 26.3 AI output contract

`WeeklyAnalystAssessment` (`ai-contract.ts`):

```ts
type WeeklyAnalystAssessment = {
  schemaVersion: string; aiProvider: string; aiModel: string; generatedAt: string;
  executiveAssessment: string;
  biggestRisk: { title: string; assessment: string; evidenceIds: string[] };
  biggestOpportunity: { title: string; assessment: string; evidenceIds: string[] };
  whatChanged: Array<{ title: string; assessment: string; evidenceIds: string[] }>;      // 0-5 items
  managementWatchItems: Array<{ item: string; reason: string; evidenceIds: string[] }>;  // 1-6 items
  bottomLine: string;
  selectedEvidenceIds: string[];
};
```

`executiveAssessment` word bounds: **350-700 words**, targeting ~450-550 (generous floor/ceiling around the target, same reasoning Phase 7A's original placeholder used, recalibrated to this brief's tighter target) *as originally shipped in Phase 7C -- superseded by Phase 7C.1, §26.12, which narrowed this to 120-320 words targeting ~150-250.*

### 26.4 Validation / grounding rules (`validateWeeklyAnalystAssessment`)

Pure function, no AI call, reused by `anthropic-provider.ts` to reject-and-retry before persistence:

- Required non-empty string fields (`schemaVersion`, `aiProvider`, `aiModel`, valid ISO `generatedAt`, `executiveAssessment`, `bottomLine`); `biggestRisk`/`biggestOpportunity` objects with non-empty `title`/`assessment`/`evidenceIds`; `whatChanged` an array of ≤5 well-formed narrative items; `managementWatchItems` an array of 1-6 well-formed watch items, each with **non-empty** `evidenceIds` (a watch item with no cited evidence is rejected outright -- never a fabricated forecast); `selectedEvidenceIds` a string array with no duplicates.
- **Allowlist grounding**: every evidence id cited anywhere in the response (across all fields) must be a member of `input.evidenceAllowlist`. Unknown ids reject the whole response.
- **Risk/opportunity grounding**: `biggestRisk.evidenceIds` must intersect `input.riskCandidates`' ids; `biggestOpportunity.evidenceIds` must intersect `input.opportunityCandidates`' ids. The AI cannot invent a risk/opportunity outside the deterministic risk engine's own ranking, and cannot swap the two (citing an opportunity candidate as the "biggest risk" is rejected).
- **Change grounding**: each `whatChanged` narrative item must intersect `input.whatChanged`'s ids -- the AI cannot describe a change that was not actually supplied.
- **Content guards**: a small denylist of generic-filler phrasing (`"market conditions remain dynamic"`, `"continue to monitor the situation"`, etc. -- Phase 7C brief's own named examples) rejects boilerplate outright rather than accepting it as a fallback; a Macro-precedent-mirrored guaranteed-outcome-language denylist (`"will rise"`, `"will outperform"`, `"guaranteed to"`, etc.) applies to `executiveAssessment` and `bottomLine`.

No secondary "fix the AI's mistake" call exists anywhere -- a malformed/ungrounded response is rejected and, within the same bounded retry (§26.6), re-sampled fresh; the phase brief explicitly forbids using a second AI call to correct a first one's factual errors.

### 26.5 Prompt design (`lib/reports/ai/prompt.ts`)

One production system prompt (`SYSTEM_PROMPT`) establishing: persona (senior U.S. natural-gas/E&P equity-research analyst, audience = Range management/IR/decision-makers); that the supplied payload is the COMPLETE factual universe (no outside knowledge, no model-memory company facts, no browsing, no tools); that every number/date/ranking must come from supplied evidence; the risk/opportunity/whatChanged grounding rules mirrored in prose form; that mixed/uncertain evidence should be described as such, never forced into false confidence; no guaranteed-outcome or promotional language; and that `executiveAssessment` should synthesize relationships between facts (e.g. how storage + LNG demand interact for Range's realized pricing), not mechanically restate each metric in turn.

`formatAnalystInputForPrompt(input)` is a separate, pure, independently-tested function: deterministically renders the structured input to text, with every evidence line carrying its `[evidenceId]` in brackets so the model can cite it precisely.

**Versioning**: `WEEKLY_ANALYST_PROMPT_VERSION` (`ai/model-config.ts`, `"1.1.0"` as of Phase 7C.1, was `"1.0.0"` in Phase 7C) is independent of `WEEKLY_ANALYST_SCHEMA_VERSION` (`ai-contract.ts`, `"1.1.0"` as of Phase 7C.1, was `"1.0.0"` in Phase 7C) -- a prompt wording change that doesn't touch the output schema still bumps the prompt version and therefore the analysis fingerprint (§26.7); Phase 7C.1 bumped both, since it changed both the prompt wording and the word-count validation rule.

### 26.6 Model configuration (`lib/reports/ai/model-config.ts`)

`WEEKLY_ANALYST_MODEL = "claude-haiku-4-5"` -- this project's currently-approved model (unchanged; matches `MACRO_SUMMARY_MODEL`), kept as this subsystem's own constant per the Phase 6A boundary (each domain's AI config independently editable). `WEEKLY_ANALYST_MAX_OUTPUT_TOKENS = 2200` (reduced from Phase 7C's original `3000` in Phase 7C.1, reflecting the shorter ~150-250 word executiveAssessment -- generous headroom for the full structured output: executiveAssessment + 2 narrative items + ≤5 whatChanged + ≤6 watch items + bottomLine + JSON overhead). Forced tool-use (`tool_choice: { type: "tool", name: "submit_weekly_range_analyst_assessment" }`), mirroring `AnthropicMacroSummaryProvider`/`AnthropicNewsAnalysisProvider` exactly, for the same reliability reason: a plain-text completion could come back conversational or malformed, a tool call must supply every required field in a type-checked shape. Retry: `withBoundedRetry` imported directly from `lib/news/ai/retry.ts` (confirmed domain-neutral, zero News coupling -- same reuse Macro's own service already established), `DEFAULT_ANALYSIS_RETRY_CONFIG` (3 attempts, 400ms base backoff) -- unchanged project-wide policy, not a new one. **Target: one model invocation per weekly report** -- no per-section calls, no per-chart calls, no iterative refinement loop.

### 26.7 Analysis fingerprint / idempotency

`computeWeeklyAnalystFingerprint({ snapshotFingerprint, schemaVersion, promptVersion, model })` (`analyst-service.ts`) -- SHA-256 of the four components delimiter-joined (a flat, already-stable-string join is sufficient here, unlike `fingerprint.ts`'s richer canonicalize-then-hash treatment of nested evidence). `snapshotFingerprint` is the frozen snapshot's own `input_fingerprint` (Phase 7B, §8) -- so a snapshot whose underlying evidence changed at all produces a different analysis fingerprint automatically, with no separate re-derivation. Same snapshot + same prompt version + same schema version + same model → same fingerprint → the cached `ready` row is returned, and AI is never re-invoked (verified: a cache hit results in zero provider calls). Changing any one of the four produces a new fingerprint and a fresh analysis.

### 26.8 Persistence (`weekly_report_analyses`, `analysis-repo.ts`)

New table, added to `lib/reports/persistence/schema.sql` (same migration path, `npm run report:migrate`). One row per generation **attempt** (mirrors `weekly_report_snapshots`' own convention exactly), linked by `snapshot_id` (`REFERENCES weekly_report_snapshots(id) ON DELETE CASCADE`):

| Column | Purpose |
|---|---|
| `id`, `snapshot_id` | PK, FK to the frozen snapshot this analysis is for |
| `analysis_fingerprint` | §26.7 |
| `status` | `pending \| ready \| failed` -- simpler than the snapshot's own pending/building/ready/published/failed, since one AI call (with its own internal bounded retry) either succeeds or fails, no multi-step "building" phase |
| `error_message` | Required (`CHECK`) when `status = 'failed'` |
| `schema_version`, `prompt_version`, `ai_provider`, `ai_model` | Auditability |
| `assessment` | The full validated `WeeklyAnalystAssessment` JSONB -- set only at `pending → ready`, never rewritten |
| `attempted_at`, `completed_at`, `created_at`, `updated_at` | Timestamps |

**Two partial unique indexes**, exactly mirroring `weekly_report_snapshots`' pattern (§6): `weekly_report_analyses_active_fingerprint_key` (at most one `pending` row per fingerprint -- prevents two concurrent callers both invoking AI for the same frozen snapshot+prompt+schema+model) and `weekly_report_analyses_ready_fingerprint_key` (at most one `ready` row per fingerprint, ever -- the DB-level cache/idempotency guarantee, not just application discipline). A `CHECK` constraint forbids a `ready` row from ever being incomplete, mirroring `weekly_report_snapshots_published_complete_check`.

### 26.9 Cache-hit / generation flow (`generateWeeklyAnalysisIfNeeded`, `analyst-service.ts`)

Mirrors `lib/market/macro-summary-service.ts`'s `generateMacroSummaryIfNeeded` structurally: (1) look up `getReadyAnalysis(fingerprint)` -- return `{status: "cache_hit"}` if found, zero provider calls; (2) look up `getActiveAnalysis(fingerprint)` -- return `{status: "in_progress"}` if another attempt is currently pending (never double-invoke); (3) `createPendingAnalysis()` (idempotent -- a concurrent caller racing this exact call gets back the same row rather than a duplicate); (4) call `provider.analyze(input)` wrapped in `withBoundedRetry`; (5a) on success, `validateWeeklyAnalystAssessment()` then `markAnalysisReady()` (atomic `pending → ready`); (5b) on failure (timeout, malformed JSON, schema violation, invalid evidence ids, failed grounding, provider error -- any thrown error), `markAnalysisFailed()` (atomic `pending → failed`) with a truncated safe error message, never a fabricated fallback narrative, and the deterministic snapshot itself is never touched. A failed attempt's row is terminal for itself but never blocks a fresh retry (a new `pending` row) for the same fingerprint, and can never be resurrected into or confused with a `ready` row.

Not called from any browser-facing route -- confirmed by a source-inspection test scanning every file under `app/api/` for any reference to the Weekly Analyst AI layer (none found; no `app/api/reports` directory exists at all). Intended for a future Phase 7F scheduled orchestration (mirroring `app/api/cron/macro/route.ts` → `runMacroDailyOrchestration()`), not built in Phase 7C.

### 26.10 Optional live validation (not run in Phase 7C)

No live Anthropic call was made during Phase 7C implementation or testing -- every test uses an in-process fake provider (mirrors `tests/macro-summary-service.test.cjs`'s own `countingProvider` pattern exactly). The existing project pattern for a controlled first real call is Phase 6's `docs/CURRENT_HANDOFF.md`-documented `vercel curl` + hidden-input `CRON_SECRET` validation against a Preview deployment (see the Phase 6 closeout section of that document) -- Phase 7C did not build an equivalent trigger route (none is authorized yet; that is Phase 7F's job), so there is currently no way to invoke this against a live Preview at all. A future phase's orchestration route should follow that same manual-validation pattern before any scheduled/automatic invocation.

### 26.11 Management tooltip copy -- LOCKED for Phase 7F (do not implement UI yet)

A future phase (Phase 7F, alongside the Overview page's "Download Weekly Intelligence Report" button) will add a hover/focus tooltip on that button. **Not implemented in Phase 7C** -- copy locked here so Phase 7F implements it exactly or very closely:

> "Generated automatically each week after the latest EIA natural gas storage data is validated. The report combines Range company data, natural gas market fundamentals, peer trends, forecasts and material news into a frozen weekly snapshot. Deterministic analytics identify the key changes, risks and opportunities, then AI synthesizes the validated evidence into a concise Range-focused management briefing."

Required UI behavior for Phase 7F: appears on hover **and** keyboard focus (not click-only); compact, management-friendly tooltip/popover; no system jargon; must reassure the reader that AI synthesizes already-validated evidence rather than inventing the underlying analytics. If a shorter variant is needed for UI fit, preserve these five ideas: (1) generated automatically after the latest EIA storage validation, (2) combines Macro + Range + peers + forecasts + News, (3) freezes a weekly validated snapshot, (4) deterministic analytics find changes/risks/opportunities, (5) AI synthesizes that evidence into the management briefing.

### 26.12 Phase 7C.1 correction — executiveAssessment shortened to ~150-250 words

Smallest reasonable modification to Phase 7C, made in the same session as Phase 7D once product feedback established that the executive assessment should be a fast opening read, not the report's entire analytical payload -- Phase 7D's evidence sections (§29) now carry the detailed analysis instead.

**Changed:**
- `ai-contract.ts`: `MIN_EXECUTIVE_ASSESSMENT_WORDS`/`MAX_EXECUTIVE_ASSESSMENT_WORDS` narrowed from `350`/`700` to `120`/`320` (same proportional floor/ceiling buffer around the new ~150-250 target that Phase 7C's original bounds used around its own ~450-550 target). `WEEKLY_ANALYST_SCHEMA_VERSION` bumped `"1.0.0" → "1.1.0"`.
- `ai/prompt.ts`: `SYSTEM_PROMPT`'s final paragraph rewritten to instruct ~150-250 words across 2-3 concise paragraphs (paragraph 1: backdrop + what changed; paragraph 2: Range-specific implication, biggest risk/opportunity; paragraph 3 optional: outlook/watch item), explicitly "not a bulleted list," and instructs the model to separate paragraphs with a blank line so `render-model-builder.ts` (§29.2) can split them deterministically for the PDF template.
- `ai/model-config.ts`: `WEEKLY_ANALYST_MAX_OUTPUT_TOKENS` reduced `3000 → 2200`; `WEEKLY_ANALYST_PROMPT_VERSION` bumped `"1.0.0" → "1.1.0"`.
- `ai/anthropic-provider.ts`: the tool's `input_schema.executiveAssessment` description string updated to match (`~150-250 word, 2-3 paragraph...`).

**Unchanged:** the output *shape* (`WeeklyAnalystAssessment`'s fields), every grounding/allowlist/risk-opportunity-change-citation rule (§26.4), the generic-filler/guaranteed-language denylists, and the one-call-per-report architecture (§26.6) -- no second AI call was added anywhere, for this or any other report section (see §29.5's explicit "no new AI calls" boundary for Phase 7D's own commentary).

**Tests updated:** `tests/weekly-report-ai-contract.test.cjs` (word-count fixtures moved inside the new 120-320 range; added an explicit "accepts within the 150-250 target" case), `tests/weekly-report-analyst-prompt.test.cjs` (added assertions that `SYSTEM_PROMPT` states the 150-250 word target and instructs a 2-3 paragraph, non-bulleted structure), `tests/weekly-report-analyst-service.test.cjs` (its DB-gated fixture's fake `executiveAssessment` word count reduced to stay valid under the new bounds).

## 27. Files added

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

**Phase 7B.1** (corrective pass; no new files, all modifications to existing Phase 7B files):
```
lib/reports/news-window.ts (modified)                — cutoff-anchored (previousDataCutoffAt, currentDataCutoffAt] window, §22
lib/reports/adapters/news-adapter.ts (modified)       — collectNewsEvidence() takes cutoffs, not storageWeekEnding
lib/reports/changes.ts (modified)                     — +exported isEvidenceItemChanged(), semantic (not displayValue) comparison, §20
lib/reports/fingerprint.ts (modified)                 — qualitativeFact replaces unconditional displayValue, §8
lib/reports/snapshot-builder.ts (modified)             — establishes ONE dataCutoffAt per run; annotateMateriality() uses isEvidenceItemChanged(), §23
tests/weekly-report-news-window.test.cjs (rewritten)  — cutoff/contiguity/fallback semantics
tests/weekly-report-changes.test.cjs (extended)       — numeric-vs-displayValue, new-period-same-value, risk-item-unaffected cases
tests/weekly-report-fingerprint.test.cjs (extended)   — qualitativeFact stability/sensitivity cases
docs/PHASE_7_WEEKLY_REPORT_ARCHITECTURE.md (updated)  — this document
docs/CURRENT_HANDOFF.md (updated)                     — Phase 7B.1 closeout note
```

**Phase 7C**:
```
lib/reports/ai-contract.ts (rewritten)             — real WeeklyAnalystInput/WeeklyAnalystAssessment + validateWeeklyAnalystAssessment(), §26.1/26.3/26.4
lib/reports/analyst-evidence-selection.ts          — deterministic, bounded evidence selection, §26.2
lib/reports/analyst-input-builder.ts               — DB-touching step: recomputes changes, fetches previous report context
lib/reports/analyst-service.ts                     — generateWeeklyAnalysisIfNeeded(), computeWeeklyAnalystFingerprint(), §26.7/26.9
lib/reports/persistence/analysis-repo.ts           — weekly_report_analyses CRUD/lifecycle helpers
lib/reports/persistence/schema.sql (modified)      — +weekly_report_analyses table, §26.8
lib/reports/ai/provider.ts                         — WeeklyAnalystProvider interface + Noop implementation
lib/reports/ai/model-config.ts                     — model/token/pricing/prompt-version constants, §26.6
lib/reports/ai/prompt.ts                           — SYSTEM_PROMPT + formatAnalystInputForPrompt(), §26.5
lib/reports/ai/anthropic-provider.ts                — AnthropicWeeklyAnalystProvider, forced tool-use
tests/weekly-report-ai-contract.test.cjs (rewritten) — validation/grounding rules (no DB)
tests/weekly-report-analyst-evidence-selection.test.cjs — selection limits/prioritization/determinism (no DB)
tests/weekly-report-analyst-prompt.test.cjs         — prompt formatting determinism (no DB)
tests/weekly-report-analyst-service.test.cjs        — fingerprint (no DB) + source-inspection AI-boundary check (no DB) + cache/generate/persist/failure lifecycle (DB-gated, fake provider)
docs/PHASE_7_WEEKLY_REPORT_ARCHITECTURE.md (updated) — this document
docs/CURRENT_HANDOFF.md (updated)                    — Phase 7C closeout note
```

**Phase 7C.1** (corrective pass; no new files, all modifications to existing Phase 7C files — see §26.12):
```
lib/reports/ai-contract.ts (modified)                — word bounds 350-700 → 120-320; schemaVersion 1.0.0 → 1.1.0, §26.12
lib/reports/ai/prompt.ts (modified)                  — SYSTEM_PROMPT rewritten for ~150-250 words / 2-3 paragraphs / blank-line separator, §26.12
lib/reports/ai/model-config.ts (modified)            — max output tokens 3000 → 2200; promptVersion 1.0.0 → 1.1.0, §26.12
lib/reports/ai/anthropic-provider.ts (modified)      — tool input_schema description string updated to match
tests/weekly-report-ai-contract.test.cjs (modified)  — fixtures moved inside the new word-bound range
tests/weekly-report-analyst-prompt.test.cjs (modified) — new assertions for the 150-250/2-3-paragraph prompt instructions
tests/weekly-report-analyst-service.test.cjs (modified) — fake executiveAssessment word count reduced to stay valid
docs/PHASE_7_WEEKLY_REPORT_ARCHITECTURE.md (updated) — this document
docs/CURRENT_HANDOFF.md (updated)                    — Phase 7C.1 + 7D closeout note
```

**Phase 7D**:
```
lib/reports/render/render-model.ts                  — typed WeeklyReportRenderModel + ChartPlan/TablePlan/EvidenceSection etc., §28.1
lib/reports/render/content-budget.ts                — STANDARD_BUDGET/REDUCED_BUDGET/MAX_PDF_PAGES, §29.4
lib/reports/render/chart-selection.ts                — buildComparisonBarChart/buildMultiItemBarChart/buildPeerBarChart/buildActualVsForecastBarChart, §29.3
lib/reports/render/table-builder.ts                  — buildAtAGlanceTable/buildPeerComparisonTable/buildRisksOpportunitiesTable/buildNewsTable/buildSourcesFreshnessTable, §29.3
lib/reports/render/commentary.ts                     — composeEvidenceCommentary/composeMultiItemCommentary/composeRangeImplication (deterministic, no AI), §29.5
lib/reports/render/evidence-sections.ts              — candidate generation + materiality-ranked, budget-capped selection for pages 2-4, §29.2
lib/reports/render/render-model-builder.ts           — buildWeeklyReportRenderModel(), the one place a render model is constructed, §29.2
lib/reports/render/svg-charts.ts                     — deterministic inline SVG bar-chart rendering, §29.3
lib/reports/render/branding.ts                       — loadRrcLogoDataUri(), reuses the existing approved assets/logos/RRC.png, §29.6
lib/reports/render/html-template.ts                  — renderReportHtml(), the institutional-report HTML/CSS template, §29.1
lib/reports/render/pdf-renderer.ts                   — PdfRenderer interface, ChromiumPdfRenderer (puppeteer-core + @sparticuz/chromium), countPdfPages(), §29.6
lib/reports/render/artifact-store.ts                 — ArtifactStorageProvider interface, InMemoryArtifactStore, VercelBlobArtifactStore, §29.7
lib/reports/render/weekly-report-pdf-service.ts      — renderWeeklyReportPdf(): initial render + one reduced-content retry + fail-safe, §29.4
tests/fixtures/weekly-report-fixture.ts              — realistic, typed, hand-authored fixture payload + assessment (test fixture only, no real Range data), used by Phase 7D's own tests and this session's local visual QA
tests/weekly-report-render-model.test.cjs            — render-model/chart/table/commentary/evidence-section-selection tests + source-inspection guardrails (no DB)
tests/weekly-report-content-budget.test.cjs          — budget-tier constant tests (no DB)
tests/weekly-report-pdf-service.test.cjs             — countPdfPages, PdfRenderer/ArtifactStorageProvider safe defaults, retry/fail-safe policy (fakes only, no DB, no live Chromium)
tests/weekly-report-html-render.test.cjs             — HTML template/SVG chart rendering + XSS-escaping regression tests (no DB)
package.json (modified)                              — +puppeteer-core, +@sparticuz/chromium, +@vercel/blob, §29.6/29.7
docs/PHASE_7_WEEKLY_REPORT_ARCHITECTURE.md (updated) — this document (§28-§29 added)
docs/CURRENT_HANDOFF.md (updated)                    — Phase 7C.1 + 7D closeout note
```

## 28. Phase 7D design direction (exercised with explicit design latitude)

Phase 7D's own brief listed a page-by-page template (Page 1 = executive snapshot, Pages 2-4 = evidence, final page = closing) as **product intent and examples, not a rigid template** -- a follow-up clarification during this session explicitly granted ownership of the final information architecture, chart choice, typography, and text-vs-visual balance, while keeping every hard constraint (5-page maximum, 150-250 word opening assessment, no metric dump, no extra AI calls, no fabricated facts/charts, deterministic evidence as the sole factual authority) fully intact. What follows documents the actual decisions made, not a transcription of the brief's outline.

**Information architecture actually built:** masthead + classification line → 2-3 paragraph executive assessment → a compact 3-column stat-tile "At a Glance" strip → Biggest Risk / Biggest Opportunity side by side at equal visual weight → a "What Changed" list → (page break) → a dynamically-selected, materiality-ranked sequence of evidence sections (chart-only sections render as a 2-column chart-left/commentary-right layout; table-bearing sections run full width, since a multi-column table needs the room) → Key Risks & Opportunities table → What Management Should Watch → a Bottom Line closing band → Sources & Data Freshness. Section *order* within pages 2-4 is itself materiality-driven (the same `rankEvidenceByMateriality` comparator Phase 7B/7C already established, applied to a "most-material representative item" per candidate subject, §29.2) rather than a fixed narrative sequence -- the week's biggest story leads, every week, without a human re-ordering anything.

**Typography:** a serif display face (Georgia -- universally available, no external font fetch, works identically inside a headless-Chromium print context) for the title/section headings, paired with a plain sans body/table face -- the same masthead-vs-body contrast an equity-research document uses, deliberately different from this project's own dark-themed interactive dashboard (`app/globals.css`), which was never an appropriate visual reference for a printed institutional PDF.

**Visual QA performed this session:** a realistic, fully deterministic fixture (`tests/fixtures/weekly-report-fixture.ts`) was rendered through the complete real pipeline (`buildWeeklyReportRenderModel` → `renderReportHtml` → real headless Chromium, using the local machine's installed Google Chrome as the browser binary, NOT `@sparticuz/chromium`'s Lambda-only binary -- see §29.8) to produce real, visually-inspected PDF files (not committed to the repo -- session-local scratch files only). Two variants were rendered: the fixture as authored (a "quiet-ish" week, 4 pages) and a second variant with several additional categories' materiality forced up (a "busy" week exercising every chart kind: `comparisonBar`, `multiItemBar`, `peerBar`, `actualVsForecastBar` -- 5 pages, still within the hard maximum). Concrete fixes made from that visual pass:
- **Bar-chart baseline**: an all-positive series whose values sit within a tight relative band (e.g. four storage readings all within ~6% of each other) was originally forced onto a zero-based axis, which made every bar read as nearly full height and hid the real week-over-week difference the chart exists to show. `svg-charts.ts`'s `computePlotRange()` now floors the axis just below the lowest bar for that specific case (a genuinely negative value, e.g. free cash flow, always keeps a real, visible zero baseline -- see the dashed zero-reference line drawn in that case). Every bar still prints its own exact value/label regardless -- this only changes bar *height*, never what's stated.
- **Rig Activity chart**: the national U.S. rig count (hundreds) and the individual Appalachian basin counts (tens) share a unit ("rigs") but not a comparable scale -- charting them together dwarfed the two basin bars Range actually cares about. `evidence-sections.ts` now charts only the basin-level items together (a legitimate multi-item comparison) and states the national count as a plain sentence instead.
- **News Range Implication wording**: originally said "...Range impact for this item" underneath a table listing multiple headlines, ambiguous about which headline it referred to; now names the specific headline (`commentary.ts`'s `newsRangeImplication()`).
- **STEO table redundancy**: the table's own title duplicated its section heading almost verbatim, plus a redundant repeated source line; the table title was changed to "Tracked STEO Series" and its `sourceLine` dropped (the section heading already establishes the source).
- **Sources table page-split**: `STANDARD_BUDGET.maxSourceRows` (14) let the sources table span across a page boundary, leaving a following page almost entirely blank; reduced to `10` (`8` for `REDUCED_BUDGET`) and `.table-block` given `break-inside: avoid` in the CSS so a table now moves to the next page as a whole rather than splitting awkwardly.

No live Anthropic call was made for this exercise (the fixture's `WeeklyAnalystAssessment` is hand-authored fixture data, not AI-generated) and nothing was published, downloaded, or deployed -- see §29.8 for the full confirmation.

## 29. Deterministic chart/table/report-model/PDF rendering layer (Phase 7D)

Turns a `ready`/`published` snapshot's frozen `WeeklyReportPayload` + its persisted `WeeklyAnalystAssessment` into real PDF bytes in memory. **Stops there** -- no publish, no download route, no cron, no UI entry point. The AI boundary is unchanged and, if anything, more strictly enforced than Phase 7C alone: nothing under `lib/reports/render/` imports the AI provider/prompt layer, the persistence/DB layer, or calls `publishSnapshot()` (all three enforced by source-inspection tests in `tests/weekly-report-render-model.test.cjs`).

### 29.1 Report render model (`lib/reports/render/render-model.ts`)

`WeeklyReportRenderModel` is the one shape `html-template.ts` is allowed to read from -- it never reaches back into the raw payload or assessment. Key fields: `identity` (title/subtitle/week-ending/data-cutoff labels), `executiveAssessmentParagraphs: string[]` (already split), `atAGlanceTable`, `biggestRisk`/`biggestOpportunity: CalloutItem | null`, `whatChanged: CalloutItem[]`, `evidenceSections: EvidenceSection[]`, `keyRisksAndOpportunitiesTable`, `managementWatchItems`, `bottomLine`, `sourcesFreshnessTable`, `generatedAtLabel`, `budgetTier`, `omittedContentLabels: string[]` (what a lower-materiality subject the content budget dropped this week -- surfaced as a small footnote, never silently vanished). `ChartPlan` (`kind: "comparisonBar" | "multiItemBar" | "peerBar" | "actualVsForecastBar"`, `bars: ChartBar[]`) and `TablePlan` (`columns`, `rows`, `truncatedCount`) are the two presentation-data primitives every evidence section is built from.

### 29.2 Render-model construction & evidence-section selection

`buildWeeklyReportRenderModel(payload, assessment, tier)` (`render-model-builder.ts`) is the ONE place a render model is constructed, from exactly the two frozen/persisted inputs -- no DB call, no live fetch, no AI call, anywhere in this file or downstream of it. `executiveAssessmentParagraphs` splits the AI's response on a blank-line separator (the Phase 7C.1 prompt, §26.12, explicitly instructs this), falling back to grouping sentences into ~3-sentence paragraphs if the model's response didn't include one -- rendering never depends on the AI having followed that formatting instruction exactly, only `ai-contract.ts`'s actual hard validation rules are enforced.

`buildEvidenceSections(payload, budget)` (`evidence-sections.ts`) builds ONE candidate per plausible subject (gas pricing, storage, U.S. supply, Appalachia, LNG, power/data-center demand, industrial demand, rig activity, STEO outlook, Range company metrics, peer comparison, Range-vs-forecast, material News), each already knowing how to build its own chart/table/commentary/Range-implication. Selection is fully dynamic (Section 4's "do not rigidly force every subsection every week" -- a subject with no evidence this week simply produces no candidate, never a zero-filled section): candidates are ranked by reusing `rankEvidenceByMateriality()` (§21) twice -- once per multi-item candidate (e.g. Rig Activity) to find its own most-material representative item, once again across all candidates' representative items to rank the candidates against each other -- then the top `budget.maxEvidenceSections` are kept; the rest are returned as `omittedLabels` for the render model's own footnote. `selectedEvidenceIds`/`biggestRisk`/`biggestOpportunity`/`whatChanged` from the AI assessment are NOT consulted for chart/section selection at all (Section 8 permits using them as "one signal"; this implementation found the deterministic materiality ranking alone sufficient and simpler, and avoids any risk of the AI's own citations quietly steering which evidence gets a chart) -- deterministic code is the sole authority.

### 29.3 Deterministic chart & table construction

`chart-selection.ts` builds `ChartPlan`s whose every bar value traces directly to a `WeeklyEvidenceItem`'s own `currentValue`/`comparisons[].previousValue` -- nothing is calculated, estimated, or invented. Four chart kinds, matched to what the frozen payload actually supports (a `WeeklyEvidenceItem` carries only its own current value plus a small set of *named* comparison points -- WoW/YoY/vs5yrAvg/MoM/QoQ/steoVintage, see `comparisons.ts` §10 -- never a full historical series, since Phase 7B's evidence items are a snapshot, not a time-series store):
- `comparisonBar` — one item's current value + up to 3 of its own available comparison points (`buildComparisonBarChart`; returns `null` if the item has no real current value or no available comparison -- nothing to chart).
- `multiItemBar` — several same-unit, comparable-scale items observed at the same time (e.g. Marcellus + Utica rig counts; deliberately excludes the national U.S. count, §28's visual-QA fix).
- `peerBar` — Range's own current value for one metric + each peer's current value for the *same* metric, via an explicit, documented `rangeMetricKey`↔`peerMetricKey` mapping (`table-builder.ts`'s `RANGE_VS_PEERS_METRICS` / `evidence-sections.ts`'s chart-side constant) since the two categories' metricKeys were never designed to align 1:1.
- `actualVsForecastBar` — Range's own latest actual vs. its own default-scenario forecast for a related metric, via a similar explicit mapping (`ACTUAL_VS_FORECAST_METRICS`).

`table-builder.ts` builds `atAGlanceTable` (a diversity-aware, one-representative-per-category, materiality-ranked strip), `peerComparisonTable` (Range + peers across the same explicit metric mapping `peerBar` uses; a genuinely missing cell renders `"--"`, never fabricated, and a metric column is omitted entirely if Range's own side is missing), `risksOpportunitiesTable` (sorted by the deterministic risk engine's own rank), `newsTable`, and `sourcesFreshnessTable` -- every builder truncates deterministically at its budget cap and reports `truncatedCount` rather than silently dropping rows.

`svg-charts.ts` renders each `ChartPlan` as inline SVG -- no chart library, no client-side JS, no canvas. `computePlotRange()` (§28's visual-QA fix) keeps a real, visible zero baseline whenever any value is negative, but floors the axis just below the lowest bar for an all-positive series whose values sit within a tight relative band (<20% spread) -- a display-only decision (every bar still prints its own exact value) that keeps a real week-over-week difference visible instead of every bar reading as "full height" against a forced zero.

### 29.4 Deterministic content budget & 5-page hard-limit policy

`content-budget.ts` defines exactly two tiers -- `STANDARD_BUDGET` (the normal weekly render) and `REDUCED_BUDGET` (every cap tightened; used for the one allowed retry) -- as fixed, documented ceilings (`maxEvidenceSections: 6/4`, `maxAtAGlanceMetrics: 6/5`, `maxPeerCompanies: 6/4`, `maxRisksOpportunitiesRows: 8/6`, `maxNewsRows: 5/3`, `maxSourceRows: 10/8`, `maxWhatChangedItems: 5/4`, `maxWatchItems: 6/4`, `maxCommentarySentences: 3/2`), never an invented numeric score. There is no third tier.

`weekly-report-pdf-service.ts`'s `renderWeeklyReportPdf(payload, assessment, pdfRenderer, logoDataUri)` is the exact policy from Section 17: render at `STANDARD_BUDGET`; if the REAL resulting PDF's page count (from `PdfRenderer.renderPdf()`, never an estimate) is `<= MAX_PDF_PAGES` (5), return it; otherwise render exactly once more at `REDUCED_BUDGET`; if that fits, return it (`reducedContent: true`); if it still doesn't fit, return `{ status: "failed", reason, lastPageCount }` -- no AI retry, no third tier, no loop. Tested against a fake `PdfRenderer` whose page counts per call are injected, so this policy is fully exercised without ever launching a real browser.

### 29.5 Commentary & Range Implications — deterministic, no new AI calls

Section 11's architectural rule holds exactly: Phase 7 remains ONE AI invocation per weekly report (the Phase 7C/7C.1 analyst assessment) -- `commentary.ts` adds zero new AI calls. `composeEvidenceCommentary()`/`composeMultiItemCommentary()` are template sentences with typed values substituted in (current value + period, then one sentence per available comparison, direction-aware) -- never an invented interpretation beyond what the `ComparisonResult`/`MaterialityInputs` data itself states. `composeRangeImplication()` only returns non-null when a template exists for the item's category AND the representative item is genuinely high-materiality (new/changed/high-risk/large-magnitude move) -- never forced under every chart. This is intentionally a simple v1 (documented in the source as such): real analyst-grade connective prose is exactly what the one AI call's `executiveAssessment`/`biggestRisk`/`biggestOpportunity` narrative already provides; a richer deterministic NLG layer for per-section commentary remains a future enhancement, not something to reach for by adding more model calls.

### 29.6 PDF rendering (`lib/reports/render/pdf-renderer.ts`, `branding.ts`)

Architecture: `puppeteer-core` (no bundled browser binary) + `@sparticuz/chromium` (a Chromium build + launch-arg set purpose-built for serverless/Lambda-style runtimes) -- the standard, widely-used pairing for real headless-Chromium PDF generation on a Vercel-style serverless platform, avoiding both the full `puppeteer` package's desktop-sized Chromium download (unsuitable for a serverless function's size limits) and any paid third-party rendering service. `@sparticuz/chromium`'s own package is a real, non-trivial download (~65MB unpacked) -- documented rather than hidden, and justified as currently the standard solution for exactly this requirement. `ChromiumPdfRenderer implements PdfRenderer` (the same provider-interface + `NoopPdfRenderer` safe-default pattern as `ai/provider.ts`), lazy-importing both packages inside `renderPdf()` so a test run that only exercises fakes never loads them. Produces a Letter-sized PDF with `displayHeaderFooter: true` and a `footerTemplate` (page numbers via Puppeteer's own `pageNumber`/`totalPages` placeholders -- **not** CSS `@page` counters, which Chromium's print engine does not reliably support for Paged Media). `countPdfPages()` counts real `/Type /Page` objects via a direct byte-level scan (explicitly excluding the `/Type /Pages` tree node) -- a deliberately lightweight heuristic instead of a full PDF-parsing dependency, reliable for the one PDF producer (Chromium) this subsystem ever uses.

`branding.ts`'s `loadRrcLogoDataUri()` reuses the existing approved `assets/logos/RRC.png` (the same file `config/company-logos.json` already points every dashboard logo usage at) -- base64-embedded as a `data:image/png;base64,...` URI so the HTML has no external asset dependency at render time. Returns `null` (never a fabricated placeholder) if the file is ever missing; `html-template.ts` falls back to a plain text "RANGE RESOURCES" wordmark in that case. The proprietary July 2026 reference DOCX was never read, copied, or committed.

### 29.7 Artifact storage abstraction (`lib/reports/render/artifact-store.ts`)

Same provider-interface pattern again: `ArtifactStorageProvider.put(key, buffer, contentType)`. `InMemoryArtifactStore` (a plain `Map`, real I/O never touched) is what `weekly-report-pdf-service.ts`'s own tests use. `VercelBlobArtifactStore` is the real implementation, gated on `BLOB_READ_WRITE_TOKEN` exactly like `AnthropicWeeklyAnalystProvider` is gated on `ANTHROPIC_API_KEY` (throws `ArtifactStorageError` immediately at construction if the token is missing, never at an unexpected later call site), lazy-importing `@vercel/blob`. **Nothing calls `put()` anywhere in this subsystem yet** -- wiring this to a real publish flow is explicitly Phase 7E's job (§25).

### 29.8 Live-validation status (not run in Phase 7D)

No live Chromium PDF render occurred against `@sparticuz/chromium`'s real serverless binary in this session (it is Linux/Lambda-only and cannot run on a macOS development machine) -- the local visual-QA pass described in §28 used `puppeteer-core` pointed at the local machine's own installed Google Chrome via `ChromiumPdfRenderer`'s `executablePath` override option, which exists specifically for this kind of local development use. The exact `puppeteer-core` ↔ `@sparticuz/chromium` version pairing and the Vercel project's selected Node.js runtime (`@sparticuz/chromium` requires Node `^22.17.0` or `>=24.0.0`) have NOT been confirmed against a real Vercel Preview deployment -- this must happen via a real controlled invocation (mirroring Phase 6's `vercel curl` + `CRON_SECRET` pattern) before Phase 7F ever calls this renderer from a scheduled/production path. No live Anthropic call occurred (the visual-QA fixture's assessment is hand-authored, not AI-generated). Nothing was published, no artifact was uploaded to a real Vercel Blob store, no download route/UI/cron was added, and no PR/merge/Production action occurred.

No existing file outside `lib/reports/` (and its own tests) was modified in any Phase 7 session so far. No new API route, no new UI, no new npm dependency, no chart/PDF-rendering or publish code anywhere. No live Anthropic call occurred during Phase 7C.
