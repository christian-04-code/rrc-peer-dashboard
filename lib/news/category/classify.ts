import type { CategoryResult, MatchedEntity, NewsCategory, NormalizedArticle } from "@/lib/news/types";
import { NEWS_CATEGORIES } from "@/lib/news/types";

const CATEGORY_KEYWORDS: Partial<Record<NewsCategory, string[]>> = {
  natural_gas: [
    "henry hub",
    "nymex natural gas",
    "natural gas storage",
    "eia storage report",
    "dry gas production",
    "associated gas",
    "gas-directed rig",
    "gas rig count",
    "natural gas prices",
    "supply/demand balance",
    "weather-driven demand"
  ],
  lng: [
    "lng feedgas",
    "lng export",
    "liquefaction capacity",
    "lng terminal",
    "lng project",
    "final investment decision",
    " fid ",
    "gulf coast lng",
    "lng facility startup",
    "international lng demand"
  ],
  appalachia: [
    "marcellus",
    "utica",
    "appalachia",
    "appalachian basin",
    "southwest pennsylvania",
    "appalachian production",
    "appalachian basis",
    "takeaway capacity"
  ],
  power_data_centers: [
    "pjm",
    "power load growth",
    "gas-fired generation",
    "coal retirement",
    "data center",
    "ai power demand",
    "industrial reshoring",
    "electricity demand"
  ],
  ngl: ["propane", "ethane", "butane", "lpg", "mont belvieu", "ngl export", "petrochemical demand"],
  infrastructure: ["pipeline approval", "pipeline expansion", "pipeline constraint", "infrastructure development", "permitting"],
  regulatory: ["ferc", "epa", "methane regulation", "environmental regulation", "pennsylvania energy policy"]
};

/**
 * Multi-label, deterministic. "range"/"peers" come from the entity matches
 * the relevance engine already computed (so RRC vs. a peer ticker isn't
 * re-derived twice); every other category is plain keyword membership. The
 * `reasoning` map is kept alongside every result so a category assignment
 * can be audited/debugged rather than trusted blindly.
 */
export function classifyCategories(article: NormalizedArticle, matchedEntities: MatchedEntity[]): CategoryResult {
  const text = `${article.headline}\n${article.excerpt ?? ""}`.toLowerCase();
  const categories = new Set<NewsCategory>();
  const reasoning = Object.fromEntries(NEWS_CATEGORIES.map((c) => [c, []])) as unknown as Record<NewsCategory, string[]>;

  if (matchedEntities.some((entity) => entity.ticker === "RRC")) {
    categories.add("range");
    reasoning.range.push("Matched Range Resources entity");
  }
  if (matchedEntities.some((entity) => entity.ticker !== null && entity.ticker !== "RRC")) {
    categories.add("peers");
    reasoning.peers.push(
      ...matchedEntities.filter((entity) => entity.ticker && entity.ticker !== "RRC").map((entity) => `Matched peer entity: ${entity.label}`)
    );
  }

  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS) as Array<[NewsCategory, string[]]>) {
    const hits = keywords.filter((keyword) => text.includes(keyword));
    if (hits.length > 0) {
      categories.add(category);
      reasoning[category].push(...hits.map((keyword) => `Matched keyword: "${keyword.trim()}"`));
    }
  }

  return { categories: [...categories], reasoning };
}
