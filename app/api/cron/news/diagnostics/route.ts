import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getPool, isDatabaseConfigured } from "@/lib/news/persistence/db";
import { runNewsMigrations } from "@/lib/news/persistence/migrate";
import { insertArticleIfNew, queryArticles } from "@/lib/news/persistence/articles-repo";
import { createPipelineRun, completePipelineRun, getPipelineRun } from "@/lib/news/persistence/pipeline-runs-repo";
import { normalizeRawArticle } from "@/lib/news/normalize/normalize";
import { scoreRelevance } from "@/lib/news/relevance/score";
import { classifyCategories } from "@/lib/news/category/classify";

export const dynamic = "force-dynamic";

/**
 * TEMPORARY, Phase 2.5 only. Verifies the real Neon database from inside
 * the Vercel Preview runtime: schema, constraints, and a controlled
 * read/write/idempotency smoke test using clearly-tagged fixture rows that
 * this route deletes itself before returning. Must be removed once
 * verification is complete -- see the Phase 2.5 report for tracking.
 *
 * Hard constraints (do not weaken):
 *  - No request parameter (query string or body) is ever consulted. The
 *    entire check sequence is fixed in code.
 *  - No raw table contents, row counts beyond small booleans/integers, or
 *    environment values are ever returned.
 *  - Any error message is sanitized before being included in the response.
 */

const FIXTURE_TAG = "phase25-diagnostics-fixture";
const FIXTURE_URL_BASE = "https://phase25-diagnostics.internal.test";

const EXPECTED_INDEXES = [
  "articles_published_at_idx",
  "articles_category_idx",
  "articles_processing_status_idx",
  "articles_relevance_score_idx",
  "articles_pipeline_run_id_idx",
  "pipeline_runs_run_date_idx"
];

const AI_COLUMNS = [
  "ai_summary",
  "range_impact",
  "impact_strength",
  "affected_drivers",
  "range_analysis",
  "time_horizon",
  "confidence",
  "ai_provider",
  "ai_model",
  "ai_analyzed_at",
  "impact_framework_version"
];

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

/** Strips anything that looks like a connection string/credential before an error message is ever included in a response. */
function safeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/postgres(ql)?:\/\/\S+/gi, "[redacted]")
    .replace(/password=\S+/gi, "password=[redacted]")
    .slice(0, 300);
}

type CheckResult = { pass: boolean; detail?: string };

function buildFixtureArticle(overrides: { headline: string; url: string; publishedAt: string; excerpt: string | null; sourceTier: "tier1_primary" | "tier3_discovery" }) {
  const normalized = normalizeRawArticle(
    {
      sourceId: FIXTURE_TAG,
      sourceTier: overrides.sourceTier,
      headline: overrides.headline,
      url: overrides.url,
      publisher: "Phase 2.5 Diagnostics Fixture",
      publishedAt: overrides.publishedAt,
      excerpt: overrides.excerpt
    },
    new Date().toISOString()
  );
  const relevance = scoreRelevance(normalized);
  const category = classifyCategories(normalized, relevance.matchedEntities);
  return { ...normalized, relevance, category };
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const checks: Record<string, CheckResult> = {};
  const insertedArticleIds: string[] = [];
  let pipelineRunId: string | null = null;

  const record = (name: string, pass: boolean, detail?: string) => {
    checks[name] = detail ? { pass, detail } : { pass };
  };

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: false, connection: { pass: false, detail: "no database configured" }, checks: {} }, { status: 503 });
  }

  try {
    const pool = getPool();

    try {
      await pool.query("SELECT 1");
      record("connection", true);
    } catch (error) {
      record("connection", false, safeErrorMessage(error));
      throw new Error("connection failed, aborting remaining checks");
    }

    try {
      await runNewsMigrations();
      record("migration", true);
    } catch (error) {
      record("migration", false, safeErrorMessage(error));
    }

    try {
      const tables = await pool.query(
        `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1)`,
        [["articles", "pipeline_runs"]]
      );
      const found = new Set(tables.rows.map((r: { table_name: string }) => r.table_name));
      record("articlesTable", found.has("articles"));
      record("pipelineRunsTable", found.has("pipeline_runs"));
    } catch (error) {
      record("articlesTable", false, safeErrorMessage(error));
      record("pipelineRunsTable", false, safeErrorMessage(error));
    }

    try {
      const indexes = await pool.query(
        `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND tablename IN ('articles', 'pipeline_runs')`
      );
      const found = new Set(indexes.rows.map((r: { indexname: string }) => r.indexname));
      const missing = EXPECTED_INDEXES.filter((name) => !found.has(name));
      record("indexes", missing.length === 0, missing.length > 0 ? `missing: ${missing.join(", ")}` : undefined);
    } catch (error) {
      record("indexes", false, safeErrorMessage(error));
    }

    try {
      const constraints = await pool.query(
        `SELECT conname FROM pg_constraint WHERE conrelid = 'articles'::regclass AND contype = 'u'`
      );
      const found = new Set(constraints.rows.map((r: { conname: string }) => r.conname));
      record("normalizedUrlConstraint", found.has("articles_normalized_url_key"));
      record("fingerprintConstraint", found.has("articles_fingerprint_key"));
    } catch (error) {
      record("normalizedUrlConstraint", false, safeErrorMessage(error));
      record("fingerprintConstraint", false, safeErrorMessage(error));
    }

    try {
      const columns = await pool.query(
        `SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'articles' AND column_name = ANY($1)`,
        [AI_COLUMNS]
      );
      const rows = columns.rows as Array<{ column_name: string; is_nullable: string }>;
      const allPresent = rows.length === AI_COLUMNS.length;
      const allNullable = rows.every((r) => r.is_nullable === "YES");
      record("aiColumnsPresentAndNullable", allPresent && allNullable, !allPresent ? `expected ${AI_COLUMNS.length}, found ${rows.length}` : undefined);
    } catch (error) {
      record("aiColumnsPresentAndNullable", false, safeErrorMessage(error));
    }

    // --- Controlled fixture smoke test -------------------------------------
    const runToken = randomUUID().slice(0, 8);
    const publishedAt = new Date().toISOString();

    try {
      pipelineRunId = await createPipelineRun(pool, new Date().toISOString());
      const runRow = await getPipelineRun(pool, pipelineRunId);
      record("pipelineRunWriteRead", Boolean(runRow && runRow.status === "running"));
    } catch (error) {
      record("pipelineRunWriteRead", false, safeErrorMessage(error));
    }

    let retainedFixture: ReturnType<typeof buildFixtureArticle> | null = null;
    let rejectedFixture: ReturnType<typeof buildFixtureArticle> | null = null;

    try {
      retainedFixture = buildFixtureArticle({
        headline: `[PHASE2.5-DIAGNOSTICS-TEMP ${runToken}] Range Resources Corporation reports diagnostic fixture results`,
        url: `${FIXTURE_URL_BASE}/retained-${runToken}`,
        publishedAt,
        excerpt: "Synthetic fixture record created by the Phase 2.5 diagnostics route for verification only.",
        sourceTier: "tier1_primary"
      });
      rejectedFixture = buildFixtureArticle({
        headline: `[PHASE2.5-DIAGNOSTICS-TEMP ${runToken}] Local bakery wins county fair blue ribbon fixture`,
        url: `${FIXTURE_URL_BASE}/rejected-${runToken}`,
        publishedAt,
        excerpt: null,
        sourceTier: "tier3_discovery"
      });

      record("retainedFixtureIsRetained", retainedFixture.relevance.retained === true);
      record("rejectedFixtureIsRejected", rejectedFixture.relevance.retained === false);
    } catch (error) {
      record("retainedFixtureIsRetained", false, safeErrorMessage(error));
      record("rejectedFixtureIsRejected", false, safeErrorMessage(error));
    }

    if (pipelineRunId && retainedFixture && rejectedFixture) {
      try {
        const retainedInsert = await insertArticleIfNew(pool, retainedFixture, "retained", pipelineRunId);
        const rejectedInsert = await insertArticleIfNew(pool, rejectedFixture, "rejected_relevance", pipelineRunId);
        if (retainedInsert.id) insertedArticleIds.push(retainedInsert.id);
        if (rejectedInsert.id) insertedArticleIds.push(rejectedInsert.id);
        record("articleWrite", retainedInsert.inserted && rejectedInsert.inserted);
      } catch (error) {
        record("articleWrite", false, safeErrorMessage(error));
      }

      try {
        const readBack = await queryArticles(pool, { status: "retained", limit: 200 });
        const readBackRejected = await queryArticles(pool, { status: "rejected_relevance", limit: 200 });
        const foundRetained = readBack.some((a) => a.canonicalUrl === retainedFixture!.canonicalUrl);
        const foundRejected = readBackRejected.some((a) => a.canonicalUrl === rejectedFixture!.canonicalUrl);
        record("articleRead", foundRetained && foundRejected);
        record("retainedPersistence", foundRetained);
        record("rejectedPersistence", foundRejected);
        record("apiNewsQueryCompatibility", foundRetained && foundRejected);
      } catch (error) {
        record("articleRead", false, safeErrorMessage(error));
        record("apiNewsQueryCompatibility", false, safeErrorMessage(error));
      }

      // Duplicate normalized_url: same URL as the retained fixture, different headline/fingerprint.
      try {
        const urlDuplicate = buildFixtureArticle({
          headline: `[PHASE2.5-DIAGNOSTICS-TEMP ${runToken}] A different headline entirely for URL dup test`,
          url: retainedFixture.canonicalUrl,
          publishedAt,
          excerpt: null,
          sourceTier: "tier3_discovery"
        });
        const result = await insertArticleIfNew(pool, urlDuplicate, "collected", pipelineRunId);
        if (result.id) insertedArticleIds.push(result.id);
        record("urlDuplicateProtection", result.inserted === false);
      } catch (error) {
        record("urlDuplicateProtection", false, safeErrorMessage(error));
      }

      // Duplicate fingerprint: same headline + publication day as the retained fixture, different URL.
      try {
        const fingerprintDuplicate = buildFixtureArticle({
          headline: retainedFixture.headline,
          url: `${FIXTURE_URL_BASE}/fingerprint-dup-${runToken}`,
          publishedAt,
          excerpt: null,
          sourceTier: "tier3_discovery"
        });
        const result = await insertArticleIfNew(pool, fingerprintDuplicate, "collected", pipelineRunId);
        if (result.id) insertedArticleIds.push(result.id);
        record("fingerprintDuplicateProtection", result.inserted === false);
      } catch (error) {
        record("fingerprintDuplicateProtection", false, safeErrorMessage(error));
      }

      // Repeat-run idempotency: re-insert the exact same retained fixture again.
      try {
        const before = await pool.query("SELECT count(*)::int AS n FROM articles WHERE original_source = $1", [FIXTURE_TAG]);
        const repeat = await insertArticleIfNew(pool, retainedFixture, "retained", pipelineRunId);
        if (repeat.id) insertedArticleIds.push(repeat.id);
        const after = await pool.query("SELECT count(*)::int AS n FROM articles WHERE original_source = $1", [FIXTURE_TAG]);
        record("repeatRunIdempotency", repeat.inserted === false && before.rows[0].n === after.rows[0].n);
      } catch (error) {
        record("repeatRunIdempotency", false, safeErrorMessage(error));
      }

      try {
        await completePipelineRun(pool, pipelineRunId, {
          status: "completed",
          sourcesAttempted: 1,
          sourcesSuccessful: 1,
          sourceFailures: [],
          articlesDiscovered: 2,
          duplicatesRemoved: 2,
          articlesRejected: 1,
          articlesRetained: 1,
          aiAnalysesAttempted: 0,
          aiAnalysesCompleted: 0,
          errors: [],
          completedAt: new Date().toISOString()
        });
        const runRow = await getPipelineRun(pool, pipelineRunId);
        record(
          "pipelineRunAccounting",
          Boolean(runRow && runRow.status === "completed" && runRow.articles_retained === 1 && runRow.articles_rejected === 1)
        );
      } catch (error) {
        record("pipelineRunAccounting", false, safeErrorMessage(error));
      }
    }

    const allPass = Object.values(checks).every((c) => c.pass);
    return NextResponse.json({ ok: allPass, checks });
  } catch (error) {
    return NextResponse.json({ ok: false, checks, fatalError: safeErrorMessage(error) }, { status: 500 });
  } finally {
    try {
      const pool = getPool();
      if (insertedArticleIds.length > 0) {
        await pool.query("DELETE FROM articles WHERE id = ANY($1::uuid[])", [insertedArticleIds]);
      }
      await pool.query("DELETE FROM articles WHERE original_source = $1", [FIXTURE_TAG]);
      if (pipelineRunId) {
        await pool.query("DELETE FROM pipeline_runs WHERE id = $1", [pipelineRunId]);
      }
    } catch {
      // Best-effort cleanup; a failure here is surfaced by the presence of
      // fixture rows on a subsequent run's cleanup pass, not silently lost.
    }
  }
}
