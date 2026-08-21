import type { NormalizedArticle, RelevanceResult, SourceTier } from "@/lib/news/types";
import { matchCompanyEntities } from "@/lib/news/relevance/entities";
import relevanceConfig from "@/config/news-relevance.json";

type TopicKey = keyof typeof relevanceConfig.topics;

function scoreText(article: NormalizedArticle): { text: string } {
  return { text: `${article.headline}\n${article.excerpt ?? ""}` };
}

function scoreTopics(text: string): { score: number; matchedKeywords: string[] } {
  const lower = text.toLowerCase();
  let score = 0;
  const matchedKeywords: string[] = [];

  for (const topicKey of Object.keys(relevanceConfig.topics) as TopicKey[]) {
    const topic = relevanceConfig.topics[topicKey];
    const hits = topic.keywords.filter((keyword) => lower.includes(keyword.toLowerCase()));
    if (hits.length > 0) {
      score += topic.weight;
      matchedKeywords.push(...hits);
    }
  }

  return { score, matchedKeywords };
}

function scoreEntities(text: string): { score: number; matchedEntities: ReturnType<typeof matchCompanyEntities> } {
  const matchedEntities = matchCompanyEntities(text);
  let score = 0;
  for (const entity of matchedEntities) {
    score += entity.kind === "company_name" ? relevanceConfig.entityWeights.exactCompanyName : relevanceConfig.entityWeights.tickerWithContext;
  }
  return { score, matchedEntities };
}

function sourceWeight(tier: SourceTier): number {
  return relevanceConfig.sourceWeights[tier] ?? 0;
}

/**
 * Deterministic relevance scoring, run before any AI call. An article is
 * retained only once its combined entity + topic + source-tier score meets
 * config.retentionThreshold -- no article reaches the AI analysis stage
 * without first clearing this bar.
 */
export function scoreRelevance(article: NormalizedArticle): RelevanceResult {
  const { text } = scoreText(article);
  const entityResult = scoreEntities(text);
  const topicResult = scoreTopics(text);
  const bonus = entityResult.matchedEntities.length > 0 || topicResult.matchedKeywords.length > 0 ? sourceWeight(article.sourceTier) : 0;

  const score = entityResult.score + topicResult.score + bonus;
  const retained = score >= relevanceConfig.retentionThreshold;

  let rejectionReason: string | null = null;
  if (!retained) {
    rejectionReason =
      entityResult.matchedEntities.length === 0 && topicResult.matchedKeywords.length === 0
        ? "No relevant entities or topics matched."
        : `Relevance score ${score} below retention threshold ${relevanceConfig.retentionThreshold}.`;
  }

  return {
    score,
    retained,
    matchedEntities: entityResult.matchedEntities,
    matchedKeywords: topicResult.matchedKeywords,
    rejectionReason
  };
}
