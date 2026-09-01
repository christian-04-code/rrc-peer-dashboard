const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const { validateWeeklyIntelligenceAIOutput, WeeklyIntelligenceAIValidationError } = load("lib/reports/ai-contract.ts");

function repeatWords(word, count) {
  return new Array(count).fill(word).join(" ");
}

function baseInput(overrides = {}) {
  return {
    schemaVersion: "1.0.0",
    storageWeekEnding: "2026-08-28",
    payload: { schemaVersion: "1.0.0", storageWeekEnding: "2026-08-28", dataCutoffAt: "2026-08-28T12:00:00.000Z", modules: {}, sourceManifest: { generatedFrom: [] } },
    previousReportContext: null,
    availableEvidenceIds: ["gas-pricing-1", "storage-1"],
    ...overrides
  };
}

function baseOutput(overrides = {}) {
  return {
    schemaVersion: "1.0.0",
    aiProvider: "anthropic",
    aiModel: "claude-haiku-4-5",
    generatedAt: "2026-08-28T13:00:00.000Z",
    executiveAssessment: repeatWords("word", 300),
    biggestRisk: "Storage surplus versus the five-year average.",
    biggestOpportunity: "LNG export growth remains supportive.",
    whatChanged: "Storage moved from a moderate to a large surplus.",
    managementWatchItems: ["Watch Appalachia takeaway capacity."],
    bottomLine: "Directionally mixed, tilted cautious.",
    selectedEvidenceIds: ["gas-pricing-1"],
    ...overrides
  };
}

test("accepts a well-formed response and returns it unchanged", () => {
  const input = baseInput();
  const output = baseOutput();
  const result = validateWeeklyIntelligenceAIOutput(output, input);
  assert.equal(result.bottomLine, output.bottomLine);
});

test("rejects a non-object response", () => {
  assert.throws(() => validateWeeklyIntelligenceAIOutput("not an object", baseInput()), WeeklyIntelligenceAIValidationError);
  assert.throws(() => validateWeeklyIntelligenceAIOutput(null, baseInput()), WeeklyIntelligenceAIValidationError);
});

test("rejects a response missing a required narrative field", () => {
  const output = baseOutput({ bottomLine: "" });
  assert.throws(() => validateWeeklyIntelligenceAIOutput(output, baseInput()), WeeklyIntelligenceAIValidationError);
});

test("rejects an unparseable generatedAt", () => {
  const output = baseOutput({ generatedAt: "not-a-date" });
  assert.throws(() => validateWeeklyIntelligenceAIOutput(output, baseInput()), WeeklyIntelligenceAIValidationError);
});

test("rejects an executiveAssessment that is far too short", () => {
  const output = baseOutput({ executiveAssessment: "Too short." });
  assert.throws(() => validateWeeklyIntelligenceAIOutput(output, baseInput()), WeeklyIntelligenceAIValidationError);
});

test("rejects an executiveAssessment that is far too long", () => {
  const output = baseOutput({ executiveAssessment: repeatWords("word", 5000) });
  assert.throws(() => validateWeeklyIntelligenceAIOutput(output, baseInput()), WeeklyIntelligenceAIValidationError);
});

test("rejects empty managementWatchItems", () => {
  const output = baseOutput({ managementWatchItems: [] });
  assert.throws(() => validateWeeklyIntelligenceAIOutput(output, baseInput()), WeeklyIntelligenceAIValidationError);
});

test("rejects selectedEvidenceIds referencing evidence outside the input's allowlist -- the AI cannot invent or reach outside its supplied evidence", () => {
  const output = baseOutput({ selectedEvidenceIds: ["gas-pricing-1", "fabricated-evidence-id"] });
  assert.throws(() => validateWeeklyIntelligenceAIOutput(output, baseInput()), WeeklyIntelligenceAIValidationError);
});

test("accepts an empty selectedEvidenceIds array", () => {
  const output = baseOutput({ selectedEvidenceIds: [] });
  const result = validateWeeklyIntelligenceAIOutput(output, baseInput());
  assert.deepEqual(result.selectedEvidenceIds, []);
});
