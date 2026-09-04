const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

/**
 * range-company-adapter.ts, peers-adapter.ts, forecast-adapter.ts, and
 * rigs-adapter.ts are all pure/synchronous over static, already-committed
 * project fixtures (no network, no DB) -- exercised here against the real
 * data, not a mock, since there is nothing to mock.
 */

test("collectRangeCompanyEvidence: every item has a stable evidenceId prefixed range_company:rrc: or range_company:guidance:, and only quarterly comparison periods", () => {
  const { collectRangeCompanyEvidence } = load("lib/reports/adapters/range-company-adapter.ts");
  const collected = collectRangeCompanyEvidence(new Date("2026-09-01T00:00:00Z"));
  assert.ok(collected.items.length > 0);
  for (const item of collected.items) {
    assert.match(item.evidenceId, /^range_company:(rrc:|guidance:)/);
    for (const comparison of item.comparisons) {
      assert.ok(["QoQ", "priorQuarterActuals"].includes(comparison.period), `unexpected comparison period ${comparison.period} for a quarterly Range metric`);
    }
  }
});

test("collectRangeCompanyEvidence: calling twice produces byte-identical evidenceIds and displayValues (deterministic, no randomness)", () => {
  const { collectRangeCompanyEvidence } = load("lib/reports/adapters/range-company-adapter.ts");
  const now = new Date("2026-09-01T00:00:00Z");
  const first = collectRangeCompanyEvidence(now);
  const second = collectRangeCompanyEvidence(now);
  assert.deepEqual(first.items.map((i) => [i.evidenceId, i.displayValue]), second.items.map((i) => [i.evidenceId, i.displayValue]));
});

test("collectRangeCompanyEvidence: freshness turns lagged/stale as the observation ages, not fixed at 'current' forever", () => {
  const { collectRangeCompanyEvidence } = load("lib/reports/adapters/range-company-adapter.ts");
  const soonAfterQuarter = collectRangeCompanyEvidence(new Date("2026-08-01T00:00:00Z"));
  const wayLater = collectRangeCompanyEvidence(new Date("2028-08-01T00:00:00Z"));
  assert.equal(soonAfterQuarter.items[0].freshness, "current");
  assert.equal(wayLater.items[0].freshness, "stale");
});

test("collectPeersEvidence: covers all 6 peer tickers (never RRC itself) with only quarterly comparisons", () => {
  const { collectPeersEvidence } = load("lib/reports/adapters/peers-adapter.ts");
  const collected = collectPeersEvidence();
  const tickers = new Set(collected.items.map((i) => i.metadata.ticker));
  assert.deepEqual([...tickers].sort(), ["AR", "CNX", "CRK", "EQT", "EXE", "GPOR"]);
  for (const item of collected.items) {
    for (const comparison of item.comparisons) {
      assert.ok(["QoQ", "priorQuarterActuals"].includes(comparison.period));
    }
  }
});

test("collectPeersEvidence: evidenceIds are stable and namespaced per ticker", () => {
  const { collectPeersEvidence } = load("lib/reports/adapters/peers-adapter.ts");
  const collected = collectPeersEvidence();
  const arRevenue = collected.items.find((i) => i.evidenceId === "peers:AR:revenue");
  assert.ok(arRevenue);
  assert.equal(arRevenue.category, "peers");
});

test("collectForecastEvidence: comparisons are always [] -- no persisted prior scenario vintage exists to diff against (documented gap, not fabricated)", () => {
  const { collectForecastEvidence } = load("lib/reports/adapters/forecast-adapter.ts");
  const collected = collectForecastEvidence();
  assert.ok(collected.items.length > 0);
  for (const item of collected.items) {
    assert.deepEqual(item.comparisons, []);
    assert.equal(item.category, "forecast_scenarios");
  }
});

test("collectRigsEvidence: national U.S. plus Marcellus/Utica only, with WoW+YoY comparisons reusing the import pipeline's own deltas", () => {
  const { collectRigsEvidence } = load("lib/reports/adapters/rigs-adapter.ts");
  const collected = collectRigsEvidence(new Date("2026-08-20T00:00:00Z"));
  const ids = collected.items.map((i) => i.evidenceId).sort();
  assert.deepEqual(ids, ["rigs:basin_marcellus", "rigs:basin_utica", "rigs:national_us"]);
  for (const item of collected.items) {
    const periods = item.comparisons.map((c) => c.period).sort();
    assert.deepEqual(periods, ["WoW", "YoY"]);
  }
});

test("collectRigsEvidence: freshness reflects real age relative to the Baker Hughes report date", () => {
  const { collectRigsEvidence } = load("lib/reports/adapters/rigs-adapter.ts");
  const soonAfter = collectRigsEvidence(new Date("2026-08-15T00:00:00Z"));
  const wayLater = collectRigsEvidence(new Date("2028-08-15T00:00:00Z"));
  assert.equal(soonAfter.items[0].freshness, "current");
  assert.equal(wayLater.items[0].freshness, "stale");
});
