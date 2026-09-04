-- Macro EIA intelligence persistence (Phase 6). Postgres-dialect, idempotent
-- (CREATE ... IF NOT EXISTS throughout) so it can be re-applied safely, same
-- convention as lib/news/persistence/schema.sql. Applied via
-- `npm run macro:migrate` (scripts/macro/migrate.mjs).
--
-- Deliberately narrow: only the two things Macro genuinely needs durable
-- history for. Henry Hub / storage / production / demand stay on their
-- existing tested live-fetch-plus-cache architecture (no Neon table) --
-- see docs/CURRENT_HANDOFF.md's Phase 6B section for the reasoning.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- One row per (series, calendar month fetched). points is the full forecast
-- curve as of that fetch -- compact normalized {period, value} pairs, never
-- a raw EIA workbook or unprocessed API payload.
CREATE TABLE IF NOT EXISTS macro_steo_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  series_id TEXT NOT NULL,
  label TEXT NOT NULL,
  unit TEXT NOT NULL,
  snapshot_month TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL,
  source_route TEXT NOT NULL,
  points JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT macro_steo_snapshots_series_month_key UNIQUE (series_id, snapshot_month)
);

CREATE INDEX IF NOT EXISTS macro_steo_snapshots_series_idx ON macro_steo_snapshots (series_id, snapshot_month DESC);

-- Cached AI Range Macro summary (Phase 6D will populate this; the schema
-- and repo functions exist now so the caching *contract* -- one summary per
-- distinct deterministic-signal fingerprint, never regenerated for an
-- unchanged snapshot -- is provable in Phase 6B before any prompt/provider
-- code is written).
CREATE TABLE IF NOT EXISTS macro_risk_summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  input_fingerprint TEXT NOT NULL,
  summary TEXT NOT NULL,
  risk_signals JSONB NOT NULL,
  ai_provider TEXT NOT NULL,
  ai_model TEXT NOT NULL,
  schema_version TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT macro_risk_summaries_fingerprint_key UNIQUE (input_fingerprint)
);

CREATE INDEX IF NOT EXISTS macro_risk_summaries_generated_idx ON macro_risk_summaries (generated_at DESC);

-- Phase 6E "Last Updated" source. Deliberately its own table, not a reuse of
-- macro_steo_snapshots.updated_at: that column also advances on ANY real
-- request to /api/macro/steo (Phase 6C's opportunistic per-request snapshot
-- capture, unrelated to the cron), so it cannot distinguish "the cron
-- actually ran" from "someone merely opened the Macro tab" -- exactly what
-- Section 2 of the Phase 6E brief forbids ("do not imply the data was
-- refreshed just because the page was opened"). This table is written to
-- ONLY at the end of a successful /api/cron/macro run
-- (runMacroDailyOrchestration), an append-only log so MAX(completed_at) is
-- always well-defined with no update-race to reason about.
CREATE TABLE IF NOT EXISTS macro_orchestration_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  steo_refreshed INTEGER NOT NULL,
  steo_failed INTEGER NOT NULL,
  ai_summary_generated BOOLEAN NOT NULL
);

CREATE INDEX IF NOT EXISTS macro_orchestration_runs_completed_idx ON macro_orchestration_runs (completed_at DESC);
