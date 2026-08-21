import type { NewsAnalysisProvider } from "@/lib/news/ai/provider";
import { AnthropicNewsAnalysisProvider } from "@/lib/news/ai/anthropic-provider";
import type { AiAnalysisResult } from "@/lib/news/ai/types";
import { getPool, isDatabaseConfigured } from "@/lib/news/persistence/db";
import {
  markArticleAnalysisFailed,
  persistArticleAnalysis,
  queryArticles,
  type ArticleRecord
} from "@/lib/news/persistence/articles-repo";

/**
 * Phase 3 real-article validation is intentionally more restrictive than the
 * eventual automated pipeline. This cap is hard-coded so an env-var mistake
 * cannot increase validation spend beyond the approved five articles.
 */
export const MANUAL_ANALYSIS_HARD_CAP = 5;

export type ManualAnalysisItem = {
  articleId: string;
  headline: string;
  publisher: string;
  relevanceScore: number;
  status: "analyzed" | "analysis_failed";
  analysis: AiAnalysisResult | null;
  error: string | null;
};

export type ManualAnalysisResult = {
  status: "completed" | "completed_with_errors" | "not_configured";
  maxArticles: number;
  candidatesSelected: number;
  aiAnalysesAttempted: number;
  aiAnalysesCompleted: number;
  provider: string | null;
  model: string | null;
  items: ManualAnalysisItem[];
  errors: string[];
};

function analysisInput(article: ArticleRecord) {
  return {
    headline: article.headline,
    excerpt: article.excerpt,
    publisher: article.publisher,
    categories: article.category,
    matchedKeywords: article.matchedKeywords
  };
}

function safeError(error: unknown): string {
  if (!(error instanceof Error)) return "Unknown analysis error";
  return error.message.slice(0, 500);
}

/**
 * Analyze only articles already marked `retained` by the deterministic
 * relevance pipeline. This is the key cost/safety gate: no article can reach
 * Anthropic directly from source collection or from an unfiltered request.
 * The manual Phase 3 mechanism performs no automatic retry.
 */
export async function runBoundedManualAnalysis(options: {
  provider?: NewsAnalysisProvider;
  maxArticles?: number;
  pipelineRunId?: string;
} = {}): Promise<ManualAnalysisResult> {
  if (!isDatabaseConfigured()) {
    return {
      status: "not_configured",
      maxArticles: MANUAL_ANALYSIS_HARD_CAP,
      candidatesSelected: 0,
      aiAnalysesAttempted: 0,
      aiAnalysesCompleted: 0,
      provider: null,
      model: null,
      items: [],
      errors: ["Database is not configured in this runtime."]
    };
  }

  const requestedMax = Math.max(1, Math.floor(options.maxArticles ?? MANUAL_ANALYSIS_HARD_CAP));
  const maxArticles = Math.min(requestedMax, MANUAL_ANALYSIS_HARD_CAP);
  const provider = options.provider ?? new AnthropicNewsAnalysisProvider();
  const pool = getPool();

  const candidates = await queryArticles(pool, {
    status: "retained",
    pipelineRunId: options.pipelineRunId,
    limit: maxArticles
  });
  const items: ManualAnalysisItem[] = [];
  const errors: string[] = [];
  let completed = 0;

  for (const article of candidates) {
    try {
      const analysis = await provider.analyze(analysisInput(article));
      await persistArticleAnalysis(pool, article.id, analysis);
      completed += 1;
      items.push({
        articleId: article.id,
        headline: article.headline,
        publisher: article.publisher,
        relevanceScore: article.relevanceScore,
        status: "analyzed",
        analysis,
        error: null
      });
    } catch (error) {
      const message = safeError(error);
      await markArticleAnalysisFailed(pool, article.id).catch(() => undefined);
      errors.push(`Article ${article.id}: ${message}`);
      items.push({
        articleId: article.id,
        headline: article.headline,
        publisher: article.publisher,
        relevanceScore: article.relevanceScore,
        status: "analysis_failed",
        analysis: null,
        error: message
      });
    }
  }

  return {
    status: errors.length > 0 ? "completed_with_errors" : "completed",
    maxArticles,
    candidatesSelected: candidates.length,
    aiAnalysesAttempted: candidates.length,
    aiAnalysesCompleted: completed,
    provider: provider.providerName,
    model: provider.modelName,
    items,
    errors
  };
}
