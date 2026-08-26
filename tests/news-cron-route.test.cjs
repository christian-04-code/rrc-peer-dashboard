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
    "aiAnalysesFailed",
    "aiSkippedReason",
    "errors",
    "durationMs"
  ];
  for (const key of expectedKeys) assert.ok(key in body, `expected response to include "${key}"`);

  assert.ok(!("retainedArticles" in body), "the manual endpoint must not return raw article payloads");
  assert.ok(!("articles" in body), "the manual endpoint must not return raw article payloads");
  assert.equal(body.sourcesAttempted, 3, "SEC adapter should be excluded when SEC_USER_AGENT is unset, leaving the 3 RSS sources");
  assert.equal(body.aiAnalysesAttempted, 0, "no database configured -- AI analysis must be skipped, not attempted");
  assert.match(body.aiSkippedReason, /Database not configured/);
});

test("this is the one route registered as a Vercel Cron target -- maxDuration is set to the Hobby fluid-compute ceiling (300s)", () => {
  const { maxDuration } = loadRoute();
  assert.equal(maxDuration, 300);
});

test("the route accepts no query parameters or request body that could alter behavior -- verified by source inspection", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync(require.resolve("../app/api/cron/news/route.ts"), "utf8");
  assert.doesNotMatch(source, /searchParams/, "the route must not read any query parameter");
  assert.doesNotMatch(source, /request\.json\(\)/, "the route must not accept a request body");
});

test("this route (not /api/cron/news/analyze) is the intended vercel.json cron target -- verified by source inspection, no live schedule required", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const vercelPath = path.join(process.cwd(), "vercel.json");
  if (!fs.existsSync(vercelPath)) return;
  const vercelConfig = JSON.parse(fs.readFileSync(vercelPath, "utf8"));
  const crons = vercelConfig.crons ?? [];
  for (const cron of crons) {
    assert.doesNotMatch(cron.path, /\/analyze$/, "no cron entry may target the manual-only /analyze endpoint");
  }
});

test("vercel.json registers exactly one daily cron entry for /api/cron/news at 11:15 UTC (~6:15am Central, CDT most of the year)", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const vercelPath = path.join(process.cwd(), "vercel.json");
  assert.ok(fs.existsSync(vercelPath), "vercel.json must exist once the production schedule is activated");

  const vercelConfig = JSON.parse(fs.readFileSync(vercelPath, "utf8"));
  const crons = vercelConfig.crons ?? [];
  const newsCrons = crons.filter((c) => c.path === "/api/cron/news");
  assert.equal(newsCrons.length, 1, "exactly one cron entry must target /api/cron/news");
  assert.equal(newsCrons[0].schedule, "15 11 * * *");

  // Hobby accounts are limited to once-per-day cron expressions -- a
  // second star-field wildcard (hour or minute) would fail deployment.
  const fields = newsCrons[0].schedule.split(" ");
  assert.equal(fields.length, 5);
  assert.notEqual(fields[0], "*", "minute field must be fixed for a once-daily Hobby-compatible schedule");
  assert.notEqual(fields[1], "*", "hour field must be fixed for a once-daily Hobby-compatible schedule");
});
