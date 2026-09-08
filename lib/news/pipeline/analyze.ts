import type { Pool } from "pg";
import type { NewsAnalysisProvider } from "@/lib/news/ai/provider";
import { NewsAnalysisProviderError } from "@/lib/news/ai/provider";
import { AiAnalysisValidationError } from "@/lib/news/ai/types";
import { getRetainedUnanalyzedArticles, saveArticleAnalysis, markArticleAnalysisFailed } from "@/lib/news/persistence/articles-repo";
import { recordPipelineRunAiCounts } from "@/lib/news/persistence/pipeline-runs-repo";
import { withBoundedRetry, DEFAULT_ANALYSIS_RETRY_CONFIG } from "@/lib/news/ai/retry";
import { PIPELINE_CONFIG } from "@/lib/news/pipeline/config";

export type AnalyzedArticleReport = {
  articleId: string;
  headline: string;
  publisher: string;
  category: string[];
  rangeImpact: string;
  impactStrength: string;
  affectedDrivers: string[];
  timeHorizon: string;
  confidence: number;
  summary: string;
  rangeAnalysis: string;
};

export type AnalysisRunSummary = {
  eligibleFound: number;
  attempted: number;
  completed: number;
  failed: number;
  results: AnalyzedArticleReport[];
  errors: string[];
};

export type AnalyzeOptions = {
  /** Upper bound on how many eligible articles to analyze this call. Always additionally clamped to PIPELINE_CONFIG.maxAiAnalysesPerRun. */
  maxArticles: number;
  /** The pipeline_runs row AI accounting (attempted/completed/failed) is written back onto, when provided. */
  pipelineRunId?: string;
  /**
   * When true (the default -- preserves the Phase 3 manual-validation
   * endpoint's behavior), candidate selection is also scoped to
   * pipelineRunId, so a call analyzes exactly the articles it just
   * collected. Set to false for the Phase 5 scheduled orchestration: any
   * retained-and-unanalyzed article within the lookback window is eligible,
   * regardless of which run collected it, so an article a previous
   * (partially-completed, or AI-stage-skipped) daily run left in 'retained'
   * is picked up by the next run instead of being permanently stranded --
   * a later run's own new pipeline_run_id would otherwise never match it.
   */
  scopeArticlesToRun?: boolean;
};

/** Known, safe-to-surface error types get their real (truncated) message; anything else is reduced to its error name only, since an unexpected error's message is not guaranteed to be free of request/response content. */
function safeErrorMessage(error: unknown): string {
  if (error instanceof AiAnalysisValidationError || error instanceof NewsAnalysisProviderError) {
    return error.message.slice(0, 300);
  }
  if (error instanceof Error) return `Analysis failed (${error.name}).`;
  return "Analysis failed (unknown error).";
}

/**
 * Analyzes only articles the deterministic pipeline already retained
 * (processing_status = 'retained') -- no rejected or already-analyzed
 * article is ever eligible, enforced by the WHERE clause in
 * getRetainedUnanalyzedArticles and by the status-guarded UPDATE in
 * saveArticleAnalysis/markArticleAnalysisFailed, not by a check here. One
 * article's failure (after bounded retry) never aborts the batch; it's
 * marked analysis_failed and the run continues. When pipelineRunId is
 * provided, AI accounting is written back onto that same pipeline_runs row.
 */
export async function analyzeEligibleArticles(
  pool: Pool,
  provider: NewsAnalysisProvider,
  options: AnalyzeOptions
): Promise<AnalysisRunSummary> {
  const cap = Math.max(0, Math.min(options.maxArticles, PIPELINE_CONFIG.maxAiAnalysesPerRun));
  const sinceIso = new Date(Date.now() - PIPELINE_CONFIG.lookbackHours * 60 * 60 * 1000).toISOString();

  const scopeToRun = options.scopeArticlesToRun ?? true;
  const eligible = await getRetainedUnanalyzedArticles(pool, {
    limit: cap,
    sinceIso,
    pipelineRunId: scopeToRun ? options.pipelineRunId : undefined
  });

  const summary: AnalysisRunSummary = {
    eligibleFound: eligible.length,
    attempted: 0,
    completed: 0,
    failed: 0,
    results: [],
    errors: []
  };

  for (const article of eligible) {
    summary.attempted += 1;
    try {
      const analysis = await withBoundedRetry(() => provider.analyze(article.toAnalysisInput()), DEFAULT_ANALYSIS_RETRY_CONFIG);
      await saveArticleAnalysis(pool, article.id, analysis);
      summary.completed += 1;
      summary.results.push({
        articleId: article.id,
        headline: article.headline,
        publisher: article.publisher,
        category: article.category,
        rangeImpact: analysis.rangeImpact,
        impactStrength: analysis.impactStrength,
        affectedDrivers: analysis.affectedDrivers,
        timeHorizon: analysis.timeHorizon,
        confidence: analysis.confidence,
        summary: analysis.summary,
        rangeAnalysis: analysis.rangeAnalysis
      });
    } catch (error) {
      summary.failed += 1;
      await markArticleAnalysisFailed(pool, article.id).catch(() => undefined);
      summary.errors.push(`Article "${article.headline}" (${article.id}): ${safeErrorMessage(error)}`);
    }
  }

  if (options.pipelineRunId) {
    await recordPipelineRunAiCounts(pool, options.pipelineRunId, summary.attempted, summary.completed, summary.failed).catch(() => undefined);
  }

  return summary;
}
