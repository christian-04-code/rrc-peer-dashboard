const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const originalFetch = global.fetch;
const originalSecUserAgent = process.env.SEC_USER_AGENT;

function restoreGlobals() {
  global.fetch = originalFetch;
  if (originalSecUserAgent === undefined) delete process.env.SEC_USER_AGENT;
  else process.env.SEC_USER_AGENT = originalSecUserAgent;
}

test.afterEach(restoreGlobals);
test.after(restoreGlobals);

const NOW = new Date();
function rssWithItems(count) {
  const items = Array.from({ length: count }, (_, i) => {
    const pubDate = new Date(NOW.getTime() - i * 60 * 60 * 1000).toUTCString();
    return `<item><title>Story ${i}</title><link>https://example.com/story-${i}</link><pubDate>${pubDate}</pubDate><description>Excerpt ${i}</description></item>`;
  }).join("\n");
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>${items}</channel></rss>`;
}

test("EiaTodayInEnergyAdapter maps RSS items into RawArticle with the correct publisher and tier", async () => {
  const { EiaTodayInEnergyAdapter } = load("lib/news/sources/eia-today-in-energy.ts");
  global.fetch = async () => new Response(rssWithItems(3), { status: 200 });

  const adapter = new EiaTodayInEnergyAdapter();
  const articles = await adapter.collect({ lookbackHours: 48, maxArticles: 25 });

  assert.equal(articles.length, 3);
  assert.equal(articles[0].publisher, "U.S. Energy Information Administration");
  assert.equal(articles[0].sourceTier, "tier1_primary");
  assert.equal(articles[0].sourceId, "eia-today-in-energy");
  assert.equal(articles[0].url, "https://example.com/story-0");
});

test("NaturalGasIntelligenceAdapter respects maxArticles even when the feed returns more", async () => {
  const { NaturalGasIntelligenceAdapter } = load("lib/news/sources/natural-gas-intelligence.ts");
  global.fetch = async () => new Response(rssWithItems(10), { status: 200 });

  const adapter = new NaturalGasIntelligenceAdapter();
  const articles = await adapter.collect({ lookbackHours: 48, maxArticles: 4 });
  assert.equal(articles.length, 4);
});

test("OilPriceAdapter filters out items older than the lookback window", async () => {
  const { OilPriceAdapter } = load("lib/news/sources/oilprice.ts");
  const items = [
    { title: "Recent", hoursAgo: 2 },
    { title: "Too old", hoursAgo: 200 }
  ]
    .map((i) => `<item><title>${i.title}</title><link>https://example.com/${i.title}</link><pubDate>${new Date(NOW.getTime() - i.hoursAgo * 3600000).toUTCString()}</pubDate></item>`)
    .join("\n");
  global.fetch = async () => new Response(`<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>${items}</channel></rss>`, { status: 200 });

  const adapter = new OilPriceAdapter();
  const articles = await adapter.collect({ lookbackHours: 48, maxArticles: 25 });
  assert.equal(articles.length, 1);
  assert.equal(articles[0].headline, "Recent");
});

test("a source adapter throws with a clear message when the upstream request fails, for the pipeline runner to catch", async () => {
  const { EiaTodayInEnergyAdapter } = load("lib/news/sources/eia-today-in-energy.ts");
  global.fetch = async () => new Response("Service Unavailable", { status: 503 });

  const adapter = new EiaTodayInEnergyAdapter();
  await assert.rejects(() => adapter.collect({ lookbackHours: 48, maxArticles: 25 }), /RSS request .* failed: 503/);
});

test("SecEdgarFilingsAdapter throws at construction when SEC_USER_AGENT is unset", () => {
  delete process.env.SEC_USER_AGENT;
  delete require.cache[require.resolve("../lib/news/sources/sec-edgar-filings.ts")];
  const { SecEdgarFilingsAdapter } = load("lib/news/sources/sec-edgar-filings.ts");
  assert.throws(() => new SecEdgarFilingsAdapter(), /SEC_USER_AGENT is not set/);
});

test("SecEdgarFilingsAdapter maps recent 8-K filings into RawArticle using the registry's CIKs", async () => {
  delete require.cache[require.resolve("../lib/news/sources/sec-edgar-filings.ts")];
  const { SecEdgarFilingsAdapter } = load("lib/news/sources/sec-edgar-filings.ts");

  const today = new Date().toISOString().slice(0, 10);
  global.fetch = async (url) => {
    const cikMatch = String(url).match(/CIK(\d+)\.json/);
    const cik = cikMatch[1];
    return new Response(
      JSON.stringify({
        filings: {
          recent: {
            form: ["8-K", "10-Q"],
            filingDate: [today, today],
            accessionNumber: [`${cik}-26-000001`, `${cik}-26-000002`],
            primaryDocument: ["filing.htm", "other.htm"]
          }
        }
      }),
      { status: 200 }
    );
  };

  const adapter = new SecEdgarFilingsAdapter("test-agent contact@example.com");
  const articles = await adapter.collect({ lookbackHours: 48, maxArticles: 100 });

  assert.ok(articles.length >= 7, "should surface one 8-K per company in the registry");
  assert.ok(articles.every((a) => a.publisher.includes("Securities and Exchange Commission")));
  assert.ok(articles.every((a) => /files Form 8-K/.test(a.headline)));
  assert.ok(articles.every((a) => a.url.startsWith("https://www.sec.gov/Archives/edgar/data/")));
});
