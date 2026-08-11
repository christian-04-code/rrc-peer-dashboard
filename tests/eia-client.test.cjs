const assert = require("node:assert/strict");
const test = require("node:test");
const { load } = require("./helpers/ts-loader.cjs");

function loadClient() {
  return load("lib/eia/client.ts");
}

const originalFetch = global.fetch;
const originalKey = process.env.EIA_API_KEY;

function restoreGlobals() {
  global.fetch = originalFetch;
  if (originalKey === undefined) {
    delete process.env.EIA_API_KEY;
  } else {
    process.env.EIA_API_KEY = originalKey;
  }
}

test.afterEach(restoreGlobals);
test.after(restoreGlobals);

test("getEiaApiKey throws when the key is missing or blank", () => {
  const { getEiaApiKey } = loadClient();
  delete process.env.EIA_API_KEY;
  assert.throws(() => getEiaApiKey(), /EIA_API_KEY is not set/);

  process.env.EIA_API_KEY = "   ";
  assert.throws(() => getEiaApiKey(), /EIA_API_KEY is not set/);
});

test("fetchEiaSeries builds a v2 request and parses numeric rows", async () => {
  const { fetchEiaSeries } = loadClient();
  process.env.EIA_API_KEY = "test-key";
  let requestedUrl;

  global.fetch = async (url) => {
    requestedUrl = new URL(url.toString());
    return new Response(
      JSON.stringify({
        response: {
          data: [
            { period: "2026-07-31", value: 3.1 },
            { period: "2026-08-01", value: "3.25" },
          ],
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };

  const result = await fetchEiaSeries({
    route: "/natural-gas/pri/fut/data/",
    seriesId: "RNGWHHD",
    frequency: "daily",
    length: 2,
  });

  assert.equal(requestedUrl.origin, "https://api.eia.gov");
  assert.equal(requestedUrl.pathname, "/v2/natural-gas/pri/fut/data");
  assert.equal(requestedUrl.searchParams.get("api_key"), "test-key");
  assert.equal(requestedUrl.searchParams.get("frequency"), "daily");
  assert.equal(requestedUrl.searchParams.get("facets[series][]"), "RNGWHHD");
  assert.equal(requestedUrl.searchParams.get("length"), "2");
  assert.deepEqual(result.points, [
    { period: "2026-08-01", value: 3.25 },
    { period: "2026-07-31", value: 3.1 },
  ], "the newest observation is selected even if the provider response is not ordered");
  assert.equal(result.fetchedAt !== result.points[0].period, true, "retrieval timestamp stays distinct from the observation period");
});

test("fetchEiaSeries rejects non-OK responses", async () => {
  const { fetchEiaSeries } = loadClient();
  process.env.EIA_API_KEY = "test-key";
  global.fetch = async () =>
    new Response("rate limit exceeded", {
      status: 429,
      statusText: "Too Many Requests",
    });

  await assert.rejects(
    fetchEiaSeries({
      route: "natural-gas/pri/fut/data",
      seriesId: "RNGWHHD",
      frequency: "daily",
    }),
    /429 Too Many Requests.*rate limit exceeded/
  );
});

test("fetchEiaSeries rejects malformed response data", async () => {
  const { fetchEiaSeries } = loadClient();
  process.env.EIA_API_KEY = "test-key";
  global.fetch = async () =>
    new Response(
      JSON.stringify({ response: { data: [{ period: null, value: "not-a-number" }] } }),
      { status: 200, headers: { "content-type": "application/json" } }
    );

  await assert.rejects(
    fetchEiaSeries({
      route: "natural-gas/pri/fut/data",
      seriesId: "RNGWHHD",
      frequency: "daily",
    }),
    /contained no usable numeric rows/
  );
});

test("fetchEiaSeries rejects invalid JSON", async () => {
  const { fetchEiaSeries } = loadClient();
  process.env.EIA_API_KEY = "test-key";
  global.fetch = async () =>
    new Response("not-json", {
      status: 200,
      headers: { "content-type": "application/json" },
    });

  await assert.rejects(
    fetchEiaSeries({
      route: "natural-gas/pri/fut/data",
      seriesId: "RNGWHHD",
      frequency: "daily",
    }),
    /returned invalid JSON/
  );
});

test("fetchEiaTable sends grouped facets in one request and preserves row dimensions", async () => {
  const { fetchEiaTable } = loadClient();
  process.env.EIA_API_KEY = "test-key";
  let requestedUrl;
  global.fetch = async (url) => {
    requestedUrl = new URL(url.toString());
    return new Response(JSON.stringify({
      response: {
        data: [{ period: "2026-07", value: "123", "area-name": "Pennsylvania", series: "example" }]
      }
    }), { status: 200 });
  };

  const result = await fetchEiaTable({
    route: "natural-gas/prod/sum/data",
    frequency: "monthly",
    facets: { product: ["EPG0"], process: ["VGM"] },
    length: 2500
  });

  assert.equal(requestedUrl.searchParams.get("facets[product][]"), "EPG0");
  assert.equal(requestedUrl.searchParams.get("facets[process][]"), "VGM");
  assert.equal(requestedUrl.searchParams.get("length"), "2500");
  assert.equal(result.rows[0].value, 123);
  assert.equal(result.rows[0]["area-name"], "Pennsylvania");
});
