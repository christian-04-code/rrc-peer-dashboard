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
