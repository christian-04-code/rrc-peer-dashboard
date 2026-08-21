const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const originalFetch = global.fetch;
const originalCronSecret = process.env.CRON_SECRET;
const originalSecUserAgent = process.env.SEC_USER_AGENT;
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalPostgresUrl = process.env.POSTGRES_URL;

function restoreGlobals() {
  global.fetch = originalFetch;
  if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalCronSecret;
  if (originalSecUserAgent === undefined) delete process.env.SEC_USER_AGENT;
  else process.env.SEC_USER_AGENT = originalSecUserAgent;
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  if (originalPostgresUrl === undefined) delete process.env.POSTGRES_URL;
  else process.env.POSTGRES_URL = originalPostgresUrl;
}

test.afterEach(restoreGlobals);
test.after(restoreGlobals);

const MINIMAL_RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>
  <item><title>Sample story</title><link>https://example.com/sample</link><pubDate>${new Date().toUTCString()}</pubDate><description>desc</description></item>
</channel></rss>`;

function loadRoute() {
  delete require.cache[require.resolve("../app/api/cron/news/route.ts")];
  return load("app/api/cron/news/route.ts");
}

test("rejects a request with no Authorization header", async () => {
  process.env.CRON_SECRET = "test-secret";
  const { GET } = loadRoute();
  const response = await GET(new Request("https://example.com/api/cron/news"));
  assert.equal(response.status, 401);
});

test("rejects a request with the wrong bearer token", async () => {
  process.env.CRON_SECRET = "test-secret";
  const { GET } = loadRoute();
  const response = await GET(new Request("https://example.com/api/cron/news", { headers: { authorization: "Bearer wrong-token" } }));
  assert.equal(response.status, 401);
});

test("rejects any request when CRON_SECRET is not configured server-side (no accidental open endpoint)", async () => {
  delete process.env.CRON_SECRET;
  const { GET } = loadRoute();
  const response = await GET(new Request("https://example.com/api/cron/news", { headers: { authorization: "Bearer anything" } }));
  assert.equal(response.status, 401);
});

test("accepts a correctly authorized request and returns a concise diagnostic summary, never a raw article payload", async () => {
  process.env.CRON_SECRET = "test-secret";
  delete process.env.SEC_USER_AGENT;
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
  global.fetch = async () => new Response(MINIMAL_RSS, { status: 200, headers: { "content-type": "application/rss+xml" } });

  const { GET } = loadRoute();
  const response = await GET(new Request("https://example.com/api/cron/news", { headers: { authorization: "Bearer test-secret" } }));
  assert.equal(response.status, 200);

  const body = await response.json();
  const expectedKeys = [
    "runId",
    "runDate",
    "status",
    "sourcesAttempted",
    "sourcesSuccessful",
    "sourceFailures",
    "articlesDiscovered",
    "duplicatesRemoved",
    "articlesRejected",
    "articlesRetained",
    "aiAnalysesAttempted",
    "aiAnalysesCompleted",
    "errors",
    "durationMs"
  ];
  for (const key of expectedKeys) assert.ok(key in body, `expected response to include "${key}"`);

  assert.ok(!("retainedArticles" in body), "the manual endpoint must not return raw article payloads");
  assert.ok(!("articles" in body), "the manual endpoint must not return raw article payloads");
  assert.equal(body.sourcesAttempted, 3, "SEC adapter should be excluded when SEC_USER_AGENT is unset, leaving the 3 RSS sources");
});
