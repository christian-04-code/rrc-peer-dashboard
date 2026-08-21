import type { NormalizedArticle, RawArticle } from "@/lib/news/types";
import { normalizeArticleUrl, canonicalizeDisplayUrl } from "@/lib/news/normalize/url";
import { normalizeHeadline } from "@/lib/news/normalize/headline";
import { computeArticleFingerprint } from "@/lib/news/fingerprint";

export class ArticleValidationError extends Error {}

/**
 * Reject rather than guess when required fields are unusable. Per the
 * project's non-negotiable data rules (CLAUDE.md): never invent metadata a
 * source didn't actually provide. A malformed record from one adapter must
 * be skippable by the caller without corrupting the pipeline run's counts.
 */
export function normalizeRawArticle(raw: RawArticle, retrievedAt: string): NormalizedArticle {
  if (!raw.headline || !raw.headline.trim()) {
    throw new ArticleValidationError("Article is missing a headline.");
  }
  if (!raw.url || !raw.url.trim()) {
    throw new ArticleValidationError("Article is missing a source URL.");
  }
  if (!raw.publisher || !raw.publisher.trim()) {
    throw new ArticleValidationError("Article is missing a publisher.");
  }

  let normalizedUrl: string;
  let canonicalUrl: string;
  try {
    normalizedUrl = normalizeArticleUrl(raw.url);
    canonicalUrl = canonicalizeDisplayUrl(raw.url);
  } catch {
    throw new ArticleValidationError(`Article URL is not a valid absolute URL: ${raw.url}`);
  }

  const publishedAt = raw.publishedAt && !Number.isNaN(Date.parse(raw.publishedAt)) ? new Date(raw.publishedAt).toISOString() : null;

  const headline = raw.headline.trim();

  return {
    fingerprint: computeArticleFingerprint(headline, publishedAt),
    canonicalUrl,
    normalizedUrl,
    headline,
    normalizedHeadline: normalizeHeadline(headline),
    publisher: raw.publisher.trim(),
    originalSource: raw.sourceId,
    publishedAt,
    retrievedAt,
    sourceTier: raw.sourceTier,
    excerpt: raw.excerpt && raw.excerpt.trim() ? raw.excerpt.trim() : null
  };
}
