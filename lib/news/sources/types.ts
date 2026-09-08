import type { RawArticle, SourceTier } from "@/lib/news/types";

export type CollectOptions = {
  lookbackHours: number;
  maxArticles: number;
};

export interface NewsSourceAdapter {
  readonly id: string;
  readonly tier: SourceTier;
  readonly label: string;
  collect(options: CollectOptions): Promise<RawArticle[]>;
}

/** A shared default User-Agent for RSS/HTTP adapters that don't need the SEC-specific declared identity. */
export const DEFAULT_NEWS_USER_AGENT = "rrc-peer-dashboard-news-bot/1.0";

export function withinLookback(publishedAt: string | null, lookbackHours: number): boolean {
  if (!publishedAt) return true;
  const publishedMs = Date.parse(publishedAt);
  if (Number.isNaN(publishedMs)) return true;
  return Date.now() - publishedMs <= lookbackHours * 60 * 60 * 1000;
}
