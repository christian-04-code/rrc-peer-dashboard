import type { RawArticle } from "@/lib/news/types";
import { fetchRssOrAtomFeed } from "@/lib/news/sources/rss";
import { DEFAULT_NEWS_USER_AGENT, withinLookback, type CollectOptions, type NewsSourceAdapter } from "@/lib/news/sources/types";

const FEED_URL = "https://www.naturalgasintel.com/feed/";

/** Tier 2: Natural Gas Intelligence -- verified public RSS feed, natural-gas-focused industry publication. */
export class NaturalGasIntelligenceAdapter implements NewsSourceAdapter {
  readonly id = "natural-gas-intelligence";
  readonly tier = "tier2_major_news" as const;
  readonly label = "Natural Gas Intelligence";

  async collect(options: CollectOptions): Promise<RawArticle[]> {
    const items = await fetchRssOrAtomFeed(FEED_URL, { userAgent: DEFAULT_NEWS_USER_AGENT });
    return items
      .filter((item) => withinLookback(item.pubDate, options.lookbackHours))
      .slice(0, options.maxArticles)
      .map((item) => ({
        sourceId: this.id,
        sourceTier: this.tier,
        headline: item.title,
        url: item.link,
        publisher: "Natural Gas Intelligence",
        publishedAt: item.pubDate,
        excerpt: item.description
      }));
  }
}
