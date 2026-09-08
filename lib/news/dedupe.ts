import type { NormalizedArticle } from "@/lib/news/types";

export type DedupeOutcome = {
  kept: NormalizedArticle[];
  duplicates: Array<{ article: NormalizedArticle; duplicateOf: string; reason: "normalized_url" | "fingerprint" }>;
};

/**
 * Two-key dedup, checked in order:
 *  1. normalizedUrl -- the same article collected twice (e.g. re-appears in
 *     an RSS feed window, or two source adapters both surface it).
 *  2. fingerprint (normalized headline + publication day) -- syndicated
 *     copies of one wire story across different publishers/URLs.
 * Deliberately no semantic/embedding similarity in Phase 2, per the
 * architecture decision to prefer deterministic methods first.
 */
export function dedupeArticles(articles: NormalizedArticle[]): DedupeOutcome {
  const kept: NormalizedArticle[] = [];
  const duplicates: DedupeOutcome["duplicates"] = [];
  const seenUrls = new Map<string, NormalizedArticle>();
  const seenFingerprints = new Map<string, NormalizedArticle>();

  for (const article of articles) {
    const urlMatch = seenUrls.get(article.normalizedUrl);
    if (urlMatch) {
      duplicates.push({ article, duplicateOf: urlMatch.fingerprint, reason: "normalized_url" });
      continue;
    }
    const fingerprintMatch = seenFingerprints.get(article.fingerprint);
    if (fingerprintMatch) {
      duplicates.push({ article, duplicateOf: fingerprintMatch.fingerprint, reason: "fingerprint" });
      continue;
    }
    seenUrls.set(article.normalizedUrl, article);
    seenFingerprints.set(article.fingerprint, article);
    kept.push(article);
  }

  return { kept, duplicates };
}

/** Given articles already believed new, filter out any whose fingerprint or normalizedUrl already exists in storage -- what makes a repeat pipeline run idempotent. */
export function partitionAgainstExisting(
  articles: NormalizedArticle[],
  existingFingerprints: ReadonlySet<string>,
  existingUrls: ReadonlySet<string>
): DedupeOutcome {
  const kept: NormalizedArticle[] = [];
  const duplicates: DedupeOutcome["duplicates"] = [];
  for (const article of articles) {
    if (existingUrls.has(article.normalizedUrl)) {
      duplicates.push({ article, duplicateOf: article.normalizedUrl, reason: "normalized_url" });
      continue;
    }
    if (existingFingerprints.has(article.fingerprint)) {
      duplicates.push({ article, duplicateOf: article.fingerprint, reason: "fingerprint" });
      continue;
    }
    kept.push(article);
  }
  return { kept, duplicates };
}
