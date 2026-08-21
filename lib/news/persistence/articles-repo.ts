import type { Pool } from "pg";
import type { NewsCategory, ProcessingStatus, ScoredArticle, SourceTier } from "@/lib/news/types";

export type ArticleRecord = {
  id: string;
  canonicalUrl: string;
  normalizedUrl: string;
  fingerprint: string;
  headline: string;
  normalizedHeadline: string;
  publisher: string;
  originalSource: string;
  publishedAt: string | null;
  retrievedAt: string;
  sourceTier: SourceTier;
  excerpt: string | null;
  category: NewsCategory[];
  relevanceScore: number;
  matchedEntities: unknown[];
  matchedKeywords: string[];
  processingStatus: ProcessingStatus;
  pipelineRunId: string | null;
  aiSummary: string | null;
  rangeImpact: string | null;
  impactStrength: string | null;
  affectedDrivers: string[] | null;
  rangeAnalysis: string | null;
  timeHorizon: string | null;
  confidence: number | null;
  aiProvider: string | null;
  aiModel: string | null;
  aiAnalyzedAt: string | null;
  impactFrameworkVersion: string | null;
  createdAt: string;
  updatedAt: string;
};

function mapRow(row: Record<string, unknown>): ArticleRecord {
  return {
    id: row.id as string,
    canonicalUrl: row.canonical_url as string,
    normalizedUrl: row.normalized_url as string,
    fingerprint: row.fingerprint as string,
    headline: row.headline as string,
    normalizedHeadline: row.normalized_headline as string,
    publisher: row.publisher as string,
    originalSource: row.original_source as string,
    publishedAt: (row.published_at as Date | null)?.toISOString?.() ?? (row.published_at as string | null),
    retrievedAt: (row.retrieved_at as Date).toISOString?.() ?? (row.retrieved_at as string),
    sourceTier: row.source_tier as SourceTier,
    excerpt: row.excerpt as string | null,
    category: (row.category as NewsCategory[]) ?? [],
    relevanceScore: Number(row.relevance_score),
    matchedEntities: (row.matched_entities as unknown[]) ?? [],
    matchedKeywords: (row.matched_keywords as string[]) ?? [],
    processingStatus: row.processing_status as ProcessingStatus,
    pipelineRunId: (row.pipeline_run_id as string | null) ?? null,
    aiSummary: (row.ai_summary as string | null) ?? null,
    rangeImpact: (row.range_impact as string | null) ?? null,
    impactStrength: (row.impact_strength as string | null) ?? null,
    affectedDrivers: (row.affected_drivers as string[] | null) ?? null,
    rangeAnalysis: (row.range_analysis as string | null) ?? null,
    timeHorizon: (row.time_horizon as string | null) ?? null,
    confidence: row.confidence === null || row.confidence === undefined ? null : Number(row.confidence),
    aiProvider: (row.ai_provider as string | null) ?? null,
    aiModel: (row.ai_model as string | null) ?? null,
    aiAnalyzedAt: (row.ai_analyzed_at as Date | null)?.toISOString?.() ?? (row.ai_analyzed_at as string | null),
    impactFrameworkVersion: (row.impact_framework_version as string | null) ?? null,
    createdAt: (row.created_at as Date).toISOString?.() ?? (row.created_at as string),
    updatedAt: (row.updated_at as Date).toISOString?.() ?? (row.updated_at as string)
  };
}

/**
 * ON CONFLICT DO NOTHING with no target list applies to *any* unique
 * constraint violation on the table -- both articles_normalized_url_key and
 * articles_fingerprint_key -- which is what makes a repeat pipeline run
 * idempotent regardless of which of the two dedup keys collides.
 */
export async function insertArticleIfNew(
  pool: Pool,
  article: ScoredArticle,
  status: ProcessingStatus,
  pipelineRunId: string
): Promise<{ inserted: boolean; id: string | null }> {
  const result = await pool.query(
    `INSERT INTO articles (
      canonical_url, normalized_url, fingerprint, headline, normalized_headline,
      publisher, original_source, published_at, retrieved_at, source_tier, excerpt,
      category, relevance_score, matched_entities, matched_keywords, processing_status, pipeline_run_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
    ON CONFLICT DO NOTHING
    RETURNING id`,
    [
      article.canonicalUrl,
      article.normalizedUrl,
      article.fingerprint,
      article.headline,
      article.normalizedHeadline,
      article.publisher,
      article.originalSource,
      article.publishedAt,
      article.retrievedAt,
      article.sourceTier,
      article.excerpt,
      article.category.categories,
      article.relevance.score,
      JSON.stringify(article.relevance.matchedEntities),
      JSON.stringify(article.relevance.matchedKeywords),
      status,
      pipelineRunId
    ]
  );
  const id = (result.rows[0]?.id as string | undefined) ?? null;
  return { inserted: id !== null, id };
}

export async function getExistingFingerprintsAndUrls(
  pool: Pool,
  sinceIso: string
): Promise<{ fingerprints: Set<string>; urls: Set<string> }> {
  const result = await pool.query(`SELECT fingerprint, normalized_url FROM articles WHERE retrieved_at >= $1`, [sinceIso]);
  const fingerprints = new Set<string>();
  const urls = new Set<string>();
  for (const row of result.rows as Array<{ fingerprint: string; normalized_url: string }>) {
    fingerprints.add(row.fingerprint);
    urls.add(row.normalized_url);
  }
  return { fingerprints, urls };
}

export type ArticleQueryFilters = {
  since?: string;
  until?: string;
  category?: NewsCategory;
  company?: string;
  status?: ProcessingStatus;
  sourceTier?: SourceTier;
  minRelevance?: number;
  limit?: number;
  offset?: number;
};

export async function queryArticles(pool: Pool, filters: ArticleQueryFilters): Promise<ArticleRecord[]> {
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (filters.since) {
    values.push(filters.since);
    conditions.push(`published_at >= $${values.length}`);
  }
  if (filters.until) {
    values.push(filters.until);
    conditions.push(`published_at <= $${values.length}`);
  }
  if (filters.category) {
    values.push(filters.category);
    conditions.push(`$${values.length} = ANY(category)`);
  }
  if (filters.company) {
    values.push(`%${filters.company}%`);
    conditions.push(`(headline ILIKE $${values.length} OR matched_entities::text ILIKE $${values.length})`);
  }
  if (filters.status) {
    values.push(filters.status);
    conditions.push(`processing_status = $${values.length}`);
  }
  if (filters.sourceTier) {
    values.push(filters.sourceTier);
    conditions.push(`source_tier = $${values.length}`);
  }
  if (filters.minRelevance !== undefined) {
    values.push(filters.minRelevance);
    conditions.push(`relevance_score >= $${values.length}`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const limit = Math.min(filters.limit ?? 50, 200);
  values.push(limit);
  values.push(filters.offset ?? 0);

  const result = await pool.query(
    `SELECT * FROM articles ${whereClause} ORDER BY published_at DESC NULLS LAST LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values
  );
  return result.rows.map(mapRow);
}
