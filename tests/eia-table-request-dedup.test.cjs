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

function loadClient() {
  return load("lib/eia/client.ts");
}

function eiaOkBody(value = 950) {
  return JSON.stringify({ response: { data: [{ period: "2026-08-07", value }] } });
}

test("identical concurrent fetchEiaTable() calls share one underlying fetch, and every caller receives the same successful result", async () => {
  process.env.EIA_API_KEY = "test-key";
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    await new Promise((resolve) => setTimeout(resolve, 10));
    return new Response(eiaOkBody(777), { status: 200 });
  };
  const { fetchEiaTable } = loadClient();

  const params = { route: "natural-gas/stor/wkly/data", frequency: "weekly", length: 10 };
  const [a, b, c] = await Promise.all([fetchEiaTable(params), fetchEiaTable(params), fetchEiaTable(params)]);

  assert.equal(fetchCalls, 1, "three identical concurrent requests must issue exactly one upstream fetch");
  assert.equal(a.rows[0].value, 777);
  assert.deepEqual(a, b);
  assert.deepEqual(b, c);
});

test("a rejected shared in-flight request clears its entry -- it does not permanently poison future requests", async () => {
  process.env.EIA_API_KEY = "test-key";
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify({ error: { code: "OVER_RATE_LIMIT" } }), { status: 429 });
  };
  const { fetchEiaTable } = loadClient();
  const params = { route: "natural-gas/stor/wkly/data", frequency: "weekly", length: 10 };

  const results = await Promise.allSettled([fetchEiaTable(params), fetchEiaTable(params)]);
  assert.equal(fetchCalls, 1, "concurrent identical requests still coalesce even when the shared result is a rejection");
  assert.equal(results[0].status, "rejected");
  assert.equal(results[1].status, "rejected");
  assert.match(results[0].reason.message, /429/);
  assert.match(results[1].reason.message, /429/);
});

test("after a shared rejection settles, the next call for the same key retries normally against a now-healthy EIA (no permanent poisoning)", async () => {
  process.env.EIA_API_KEY = "test-key";
  global.fetch = async () => new Response(JSON.stringify({ error: { code: "OVER_RATE_LIMIT" } }), { status: 429 });
  const { fetchEiaTable } = loadClient();
  const params = { route: "natural-gas/stor/wkly/data", frequency: "weekly", length: 10 };

  await assert.rejects(() => fetchEiaTable(params));

  global.fetch = async () => new Response(eiaOkBody(888), { status: 200 });
  const recovered = await fetchEiaTable(params);
  assert.equal(recovered.rows[0].value, 888);
});

test("different EIA request keys (different routes/facets/length) are never coalesced with each other", async () => {
  process.env.EIA_API_KEY = "test-key";
  const seenUrls = [];
  global.fetch = async (url) => {
    seenUrls.push(url.toString());
    const callIndex = seenUrls.length; // captured synchronously, before the delay below
    await new Promise((resolve) => setTimeout(resolve, 10));
    return new Response(eiaOkBody(callIndex), { status: 200 });
  };
  const { fetchEiaTable } = loadClient();

  const [storage, production, demand] = await Promise.all([
    fetchEiaTable({ route: "natural-gas/stor/wkly/data", frequency: "weekly", length: 10 }),
    fetchEiaTable({ route: "natural-gas/prod/sum/data", frequency: "monthly", length: 10 }),
    fetchEiaTable({ route: "natural-gas/cons/sum/data", frequency: "monthly", length: 10 })
  ]);

  assert.equal(seenUrls.length, 3, "three distinct request keys must each issue their own upstream fetch");
  assert.equal(new Set(seenUrls).size, 3, "each request key must produce a distinct URL");
  assert.notEqual(storage.rows[0].value, production.rows[0].value);
  assert.notEqual(production.rows[0].value, demand.rows[0].value);
});

test("dedup does not persist stale data as a substitute for CDN caching -- once settled, a later call re-fetches even if the same key repeats", async () => {
  process.env.EIA_API_KEY = "test-key";
  let fetchCalls = 0;
  global.fetch = async () => {
    fetchCalls += 1;
    return new Response(eiaOkBody(fetchCalls), { status: 200 });
  };
  const { fetchEiaTable } = loadClient();
  const params = { route: "natural-gas/stor/wkly/data", frequency: "weekly", length: 10 };

  const first = await fetchEiaTable(params);
  const second = await fetchEiaTable(params);

  assert.equal(fetchCalls, 2, "two sequential (non-overlapping) calls for the same key must each issue a real fetch, not reuse a settled entry");
  assert.equal(first.rows[0].value, 1);
  assert.equal(second.rows[0].value, 2);
});

test("the 8-second timeout still applies per-request even when deduplicated -- a shared hung request still bounds and clears", async () => {
  process.env.EIA_API_KEY = "test-key";
  global.fetch = (url, init) =>
    new Promise((_resolve, reject) => {
      // Node 20's AbortSignal.timeout() timer is unref'd; this bounded watchdog
      // keeps the isolated CI test worker alive until the real abort is observed.
      const watchdog = setTimeout(() => reject(new Error("test watchdog elapsed")), 2_000);
      init?.signal?.addEventListener("abort", () => {
        clearTimeout(watchdog);
        reject(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
      });
    });
  const { fetchEiaTable } = loadClient();
  const params = { route: "natural-gas/stor/wkly/data", frequency: "weekly", length: 10, timeoutMs: 50 };

  const start = Date.now();
  const results = await Promise.allSettled([fetchEiaTable(params), fetchEiaTable(params)]);
  assert.ok(Date.now() - start < 2000, "shared timeout must still bound the wait");
  assert.equal(results[0].status, "rejected");
  assert.equal(results[1].status, "rejected");

  global.fetch = async () => new Response(eiaOkBody(999), { status: 200 });
  const recovered = await fetchEiaTable(params);
  assert.equal(recovered.rows[0].value, 999);
});
