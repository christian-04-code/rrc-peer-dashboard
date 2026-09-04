const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const { validateWeeklyAnalystAssessment, WeeklyAnalystValidationError } = load("lib/reports/ai-contract.ts");

function words(count, word = "word") {
  return new Array(count).fill(word).join(" ");
}

function baseInput(overrides = {}) {
  return {
    schemaVersion: "1.0.0",
    report: { storageWeekEnding: "2026-08-28", dataCutoffAt: "2026-09-03T18:00:00.000Z" },
    marketBackdrop: [],
    riskCandidates: [{ evidenceId: "deterministic_risk_opportunity:storage_levels", driver: "storage_levels", label: "Storage", state: "MODERATE_RISK", rank: 1, reason: "Storage surplus." }],
    opportunityCandidates: [{ evidenceId: "deterministic_risk_opportunity:lng_demand", driver: "lng_demand", label: "LNG Demand", state: "SUPPORTIVE", rank: 2, reason: "LNG exports growing." }],
    whatChanged: [{ kind: "value_changed", evidenceId: "storage:lower48", category: "storage", label: "Storage", fromValue: "2900 Bcf", toValue: "3000 Bcf", fromState: null, toState: null }],
    range: [{ evidenceId: "range_company:rrc:revenue", category: "range_company", label: "RRC Revenue", displayValue: "$450MM", period: "Q2 2026" }],
    peers: [{ evidenceId: "peers:AR:revenue", category: "peers", label: "AR Revenue", displayValue: "$600MM", period: "Q2 2026" }],
    news: [{ evidenceId: "news:article:abc", category: "news", label: "Headline", displayValue: "positive", period: "2026-08-30T00:00:00.000Z" }],
    outlook: [{ evidenceId: "steo_outlook:henryHubForecast", category: "steo_outlook", label: "Henry Hub Forecast", displayValue: "$3.50", period: "2026-10" }],
    sourcesFreshness: [{ key: "macro_storage", label: "EIA Weekly Storage", period: "2026-08-28", freshness: "current" }],
    previousReportContext: null,
    evidenceAllowlist: [
      "deterministic_risk_opportunity:storage_levels",
      "deterministic_risk_opportunity:lng_demand",
      "storage:lower48",
      "range_company:rrc:revenue",
      "peers:AR:revenue",
      "news:article:abc",
      "steo_outlook:henryHubForecast"
    ],
    ...overrides
  };
}

function baseOutput(overrides = {}) {
  return {
    schemaVersion: "1.0.0",
    aiProvider: "anthropic",
    aiModel: "claude-haiku-4-5",
    generatedAt: "2026-09-03T19:00:00.000Z",
    executiveAssessment: words(200),
    biggestRisk: { title: "Storage surplus", assessment: "Storage remains above the 5-year average.", evidenceIds: ["deterministic_risk_opportunity:storage_levels"] },
    biggestOpportunity: { title: "LNG demand growth", assessment: "LNG exports continue to grow.", evidenceIds: ["deterministic_risk_opportunity:lng_demand"] },
    whatChanged: [{ title: "Storage rose", assessment: "Storage increased week over week.", evidenceIds: ["storage:lower48"] }],
    managementWatchItems: [{ item: "Watch the next EIA storage release", reason: "Confirms whether the surplus persists.", evidenceIds: ["storage:lower48"] }],
    bottomLine: "Directionally mixed, tilted cautious given the storage surplus.",
    selectedEvidenceIds: ["deterministic_risk_opportunity:storage_levels", "deterministic_risk_opportunity:lng_demand", "storage:lower48"],
    ...overrides
  };
}

test("accepts a well-formed, fully-grounded response", () => {
  const result = validateWeeklyAnalystAssessment(baseOutput(), baseInput());
  assert.equal(result.bottomLine, baseOutput().bottomLine);
});

test("rejects a non-object response", () => {
  assert.throws(() => validateWeeklyAnalystAssessment("nope", baseInput()), WeeklyAnalystValidationError);
  assert.throws(() => validateWeeklyAnalystAssessment(null, baseInput()), WeeklyAnalystValidationError);
});

test("rejects missing provider-added fields (schemaVersion/aiProvider/aiModel/generatedAt)", () => {
  assert.throws(() => validateWeeklyAnalystAssessment(baseOutput({ aiProvider: "" }), baseInput()), WeeklyAnalystValidationError);
  assert.throws(() => validateWeeklyAnalystAssessment(baseOutput({ generatedAt: "not-a-date" }), baseInput()), WeeklyAnalystValidationError);
});

test("rejects an executiveAssessment shorter than the contract floor", () => {
  assert.throws(() => validateWeeklyAnalystAssessment(baseOutput({ executiveAssessment: words(50) }), baseInput()), WeeklyAnalystValidationError);
});

test("rejects an executiveAssessment longer than the contract ceiling", () => {
  assert.throws(() => validateWeeklyAnalystAssessment(baseOutput({ executiveAssessment: words(2000) }), baseInput()), WeeklyAnalystValidationError);
});

test("accepts an executiveAssessment within the Phase 7C.1 150-250 word target range", () => {
  const result = validateWeeklyAnalystAssessment(baseOutput({ executiveAssessment: words(180) }), baseInput());
  assert.equal(result.executiveAssessment.trim().split(/\s+/).length, 180);
});

test("rejects generic filler language in the executive assessment", () => {
  const filler = `${words(190)} Market conditions remain dynamic and management should continue to monitor the situation.`;
  assert.throws(() => validateWeeklyAnalystAssessment(baseOutput({ executiveAssessment: filler }), baseInput()), WeeklyAnalystValidationError);
});

test("rejects guaranteed-outcome language (stock will rise/fall)", () => {
  const guaranteed = `${words(190)} Range shares will outperform peers next quarter.`;
  assert.throws(() => validateWeeklyAnalystAssessment(baseOutput({ executiveAssessment: guaranteed }), baseInput()), WeeklyAnalystValidationError);
});

test("rejects guaranteed-outcome language in bottomLine too", () => {
  assert.throws(() => validateWeeklyAnalystAssessment(baseOutput({ bottomLine: "Range stock will rise from here." }), baseInput()), WeeklyAnalystValidationError);
});

test("rejects a bottomLine that is technically non-empty but too short to be a meaningful synthesis", () => {
  assert.throws(() => validateWeeklyAnalystAssessment(baseOutput({ bottomLine: "N/A" }), baseInput()), WeeklyAnalystValidationError);
  assert.throws(() => validateWeeklyAnalystAssessment(baseOutput({ bottomLine: "." }), baseInput()), WeeklyAnalystValidationError);
});

test("rejects an empty or whitespace-only bottomLine (the exact truncated-response failure seen in the first live Preview invocation)", () => {
  assert.throws(() => validateWeeklyAnalystAssessment(baseOutput({ bottomLine: "" }), baseInput()), WeeklyAnalystValidationError);
  assert.throws(() => validateWeeklyAnalystAssessment(baseOutput({ bottomLine: "   " }), baseInput()), WeeklyAnalystValidationError);
});

test("rejects a biggestRisk with no evidenceIds", () => {
  assert.throws(() => validateWeeklyAnalystAssessment(baseOutput({ biggestRisk: { title: "x", assessment: "y", evidenceIds: [] } }), baseInput()), WeeklyAnalystValidationError);
});

test("rejects biggestRisk that does not cite any supplied risk candidate -- the AI may not invent a risk outside the deterministic ranking", () => {
  const output = baseOutput({ biggestRisk: { title: "Made up risk", assessment: "...", evidenceIds: ["news:article:abc"] } });
  assert.throws(() => validateWeeklyAnalystAssessment(output, baseInput()), WeeklyAnalystValidationError);
});

test("rejects biggestOpportunity that does not cite any supplied opportunity candidate", () => {
  const output = baseOutput({ biggestOpportunity: { title: "Made up opportunity", assessment: "...", evidenceIds: ["news:article:abc"] } });
  assert.throws(() => validateWeeklyAnalystAssessment(output, baseInput()), WeeklyAnalystValidationError);
});

test("rejects a biggestRisk that cites the OPPORTUNITY candidate instead of a risk candidate", () => {
  const output = baseOutput({ biggestRisk: { title: "Wrong candidate", assessment: "...", evidenceIds: ["deterministic_risk_opportunity:lng_demand"] } });
  assert.throws(() => validateWeeklyAnalystAssessment(output, baseInput()), WeeklyAnalystValidationError);
});

test("rejects more than 5 whatChanged items", () => {
  const item = { title: "x", assessment: "y", evidenceIds: ["storage:lower48"] };
  const output = baseOutput({ whatChanged: [item, item, item, item, item, item] });
  assert.throws(() => validateWeeklyAnalystAssessment(output, baseInput()), WeeklyAnalystValidationError);
});

test("accepts zero whatChanged items for a genuinely quiet week", () => {
  const result = validateWeeklyAnalystAssessment(baseOutput({ whatChanged: [] }), baseInput());
  assert.deepEqual(result.whatChanged, []);
});

test("rejects a whatChanged item that does not cite any of the supplied deterministic change evidence", () => {
  const output = baseOutput({ whatChanged: [{ title: "Fabricated change", assessment: "...", evidenceIds: ["news:article:abc"] }] });
  assert.throws(() => validateWeeklyAnalystAssessment(output, baseInput()), WeeklyAnalystValidationError);
});

test("rejects zero managementWatchItems", () => {
  assert.throws(() => validateWeeklyAnalystAssessment(baseOutput({ managementWatchItems: [] }), baseInput()), WeeklyAnalystValidationError);
});

test("rejects more than 6 managementWatchItems", () => {
  const item = { item: "x", reason: "y", evidenceIds: ["storage:lower48"] };
  const output = baseOutput({ managementWatchItems: new Array(7).fill(item) });
  assert.throws(() => validateWeeklyAnalystAssessment(output, baseInput()), WeeklyAnalystValidationError);
});

test("rejects a watch item with no supporting evidenceIds -- never a fabricated forecast", () => {
  const output = baseOutput({ managementWatchItems: [{ item: "Watch something", reason: "just because", evidenceIds: [] }] });
  assert.throws(() => validateWeeklyAnalystAssessment(output, baseInput()), WeeklyAnalystValidationError);
});

test("rejects any evidence id anywhere that is not in the supplied allowlist", () => {
  const output = baseOutput({ selectedEvidenceIds: ["storage:lower48", "fabricated-evidence-id"] });
  assert.throws(() => validateWeeklyAnalystAssessment(output, baseInput()), WeeklyAnalystValidationError);
});

test("rejects duplicate evidence ids in selectedEvidenceIds", () => {
  const output = baseOutput({ selectedEvidenceIds: ["storage:lower48", "storage:lower48"] });
  assert.throws(() => validateWeeklyAnalystAssessment(output, baseInput()), WeeklyAnalystValidationError);
});

test("rejects malformed JSON shape (selectedEvidenceIds not an array)", () => {
  const output = baseOutput({ selectedEvidenceIds: "storage:lower48" });
  assert.throws(() => validateWeeklyAnalystAssessment(output, baseInput()), WeeklyAnalystValidationError);
});
