# Current Handoff

## PHASE 7D.1 CLOSEOUT — READ THIS FIRST (2026-09-02)

Small follow-up to Phase 7D: visual polish informed by a real (local-only, never-committed) look at the July 2026 reference outlook, plus the two required technical checks -- serverless-Chromium/puppeteer-core compatibility, and a real attempt at live-Vercel Chromium validation. Full detail in `docs/PHASE_7_WEEKLY_REPORT_ARCHITECTURE.md` §29.9 — this section only summarizes.

### WHAT CHANGED

- **Visual**: bolder accent-blue rule under section headings, an accent-blue left border on at-a-glance stat tiles, a stronger table-stripe tint. Re-rendered and re-inspected the fixture PDF after each change; page count unchanged (4 pages).
- **Real bug fixed**: `ChromiumPdfRenderer` was launching with `args: chromium.args, headless: true` directly; `@sparticuz/chromium`'s own documented usage wraps this as `puppeteer.defaultArgs({ args: chromium.args, headless: "shell" })` with `headless: "shell"`. Fixed to match exactly.
- **Version-compatibility finding (checked, not guessed)**: `puppeteer-core@25.9.0`'s own GitHub release notes confirm it's tested against Chrome 152.0.7977.54; `@sparticuz/chromium@149.0.0` (its latest published version — confirmed via `npm view`, no newer release exists) bundles Chromium 149. A real, documented, bounded ~3-version gap — not fixed (downgrading puppeteer-core would trade a current release for a worse one over a protocol-stable operation set), but now precisely characterized instead of assumed fine.
- **Node runtime fixed**: added `package.json`'s `engines.node = "^22.17.0 || >=24.0.0"` (copied verbatim from `@sparticuz/chromium`'s own constraint — Vercel's docs confirm `engines.node` overrides the project's dashboard-level Node.js Version setting). Vercel currently offers 24.x (default)/22.x/20.x; this pins the deployment to a version that actually satisfies the chromium package's requirement regardless of what the dashboard was previously set to. Also exact-pinned both `puppeteer-core` and `@sparticuz/chromium` (were caret-ranged).
- **A real, bounded live-Vercel attempt**: added a temporary, gated, fixture-only diagnostic route, pushed it (triggering Vercel's normal automatic Preview — explicitly authorized), located the resulting Preview URL entirely via the **public, unauthenticated GitHub REST API** (no `gh`/`vercel` CLI touched), and attempted to invoke it. The build succeeded. The HTTP request itself was blocked with a 302 to a Vercel authentication page — **this project's Preview deployments have Vercel Deployment Protection (SSO) enabled**, intercepting the request before it ever reached the route handler. Bypassing it requires a "Protection Bypass for Automation" secret — the same category of secret this project's own incident history records as previously exposed by an unauthorized session; this session deliberately did not attempt to obtain or use it. The diagnostic route was removed immediately in a follow-up commit once this was discovered.

### WHAT THIS MEANS — STILL UNVERIFIED

**Whether the real `@sparticuz/chromium` Linux binary + `chromium.args` actually launch and complete a `page.pdf()` call inside a real Vercel serverless function has NOT been confirmed.** Everything checkable without that one live call has been checked and, where wrong, fixed: the launch code now matches the documented API exactly; a local isolation test confirmed `chromium.args` (specifically `--single-process`) is what hangs against a desktop Chrome binary — expected, since those flags pair with `@sparticuz/chromium`'s own Linux binary specifically, not any local dev Chrome; Vercel's build pipeline accepted and deployed the code without error. The one remaining unknown requires a controlled invocation authenticated past Deployment Protection — only the project owner (via their own Vercel dashboard "Protection Bypass" value, or by temporarily disabling protection for a single test) can safely do this. **Recommended before Phase 7F schedules anything real**, using the same pattern Phase 6 already established for its own first live Anthropic call (user-run, hidden-input secret, never pasted into a session transcript).

### TESTS / VALIDATION

- Full JS suite: 1347 tests, 1266 pass, 0 fail, 81 skipped (all DB-gated, unchanged — no local Postgres in this sandbox). No regression.
- `npm run typecheck`: clean. `npm run build`: clean, route table unchanged from Phase 7D's own closeout (confirmed the temporary diagnostic route is absent from the final build).
- The existing Phase 7D source-inspection guard test ("no app/api route imports the render/PDF layer") correctly failed while the diagnostic route existed, and passes again after its removal — confirming the guard itself works as intended.

### CONFIRMATION

No live Anthropic call. No publication, no Blob upload, no download UI, no cron/orchestration route added to the final state. No PR #13 merge, no merge to `main`, no Production action. The reference DOCX and every generated QA PDF/screenshot stayed local-only (scratch files, never committed, never pushed). The temporary diagnostic route existed on `origin` for a bounded window (one push-test-remove cycle within this session) and is confirmed absent from the current `HEAD`.

---

## PHASE 7C.1 + PHASE 7D CLOSEOUT (2026-09-01) — historical; superseded above by Phase 7D.1

Weekly report executive-summary adjustment (7C.1) + deterministic chart/table/report/PDF rendering layer (7D), on `feat/daily-energy-intelligence`, on top of Phase 7C's AI analyst layer. Full design in `docs/PHASE_7_WEEKLY_REPORT_ARCHITECTURE.md` §26.12 (7C.1) and §28-§29 (7D, new) — this section only summarizes.

### STARTING STATE (verified before any work)

Local HEAD, origin, and `main` all confirmed exactly as the prior session's closeout recorded: branch `feat/daily-energy-intelligence` at `8ffb5ce` == `origin/feat/daily-energy-intelligence`, working tree clean, PR #13 still open/draft/unmerged, `main` untouched. Phase 7A/7B/7B.1/7C all confirmed complete per the sections below; Phase 7D had not started.

### PHASE 7C.1 — WHAT CHANGED

Smallest reasonable modification to Phase 7C: `executiveAssessment`'s target shortened from ~450-550 words down to **~150-250 words across 2-3 concise paragraphs**, now that Phase 7D's evidence sections carry the report's detailed analysis instead of the executive assessment trying to. `ai-contract.ts`'s word bounds narrowed 350-700 → 120-320 (same proportional buffer around the new target); `ai/prompt.ts`'s `SYSTEM_PROMPT` rewritten to instruct the 2-3 paragraph structure and a blank-line paragraph separator (so the renderer can split paragraphs deterministically); `ai/model-config.ts`'s max output tokens reduced 3000 → 2200; `WEEKLY_ANALYST_SCHEMA_VERSION` and `WEEKLY_ANALYST_PROMPT_VERSION` both bumped to `1.1.0`. Output *shape*, all grounding/allowlist rules, and the one-call-per-report architecture are unchanged. See architecture doc §26.12 for the full diff.

### PHASE 7D — WHAT WAS BUILT

Turns a `ready`/`published` snapshot's frozen payload + its persisted Phase 7C assessment into real PDF bytes in memory — no publish, no download route, no cron, no UI entry point.

- **Design latitude**: the phase brief's page-by-page outline was explicitly reframed mid-session as product intent/examples, not a rigid template, with ownership of the final information architecture, chart choice, and typography handed to this session. See architecture doc §28 for the actual information architecture built (materiality-ranked, dynamically-selected evidence sections; a 2-column chart+commentary layout for chart-only sections; full-width for table-bearing ones; a serif/sans typographic pairing) and the concrete fixes made from a real visual-QA pass.
- **Visual QA performed live**: a realistic, fully deterministic, hand-authored fixture (`tests/fixtures/weekly-report-fixture.ts` — committed, reused by the automated test suite) was rendered through the complete real pipeline to actual PDF files using the local machine's own installed Google Chrome (not `@sparticuz/chromium`'s Lambda-only binary, and not committed to the repo). Two variants were inspected — a 4-page "quiet week" and a 5-page "busy week" exercising every chart kind. Concrete design bugs found and fixed this way: a bar-chart zero-baseline that flattened tightly-clustered series into near-identical bar heights; a Rig Activity chart that dwarfed two small Appalachian basin bars next to the (unrelated-scale) national U.S. count; an ambiguous "for this item" News Range Implication; a redundant STEO table title/source line; a Sources table that split across a page boundary leaving a following page nearly blank. All fixed — see §28's full list.
- **Render model + selection**: a typed `WeeklyReportRenderModel` (`render-model.ts`); `buildWeeklyReportRenderModel()` (`render-model-builder.ts`) is the one place it's constructed, from exactly the two frozen/persisted inputs, with zero DB/live-fetch/AI calls anywhere downstream. `evidence-sections.ts` builds one candidate per plausible subject and keeps only the top `budget.maxEvidenceSections` by materiality (reusing Phase 7B's `rankEvidenceByMateriality()` twice — once per multi-item candidate, once across candidates).
- **Deterministic charts/tables**: 4 chart kinds (`comparisonBar`, `multiItemBar`, `peerBar`, `actualVsForecastBar`, `chart-selection.ts`), every bar value traced directly to frozen evidence, rendered as dependency-free inline SVG (`svg-charts.ts`). 5 table builders (`table-builder.ts`), every cap deterministic and every truncation reported, never silent.
- **Content budget / 5-page hard limit**: two fixed tiers (`content-budget.ts`); `weekly-report-pdf-service.ts`'s `renderWeeklyReportPdf()` implements the exact policy: standard render → if the REAL PDF page count fits, done; else exactly one reduced-content retry → if that fits, done; else fail safely. No AI retry, no third tier.
- **Commentary**: deterministic, template-based (`commentary.ts`) — zero new AI calls anywhere in Phase 7D; the report stays at ONE AI invocation per week (Phase 7C/7C.1's analyst assessment).
- **PDF rendering**: `puppeteer-core` + `@sparticuz/chromium` behind a swappable `PdfRenderer` interface (`pdf-renderer.ts`) — the standard serverless-Chromium pairing, chosen over bundling full `puppeteer` (too large for a serverless function) or a paid rendering service. Real headless Chromium was never launched against the actual `@sparticuz/chromium` binary this session (it's Lambda/Linux-only); local visual QA used the renderer's own `executablePath` override pointed at this Mac's installed Chrome instead.
- **Branding**: reuses the existing approved `assets/logos/RRC.png` (same asset `config/company-logos.json` already uses), base64-embedded — never touched or copied the proprietary reference DOCX.
- **Artifact storage**: `ArtifactStorageProvider` abstraction (`artifact-store.ts`) with an `InMemoryArtifactStore` (tests) and a real `VercelBlobArtifactStore` (token-gated, mirrors the AI provider's own gating pattern) — nothing calls `.put()` anywhere yet; wiring it to a real publish flow is Phase 7E's job.

### TESTS / VALIDATION

- **New tests**: 4 new files — `weekly-report-render-model` (render model/chart/table/commentary/evidence-selection + source-inspection guardrails), `weekly-report-content-budget`, `weekly-report-pdf-service` (countPdfPages, retry/fail-safe policy against fakes, artifact-store), `weekly-report-html-render` (HTML/SVG rendering + XSS-escaping regression tests) — 62 tests, all passing, no DB/live-Chromium/live-Anthropic required. Existing `weekly-report-ai-contract`/`weekly-report-analyst-prompt`/`weekly-report-analyst-service` tests updated for Phase 7C.1's new word bounds.
- **Full JS suite**: 1347 tests, 1266 pass, 0 fail, 81 skipped (all DB-gated — no local Postgres in this sandbox, same standing limitation as every prior Phase 7 session). No regression to any pre-existing test.
- `npm run typecheck`: clean. `npm run build`: clean, route table unchanged (zero new routes — Phase 7D added no `app/api/reports` and nothing under `app/` imports the new render layer, confirmed by a source-inspection test).
- **DB-gated tests** (all of 7A/7B/7C's): still never run against a real Postgres in any session — standing risk, unchanged.

### CONFIRMATION

No live Anthropic call occurred. No live headless-Chromium render occurred against the real serverless (`@sparticuz/chromium`) binary — only against a local development Chrome install, for this session's own visual QA, output not committed. No PDF was published, no artifact was uploaded to a real Vercel Blob store. No download route/UI, no cron/orchestration route, no publish-transition caller, no Production action, no PR merge, no merge to `main`. Phase 7E **not started**.

---

## PHASE 7C CLOSEOUT (2026-09-01) — historical; superseded above by Phase 7C.1 + 7D

Weekly AI Analyst layer, on `feat/daily-energy-intelligence`, on top of Phase 7B/7B.1's deterministic snapshot layer. Full design in `docs/PHASE_7_WEEKLY_REPORT_ARCHITECTURE.md` §26 (new) — this section only summarizes.

### WHAT WAS BUILT

Turns a `ready` frozen snapshot into ONE validated, structured, Range-focused analyst assessment, then stops — no chart/PDF rendering, no publish, no download route, no cron.

- **Evidence selection** (`analyst-evidence-selection.ts`): deterministic, bounded, reuses Phase 7B's materiality ranking. Hard caps: marketBackdrop 10, range 8, peers 6, news 5, outlook 6, whatChanged candidates 8, risk+opportunity candidates 5 total (inherited from the existing risk engine cap).
- **AI input/output contract** (`ai-contract.ts`, rewritten from Phase 7A's placeholder): `WeeklyAnalystInput` → `WeeklyAnalystAssessment` (executiveAssessment 350-700 words targeting ~450-550; biggestRisk/biggestOpportunity; ≤5 whatChanged items; 1-6 managementWatchItems; bottomLine; selectedEvidenceIds).
- **Grounding validation**: every cited evidence id must exist in the supplied allowlist; biggestRisk/biggestOpportunity must each cite a real deterministic risk-engine candidate (and not swap the two); whatChanged items must cite real supplied change evidence; watch items must cite supporting evidence (never a fabricated forecast); a small generic-filler denylist and a guaranteed-outcome-language denylist both reject boilerplate/hype outright.
- **One Anthropic call per report**: `AnthropicWeeklyAnalystProvider`, Claude Haiku 4.5 (unchanged project-standard model), forced tool-use, `withBoundedRetry` (3 attempts, existing project policy, not a new one).
- **Fingerprinted cache**: `computeWeeklyAnalystFingerprint()` = sha256(snapshot's own input_fingerprint + AI schema version + prompt version + model). Same four inputs → same fingerprint → cached `ready` row returned, zero provider calls.
- **Persistence**: new `weekly_report_analyses` table (added to the existing `schema.sql`, same `npm run report:migrate` path), one row per attempt, mirroring `weekly_report_snapshots`' own two-partial-unique-index pattern (`pending`/`ready` fingerprint-uniqueness) so a failed attempt can never block or overwrite a successful one, and a retry after failure is always a new row.
- **No live Anthropic call was made** — every test uses an in-process fake provider (mirrors the existing `tests/macro-summary-service.test.cjs` pattern).
- **Management tooltip copy locked** for Phase 7F's future Overview button (§26.11 of the architecture doc) — not implemented, copy only.

### TESTS / VALIDATION

- 4 new test files (`weekly-report-ai-contract` rewritten, `weekly-report-analyst-evidence-selection`, `weekly-report-analyst-prompt`, `weekly-report-analyst-service`) — pure-function tests (validation/grounding/selection/prompt-formatting/fingerprint) all passing; a source-inspection test confirms no `app/api/` file imports the AI layer and no `app/api/reports` directory exists; DB-gated cache/generate/persist/failure-lifecycle tests (fake provider, no real Anthropic) skip in this sandbox (no local Postgres — same standing limitation as every prior Phase 7 session).
- Full JS suite: 1282 tests, 1201 pass, 0 fail, 81 skipped (all DB-gated).
- `npm run typecheck`: clean. `npm run build`: clean, route table unchanged (zero new routes).

### KNOWN REMAINING ITEMS FOR PHASE 7D+

1. DB-gated tests across all of Phase 7 (7A/7B/7C) have still never run against a real Postgres in any session — standing risk, unchanged.
2. No blob/object storage provider configured yet (Phase 7D, unchanged from 7A).
3. The two Phase 7B data gaps (no forecast-revision history, no separate peer-relative comparison) remain open (unchanged from 7B).
4. No scheduled caller exists yet for `generateWeeklyAnalysisIfNeeded()` — that, plus the actual first real (paid) Anthropic call, belongs to Phase 7F's orchestration work under the same controlled-Preview-validation pattern Phase 6 established.

### CONFIRMATION

No live Anthropic call occurred. No chart/HTML/PDF renderer, no publish, no download route/UI, no cron, no Production action. Phase 7D **not started**.

---

## PHASE 7B.1 CLOSEOUT (2026-09-01) — historical; superseded above by Phase 7C

Small corrective pass on Phase 7B, found during control-hub review, on `feat/daily-energy-intelligence`. Two real correctness bugs fixed; no new subsystem, no scope expansion. Full design detail in `docs/PHASE_7_WEEKLY_REPORT_ARCHITECTURE.md` §8/§20/§21/§22/§23/§24 (updated in place) — this section only summarizes.

### WHAT CHANGED

1. **News window re-anchored from `storageWeekEnding` to the report's own `dataCutoffAt`.** The original Phase 7B window (`[storageWeekEnding - 6 days, storageWeekEnding]`) silently dropped News published between the storage-week Friday and the report's actual (later, post-EIA-release) generation date. New window: `(previousDataCutoffAt, currentDataCutoffAt]` — start exclusive, end inclusive, so consecutive reports partition real time with no gap and no double-count. First report (no previous published snapshot) falls back to a documented `NEWS_WINDOW_FALLBACK_DAYS = 7` before the current cutoff. **Report identity (`storageWeekEnding`) is completely unchanged** — this was windowing-only.
2. **One explicit `dataCutoffAt` established once per run**, in `snapshot-builder.ts`, immediately after the previous published snapshot is looked up — never independently recomputed by an adapter. Passed explicitly to the News adapter alongside the previous report's own frozen cutoff. Evidence items' own `period`/`asOfDate` are never overwritten by it.
3. **Change/materiality/fingerprint comparison switched from `displayValue` text to a semantic rule.** The original comparison (`prior.displayValue !== item.displayValue`) made truth detection dependent on formatting/rounding — a real change that happened to round to the same display string (e.g. `3.326 → 3.334`, both `"$3.33"`) would go undetected. New exported `isEvidenceItemChanged()` in `changes.ts` compares `currentValue`/`period` directly for numeric evidence (falling back to `displayValue` only for genuinely non-numeric/qualitative evidence), and is now the **single** definition of "changed" shared by `computeWeeklyChanges()` and `annotateMateriality()`. `fingerprint.ts` got the matching fix: `displayValue` is no longer unconditionally fingerprinted (`qualitativeFact` replaces it, null whenever a real `currentValue` exists).

### TESTS / VALIDATION (this session)

- Rewrote `tests/weekly-report-news-window.test.cjs` for the new cutoff/contiguity/fallback semantics (18 tests, including an explicit "an article at a shared boundary lands in exactly one of two consecutive reports" test).
- Extended `tests/weekly-report-changes.test.cjs` (+11 tests) and `tests/weekly-report-fingerprint.test.cjs` (+4 tests) with the brief's required numeric-vs-display, new-period-same-value, and risk-item-unaffected cases.
- Full JS suite: 1237 tests, 1163 pass, 0 fail, 74 skipped (all DB-gated, unchanged skip set — no local Postgres in this sandbox, same standing limitation as every prior Phase 7 session).
- `npm run typecheck`: clean. `npm run build`: clean, route table unchanged (zero new routes, by design).
- DB-gated tests (`weekly-report-repo`, `weekly-report-snapshot-builder`) still could not run against a real Postgres in this sandbox — unchanged, standing risk already flagged in the Phase 7B closeout below.

### CONFIRMATION

No AI call, no PDF/chart renderer, no artifact publication, no Production action, no cron/route added. Report identity (`storageWeekEnding`) unchanged. Phase 7C **not started**.

---

## PHASE 7B CLOSEOUT (2026-09-01) — historical; superseded above by Phase 7B.1

Phase 7B (Weekly Range Resources AI Intelligence Report — **frozen weekly intelligence snapshot + deterministic comparison engine**) is complete on `feat/daily-energy-intelligence`, on top of Phase 7A's persistence spine. This section is a self-contained resume point for Phase 7C; the full architecture record lives in **`docs/PHASE_7_WEEKLY_REPORT_ARCHITECTURE.md`** (read that document in full, especially its new §19–§26, before starting Phase 7C — this section only summarizes it).

### PROJECT STATE

- **Repository**: `christian-04-code/rrc-peer-dashboard`
- **Active branch**: `feat/daily-energy-intelligence`
- **Branch tip before this session**: `3657977` ("Phase 7A: Weekly Report architecture + data contracts + persistence foundation") — confirmed via `git fetch origin` to exactly match `origin/feat/daily-energy-intelligence` before any Phase 7B work began; working tree was clean; branch/commit already on `feat/daily-energy-intelligence` at session start (no branch switch needed this time).
- **Latest commit after this phase**: see `git log -1` on this branch — not hardcoded here for the same reason Phase 7A's closeout gives (the SHA is only known once the commit containing this text already exists). Titled "Phase 7B: Frozen weekly intelligence snapshot + deterministic comparison engine" (or equivalent) on top of `3657977`.
- **PR #13**: still open, draft, not merged — untouched this phase.
- **Production**: untouched this phase — Phase 7B shipped no new route, no new UI, nothing reachable from a running deployment (confirmed by the build's route table being unchanged from Phase 7A).

### WHAT PHASE 7B BUILT

Turned Phase 7A's contracts/persistence spine into a real, working deterministic snapshot layer — **no AI call, no chart renderer, no PDF renderer, no publish, no cron/orchestration route.** Full detail in `docs/PHASE_7_WEEKLY_REPORT_ARCHITECTURE.md` §19–§26; summary:

- **Real typed evidence** (`WeeklyEvidenceItem`/`WeeklyReportModules`, §19) replaced Phase 7A's `Record<string, unknown>` placeholder. Stable evidence IDs (period-excluded for recurring series, article-id-embedded for News) are what make change detection meaningful rather than noisy.
- **Six subsystem adapters** (`lib/reports/adapters/`): Macro (re-derives the same live EIA fetch pattern `buildMacroRiskSnapshot()` uses, plus real evidence + STEO vintage persistence/comparison), Rigs (Baker Hughes, national + Marcellus + Utica), Range's own company data (quarterly financials + guidance), Peers (6 tickers × 6 headline metrics), Forecast (RRC's parameterless default scenario only — see the documented gap below), News (7-day window anchored to the report's own storage-week identity, `"analyzed"`-only, never re-runs News's AI).
- **Deterministic comparison engine** (`lib/reports/comparisons.ts`): WoW/YoY/vs5yrAvg for weekly storage, WoW-only (calendar-anchored) for daily Henry Hub, MoM/YoY for monthly EIA series, QoQ/priorQuarterActuals for quarterly Range/peer financials, WoW/YoY reusing the rig-import pipeline's own precomputed deltas, steoVintage only when a real second persisted vintage exists. Comparison periods always follow the underlying data's own cadence, never the weekly report-generation cadence.
- **Deterministic change detection** (`lib/reports/changes.ts`): diffs the current snapshot against the previous *published* one; the core rule it enforces is that an unchanged monthly/quarterly figure appearing in two consecutive weekly snapshots produces zero change entries — proven by a dedicated test.
- **Materiality foundation** (`lib/reports/materiality.ts`): structured signals (`MaterialityInputs`) plus a simple documented high/routine classifier and a plain comparator-based ranker — deliberately not a blended numeric score.
- **Real fingerprinting** (`lib/reports/fingerprint.ts`): SHA-256 over a canonicalized, curated subset of evidence fields — proven stable/sensitive/insensitive-to-volatile-metadata by a dedicated test suite.
- **Snapshot builder orchestration** (`lib/reports/snapshot-builder.ts`, `runWeeklySnapshotBuild()`): the full `pending → building → ready` pipeline, stopping there — never calls `publishSnapshot()`. No `app/api/...` route imports this module.

### DEVIATIONS FROM PHASE 7A (both additive, not reversals — see architecture doc §24 for full reasoning)

1. `EvidenceModuleKey` gained `range_company` and `deterministic_risk_opportunity` — Phase 7A's category list had no place for Range's own company results (distinct from peer positioning) or the risk engine's ranked output as first-class evidence.
2. `comparisons.ts`'s `compareQuarterly` takes `{ value: number | null }` rather than the narrower `SourcedValue`, so one function serves all three quarterly fixture shapes in `lib/dashboard/` (`SourcedValue`, `MarketCapValue`, `EpsValue`) instead of three near-duplicates.

### KNOWN DATA GAPS (documented, not papered over — architecture doc §24)

1. **No `forecastRevision` comparison for Range's forecast** — `lib/forecast/` has no persisted scenario-run history (unlike STEO), and the only parameterless canonical output is the "default scenario." Closing this needs a future phase to add real scenario-state persistence.
2. **`peerChange` is not a separately-computed comparison period** — peers get the same QoQ/YoY comparisons Range's own data gets; a bespoke Range-vs-peer relative-positioning delta was judged closer to a synthesis decision, better suited to Phase 7C/7D.

### TESTS / VALIDATION (this session)

- **New tests**: 8 files, ~80 new test cases — `weekly-report-comparisons` (23), `weekly-report-changes` (11), `weekly-report-materiality` (11), `weekly-report-fingerprint` (10), `weekly-report-news-window` (8), `weekly-report-macro-adapter` (8, EIA-fetch-mocked, no DB needed), `weekly-report-static-adapters` (7, real static fixtures, no DB/network), all **passing**. `weekly-report-snapshot-builder` (5, DB-gated + EIA-fetch-mocked, full `runWeeklySnapshotBuild` lifecycle incl. duplicate-attempt/already-published/required-input-failure/materiality-across-two-published-weeks) — **could not run in this sandbox**, no local `DATABASE_URL`/`POSTGRES_URL` (same limitation as Phase 7A's `weekly-report-repo.test.cjs`, still unresolved — see below). Two real test-authoring bugs were caught and fixed during this session (a wrong "no previous snapshot" expectation in the changes test, and a span-length miscalculation in the news-window test) — both were test bugs, not implementation bugs; the implementation behavior in both cases was correct on inspection.
- **Full JS suite**: 1216 tests, 1142 pass, 0 fail, 74 skipped (56 pre-existing + 13 from Phase 7A + 5 new from Phase 7B, all DB-gated) — no regression to any pre-existing test.
- **Python suite**: **could not run in this sandbox** — same `python`/`python3` App-execution-alias gap noted in Phase 7A's closeout (a Windows Store stub is on PATH but no real interpreter is installed behind it); zero Python files touched this phase.
- **`npm run typecheck`**: clean.
- **`npm run build`**: clean; route table unchanged from Phase 7A (Phase 7B added zero new routes, by design — no browser/cron entry point exists yet).

### KNOWN REMAINING ITEMS / RISKS FOR PHASE 7C

1. **All DB-gated Phase 7 tests (7A's `weekly-report-repo.test.cjs` + 7B's `weekly-report-snapshot-builder.test.cjs`) have never run against a real Postgres in any session so far.** This is now a standing item across two phases — strongly recommended before Phase 7C/7D build further on top of `runWeeklySnapshotBuild()`'s untested-against-real-DB lifecycle.
2. **No blob/object storage provider is chosen or configured** (unchanged from Phase 7A) — still needed before Phase 7D can write artifact upload/download logic.
3. **The two documented data gaps above** (forecast revision history, peer-relative comparisons) are open product/architecture questions for whoever scopes Phase 7C/7D's "what changed" narrative — they may or may not need closing before a v1 report is acceptable.
4. **This branch's Production-promotion decision (Phase 6 closeout, below) remains unresolved** and is unaffected by Phase 7 — still a prerequisite for any of Phase 7's later phases ever reaching Production.

### CONFIRMATION

No AI call was implemented. No PDF/chart renderer was implemented. No artifact publication was implemented (nothing calls `publishSnapshot()`). No Production action occurred. Phase 7C was **not started** this session.

---

## PHASE 7A CLOSEOUT (2026-09-01) — historical; superseded above by Phase 7B

Phase 7A (Weekly Range Resources AI Intelligence Report — **architecture + data contracts + persistence foundation only**) is complete on `feat/daily-energy-intelligence`. This section is a self-contained resume point for Phase 7B; the full architecture record lives in **`docs/PHASE_7_WEEKLY_REPORT_ARCHITECTURE.md`** (read that document in full before starting Phase 7B — this section only summarizes it).

### PROJECT STATE

- **Repository**: `christian-04-code/rrc-peer-dashboard`
- **Active branch**: `feat/daily-energy-intelligence`
- **Branch tip before this session**: `0c5f53f` ("docs: close out phase 6 macro intelligence") — confirmed via `git fetch origin` to exactly match `origin/feat/daily-energy-intelligence` before any Phase 7A work began; working tree was clean.
- **This session's local checkout was on a different branch** (`forecast/rrc-ux-pass`) when the session started — switched to `feat/daily-energy-intelligence` (tracking `origin/feat/daily-energy-intelligence` at `0c5f53f`) before doing anything else, per this phase's startup-verification instructions.
- **Latest commit after this phase**: see `git log -1` on this branch — this closeout intentionally does not hardcode that commit's own SHA (the SHA is only known once the commit including this text already exists). It is the one commit titled "Phase 7A: Weekly Report architecture + data contracts + persistence foundation" (or equivalent) on top of `0c5f53f`.
- **PR #13**: still open, draft, not merged — untouched this phase, per this phase's explicit instruction not to merge it.
- **Production**: untouched this phase — still the pre-Phase-6 state described in the Phase 6 closeout section below; Phase 7A shipped no new route, no new UI, nothing reachable from a running deployment.

### WHAT PHASE 7A BUILT

Persistence spine + type contracts only — **no snapshot builder, no AI call, no chart renderer, no PDF renderer, no cron/orchestration, no Overview download button, no "latest report" endpoint.** Full reasoning and file-by-file detail is in `docs/PHASE_7_WEEKLY_REPORT_ARCHITECTURE.md`; summary:

- **Report identity**: the EIA Weekly Natural Gas Storage report's "week ending" date (`StorageWeekEnding`, always a Friday) — not a calendar week, not a timestamp. `isValidStorageWeekEnding()` in `lib/reports/weekly-report-types.ts`.
- **DB schema** (`lib/reports/persistence/schema.sql`, new table `weekly_report_snapshots`, applied via `npm run report:migrate`): one row per generation *attempt* (not per week), with two partial unique indexes doing the real idempotency/safety work — at most one active (`pending`/`building`/`ready`) attempt per week, and at most one `published` row per week, ever, enforced by Postgres itself, not just application code. A `CHECK` constraint additionally forbids a row from ever being `published` while incomplete (missing payload/fingerprint/artifact fields).
- **Lifecycle**: `pending → building → ready → published`, or `→ failed` from any non-terminal state; `published`/`failed` are both terminal per-row; a retry after failure is a new row. Atomic CAS-style transitions in `lib/reports/persistence/report-repo.ts` (`transitionToBuilding`, `freezeSnapshot`, `publishSnapshot`, `markSnapshotFailed`), each returning `null` (never throwing) when the row wasn't in the expected prior state.
- **Frozen payload envelope, comparison contract, report content contract, AI input/output contract, readiness contract** — all defined as types (`lib/reports/weekly-report-types.ts`, `lib/reports/readiness.ts`, `lib/reports/ai-contract.ts`); nothing computes a real comparison, calls a real AI provider, or fetches real readiness data yet.
- **Artifact storage**: DB columns (`artifact_key`/`artifact_checksum`/`artifact_size_bytes`/`artifact_content_type`) are provider-agnostic; no blob/object storage provider is wired up yet (none was already present in this project, and adding one wasn't low-risk/already-available per this phase's scope). Vercel Blob is the architecture doc's recommendation for Phase 7D.

### TESTS / VALIDATION (this session, against this phase's changes)

- **New tests**: `tests/weekly-report-identity.test.cjs` (8), `tests/weekly-report-readiness.test.cjs` (5), `tests/weekly-report-ai-contract.test.cjs` (9) — all pure, no DB, all passing. `tests/weekly-report-repo.test.cjs` (13, DB-gated — lifecycle transitions, both partial-unique-index constraints exercised directly, idempotent create, previous/latest-published lookups) — **could not run in this sandbox** (no local `DATABASE_URL`/`POSTGRES_URL` configured; skips loudly with an explicit message, same established pattern as every other DB-gated test in this repo, e.g. `tests/macro-steo-persistence.test.cjs`). Needs a real local/staging Postgres run before being treated as verified end-to-end — same caveat this project has carried for every DB-gated Macro test since Phase 6B.
- **Full JS suite**: 1141 tests, 1072 pass, 0 fail, 69 skipped (56 pre-existing DB-gated + 13 new DB-gated) — no regression to any pre-existing test.
- **Python suite**: **could not run in this sandbox** — `python3`/`python` are not on PATH in this session's environment (unrelated to Phase 7A; zero Python files were touched this phase, so there is no plausible regression risk, but this was not independently re-verified this session the way the JS suite was).
- **`npm run typecheck`**: clean, after running `npm install` to restore `node_modules` (this session's checkout had an incomplete `node_modules` missing `pg`/`@anthropic-ai/sdk`/`fast-xml-parser` — an environment gap, not a code issue; installing from the existing `package-lock.json` resolved it with no dependency version changes).
- **`npm run build`**: clean; route table unchanged from Phase 6E (Phase 7A added zero new routes, by design).

### KNOWN REMAINING ITEMS / RISKS FOR PHASE 7B

1. **DB-gated Phase 7A tests (`tests/weekly-report-repo.test.cjs`) have never run against a real Postgres.** Run them (`DATABASE_URL=... node --test tests/weekly-report-repo.test.cjs`, or as part of the full suite) against a real database before trusting the schema's constraints end-to-end — the SQL was written to mirror already-proven Macro patterns closely, but the two partial unique indexes and the published-completeness `CHECK` are new and deserve a real run.
2. **No blob/object storage provider is chosen or configured** — Phase 7D needs to either confirm Vercel Blob (this doc's recommendation) or pick an alternative before artifact upload/download logic can be written; the DB schema does not need to change either way.
3. **Phase 7B must re-inspect Peers/News/Forecast-scenario current shapes before consuming them** — Phase 7A's inspection scope (per its own instructions) covered Macro/News/DB conventions closely but did not audit peer-comparison or scenario-forecast code in file-level detail; §4 of the architecture doc flags this explicitly.
4. **Fingerprinting is not implemented** — only the column and the precedent (`computeMacroSummaryFingerprint`) to follow; Phase 7B must actually write the canonicalization + hashing for the real payload shape once one exists.
5. **This branch's Production-promotion decision (Phase 6 closeout, below) remains unresolved** and is unaffected by Phase 7A — still a prerequisite for any of Phase 7's later phases ever reaching Production, independent of Phase 7's own readiness.

### CONFIRMATION

Phase 7B (snapshot builder), 7C (AI call), 7D (charts/PDF), 7E (delivery), 7F (orchestration), and 7G (end-to-end validation) were **not started** this session (Phase 7B has since been completed — see the "PHASE 7B CLOSEOUT" section at the top of this document; the architecture doc's section numbers shifted when 7B's own sections were added, so this pointer is kept accurate rather than left dangling: see `docs/PHASE_7_WEEKLY_REPORT_ARCHITECTURE.md` §25 for what 7C-7G each still involve).

---

## PHASE 6 CLOSEOUT (2026-08-31) — historical; superseded above by Phase 7A

Phase 6 (EIA Macro Intelligence System) is **code-complete**. This section is a
self-contained resume point — a future session should be able to pick up work
correctly from this section alone, without relying on prior chat history.

### PROJECT STATE

- **Repository**: `christian-04-code/rrc-peer-dashboard`
- **Active branch**: `feat/daily-energy-intelligence`
- **Latest commit**: `a05331d` — "Phase 6E: Macro date/freshness closeout + fix Last-Updated timestamp bug"
- **Remote verification**: `git fetch origin` confirmed `origin/feat/daily-energy-intelligence` == local `HEAD` == `a05331d`. Working tree clean, no untracked files, at the time of this closeout.
- **PR #13**: open, **draft**, base `main`, head `feat/daily-energy-intelligence` at `a05331d` (confirmed live via the GitHub API — the PR's head SHA exactly matches the branch tip, so no completed work exists only locally). **Not merged.** Its title/body ("Daily Energy Intelligence: automated news pipeline, AI analysis, and simplified News feed (Phases 2–5.1)") predates Phase 6 and undersells current scope — cosmetic only, does not affect safety; update it whenever `gh` write access is available.
- **Production status**: see "PRODUCTION / BRANCH RISK" below — Production does **not** currently contain any Phase 6 (Macro) work.
- **Latest Preview URL reflecting `a05331d`**: `https://rrc-peer-dashboard-842nyfbxj-christian-04-codes-projects.vercel.app` (deployed seconds after the Phase 6E commit; content-identical to HEAD). An earlier same-day Preview, `https://rrc-peer-dashboard-l5uinm1lt-christian-04-codes-projects.vercel.app`, was the one visually QA'd during Phase 6E and is also content-identical to `a05331d` (deployed from the same, already-complete, then-uncommitted working tree).

### PHASE 6 STATUS

| Phase | Status | Commit |
|---|---|---|
| 6A — Macro/EIA audit + shared-taxonomy relocation | Complete | `6d30e43` |
| 6B — EIA Macro Intelligence: ingestion foundation | Complete | `12c38ae` |
| 6C — Macro UI modules + Permian chart fix | Complete | `66b05ce` |
| 6D — Dynamic Range Macro Risk Engine + AI Summary | Complete | `8adc856` |
| 6E — Date/freshness closeout | Complete | `a05331d` |

**Phase 6 overall: code-complete, pending only one user-run live AI validation** (see below). No further code changes are required to consider Phase 6 done.

### IMPORTANT COMMITS

- `6d30e43` — Shared Range impact taxonomy relocation (`lib/range-impact-framework.ts`); Macro/EIA architecture audit.
- `12c38ae` — Phase 6B: EIA STEO ingestion (API v2), `macro_steo_snapshots`/`macro_risk_summaries` schema, source registry.
- `66b05ce` — Phase 6C: Macro topic-tab UI (Gas Balance/Storage/Supply/Appalachia/LNG/Demand/EIA Outlook/Rigs), EIA Outlook module, Permian rig chart layout fix.
- `8adc856` — Phase 6D: deterministic Range Macro risk engine (7 signals, ranked), cached AI Macro Summary (Claude Haiku 4.5), `/api/cron/macro`.
- `a05331d` — Phase 6E: Last-Updated box + per-module date/freshness UI, fixed a real bug where "Last Updated" reflected page views instead of cron runs.

Relevant Phase 5 context (News, a separate subsystem sharing only the driver taxonomy): `efef514` (Phase 5, full daily automation), `28f957b`/`e88c28f` (Phase 5.1/5.2, News UI). Production currently runs `e88c28f` — see below.

### CURRENT ARCHITECTURE

**Macro data flow:**
```
EIA API v2 (+ OilPriceAPI) sources
  → normalized Macro metrics (lib/market/macro-analytics.ts, macro-fundamentals.ts)
  → Macro UI (components/dashboard/MacroPanel.tsx and topic modules)
```

**Risk/AI flow:**
```
validated Macro metrics
  → deterministic risk engine (lib/market/macro-risk-engine.ts — classify + rank)
  → ranked Range risks/opportunities
  → structured payload (MacroRiskPayload, signals + supportingMetrics + snapshotAsOf)
  → fingerprint/cache (macro_risk_summaries, keyed on input_fingerprint)
  → AI Macro Summary (Claude Haiku 4.5, cron-only, commentary on the payload only)
```

### IMPORTANT DATA SAFEGUARDS

- EIA API v2 is the sole ingestion method — no XLS/XLSX parsing was built (deliberate, documented omission; revisit only if a future dataset genuinely requires it).
- No unverified EIA series ID ships — every series in `lib/eia/series.ts`/`lib/eia/macro-registry.ts` was independently confirmed live against the real `EIA_API_KEY` before being added (several initial guesses, e.g. `NGLXPUS`/`NGICPUS`, were wrong and replaced with verified IDs).
- No zero-filling missing state data — `buildAppalachiaProduction()` excludes a period entirely if any of PA/WV/OH is missing it, never substitutes zero.
- PA + WV + OH is always labeled "PA + WV + OH marketed production," never "Marcellus production" (EIA does not publish an official Marcellus series) — enforced in code comments, UI copy, and tests.
- No fabricated STEO forecast-revision history — `computeForecastRevisions()` only ever diffs two real, persisted snapshots; a single-snapshot state renders an honest "more history is needed" empty state.
- Incompatible units are never force-converted onto one chart axis — Henry Hub ($/MMBtu vs. STEO's $/Mcf) and electric-power consumption (ambiguous daily-rate convention) are deliberately left forecast-only rather than overlaid with an unverified conversion.
- The AI provider cannot rank, reclassify, or invent a signal — its input type (`MacroRiskPayload`) contains only already-classified output from the deterministic engine; `lib/market/ai/` has no ranking logic.
- The browser can never trigger AI generation — `/api/macro/risk` only ever reads a cached summary; AI generation happens exclusively inside `runMacroDailyOrchestration()`, reachable only via the `CRON_SECRET`-gated `/api/cron/macro`. Source-inspection tests assert neither browser-facing route imports the AI provider.
- Stale data stays visibly stale — a metric whose `MarketFreshness` is `"stale"` renders with an explicit "· Stale" suffix rather than looking identical to current data; the AI summary state machine (`pending`/`ready`/`stale`/`unavailable`) prevents an old cached summary from being presented as current.

### CURRENT CRON SCHEDULES

From `vercel.json` (verified this session, not assumed):
```json
{ "path": "/api/cron/news",  "schedule": "15 11 * * *" }
{ "path": "/api/cron/macro", "schedule": "15 12 * * *" }
```
Both UTC, both once/day (Vercel Hobby limit), Macro offset one hour after News. Actual firing time can lag up to 59 minutes past the scheduled minute (Vercel Hobby's documented imprecision) — local-time equivalents drift with US Central DST and are not restated here to avoid going stale; convert from UTC at the time you need it.

### ENVIRONMENT VARIABLES (names only — no values recorded here or anywhere in this repo)

`ANTHROPIC_API_KEY`, `CRON_SECRET`, `DATABASE_URL`, `POSTGRES_URL`, `NEWS_DB_SSL`, `EIA_API_KEY`, `FINNHUB_API_KEY`, `FMP_KEY`, `OIL_PRICE_API`, `SEC_USER_AGENT` (optional — gates the SEC EDGAR News source; unset in this project as of Phase 5.2).

### TEST STATUS (this closeout, 2026-08-31, against HEAD `a05331d`)

- **1106 JS tests**: 1050 pass, 0 fail, 56 skipped (DB-gated tests skip without a local `DATABASE_URL`/`POSTGRES_URL`; all DB-gated tests, including Phase 6E's new ones, were separately verified passing against a real local Postgres during Phase 6E and are unchanged since).
- **14 Python tests**: all pass.
- **`npm run typecheck`**: clean.
- **`npm run build`**: clean, all routes build including `/api/cron/macro` and `/api/macro/risk`.

These figures are unchanged from the Phase 6E report — this closeout made documentation-only changes, no source/test edits, so re-running produced identical counts.

### KNOWN REMAINING ITEMS

**A. Required before Production:**
1. **PENDING — USER-RUN LIVE MACRO AI VALIDATION.** The user runs the hidden-input `CRON_SECRET` command below against the latest Preview to confirm: (1) `/api/cron/macro` succeeds; (2) the first call generates or correctly reuses a summary; (3) a second identical call is a fingerprint cache hit; (4) the second call does not regenerate/recharge AI; (5) `/api/macro/risk` then returns `aiSummaryStatus: "ready"`; (6) the persisted summary's `snapshotAsOf` is correct; (7) `generatedAt` is present and real; (8) deterministic rankings are unchanged by the AI call (the engine output is independent of AI regardless, but worth eyeballing). Do not weaken authentication, expose `CRON_SECRET`, or trigger this against Production to avoid running this command.

   ```bash
   read -s -p "CRON_SECRET: " CRON_SECRET && echo && \
   vercel curl "<PREVIEW_URL>/api/cron/macro" -- -H "Authorization: Bearer $CRON_SECRET" -s | tee /tmp/macro-cron-1.json && echo && \
   echo "--- second identical call (idempotency check) ---" && \
   vercel curl "<PREVIEW_URL>/api/cron/macro" -- -H "Authorization: Bearer $CRON_SECRET" -s | tee /tmp/macro-cron-2.json && echo && \
   unset CRON_SECRET && \
   echo "--- /api/macro/risk aiSummary state ---" && \
   vercel curl "<PREVIEW_URL>/api/macro/risk" -- -s | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(JSON.stringify({aiSummaryStatus:d.aiSummaryStatus,generatedAt:d.aiSummary?.generatedAt,snapshotAsOf:d.aiSummary?.snapshotAsOf,lastOrchestrationAt:d.lastOrchestrationAt},null,2))"
   ```
   Use `<PREVIEW_URL>` = `https://rrc-peer-dashboard-842nyfbxj-christian-04-codes-projects.vercel.app` (or re-deploy a fresh Preview from this branch tip first if it has expired).
2. Review the Preview visually one more time if meaningful time has passed since Phase 6E's QA.
3. Explicit user approval before any merge or Production promotion.
4. Decide the PR #13 merge/promotion strategy — see "PRODUCTION / BRANCH RISK" below; merging is not merely a formality here, since Production currently has *neither* the rest of Phase 5 *nor* any of Phase 6.

**B. Future feature work (not started, not authorized to start without separate approval):**
- Phase 7 — Weekly Range Resources Intelligence Report (see below).

### PRODUCTION / BRANCH RISK

Verified directly this session, not assumed:

- **`main` does NOT contain Phase 5 or Phase 6.** `origin/main` is at `7a2e8ff` ("Merge PR #12: Fix Macro basin layout..."), 26 commits behind `feat/daily-energy-intelligence`'s tip. `git merge-base --is-ancestor a05331d origin/main` returns false.
- **Production currently matches neither `main` nor the current branch tip — it's an older point on this branch, from before Phase 6 existed.** The live Production deployment (`dpl_CDmzBaMkP8oh8RpccALkds4LoVM5`, aliased to `rrc-peer-dashboard.vercel.app`) was created 2026-08-26 12:17:34 CDT via a manual `vercel deploy --prod` (not a git-triggered deploy — no GitHub↔Vercel auto-deploy integration was found evidence of in this project). That timestamp is 23 seconds after commit `e88c28f` (Phase 5.2) and *before* any Phase 6 commit (`6d30e43`, Phase 6A, was committed roughly an hour later the same day). **Conclusion: Production currently serves News through Phase 5.2, and contains zero Macro/EIA Intelligence (Phase 6) code.**
- **Merging PR #13 is necessary before Phase 6 can ever reach Production** — there is no other path; Production was never git-connected to this branch, so nothing after the Aug 26 12:17 deploy (including all of Phase 6) will reach Production until either (a) PR #13 is merged to `main` and `main` is deployed to Production, or (b) another manual `vercel deploy --prod` is run directly from this branch (the same mechanism used for Phase 5, and NOT to be done in this closeout task).
- **Risk to flag for a future session**: because Production was never connected to `main` via git, an ordinary `git push` to `main` by itself changes nothing in Production. The actual risk is the reverse of what earlier phase notes assumed — the danger is not "an ordinary main deploy silently overwrites this branch's work," it's that **Production is already stale relative to both `main`'s later commits (`7a2e8ff` etc.) and this branch's Phase 6 work**, and nobody has yet made a deliberate decision about which source of truth Production should follow going forward. Resolve this deliberately (merge PR #13, or continue direct-from-branch deploys) rather than letting whichever deploy happens next decide it by accident.

### FUTURE WORK — Phase 7 — Weekly Range Resources Intelligence Report

**Superseded by Phase 7A** (see the "PHASE 7A CLOSEOUT" section at the top of this document and `docs/PHASE_7_WEEKLY_REPORT_ARCHITECTURE.md`) — Phase 7A turned the direction below into concrete identity/lifecycle/schema/type decisions. Kept below only as the original historical product brief; the architecture doc is now authoritative for anything that conflicts (e.g. the architecture doc's title is "Weekly Range Resources AI Intelligence Report", refined from the working title below). Phase 7B (snapshot builder) onward is still not implemented and still not authorized to begin without separate approval.

Original approved direction (pre-Phase-7A):
- One universal report, generated once per week, identical for all users (not personalized).
- Built from a frozen, validated weekly dataset — generated once, then cached/stored, not regenerated per view.
- Historical report archive retained.
- Overview page gets a "Download Weekly Report" button.
- Output is a professional PDF: Range Resources branding/logo, page numbers, a report timestamp / data-cutoff date, sources/freshness disclosure, and charts/tables drawn only from already-validated dashboard data.
- Top section, titled **"Weekly Range Resources Intelligence Assessment"**, target ~500–800 words, synthesizing: overall Range assessment; biggest opportunity; biggest risk; what changed this week; Range-specific implications; what IR should watch next; operating/financial positioning; gas pricing; Appalachia; U.S. supply; storage; LNG; power/industrial demand; EIA/STEO; rigs; peers; material News; Forecast/scenarios; deterministic Macro risks/opportunities; and meaningful change versus the previous week's frozen report.

Architecture direction:
```
validated dashboard data
  → freeze weekly snapshot
  → deterministic calculations/charts
  → structured report payload
  → AI assessment (synthesis/writing only)
  → PDF renderer
  → stored weekly report
  → same download served to all users
```
The AI must never manufacture charts, metrics, rankings, or source data — same "deterministic engine computes, AI only narrates" boundary already enforced in the Phase 6D/6E risk engine and AI summary.

### WHEN RESUMING THIS PROJECT

1. `git fetch origin`
2. `git checkout feat/daily-energy-intelligence`
3. Verify `HEAD` == `a05331d` (or whatever this doc's "Latest commit" says, if updated since) and matches `origin/feat/daily-energy-intelligence`.
4. `git status` — confirm clean, no untracked files.
5. Read this "PHASE 6 CLOSEOUT" section in full before doing anything else.
6. If the live Macro AI validation (above) hasn't been run yet, run it before treating Phase 6 as fully verified end-to-end.
7. Deploy/verify a fresh Preview if the one linked above has expired.
8. Do not merge PR #13 without explicit user approval in that session.
9. Only start Phase 7 after a deliberate Phase 6 validation/Production-promotion decision has been made.

---

- **Repository**: christian-04-code/rrc-peer-dashboard
- **Active branch**: main (production-connected; SEC ingestion + full dashboard/model/UI/API work merged here as of `94a8c6a`)
- **Latest commit**: "Show commodity price assumptions (current market / EIA / modeled) in the Scenario Workbench"
- **Pushed to origin**: yes, `origin/main` == local HEAD

## Feature branch in progress: `feat/daily-energy-intelligence` (News / Daily Energy Intelligence) — Phase 6E complete, NOT merged to main via git (2026-08-28)

Not part of `main`'s git history. All work below lives only on this branch. Per explicit user direction during Phase 5, this branch's build was deployed directly to the Vercel **Production** environment (`vercel deploy --prod`) ahead of any git merge — see "Production activation" below. `main` itself still has zero News code.

- **Branch**: `feat/daily-energy-intelligence`
- **Open PR**: [#13](https://github.com/christian-04-code/rrc-peer-dashboard/pull/13), base `main`, **DRAFT**, not merged. As of the Phase 6E closeout (2026-08-31), confirmed live via the GitHub API to be titled "Daily Energy Intelligence: automated news pipeline, AI analysis, and simplified News feed (Phases 2–5.1)" with head SHA `a05331d` (exactly this branch's tip) -- the title still undersells scope (predates Phase 6 entirely) but is no longer the stale "Phase 3" title this note used to describe. The agent still has no GitHub write credential in this sandbox (`gh auth login` not configured, no `GH_TOKEN`); whoever has `gh`/web access should update the title/body when convenient -- this is cosmetic only and does not affect safety.

**Phases completed, in order**: Phase 1 (architecture-only report) → Phase 2 (deterministic collection/normalize/dedupe/relevance/persistence pipeline) → Phase 2.5 (relevance-engine hardening) → Phase 3 (Anthropic-backed Range-impact analysis, manual validation) → Phase 4 (News tab UI, read-only) → Phase 5 (full daily automation) → Phase 5.1 (News tab UI simplification) → Phase 5.2 (progressive disclosure + "how this feed works" explainer) → Phase 6A (Macro/EIA audit + shared-taxonomy relocation) → Phase 6B (EIA Macro Intelligence: ingestion foundation) → Phase 6C (Macro UI: high-value modules + Permian chart fix) → Phase 6D (Dynamic Range Macro Risk Engine + AI Macro Summary) → **Phase 6E (Macro date/freshness closeout — functionally complete, pending only user-run live cron validation)**.

## Phase 6 — EIA Macro Intelligence System (functionally complete as of Phase 6E, 2026-08-28)

A new, separate subsystem from News. Only one thing is shared between them: the Range driver taxonomy (`lib/range-impact-framework.ts`, relocated from `lib/news/impact-framework.ts` in Phase 6A). Macro has its own EIA ingestion, its own deterministic signal calculations, its own persistence, and (Phase 6D) its own AI provider -- it does not import from `lib/news/`, and News does not import from Macro.

### Phase 6A — Audit + shared-taxonomy relocation

- Audited the existing Macro architecture (it was already substantial, not a blank slate): `lib/eia/client.ts`/`series.ts`/`macro-fundamentals.ts` (EIA API v2 fetchers), `lib/market/macro-analytics.ts`/`macro-fundamentals.ts`/`macro-types.ts` (deterministic calc + normalization), `components/dashboard/MacroPanel.tsx`/`MacroVisuals.tsx`/`MacroEnergyMap.tsx` (UI), 13 existing tests. Already fetching Henry Hub, national + 5 regional storage, all-state marketed production (including PA/WV/OH), LNG exports, dry gas production, demand-by-sector, and propane stocks -- all via EIA API v2, no XLS/XLSX.
- The existing "Biggest Risks to Range Resources" widget is `buildRrcMacroRisk()` in `lib/market/macro-analytics.ts`, rendered in `MacroPanel.tsx`'s "Appalachia / Range" section: already deterministic (4 candidate signals, severity-scored), but shows only the single highest-severity risk, tone is negative/neutral only (no "supportive" framing), and has no AI summary layer yet -- Phase 6D's job.
- Live-verified against the real EIA API this session (not assumed from docs): API v2 covers every top-priority Phase 6 dataset found, including STEO (Short-Term Energy Outlook) forecasts -- confirmed working series `NGHHMCF` (Henry Hub forecast), `NGPRPUS` (dry gas production forecast), `NGEPCNS_US` (power-sector consumption forecast), `NGWGPUS` (storage forecast). One candidate, `NGICPUS` (industrial consumption forecast), returned zero data rows despite appearing in EIA's own STEO facet browser -- excluded rather than guessed at. LNG export forecast (`NGLXPUS`) and total/commercial/residential consumption forecasts were found in EIA's facet listing but could not be independently confirmed to return data before hitting `OVER_RATE_LIMIT` on the public DEMO_KEY tier -- also excluded from this phase pending verification with the real project key. EIA does **not** publish Appalachian basis/hub pricing (Dominion South, Eastern Gas South, etc.) -- only Henry Hub nationally; not fabricated. EIA's STEO API only ever returns the *current* forecast vintage -- there is no API parameter for "last month's forecast," so forecast-revision tracking requires our own point-in-time snapshots (see Phase 6B below), not an EIA-side vintage query.
- **Relocated** `lib/news/impact-framework.ts` → `lib/range-impact-framework.ts` (shared, domain-neutral), adding 4 Macro-only driver keys (`us_gas_supply`, `appalachia_supply`, `industrial_demand`, `weather`) without touching or renaming any of News's original 8. Caught and fixed a real risk during the move: News's AI-prompt driver selection and AI-response validation both used to derive from `Object.keys(IMPACT_DRIVERS)` -- naively sharing the object would have silently let News's AI provider both receive and accept the new Macro-only keys. Fixed by scoping both to an explicit `NEWS_DRIVER_KEYS` constant (`lib/news/ai/relevant-drivers.ts`), with a regression test proving a real Macro key is rejected by News's validator.
- Also relocated `lib/news/persistence/db.ts` → `lib/persistence/db.ts` (same reasoning -- Macro's own new persistence needs the same one Postgres pool without creating a Macro→News dependency). Mechanical update across all 10 News files that imported it (plus `scripts/news/migrate.mjs`, initially missed by a `.ts`/`.tsx`/`.cjs`-only grep and caught on a manual read).

### Phase 6B — EIA Macro Intelligence: ingestion foundation

Ingestion foundation only -- no new Macro UI, no risk-monitor upgrade, no production AI summary generation. Those are Phases 6C/6D.

**EIA datasets integrated this phase (new)**:
- STEO Henry Hub price forecast, dry gas production forecast, electric-power consumption forecast, working-gas-storage forecast -- all **API v2** (`route: steo/data`, facet key `seriesId`, confirmed different from every other EIA route's `series` facet key), all four independently verified live this session.

**API vs. XLS/XLSX/CSV**: 100% API v2, for every dataset in this phase and, per Phase 6A's research, every current Range-priority dataset identified so far. No XLS/XLSX downloader/parser was built -- there is currently no verified Range-relevant dataset that needs one (the classic Drilling Productivity Report, the one plausible future XLS case, was folded into STEO's own data tables in June 2024 per EIA's own site). Documented as a deliberate omission, not an oversight: building unused download/parse infrastructure (plus a new npm dependency to actually parse a workbook) with zero real caller would be speculative code. Revisit only if a future module's research finds a genuine API gap.

**New Neon schema** (`lib/market/persistence/schema.sql`, applied via `npm run macro:migrate`) -- deliberately narrow, per explicit direction: only what needs durable point-in-time history, everything else stays on the existing live-fetch-plus-cache architecture untouched:
- `macro_steo_snapshots` -- one row per (series, calendar month fetched), `UNIQUE (series_id, snapshot_month)` so a same-month re-run upserts rather than duplicates. `points` is the compact normalized `{period, value}[]` forecast curve, never a raw EIA payload.
- `macro_risk_summaries` -- cached AI Range Macro summary (Phase 6D will populate it), keyed by `UNIQUE (input_fingerprint)` -- a SHA-256 of the canonicalized deterministic-signal payload (`computeMacroSummaryFingerprint` in `lib/market/persistence/summary-repo.ts`), so an unchanged snapshot never regenerates or duplicates a summary, and a page load can never be what triggers an AI call (nothing in this phase calls AI at all -- the repo functions and their idempotency contract are proven by fixture-level tests, no prompt/provider code exists yet).

**Canonical data model** (`lib/market/macro-steo-types.ts`): `SteoNormalizedSeries` (one live fetch, label/unit read directly from EIA's own `seriesDescription`/`unit` response fields, never hardcoded), `SteoSnapshotRecord` (the persisted shape), `SteoForecastRevision` (a pure diff between two snapshots of the same series -- `computeForecastRevisions()` in `lib/market/macro-steo.ts`, the only mechanism for any future "EIA raised its forecast by X" claim; nothing infers a revision that isn't a plain arithmetic difference between two real, persisted fetches).

**New source registry** (`lib/eia/macro-registry.ts`): 14 entries (10 existing + 4 new STEO) documenting id/name/category/EIA product/route/series-or-facets/ingestion type/update frequency/freshness kind/geographic scope/Range relevance/Range driver mapping/verified status/description for every EIA source Macro uses. Explicitly flags that EIA's "East" storage region is *not* Appalachia (spans Maine to Georgia) to prevent future conflation with the precise PA/WV/OH state-production module.

**Failure/staleness behavior**: `refreshSteoSnapshots()` (`lib/market/macro-steo-refresh.ts`) -- all 4 STEO series share one upstream API request; if that fetch itself fails or fails validation, the whole refresh fails cleanly (`attempted: 0`, nothing persisted) rather than writing partial/malformed data. Once the fetch succeeds, persistence is isolated per series (one series' DB write failing never blocks the other three). A series absent from a given month's response simply keeps its last-known-good snapshot from a prior month -- append/upsert-only, nothing is ever deleted. Snapshot freshness (`calculateSnapshotFreshness`) is based on when we last fetched, not on how far in the future a forecast period is -- deliberately separate from the existing `calculateFreshness()` used for observed actuals.

**Tests**: 6 new test files (`macro-registry`, `macro-steo`, `macro-steo-fetch`, `macro-steo-persistence`, `macro-summary-cache`, `macro-steo-refresh`) -- 983 JS tests total (up from 945) + 14 Python tests pass, typecheck clean, build clean (no new routes/pages -- nothing in this phase is reachable from the deployed app yet).

**Files changed**: new `lib/eia/macro-registry.ts`, `lib/market/macro-steo{,-types,-refresh}.ts`, `lib/market/persistence/{schema.sql,migrate.ts,steo-repo.ts,summary-repo.ts}`, `lib/persistence/db.ts`, `scripts/macro/migrate.mjs`, 6 new test files; modified `lib/eia/series.ts` (+`EIA_STEO_SERIES`/`steo` route), `lib/eia/macro-fundamentals.ts` (+`fetchSteoTable`), `package.json` (+`macro:migrate`), `scripts/news/migrate.mjs` (db.ts path fix), 10 News files (db.ts import path only, no behavior change), 3 News test files (same); deleted `lib/news/impact-framework.ts` and `lib/news/persistence/db.ts` (both relocated, see Phase 6A).

**Known limitations / next steps for Phase 6C+**: LNG export forecast, total/commercial/residential STEO consumption forecasts, and electricity generation-by-fuel (`electricity/electric-power-operational-data`) all need live verification with the real `EIA_API_KEY` (this sandbox's key comes back redacted) before being added to the registry -- LNG forecast in particular is high-priority and should be verified first. Appalachia-play-level shale gas production (as opposed to state-level PA/WV/OH, which is already verified and working) was not confirmed to exist as a queryable STEO series this session. Weather/HDD-CDD series were not located this session (STEO's facet browser truncated before a full search completed) and remain unverified.

### Phase 6C — Macro UI: high-value modules + Permian chart fix (2026-08-26)

Turned the Phase 6B ingestion foundation into an interactive Macro tab. Explicitly out of scope and NOT built this phase: the "Biggest Risks to Range Resources" AI risk-ranking engine, the AI Macro Summary, and the weekly PDF report (all remain Phase 6D+).

**Interrupted-run recovery**: this phase's run was manually stopped partway through by the user, then resumed. Recovery check (`git status`/`diff`/`log`/`fetch origin` against expected baseline `12c38ae`) found the working tree byte-identical to that commit — zero uncommitted diff, zero untracked files. The only in-progress work at interruption was a temporary, uncommitted diagnostic API route (`app/api/debug/steo-probe`) used to verify STEO series IDs against the real `EIA_API_KEY` via a throwaway Preview + `vercel curl`; it had already been deleted before the interruption and left no trace. No implementation work was lost — only verification conclusions, which were retained and carried forward into this phase.

**Section 3 verification (real `EIA_API_KEY`, not DEMO_KEY)**: confirmed 5 additional STEO series live, via the same temporary-diagnostic-route-then-delete pattern Phase 6B established (never commits the real key or exposes it to the agent):
- LNG exports forecast: `NGLXPUS` (the Phase 6B candidate) returns **zero rows** — real id is `NGEXPUS_LNG` ("Natural Gas LNG Gross Exports"). `NGEXPUS` (no suffix) is a *different*, real series ("Natural Gas Total Gross Exports", pipeline + LNG combined) — deliberately not used, to avoid mislabeling a broader figure as LNG-specific.
- Industrial consumption forecast: `NGICPUS` (as it appeared in EIA's own facet browser) returns **zero rows** — real id is `NGINX_US` ("U.S. Natural Gas Industrial Consumption").
- Total/residential/commercial consumption forecasts: `NGTCPUS`, `NGRCPUS`, `NGCCPUS` — all confirmed live with real data.
- All 5 added to `EIA_STEO_SERIES` (`lib/eia/series.ts`, now 9 series total) and `EIA_MACRO_SOURCE_REGISTRY` (`lib/eia/macro-registry.ts`, 5 new entries, `verified: true`), following the exact shape of Phase 6B's 4 existing STEO entries.

**UI architecture** (`components/dashboard/MacroPanel.tsx`, full rewrite of the render body): replaced the old flat stacked-sections layout with Section 6's requested hierarchy — Macro Pulse (unchanged compact top indicator strip) → a topic tab bar (`Gas Balance | Storage | Supply | Appalachia | LNG | Demand | EIA Outlook | Rigs`, reusing the existing `.macro-segmented` pattern) → one topic's content rendered at a time. No topic renders more than a handful of charts at once (progressive disclosure, per Section 6). Every pre-existing chart/table (`StorageChart`, `RegionalStorageTable`, `StateProductionRanking`, `DemandChart`, `MacroEnergyMap`, `BasinRigActivity`/`DrillingActivityModule`, the RRC risk callout, the Macro Snapshot evidence list) was relocated into the topic it fits, not duplicated — audited first per Section 5, nothing was rebuilt that already existed.

**New modules**:
- **Gas Balance** (new): a `classifyGasBalance()` function (`lib/market/macro-analytics.ts`, extracted as the one shared source of truth from the pre-existing Macro Snapshot "Natural Gas" row's logic, unchanged thresholds) drives a headline Tightening/Balanced/Loosening read from storage deviation + LNG export YoY growth only — deliberately **not** a raw production-minus-consumption figure, since marketed production and sector consumption are different-scoped EIA series and combining them would be an incompatible-unit aggregation. The Macro Snapshot evidence panel now lives in this (default/first) tab.
- **Appalachia** (rebuilt): `buildAppalachiaProduction()` (`lib/market/macro-analytics.ts`) sums PA + WV + OH marketed production for every period all three states report (a period is excluded entirely, never zero-filled, if any of the three is missing it — no silently understated total). Labeled everywhere as "PA + WV + OH marketed production"; an explicit on-page disclosure states this is a state-level EIA aggregate, never an official Marcellus-play figure, and the label is never "Marcellus production".
- **EIA Outlook** (new, `components/dashboard/EiaOutlookModule.tsx` + `app/api/macro/steo/route.ts` + `lib/market/use-macro-steo.ts`): a metric selector across all 9 verified STEO series, actual-vs-forecast charting where a compatible actual counterpart exists, and forecast-revision display via the existing `computeForecastRevisions()` — with an honest empty state ("only one EIA STEO snapshot has been captured ... revision tracking will populate as future monthly releases are captured") when only one snapshot exists, which is the current real state (no cron persists STEO snapshots yet — see below).
- **Supply, LNG, Demand**: each tab's primary actual-observation chart got a dashed EIA STEO forecast overlay appended (`HistoricalLineChart`'s new `forecast?: boolean` field on `ChartSeries`, rendered dashed with a "(forecast)" legend suffix — the interactivity spec's actual-vs-forecast distinction).

**Two real correctness bugs found and fixed during this phase's own visual QA** (not shipped):
1. **Unit mismatch on every actual-vs-forecast overlay**: EIA STEO series are reported in Bcf/d (most series) or Bcf (storage, a stock not a rate), while every EIA fundamentals "actual" series (production, LNG exports, sector demand) is MMcf/month. Charting them unconverted on one shared axis silently flattened the smaller-magnitude series to a flat line at the chart's edge. Fixed with a new `toBcfdSeries()` (`lib/market/macro-analytics.ts`) applied to every actual series before overlay. Two series were deliberately left forecast-only rather than force an overlay: Henry Hub (actual is $/MMBtu, STEO is $/Mcf — a different, unconverted price basis with no verified Btu-content conversion factor) and electric power consumption (STEO reports this one series in a bare "billion cubic feet" with no confirmed daily-rate convention, unlike the other consumption series' explicit "per day").
2. **STEO's own historical tail mislabeled as forecast**: live verification found every STEO series actually spans **2009-07 through the outlook's final forecast month** (~222 monthly points) in one continuous array, not just the forward-looking horizon. The initial build dashed and labeled "(forecast)" the entire span, including 16+ years of EIA-reported history — caught via visual QA when a Henry Hub "near-term forecast" stat showed "Jul 2009". Fixed with `filterToForecastHorizon()` (`lib/market/macro-analytics.ts`), which derives one shared forecast-start boundary (the month after the most recent EIA dry-gas-production actual — one STEO publication/fetch covers all 9 series with the same horizon start) and filters every chart, stat, and revision display to only the genuine forward projection.

**Permian rig chart layout bug (Section 18) — root cause and fix**: the "Permian rig count — last 12 months" chart (`components/dashboard/BasinRigActivity.tsx`, rendered via the shared `HistoricalLineChart`) appeared as a narrow plot centered in a large empty area. Root cause: `app/globals.css`'s `.drilling-history .macro-evidence-chart svg { height: 92px; }` rule is shared between two structurally different consumers of the same `.drilling-history` class — `DrillingActivityModule` (Pennsylvania rig chart), which renders inside the narrow `.macro-map-detail` sidebar column (`minmax(260px, .55fr)`, where 92px height roughly matches the SVG's fixed 660:220 viewBox aspect ratio), and `BasinRigActivity` (Permian etc.), which renders in the *wide* `.macro-map-layout` column (`minmax(0, 1.7fr)`). At that much greater width, the same fixed 92px height no longer matches the viewBox's 3:1 aspect ratio, so the SVG's default `preserveAspectRatio="xMidYMid meet"` shrinks the plot to fit the height and centers it, leaving large empty side margins. Fixed with a more specific, scoped override — `.basin-detail .drilling-history .macro-evidence-chart svg { height: auto; aspect-ratio: 660 / 220; }` — that derives height from width instead of hardcoding it, so the rendered box's aspect ratio always matches the viewBox's at any container width. Data was never touched. Regression-checked visually: the PA sidebar chart (same shared component, same CSS class, narrow column) is unaffected; Storage, Supply, and LNG charts (all also `HistoricalLineChart` consumers, different CSS scope) are unaffected.

**STEO snapshot persistence**: no cron job persists STEO snapshots yet. `app/api/macro/steo/route.ts` opportunistically upserts the current fetch as the current calendar month's snapshot on every real request (idempotent per `(series, month)`, per Phase 6B's existing upsert), so revision tracking will begin populating as real traffic spans different months — no new Vercel Cron entry was added (Hobby's cron allowance is already spent on the one daily news cron, and STEO only republishes monthly regardless). `refreshSteoSnapshots()`'s own doc comment reserves an explicit scheduled-route caller for a future phase; this phase intentionally did not add one.

**Tests**: `tests/macro-appalachia-gas-balance.test.cjs` (new — `buildAppalachiaProduction`, `classifyGasBalance`, `toBcfdSeries`, `filterToForecastHorizon`), `tests/macro-registry.test.cjs` / `tests/macro-steo.test.cjs` / `tests/macro-steo-fetch.test.cjs` (updated for 9 series), `tests/macro-fundamentals.test.cjs` (updated for the new tab architecture — the old numbered-section-ordering assertion was replaced with an equivalent one for the tab structure, not weakened). **996 JS tests pass** (up from 991 pre-phase; 38 DB-gated tests skip with no local Postgres, 0 fail) + **14 Python tests pass**. `npm run typecheck` clean. `npm run build` succeeds, including the new `/api/macro/steo` route.

**Preview QA**: deployed to Preview (`vercel deploy --yes`, never `--prod`) across two iterations as the two bugs above were found and fixed; each fix was re-deployed and re-verified live in a real browser before proceeding. Confirmed live: all 8 Macro topic tabs render with real data; the Permian chart fix; Supply/LNG/Demand actual-vs-forecast overlays share a correct axis after the unit fix; EIA Outlook's metric selector lists all 9 series with the correct forecast-only near-term date after the horizon fix; Overview, Forecast, and News tabs render unchanged. Mobile-viewport screenshot verification was attempted but the browser automation tooling's window resize did not take effect in this session (screenshots stayed at the desktop viewport regardless) — the new tab bar's responsive CSS (`overflow-x: auto` on `.macro-topic-tabs`) follows the same pattern already used elsewhere in this file's existing mobile media queries, but is unverified visually at a real mobile width.

**Files changed**: new `app/api/macro/steo/route.ts`, `components/dashboard/EiaOutlookModule.tsx`, `lib/market/use-macro-steo.ts`, `tests/macro-appalachia-gas-balance.test.cjs`; modified `app/globals.css` (Permian fix + new EIA Outlook/tab styles), `components/dashboard/MacroPanel.tsx` (full render-body rewrite), `components/dashboard/MacroVisuals.tsx` (`ChartSeries.forecast` field), `lib/eia/macro-registry.ts` (+5 STEO entries), `lib/eia/series.ts` (+5 `EIA_STEO_SERIES` keys), `lib/market/macro-analytics.ts` (+`classifyGasBalance`, `buildAppalachiaProduction`, `toBcfdSeries`, `filterToForecastHorizon`, exported `shiftMonth`), `lib/market/macro-steo-types.ts` (+5 `SteoSeriesKey` values), `tests/macro-fundamentals.test.cjs`, `tests/macro-steo-fetch.test.cjs`.

**What exists now**: everything from Phases 2–6B (see prior phase notes below this section) plus everything above.

### Phase 6D — Dynamic Range Macro Risk Engine + AI Macro Summary (2026-08-26)

Replaced the static single-signal "Biggest Risks to Range Resources" widget (`buildRrcMacroRisk`, negative-only, one risk at a time) with a fully deterministic, multi-signal, ranked risk/opportunity engine, plus a cached AI executive summary that only ever explains what the engine already computed. `buildRrcMacroRisk`/`RrcMacroRisk` and their 3 tests were deleted, not deprecated -- the new engine is a strict superset of what they did.

**The deterministic engine is the source of truth; AI is commentary only** -- enforced structurally, not just by convention: the AI provider's input type (`MacroRiskPayload`) contains only already-classified signals, never a raw metric, and nothing in `lib/market/ai/` can rank or reclassify a signal.

**7 signals evaluated** (`lib/market/macro-risk-engine.ts`), each reusing an existing Range driver taxonomy key (`lib/range-impact-framework.ts`) and only real, already-validated project data -- no new EIA series, no speculative driver added merely to fill the widget:
- **Primary tier**: `gas_pricing` (Henry Hub 30-observation trend), `storage_levels` (storage vs. 5-year average, inverted -- a surplus is a price *risk*), `us_gas_supply` (national dry-gas production YoY, inverted -- accelerating supply is a risk), `appalachia_supply` (Phase 6C's `buildAppalachiaProduction()` PA+WV+OH YoY, inverted, same reasoning, and labeled identically -- never "Marcellus production"), `lng_demand` (LNG exports YoY, not inverted -- growth is supportive; verified `NGEXPUS_LNG` STEO forecast direction appended as reason-text context only, never blended into the number).
- **Secondary tier**: `power_data_center_demand` (electric-power gas demand YoY only -- Phase 6C's unit-ambiguity finding for this one STEO series is preserved here too, so no forecast direction is claimed for it), `industrial_demand` (industrial gas demand YoY, with STEO forecast direction as context, since that series' unit *is* confirmed compatible after Phase 6C's `toBcfdSeries` conversion).
- Explicitly excluded, and why: weather/HDD-CDD (no validated series located in Phase 6B/6C), `appalachian_takeaway`/regional basis differentials (no validated data source in this project), `ngl_demand`/`regulation` (not requested, no validated quantitative series).

**Classification**: one ordinal scale, `HIGH_RISK > MODERATE_RISK > WATCH > SUPPORTIVE` (`UNAVAILABLE` when an input is missing/stale -- never guessed or zero-filled). Thresholds are the *same* +/-5% relative-deviation convention already shipped and tested for storage/LNG/gas-balance classification (`classifyGasBalance`), reused rather than inventing new numbers; `HIGH_RISK`/`SUPPORTIVE`'s +/-10% is a natural doubling, not a separately-tuned cutoff. No fabricated numeric score (no "73.4/100") anywhere in the payload or UI.

**Ranking** (`rankRangeMacroSignals`): primarily by state in the fixed severity order above, then by Range-priority tier (primary before secondary), then alphabetically by driver key as the final deterministic tie-break. Section 11's "not only-negative" requirement is a separate, explicit, testable rule on top of that sort: if the top-N slice contains no `SUPPORTIVE` signal but at least one exists anywhere in the full ranking, the single best-ranked `SUPPORTIVE` signal replaces the slice's last (least-severe) item. Verified live on Preview with real EIA data: Storage (MODERATE_RISK) → 3 primary-tier WATCH signals alphabetically → LNG Demand swapped in as the guaranteed supportive item, exactly matching the tested rule.

**Freshness gating** (`lib/market/macro-risk-orchestrate.ts`): every input is treated as unavailable (never just "missing") if its underlying `NormalizedMarketMetric`/`DemandMetric`'s own `freshness` is `"stale"` or `"unavailable"` -- Section 9's "stale data must not produce a risk state" is enforced at the same layer that already computes freshness for the rest of the Macro tab, not reimplemented. One source failing (STEO down, demand table down) degrades only the signals that depend on it (verified with mocked partial failures); the deterministic snapshot still renders fully otherwise.

**AI summary** (`lib/market/ai/`, mirrors `lib/news/ai/`'s structure but is its own separate implementation per the Phase 6A News/Macro boundary -- only `lib/news/ai/retry.ts`'s `withBoundedRetry` is imported directly, since it's a genuinely domain-neutral utility with zero News coupling): Claude Haiku 4.5, forced tool-use output (a single `summary` string field, 3-6 sentences, validated for length and for guaranteed-outcome/stock-direction-certainty language -- its own copy of the forbidden-phrase check, extended with "stock will rise/fall/outperform/underperform"). The AI receives only the structured `MacroRiskPayload` (ranked signals + all-evaluated supportingMetrics + a data-period `snapshotAsOf`, deliberately never a wall-clock timestamp, so re-fetching the *same* underlying EIA data always fingerprints identically) plus, when available, the previous distinct summary's text as "what changed" context -- never raw EIA rows, never asked to recalculate anything.

**Caching / idempotency** (`lib/market/macro-summary-service.ts`, `computeMacroSummaryFingerprint` unchanged from Phase 6B): fingerprint lookup first; AI is called only on a genuine cache miss, with `DEFAULT_ANALYSIS_RETRY_CONFIG`'s bounded retry. `ON CONFLICT DO NOTHING` plus a re-read means two concurrent callers for the same fingerprint (a duplicate cron delivery) always converge on whichever summary persisted first -- proven with a real concurrent-write test against local Postgres, not just asserted.

**Scheduled generation, never browser-triggered**: a new, genuinely separate cron entry, `/api/cron/macro` at `15 12 * * *` UTC (1 hour after News's `15 11`), added to `vercel.json`. Confirmed live against current Vercel docs before adding it: Hobby allows up to 100 cron jobs per project (each still capped at once/day) -- the earlier assumption in this doc's Phase 6C section that "Hobby's cron allowance is already spent on the one daily news cron" was wrong and is superseded by this finding. The cron route (`lib/market/macro-orchestrate-daily.ts`) is guarded by its own Postgres advisory lock (`rrc_macro_daily_orchestration`, separate key from News's `rrc_news_daily_orchestration`) against duplicate-delivery double-billing, same mechanism News already uses. It also persists this run's STEO snapshot via Phase 6B's existing (unchanged) `refreshSteoSnapshots()`, so revision tracking keeps accumulating real history. The browser-facing `/api/macro/risk` route recomputes the deterministic signals fresh on every request (cheap, same live-fetch pattern as the rest of the Macro tab) but only ever *reads* a cached summary -- verified by source-inspection test that neither Macro browser route ever imports `AnthropicMacroSummaryProvider`.

**Stale-summary handling**: if no cached summary matches the current fingerprint (data changed since the last cron run), the route falls back to the most recent available summary but labels it `aiSummaryStatus: "stale"` with its own real `generatedAt`, distinct from `"pending"` (no summary has ever been generated) and `"ready"` (matches current data exactly) -- the UI never presents old commentary as current. "What changed" similarly distinguishes "no prior snapshot exists yet" from "compared, and nothing changed" (`hasPriorSnapshot` flag) -- both would otherwise render an empty `changes: []` list with no way to tell them apart.

**UI** (`components/dashboard/MacroRiskWidget.tsx`): replaced the Appalachia tab's old single-callout in place (Section 10's "existing widget" upgraded, not relocated). Ranked items show rank, driver label, a restrained left-border/badge color (green=SUPPORTIVE, amber=MODERATE_RISK, red=HIGH_RISK, muted=WATCH -- never an aggressively-colored full card), 1-2 real metrics, the deterministic reason text, and a "View \[driver\] data →" button that switches the Macro tab's active topic (`RISK_DRIVER_TOPIC` maps all 7 driver keys to an existing topic tab; a test asserts every engine-producible key has a mapping, so a click can never target a nonexistent tab).

**Not built this phase** (explicitly deferred, per instruction): the weekly PDF report feature.

**Verification note**: the real cron route was intentionally *not* triggered by the agent against the Preview-scoped real `ANTHROPIC_API_KEY`/`CRON_SECRET` -- Phase 5 established that live-cost/live-credential verification via `vercel curl` is performed by the user directly, not the agent, and that boundary was preserved here. Everything reachable without spending real AI budget was verified live on Preview (deterministic ranking exactly as tested, `"pending"` AI state, `"more history is needed"` state) -- the `"ready"`/`"stale"` AI states and the actual cron orchestration are covered by DB-gated automated tests against a real local Postgres (`tests/macro-summary-service.test.cjs`, `tests/macro-risk-route.test.cjs`) but not by a live Preview AI generation. The user should trigger `/api/cron/macro` once with the real `CRON_SECRET` (same `vercel curl` pattern as News) to confirm the live AI summary end-to-end before considering Phase 6D fully closed out in production.

**Tests**: 6 new test files (`macro-risk-engine` -- 29 tests, `macro-risk-orchestrate` -- 4, `macro-ai-schema-validation` -- 10, `macro-summary-service` -- 6 DB-gated, `macro-cron-route` -- 8, `macro-risk-route` -- 5 (2 DB-gated), `macro-risk-widget` -- 10) plus extensions to `macro-summary-cache` (+4 DB-gated) and `macro-appalachia-gas-balance` (+2, for the `monthlyYoy` relocation). **1071 JS tests pass** (996 → 1071; 50 skip with no local Postgres in the default sandbox run, 0 fail) + **14 Python tests pass**. Every new DB-gated test file was also individually verified passing against a real local Postgres (started for this session, stopped and dropped afterward) -- not left as merely-skipped and unproven. `npm run typecheck` clean. `npm run build` succeeds, including both new routes (`/api/cron/macro`, `/api/macro/risk`).

**Files changed**: new `lib/market/macro-risk-engine.ts`, `lib/market/macro-risk-orchestrate.ts`, `lib/market/macro-orchestrate-daily.ts`, `lib/market/macro-summary-service.ts`, `lib/market/build-market-metrics.ts`, `lib/market/use-macro-risk.ts`, `lib/market/ai/{provider,anthropic-provider,types,model-config}.ts`, `app/api/macro/risk/route.ts`, `app/api/cron/macro/route.ts`, `components/dashboard/MacroRiskWidget.tsx`, 6 new test files; modified `app/api/market/route.ts` (metric-fetch logic extracted to build-market-metrics.ts, same behavior), `lib/market/persistence/summary-repo.ts` (+`getLatestMacroSummary`, +`getPreviousMacroSummary`), `lib/market/macro-analytics.ts` (removed `buildRrcMacroRisk`/`RrcMacroRisk`; moved `monthlyYoy` in from MacroPanel.tsx as the one shared implementation), `components/dashboard/MacroPanel.tsx` (widget wiring, `rrcRisk` removed), `app/globals.css` (+widget styles), `vercel.json` (+macro cron entry), `tests/macro-panel-metric-mapping.test.cjs` / `tests/macro-analytics.test.cjs` / `tests/macro-fundamentals.test.cjs` (updated for the above, not weakened).

### Phase 6E — Macro date/freshness closeout (2026-08-28)

Final Macro closeout pass. No signal calculation, ranking, threshold, chart dataset, or AI prompt logic from Phase 6D was touched — this phase is date/freshness UI plus one real architectural bug fix in how "Last Updated" is sourced.

**Resume note**: this phase's work was fully code-complete and uncommitted when this session resumed after an interruption. Recovery (`git status`/`log`/`diff` against expected baseline `8adc856`) confirmed local HEAD == `origin/feat/daily-energy-intelligence` at `8adc856`, with exactly the Phase 6E files (5 new, 9 modified) sitting uncommitted in the working tree — nothing was lost, nothing was redone. This session's job was to verify that existing work, finish the visual QA it was mid-way through, and close out.

**"Last Updated" — exact definition**: the most recent `completed_at` timestamp from a new, genuinely cron-exclusive table, `macro_orchestration_runs` (`lib/market/persistence/orchestration-repo.ts`'s `getLatestOrchestrationTimestamp`), written to from exactly one place — the success path at the end of `runMacroDailyOrchestration()` (`lib/market/macro-orchestrate-daily.ts`). It is never derived from `Date.now()`, a request timestamp, or any page-view side effect. `/api/macro/risk` exposes it as `lastOrchestrationAt`; `MacroPanel.tsx` renders it via `formatRefreshTimestamp()` in Central Time (e.g. "Aug 28, 2026 · 6:15 AM CT"), or "Not yet available" when the table is empty — which is the real, honest state on the current Preview, since no cron run has ever executed against its database.

**Bug found and fixed — "Last Updated" was reflecting page views, not cron runs**: the first implementation read `MAX(updated_at) FROM macro_steo_snapshots` as a proxy for "last successful Macro refresh." That table is *also* opportunistically upserted by `/api/macro/steo/route.ts` on every ordinary page view (a Phase 6C behavior, unrelated to cron) — so "Last Updated" was silently showing "the last time anyone loaded the Macro tab," directly violating the requirement that it never imply a refresh just because the page was opened. Caught via live Preview QA, not by any unit test (existing tests only checked source text/mocked behavior, not the real cross-route interaction). Fixed by introducing `macro_orchestration_runs` as a new, separate, append-only table (`lib/market/persistence/schema.sql`), written only from the cron's own success path; `steo-repo.ts` was left untouched behaviorally (a stray addition/removal there nets to a trailing-newline-only diff). Re-verified live: a fresh Preview deploy now correctly shows "Not yet available" instead of a fabricated recent timestamp.

**How chart/module dates are determined**: every date shown is the source's own reported period, read from already-existing metric/series fields (`metric.period`, `series.fetchedAt`, `getRigDataset().source.reportDate`, etc.) — nothing is inferred from the browser clock or hardcoded. Three shared formatters (`lib/market/format-dates.ts`) enforce consistent, UTC-anchored (for data periods) or Central-Time (for refresh instants) display: `formatDataDate()` ("Aug 2026" or "Aug 14, 2026"), `formatWeekEnding()` ("Week ending Aug 21, 2026"), `formatRefreshTimestamp()` ("Aug 28, 2026 · 6:15 AM CT" / "Not yet available" for null). STEO vintage/release dates use the existing `snapshotMonthFrom(series.fetchedAt)` (unchanged, from Phase 6B). Every module in the Section 5 audit list got its date surfaced: Macro Pulse (per-metric footer), Henry Hub/Storage/Supply/Gas Balance/Appalachia/LNG/Power/Industrial (via `observationLabel()`, extended with a `freshness` param), EIA Outlook + inline STEO subsections (`steoVintageLabel()`), Rigs (Baker Hughes `reportDate` via `formatWeekEnding`), regional storage panels, the risk widget, and the AI summary — without duplicating a date at the module level when one clearly covers the whole section.

**Stale-data behavior**: `observationLabel()` now appends "· Stale" whenever the underlying metric's existing `MarketFreshness` value (`calculateFreshness()`, unchanged Phase-6-era logic) is `"stale"` — e.g. "Data through Jul 2026 · Stale" — so old data is never shown identically to current data. This surfaces an existing classification; no new freshness logic was written.

**Risk-widget date behavior**: the widget header shows "Macro snapshot: {formatDataDate(data.snapshotAsOf)}" using the deterministic engine's own data-period marker (`MacroRiskPayload.snapshotAsOf`, unchanged from Phase 6D, never a fetch timestamp) — verified live showing "Macro snapshot: Aug 25, 2026". The "DATA FRESHNESS" disclosure block beneath it (pre-existing) already lists each tracked metric's own observation date, retrieval time, and freshness state, satisfying the "concise per-metric disclosure" requirement without new UI.

**AI-summary date behavior**: `MacroRiskWidget.tsx` now reads `data.aiSummary.snapshotAsOf` (the cached summary's own persisted data-period, exposed for the first time this phase via `/api/macro/risk`'s response) and `data.aiSummary.generatedAt` (unchanged) as two distinct labels: "Based on Macro snapshot {date} · Generated {timestamp}". On the current Preview (no cron has run), `aiSummaryStatus` is correctly `"pending"` and the widget shows "AI summary has not been generated for the current data snapshot yet. It updates on the daily Macro schedule, never on page load." — verified live.

**Test-fixture fix (unrelated to product code)**: `tests/macro-risk-orchestrate.test.cjs`'s hardcoded `Date.UTC(2026, ...)`-based fixture dates had aged past `calculateFreshness()`'s real thresholds as wall-clock time advanced during this long-running effort (a "lagged" fixture drifted to "stale," causing a false failure). Fixed with a `DAY_SHIFT` pattern that shifts every fixture date by the same delta so the fixture's "latest" point stays pinned near the real test-run time indefinitely, while preserving exact relative day-offsets (needed for `fiveYearStorageRows`'s hand-tuned same-ISO-week alignment across 5 years). This is a test-infrastructure fix only — no engine/threshold logic changed.

**Cron-trigger investigation**: confirmed via live Vercel CLI docs (`vercel docs cli/crons`) that `vercel crons run <path>` is Production-only by design — "reads cron definitions from your deployed project... you must `vercel deploy --prod` before `vercel crons run` can find it." There is no safe way to trigger `/api/cron/macro` against a Preview deployment via the Vercel CLI. Per explicit instruction, this validation step was left pending for the user rather than promoting to Production, weakening auth, or adding a temporary unauthenticated route. Exact command for the user to run themselves (never pastes the secret into chat; hidden input; same `vercel curl` pattern as Phase 5's News validation):

```bash
read -s -p "CRON_SECRET: " CRON_SECRET && echo && \
vercel curl "<PREVIEW_URL>/api/cron/macro" -- -H "Authorization: Bearer $CRON_SECRET" -s | tee /tmp/macro-cron-1.json && echo && \
echo "--- second identical call (idempotency check) ---" && \
vercel curl "<PREVIEW_URL>/api/cron/macro" -- -H "Authorization: Bearer $CRON_SECRET" -s | tee /tmp/macro-cron-2.json && echo && \
unset CRON_SECRET && \
echo "--- /api/macro/risk aiSummary state ---" && \
vercel curl "<PREVIEW_URL>/api/macro/risk" -- -s | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(JSON.stringify({aiSummaryStatus:d.aiSummaryStatus,generatedAt:d.aiSummary?.generatedAt,snapshotAsOf:d.aiSummary?.snapshotAsOf,lastOrchestrationAt:d.lastOrchestrationAt},null,2))"
```
Replace `<PREVIEW_URL>` with the latest deployment URL (see "Preview deployment" below). Expect: first call `status: "ok"` with `aiGenerated: true`; second call `aiGenerated: false`/`aiCacheHit: true` (same fingerprint, no regeneration/recharge); the final `/api/macro/risk` read should show `aiSummaryStatus: "ready"` with a real `generatedAt`/`snapshotAsOf`.

**Tests**: 5 new test files (`macro-format-dates` — 9 tests, `macro-last-updated` — 17 source-level tests, `macro-orchestration-repo` — 4 DB-gated) plus updates to `macro-risk-route` (2 DB-gated tests re-pointed at the correct table) and `macro-risk-orchestrate` (the `DAY_SHIFT` fix, same 4 tests). **1106 JS tests pass** (1071 → 1106; 0 fail, 56 skip with no local Postgres in the default sandbox run — all DB-gated tests, including the new ones, were also individually verified passing against a real local Postgres started for this session and torn down afterward) + **14 Python tests pass**. `npm run typecheck` clean. `npm run build` succeeds with no new routes.

**Preview deployment**: `https://rrc-peer-dashboard-l5uinm1lt-christian-04-codes-projects.vercel.app` (never promoted to Production). Visually verified live, real EIA/Neon data: Overview unaffected; every Macro topic tab (Gas Balance, Storage, Supply, Appalachia, LNG, Demand, EIA Outlook, Rigs) shows its own correctly-formatted, non-duplicated date; "LAST UPDATED / Not yet available" renders correctly and honestly at the top of the Macro tab; the risk widget's "Macro snapshot: Aug 25, 2026" and the AI summary's "pending" state render correctly; the "DATA FRESHNESS" disclosure lists real per-metric dates; the Permian rig chart (Phase 6C's fix) still renders full-width with no letterboxing; Forecast and News tabs are unaffected.

**Not built this phase** (explicitly deferred, per instruction): the weekly PDF report feature.

**Files changed**: new `lib/market/format-dates.ts`, `lib/market/persistence/orchestration-repo.ts`, `tests/macro-format-dates.test.cjs`, `tests/macro-last-updated.test.cjs`, `tests/macro-orchestration-repo.test.cjs`; modified `app/api/macro/risk/route.ts` (+`snapshotAsOf`/`lastOrchestrationAt` fields), `app/globals.css` (+freshness/snapshot-date styles), `components/dashboard/{EiaOutlookModule,MacroEnergyMap,MacroPanel,MacroRiskWidget}.tsx`, `lib/market/macro-orchestrate-daily.ts` (+`recordOrchestrationRun` call), `lib/market/persistence/schema.sql` (+`macro_orchestration_runs` table), `lib/market/persistence/steo-repo.ts` (net no-op), `tests/macro-risk-orchestrate.test.cjs`, `tests/macro-risk-route.test.cjs`.

**What remains before Production promotion**: (1) the live cron/AI validation command above, run by the user with the real `CRON_SECRET`; (2) PR #13 stays a draft, not merged, per standing instruction; (3) the weekly PDF report feature (explicitly out of scope for Phase 6). With those caveats, Phase 6 (Macro/EIA Intelligence) is functionally code-complete as of this commit.

### Phase 5 — Full Daily Automation (2026-08-26)

- **`lib/news/pipeline/orchestrate.ts`** (new) — `runDailyNewsOrchestration()`, the one shared orchestration path for a full scheduled run. Calls the *existing* `runNewsPipeline()` then the *existing* `analyzeEligibleArticles()` — the same domain functions the Phase 3 manual `/api/cron/news/analyze` endpoint already used; no business logic was duplicated. AI analysis is capped at the existing centralized `PIPELINE_CONFIG.maxAiAnalysesPerRun` (40, env-overridable via `NEWS_MAX_AI_ANALYSES_PER_RUN`). A Postgres advisory lock (`pg_try_advisory_lock(hashtext('rrc_news_daily_orchestration'))`) guards against Vercel's documented occasional-duplicate-cron-delivery causing two overlapping invocations to double-charge AI on the same article before either writes back.
- **`app/api/cron/news/route.ts`** — now the one production Vercel Cron target. Runs idempotent schema migration (`runNewsMigrations()`, only when a database is configured) then `runDailyNewsOrchestration()`. `maxDuration` raised to 300s — Hobby's actual fluid-compute default *and* max, confirmed live from current Vercel docs (not the 60s an old assumption would have used). Auth unchanged: `Authorization: Bearer $CRON_SECRET`, which Vercel auto-attaches to real cron-triggered requests; graceful (not hard-failing) when DB/AI key are unset, matching the pre-existing Phase 2 tolerance for a DB-less dev environment.
- **`app/api/cron/news/analyze/route.ts`** — untouched. Stays the separate, lower-capped (5 articles), manual-only validation endpoint. A pre-existing test already forbids this route from ever appearing in `vercel.json`; a new test confirms only `/api/cron/news` is registered there.
- **`lib/news/pipeline/analyze.ts`** — `analyzeEligibleArticles` gained an optional `scopeArticlesToRun` (default `true`, so Phase 3's manual-validation behavior is byte-for-byte unchanged). The scheduled orchestration passes `false`, so an article a previous day's run left `retained` (e.g. because that run hit the AI cap or the function time limit) is picked up by the *next* run instead of being permanently stranded — under the old always-scoped-to-one-run behavior, no future run's own new `pipeline_run_id` would ever match it again.
- **`lib/news/persistence/schema.sql` / `pipeline-runs-repo.ts` / `types.ts`** — additive `ai_analyses_failed` column + field (idempotent `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`), alongside the pre-existing attempted/completed counts.
- **`vercel.json`** (new — first one in the repo): registers exactly one cron entry, `{"path": "/api/cron/news", "schedule": "15 11 * * *"}`.

**Schedule** (`15 11 * * *` UTC — Vercel Cron is always UTC): targets an early-morning Central run. Central alternates CST (UTC-6, ~Nov–Mar) and CDT (UTC-5, ~Mar–Nov); a single fixed UTC cron cannot track DST. 11:15 UTC = **6:15am CDT** (~8 months/year) or **5:15am CST** (the other ~4, winter) — chosen so the run is never *later* than 6:15am Central, only up to an hour early in winter. Vercel Hobby also only guarantees firing *within* the specified hour (±59 min, confirmed live from current docs) — so "6:15am Central" is a target, not a guarantee, on top of the DST drift.

**AI cost controls** (reused from Phase 3, not reimplemented): deterministic relevance filtering happens before any AI call; hard cap of 40 analyses/run (`PIPELINE_CONFIG.maxAiAnalysesPerRun`); bounded retry (3 attempts, `lib/news/ai/retry.ts`); an article with a completed analysis is never re-analyzed.

**Idempotency**: enforced at the persistence layer, not just by "don't retrigger" — `articles` has unique constraints on both `normalized_url` and `fingerprint` (`INSERT ... ON CONFLICT DO NOTHING`), and `saveArticleAnalysis`/`markArticleAnalysisFailed` both guard `WHERE processing_status = 'retained'`. A re-run of the same day's collection, or a duplicate cron delivery, discovers zero new articles and re-charges zero AI analyses for anything already `analyzed`. The advisory lock additionally prevents two *overlapping* runs from both selecting the same eligible article before either writes back.

**Tests**: 902 JS tests (25 new/extended for Phase 5, DB-gated, run against a real local Postgres) + 14 Python tests, all passing. `npm run typecheck` clean. `npm run build` succeeds; `git diff --stat` confirmed zero diff to `components/dashboard/`, `lib/forecast/`, `data/`, `config/companies.json`, and every other pre-existing dashboard file outside `lib/news/`, `app/api/cron/`, `app/api/news/status/`, and this doc.

**Manual Preview validation**: performed by the user directly (not the agent — see Known limitations) against Preview deployment `dpl_5C516uub5zEpGoRpvmYnAQwvZpgX` (`https://rrc-peer-dashboard-8evwz3ez7-christian-04-codes-projects.vercel.app`) via `vercel curl` with the real `CRON_SECRET`. Two consecutive real runs against the real Preview-scoped Neon DB and Anthropic key; user confirmed both succeeded and the second did not duplicate articles or re-charge AI for already-analyzed stories.

**Production activation**: Vercel Cron only ever triggers against a project's Production deployment URL (confirmed live from Vercel's docs) — Preview deployments never run cron jobs regardless of `vercel.json` content. At the user's explicit direction, this branch was deployed straight to Vercel Production via `vercel deploy --prod`, independent of a git merge to `main`. This means Production now runs code that diverges from `main`'s git history until PR #13 is eventually merged — **the next ordinary deploy triggered by a push to `main` will silently replace this Production deployment (and its News functionality) unless that merge happens first.** Exact deployment ID/URL and cron registration status are reported in-chat at the end of the Phase 5 session, not duplicated here to avoid staleness.

**Known limitations**:
- The Range/peer-entity-specific AI-analysis path is built and tested but has been exercised against very few live, naturally-retained Range-/peer-specific stories so far (still mostly topic-driven articles).
- The optional "24-Hour Range Environment" aggregate widget remains intentionally unbuilt — no defensible aggregate methodology exists yet.
- Running multiple DB-gated `news-*` test files concurrently against one shared local Postgres can race (each truncates shared tables in `beforeEach`); each file passes reliably run individually or with `--test-concurrency=1`, and this never affects real CI (no `DATABASE_URL` there) or the deployed app.
- All Neon/Postgres, `CRON_SECRET`, and `ANTHROPIC_API_KEY` values are Vercel "Sensitive" — pulled via the Vercel CLI in this sandbox, they come back as the literal string `[SENSITIVE]`, not real values. Any live-HTTP validation against a real deployment must be run by the user themselves (e.g. `read -s CRON_SECRET` in their own terminal, never pasted into chat), not by the agent.
- Production is now running ahead of `main` (see "Production activation" above) — merging PR #13 should happen with awareness that Production already reflects this branch's tip, not `main`'s.

### Phase 5.1 — News tab UI simplification (2026-08-26)

UI-only change (explicitly out of scope: ingestion, AI analysis, persistence schema, cron, and all other dashboard tabs — none of it was touched).

- **Removed the category/impact/strength filter button rows** from the primary News experience. `NewsPanel.tsx` no longer imports or renders `NewsFilters.tsx`, no longer holds filter state, and now maps directly over every displayable article (the full, unfiltered daily feed) under a single understated "All News" section heading. `NewsFilters.tsx` and the filter data/logic it depends on (`NEWS_CATEGORY_FILTERS`, `IMPACT_FILTERS`, `IMPACT_STRENGTH_FILTERS`, `filterArticles`, `NewsFilterState`) were **not deleted** — preserved on disk, unrouted, the same pattern already established for `components/dashboard/PeersPanel.tsx`.
- **Deterministic headline-color rule** — new `rangeImpactTone(article)` in `lib/news/article-display.ts`, using only the two existing categorical AI fields (never a new numeric confidence cutoff): no AI result yet → `neutral` (default text color); `rangeImpact === "neutral"` → `caution` (amber); `rangeImpact` positive/negative at `impactStrength` `"low"` (or missing) → `caution`; positive/negative at `"medium"`/`"high"` → that direction's color. Applied to the headline only (`ArticleCard.tsx` and `NewsDetailDrawer.tsx`), never the whole card. New `--caution: #e5ad63` design token in `app/globals.css` (additive, one line) — reuses the app's existing amber/warning hue (already used for rig counts, oil commodity lines, "completed with errors" states) rather than inventing a new color.
- **Two real bugs found and fixed during live visual QA against Preview** (both were silent CSS-specificity issues, not visible from source review alone):
  1. The card headline is a `<button>` inside `.news-card.panel`; the pre-existing global `.panel button { color: var(--accent); }` rule (specificity 0,1,1) silently outranked a single-class `.news-headline-positive` selector (0,1,0), so every headline rendered accent-blue regardless of tone. Fixed with a compound `.news-card-headline.news-headline-positive` selector (0,2,0).
  2. The drawer's AI section applied `.news-ai-label`'s accent-blue color to the whole `<section>` (inherited by its own `rangeAnalysis` paragraph, not just the heading), so the "AI Range Analysis" label didn't actually stand out from its own body text — working against the task's own "headers must be distinguishable from body copy" goal. Fixed by moving the class from the `<section>` onto the `<h3>` directly, matching the pattern `ArticleCard.tsx` already used correctly.
- **Header hierarchy strengthened**: "Daily Energy Intelligence" (15px→18px, bold, now separated from the stats grid by a border), "Factual Summary"/"AI Range Analysis" card and drawer labels (10px→11-12px, heavier weight/letter-spacing).
- **Tests**: 12 new tests (`tests/news-ui-simplification.test.cjs`) plus updates to `tests/news-article-display.test.cjs` (8 new `rangeImpactTone` cases), `tests/news-empty-states.test.cjs` (the now-impossible "filtered to nothing" state removed), and `tests/news-fact-vs-ai-separation.test.cjs` (drawer AI-label scoping). 922 JS tests + 14 Python tests pass, typecheck clean, build clean.
- **Visually verified against Preview** (real Neon data, real analyzed articles: two neutral/low stories rendered amber, two positive/medium stories rendered green) and confirmed Overview/Forecast/Macro unaffected, both before and after the two CSS fixes above.

### Phase 5.2 — Progressive disclosure + "How this feed works" explainer (2026-08-26)

UI-only change (explicitly out of scope: pipeline, AI analysis, persistence, cron -- none touched).

- **Cards collapsed by default** -- `ArticleCard.tsx` now holds two independent `useState` toggles (`summaryOpen`, `analysisOpen`). The full factual-summary paragraph and full AI Range Analysis paragraph (plus its affected-drivers/time-horizon/confidence metadata) are no longer rendered unconditionally; each only mounts once its own toggle (`Show summary`/`Hide summary`, `Show Range analysis`/`Hide Range analysis`) is clicked. The always-visible collapsed state is: category badge, colored headline, publisher/date, the impact pill (or a muted "Analysis Pending"/"Analysis Unavailable" chip for unanalyzed/failed articles -- moved out from behind the analysis toggle so it's never hidden), and a short truncated preview of the excerpt (new `truncateText()` in `lib/news/article-display.ts`, word-boundary-aware, 130 chars -- not a second AI summary, just a client-side substring of the already-persisted excerpt).
- **The "Show Range analysis" button never renders for a pending or failed article** -- gated on `hasAnalysis = isAnalyzed && article.rangeImpact && article.impactStrength`, so there's nothing misleading to click. Failed analyses still show only the safe "Analysis Unavailable" chip, never provider error text (unchanged from Phase 4/5.1).
- **Headline tone rule (Phase 5.1's `rangeImpactTone`) is byte-for-byte unchanged.**
- **A second silent CSS-specificity bug found and fixed during this task's own visual QA**, same root cause as Phase 5.1's two: `.news-card-excerpt`/`.news-card-analysis` (single-class selectors) were being silently overridden to muted-gray by the pre-existing global `.panel p { color: var(--muted); }` rule, and the new toggle/info-trigger buttons would have lost their border/padding/background entirely to `.panel button { border:0; padding:0; ... }` had they not been written as compound selectors (`.news-card .news-card-toggle`, `.news-header .news-info-trigger`) from the start. Documented inline in `News.css` as a recurring pattern to watch for on any future `<button>`/`<p>` added inside a `.panel`-classed ancestor in this file.
- **Cards are more compact**: `.news-card` padding 16px→14px, internal gap 8px→6px, section `padding-top` 10px→8px. On the real deployed Preview, this took the initial viewport from showing roughly 1 card to showing all 5 currently-analyzed cards at once.
- **New `FeedInfoDisclosure.tsx`** -- a "How this feed works" disclosure button next to the Daily Energy Intelligence title, `aria-expanded`/`aria-controls`-wired (keyboard-operable, not hover-only), revealing a floating popover (`role="region"`, `aria-label`) with six short verified sections: Refresh, Sources, Selection, Colors, Sorting, History. Every line was checked against the actual implementation before writing it (see the file's own doc comment and "Verified feed rules" below) -- nothing in the copy is assumed.
- **Tests**: new `tests/news-progressive-disclosure.test.cjs` (18 tests: collapse-by-default, independent toggle state, no misleading button on unanalyzed/failed articles, ARIA wiring, info-panel accessibility, and several tests that cross-check the info copy's claims against the real source files it describes -- e.g. asserting the "Sources" copy excludes SEC EDGAR by reading `lib/news/sources/index.ts`'s own `SEC_USER_AGENT` gating, and the "Sorting"/"History" copy against `articles-repo.ts`'s actual SQL). 940 JS tests + 14 Python tests pass, typecheck clean, build clean.
- **Visually verified against Preview**: 5 collapsed cards fit in the initial viewport (vs. ~1 before), both toggles expand/collapse independently and correctly on the same card simultaneously, expanded text renders in full white (confirming the specificity fix), the info popover renders cleanly with accurate content, Overview/Forecast unaffected. Mobile viewport rendering could not be visually confirmed in this session (the browser-automation tool's resize did not affect the captured screenshot's actual viewport) -- the responsive CSS itself was reviewed by hand (existing `@media (max-width: 980px)` card-grid collapse is unchanged; new `@media (max-width: 620px)` rules only reposition/stack the info popover) but not visually spot-checked on a real narrow viewport this session.

**Verified feed rules** (source of truth for the "How this feed works" copy, re-verify here if the copy ever needs updating):
- Schedule: `vercel.json`'s only cron entry, `"15 11 * * *"` UTC, targets `/api/cron/news`.
- Sources actually active: `lib/news/sources/index.ts`'s `getDefaultSourceAdapters()` always registers EIA Today in Energy, Natural Gas Intelligence, and OilPrice.com; it also registers a SEC EDGAR 8-K adapter, but only `if (process.env.SEC_USER_AGENT)` -- confirmed via `vercel env ls` that this project has no `SEC_USER_AGENT` configured, so SEC EDGAR is not currently active and is not listed in the explainer.
- Selection: `lib/news/pipeline/runner.ts` (collect → normalize → dedupe → `scoreRelevance` → retained/rejected split) and `lib/news/pipeline/analyze.ts`'s `analyzeEligibleArticles` (only ever selects `processing_status = 'retained'` rows for AI).
- Sort order: `lib/news/persistence/articles-repo.ts`'s `queryArticles()` -- `ORDER BY published_at DESC NULLS LAST`.
- Retention/history: no `DELETE` statement exists anywhere in `lib/news/persistence/` -- articles are never removed. The News tab calls `GET /api/news?limit=100` (`lib/news/use-news-articles.ts`); the visible feed is capped by that fetch limit (and further narrowed client-side to `retained`/`analyzed`/`analysis_failed` rows only), not by a time window or a cleanup job.

## Status as of fix/q2-data-foundation (2026-08-12)

The sections below this one are a chronological session log and are **not** kept
up to date after they're written -- several of their "Known Risks" bullets are
now stale. Current accurate facts, superseding anything below that conflicts:

- **Test count**: 421/421 (`npm test`), not the 270/270 figure quoted in
  "Validation Results" below.
- **EPS coverage**: populated for **all 7 core peers** (`lib/dashboard/eps-quarterly.ts`,
  FactSet E&P model), not RRC-only as "Known Risks" below still claims. GPOR
  Q2 2026 alone is `#N/A` in the source and stays unavailable.
- **`netIncome` coverage**: populated for **all 7 peers** in
  `financials-quarterly.ts` (FactSet-sourced), not RRC-only as "Known Risks"
  below still claims.
- **Market Cap / P/E / EV-EBITDAX / FCF Yield at Q2 2026**: backfilled for all
  7 peers (`lib/dashboard/market-cap-quarterly.ts`, Nasdaq historical close x
  each company's own Q2 2026 10-Q diluted weighted-average shares, since
  Yahoo Finance/Macrotrends were not reachable this session). GPOR's P/E stays
  null at Q2 2026 specifically because FactSet's net income row is `#N/A` that
  quarter, unrelated to the market-cap gap.
- **Guidance source**: `components/dashboard/GuidancePanel.tsx` and
  `lib/dashboard/guidance.ts`/`chart-guidance.ts` read `data/management-guidance.json`
  (`meta.reportingCycle: "Q2 2026"`), not `data/guidance.json` as "Right-column
  widgets" below still claims -- that file has zero imports anywhere in the
  app and should be treated as orphaned/deprecated, not the live source.
- **Q2 2026 production/pricing/cost/wells detail**: `financials-quarterly.ts`'s
  `production`/`commodityMix`/`realizedPrices`/`costs`/`wells` fields are now
  populated for Q2 2026 for all 7 peers (source-tagged `"sec-direct"`), closing
  the gap that was silently pulling the Overview page's realized-gas-price
  ranking back to Q1 2026 via `latestComparableQuarter()`. `data/historical.json`
  has the same fields backfilled for reference.
- **Canonical consistency**: `tests/canonical-consistency.test.cjs` now
  directly compares `data/historical.json` against the live fixtures at the
  latest quarter (currently Q2 2026) in CI. It does **not** cover Q1 2024-Q1
  2026 -- an exploratory sweep found ~272 pre-existing mismatches between the
  two files across that older history, a separate reconciliation effort not
  attempted on this branch.

## Validation Results
- `npm test`: 270/270 pass, including 14 new tests in `tests/forecast-commodity-assumptions.test.cjs`, plus one test in `tests/forecast-oilpriceapi-fallback.test.cjs` narrowed (it previously blanket-checked for the word "oilpriceapi" anywhere in Forecast components; now that the UI legitimately displays the label "OilPriceAPI · Current Market", the check was scoped to actual import/env-var/upstream-call patterns instead — no provider logic changed)
- `npm run typecheck`: clean
- `npm run build`: succeeds; **no new API routes**

## Commodity Price Assumptions UI (Scenario Workbench) — Done
Made the commodity-market inputs already wired into Forecast (prior task) visible and auditable, directly in `RrcScenarioWorkbench`, between the existing "Production assumption" card and the "Run scenario" / "Compare maintenance vs growth" buttons. UI/transparency only — no formula, hierarchy, provider, or caching change.

- **New `CommodityPriceAssumptions` section** (`components/forecast/RrcScenarioWorkbench.tsx`), titled "Commodity price assumptions", showing Henry Hub and WTI side-by-side in the same responsive `repeat(auto-fit,minmax(220px,1fr))` grid already used elsewhere in this component (fits horizontally on desktop, stacks on mobile — no new layout primitive). Each card reuses the exact existing pill/border/border-radius/spacing styling from the Production assumption card's source badge.
- **Data source**: a new optional `commoditySources?: { wti, henryHub }` prop, populated by `ForecastWorkspacePanel.tsx` via `resolveCommoditySources(market.data)` — the function built (but left unused) in the prior OilPriceAPI-Forecast-wiring task, now finally wired to a display surface. Renders nothing when the prop is omitted, so the standalone `/forecast` route (`app/forecast/page.tsx`, still calls `<RrcScenarioWorkbench />` with no props) is byte-for-byte unaffected.
- **Model price vs. current market price**: the displayed value/source/classification is the exact `ResolvedCommodityPrice` the app already resolved for this run — i.e. genuinely "the value passed into the forecast engine," not a separate re-derived figure. Labels: `current_market` → "OilPriceAPI · Current Market", `official_delayed` → "EIA · Latest Official / Delayed" (never called real-time), `modeled` → "Management Sensitivity" (reusing the exact term already used throughout `rrc-complete.ts`/`rrc.ts`). Each card also states "Model input for this scenario run" so the connection to what's actually sent to `/api/rrc-scenarios` is explicit.
- **Modeled-fallback value intentionally shows "--"**: the engine's modeled defaults ($3.75 Henry Hub / $65 WTI) are defined only inside `rrc-complete.ts` and are never echoed back by `/api/rrc-scenarios`'s response; duplicating those constants into the UI layer would risk silent drift if the engine's default ever changes, so `resolveCommoditySources` deliberately leaves `value: null` (→ "--") for the modeled case, consistent with the "never fabricate" convention used everywhere else in this app, while still showing the correct "Management Sensitivity" classification.
- **`lib/forecast/live-market-prices.ts`**: `ResolvedCommodityPrice` gained `unit`, `change24hAmount`, `change24hPercent` (all optional/nullable, additive — no existing test broke). `unit`/24h-change are pulled from the raw `CurrentMarketCommodityQuote` (`data.currentMarket.wti/henryHub`) only when OilPriceAPI is the one that actually won for that commodity; an EIA or modeled result never carries a 24h change.
- **24h change**: rendered only when `change24hPercent` is non-null (`formatChange24h` returns `null`, never `0`, when absent); no recalculation, straight passthrough of the already-normalized field from the OilPriceAPI pipeline (2 tasks ago).
- **Price mode / Custom override**: inspected first, per task instructions — confirmed **no safe existing commodity-price override mechanism exists** (`currentMarketPrices` is entirely derived from the provider hierarchy in the parent; there's no user-input path for it, unlike production's `productionMode: "reported" | "override"`). Per instructions, none was invented. The section renders a `"Price mode: Current market (read-only)"` badge and a note that custom price entry requires a separate modeling change.

Files added: `tests/forecast-commodity-assumptions.test.cjs`.
Files modified: `components/forecast/RrcScenarioWorkbench.tsx`, `components/dashboard/ForecastWorkspacePanel.tsx`, `lib/forecast/live-market-prices.ts`, `tests/forecast-oilpriceapi-fallback.test.cjs` (1 assertion narrowed, see above).
Not touched: all forecast formula files, `app/api/rrc-scenarios/route.ts` (Bear/Base/Bull presets unchanged), `app/api/market/route.ts`, `lib/oilpriceapi/`, `lib/finnhub/`, `lib/fmp/`, `MarketRibbon.tsx`, SEC ingestion.

## Forecast Now Consumes OilPriceAPI Current-Market Prices (source-selection only) — Done
Extended the existing `/api/market`-based commodity-price plumbing so the Forecast workspace (both the Overview chart's Revenue/EBITDAX/FCF modeled-forecast segment and the Forecast tab's `RrcScenarioWorkbench`) prefers OilPriceAPI's current-market WTI/Henry Hub over EIA's latest-official/delayed reading, with EIA and the engine's existing modeled management-sensitivity default preserved as fallback tiers. **No new upstream OilPriceAPI request path, no forecast formula changes** — this reuses the single existing `/api/market` response (`useMarketData()`), which already carries both `.metrics` (EIA) and `.currentMarket` (OilPriceAPI, added in the prior task).

- **New hierarchy**: OilPriceAPI current WTI/Henry Hub → EIA latest-official/delayed → existing modeled fallback (was: EIA → modeled fallback). Resolved independently per commodity (WTI and Henry Hub never share a fallback decision).
- **`lib/forecast/live-market-prices.ts`** gained `extractLiveMarketMetricsFromMarketResponse(data: MarketApiResponse)` and `buildCurrentMarketPricesFromMarketResponse(data)` — mirrors the existing (now-dead, preserved) FMP-priority pattern but takes the single `MarketApiResponse` object directly (no second response type needed, since OilPriceAPI and EIA already arrive together in one `/api/market` payload). A commodity is omitted (`undefined`) only when **both** OilPriceAPI and EIA are unavailable, so the existing `?? modeled default` in `rrc-complete.ts` still applies — untouched.
- **Display/testing-only classification summary**: new `resolveCommoditySources(data)` returns `{ wti, henryHub }`, each `{ commodity, value, source, classification: "current_market" | "official_delayed" | "modeled", asOf }`. This is a separate, additive helper — it does **not** feed the forecast engine, which still receives the existing `SourcedValue` shape with `classification: "live"` (the engine's `AssumptionClassification` enum was not touched, since that's below the source-selection layer this task was scoped to).
- **`toLiveSourcedValue`'s notes text**: unchanged sentence structure (still starts with "Latest official/delayed" or "Current-market", still contains "flat"/"not a futures or forward curve"/EIA's "not a real-time quote" — all pre-existing regexes still pass), with a parenthetical source tag added: `(EIA · Latest Official / Delayed)` or `(OilPriceAPI · Current Market)`.
- **Wired into**: `components/HomeDashboard.tsx`'s `currentMarketPrices` (main chart) and `components/dashboard/ForecastWorkspacePanel.tsx`'s `RrcScenarioWorkbench` prop — both now call the new `...FromMarketResponse` functions instead of the EIA-only ones, passing `market.data` (the full `MarketApiResponse` already fetched by the existing `useMarketData()` hook) directly instead of `market.data?.metrics`. No new hook, no new polling, no new caching — the OilPriceAPI 60-minute Data Cache and EIA's existing caching are both untouched.
- **No Forecast UI card added**: as established in the original FMP task, no commodity-price display card currently exists in the Forecast tab (it was dropped in an earlier consolidation when `ForecastPanel.tsx` was deleted) — adding one would violate "do not redesign Forecast cards/layout," so this task is data-layer plumbing only, verified via `resolveCommoditySources`'s classification output rather than a new visual element.
- **Brent**: untouched — the new functions only ever read `currentMarket.wti`/`currentMarket.henryHub`, never `currentMarket.brent` (which doesn't exist; Brent stays EIA-`metrics`-only).
- **Formulas verified identical**: a dedicated test runs `runRrcValuedScenario` twice with the same numeric commodity inputs — once built the old EIA-only way, once via the new OilPriceAPI-sourced path — and asserts byte-identical `revenue`/`ebitdax` output across all periods, proving this is source-selection only.

Files added: `tests/forecast-oilpriceapi-fallback.test.cjs`.
Files modified: `lib/forecast/live-market-prices.ts`, `components/HomeDashboard.tsx`, `components/dashboard/ForecastWorkspacePanel.tsx`, `tests/finnhub-migration.test.cjs` (2 assertions re-pointed at the new function names).
Not touched: `lib/oilpriceapi/`, `lib/finnhub/`, `lib/fmp/`, `app/api/market/route.ts`, `app/api/rrc-scenarios/route.ts`, `app/api/share-prices/route.ts`, `MarketRibbon.tsx`, all forecast formula files (`rrc-complete.ts`, `rrc.ts`, `rrc-hedged.ts`, `rrc-valued.ts`, `calculations.ts`, `engine.ts`), Bear/Base/Bull presets, SEC ingestion.

## OilPriceAPI Current-Market Commodity Source — Done
Added OilPriceAPI as the **current-market** source for WTI and Henry Hub, extending the existing `/api/market` route (not a parallel route) alongside EIA, which keeps sole ownership of Brent/storage/LNG/macro and remains the **latest-official/delayed** fallback for Henry Hub and WTI. Finnhub (share prices) and the FMP deactivation from the prior task are both untouched.

- **Env var**: `OIL_PRICE_API` (as specified, not renamed).
- **Codes** (manually validated against the real account, per the task): **WTI → `WTI_USD`**, **Henry Hub/natural gas → `NATURAL_GAS_USD`**. Recorded centrally in `lib/oilpriceapi/codes.ts`.
- **Endpoint/batching**: one request per `/api/market` invocation — `GET https://api.oilpriceapi.com/v1/prices/latest?by_code=WTI_USD,NATURAL_GAS_USD` (confirmed via OilPriceAPI's own docs: `by_code` accepts a comma-separated list; batching was chosen over per-commodity requests, satisfying the free-tier ~200 req/month budget). Auth: `Authorization: Token <key>` header (confirmed via docs — explicitly not `Bearer`).
- **Client** — `lib/oilpriceapi/client.ts` (server-only): `fetchOilPriceApiQuotes(codes)` parses `data.prices` (an array; multi-code responses are **matched by each row's `code` field, never by array position** — confirmed both via the docs and the user's own account testing) into a `Map<code, quote>`. A requested code absent from `data.prices` is reported missing by cross-checking against the map directly (not by trusting `payload.data.missing` alone — an early version of this had a bug where a code missing from `data.prices` but *not* listed in `data.missing` was silently dropped; fixed and covered by a dedicated test). Non-finite prices normalize to `price: null`, never `0`. The 24h-change field name isn't nailed down in OilPriceAPI's public docs, so both a nested `change_24h: {amount, percent}` shape and a flat `change_24h_amount`/`change_24h_percent` shape are checked defensively; neither matching still yields `null`, never a guess.
- **Caching (60 min, free-tier protection)**: the upstream `fetch()` call uses `next: { revalidate: 3600 }` — the same Data Cache primitive `lib/eia/client.ts` already uses (`revalidate: 900`), reused rather than inventing a new caching mechanism. This Next.js Data Cache persists across route-handler invocations independent of the route's own `force-dynamic` setting, so even though `/api/market`'s handler body re-executes on every CDN cache miss (900s), the actual OilPriceAPI network call only happens once per 60 minutes. No Redis/DB/cron added.
- **Stale/synthetic rejection**: enforced at the route layer (`app/api/market/route.ts`'s `currentMarketQuoteFor`), not the client — the client honestly reports whatever OilPriceAPI returns (including `stale`/`synthetic` flags as-is); the route is what decides a `stale: true` or `synthetic: true` quote must not be classified `current-market`, downgrading it to `status: "unavailable"` with an explanatory `error` while still surfacing whatever freshness metadata OilPriceAPI did return (`dataStatus`, `asOf`, `stale`, `synthetic`) for transparency.
- **Response shape** — `lib/market/types.ts`: `MarketApiResponse` gained a new `currentMarket: { wti, henryHub }` field (each a `CurrentMarketCommodityQuote`: `price`, `unit`, `currency`, `source: "OilPriceAPI"`, `classification: "current-market"`, `asOf`, `dataStatus`, `stale`, `synthetic`, `change24hAmount`, `change24hPercent`, `status`, optional `error`). The existing `metrics: NormalizedMarketMetric[]` array (EIA, all 5 entries) is **completely unchanged in shape and content** — kept as a deliberately separate field so an OilPriceAPI current-market reading and an EIA latest-official reading are never collapsed into one ambiguous value.
- **Fault isolation**: `fetchCurrentMarketCommodities()` never throws — a total OilPriceAPI failure (network error, non-200, malformed JSON, non-`"success"` status) still returns a valid `currentMarket` object with both commodities `unavailable` and an `error` message, and runs via `Promise.all` alongside (not blocking) the existing EIA `Promise.allSettled` fetch, so EIA metrics resolve exactly as before regardless of OilPriceAPI's outcome. Within OilPriceAPI's own response, WTI and Henry Hub are resolved independently — one missing/stale/synthetic never affects the other.
- **MarketRibbon** (`components/dashboard/MarketRibbon.tsx`): WTI and Henry Hub now prioritize `data.currentMarket.{wti,henryHub}` when `status === "ok"` (showing the OilPriceAPI price, its unit, a "OilPriceAPI · Current Market" source line in the detail drawer, and — additively, via one new `<small>` element that fits the ribbon's existing flex-row button layout without restructuring it — the 24h % change when available); falling back to the existing EIA metric (unchanged rendering) when OilPriceAPI is unavailable for that commodity, with the EIA reading still mentioned in the detail-drawer text either way so it's never fully hidden. **Brent is completely untouched** — no OilPriceAPI branch exists for it at all, still EIA-only. The ribbon's `aria-label` was updated from "Delayed energy market data" to reflect the new mixed reality (current-market where available, else latest-official/delayed); a stale test assertion from the prior Finnhub task that checked the old label text was updated to match (no Finnhub logic changed).
- **Not touched**: `lib/finnhub/`, `app/api/share-prices/route.ts`, `lib/fmp/`, `app/api/quotes/route.ts`, `MacroPanel.tsx` (reads only `.metrics`, unaffected by the additive `currentMarket` field), forecast formulas/production/hedge/Bear-Base-Bull, and the RRC forecast's `currentMarketPrices` wiring (still EIA-only from the prior task — this task's scope was `/api/market` + `MarketRibbon` display only, not forecast wiring).

Files added: `lib/oilpriceapi/client.ts`, `lib/oilpriceapi/codes.ts`, `tests/oilpriceapi-client.test.cjs`, `tests/market-route-oilpriceapi.test.cjs`, `tests/market-ribbon-oilpriceapi.test.cjs`.
Files modified: `app/api/market/route.ts`, `lib/market/types.ts`, `components/dashboard/MarketRibbon.tsx`, `app/globals.css` (one additive `.market-ribbon small` rule), `tests/finnhub-migration.test.cjs` (one assertion re-pointed at the ribbon's new label).

## Finnhub Provider Switch (equities) — Done
Live-tested the existing Finnhub account before writing any code (per task constraint): `/quote?symbol=` confirmed working for RRC/AR/EQT (real `c`/`t` fields returned). Commodity coverage was checked via Finnhub's own `/search` endpoint (not guessed) for "WTI", "crude oil", "natural gas", "Henry Hub" — every result was an unrelated equity or ETP (e.g. W&T Offshore's ticker literally is `WTI`), zero legitimate futures/benchmark instruments; a `/futures/exchange` probe 404'd, consistent with Finnhub's own docs, which advertise only stock/forex/crypto/fundamentals/economic/alternative data — no commodities category. **Conclusion: Finnhub is equities-only for this account; EIA keeps sole ownership of all commodity data (Henry Hub/WTI/Brent/storage/LNG).**

- **Env var**: `FINNHUB_API_KEY` (confirmed via `vercel env ls production`).
- **Client** — `lib/finnhub/client.ts` (server-only) + `lib/finnhub/symbols.ts` (`FINNHUB_EQUITY_TICKERS`, same 7 peers). Finnhub's `/quote` has no batch param (unlike FMP), so `fetchFinnhubQuotes()` issues one request per ticker via `Promise.allSettled`, fault-isolated per symbol. Normalizes `c` (current price) → `price`; per this task's explicit rule (confirmed against the real account's behavior for an unknown symbol: `c: 0` with every other field also `0`), a non-finite **or non-positive** price normalizes to `price: null`, never a literal `$0`. `t` (quote timestamp) is preserved when positive, else `null`.
- **Route** — `app/api/share-prices/route.ts`: `force-dynamic`, `Cache-Control: s-maxage=60, stale-while-revalidate=120`. One ticker failing (network error, or Finnhub's own `c: 0` no-data response) marks only that ticker `status: "unavailable"` / `price: null` — the other 6 are unaffected. Response: `{ generatedAt, equities: { RRC, AR, CNX, CRK, EQT, EXE, GPOR } }`, each leaf `source: "Finnhub"`, `classification: "current-market"`, `timestamp`, `status`, optional `error`.
- **Client hook** — `lib/market/use-finnhub-quotes.ts`: same ~60s poll-and-keep-last-good pattern as the (now unused) FMP hook. No WebSockets.
- **Wired into**:
  - `components/HomeDashboard.tsx` — Overview's Share Price card now resolves `finnhubQuotes.data?.equities[ticker]` into `{ value, note: "Finnhub · current market (SYMBOL)" }` (was FMP); still recomputed via `useMemo` keyed on `[finnhubQuotes.data, ticker]`. The main chart's `currentMarketPrices` prop **reverted to EIA-only** — `buildCurrentMarketPricesFromMetrics(market.data?.metrics)` — since neither Finnhub nor FMP can legitimately supply commodities now.
  - `components/dashboard/ForecastWorkspacePanel.tsx` — `RrcScenarioWorkbench currentMarketPrices` prop **reverted to EIA-only** — `extractLiveMarketMetrics(market.data?.metrics)` (was the FMP-first fallback function).
  - `lib/dashboard/overview-metrics.ts` — default/fallback share-price note text changed from `"FMP · current market"` to `"Finnhub · current market"`. Function signature (`getOverviewSummaryCards(ticker, liveSharePrice?)`) unchanged.
  - `lib/forecast/live-market-prices.ts` — `toLiveSourcedValue`'s `source.notes` text is now source-aware: when the source string contains "EIA" it says **"Latest official/delayed \<label\> price..."** and appends *"This is EIA's latest official observation, not a real-time quote."*; for any other source it still says "Current-market". Since EIA is now the only commodity source actually wired into the live UI, every real commodity `SourcedValue` the forecast engine receives will carry the corrected "latest official/delayed" wording, not "current-market" — fixing the mislabeling this task flagged. `classification: "live"` (the `AssumptionClassification` enum value) was **not** changed — only the human-readable text — so no forecast type/formula was touched.
- **FMP — deactivated, not deleted**: `lib/fmp/`, `app/api/quotes/route.ts`, `lib/market/fmp-types.ts`, `lib/market/use-fmp-quotes.ts`, and the `extractLiveMarketMetricsWithFallback`/`buildCurrentMarketPricesFromFmpAndEia` functions in `live-market-prices.ts` all still exist on disk, still pass their original tests, and are preserved for a future re-entitlement — but nothing in the live UI imports `useFmpQuotes` or the FMP-fallback functions anymore (enforced by a test that scans every component). No production requests to FMP occur through normal app usage; `/api/quotes` would still work if hit directly by URL, but that's inert unless someone does so.
- **MarketRibbon / MacroPanel**: unchanged — already EIA-only (`aria-label="Delayed energy market data"`), confirmed still true by test.

Files added: `lib/finnhub/client.ts`, `lib/finnhub/symbols.ts`, `lib/market/finnhub-types.ts`, `lib/market/use-finnhub-quotes.ts`, `app/api/share-prices/route.ts`, `tests/finnhub-client.test.cjs`, `tests/finnhub-symbols.test.cjs`, `tests/share-prices-route.test.cjs`, `tests/finnhub-migration.test.cjs`.
Files modified: `components/HomeDashboard.tsx`, `components/dashboard/ForecastWorkspacePanel.tsx`, `lib/dashboard/overview-metrics.ts`, `lib/forecast/live-market-prices.ts`, `tests/overview-share-price.test.cjs` (re-pointed at Finnhub).

## FMP Current-Market Adapter — Superseded for commodities/equities (see above); code preserved
Added FMP as the **current-market** quote source (WTI, Henry Hub/natural gas, and all 7 peers' share prices), alongside — not replacing — the existing EIA delayed/official feed.

- **Env var**: `FMP_KEY` (confirmed via `vercel env ls production` against the real Vercel project — not guessed, not `FMP_API_KEY`). Server-only; read in `lib/fmp/client.ts` via `process.env.FMP_KEY`, never referenced in a `"use client"` file (enforced by a test that scans every component for that combination).
- **Symbols**: resolved from FMP's authenticated `/stable/commodities-list` response (the user ran this against the real production key, since this sandbox redacts secret env values before any agent-run command can use them — verified via a SHA-256 comparison showing the pulled `.env.local` FMP_KEY was literally the string `[SENSITIVE]`, not a real key). Confirmed: **WTI → `CLUSD`**, **Henry Hub/natural gas → `NGUSD`**. Recorded centrally in `lib/fmp/symbols.ts` (`FMP_COMMODITY_SYMBOLS`, `FMP_EQUITY_TICKERS`).
- **Client** — `lib/fmp/client.ts`: `getFmpApiKey()` + one batched `fetchFmpQuotes()` against FMP's stable `/quote?symbol=A,B,C` endpoint (one HTTP call per batch, not one per symbol), used by both `fetchFmpCommodityQuotes()` and `fetchFmpStockQuotes()`. Normalizes: non-finite/missing price → `price: null` (never `0`); non-array/error-shaped payloads throw with FMP's own error message; non-OK responses throw with status + body.
- **Route** — `app/api/quotes/route.ts`: `force-dynamic` (same reasoning as the existing `/api/market` fix — re-reads `FMP_KEY` and calls FMP fresh every invocation rather than risking a build-time-baked failure), `Cache-Control: s-maxage=60, stale-while-revalidate=120`. Makes 2 independent provider calls via `Promise.allSettled` (commodities batch, equities batch) so one leg failing never zeros out the other; within a batch, a single missing/invalid symbol only marks that one field `status: "unavailable"` / `value|price: null`, never fabricating a `0` and never affecting sibling tickers. Response shape matches the task spec: `{ generatedAt, commodities: { henryHub, wti }, equities: { RRC, AR, CNX, CRK, EQT, EXE, GPOR } }`, each leaf carrying `source: "FMP"`, `classification: "current-market"`, `status`, `fetchedAt`, optional `error`.
- **Client hook** — `lib/market/use-fmp-quotes.ts`: fetches `/api/quotes` on mount + polls every 60s (`setInterval`, cleaned up on unmount); on a transient poll failure keeps the last known-good data (each quote still carries its own real `fetchedAt`, so nothing is mislabeled as fresher than it is) rather than blanking the UI to `--`. No WebSockets, per task scope.
- **Fallback priority (commodities only)** — `lib/forecast/live-market-prices.ts` gained `extractLiveMarketMetricsWithFallback(fmp, eiaMetrics)` and `buildCurrentMarketPricesFromFmpAndEia(fmp, eiaMetrics)`: FMP's current-market quote wins when valid; EIA's latest-official/delayed observation is used only when FMP is unavailable for that specific commodity (Henry Hub and WTI resolved independently, never blended); if both are unavailable, the field is omitted so the pre-existing `?? modeled management-sensitivity default` in `rrc-complete.ts` still applies — **no forecast formula changed**. The existing `buildCurrentMarketPrices`/`extractLiveMarketMetrics`/`buildCurrentMarketPricesFromMetrics` (EIA-only) functions are untouched and still covered by their original tests; the new functions are additive. `toLiveSourcedValue`'s `source.notes` text was generalized from a hardcoded "the EIA feed" to `${metric.source}` so it correctly attributes FMP or EIA per value.
- **Wired into**:
  - `components/HomeDashboard.tsx` — main chart's `currentMarketPrices` prop now calls `buildCurrentMarketPricesFromFmpAndEia(fmpQuotes.data, market.data?.metrics)` instead of the EIA-only helper. Overview's Share Price card now resolves `fmpQuotes.data?.equities[ticker]` into `{ value, note: "FMP · current market (SYMBOL)" }`, recomputed via `useMemo` keyed on `[fmpQuotes.data, ticker]` so switching companies updates the price; falls back to `"--"` / `"FMP · current market"` when unavailable.
  - `components/dashboard/ForecastWorkspacePanel.tsx` — the Forecast tab's `RrcScenarioWorkbench currentMarketPrices` prop now uses `extractLiveMarketMetricsWithFallback(fmpQuotes.data, market.data?.metrics)` (FMP-first) instead of the EIA-only `extractLiveMarketMetrics`.
  - `lib/dashboard/overview-metrics.ts` — `getOverviewSummaryCards(ticker, liveSharePrice?)` gained an optional second param (backward-compatible; omitting it behaves exactly as before). New `formatSharePrice`/`LiveSharePrice` export.
- **Not wired in (per task scope)**: the `MarketRibbon` (top-of-page, explicitly `aria-label="Delayed energy market data"`) stays EIA-only — its stated purpose is delayed/official, not current-market, so it wasn't repurposed; no new commodity-price display card was added to the Forecast tab (none currently exists there — that card was dropped in an earlier session when `ForecastPanel.tsx` was consolidated away — adding one would violate "do not add random new panels," so the FMP-first values flow only into the actual forecast computation, not a dedicated UI card); **Valuations' Market Cap is untouched** — there is no existing current-share-count field with clear semantics to combine with a live price (the only `dilutedSharesMillion` field found is internal to RRC's own DCF valuation math in `lib/forecast/valuation.ts`, not a generic per-peer share-count register), so Market Cap keeps its existing historical `market-cap-quarterly.ts` source per the task's explicit fallback instruction; **Finnhub was not integrated** (explicitly out of scope).
- **EIA fundamentals**: completely untouched — `lib/eia/client.ts`, `app/api/market/route.ts`, `MarketRibbon.tsx`, `MacroPanel.tsx` all unchanged; Henry Hub/WTI/Brent/storage/LNG exports still resolve from EIA exactly as before.

Files added: `lib/fmp/client.ts`, `lib/fmp/symbols.ts`, `lib/market/fmp-types.ts`, `lib/market/use-fmp-quotes.ts`, `app/api/quotes/route.ts`, `tests/fmp-client.test.cjs`, `tests/fmp-symbols.test.cjs`, `tests/quotes-route.test.cjs`, `tests/live-market-prices-fmp-fallback.test.cjs`, `tests/overview-share-price.test.cjs`.
Files modified: `components/HomeDashboard.tsx`, `components/dashboard/ForecastWorkspacePanel.tsx`, `lib/dashboard/overview-metrics.ts`, `lib/forecast/live-market-prices.ts`, `.gitignore` (added `.vercel` + `.env*`, needed once this worktree was linked to the real Vercel project to read env var names for this task).

## Chart Colors, FCF Chart, EIA Live-Data Fix (3 changes) — Done
1. **Stable per-company chart colors** — New `lib/dashboard/company-colors.ts` exports `getCompanyColor(ticker)`, a small centralized `Ticker → hex` map (RRC blue `#0081c6`, AR green `#74c7a2`, EQT pink `#e98ca8`, CNX violet `#9b8cff`, CRK amber `#e0b56f`, EXE olive `#c2cf72`, GPOR teal `#4fd1c5`). `components/dashboard/ChartWorkspace.tsx` no longer colors lines/points by `seriesIndex` (the old `peer-${Math.min(seriesIndex,6)}` classes and their `.peer-1`…`.peer-6` CSS rules are removed from `app/globals.css`); every actual line, dashed modeled line, data-point `<circle>`, and legend `<span>` now reads `getCompanyColor(ticker)` via inline `style`, so a company keeps its color regardless of whether it's primary or a comparison, and regardless of selection order.
2. **FCF chart wired to existing data** — `ChartWorkspace.tsx`'s `fcf` metric config now reads `getQuarterlyFreeCashFlow(row.ticker, row.quarter).value` from the already-normalized `lib/dashboard/free-cash-flow-quarterly.ts` (Q1 2024–Q1 2026, all 7 tickers) instead of the old hardcoded `() => null` / `comparable: false` stub. Negative quarters (e.g., CRK, several EQT/AR/EXE quarters) render correctly since the axis/scale logic already handled negative values generically. No new historical FCF calculation; the underlying dataset is untouched.
3. **Modeled quarterly FCF (RRC only)** — The deterministic forecast engine already computes `freeCashFlowMillion` per quarter (`lib/forecast/engine.ts`), the same field `rrc-complete.ts`/`rrc-hedged.ts` thread through to `runRrcValuedScenario`'s `complete.forecast.periods`. `lib/dashboard/chart-forecast.ts`'s `ForecastChartMetric` gained `"fcf"`, resolving to `row.freeCashFlowMillion` — no annual-to-quarterly allocation, no new formula, same engine call already used for revenue/EBITDAX. `fcf` was added to `ChartWorkspace.tsx`'s `FORECAST_METRICS` set, so RRC's FCF tab now shows solid historical actuals + dashed modeled 2026Q2–2028Q4; every other ticker's modeled segment stays blank (`isForecastChartSupported` is still RRC-only).
4. **EIA live-data path diagnosed** — `lib/eia/client.ts`'s route/series were verified correct by calling the real EIA v2 API directly: `natural-gas/pri/fut/data` + series `RNGWHHD` (Henry Hub) and `seriesid/PET.RWTC.D` (WTI) both returned valid rows with a `DEMO_KEY`. The env var name (`EIA_API_KEY`), request construction, response parsing, and error propagation in `app/api/market/route.ts` / `lib/market/use-market-data.ts` / `lib/forecast/live-market-prices.ts` are all correct — no fabricated values, independent Henry Hub/WTI fallback preserved, errors surfaced via each metric's `.error` field (visible in `MarketRibbon`'s aria-label). The one defect found: `app/api/market/route.ts` had no `export const dynamic`, unlike `app/api/forecast/route.ts` and `app/api/rrc-scenarios/route.ts`. A GET Route Handler with no dynamic functions and only `fetch(..., { next: { revalidate } })` is eligible for Next.js's default build-time-cached-then-ISR-revalidated behavior — if `EIA_API_KEY` wasn't present in the Vercel build environment at the time of the last `next build` (e.g., added to the Vercel dashboard after that deploy, which requires a redeploy to take effect for build-time-generated routes), the route would keep serving a baked-in "unavailable" response. Added `export const dynamic = "force-dynamic";` so the route re-executes (and re-reads `process.env.EIA_API_KEY`) on every request; the existing `Cache-Control: s-maxage=900` header still gives the same CDN-level caching. **If `EIA_API_KEY` is not present at all, or is scoped only to Preview/Development (not Production) in the Vercel dashboard, that is a Vercel configuration gap this fix cannot resolve — it must be added/rescoped there and the app redeployed.**

Files added: `lib/dashboard/company-colors.ts`, `tests/company-colors.test.cjs`, `tests/fcf-chart.test.cjs`, `tests/market-route-dynamic.test.cjs`.
Files modified: `components/dashboard/ChartWorkspace.tsx`, `app/globals.css`, `lib/dashboard/chart-forecast.ts`, `app/api/market/route.ts`.
Not touched (per task constraints): `scripts/sec/`, guidance data, forecast/valuation formulas, production assumptions, Bear/Base/Bull preset values, map/geography, Finnhub/FMP (still not wired in — credentials are configured in Vercel but no adapter code exists yet; explicitly out of scope this task).

## UI Polish (3 changes) — Done
1. **Full Guidance drawer redesign** — `lib/dashboard/guidance.ts` gained `getCompanyGuidanceSections()`, which reuses the existing header-line/value-line pairing heuristic (previously only applied to the capped compact-widget highlights) across *every* item in *every* section, with no cap, so nothing is dropped — items that don't pair cleanly become standalone "note" rows instead of being silently lost. `components/dashboard/DetailDrawer.tsx` now renders a `GuidanceDrawerContent` union member (grouped `<section>` per guidance section, compact label/value rows, secondary source line) instead of one long `" · "`-joined string; the plain-string `content` path (used by `MarketRibbon` and `MapWorkspace`, unrelated to guidance) is untouched via a `DrawerContent = string | GuidanceDrawerContent` union and an `isGuidanceDrawerContent` type guard. `getCompanyGuidanceFullText` (the old flat-string function) is left in place — still covered by its existing test — since nothing else needed it removed. No new guidance page, no AlphaSense reparsing, no calculation changes; `data/guidance.json` is untouched.
2. **Chart point hover tooltips** — `components/dashboard/ChartWorkspace.tsx` adds one reusable `ChartPointTooltip` SVG component driven by a single `hover` state (`onMouseEnter`/`onFocus` to set, `onMouseLeave`/`onBlur` to clear), rendered once as the last child of the `<svg>` so it layers above every series. Every existing data-point `<circle>` (primary + comparison tickers, actual + modeled, across all six metric tabs — Production/Revenue/FCF/CapEx/Net debt/EBITDAX are all driven by the same `metricConfig`-based render loop, so this is not duplicated per metric) got the hover/focus wiring; the previous native SVG `<title>` was replaced by this richer custom tooltip plus an `aria-label` for accessibility parity. Tooltip shows ticker, period, exact displayed value, and unit, with a "Modeled" line only on forecast-segment points (`index >= splitIndex`); historical actuals never get that label. Points for `null` values still render nothing (`if (value === null) return null`), so unsupported data never produces a fake tooltip. No charting library added; dashed `.forecast-line` styling untouched.
3. **Bear/Base/Bull preset explainer** — `components/forecast/RrcScenarioWorkbench.tsx` adds a small `(i)` info control (`PresetInfoTooltip`, hover or click to open) next to the "Scenario preset" label. Its copy is generated from the existing `presetDefaults` object via `formatPresetAssumptions` (not hardcoded numbers), so it can't drift from the real Bear (4.5x / 12% / -1%), Base (5.5x / 10% / 0%), and Bull (6.5x / 9% / +1%) values, and states plainly that these are valuation-only presets, not commodity/operating scenarios. `presetDefaults`, the preset→assumption `useEffect`, and every forecast/valuation formula are unchanged.

Files added: `tests/chart-tooltip.test.cjs`, `tests/rrc-scenario-preset-tooltip.test.cjs`.
Files modified: `lib/dashboard/guidance.ts`, `components/dashboard/DetailDrawer.tsx`, `components/dashboard/GuidancePanel.tsx`, `components/HomeDashboard.tsx` (widened the `drawer` state/`openDrawer` param type only), `components/dashboard/ChartWorkspace.tsx`, `components/forecast/RrcScenarioWorkbench.tsx`, `app/globals.css` (guidance-drawer + chart-tooltip styles, `.drawer` gained `overflow-y: auto`), `tests/guidance-panel.test.cjs` (added 3 tests for the new structured getter).

## Current Dashboard Navigation
`components/HomeDashboard.tsx` renders tabs: **Overview**, **Forecast**, **Map**, **Macro**. Sources and the old **Companies** (peer-ranking) tab are no longer in the nav. `lib/dashboard/types.ts`'s `View` union is now `"dashboard" | "macro" | "forecast"` (`"peers"` removed). `components/dashboard/PeersPanel.tsx` and its data are preserved on disk, unrouted, per the "don't delete underlying peer data" constraint — nothing else imports it. The **Forecast** tab now renders `components/dashboard/ForecastWorkspacePanel.tsx` (see "Forecast Workspace" below) instead of the old compact `ForecastPanel.tsx` (deleted, consolidated away).

## Right-column widgets: Guidance + Valuations
Overview's right column is now **Guidance** then **Valuations** (previously "Market & Macro" + Financials).

- **Guidance** — `components/dashboard/GuidancePanel.tsx` + `lib/dashboard/guidance.ts`, reading the existing normalized `data/guidance.json` (already generated from `Peer_Comp_Site_Data/Alphasense/Peer Comp Site 1Q26 Guidance.docx`; no reparsing). Shows up to 6 highlights per company from the Production / Capital Expenditures / Operating Costs sections (the three sections common to all 7 core peers), updates when the primary company changes, and "View full guidance →" opens the existing `DetailDrawer` with the full normalized text (no new guidance page built). `getCompanyGuidanceHighlights` handles two source-document shapes: inline `{label, value}` items, and the "header line, then value line" pattern (e.g. CNX's "2026 Total Capital Budget" / "$556–$586MM") via a `looksLikeValueLine` heuristic — this is a display grouping of already-extracted text, not new data.
- **Valuations** — `components/dashboard/ValuationsPanel.tsx` + `lib/dashboard/valuations.ts`. Current (latest reported quarter) vs. previous (same quarter prior year) for **EPS, EBITDAX, Market Cap, P/E**:
  - EPS: new `lib/dashboard/eps-quarterly.ts`, RRC only, from `Peer_Comp_Site_Data/Facset/E&P_Facset_Company_Model.xlsx`, RRC sheet, "EPS ($/share)" row (same file/columns already used for RRC `netIncome` in `financials-quarterly.ts`). Other peers render `--`.
  - EBITDAX: existing `financials-quarterly.ts` `adjustedEbitdax`, all 7 tickers.
  - Market Cap: new `lib/dashboard/market-cap-quarterly.ts`, all 7 tickers, values transcribed from the already-normalized `data/historical.json` `normalization_inputs["Equity Market Capitalization"]` (Macrotrends/Yahoo Finance, already vetted) as a small standalone module rather than importing the full ~1.1MB `historical.json` into the client bundle.
  - P/E: derived, `marketCap / LTM net income`, via a new `getLtmNetIncome` in `lib/dashboard/calculated-quarterly.ts` (mirrors the existing `getLtmAdjustedEbitdax` pattern). RRC-only (net income is RRC-only); other peers render `--`, never a fabricated multiple.
  - `if (value === null) render "--"` throughout; no consensus/actual mixing.

## Main Chart: Revenue + EBITDAX tabs, actual vs. modeled
Chart metric tabs are now **Production | Revenue | FCF | CapEx | Net debt | EBITDAX** (`lib/dashboard/types.ts` `Metric` union; `valuation` removed, `revenue`/`ebitdax` added).

`components/dashboard/ChartWorkspace.tsx` (now `"use client"`, uses `useMemo`) and new `lib/dashboard/chart-forecast.ts`:
- Historical actual quarters (Q1 2024–Q1 2026, all 7 tickers) come from `financials-quarterly.ts` `revenue`/`adjustedEbitdax` exactly as before, unchanged.
- For Revenue/EBITDAX only, the chart appends 11 forecast quarters (2026Q2–2028Q4, deliberately excluding 2026Q1 so the modeled series can never overwrite the reported actual) by calling `runRrcValuedScenario` **directly** (same deterministic engine used by `/api/rrc-scenarios`, no second formula, no new engine) — pure client-side call since the scenario functions are plain TS with no server-only dependencies.
- Forecast periods are **RRC-only** (`isForecastChartSupported`) — every other ticker's modeled segment is `null`/blank, never fabricated.
- The optional live-commodity-price override threads through: `HomeDashboard.tsx` calls `buildCurrentMarketPricesFromMetrics(market.data?.metrics)` (new helper in `lib/forecast/live-market-prices.ts`) and passes it to `ChartWorkspace` as `currentMarketPrices`.
- Actual vs. modeled is preserved in the data layer (points carry their source quarter) and in the UI: the modeled segment renders with the pre-existing (previously unused) `.forecast-line` dashed CSS class, and point tooltips are suffixed `(modeled)`.

## Forecast Workspace (replaces the old Companies/Peers nav destination)
`components/dashboard/ForecastWorkspacePanel.tsx` is the new single-company forecasting workbench opened from the top-nav **Forecast** tab:
- A `CompanySelector` (all 7 core tickers) picks one company at a time.
- **RRC**: renders the existing `components/forecast/RrcScenarioWorkbench.tsx` unchanged in substance (preset/strategy controls, editable target EV/EBITDAX, discount rate, terminal growth, production-override table, quarterly production+revenue table, maintenance-vs-growth bridge — all pre-existing). Two additive changes only: (1) it now accepts an optional `currentMarketPrices` prop and forwards it into the `/api/rrc-scenarios` POST body (via `extractLiveMarketMetrics(market.data?.metrics)` from the new workspace panel), preserving the dashboard's live-EIA-pricing feature that the old compact `ForecastPanel.tsx` had; when the prop is omitted (the standalone `/forecast` route, `app/forecast/page.tsx`, still calls `<RrcScenarioWorkbench />` with no props), behavior is byte-for-byte the same as before. (2) two inline badge colors that were hardcoded for light mode were changed to theme-neutral `rgba(...)` values — no other styling changed.
- **Any other ticker**: renders an explicit "Forecast unavailable for {company}" panel — the deterministic engine only supports RRC, so no peer forecast is fabricated; outputs are described as unavailable rather than shown as `--` numbers (no peer forecast UI to number in the first place).
- The standalone `/forecast` route/page is untouched and unlinked from nav, exactly as before.

## Financials Widget (superseded by Valuations)
`components/dashboard/FinancialsPanel.tsx` (Income statement / Cash flow statement / Balance sheet, RRC-only net income/OCF/cash/total debt) has been **deleted** — its role in the Overview right column is now filled by `ValuationsPanel.tsx` above. The underlying data it read (`financials-quarterly.ts`, `free-cash-flow-quarterly.ts`) is untouched and still used elsewhere (Overview summary cards, main chart, Valuations' EBITDAX row).

## Forecast Engine
`lib/forecast/` — deterministic, pure-function pipeline (`calculations.ts`, `engine.ts`). Production is now a **flat hold of the latest reported Q1 2026 10-Q baseline** (`lib/forecast/production-engine.ts::buildFlatProductionForecast`), not a decline curve or annual ramp. `lib/forecast/scenarios/rrc-complete.ts` supports an optional `currentMarketPrices` override (`{ henryHubPerMmbtu?, wtiPerBbl? }` as `SourcedValue`s) — when a field is `undefined`, `periodAssumptions` falls back to the modeled sensitivity case via `??`, unchanged. Chain: `rrc-complete.ts` → `rrc-hedged.ts` → `rrc-valued.ts` → `app/api/rrc-scenarios/route.ts`.

**Live price wiring:** `lib/forecast/live-market-prices.ts` exports a pure `buildCurrentMarketPrices({ henryHub, wti })` that converts raw live metrics into `SourcedValue`s with `classification: "live"`, or `undefined` for a commodity when its live value is missing/non-numeric (never a fabricated or zeroed price). `app/api/rrc-scenarios/route.ts` accepts an optional `currentMarketPrices: { henryHub, wti }` in the POST body and threads the result into `runRrcValuedScenario`. `components/dashboard/ForecastPanel.tsx` calls the existing `useMarketData()` hook (same one `HomeDashboard.tsx` already used), waits for it to settle, extracts the `henry_hub` and `wti` metrics, and includes them in its `/api/rrc-scenarios` POST body. NGL is untouched — still `nglRealizationPctOfWti`, no live NGL feed. The standalone `/forecast` workbench does not send `currentMarketPrices` and is unaffected (defaults to the modeled case exactly as before).

**Methodology labeling (corrected):** Because `currentMarketPrices` is applied as the same scalar to every forecast period (2026Q1–2028Q4, per the pre-existing `rrc-complete.ts` design — not changed), it must not read as a forward curve. The commodity cards now show **"Current market — flat scenario"** (live) or **"Management sensitivity"** (fallback, $3.75 HH / $65 WTI) instead of the earlier "Live market"/"Model fallback" wording, plus a note directly under the assumptions grid: *"Current-market prices are held flat across forecast periods and are not a futures/forward curve."* The `SourcedValue.source.notes` text in `live-market-prices.ts` was also reworded to say the same thing at the data layer. Purely labeling/metadata — no calculation, classification value, or fallback behavior changed.

## Forecast Page (standalone /forecast route)
`app/forecast/page.tsx` renders `components/forecast/RrcScenarioWorkbench.tsx`: scenario preset/strategy controls, a compact "Production assumption" sidebar section (Latest reported / Manual override, per-period table, Copy/Reset), a quarterly production+revenue table, FCF/valuation cards, and a maintenance-vs-growth bridge table. This page is still not linked from the main dashboard nav — the top-nav **Forecast** destination is `ForecastWorkspacePanel.tsx` (see above), which wraps this same `RrcScenarioWorkbench` component with a company selector and live-pricing wiring rather than duplicating it.

## Current API Integrations
- `app/api/market/route.ts` — live EIA data (Henry Hub, WTI, Brent, storage, LNG exports) via `lib/eia/client.ts`.
- `app/api/rrc-scenarios/route.ts` — GET/POST, runs the deterministic forecast/valuation chain. POST now accepts `currentMarketPrices: { henryHub, wti }` from the caller (the dashboard Forecast tab supplies live EIA values here); still defaults to the modeled sensitivity case ($3.75 HH / $65 WTI) whenever a live value is missing, invalid, or not supplied (e.g. the GET handler and the standalone `/forecast` workbench, neither of which send it).
- `app/api/geography/basins` — not reviewed this session.

## Known Risks
- The forecast engine (chart Revenue/EBITDAX modeled periods, and the Forecast workspace) supports **RRC only**. All 6 other core peers show blank/unavailable forecast output by design — building peer-specific forecast models was explicitly out of scope for this task.
- EPS and P/E in the Valuations widget are **RRC only** (P/E depends on RRC-only net income for the LTM calc). The other 6 peers render `--` for those two rows; Market Cap and EBITDAX still resolve for all 7.
- Live prices are wired into: the dashboard main chart's Revenue/EBITDAX forecast segment (`HomeDashboard.tsx` → `ChartWorkspace`), and the Forecast workspace's `RrcScenarioWorkbench` (via the new `currentMarketPrices` prop, applied when the user clicks "Run scenario"/"Compare"). The standalone `/forecast` route still defaults to the modeled sensitivity case when reached directly (unchanged, no props passed there).
- NGL has no live price feed anywhere in the repo; NGL revenue still depends on the modeled `nglRealizationPctOfWti` ratio (unchanged, out of scope by design).
- The live price applies uniformly to every forecast period (2026Q1–2028Q4), not just the current quarter — this mirrors the pre-existing `currentMarketPrices` design in `rrc-complete.ts` (a scalar override, not a forward curve) and was not changed.
- `netIncome`/`operatingCashFlow`/`cashAndEquivalents`/`totalDebt` are populated for **RRC only** in `financials-quarterly.ts`; the other 6 peer tickers still show `--` for these four Financials-derived rows. Backfill them the same way (Codex workbook first, `E&P_Facset_Company_Model.xlsx` fallback for net income specifically) only when actually needed — do not fabricate or copy RRC's values across.
- RRC Q3 2024: `totalDebt` (1717.383) − `cashAndEquivalents` (277.45) = 1439.933, which is $0.757mm off the already-existing `netDebt` value (1440.69) for that quarter. Both the new fields and the pre-existing `netDebt` come directly from the Codex workbook as currently synced; the discrepancy is noted in that quarter's `totalDebt.source.note` and was not investigated further. All other 8 quarters reconcile exactly.
- RRC `netIncome` and the new RRC `EPS` are FactSet-sourced (`source: "factset"`), not Codex. Both come from `E&P_Facset_Company_Model.xlsx`, RRC sheet ("Reported Net Income ($mm)" row 41, "EPS ($/share)" row 40), actual (not estimate) columns.
- Guidance highlights are limited to the Production / Capital Expenditures / Operating Costs sections (the three common to all 7 core peers) — richer sections some companies have (e.g. "Financial Targets", "Key Guidance Changes") aren't surfaced in the compact widget, only in "View full guidance."
- The chart's FCF tab is still a pre-existing documented gap ("not yet loaded into the normalized peer dataset") — untouched, not one of the six requested changes.

## Project Rules (must hold for all future work)
- Never fabricate historical financial data.
- Missing historical values remain `null` or "--".
- Preserve normalized source metadata.
- Company filings remain the primary historical source.
- Do not blend actuals, guidance, consensus, and market data silently.
- Preserve existing forecast and valuation formulas unless explicitly instructed otherwise.
- Keep future tasks narrow to reduce token usage and improve efficiency.

## Main Dashboard Navigation/UI Integration — Done
Completed across `c742747` and `366132d`: removed the Live Data Engine widget (`DataActivityPanel.tsx` deleted) and Sources tab (`SourcesPanel.tsx` deleted); renamed Peers → Companies in the nav (peer comparison logic unchanged); added a Forecast tab (`ForecastPanel.tsx`) that reuses the existing `/api/rrc-scenarios` engine rather than duplicating it; expanded `FinancialsPanel.tsx` into Income statement / Cash flow statement / Balance sheet sections built only from normalized data, with YoY comparisons and `--` for unavailable lines.

## Live Market Price Wiring — Done
Wired the existing `/api/market` EIA feed into the dashboard Forecast tab's `currentMarketPrices` override, with the smallest change that made sense: a new pure helper (`lib/forecast/live-market-prices.ts`), a small addition to `app/api/rrc-scenarios/route.ts`'s POST body/handler, and `ForecastPanel.tsx` now calling `useMarketData()` and forwarding `henry_hub`/`wti`. No forecast/hedge/valuation formulas, production assumptions, historical data, or EIA fetch logic (`lib/eia/client.ts`) were touched. NGL remains fully modeled (`nglRealizationPctOfWti`) — no new API.

## Commodity-Price Methodology Labeling — Done
Follow-up to the wiring above: the live scalar is applied flat across every forecast period, so the UI could be misread as a forward curve. Fixed by relabeling only — `components/dashboard/ForecastPanel.tsx` (card labels + new note) and `lib/forecast/live-market-prices.ts` (`source.notes` text). No forward-curve API was added; no calculation, `classification` value, or fallback logic changed. See "Methodology labeling (corrected)" under Forecast Engine above.

## RRC Financials Metrics (Net Income / OCF / Cash / Total Debt) — Done
Added the four previously-missing Financials rows for **RRC only**, using the existing consolidated data sources per the documented source-priority (Codex workbook first, FactSet fallback), no filing scans:
- **Operating cash flow** — Codex workbook (`Range_Peer_Quarterly_Data_Input_Template_Q1_2024_to_Q1_2026.xlsm`, RRC sheet, row 63 "GAAP Cash Flow from Operations"). All 9 quarters, with per-quarter 10-Q/10-K citations already in the workbook.
- **Cash & equivalents** — same workbook, row 69 "Cash & Cash Equivalents" (quarter-end balance-sheet point-in-time). All 9 quarters.
- **Total debt** — same workbook, row 68 "Face-Value Gross Debt" (quarter-end balance-sheet point-in-time). All 9 quarters.
- **Net income** — absent from Codex (only appears inside the EBITDAX-bridge methodology note, never stored as its own row), so per Phase 2 fell back to `Peer_Comp_Site_Data/Facset/E&P_Facset_Company_Model.xlsx`, RRC sheet, row 41 "Reported Net Income ($mm)", the 9 "A" (actual, not estimate) quarterly columns.

None of the four values were derived from other stored fields (no total debt from net debt+cash, no cash from debt−net debt, no OCF from FCF+CapEx) — each is an independently sourced figure, per task constraint. `lib/dashboard/financials-quarterly.ts`: added 4 new **optional** fields to `QuarterlyFinancials` (`netIncome?`, `operatingCashFlow?`, `cashAndEquivalents?`, `totalDebt?`) so the 6 other peer tickers are untouched and still render `--`, not required-but-null placeholders. Wired into `FinancialsPanel.tsx` (since deleted/superseded — see "Financials Widget" above). See "Known Risks" above for the RRC Q3 2024 debt/cash-vs-netDebt rounding note and the FactSet net-income sourcing detail.

## Dashboard Audit (6 changes) — Done
Implemented the six-part dashboard audit in one pass:
1. **Sources removed from top nav** — already done in a prior session; verified still absent, no dead wiring.
2. **Guidance widget rebuilt** — reads `data/guidance.json` instead of market-feed-status messages; updates per company; "View full guidance" opens the existing detail drawer.
3. **Financials → Valuations** — EPS / EBITDAX / Market Cap / P/E, current vs. prior-year quarter, `--` for unsupported.
4. **Revenue chart tab added** — actual quarters from `financials-quarterly.ts`, forecast quarters from the existing engine (RRC only).
5. **Chart Valuation tab → EBITDAX** — same actual/modeled split, no stock-price-derived formula; EBITDAX stays driven by operating assumptions.
6. **Top-level Companies/Peers nav → Forecast** — single-company forecasting workbench (company selector + existing `RrcScenarioWorkbench`), `PeersPanel.tsx` and peer data preserved but unrouted.

Files added: `lib/dashboard/guidance.ts`, `lib/dashboard/valuations.ts`, `lib/dashboard/market-cap-quarterly.ts`, `lib/dashboard/eps-quarterly.ts`, `lib/dashboard/chart-forecast.ts`, `components/dashboard/GuidancePanel.tsx`, `components/dashboard/ValuationsPanel.tsx`, `components/dashboard/ForecastWorkspacePanel.tsx`, `tests/helpers/ts-loader.cjs` (recursive `@/`-alias-aware TS test loader, extending the existing single-file `load()` pattern), plus 6 new test files (34 tests).

Files modified: `components/HomeDashboard.tsx`, `components/dashboard/ChartWorkspace.tsx`, `components/forecast/RrcScenarioWorkbench.tsx`, `lib/dashboard/types.ts`, `lib/dashboard/calculated-quarterly.ts` (added `getLtmNetIncome`), `lib/forecast/live-market-prices.ts` (added `extractLiveMarketMetrics` / `buildCurrentMarketPricesFromMetrics`).

Files deleted: `components/dashboard/FinancePanel.tsx`, `components/dashboard/FinancialsPanel.tsx`, `components/dashboard/ForecastPanel.tsx` (all consolidated into the components above; no functionality lost — see the sections above for what replaced each).
