import { createHash } from "node:crypto";
import { normalizeHeadline } from "@/lib/news/normalize/headline";

/**
 * Syndicated copies of one wire story (Reuters -> Yahoo -> MSN -> an
 * aggregator) each get a *different* URL, so URL alone can't catch them.
 * What they share is the same story on (usually) the same publication day.
 * The fingerprint is deliberately URL-independent so it's the layer that
 * catches syndication; normalizedUrl equality (handled separately in
 * dedupe.ts) catches the narrower "same article re-collected twice" case.
 */
export function computeArticleFingerprint(headline: string, publishedAt: string | null): string {
  const normalizedHeadline = normalizeHeadline(headline);
  const day = publishedAt ? publishedAt.slice(0, 10) : "unknown-date";
  return createHash("sha256").update(`${normalizedHeadline}|${day}`).digest("hex");
}
