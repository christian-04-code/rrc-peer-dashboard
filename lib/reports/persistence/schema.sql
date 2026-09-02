-- Weekly Range Resources AI Intelligence Report persistence (Phase 7A).
-- Postgres-dialect, idempotent (CREATE ... IF NOT EXISTS throughout) so it
-- can be re-applied safely, same convention as lib/news/persistence/schema.sql
-- and lib/market/persistence/schema.sql. Applied via `npm run report:migrate`
-- (scripts/reports/migrate.mjs).
--
-- This is its own subsystem, not an extension of macro_* -- Phase 7 reuses
-- Macro/News/Peers as *inputs* (read-only) but owns its own weekly
-- lifecycle/identity, same "separate subsystem, shared taxonomy only"
-- boundary Phase 6A drew between Macro and News. See
-- docs/PHASE_7_WEEKLY_REPORT_ARCHITECTURE.md for the full design.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- One row per generation ATTEMPT, not one row per week -- see the two
-- partial unique indexes below. storage_week_ending is the canonical report
-- identity (Phase 7A decision #1): the EIA Weekly Natural Gas Storage
-- report's "week ending" date (always a Friday), never a generic calendar
-- week or a generation timestamp. That date is stable across EIA's
-- holiday-driven publication slips and across a cron that fires late or is
-- retried -- a late/retried run resolves to the same identity, not a new one.
CREATE TABLE IF NOT EXISTS weekly_report_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  storage_week_ending DATE NOT NULL,
  schema_version TEXT NOT NULL,

  -- Lifecycle (Phase 7A decision #3): pending -> building -> ready -> published,
  -- or -> failed from pending/building/ready. published and failed are both
  -- terminal for a given row; a retry after failure is a new row (new
  -- attempt), never a resurrected one -- see the partial indexes below for
  -- why that is safe.
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'building', 'ready', 'published', 'failed')),
  failed_reason TEXT,

  -- Frozen snapshot (Phase 7A decision #2). All four of these are set
  -- together when a draft moves from "building" to "ready", and never
  -- written to again afterward -- once ready/published, the underlying
  -- inputs must never silently mutate. data_cutoff_at is the wall-clock
  -- moment inputs were frozen; the deterministic inputs that produced this
  -- exact payload are content-fingerprinted (input_fingerprint) the same
  -- way macro_risk_summaries.input_fingerprint works today, so a byte-identical
  -- re-run is provably unchanged rather than merely assumed to be.
  data_cutoff_at TIMESTAMPTZ,
  payload JSONB,
  input_fingerprint TEXT,
  source_manifest JSONB,

  -- Publication-readiness result (Phase 7A decision #6) as of the last
  -- readiness evaluation for this attempt -- kept for audit/debugging (why
  -- did this attempt fail or what degraded gracefully), not re-derived from
  -- payload on every read.
  readiness JSONB,

  -- Previous-week linkage (Phase 7A decision #5). Denormalized at draft
  -- creation time from whatever getLatestPublishedSnapshot() returned then,
  -- so a comparison consumer doesn't need a second query for the common
  -- case -- but it is informational, not authoritative: always prefer
  -- getPreviousPublishedSnapshot(pool, storageWeekEnding) for a query-time
  -- answer, since a backfill or out-of-order publish could in principle
  -- make the stored pointer stale. ON DELETE SET NULL even though this
  -- project never deletes snapshot rows, purely so a hypothetical future
  -- cleanup can never violate this FK.
  previous_snapshot_id UUID REFERENCES weekly_report_snapshots(id) ON DELETE SET NULL,

  -- Artifact storage (Phase 7A decision #4). The PDF binary itself is never
  -- stored in Postgres or in Git -- these columns are only the pointer/
  -- integrity metadata into whatever object/blob store Phase 7D wires up
  -- (see the architecture doc for the recommended provider). All four stay
  -- NULL until publishSnapshot() runs; the CHECK constraint below prevents a
  -- row from ever being marked "published" without them.
  artifact_key TEXT,
  artifact_checksum TEXT,
  artifact_size_bytes BIGINT,
  artifact_content_type TEXT DEFAULT 'application/pdf',

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,

  -- A published row must be a genuinely complete, frozen artifact -- never a
  -- partially-filled row wearing the "published" label. This is the schema-
  -- level backstop for "a failed new report must never replace the previous
  -- valid published report" (Phase 7A decision #3): even a bug that skips
  -- application-level checks cannot mark an incomplete row published.
  CONSTRAINT weekly_report_snapshots_published_complete_check CHECK (
    status <> 'published' OR (
      published_at IS NOT NULL AND
      payload IS NOT NULL AND
      input_fingerprint IS NOT NULL AND
      source_manifest IS NOT NULL AND
      artifact_key IS NOT NULL AND
      artifact_checksum IS NOT NULL AND
      artifact_size_bytes IS NOT NULL
    )
  ),
  CONSTRAINT weekly_report_snapshots_failed_reason_check CHECK (
    status <> 'failed' OR failed_reason IS NOT NULL
  )
);

-- At most one *active* (non-terminal) attempt per storage week at a time --
-- the DB-level guarantee that a duplicate/overlapping cron delivery for the
-- same EIA storage week can never build two drafts concurrently. A row that
-- has since failed is excluded, so a fresh retry attempt for the same week
-- is a normal INSERT, not a constraint violation.
CREATE UNIQUE INDEX IF NOT EXISTS weekly_report_snapshots_active_week_key
  ON weekly_report_snapshots (storage_week_ending)
  WHERE status IN ('pending', 'building', 'ready');

-- At most one *published* row per storage week, ever -- the DB-level
-- guarantee behind "idempotency" (Phase 7A decision #1) and "never replace
-- the previous valid published report" (decision #3): once a week is
-- published, no later attempt for that same identity can ever publish a
-- second row, no matter how the application-level gating behaves.
CREATE UNIQUE INDEX IF NOT EXISTS weekly_report_snapshots_published_week_key
  ON weekly_report_snapshots (storage_week_ending)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS weekly_report_snapshots_week_idx
  ON weekly_report_snapshots (storage_week_ending DESC);

CREATE INDEX IF NOT EXISTS weekly_report_snapshots_status_idx
  ON weekly_report_snapshots (status);

-- Weekly Analyst assessment persistence (Phase 7C). Deliberately its own
-- table, not extra mutable columns bolted onto weekly_report_snapshots --
-- the frozen snapshot's payload/fingerprint must never change once ready,
-- while an AI assessment for that exact same snapshot can legitimately be
-- retried after a failure. One row per generation ATTEMPT (mirrors
-- weekly_report_snapshots' own convention exactly), linked by snapshot_id.
CREATE TABLE IF NOT EXISTS weekly_report_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  snapshot_id UUID NOT NULL REFERENCES weekly_report_snapshots(id) ON DELETE CASCADE,

  -- The analysis input fingerprint (see lib/reports/analyst-service.ts's
  -- computeWeeklyAnalystFingerprint): derived from the snapshot's own
  -- input_fingerprint + AI schema version + prompt version + model
  -- identifier. Identical on a repeat attempt over the exact same frozen
  -- snapshot with the exact same prompt/schema/model -- that identity is
  -- what the two partial unique indexes below key off of.
  analysis_fingerprint TEXT NOT NULL,

  -- Lifecycle: pending -> ready, or -> failed. Both ready and failed are
  -- terminal for a given row; a retry after failure is a new row (new
  -- attempt) for the same analysis_fingerprint, never a resurrected one --
  -- mirrors weekly_report_snapshots' pending/building/.../failed pattern,
  -- simplified to two terminal states since a single AI call (with its own
  -- bounded internal retry, see withBoundedRetry) either succeeds or fails,
  -- with no multi-step "building" phase of its own.
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ready', 'failed')),
  error_message TEXT,

  schema_version TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  ai_provider TEXT,
  ai_model TEXT,

  -- The full validated WeeklyAnalystAssessment (ai-contract.ts) -- set only
  -- at pending -> ready, never rewritten after.
  assessment JSONB,

  attempted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Same schema-level backstop weekly_report_snapshots uses: a "ready" row
  -- must be genuinely complete, and a "failed" row must always explain why.
  CONSTRAINT weekly_report_analyses_ready_complete_check CHECK (
    status <> 'ready' OR (assessment IS NOT NULL AND ai_provider IS NOT NULL AND ai_model IS NOT NULL AND completed_at IS NOT NULL)
  ),
  CONSTRAINT weekly_report_analyses_failed_reason_check CHECK (
    status <> 'failed' OR error_message IS NOT NULL
  )
);

-- At most one *active* (pending) attempt per analysis fingerprint at a
-- time -- prevents two concurrent callers from both invoking AI for the
-- exact same frozen snapshot + prompt + schema + model. A failed row is
-- excluded, so a retry after failure is a normal INSERT.
CREATE UNIQUE INDEX IF NOT EXISTS weekly_report_analyses_active_fingerprint_key
  ON weekly_report_analyses (analysis_fingerprint)
  WHERE status = 'pending';

-- At most one *ready* (successful) analysis per fingerprint, ever -- the
-- DB-level cache/idempotency guarantee: "same snapshot + prompt + schema +
-- model returns the same cached analysis," provably, not just by
-- application discipline. A failed attempt can never block or overwrite a
-- successful one for the same fingerprint, and a successful one can never
-- be duplicated.
CREATE UNIQUE INDEX IF NOT EXISTS weekly_report_analyses_ready_fingerprint_key
  ON weekly_report_analyses (analysis_fingerprint)
  WHERE status = 'ready';

CREATE INDEX IF NOT EXISTS weekly_report_analyses_snapshot_idx
  ON weekly_report_analyses (snapshot_id, created_at DESC);

-- Phase 7F correction: durable "when did our system first confirm this EIA
-- storage week's observation was live" ledger, keyed by storage week --
-- the anchor for orchestrate-weekly.ts's publish safety buffer. Deliberately
-- its OWN tiny table, not a reuse of weekly_report_snapshots.created_at:
-- that column is only ever set once a full snapshot BUILD succeeds
-- (collect every subsystem's evidence, evaluate full readiness, freeze the
-- payload) -- on a once-daily Hobby cron, anchoring the buffer there means
-- freezing happens first and the buffer is checked after, so the buffer
-- always reads "just built" the very run that first detects a new week,
-- guaranteeing a needless extra day's delay even when the underlying EIA
-- data was already safely more than an hour old by the time the cron ran.
-- This table instead records the instant the storage candidate was first
-- observed live from EIA, independent of whether a snapshot build is ever
-- attempted for it that run -- see storage-observation-repo.ts.
CREATE TABLE IF NOT EXISTS weekly_report_storage_observations (
  storage_week_ending TEXT PRIMARY KEY,
  first_observed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
