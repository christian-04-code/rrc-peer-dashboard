import type { RawArticle } from "@/lib/news/types";
import { fetchRssOrAtomFeed } from "@/lib/news/sources/rss";
import { DEFAULT_NEWS_USER_AGENT, withinLookback, type CollectOptions, type NewsSourceAdapter } from "@/lib/news/sources/types";

const FEED_URL = "https://oilprice.com/rss/main";

/**
 * Tier 3: OilPrice.com main feed -- verified public RSS feed, broad
 * general-energy coverage (not natural-gas-specific), so this adapter leans
 * more heavily on downstream relevance filtering than the Tier 1/2 sources.
 */
export class OilPriceAdapter implements NewsSourceAdapter {
  readonly id = "oilprice-main";
  readonly tier = "tier3_discovery" as const;
  readonly label = "OilPrice.com";

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
        publisher: "OilPrice.com",
        publishedAt: item.pubDate,
        excerpt: item.description
      }));
  }
}
