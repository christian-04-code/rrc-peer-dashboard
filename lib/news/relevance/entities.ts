import { NEWS_COMPANY_DIRECTORY } from "@/lib/news/company-directory";
import type { MatchedEntity } from "@/lib/news/types";
import relevanceConfig from "@/config/news-relevance.json";

/**
 * Immediately preceding/following a bare ticker with one of these markers is
 * what turns an ambiguous two-to-four letter token (AR, EQT, EXE...) into a
 * real financial-instrument mention instead of a coincidental word match.
 * Deliberately requires an explicit exchange prefix or $ sigil -- a bare
 * "(TICKER)" with no NYSE:/NASDAQ: prefix was dropped in Phase 2.5 (it
 * matched things like "Regional Retail Council (RRC)", an unrelated
 * organization whose initials happen to collide with a ticker).
 */
const TICKER_CONTEXT_PATTERN =
  /(\(\s*(?:NYSE|NASDAQ)\s*:\s*TICKER\s*\)|\$TICKER\b|\bNYSE:\s*TICKER\b|\bNASDAQ:\s*TICKER\b|\bticker\s+TICKER\b)/i;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildTickerContextRegex(ticker: string): RegExp {
  return new RegExp(TICKER_CONTEXT_PATTERN.source.replaceAll("TICKER", escapeRegExp(ticker)), "i");
}

function containsWholeWord(text: string, phrase: string): boolean {
  const pattern = new RegExp(`\\b${escapeRegExp(phrase)}\\b`, "i");
  return pattern.test(text);
}

function splitIntoSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n+/).filter((sentence) => sentence.trim().length > 0);
}

/**
 * Range Resources needs its own guard: "range" alone is one of the most
 * common false-positive words in English business writing (price range,
 * mountain range, product range...). It is only ever a legitimate company
 * match through a strong phrase ("Range Resources"), the bare word "range"
 * plus nearby oil/gas context, or a context-qualified RRC ticker mention --
 * never a bare "RRC" with no financial markup (Phase 2.5: a bare "RRC" used
 * to be treated as an unconditional strong phrase regardless of context,
 * which is itself a false-positive risk the same way a bare ticker is for
 * every other company -- e.g. "RRC" appearing as an unrelated abbreviation
 * in a stock-market article).
 */
function matchesRangeResourcesStrongPhrase(text: string): boolean {
  const lower = text.toLowerCase();
  const guard = relevanceConfig.rangeGuard;

  for (const phrase of guard.strongPhrases) {
    if (containsWholeWord(lower, phrase)) return true;
  }

  // A bare "range" only counts as evidence within a single sentence that
  // also carries oil/gas context, and only once every known non-company
  // phrasing of the word ("price range", "trading range", "range rover"...)
  // is stripped from that sentence first. Both restrictions matter: the
  // enumerated negative-phrase list can never cover every "<modifier>
  // range" construction (e.g. "a tight range"), so scoping the context
  // check to one sentence is what actually stops an unrelated headline
  // sentence like "Metals Trade in a Tight Range" from borrowing relevance
  // from an unrelated "natural gas" mention several sentences away in the
  // same article -- a real gap the enumerated list alone didn't close.
  const nonCompanyPhrases = [...relevanceConfig.negativeKeywords, ...guard.negativeExamplePhrases];

  for (const sentence of splitIntoSentences(lower)) {
    let strippedOfNonCompanyUses = sentence;
    for (const phrase of nonCompanyPhrases) {
      strippedOfNonCompanyUses = strippedOfNonCompanyUses.replaceAll(phrase, " ");
    }
    if (!containsWholeWord(strippedOfNonCompanyUses, "range")) continue;

    const hasContext = guard.contextKeywords.some((keyword) => sentence.includes(keyword));
    if (hasContext) return true;
  }

  return false;
}

function matchesRangeResourcesTickerContext(text: string): boolean {
  return buildTickerContextRegex("RRC").test(text);
}

/** True if the text matches Range Resources via either the strong-phrase/context path or a context-qualified RRC ticker mention. Kept for tests/callers that only need a yes/no answer -- matchCompanyEntities below distinguishes the two for weighting. */
export function matchesRangeResources(text: string): boolean {
  return matchesRangeResourcesStrongPhrase(text) || matchesRangeResourcesTickerContext(text);
}

/** Entity matches for every company in the registry, RRC routed through the guarded Range Resources checks. */
export function matchCompanyEntities(text: string): MatchedEntity[] {
  const matches: MatchedEntity[] = [];

  for (const company of NEWS_COMPANY_DIRECTORY) {
    const ticker = company.ticker;

    if (ticker === "RRC") {
      if (matchesRangeResourcesStrongPhrase(text)) {
        matches.push({ ticker, label: company.name, kind: "company_name" });
      } else if (matchesRangeResourcesTickerContext(text)) {
        matches.push({ ticker, label: ticker, kind: "ticker" });
      }
      continue;
    }

    if (containsWholeWord(text, company.name) || containsWholeWord(text, company.shortName)) {
      matches.push({ ticker, label: company.name, kind: "company_name" });
      continue;
    }

    if (buildTickerContextRegex(ticker).test(text)) {
      matches.push({ ticker, label: ticker, kind: "ticker" });
    }
    // A bare ticker match with no surrounding context is intentionally not
    // recorded at all (entityWeights.tickerBare === 0 in config) -- e.g. "AR"
    // appearing as a stray word must never be attributed to Antero Resources.
  }

  return matches;
}
