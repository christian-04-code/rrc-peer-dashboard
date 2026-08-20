const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./helpers/ts-loader.cjs");

/**
 * Regression coverage for the Macro-tab timeout regression: a global 8s
 * default in lib/eia/client.ts was silently applied to every fetchEiaTable()
 * call, including the three heavy macro table endpoints (regional storage,
 * state production, demand), causing them to reject in production while
 * lighter /api/market series kept working. The fix makes timeout ownership
 * explicit at each macro call site instead of inheriting one global cutoff.
 */

const originalFetch = global.fetch;
const originalTimeout = AbortSignal.timeout;
const originalEiaKey = process.env.EIA_API_KEY;

function restoreGlobals() {
  global.fetch = originalFetch;
  AbortSignal.timeout = originalTimeout;
  if (originalEiaKey === undefined) delete process.env.EIA_API_KEY;
  else process.env.EIA_API_KEY = originalEiaKey;
}

test.afterEach(restoreGlobals);
test.after(restoreGlobals);

function eiaOkBody(value = 950) {
  return JSON.stringify({ response: { data: [{ period: "2026-08-07", value, series: "NG.NW2_EPG0_SWO_R31_BCF.W" }] } });
}

/** Intercepts the ms argument AbortSignal.timeout() is actually called with, without changing its real abort behavior. */
function captureTimeoutMs() {
  let capturedMs;
  AbortSignal.timeout = (ms) => {
    capturedMs = ms;
    return originalTimeout(ms);
  };
  return () => capturedMs;
}

test("fetchRegionalStorageTable uses an explicit 25s production timeout, not the old implicit 8s default", async () => {
  process.env.EIA_API_KEY = "test-key";
  global.fetch = async () => new Response(eiaOkBody(), { status: 200 });
  const getMs = captureTimeoutMs();
  const { fetchRegionalStorageTable } = load("lib/eia/macro-fundamentals.ts");

  await fetchRegionalStorageTable();
  assert.equal(getMs(), 25_000);
});

test("fetchStateMarketedProductionTable uses an explicit 25s production timeout, not the old implicit 8s default", async () => {
  process.env.EIA_API_KEY = "test-key";
  global.fetch = async () => new Response(eiaOkBody(), { status: 200 });
  const getMs = captureTimeoutMs();
  const { fetchStateMarketedProductionTable } = load("lib/eia/macro-fundamentals.ts");

  await fetchStateMarketedProductionTable();
  assert.equal(getMs(), 25_000);
});

test("fetchDemandTable uses an explicit 20s production timeout, not the old implicit 8s default", async () => {
  process.env.EIA_API_KEY = "test-key";
  global.fetch = async () => new Response(eiaOkBody(), { status: 200 });
  const getMs = captureTimeoutMs();
  const { fetchDemandTable } = load("lib/eia/macro-fundamentals.ts");

  await fetchDemandTable();
  assert.equal(getMs(), 20_000);
});

test("fetchEiaTable falls back to a bounded, non-8s generic timeout when a caller omits timeoutMs entirely", async () => {
  process.env.EIA_API_KEY = "test-key";
  global.fetch = async () => new Response(eiaOkBody(), { status: 200 });
  const getMs = captureTimeoutMs();
  const { fetchEiaTable } = load("lib/eia/client.ts");

  await fetchEiaTable({ route: "natural-gas/stor/wkly/data", frequency: "weekly", length: 10 });
  const ms = getMs();
  assert.ok(Number.isFinite(ms) && ms > 0, "the fallback must still be bounded, not infinite");
  assert.notEqual(ms, 8_000, "must not silently fall back to the old 8s global default");
  assert.ok(ms >= 20_000, `expected a safer generic fallback (>=20s) than the old 8s cutoff, got ${ms}`);
});

test("regression guard: lib/eia/client.ts no longer applies an implicit 8000ms default to table requests", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "lib", "eia", "client.ts"), "utf8");
  assert.doesNotMatch(
    source,
    /timeoutMs\s*\?\?\s*8_?000\b/,
    "the global 8-second default that caused the Macro-tab regression must not be reintroduced"
  );
});

test("regression guard: the macro table call sites each set their own explicit timeoutMs instead of relying on a shared default", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "lib", "eia", "macro-fundamentals.ts"), "utf8");
  const functionBody = (name) => {
    const match = source.match(new RegExp(`function ${name}\\([^)]*\\)\\s*\\{([\\s\\S]*?)\\n\\}`));
    assert.ok(match, `expected to find ${name} in lib/eia/macro-fundamentals.ts`);
    return match[1];
  };

  assert.match(functionBody("fetchRegionalStorageTable"), /timeoutMs\s*:\s*(25_?000|REGIONAL_STORAGE_TIMEOUT_MS)\b/);
  assert.match(functionBody("fetchStateMarketedProductionTable"), /timeoutMs\s*:\s*(25_?000|STATE_PRODUCTION_TIMEOUT_MS)\b/);
  assert.match(functionBody("fetchDemandTable"), /timeoutMs\s*:\s*(20_?000|DEMAND_TIMEOUT_MS)\b/);
});
