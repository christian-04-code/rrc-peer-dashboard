const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const originalFetch = global.fetch;
const originalEiaKey = process.env.EIA_API_KEY;

function restoreGlobals() {
  global.fetch = originalFetch;
  if (originalEiaKey === undefined) delete process.env.EIA_API_KEY;
  else process.env.EIA_API_KEY = originalEiaKey;
}

test.afterEach(restoreGlobals);
test.after(restoreGlobals);

function loadRoute() {
  delete require.cache[require.resolve("../app/api/macro/route.ts")];
  return load("app/api/macro/route.ts");
}

function loadClient() {
  delete require.cache[require.resolve("../lib/eia/client.ts")];
  return load("lib/eia/client.ts");
}

function eiaOkBody(value = 950) {
  return JSON.stringify({ response: { data: [{ period: "2026-08-07", value, series: "NG.NW2_EPG0_SWO_R31_BCF.W" }] } });
}

/**
 * A faithful mock must honor `init.signal` the way real fetch/undici does when
 * AbortSignal.timeout() fires against a genuinely stalled connection -- reject
 * with an abort error. A mock that ignores the signal would only prove the mock
 * resolves eventually, not that our code actually bounds the wait.
 */
function hangingFetch() {
  return (url, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () =>
        reject(new DOMException("The operation was aborted due to timeout", "TimeoutError"))
      );
    });
}

test("SCENARIO D (timeout): a stalled EIA connection is bounded by a request timeout instead of hanging the invocation forever", async () => {
  process.env.EIA_API_KEY = "test-key";
  global.fetch = hangingFetch();
  const { fetchEiaTable } = loadClient();

  const start = Date.now();
  await assert.rejects(
    () => fetchEiaTable({ route: "natural-gas/stor/wkly/data", frequency: "weekly", length: 10, timeoutMs: 50 }),
    /EIA table request failed for route/
  );
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 2000, `expected the timeout to bound the wait to roughly timeoutMs, took ${elapsed}ms`);
});

test("SCENARIO D recovery: after a bounded timeout rejects, a fresh call against a healthy EIA succeeds normally (no persisted failure state)", async () => {
  process.env.EIA_API_KEY = "test-key";
  global.fetch = hangingFetch();
  const { fetchEiaTable } = loadClient();
  await assert.rejects(() => fetchEiaTable({ route: "natural-gas/stor/wkly/data", frequency: "weekly", length: 10, timeoutMs: 50 }));

  global.fetch = async () => new Response(eiaOkBody(), { status: 200 });
  const result = await fetchEiaTable({ route: "natural-gas/stor/wkly/data", frequency: "weekly", length: 10, timeoutMs: 50 });
  assert.equal(result.rows[0].value, 950);
});

test("SCENARIO B (429 -> recovery): a rate-limited request degrades honestly, and the very next invocation against a healthy EIA recovers automatically with no leftover failure state", async () => {
  process.env.EIA_API_KEY = "test-key";
  global.fetch = async () => new Response(JSON.stringify({ error: { code: "OVER_RATE_LIMIT" } }), { status: 429 });
  const first = await (await loadRoute().GET()).json();
  assert.equal(first.storage.status, "unavailable");
  assert.match(first.storage.error, /429/);

  global.fetch = async () => new Response(eiaOkBody(), { status: 200 });
  const second = await (await loadRoute().GET()).json();
  assert.equal(second.storage.status, "ok");
  assert.equal(second.storage.regions.east.current, 950);
});

test("SCENARIO C (5xx -> recovery): a transient upstream server error degrades honestly, and recovers automatically once EIA is healthy again", async () => {
  process.env.EIA_API_KEY = "test-key";
  global.fetch = async () => new Response("Service Unavailable", { status: 503 });
  const first = await (await loadRoute().GET()).json();
  assert.equal(first.production.status, "unavailable");
  assert.match(first.production.error, /503/);

  global.fetch = async () => new Response(eiaOkBody(), { status: 200 });
  const second = await (await loadRoute().GET()).json();
  assert.equal(second.production.status, "ok");
});

test("SCENARIO A/C isolation: one dataset failing (429 or 5xx) never blocks or corrupts the other two -- Promise.allSettled per-key isolation holds regardless of failure type", async () => {
  process.env.EIA_API_KEY = "test-key";
  global.fetch = async (url) => {
    const parsed = new URL(url.toString());
    if (parsed.pathname.includes("stor/wkly")) return new Response("nope", { status: 429 });
    if (parsed.pathname.includes("prod/sum")) return new Response("nope", { status: 503 });
    return new Response(eiaOkBody(), { status: 200 }); // demand stays healthy
  };
  const body = await (await loadRoute().GET()).json();
  assert.equal(body.storage.status, "unavailable");
  assert.equal(body.production.status, "unavailable");
  assert.equal(body.demand.status, "ok", "a healthy dataset must still populate even while two siblings are failing");
});

test("SCENARIO F (concurrent requests): simultaneous invocations are isolated from each other -- one failing does not corrupt or block a concurrent healthy one", async () => {
  process.env.EIA_API_KEY = "test-key";
  let call = 0;
  global.fetch = async () => {
    call += 1;
    // Odd-numbered calls across the whole process fail; even succeed -- simulates
    // an upstream that is intermittently unhealthy across truly concurrent requests.
    if (call % 2 === 1) return new Response(JSON.stringify({ error: { code: "OVER_RATE_LIMIT" } }), { status: 429 });
    return new Response(eiaOkBody(), { status: 200 });
  };

  const results = await Promise.all(Array.from({ length: 4 }, () => loadRoute().GET().then((r) => r.json())));
  for (const body of results) {
    assert.ok(body.storage.status === "ok" || body.storage.status === "unavailable");
    assert.notEqual(body.storage.regions.east.current, 0, "an unavailable region must never be silently reported as a fabricated 0");
  }
  assert.ok(
    results.some((body) => body.storage.status === "ok"),
    "at least one concurrent invocation should reflect the healthy responses actually returned"
  );
});

test("SCENARIO E (stale-good-data): a healthy response is cached long enough to ride out a brief upstream blip, and a degraded response is cached only briefly so recovery is fast, not architecture-free zero-caching", async () => {
  process.env.EIA_API_KEY = "test-key";
  global.fetch = async () => new Response(eiaOkBody(), { status: 200 });
  const healthy = await loadRoute().GET();
  assert.equal(healthy.headers.get("Cache-Control"), "public, s-maxage=3600, stale-while-revalidate=21600");

  global.fetch = async () => new Response(JSON.stringify({ error: { code: "OVER_RATE_LIMIT" } }), { status: 429 });
  const degraded = await loadRoute().GET();
  assert.equal(degraded.headers.get("Cache-Control"), "public, s-maxage=30, stale-while-revalidate=60");
});
