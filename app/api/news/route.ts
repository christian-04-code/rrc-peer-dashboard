import { NextResponse } from "next/server";
import { isDatabaseConfigured, getPool } from "@/lib/news/persistence/db";
import { queryArticles, type ArticleQueryFilters } from "@/lib/news/persistence/articles-repo";
import { NEWS_CATEGORIES } from "@/lib/news/types";
import type { NewsCategory, ProcessingStatus, SourceTier } from "@/lib/news/types";

export const dynamic = "force-dynamic";

const STATUS_VALUES: ProcessingStatus[] = ["collected", "rejected_duplicate", "rejected_relevance", "retained", "analyzed", "analysis_failed"];
const TIER_VALUES: SourceTier[] = ["tier1_primary", "tier2_major_news", "tier3_discovery"];

function parseFilters(searchParams: URLSearchParams): ArticleQueryFilters {
  const filters: ArticleQueryFilters = {};

  const since = searchParams.get("since");
  if (since && !Number.isNaN(Date.parse(since))) filters.since = new Date(since).toISOString();

  const until = searchParams.get("until");
  if (until && !Number.isNaN(Date.parse(until))) filters.until = new Date(until).toISOString();

  const category = searchParams.get("category");
  if (category && (NEWS_CATEGORIES as string[]).includes(category)) filters.category = category as NewsCategory;

  const company = searchParams.get("company");
  if (company) filters.company = company;

  const status = searchParams.get("status");
  if (status && STATUS_VALUES.includes(status as ProcessingStatus)) filters.status = status as ProcessingStatus;

  const sourceTier = searchParams.get("sourceTier");
  if (sourceTier && TIER_VALUES.includes(sourceTier as SourceTier)) filters.sourceTier = sourceTier as SourceTier;

  const minRelevance = searchParams.get("minRelevance");
  if (minRelevance && !Number.isNaN(Number(minRelevance))) filters.minRelevance = Number(minRelevance);

  const limit = searchParams.get("limit");
  if (limit && !Number.isNaN(Number(limit))) filters.limit = Number(limit);

  const offset = searchParams.get("offset");
  if (offset && !Number.isNaN(Number(offset))) filters.offset = Number(offset);

  return filters;
}

/** Typed read API for the future News tab. Not yet consumed by any UI (Phase 4). */
export async function GET(request: Request) {
  if (!isDatabaseConfigured()) {
    return NextResponse.json({ error: "News storage is not configured (DATABASE_URL/POSTGRES_URL unset)." }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const filters = parseFilters(searchParams);

  try {
    const pool = getPool();
    const articles = await queryArticles(pool, filters);
    return NextResponse.json(
      { articles, count: articles.length },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" } }
    );
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to query articles." }, { status: 500 });
  }
}
