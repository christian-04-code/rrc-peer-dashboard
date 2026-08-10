const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const originalFetch = global.fetch;
const originalKey = process.env.OIL_PRICE_API;
test.afterEach(() => {
  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.OIL_PRICE_API;
  else process.env.OIL_PRICE_API = originalKey;
});

test("OilPriceAPI uses one cached batch request and maps confirmed 24h fields by code", async () => {
  process.env.OIL_PRICE_API = "test-key";
  let count = 0;
  let requested;
  global.fetch = async (url, init) => {
    count += 1;
    requested = { url: new URL(url.toString()), init };
    return new Response(JSON.stringify({ status: "success", data: { prices: [
      { code: "NATURAL_GAS_USD", price: 3.1, changes: { "24h": { amount: .13, percent: 4.89 } } },
      { code: "WTI_USD", price: 64.2, changes: { "24h": { amount: 4.82, percent: 6.25 } } }
    ] } }), { status: 200 });
  };
  const { fetchOilPriceApiQuotes } = load("lib/oilpriceapi/client.ts");
  const result = await fetchOilPriceApiQuotes(["WTI_USD", "NATURAL_GAS_USD"]);
  assert.equal(count, 1);
  assert.equal(requested.url.searchParams.get("by_code"), "WTI_USD,NATURAL_GAS_USD");
  assert.equal(requested.init.headers.Authorization, "Token test-key");
  assert.equal(requested.init.next.revalidate, 3600);
  assert.equal(result.quotesByCode.get("WTI_USD").price, 64.2);
  assert.equal(result.quotesByCode.get("WTI_USD").change24hPercent, 6.25);
  assert.equal(result.quotesByCode.get("NATURAL_GAS_USD").change24hAmount, .13);
});

test("missing or nonnumeric OilPriceAPI observations remain null/unavailable, never zero", async () => {
  process.env.OIL_PRICE_API = "test-key";
  global.fetch = async () => new Response(JSON.stringify({ status: "success", data: { prices: [{ code: "WTI_USD", price: "n/a" }] } }), { status: 200 });
  const { fetchOilPriceApiQuotes } = load("lib/oilpriceapi/client.ts");
  const result = await fetchOilPriceApiQuotes(["WTI_USD", "NATURAL_GAS_USD"]);
  assert.equal(result.quotesByCode.get("WTI_USD").price, null);
  assert.deepEqual(result.missingCodes, ["NATURAL_GAS_USD"]);
});

test("OilPriceAPI secret stays server-side", () => {
  const fs = require("node:fs");
  const source = fs.readFileSync("lib/oilpriceapi/client.ts", "utf8");
  assert.match(source, /process\.env\.OIL_PRICE_API/);
  assert.doesNotMatch(source, /NEXT_PUBLIC/);
});
