const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./helpers/ts-loader.cjs");

const originalFetch = global.fetch;
const originalKey = process.env.FMP_KEY;

function restoreGlobals() {
  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.FMP_KEY;
  else process.env.FMP_KEY = originalKey;
}

test.afterEach(restoreGlobals);
test.after(restoreGlobals);

function loadRoute() {
  // Fresh module instance per test so different global.fetch mocks don't leak
  // cached state across tests (ts-loader.cjs caches by absolute path).
  delete require.cache[require.resolve("../app/api/quotes/route.ts")];
  return load("app/api/quotes/route.ts");
}

test("both commodity and equity batches succeed: full normalized shape, FMP source, current-market classification", async () => {
  process.env.FMP_KEY = "test-key";
  global.fetch = async (url) => {
    const parsed = new URL(url.toString());
    const symbols = parsed.searchParams.get("symbol");
    if (symbols === "NGUSD,CLUSD") {
      return new Response(JSON.stringify([{ symbol: "NGUSD", price: 3.2 }, { symbol: "CLUSD", price: 64.1 }]), { status: 200 });
    }
    return new Response(
      JSON.stringify(["RRC", "AR", "CNX", "CRK", "EQT", "EXE", "GPOR"].map((s, i) => ({ symbol: s, price: 10 + i }))),
      { status: 200 }
    );
  };

  const { GET } = loadRoute();
  const response = await GET();
  const body = await response.json();

  assert.equal(body.commodities.henryHub.value, 3.2);
  assert.equal(body.commodities.henryHub.symbol, "NGUSD");
  assert.equal(body.commodities.henryHub.source, "FMP");
  assert.equal(body.commodities.henryHub.classification, "current-market");
  assert.equal(body.commodities.henryHub.status, "ok");
  assert.equal(body.commodities.wti.value, 64.1);
  assert.equal(body.commodities.wti.symbol, "CLUSD");

  for (const ticker of ["RRC", "AR", "CNX", "CRK", "EQT", "EXE", "GPOR"]) {
    assert.equal(body.equities[ticker].status, "ok");
    assert.equal(typeof body.equities[ticker].price, "number");
    assert.equal(body.equities[ticker].source, "FMP");
    assert.equal(body.equities[ticker].classification, "current-market");
  }
});

test("commodity batch failing does not zero out or block the equities batch (partial success)", async () => {
  process.env.FMP_KEY = "test-key";
  global.fetch = async (url) => {
    const parsed = new URL(url.toString());
    if (parsed.searchParams.get("symbol") === "NGUSD,CLUSD") {
      return new Response("service unavailable", { status: 503, statusText: "Service Unavailable" });
    }
    return new Response(JSON.stringify([{ symbol: "RRC", price: 42 }]), { status: 200 });
  };

  const { GET } = loadRoute();
  const response = await GET();
  const body = await response.json();

  assert.equal(body.commodities.henryHub.status, "unavailable");
  assert.equal(body.commodities.henryHub.value, null);
  assert.equal(body.commodities.wti.status, "unavailable");
  assert.equal(body.commodities.wti.value, null);
  assert.equal(body.equities.RRC.status, "ok");
  assert.equal(body.equities.RRC.price, 42);
});

test("a single missing equity ticker in the FMP response is unavailable without affecting the others (no fabricated zero)", async () => {
  process.env.FMP_KEY = "test-key";
  global.fetch = async (url) => {
    const parsed = new URL(url.toString());
    if (parsed.searchParams.get("symbol") === "NGUSD,CLUSD") {
      return new Response(JSON.stringify([{ symbol: "NGUSD", price: 3 }, { symbol: "CLUSD", price: 60 }]), { status: 200 });
    }
    // GPOR intentionally omitted from the provider response
    return new Response(
      JSON.stringify(["RRC", "AR", "CNX", "CRK", "EQT", "EXE"].map((s, i) => ({ symbol: s, price: 10 + i }))),
      { status: 200 }
    );
  };

  const { GET } = loadRoute();
  const response = await GET();
  const body = await response.json();

  assert.equal(body.equities.GPOR.status, "unavailable");
  assert.equal(body.equities.GPOR.price, null);
  assert.notEqual(body.equities.GPOR.price, 0);
  assert.equal(body.equities.RRC.status, "ok");
  assert.equal(body.equities.AR.status, "ok");
});

test("route is force-dynamic with a ~60s Cache-Control window", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app", "api", "quotes", "route.ts"), "utf8");
  assert.match(source, /export const dynamic = "force-dynamic";/);
  assert.match(source, /s-maxage=60/);
});

test("total provider failure on both legs yields all-unavailable, never zeros, and the route still responds 200 with useful error metadata", async () => {
  process.env.FMP_KEY = "test-key";
  global.fetch = async () => {
    throw new Error("network down");
  };

  const { GET } = loadRoute();
  const response = await GET();
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.commodities.henryHub.status, "unavailable");
  assert.match(body.commodities.henryHub.error, /network down/);
  for (const ticker of ["RRC", "AR", "CNX", "CRK", "EQT", "EXE", "GPOR"]) {
    assert.equal(body.equities[ticker].status, "unavailable");
    assert.equal(body.equities[ticker].price, null);
  }
});
