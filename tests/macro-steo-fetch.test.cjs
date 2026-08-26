const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const originalFetch = global.fetch;
const originalKey = process.env.EIA_API_KEY;

function restoreGlobals() {
  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.EIA_API_KEY;
  else process.env.EIA_API_KEY = originalKey;
}

test.afterEach(restoreGlobals);
test.after(restoreGlobals);

function mockSteoResponse() {
  return new Response(
    JSON.stringify({
      response: {
        data: [
          { period: "2027-01", seriesId: "NGHHMCF", seriesDescription: "Natural Gas Henry Hub Spot Price ($/mcf)", value: "3.50", unit: "dollars per thousand cubic feet" },
          { period: "2027-01", seriesId: "NGPRPUS", seriesDescription: "Natural Gas Total Dry Production", value: "118.20", unit: "billion cubic feet per day" }
        ]
      }
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}

test("fetchSteoTable requests the steo/data route with a seriesId facet (not the `series` facet key other EIA routes use)", async () => {
  process.env.EIA_API_KEY = "test-key";
  let requestedUrl;
  global.fetch = async (url) => {
    requestedUrl = new URL(url.toString());
    return mockSteoResponse();
  };

  const { fetchSteoTable } = load("lib/eia/macro-fundamentals.ts");
  const result = await fetchSteoTable();

  assert.match(requestedUrl.pathname, /\/v2\/steo\/data$/);
  assert.equal(requestedUrl.searchParams.get("frequency"), "monthly");
  assert.deepEqual(requestedUrl.searchParams.getAll("facets[seriesId][]").sort(), ["NGEPCNS_US", "NGHHMCF", "NGPRPUS", "NGWGPUS"]);
  assert.doesNotMatch(requestedUrl.search, /facets%5Bseries%5D/, "must not use the `series` facet key -- STEO's own facet key is `seriesId`");
  assert.equal(result.rows.length, 2);
});

test("fetchSteoTable's request never leaks the api_key into any thrown error message on failure", async () => {
  process.env.EIA_API_KEY = "super-secret-test-key";
  global.fetch = async () => new Response("Internal Server Error", { status: 500 });

  const { fetchSteoTable } = load("lib/eia/macro-fundamentals.ts");
  await assert.rejects(
    () => fetchSteoTable(),
    (error) => {
      assert.ok(error instanceof Error);
      assert.doesNotMatch(error.message, /super-secret-test-key/);
      return true;
    }
  );
});
