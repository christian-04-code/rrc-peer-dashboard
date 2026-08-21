/**
 * Publishers reprint the same wire story with small cosmetic headline
 * differences (curly vs straight quotes, trailing " - Reuters", extra
 * whitespace). Normalizing lets the fingerprint catch those as one story
 * without touching the display headline, which is preserved verbatim.
 */
const TRAILING_ATTRIBUTION = /\s*[-|]\s*(reuters|bloomberg|ap|associated press|cnbc|yahoo finance)\s*$/i;

export function normalizeHeadline(headline: string): string {
  return headline
    .normalize("NFKC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(TRAILING_ATTRIBUTION, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
