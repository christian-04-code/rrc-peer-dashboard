const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const { computeWeeklyChanges, flattenModules } = load("lib/reports/changes.ts");

function evidenceItem(overrides) {
  return {
    evidenceId: "x",
    category: "storage",
    metricKey: "x",
    label: "X",
    currentValue: null,
    displayValue: "",
    unit: null,
    period: null,
    asOfDate: null,
    sourceIds: [],
    freshness: "current",
    comparisons: [],
    rangeDrivers: [],
    materialityInputs: { isNewThisWeek: false, changedSincePreviousReport: false, riskSeverityRank: null, riskState: null, rangeImpactDirection: null, rangeImpactStrength: null, comparisonMagnitudePct: null },
    metadata: {},
    ...overrides
  };
}

test("computeWeeklyChanges: with no previous published snapshot (the very first report), every item is honestly reported as new_observation rather than silently producing no change entries", () => {
  const current = { storage: [evidenceItem({ evidenceId: "storage:lower48", displayValue: "3000 Bcf" })] };
  const changes = computeWeeklyChanges(current, null);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].kind, "new_observation");
  assert.equal(changes[0].fromValue, null);
});

test("computeWeeklyChanges: a genuinely new evidenceId produces a new_observation change", () => {
  const current = { storage: [evidenceItem({ evidenceId: "storage:lower48", category: "storage", displayValue: "3000 Bcf" })] };
  const changes = computeWeeklyChanges(current, {});
  assert.equal(changes.length, 1);
  assert.equal(changes[0].kind, "new_observation");
  assert.equal(changes[0].toValue, "3000 Bcf");
  assert.equal(changes[0].fromValue, null);
});

test("computeWeeklyChanges: an unchanged displayValue produces NO change entry, even across many consecutive calls", () => {
  const item = evidenceItem({ evidenceId: "range_company:rrc:revenue", category: "range_company", displayValue: "$450MM" });
  const previous = { range_company: [item] };
  const current = { range_company: [item] };
  assert.deepEqual(computeWeeklyChanges(current, previous), []);
});

test("computeWeeklyChanges: THE CORE RULE -- the same underlying (unchanged) monthly/quarterly observation appearing in two consecutive WEEKLY snapshots is not a change, even though a weekly report was generated in between", () => {
  const aprilProduction = evidenceItem({ evidenceId: "us_gas_supply:dry_gas_production", category: "us_gas_supply", displayValue: "3,400,000 MMcf/mo", period: "2026-04" });
  // Simulates two consecutive weekly snapshots (week 1 and week 2) both observing the same still-current April figure -- diffing week 2 against week 1 must be silent.
  const week1 = { us_gas_supply: [aprilProduction] };
  const week2 = { us_gas_supply: [aprilProduction] };
  assert.deepEqual(computeWeeklyChanges(week2, week1), []);
});

test("computeWeeklyChanges: a real value change produces a value_changed (or category-specific) entry with both old and new values", () => {
  const previous = { storage: [evidenceItem({ evidenceId: "storage:lower48", category: "storage", displayValue: "2900 Bcf" })] };
  const current = { storage: [evidenceItem({ evidenceId: "storage:lower48", category: "storage", displayValue: "3000 Bcf" })] };
  const changes = computeWeeklyChanges(current, previous);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].kind, "value_changed");
  assert.equal(changes[0].fromValue, "2900 Bcf");
  assert.equal(changes[0].toValue, "3000 Bcf");
});

test("computeWeeklyChanges: category-specific new-observation kinds -- news/steo/range_company/peers each get their own vocabulary", () => {
  const current = {
    news: [evidenceItem({ evidenceId: "news:article:1", category: "news" })],
    steo_outlook: [evidenceItem({ evidenceId: "steo_outlook:henryHubForecast", category: "steo_outlook" })],
    range_company: [evidenceItem({ evidenceId: "range_company:rrc:revenue", category: "range_company" })],
    peers: [evidenceItem({ evidenceId: "peers:AR:revenue", category: "peers" })]
  };
  const changes = computeWeeklyChanges(current, {});
  const kindByCategory = Object.fromEntries(changes.map((c) => [c.category, c.kind]));
  assert.equal(kindByCategory.news, "new_retained_news_item");
  assert.equal(kindByCategory.steo_outlook, "new_steo_vintage");
  assert.equal(kindByCategory.range_company, "new_company_result_or_guidance");
  assert.equal(kindByCategory.peers, "material_peer_change");
});

test("computeWeeklyChanges: deterministic_risk_opportunity items are diffed by riskState/riskRank metadata, not generic displayValue -- producing risk_state_changed and risk_rank_changed, never a duplicate generic entry", () => {
  const previous = { deterministic_risk_opportunity: [evidenceItem({ evidenceId: "deterministic_risk_opportunity:storage_levels", category: "deterministic_risk_opportunity", displayValue: "WATCH", metadata: { riskState: "WATCH", riskRank: 3 } })] };
  const current = { deterministic_risk_opportunity: [evidenceItem({ evidenceId: "deterministic_risk_opportunity:storage_levels", category: "deterministic_risk_opportunity", displayValue: "MODERATE_RISK", metadata: { riskState: "MODERATE_RISK", riskRank: 1 } })] };
  const changes = computeWeeklyChanges(current, previous);
  const kinds = changes.map((c) => c.kind).sort();
  assert.deepEqual(kinds, ["risk_rank_changed", "risk_state_changed"]);
  const stateChange = changes.find((c) => c.kind === "risk_state_changed");
  assert.equal(stateChange.fromState, "WATCH");
  assert.equal(stateChange.toState, "MODERATE_RISK");
  const rankChange = changes.find((c) => c.kind === "risk_rank_changed");
  assert.equal(rankChange.fromState, "3");
  assert.equal(rankChange.toState, "1");
});

test("computeWeeklyChanges: an unchanged risk item's state AND rank produces no change entries at all", () => {
  const item = evidenceItem({ evidenceId: "deterministic_risk_opportunity:storage_levels", category: "deterministic_risk_opportunity", displayValue: "WATCH", metadata: { riskState: "WATCH", riskRank: 3 } });
  const changes = computeWeeklyChanges({ deterministic_risk_opportunity: [item] }, { deterministic_risk_opportunity: [item] });
  assert.deepEqual(changes, []);
});

test("computeWeeklyChanges: a brand-new risk item (not previously ranked) reports fromState null -> real state, not a fabricated prior state", () => {
  const current = { deterministic_risk_opportunity: [evidenceItem({ evidenceId: "deterministic_risk_opportunity:lng_demand", category: "deterministic_risk_opportunity", metadata: { riskState: "SUPPORTIVE", riskRank: 5 } })] };
  const changes = computeWeeklyChanges(current, {});
  const stateChange = changes.find((c) => c.kind === "risk_state_changed");
  assert.equal(stateChange.fromState, null);
  assert.equal(stateChange.toState, "SUPPORTIVE");
});

test("flattenModules: flattens every category into one evidenceId-keyed map", () => {
  const modules = { storage: [evidenceItem({ evidenceId: "a" })], news: [evidenceItem({ evidenceId: "b" })] };
  const flat = flattenModules(modules);
  assert.equal(flat.size, 2);
  assert.ok(flat.has("a") && flat.has("b"));
});
