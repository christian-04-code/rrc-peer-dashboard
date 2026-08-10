const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const originalFetch = global.fetch;
const originalOilKey = process.env.OIL_PRICE_API;
const originalEiaKey = process.env.EIA_API_KEY;
test.afterEach(() => {
  global.fetch = originalFetch;
  if (originalOilKey === undefined) delete process.env.OIL_PRICE_API; else process.env.OIL_PRICE_API = originalOilKey;
  if (originalEiaKey === undefined) delete process.env.EIA_API_KEY; else process.env.EIA_API_KEY = originalEiaKey;
});

function mockProviders(oilRows) {
  global.fetch = async (url) => {
    const parsed = new URL(url.toString());
    if (parsed.hostname === "api.oilpriceapi.com") {
      return new Response(JSON.stringify({ status: "success", data: { prices: oilRows } }), { status: 200 });
    }
    return new Response(JSON.stringify({ response: { data: [
      { period: "2026-08-07", value: 65 },
      { period: "2026-08-06", value: 64 }
    ] } }), { status: 200 });
  };
}

test("current quotes are additive: all seven EIA Macro histories remain intact", async () => {
  process.env.OIL_PRICE_API = "test-key";
  process.env.EIA_API_KEY = "test-key";
  mockProviders([
    { code: "WTI_USD", price: 82.28, unit: "barrel", stale: false, synthetic: false, changes: { "24h": { amount: 5.2, percent: 6.75 } } },
    { code: "NATURAL_GAS_USD", price: 2.79, unit: "mmbtu", stale: false, synthetic: false, changes: { "24h": { amount: .13, percent: 4.89 } } }
  ]);
  const { GET } = load("app/api/market/route.ts");
  const body = await (await GET()).json();
  assert.equal(body.metrics.length, 7);
  assert.ok(body.metrics.every((metric) => metric.history.length === 2));
  assert.equal(body.currentMarket.wti.price, 82.28);
  assert.equal(body.currentMarket.henryHub.price, 2.79);
  assert.equal(body.currentMarket.wti.classification, "current-market");
  assert.equal(body.metrics.find((metric) => metric.id === "wti").classification, "delayed");
});

test("stale and synthetic current quotes are rejected without breaking EIA", async () => {
  process.env.OIL_PRICE_API = "test-key";
  process.env.EIA_API_KEY = "test-key";
  mockProviders([
    { code: "WTI_USD", price: 82.28, stale: true },
    { code: "NATURAL_GAS_USD", price: 2.79, synthetic: true }
  ]);
  const { GET } = load("app/api/market/route.ts");
  const body = await (await GET()).json();
  assert.equal(body.currentMarket.wti.price, null);
  assert.equal(body.currentMarket.henryHub.price, null);
  assert.equal(body.metrics.find((metric) => metric.id === "storage").status, "ok");
});
