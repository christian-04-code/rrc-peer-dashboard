const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const originalCronSecret = process.env.CRON_SECRET;
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalPostgresUrl = process.env.POSTGRES_URL;
const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;

function restoreGlobals() {
  if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalCronSecret;
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  if (originalPostgresUrl === undefined) delete process.env.POSTGRES_URL;
  else process.env.POSTGRES_URL = originalPostgresUrl;
  if (originalAnthropicKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
}

test.afterEach(restoreGlobals);
test.after(restoreGlobals);

function loadRoute() {
  delete require.cache[require.resolve("../app/api/cron/macro/route.ts")];
  return load("app/api/cron/macro/route.ts");
}

test("rejects a request with no Authorization header", async () => {
  process.env.CRON_SECRET = "test-secret";
  const { GET } = loadRoute();
  const response = await GET(new Request("https://example.com/api/cron/macro"));
  assert.equal(response.status, 401);
});

test("rejects a request with the wrong bearer token", async () => {
  process.env.CRON_SECRET = "test-secret";
  const { GET } = loadRoute();
  const response = await GET(new Request("https://example.com/api/cron/macro", { headers: { authorization: "Bearer wrong-token" } }));
  assert.equal(response.status, 401);
});

test("rejects any request when CRON_SECRET is not configured server-side (no accidental open endpoint)", async () => {
  delete process.env.CRON_SECRET;
  const { GET } = loadRoute();
  const response = await GET(new Request("https://example.com/api/cron/macro", { headers: { authorization: "Bearer anything" } }));
  assert.equal(response.status, 401);
});

test("accepts a correctly authorized request; with no database configured, STEO persistence and AI generation are both skipped without erroring", async () => {
  process.env.CRON_SECRET = "test-secret";
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
  const { GET } = loadRoute();
  const response = await GET(new Request("https://example.com/api/cron/macro", { headers: { authorization: "Bearer test-secret" } }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, "ok");
  assert.match(body.aiSkippedReason, /Database not configured/);
});

test("maxDuration is set to the Hobby fluid-compute ceiling (300s), matching the news cron", () => {
  const { maxDuration } = loadRoute();
  assert.equal(maxDuration, 300);
});

test("the route accepts no query parameters or request body that could alter behavior -- verified by source inspection", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync(require.resolve("../app/api/cron/macro/route.ts"), "utf8");
  assert.doesNotMatch(source, /searchParams/, "the route must not read any query parameter");
  assert.doesNotMatch(source, /request\.json\(\)/, "the route must not accept a request body");
});

test("this route never runs on a browser-facing code path -- the AI provider is only ever constructed inside lib/market/macro-orchestrate-daily.ts, never in app/api/macro/", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const riskRouteSource = fs.readFileSync(path.join(process.cwd(), "app", "api", "macro", "risk", "route.ts"), "utf8");
  const steoRouteSource = fs.readFileSync(path.join(process.cwd(), "app", "api", "macro", "steo", "route.ts"), "utf8");
  assert.doesNotMatch(riskRouteSource, /AnthropicMacroSummaryProvider/, "the browser-facing risk route must never construct an AI provider");
  assert.doesNotMatch(steoRouteSource, /AnthropicMacroSummaryProvider/);
});

test("vercel.json registers exactly one daily cron entry for /api/cron/macro, on a schedule offset from /api/cron/news (Section 18: clean separation)", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const vercelPath = path.join(process.cwd(), "vercel.json");
  assert.ok(fs.existsSync(vercelPath));

  const vercelConfig = JSON.parse(fs.readFileSync(vercelPath, "utf8"));
  const crons = vercelConfig.crons ?? [];
  const macroCrons = crons.filter((c) => c.path === "/api/cron/macro");
  assert.equal(macroCrons.length, 1, "exactly one cron entry must target /api/cron/macro");

  const fields = macroCrons[0].schedule.split(" ");
  assert.equal(fields.length, 5);
  assert.notEqual(fields[0], "*", "minute field must be fixed for a once-daily Hobby-compatible schedule");
  assert.notEqual(fields[1], "*", "hour field must be fixed for a once-daily Hobby-compatible schedule");

  const newsCron = crons.find((c) => c.path === "/api/cron/news");
  assert.notEqual(macroCrons[0].schedule, newsCron.schedule, "Macro's cron must run on a distinct schedule from News's, not the same slot");
});
