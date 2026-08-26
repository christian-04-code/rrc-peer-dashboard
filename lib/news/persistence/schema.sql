-- News Intelligence schema (Phase 2). Postgres-dialect, idempotent
-- (CREATE ... IF NOT EXISTS throughout) so it can be re-applied safely.
-- Applied via `npm run news:migrate` (scripts/news/migrate.mjs), not at
-- request time inside app/api/cron/news/route.ts.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date DATE NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'completed_with_errors', 'failed')),
  sources_attempted INTEGER NOT NULL DEFAULT 0,
  sources_successful INTEGER NOT NULL DEFAULT 0,
  source_failures JSONB NOT NULL DEFAULT '[]'::jsonb,
  articles_discovered INTEGER NOT NULL DEFAULT 0,
  duplicates_removed INTEGER NOT NULL DEFAULT 0,
  articles_rejected INTEGER NOT NULL DEFAULT 0,
  articles_retained INTEGER NOT NULL DEFAULT 0,
  ai_analyses_attempted INTEGER NOT NULL DEFAULT 0,
  ai_analyses_completed INTEGER NOT NULL DEFAULT 0,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS pipeline_runs_run_date_idx ON pipeline_runs (run_date DESC);

CREATE TABLE IF NOT EXISTS articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Factual, source-provenance fields -- never AI-generated.
  canonical_url TEXT NOT NULL,
  normalized_url TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  headline TEXT NOT NULL,
  normalized_headline TEXT NOT NULL,
  publisher TEXT NOT NULL,
  original_source TEXT NOT NULL,
  published_at TIMESTAMPTZ,
  retrieved_at TIMESTAMPTZ NOT NULL,
  source_tier TEXT NOT NULL CHECK (source_tier IN ('tier1_primary', 'tier2_major_news', 'tier3_discovery')),
  excerpt TEXT,

  -- Deterministic pipeline output (Phase 2).
  category TEXT[] NOT NULL DEFAULT '{}',
  relevance_score NUMERIC NOT NULL,
  matched_entities JSONB NOT NULL DEFAULT '[]'::jsonb,
  matched_keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
  processing_status TEXT NOT NULL CHECK (
    processing_status IN ('collected', 'rejected_duplicate', 'rejected_relevance', 'retained', 'analyzed', 'analysis_failed')
  ),
  pipeline_run_id UUID REFERENCES pipeline_runs (id),

  -- Phase 3 AI analysis fields. All nullable: unset until an
  -- AiAnalysisResult (lib/news/ai/types.ts) is validated and persisted.
  ai_summary TEXT,
  range_impact TEXT CHECK (range_impact IS NULL OR range_impact IN ('positive', 'negative', 'neutral')),
  impact_strength TEXT CHECK (impact_strength IS NULL OR impact_strength IN ('low', 'medium', 'high')),
  affected_drivers TEXT[],
  range_analysis TEXT,
  time_horizon TEXT CHECK (
    time_horizon IS NULL OR time_horizon IN ('near_term', 'medium_term', 'long_term', 'multi_horizon')
  ),
  confidence NUMERIC CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  ai_provider TEXT,
  ai_model TEXT,
  ai_analyzed_at TIMESTAMPTZ,
  impact_framework_version TEXT,
  analysis_schema_version TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT articles_normalized_url_key UNIQUE (normalized_url),
  CONSTRAINT articles_fingerprint_key UNIQUE (fingerprint)
);

CREATE INDEX IF NOT EXISTS articles_published_at_idx ON articles (published_at DESC);
CREATE INDEX IF NOT EXISTS articles_category_idx ON articles USING GIN (category);
CREATE INDEX IF NOT EXISTS articles_processing_status_idx ON articles (processing_status);
CREATE INDEX IF NOT EXISTS articles_relevance_score_idx ON articles (relevance_score DESC);
CREATE INDEX IF NOT EXISTS articles_pipeline_run_id_idx ON articles (pipeline_run_id);

-- Phase 3 additions. Both statements are safe to re-run against a table
-- that already has them (ADD COLUMN IF NOT EXISTS is a no-op; the
-- constraint is unconditionally dropped-then-recreated, which is safe here
-- because no row had ever written a time_horizon value before Phase 3).
ALTER TABLE articles ADD COLUMN IF NOT EXISTS analysis_schema_version TEXT;

ALTER TABLE articles DROP CONSTRAINT IF EXISTS articles_time_horizon_check;
ALTER TABLE articles ADD CONSTRAINT articles_time_horizon_check CHECK (
  time_horizon IS NULL OR time_horizon IN ('near_term', 'medium_term', 'long_term', 'multi_horizon')
);

-- Phase 5 addition: explicit failed-analysis accounting on the run row,
-- alongside the pre-existing attempted/completed counts.
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS ai_analyses_failed INTEGER NOT NULL DEFAULT 0;
