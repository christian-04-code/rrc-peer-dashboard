const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./helpers/ts-loader.cjs");

const { getValuationSnapshot } = load("lib/dashboard/valuations.ts");

function byKey(metrics, key) {
  return metrics.find((metric) => metric.key === key);
}

test("RRC Valuations widget resolves EPS, EBITDAX, Market Cap, and P/E for the current and prior-year quarter", () => {
  const metrics = getValuationSnapshot("RRC");
  assert.equal(metrics.length, 4);

  const eps = byKey(metrics, "eps");
  assert.equal(eps.current, 1.52);
  assert.equal(eps.previous, 0.96);
  assert.equal(eps.currentPeriod, "Q1 2026");
  assert.equal(eps.previousPeriod, "Q1 2025");

  const ebitdax = byKey(metrics, "ebitdax");
  assert.equal(ebitdax.current, 569.529);
  assert.equal(ebitdax.previous, 424.123);

  const marketCap = byKey(metrics, "marketCap");
  assert.equal(marketCap.current, 10650.0);
  assert.equal(marketCap.previous, 9540.0);

  const pe = byKey(metrics, "pe");
  assert.ok(pe.current !== null && Number.isFinite(pe.current));
  assert.ok(pe.previous !== null && Number.isFinite(pe.previous));
  // 10650 / (237.578+144.307+179.087+341.63 TTM net income) ~= 11.8
  assert.ok(Math.abs(pe.current - 11.8) < 0.2, `expected RRC current P/E near 11.8, got ${pe.current}`);
});

test("a peer ticker without extracted EPS/net-income renders '--' (null) for EPS and P/E, not a fabricated value", () => {
  const metrics = getValuationSnapshot("AR");
  const eps = byKey(metrics, "eps");
  const pe = byKey(metrics, "pe");
  assert.equal(eps.current, null);
  assert.equal(eps.previous, null);
  assert.equal(pe.current, null);
  assert.equal(pe.previous, null);

  // Market cap and EBITDAX are independently sourced and should still resolve for peers.
  const marketCap = byKey(metrics, "marketCap");
  const ebitdax = byKey(metrics, "ebitdax");
  assert.ok(marketCap.current !== null);
  assert.ok(ebitdax.current !== null);
});

test("the Valuations widget updates with the selected company (different tickers produce different snapshots)", () => {
  const rrc = getValuationSnapshot("RRC");
  const eqt = getValuationSnapshot("EQT");
  assert.notDeepEqual(rrc, eqt);
});

test("HomeDashboard right column renders ValuationsPanel in place of the old Financials widget", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "components", "HomeDashboard.tsx"), "utf8");
  assert.match(source, /ValuationsPanel/);
  assert.doesNotMatch(source, /FinancialsPanel/);
});
