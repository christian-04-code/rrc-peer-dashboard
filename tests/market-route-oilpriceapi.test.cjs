const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const originalFetch = global.fetch;
const originalOilKey = process.env.OIL_PRICE_API;
const originalEiaKey = process.env.EIA_API_KEY;

function restoreGlobals() {
  global.fetch = originalFetch;
  if (originalOilKey === undefined) delete process.env.OIL_PRICE_API;
  else process.env.OIL_PRICE_API = originalOilKey;
  if (originalEiaKey === undefined) delete process.env.EIA_API_KEY;
  else process.env.EIA_API_KEY = originalEiaKey;
}

test.afterEach(restoreGlobals);
test.after(restoreGlobals);

function loadRoute() {
  delete require.cache[require.resolve("../app/api/market/route.ts")];
  return load("app/api/market/route.ts");
}

function eiaRow(period, value) {
  return { period, value };
}

/** Mocks both providers by host: api.eia.gov for the 5 existing EIA fetchers, api.oilpriceapi.com for the batched current-market call. */
function mockProviders({ oilPriceApi, eiaValue = 65 } = {}) {
  global.fetch = async (url) => {
    const parsed = new URL(url.toString());
    if (parsed.hostname === "api.oilpriceapi.com") {
      if (oilPriceApi === "error") throw new Error("oilpriceapi network down");
      if (oilPriceApi === "http-error") return new Response("bad gateway", { status: 502, statusText: "Bad Gateway" });
      return new Response(JSON.stringify({ status: "success", data: { prices: oilPriceApi ?? [], missing: [] } }), { status: 200 });
    }
    // Every EIA route (natural-gas/pri/fut/data and the seriesid ones) gets a generic valid payload.
    return new Response(JSON.stringify({ response: { data: [eiaRow("2026-08-07", eiaValue)] } }), { status: 200 });
  };
}

test("both providers succeed: currentMarket has OilPriceAPI WTI/Henry Hub, metrics retain all seven EIA Macro histories", async () => {
  process.env.OIL_PRICE_API = "test-key";
  process.env.EIA_API_KEY = "test-key";
  mockProviders({
    oilPriceApi: [
      { code: "WTI_USD", price: 64.2, currency: "USD", unit: "bbl", data_status: "live", as_of: "2026-08-10T14:00:00Z", stale: false, synthetic: false, changes: { "24h": { amount: 4.82, percent: 6.25 } } },
      { code: "NATURAL_GAS_USD", price: 3.1, currency: "USD", unit: "MMBtu", data_status: "live", as_of: "2026-08-10T14:00:00Z", stale: false, synthetic: false, changes: { "24h": { amount: 0.13, percent: 4.89 } } }
    ]
  });

  const { GET } = loadRoute();
  const response = await GET();
  const body = await response.json();

  assert.equal(body.currentMarket.wti.status, "ok");
  assert.equal(body.currentMarket.wti.price, 64.2);
  assert.equal(body.currentMarket.wti.source, "OilPriceAPI");
  assert.equal(body.currentMarket.wti.classification, "current-market");
  assert.equal(body.currentMarket.wti.change24hAmount, 4.82);
  assert.equal(body.currentMarket.wti.change24hPercent, 6.25);
  assert.equal(body.currentMarket.henryHub.status, "ok");
  assert.equal(body.currentMarket.henryHub.price, 3.1);

  assert.equal(body.metrics.length, 7);
  assert.ok(body.metrics.every((metric) => Array.isArray(metric.history) && metric.history.length > 0));
  const eiaWti = body.metrics.find((m) => m.id === "wti");
  assert.equal(eiaWti.value, 65);
  assert.equal(eiaWti.classification, "delayed");
  assert.match(eiaWti.source, /U\.S\. EIA/);
});

test("stale=true is rejected from current-market classification; EIA is untouched", async () => {
  process.env.OIL_PRICE_API = "test-key";
  process.env.EIA_API_KEY = "test-key";
  mockProviders({
    oilPriceApi: [
      { code: "WTI_USD", price: 64.2, stale: true },
      { code: "NATURAL_GAS_USD", price: 3.1, stale: false }
    ]
  });

  const { GET } = loadRoute();
  const body = await (await GET()).json();

  assert.equal(body.currentMarket.wti.status, "unavailable");
  assert.equal(body.currentMarket.wti.price, null);
  assert.match(body.currentMarket.wti.error, /stale/i);
  assert.equal(body.currentMarket.henryHub.status, "ok");
  assert.equal(body.metrics.find((m) => m.id === "wti").classification, "delayed");
});

test("synthetic=true is rejected from current-market classification", async () => {
  process.env.OIL_PRICE_API = "test-key";
  process.env.EIA_API_KEY = "test-key";
  mockProviders({
    oilPriceApi: [
      { code: "WTI_USD", price: 64.2, synthetic: false },
      { code: "NATURAL_GAS_USD", price: 3.1, synthetic: true }
    ]
  });

  const { GET } = loadRoute();
  const body = await (await GET()).json();

  assert.equal(body.currentMarket.henryHub.status, "unavailable");
  assert.equal(body.currentMarket.henryHub.price, null);
  assert.match(body.currentMarket.henryHub.error, /synthetic/i);
  assert.equal(body.currentMarket.wti.status, "ok");
});

test("one commodity missing from the OilPriceAPI batch does not affect the other", async () => {
  process.env.OIL_PRICE_API = "test-key";
  process.env.EIA_API_KEY = "test-key";
  mockProviders({ oilPriceApi: [{ code: "WTI_USD", price: 64.2 }] }); // NATURAL_GAS_USD omitted

  const { GET } = loadRoute();
  const body = await (await GET()).json();

  assert.equal(body.currentMarket.wti.status, "ok");
  assert.equal(body.currentMarket.henryHub.status, "unavailable");
  assert.equal(body.currentMarket.henryHub.price, null);
  assert.notEqual(body.currentMarket.henryHub.price, 0);
});

test("OilPriceAPI total failure (network error) does not break /api/market -- EIA metrics still resolve, currentMarket falls back to unavailable with error metadata, never a fabricated 0", async () => {
  process.env.OIL_PRICE_API = "test-key";
  process.env.EIA_API_KEY = "test-key";
  mockProviders({ oilPriceApi: "error" });

  const { GET } = loadRoute();
  const response = await GET();
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.currentMarket.wti.status, "unavailable");
  assert.equal(body.currentMarket.wti.price, null);
  assert.match(body.currentMarket.wti.error, /network down/);
  assert.equal(body.currentMarket.henryHub.status, "unavailable");
  assert.equal(body.metrics.length, 7);
  assert.equal(body.metrics.find((m) => m.id === "wti").status, "ok");
  assert.equal(body.metrics.find((m) => m.id === "wti").value, 65);
});

test("OilPriceAPI upstream HTTP error also falls back cleanly without breaking EIA", async () => {
  process.env.OIL_PRICE_API = "test-key";
  process.env.EIA_API_KEY = "test-key";
  mockProviders({ oilPriceApi: "http-error" });

  const { GET } = loadRoute();
  const body = await (await GET()).json();

  assert.equal(body.currentMarket.wti.status, "unavailable");
  assert.match(body.currentMarket.wti.error, /502 Bad Gateway/);
  assert.equal(body.metrics.find((m) => m.id === "brent").status, "ok");
});

test("Brent is untouched -- EIA only, never present in currentMarket", async () => {
  process.env.OIL_PRICE_API = "test-key";
  process.env.EIA_API_KEY = "test-key";
  mockProviders({
    oilPriceApi: [
      { code: "WTI_USD", price: 64.2 },
      { code: "NATURAL_GAS_USD", price: 3.1 }
    ]
  });

  const { GET } = loadRoute();
  const body = await (await GET()).json();

  assert.ok(!("brent" in body.currentMarket));
  const brent = body.metrics.find((m) => m.id === "brent");
  assert.ok(brent);
  assert.equal(brent.classification, "delayed");
  assert.match(brent.source, /U\.S\. EIA/);
});

test("route is force-dynamic (unchanged) and still gives ~900s CDN caching for the combined response", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const source = fs.readFileSync(path.join(process.cwd(), "app", "api", "market", "route.ts"), "utf8");
  assert.match(source, /export const dynamic = "force-dynamic";/);
  assert.match(source, /s-maxage=900/);
});
