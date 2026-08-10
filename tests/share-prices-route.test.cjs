const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./helpers/ts-loader.cjs");

const originalFetch = global.fetch;
const originalKey = process.env.FINNHUB_API_KEY;

function restoreGlobals() {
  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.FINNHUB_API_KEY;
  else process.env.FINNHUB_API_KEY = originalKey;
}

test.afterEach(restoreGlobals);
test.after(restoreGlobals);

function loadRoute() {
  delete require.cache[require.resolve("../app/api/share-prices/route.ts")];
  return load("app/api/share-prices/route.ts");
}

test("all 7 tickers succeed: full normalized shape, Finnhub source, current-market classification", async () => {
  process.env.FINNHUB_API_KEY = "test-key";
  global.fetch = async (url) => {
    const symbol = new URL(url.toString()).searchParams.get("symbol");
    return new Response(JSON.stringify({ c: 40, t: 1786384706, symbol }), { status: 200 });
  };

  const { GET } = loadRoute();
  const response = await GET();
  const body = await response.json();

  for (const ticker of ["RRC", "AR", "CNX", "CRK", "EQT", "EXE", "GPOR"]) {
    assert.equal(body.equities[ticker].status, "ok");
    assert.equal(body.equities[ticker].price, 40);
    assert.equal(body.equities[ticker].source, "Finnhub");
    assert.equal(body.equities[ticker].classification, "current-market");
    assert.equal(body.equities[ticker].timestamp, 1786384706);
  }
});

test("one ticker failing (network error) does not zero out or block the others (partial success, per-ticker fault isolation)", async () => {
  process.env.FINNHUB_API_KEY = "test-key";
  global.fetch = async (url) => {
    const symbol = new URL(url.toString()).searchParams.get("symbol");
    if (symbol === "GPOR") throw new Error("network down");
    return new Response(JSON.stringify({ c: 25, t: 1786384706 }), { status: 200 });
  };

  const { GET } = loadRoute();
  const response = await GET();
  const body = await response.json();

  assert.equal(body.equities.GPOR.status, "unavailable");
  assert.equal(body.equities.GPOR.price, null);
  assert.match(body.equities.GPOR.error, /network down/);
  assert.equal(body.equities.RRC.status, "ok");
  assert.equal(body.equities.RRC.price, 25);
});

test("a c: 0 (no-data) response for one ticker is unavailable, never a fabricated $0, and doesn't affect siblings", async () => {
  process.env.FINNHUB_API_KEY = "test-key";
  global.fetch = async (url) => {
    const symbol = new URL(url.toString()).searchParams.get("symbol");
    if (symbol === "EXE") return new Response(JSON.stringify({ c: 0, t: 0 }), { status: 200 });
    return new Response(JSON.stringify({ c: 15, t: 1786384706 }), { status: 200 });
  };

  const { GET } = loadRoute();
  const response = await GET();
  const body = await response.json();

  assert.equal(body.equities.EXE.status, "unavailable");
  assert.equal(body.equities.EXE.price, null);
  assert.notEqual(body.equities.EXE.price, 0);
  assert.equal(body.equities.CRK.status, "ok");
});

test("route is force-dynamic with a ~60s Cache-Control window", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app", "api", "share-prices", "route.ts"), "utf8");
  assert.match(source, /export const dynamic = "force-dynamic";/);
  assert.match(source, /s-maxage=60/);
});

test("route calls the Finnhub client, not the FMP client, for equities", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app", "api", "share-prices", "route.ts"), "utf8");
  assert.match(source, /from "@\/lib\/finnhub\/client"/);
  assert.doesNotMatch(source, /lib\/fmp\/client/);
});
