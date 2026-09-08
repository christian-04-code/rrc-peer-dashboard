const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const { selectAnalystEvidence } = load("lib/reports/analyst-evidence-selection.ts");

function item(overrides) {
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

function riskItem(evidenceId, riskState, riskRank) {
  return item({ evidenceId, category: "deterministic_risk_opportunity", label: evidenceId, metricKey: evidenceId, metadata: { riskState, riskRank, deterministicReason: `${evidenceId} reason` } });
}

function change(evidenceId, kind) {
  return { kind, evidenceId, category: "storage", label: evidenceId, fromValue: "a", toValue: "b", fromState: null, toState: null };
}

function payload(modules) {
  return { schemaVersion: "1.0.0", storageWeekEnding: "2026-08-28", dataCutoffAt: "2026-09-03T18:00:00.000Z", modules, sourceManifest: { generatedFrom: [{ key: "macro_storage", label: "EIA Storage", period: "2026-08-28", freshness: "current", included: true }] } };
}

test("splits deterministic_risk_opportunity items into riskCandidates (non-SUPPORTIVE) and opportunityCandidates (SUPPORTIVE), ordered by riskRank", () => {
  const modules = {
    deterministic_risk_opportunity: [riskItem("r3", "WATCH", 3), riskItem("r1", "HIGH_RISK", 1), riskItem("opp1", "SUPPORTIVE", 2)]
  };
  const input = selectAnalystEvidence(payload(modules), [], null);
  assert.deepEqual(input.riskCandidates.map((c) => c.evidenceId), ["r1", "r3"]);
  assert.deepEqual(input.opportunityCandidates.map((c) => c.evidenceId), ["opp1"]);
});

test("peers evidence is capped at 6 items even when far more are supplied", () => {
  const peers = Array.from({ length: 36 }, (_, i) => item({ evidenceId: `peers:T${i}`, category: "peers", label: `Peer ${i}` }));
  const input = selectAnalystEvidence(payload({ peers }), [], null);
  assert.equal(input.peers.length, 6);
});

test("news evidence is capped at 5 items", () => {
  const news = Array.from({ length: 8 }, (_, i) => item({ evidenceId: `news:article:${i}`, category: "news", label: `Article ${i}` }));
  const input = selectAnalystEvidence(payload({ news }), [], null);
  assert.equal(input.news.length, 5);
});

test("selection prioritizes new/changed items over unchanged ones when capping (reuses Phase 7B materiality ranking)", () => {
  const routine = Array.from({ length: 5 }, (_, i) => item({ evidenceId: `range_company:rrc:m${i}`, category: "range_company", label: `Metric ${i}` }));
  const changed = item({ evidenceId: "range_company:rrc:new_thing", category: "range_company", label: "New thing", materialityInputs: { ...routine[0].materialityInputs, isNewThisWeek: true } });
  const input = selectAnalystEvidence(payload({ range_company: [...routine, changed] }), [], null);
  assert.ok(input.range.length <= 8);
  assert.ok(input.range.some((ref) => ref.evidenceId === "range_company:rrc:new_thing"), "the changed item must survive the cap even with 5 routine competitors");
});

test("whatChanged raw candidates are capped at 8 and prioritized: risk_state_changed/risk_rank_changed first", () => {
  const changes = [
    change("value_changed_1", "value_changed"),
    change("risk_state", "risk_state_changed"),
    change("value_changed_2", "value_changed"),
    change("risk_rank", "risk_rank_changed"),
    ...Array.from({ length: 8 }, (_, i) => change(`filler_${i}`, "new_observation"))
  ];
  const input = selectAnalystEvidence(payload({}), changes, null);
  assert.equal(input.whatChanged.length, 8);
  assert.equal(input.whatChanged[0].evidenceId, "risk_state");
  assert.equal(input.whatChanged[1].evidenceId, "risk_rank");
});

test("evidenceAllowlist is the deduplicated union of every selected category's evidenceIds", () => {
  const modules = {
    storage: [item({ evidenceId: "storage:lower48", category: "storage" })],
    deterministic_risk_opportunity: [riskItem("deterministic_risk_opportunity:storage_levels", "WATCH", 1)]
  };
  const changes = [change("storage:lower48", "value_changed")];
  const input = selectAnalystEvidence(payload(modules), changes, null);
  assert.deepEqual(
    [...input.evidenceAllowlist].sort(),
    ["deterministic_risk_opportunity:storage_levels", "storage:lower48"].sort()
  );
});

test("empty payload/changes produces a well-formed input with empty arrays, not a crash", () => {
  const input = selectAnalystEvidence(payload({}), [], null);
  assert.deepEqual(input.marketBackdrop, []);
  assert.deepEqual(input.riskCandidates, []);
  assert.deepEqual(input.opportunityCandidates, []);
  assert.deepEqual(input.whatChanged, []);
  assert.deepEqual(input.evidenceAllowlist, []);
});

test("report identity/dataCutoffAt pass through from the payload unchanged", () => {
  const input = selectAnalystEvidence(payload({}), [], null);
  assert.equal(input.report.storageWeekEnding, "2026-08-28");
  assert.equal(input.report.dataCutoffAt, "2026-09-03T18:00:00.000Z");
});

test("previousReportContext passes through verbatim when supplied", () => {
  const context = { storageWeekEnding: "2026-08-21", bottomLine: "Prior bottom line." };
  const input = selectAnalystEvidence(payload({}), [], context);
  assert.deepEqual(input.previousReportContext, context);
});

test("selection is fully deterministic -- calling twice with identical input produces byte-identical output", () => {
  const modules = { peers: Array.from({ length: 10 }, (_, i) => item({ evidenceId: `peers:T${i}`, category: "peers" })) };
  const a = selectAnalystEvidence(payload(modules), [], null);
  const b = selectAnalystEvidence(payload(modules), [], null);
  assert.deepEqual(a, b);
});
