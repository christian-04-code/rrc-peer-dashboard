import { randomUUID } from "node:crypto";
import type { NormalizedArticle, PipelineRunSummary, ScoredArticle, SourceCollectionOutcome } from "@/lib/news/types";
import { getDefaultSourceAdapters, type NewsSourceAdapter } from "@/lib/news/sources";
import { normalizeRawArticle, ArticleValidationError } from "@/lib/news/normalize/normalize";
import { dedupeArticles, partitionAgainstExisting } from "@/lib/news/dedupe";
import { scoreRelevance } from "@/lib/news/relevance/score";
import { classifyCategories } from "@/lib/news/category/classify";
import { PIPELINE_CONFIG } from "@/lib/news/pipeline/config";
import { getPool, isDatabaseConfigured } from "@/lib/persistence/db";
import { createPipelineRun, completePipelineRun, markPipelineRunFailed } from "@/lib/news/persistence/pipeline-runs-repo";
import { getExistingFingerprintsAndUrls, insertArticleIfNew } from "@/lib/news/persistence/articles-repo";

export type PipelineRunResult = PipelineRunSummary & {
  retainedArticles: ScoredArticle[];
  rejectedArticles: ScoredArticle[];
};

async function collectFromSources(
  adapters: NewsSourceAdapter[],
  lookbackHours: number,
  maxArticlesPerSource: number
): Promise<SourceCollectionOutcome[]> {
  const outcomes = await Promise.allSettled(
    adapters.map(async (adapter): Promise<SourceCollectionOutcome> => {
      const startedAt = Date.now();
      try {
        const articles = await adapter.collect({ lookbackHours, maxArticles: maxArticlesPerSource });
        return { sourceId: adapter.id, sourceTier: adapter.tier, status: "ok", articles, error: null, durationMs: Date.now() - startedAt };
      } catch (error) {
        return {
          sourceId: adapter.id,
          sourceTier: adapter.tier,
          status: "failed",
          articles: [],
          error: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - startedAt
        };
      }
    })
  );

  // adapter.collect() already catches internally, so every entry here settles as "fulfilled";
  // this fallback only guards against a truly unexpected throw escaping that try/catch.
  return outcomes.map((outcome, index) =>
    outcome.status === "fulfilled"
      ? outcome.value
      : {
          sourceId: adapters[index].id,
          sourceTier: adapters[index].tier,
          status: "failed" as const,
          articles: [],
          error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
          durationMs: 0
        }
  );
}

export type RunPipelineOptions = {
  adapters?: NewsSourceAdapter[];
  persist?: boolean;
};

/**
 * Orchestrates collect -> normalize -> dedupe -> relevance -> categorize ->
 * (optionally) persist. One failed source adapter never aborts the run --
 * each is isolated via Promise.allSettled plus an internal try/catch, and
 * its failure is recorded on the pipeline_runs row rather than thrown.
 */
export async function runNewsPipeline(options: RunPipelineOptions = {}): Promise<PipelineRunResult> {
  const startedAt = new Date().toISOString();
  const adapters = options.adapters ?? getDefaultSourceAdapters();
  const persist = (options.persist ?? true) && isDatabaseConfigured();
  const errors: string[] = [];

  let runId: string | null = null;
  const pool = persist ? getPool() : null;
  if (pool) {
    try {
      runId = await createPipelineRun(pool, startedAt);
    } catch (error) {
      errors.push(`Failed to create pipeline_runs row: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (!runId) runId = randomUUID();

  try {
    const collectionOutcomes = await collectFromSources(adapters, PIPELINE_CONFIG.lookbackHours, PIPELINE_CONFIG.maxArticlesPerSource);
    const sourceFailures = collectionOutcomes
      .filter((outcome) => outcome.status === "failed")
      .map((outcome) => ({ sourceId: outcome.sourceId, error: outcome.error ?? "Unknown error" }));

    const rawArticles = collectionOutcomes.flatMap((outcome) => outcome.articles);
    const articlesDiscovered = rawArticles.length;

    const retrievedAt = new Date().toISOString();
    const normalized: NormalizedArticle[] = [];
    for (const raw of rawArticles) {
      try {
        normalized.push(normalizeRawArticle(raw, retrievedAt));
      } catch (error) {
        if (error instanceof ArticleValidationError) {
          errors.push(`Skipped malformed article from ${raw.sourceId}: ${error.message}`);
        } else {
          throw error;
        }
      }
    }

    const withinRunDedupe = dedupeArticles(normalized);
    let candidates = withinRunDedupe.kept;
    let duplicatesRemoved = withinRunDedupe.duplicates.length;

    if (pool) {
      const lookbackStart = new Date(Date.now() - PIPELINE_CONFIG.lookbackHours * 60 * 60 * 1000).toISOString();
      const existing = await getExistingFingerprintsAndUrls(pool, lookbackStart);
      const againstExisting = partitionAgainstExisting(candidates, existing.fingerprints, existing.urls);
      candidates = againstExisting.kept;
      duplicatesRemoved += againstExisting.duplicates.length;
    }

    const scored: ScoredArticle[] = candidates.map((article) => {
      const relevance = scoreRelevance(article);
      const category = classifyCategories(article, relevance.matchedEntities);
      return { ...article, relevance, category };
    });

    let retainedArticles = scored.filter((article) => article.relevance.retained);
    const rejectedArticles = scored.filter((article) => !article.relevance.retained);

    if (retainedArticles.length > PIPELINE_CONFIG.maxRetainedArticlesPerRun) {
      const dropped = retainedArticles.length - PIPELINE_CONFIG.maxRetainedArticlesPerRun;
      retainedArticles = [...retainedArticles].sort((a, b) => b.relevance.score - a.relevance.score).slice(0, PIPELINE_CONFIG.maxRetainedArticlesPerRun);
      errors.push(`Dropped ${dropped} retained article(s) beyond maxRetainedArticlesPerRun (${PIPELINE_CONFIG.maxRetainedArticlesPerRun}).`);
    }

    if (pool && runId) {
      for (const article of [...retainedArticles, ...rejectedArticles]) {
        const status = article.relevance.retained ? "retained" : "rejected_relevance";
        try {
          await insertArticleIfNew(pool, article, status, runId);
        } catch (error) {
          errors.push(`Failed to persist article "${article.headline}": ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    const completedAt = new Date().toISOString();
    const status = sourceFailures.length > 0 || errors.length > 0 ? "completed_with_errors" : "completed";

    const summaryPatch = {
      status: status as PipelineRunSummary["status"],
      sourcesAttempted: adapters.length,
      sourcesSuccessful: adapters.length - sourceFailures.length,
      sourceFailures,
      articlesDiscovered,
      duplicatesRemoved,
      articlesRejected: rejectedArticles.length,
      articlesRetained: retainedArticles.length,
      aiAnalysesAttempted: 0,
      aiAnalysesCompleted: 0,
      aiAnalysesFailed: 0,
      errors,
      completedAt
    };

    if (pool && runId) {
      try {
        await completePipelineRun(pool, runId, summaryPatch);
      } catch (error) {
        errors.push(`Failed to finalize pipeline_runs row: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return {
      runId,
      runDate: startedAt.slice(0, 10),
      startedAt,
      durationMs: Date.parse(completedAt) - Date.parse(startedAt),
      retainedArticles,
      rejectedArticles,
      ...summaryPatch
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (pool && runId) {
      await markPipelineRunFailed(pool, runId, "failed", message).catch(() => undefined);
    }
    return {
      runId,
      runDate: startedAt.slice(0, 10),
      startedAt,
      completedAt: new Date().toISOString(),
      durationMs: null,
      status: "failed",
      sourcesAttempted: adapters.length,
      sourcesSuccessful: 0,
      sourceFailures: [],
      articlesDiscovered: 0,
      duplicatesRemoved: 0,
      articlesRejected: 0,
      articlesRetained: 0,
      aiAnalysesAttempted: 0,
      aiAnalysesCompleted: 0,
      aiAnalysesFailed: 0,
      errors: [...errors, message],
      retainedArticles: [],
      rejectedArticles: []
    };
  }
}
