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
  delete require.cache[require.resolve("../app/api/news/status/route.ts")];
  return load("app/api/news/status/route.ts");
}

test("returns available:false with reason 'not_configured' when no database is configured, rather than crashing", async () => {
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;

  const { GET } = loadRoute();
  const response = await GET();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.available, false);
  assert.equal(body.reason, "not_configured");
});

test("route is force-dynamic", () => {
  delete require.cache[require.resolve("../app/api/news/status/route.ts")];
  const { dynamic } = load("app/api/news/status/route.ts");
  assert.equal(dynamic, "force-dynamic");
});
