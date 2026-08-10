const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

function loadClient() {
  const filename = path.resolve(__dirname, "../lib/oilpriceapi/client.ts");
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename
  }).outputText;

  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded._compile(output, filename);
  return loaded.exports;
}

const originalFetch = global.fetch;
const originalKey = process.env.OIL_PRICE_API;

function restoreGlobals() {
  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.OIL_PRICE_API;
  else process.env.OIL_PRICE_API = originalKey;
}

test.afterEach(restoreGlobals);
test.after(restoreGlobals);

function batchResponse(prices, missing) {
  return new Response(JSON.stringify({ status: "success", data: { prices, missing: missing ?? [] } }), { status: 200 });
}

test("getOilPriceApiKey throws when OIL_PRICE_API is missing or blank", () => {
  const { getOilPriceApiKey } = loadClient();
  delete process.env.OIL_PRICE_API;
  assert.throws(() => getOilPriceApiKey(), /OIL_PRICE_API is not set/);
  process.env.OIL_PRICE_API = "   ";
  assert.throws(() => getOilPriceApiKey(), /OIL_PRICE_API is not set/);
});

test("fetchOilPriceApiQuotes makes exactly one batched request with by_code=A,B and a Token auth header", async () => {
  const { fetchOilPriceApiQuotes } = loadClient();
  process.env.OIL_PRICE_API = "test-key";
  let requestCount = 0;
  let requestedUrl;
  let requestedHeaders;

  global.fetch = async (url, init) => {
    requestCount += 1;
    requestedUrl = new URL(url.toString());
    requestedHeaders = init?.headers;
    return batchResponse([
      { code: "WTI_USD", price: 64.2, currency: "USD", unit: "bbl", data_status: "live", as_of: "2026-08-10T14:00:00Z", stale: false, synthetic: false, change_24h_amount: -0.5, change_24h_percent: -0.77 },
      { code: "NATURAL_GAS_USD", price: 3.1, currency: "USD", unit: "MMBtu", data_status: "live", as_of: "2026-08-10T14:00:00Z", stale: false, synthetic: false, change_24h_amount: 0.02, change_24h_percent: 0.65 }
    ]);
  };

  const result = await fetchOilPriceApiQuotes(["WTI_USD", "NATURAL_GAS_USD"]);
  assert.equal(requestCount, 1, "must be exactly one upstream request for both codes combined");
  assert.equal(requestedUrl.origin, "https://api.oilpriceapi.com");
  assert.equal(requestedUrl.pathname, "/v1/prices/latest");
  assert.equal(requestedUrl.searchParams.get("by_code"), "WTI_USD,NATURAL_GAS_USD");
  assert.equal(requestedHeaders.Authorization, "Token test-key");

  assert.equal(result.quotesByCode.get("WTI_USD").price, 64.2);
  assert.equal(result.quotesByCode.get("NATURAL_GAS_USD").price, 3.1);
});

test("results are matched by code, not array position (batch response order is not assumed)", async () => {
  const { fetchOilPriceApiQuotes } = loadClient();
  process.env.OIL_PRICE_API = "test-key";
  global.fetch = async () =>
    batchResponse([
      { code: "NATURAL_GAS_USD", price: 3.1 }, // gas listed first this time
      { code: "WTI_USD", price: 64.2 }
    ]);

  const result = await fetchOilPriceApiQuotes(["WTI_USD", "NATURAL_GAS_USD"]);
  assert.equal(result.quotesByCode.get("WTI_USD").price, 64.2);
  assert.equal(result.quotesByCode.get("NATURAL_GAS_USD").price, 3.1);
});

test("24h change is mapped from a nested change_24h: {amount, percent} shape", async () => {
  const { fetchOilPriceApiQuotes } = loadClient();
  process.env.OIL_PRICE_API = "test-key";
  global.fetch = async () => batchResponse([{ code: "WTI_USD", price: 64.2, change_24h: { amount: -0.5, percent: -0.77 } }]);

  const result = await fetchOilPriceApiQuotes(["WTI_USD"]);
  const quote = result.quotesByCode.get("WTI_USD");
  assert.equal(quote.change24hAmount, -0.5);
  assert.equal(quote.change24hPercent, -0.77);
});

test("24h change is mapped from a flat change_24h_amount/change_24h_percent shape", async () => {
  const { fetchOilPriceApiQuotes } = loadClient();
  process.env.OIL_PRICE_API = "test-key";
  global.fetch = async () => batchResponse([{ code: "NATURAL_GAS_USD", price: 3.1, change_24h_amount: 0.02, change_24h_percent: 0.65 }]);

  const result = await fetchOilPriceApiQuotes(["NATURAL_GAS_USD"]);
  const quote = result.quotesByCode.get("NATURAL_GAS_USD");
  assert.equal(quote.change24hAmount, 0.02);
  assert.equal(quote.change24hPercent, 0.65);
});

test("stale and synthetic flags are preserved as-is by the client (rejection is the route's job, not the client's)", async () => {
  const { fetchOilPriceApiQuotes } = loadClient();
  process.env.OIL_PRICE_API = "test-key";
  global.fetch = async () =>
    batchResponse([
      { code: "WTI_USD", price: 64.2, stale: true, synthetic: false },
      { code: "NATURAL_GAS_USD", price: 3.1, stale: false, synthetic: true }
    ]);

  const result = await fetchOilPriceApiQuotes(["WTI_USD", "NATURAL_GAS_USD"]);
  assert.equal(result.quotesByCode.get("WTI_USD").stale, true);
  assert.equal(result.quotesByCode.get("NATURAL_GAS_USD").synthetic, true);
});

test("a code absent from data.prices is reported missing, not fabricated with a 0 price", async () => {
  const { fetchOilPriceApiQuotes } = loadClient();
  process.env.OIL_PRICE_API = "test-key";
  global.fetch = async () => batchResponse([{ code: "WTI_USD", price: 64.2 }], ["NATURAL_GAS_USD"]);

  const result = await fetchOilPriceApiQuotes(["WTI_USD", "NATURAL_GAS_USD"]);
  assert.equal(result.quotesByCode.has("NATURAL_GAS_USD"), false);
  assert.deepEqual(result.missingCodes, ["NATURAL_GAS_USD"]);
});

test("a code absent from data.prices with no data.missing entry is still treated as missing (not silently dropped)", async () => {
  const { fetchOilPriceApiQuotes } = loadClient();
  process.env.OIL_PRICE_API = "test-key";
  global.fetch = async () => batchResponse([{ code: "WTI_USD", price: 64.2 }]); // missing: []

  const result = await fetchOilPriceApiQuotes(["WTI_USD", "NATURAL_GAS_USD"]);
  assert.deepEqual(result.missingCodes, ["NATURAL_GAS_USD"]);
});

test("a non-numeric price normalizes to price: null, never a fabricated 0", async () => {
  const { fetchOilPriceApiQuotes } = loadClient();
  process.env.OIL_PRICE_API = "test-key";
  global.fetch = async () => batchResponse([{ code: "WTI_USD", price: "n/a" }]);

  const result = await fetchOilPriceApiQuotes(["WTI_USD"]);
  assert.equal(result.quotesByCode.get("WTI_USD").price, null);
  assert.notEqual(result.quotesByCode.get("WTI_USD").price, 0);
});

test("a non-success status throws rather than returning an empty/fabricated result", async () => {
  const { fetchOilPriceApiQuotes } = loadClient();
  process.env.OIL_PRICE_API = "test-key";
  global.fetch = async () => new Response(JSON.stringify({ status: "error", message: "invalid code" }), { status: 200 });

  await assert.rejects(fetchOilPriceApiQuotes(["WTI_USD"]), /non-success status/);
});

test("a non-OK HTTP response is rejected rather than treated as empty", async () => {
  const { fetchOilPriceApiQuotes } = loadClient();
  process.env.OIL_PRICE_API = "test-key";
  global.fetch = async () => new Response("rate limited", { status: 429, statusText: "Too Many Requests" });

  await assert.rejects(fetchOilPriceApiQuotes(["WTI_USD"]), /429 Too Many Requests/);
});

test("the fetch call uses Next's 60-minute revalidate cache primitive, not a per-request no-store call", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../lib/oilpriceapi/client.ts"), "utf8");
  assert.match(source, /revalidate: REVALIDATE_SECONDS/);
  assert.match(source, /REVALIDATE_SECONDS = 60 \* 60/);
});

test("OIL_PRICE_API is read from process.env only, never NEXT_PUBLIC_-prefixed, and lib/oilpriceapi/client.ts is never imported by a \"use client\" component", () => {
  const clientSource = fs.readFileSync(path.resolve(__dirname, "../lib/oilpriceapi/client.ts"), "utf8");
  assert.match(clientSource, /process\.env\.OIL_PRICE_API/);
  assert.doesNotMatch(clientSource, /NEXT_PUBLIC/);

  const componentsDir = path.resolve(__dirname, "../components");
  const offenders = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
        const source = fs.readFileSync(full, "utf8");
        if (/"use client"/.test(source) && /lib\/oilpriceapi\/client/.test(source)) offenders.push(full);
      }
    }
  })(componentsDir);
  assert.deepEqual(offenders, [], "no client component may import the server-only OilPriceAPI client directly");
});
