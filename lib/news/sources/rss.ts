import { XMLParser } from "fast-xml-parser";

export type RssItem = {
  title: string;
  link: string;
  pubDate: string | null;
  description: string | null;
};

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", trimValues: true });

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function textOf(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "#text" in (value as Record<string, unknown>)) {
    const text = (value as Record<string, unknown>)["#text"];
    return typeof text === "string" ? text : null;
  }
  return null;
}

/** RSS 2.0 <item> and Atom <entry> shapes, the two formats every source in the initial adapter set uses. */
export function parseRssOrAtomFeed(xml: string): RssItem[] {
  const parsed = parser.parse(xml) as Record<string, unknown>;

  const rssItems = (parsed.rss as Record<string, unknown> | undefined)?.channel as Record<string, unknown> | undefined;
  const rawRssItems = rssItems?.item;
  if (rawRssItems) {
    const items = Array.isArray(rawRssItems) ? rawRssItems : [rawRssItems];
    return items
      .map((item: Record<string, unknown>): RssItem | null => {
        const title = textOf(item.title);
        const link = textOf(item.link);
        if (!title || !link) return null;
        const description = textOf(item.description);
        return {
          title: stripHtml(title),
          link,
          pubDate: textOf(item.pubDate),
          description: description ? stripHtml(description) : null
        };
      })
      .filter((item): item is RssItem => item !== null);
  }

  const feed = parsed.feed as Record<string, unknown> | undefined;
  const rawEntries = feed?.entry;
  if (rawEntries) {
    const entries = Array.isArray(rawEntries) ? rawEntries : [rawEntries];
    return entries
      .map((entry: Record<string, unknown>): RssItem | null => {
        const title = textOf(entry.title);
        const linkField = entry.link as { "@_href"?: string } | Array<{ "@_href"?: string; "@_rel"?: string }> | undefined;
        const link = Array.isArray(linkField)
          ? linkField.find((l) => !l["@_rel"] || l["@_rel"] === "alternate")?.["@_href"]
          : linkField?.["@_href"];
        if (!title || !link) return null;
        const summary = textOf(entry.summary) ?? textOf(entry.content);
        return {
          title: stripHtml(title),
          link,
          pubDate: textOf(entry.updated) ?? textOf(entry.published),
          description: summary ? stripHtml(summary) : null
        };
      })
      .filter((item): item is RssItem => item !== null);
  }

  return [];
}

export async function fetchRssOrAtomFeed(url: string, options: { userAgent: string; timeoutMs?: number }): Promise<RssItem[]> {
  const response = await fetch(url, {
    headers: { "User-Agent": options.userAgent, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" },
    signal: AbortSignal.timeout(options.timeoutMs ?? 15_000)
  });
  if (!response.ok) {
    throw new Error(`RSS request to ${url} failed: ${response.status}`);
  }
  const xml = await response.text();
  return parseRssOrAtomFeed(xml);
}
