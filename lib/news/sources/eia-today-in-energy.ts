import type { RawArticle } from "@/lib/news/types";
import { fetchRssOrAtomFeed } from "@/lib/news/sources/rss";
import { DEFAULT_NEWS_USER_AGENT, withinLookback, type CollectOptions, type NewsSourceAdapter } from "@/lib/news/sources/types";

const FEED_URL = "https://www.eia.gov/rss/todayinenergy.xml";

/** Tier 1: U.S. Energy Information Administration, "Today in Energy" -- verified public RSS feed. */
export class EiaTodayInEnergyAdapter implements NewsSourceAdapter {
  readonly id = "eia-today-in-energy";
  readonly tier = "tier1_primary" as const;
  readonly label = "EIA Today in Energy";

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
        publisher: "U.S. Energy Information Administration",
        publishedAt: item.pubDate,
        excerpt: item.description
      }));
  }
}
