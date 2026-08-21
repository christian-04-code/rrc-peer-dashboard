import { NEWS_COMPANY_DIRECTORY } from "@/lib/news/company-directory";
import type { MatchedEntity } from "@/lib/news/types";
import relevanceConfig from "@/config/news-relevance.json";

/**
 * Immediately preceding/following a bare ticker with one of these markers is
 * what turns an ambiguous two-to-four letter token (AR, EQT, EXE...) into a
 * real financial-instrument mention instead of a coincidental word match.
 */
const TICKER_CONTEXT_PATTERN =
  /(\(\s*(?:NYSE|NASDAQ)\s*:\s*TICKER\s*\)|\$TICKER\b|\bTICKER\s*\)|\bNYSE:\s*TICKER\b|\bNASDAQ:\s*TICKER\b|\bticker\s+TICKER\b)/i;

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

/**
 * Range Resources needs its own guard: "range" alone is one of the most
 * common false-positive words in English business writing (price range,
 * mountain range, product range...). It is only ever a legitimate company
 * match through a strong phrase ("Range Resources", "RRC" in context) or
 * the bare word "range" plus nearby oil/gas context -- never the word
 * "range" by itself.
 */
export function matchesRangeResources(text: string): boolean {
  const lower = text.toLowerCase();
  const guard = relevanceConfig.rangeGuard;

  for (const phrase of guard.strongPhrases) {
    if (containsWholeWord(lower, phrase)) return true;
  }

  // A bare "range" only counts as evidence once every known non-company
  // phrasing of the word ("price range", "trading range", "range rover"...)
  // is stripped out first -- otherwise an unrelated "gas prices held in a
  // tight trading range" sentence would false-positive purely because the
  // same article happens to mention natural gas elsewhere.
  const nonCompanyPhrases = [...relevanceConfig.negativeKeywords, ...guard.negativeExamplePhrases];
  let strippedOfNonCompanyUses = lower;
  for (const phrase of nonCompanyPhrases) {
    strippedOfNonCompanyUses = strippedOfNonCompanyUses.replaceAll(phrase, " ");
  }

  if (containsWholeWord(strippedOfNonCompanyUses, "range")) {
    const hasContext = guard.contextKeywords.some((keyword) => lower.includes(keyword));
    if (hasContext) return true;
  }

  return false;
}

/** Entity matches for every company in the registry, RRC routed through the guarded matchesRangeResources check. */
export function matchCompanyEntities(text: string): MatchedEntity[] {
  const matches: MatchedEntity[] = [];

  for (const company of NEWS_COMPANY_DIRECTORY) {
    const ticker = company.ticker;

    if (ticker === "RRC") {
      if (matchesRangeResources(text)) {
        matches.push({ ticker, label: company.name, kind: "company_name" });
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
