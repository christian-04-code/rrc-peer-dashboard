const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const originalDatabaseUrl = process.env.DATABASE_URL;
const originalPostgresUrl = process.env.POSTGRES_URL;

function restoreEnv() {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
  if (originalPostgresUrl === undefined) delete process.env.POSTGRES_URL;
  else process.env.POSTGRES_URL = originalPostgresUrl;
}

test.afterEach(restoreEnv);
test.after(restoreEnv);

function loadRoute() {
  delete require.cache[require.resolve("../app/api/news/route.ts")];
  return load("app/api/news/route.ts");
}

test("returns 503 with a clear message when no database is configured, rather than crashing", async () => {
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;

  const { GET } = loadRoute();
  const response = await GET(new Request("https://example.com/api/news"));
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.match(body.error, /not configured/i);
});

test("route is force-dynamic", () => {
  delete require.cache[require.resolve("../app/api/news/route.ts")];
  const { dynamic } = load("app/api/news/route.ts");
  assert.equal(dynamic, "force-dynamic");
});
