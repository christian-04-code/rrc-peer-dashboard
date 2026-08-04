const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

function loadClient() {
  const filename = path.resolve(__dirname, "../lib/eia/client.ts");
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;

  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded._compile(output, filename);
  return loaded.exports;
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
            { period: "2026-08-01", value: "3.25" },
            { period: "2026-07-31", value: 3.1 },
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
  ]);
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
    /none had valid period and numeric value fields/
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
