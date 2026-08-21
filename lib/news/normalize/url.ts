/**
 * Query parameters that carry no identity information about the underlying
 * story -- stripping them is what lets a Reuters link and its Yahoo/MSN
 * syndication (once resolved to the same publisher path) or the same link
 * shared twice with different campaign tags collapse to one canonical URL.
 */
const TRACKING_PARAM_PATTERNS: RegExp[] = [
  /^utm_/i,
  /^ref$/i,
  /^ref_src$/i,
  /^ref_url$/i,
  /^fbclid$/i,
  /^gclid$/i,
  /^msclkid$/i,
  /^mc_(cid|eid)$/i,
  /^cmpid$/i,
  /^icid$/i,
  /^partner$/i,
  /^smid$/i,
  /^taid$/i,
  /^__twitter_impression$/i,
  /^s_kwcid$/i
];

function isTrackingParam(key: string): boolean {
  return TRACKING_PARAM_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * Canonicalize a URL for dedup comparison: lowercase host, drop default
 * ports, strip a trailing slash, strip tracking params, sort remaining
 * params for order-independent comparison, and drop the fragment (fragments
 * never change which story a URL points to).
 */
export function normalizeArticleUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  if ((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443")) {
    url.port = "";
  }

  const keptParams: Array<[string, string]> = [];
  for (const [key, value] of url.searchParams.entries()) {
    if (!isTrackingParam(key)) keptParams.push([key, value]);
  }
  keptParams.sort(([a], [b]) => a.localeCompare(b));

  url.search = "";
  for (const [key, value] of keptParams) url.searchParams.append(key, value);

  let pathname = url.pathname.replace(/\/+$/, "");
  if (pathname === "") pathname = "/";
  url.pathname = pathname;

  return url.toString();
}

/** The canonical URL to display/store as the article's source link (tracking params stripped, but not lowercased/reordered for display). */
export function canonicalizeDisplayUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.hash = "";
  const keptParams: Array<[string, string]> = [];
  for (const [key, value] of url.searchParams.entries()) {
    if (!isTrackingParam(key)) keptParams.push([key, value]);
  }
  url.search = "";
  for (const [key, value] of keptParams) url.searchParams.append(key, value);
  return url.toString();
}
