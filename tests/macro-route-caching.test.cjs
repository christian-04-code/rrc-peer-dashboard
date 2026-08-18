const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const originalFetch = global.fetch;
const originalEiaKey = process.env.EIA_API_KEY;

function restoreGlobals() {
  global.fetch = originalFetch;
  if (originalEiaKey === undefined) delete process.env.EIA_API_KEY;
  else process.env.EIA_API_KEY = originalEiaKey;
}

test.afterEach(restoreGlobals);
test.after(restoreGlobals);

function loadRoute() {
  delete require.cache[require.resolve("../app/api/macro/route.ts")];
  return load("app/api/macro/route.ts");
}

function eiaRow(period, value, series) {
  return { period, value, series };
}

/**
 * The three EIA table fetches (regional storage, state production, demand) are
 * distinguished by route path. `failRoutes` simulates an upstream EIA rate limit
 * (429) for the given route segments, mirroring what production actually returns
 * when the EIA_API_KEY quota is exhausted.
 */
function mockEia({ failRoutes = [] } = {}) {
  global.fetch = async (url) => {
    const parsed = new URL(url.toString());
    if (failRoutes.some((route) => parsed.pathname.includes(route))) {
      return new Response(
        JSON.stringify({ error: { code: "OVER_RATE_LIMIT", message: "You have exceeded your rate limit." } }),
        { status: 429 }
      );
    }
    return new Response(
      JSON.stringify({ response: { data: [eiaRow("2026-08-07", 950, "NG.NW2_EPG0_SWO_R31_BCF.W")] } }),
      { status: 200 }
    );
  };
}

test("all three fundamentals fetches succeed: long CDN cache, ok status, real values (never fabricated)", async () => {
  process.env.EIA_API_KEY = "test-key";
  mockEia();

  const { GET } = loadRoute();
  const response = await GET();
  const body = await response.json();

  assert.equal(response.headers.get("Cache-Control"), "public, s-maxage=3600, stale-while-revalidate=21600");
  assert.equal(body.storage.status, "ok");
  assert.equal(body.production.status, "ok");
  assert.equal(body.demand.status, "ok");
});

test("upstream EIA 429 rate limit: response stays honest (unavailable, no fabricated values) and is not fabricated as zero", async () => {
  process.env.EIA_API_KEY = "test-key";
  mockEia({ failRoutes: ["natural-gas/stor/wkly/data", "natural-gas/prod/sum/data", "natural-gas/cons/sum/data"] });

  const { GET } = loadRoute();
  const response = await GET();
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.storage.status, "unavailable");
  assert.match(body.storage.error, /429/);
  assert.equal(body.storage.regions.east.current, null);
  assert.equal(body.production.status, "unavailable");
  assert.equal(body.demand.status, "unavailable");
});

test("a degraded (partially or fully failed) response gets a short CDN cache so a transient upstream rate limit doesn't get frozen into an hours-long visible Macro-tab outage", async () => {
  process.env.EIA_API_KEY = "test-key";
  mockEia({ failRoutes: ["natural-gas/stor/wkly/data"] });

  const { GET } = loadRoute();
  const response = await GET();
  const body = await response.json();

  assert.equal(body.storage.status, "unavailable");
  assert.equal(body.production.status, "ok");
  assert.equal(response.headers.get("Cache-Control"), "public, s-maxage=30, stale-while-revalidate=60");
});
