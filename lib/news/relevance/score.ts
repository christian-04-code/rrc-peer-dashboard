import type { MatchedEntity, NormalizedArticle, RelevanceResult, SourceTier, TopicKeywordMatch } from "@/lib/news/types";
import { matchCompanyEntities } from "@/lib/news/relevance/entities";
import relevanceConfig from "@/config/news-relevance.json";

type TopicKey = keyof typeof relevanceConfig.topics;

/**
 * Phase 2.5 rework. Phase 2 flattened headline+excerpt into one string
 * before scoring, so a topic keyword landing anywhere scored identically --
 * which is exactly how two live false positives got retained: "Marcellus"
 * used only as a passing comparison in an Australia shale-basin excerpt, and
 * "LNG export" used only as a passing statistic in a battery article. Every
 * keyword hit is now attributed to headline or excerpt separately, and
 * retention is decided by an explicit signal-tier rule (below), not a
 * single scalar threshold -- see scoreRelevance for the tier definitions.
 */
function findTopicMatches(text: string): Record<TopicKey, string[]> {
  const lower = text.toLowerCase();
  const matches = {} as Record<TopicKey, string[]>;
  for (const topicKey of Object.keys(relevanceConfig.topics) as TopicKey[]) {
    const hits = relevanceConfig.topics[topicKey].keywords.filter((keyword) => lower.includes(keyword.toLowerCase()));
    if (hits.length > 0) matches[topicKey] = hits;
  }
  return matches;
}

function toTopicKeywordMatches(matches: Record<string, string[]>): TopicKeywordMatch[] {
  return Object.entries(matches).map(([topic, keywords]) => ({ topic, keywords }));
}

function findGeographyMatches(text: string): string[] {
  const lower = text.toLowerCase();
  return relevanceConfig.geography.keywords.filter((keyword) => lower.includes(keyword.toLowerCase()));
}

function entityScore(entities: MatchedEntity[]): number {
  let score = 0;
  for (const entity of entities) {
    score += entity.kind === "company_name" ? relevanceConfig.entityWeights.exactCompanyName : relevanceConfig.entityWeights.tickerWithContext;
  }
  return score;
}

function sourceWeight(tier: SourceTier): number {
  return relevanceConfig.sourceWeights[tier] ?? 0;
}

/**
 * Tier B/C gate for articles with no company/entity match at all. Mirrors
 * the three explicit combinations from the approved design:
 *   (a) a strong topic signal matched in the headline, alone, is enough;
 *   (b) no headline match, but 2+ distinct topics matched (headline and/or
 *       excerpt) -- "multiple relevant signals" rather than one passing hit;
 *   (c) exactly one topic matched, but corroborated by an independent
 *       geography signal or a Tier 1 (primary/authoritative) source.
 * A single body/excerpt-only topic mention with none of the above never
 * passes -- this is what rejects the Beetaloo/battery-boom failure pattern.
 */
function passesTopicOnlyGate(params: {
  hasHeadlineTopicMatch: boolean;
  distinctTopicsMatched: number;
  hasGeographyMatch: boolean;
  isTier1Source: boolean;
}): boolean {
  if (params.hasHeadlineTopicMatch) return true;
  if (params.distinctTopicsMatched >= 2) return true;
  if (params.distinctTopicsMatched >= 1 && (params.hasGeographyMatch || params.isTier1Source)) return true;
  return false;
}

export function scoreRelevance(article: NormalizedArticle): RelevanceResult {
  const headlineText = article.headline;
  const excerptText = article.excerpt ?? "";
  const fullText = `${headlineText}\n${excerptText}`;

  const entityMatches = matchCompanyEntities(fullText);
  const hasEntityMatch = entityMatches.length > 0;

  const headlineTopics = findTopicMatches(headlineText);
  const excerptTopics = findTopicMatches(excerptText);
  const allTopicKeys = new Set<TopicKey>([...Object.keys(headlineTopics), ...Object.keys(excerptTopics)] as TopicKey[]);

  const geographyMatches = findGeographyMatches(fullText);
  const hasGeographyMatch = geographyMatches.length > 0;
  const isTier1Source = article.sourceTier === "tier1_primary";

  let topicScore = 0;
  for (const topicKey of allTopicKeys) {
    const topic = relevanceConfig.topics[topicKey];
    // A topic matched in the headline scores its (higher) headline weight
    // even if it also appears in the excerpt -- the two are not additive,
    // since "matched in the headline" already implies "matched somewhere".
    topicScore += topicKey in headlineTopics ? topic.headlineWeight : topic.excerptWeight;
  }

  const anySignalPresent = hasEntityMatch || allTopicKeys.size > 0;
  const bonus = anySignalPresent ? sourceWeight(article.sourceTier) : 0;
  const geographyScore = allTopicKeys.size > 0 || hasEntityMatch ? geographyMatches.length > 0 ? relevanceConfig.geography.weight : 0 : 0;

  const score = entityScore(entityMatches) + topicScore + geographyScore + bonus;

  const gatePass = passesTopicOnlyGate({
    hasHeadlineTopicMatch: Object.keys(headlineTopics).length > 0,
    distinctTopicsMatched: allTopicKeys.size,
    hasGeographyMatch,
    isTier1Source
  });

  // The score-floor path is a deliberately rare safety net for signal
  // combinations that stack past every named rule without matching one
  // exactly -- it must never be reachable by a single passing keyword (see
  // config/news-relevance.json's comment on highConfidenceScoreFloor).
  const retained = hasEntityMatch || gatePass || score >= relevanceConfig.highConfidenceScoreFloor;

  const matchedKeywords = [...new Set([...Object.values(headlineTopics).flat(), ...Object.values(excerptTopics).flat()])];

  let retentionReason: string | null = null;
  let rejectionReason: string | null = null;

  if (retained) {
    if (hasEntityMatch) {
      retentionReason = `Matched entity: ${entityMatches.map((e) => e.label).join(", ")}.`;
    } else if (Object.keys(headlineTopics).length > 0) {
      retentionReason = `Strong topic signal in headline: ${Object.keys(headlineTopics).join(", ")}.`;
    } else if (allTopicKeys.size >= 2) {
      retentionReason = `Multiple distinct topic signals matched: ${[...allTopicKeys].join(", ")}.`;
    } else {
      retentionReason = `Topic signal (${[...allTopicKeys].join(", ")}) corroborated by ${hasGeographyMatch ? "geography" : "a Tier 1 source"}.`;
    }
  } else if (!hasEntityMatch && allTopicKeys.size === 0 && geographyMatches.length === 0) {
    rejectionReason = "No relevant entities or topics matched.";
  } else {
    rejectionReason = `Matched only a body/excerpt-only topic signal (${[...allTopicKeys].join(", ") || "none"}) with no supporting entity, headline match, second topic, geography, or Tier 1 source -- insufficient for retention.`;
  }

  return {
    score,
    retained,
    matchedEntities: entityMatches,
    matchedKeywords,
    rejectionReason,
    retentionReason,
    signals: {
      entityMatches,
      headlineTopicMatches: toTopicKeywordMatches(headlineTopics),
      excerptTopicMatches: toTopicKeywordMatches(excerptTopics),
      distinctTopicsMatched: allTopicKeys.size,
      geographyMatches,
      sourceTierBonus: bonus,
      isTier1Source
    }
  };
}
