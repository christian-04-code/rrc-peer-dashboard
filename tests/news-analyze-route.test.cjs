const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const originalCronSecret = process.env.CRON_SECRET;
const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalPostgresUrl = process.env.POSTGRES_URL;

function restoreGlobals() {
  if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = originalCronSecret;
  if (originalAnthropicKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  if (originalPostgresUrl === undefined) delete process.env.POSTGRES_URL;
  else process.env.POSTGRES_URL = originalPostgresUrl;
}

test.afterEach(restoreGlobals);
test.after(restoreGlobals);

function loadRoute() {
  delete require.cache[require.resolve("../app/api/cron/news/analyze/route.ts")];
  return load("app/api/cron/news/analyze/route.ts");
}

test("rejects a request with no Authorization header", async () => {
  process.env.CRON_SECRET = "test-secret";
  const { GET } = loadRoute();
  const response = await GET(new Request("https://example.com/api/cron/news/analyze"));
  assert.equal(response.status, 401);
});

test("rejects a request with the wrong bearer token", async () => {
  process.env.CRON_SECRET = "test-secret";
  const { GET } = loadRoute();
  const response = await GET(new Request("https://example.com/api/cron/news/analyze", { headers: { authorization: "Bearer wrong" } }));
  assert.equal(response.status, 401);
});

test("fails closed when CRON_SECRET itself is not configured server-side", async () => {
  delete process.env.CRON_SECRET;
  const { GET } = loadRoute();
  const response = await GET(new Request("https://example.com/api/cron/news/analyze", { headers: { authorization: "Bearer anything" } }));
  assert.equal(response.status, 401);
});

test("returns 503 when authorized but no database is configured", async () => {
  process.env.CRON_SECRET = "test-secret";
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
  const { GET } = loadRoute();
  const response = await GET(new Request("https://example.com/api/cron/news/analyze", { headers: { authorization: "Bearer test-secret" } }));
  assert.equal(response.status, 503);
});

test("returns 503 when authorized and DB configured but ANTHROPIC_API_KEY is not set -- never falls back to a guessed/default key", async () => {
  process.env.CRON_SECRET = "test-secret";
  process.env.DATABASE_URL = "postgres://localhost:5432/does-not-need-to-exist-for-this-check";
  delete process.env.ANTHROPIC_API_KEY;
  const { GET } = loadRoute();
  const response = await GET(new Request("https://example.com/api/cron/news/analyze", { headers: { authorization: "Bearer test-secret" } }));
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.match(body.error, /ANTHROPIC_API_KEY/);
});

test("route accepts no query parameters that could select a model, count, or SQL -- verified by source inspection", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync(require.resolve("../app/api/cron/news/analyze/route.ts"), "utf8");
  assert.doesNotMatch(source, /searchParams/, "the route must not read any query parameter");
  assert.doesNotMatch(source, /request\.json\(\)/, "the route must not accept a request body");
});

test("the manual analysis route is not registered in vercel.json -- it must never become a scheduled cron", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const vercelPath = path.join(process.cwd(), "vercel.json");
  if (!fs.existsSync(vercelPath)) return;
  const vercelConfig = fs.readFileSync(vercelPath, "utf8");
  assert.doesNotMatch(vercelConfig, /\/api\/cron\/news\/analyze/);
});
