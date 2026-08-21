const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const { validateAiAnalysisResult, AiAnalysisValidationError } = load("lib/news/ai/types.ts");
const { NoopNewsAnalysisProvider, NewsAnalysisProviderError } = load("lib/news/ai/provider.ts");

function validMock(overrides) {
  return {
    summary: "EQT announced a new pipeline agreement expanding Appalachian takeaway capacity.",
    rangeImpact: "positive",
    impactStrength: "medium",
    affectedDrivers: ["appalachian_takeaway"],
    rangeAnalysis: "Additional regional takeaway capacity could, if realized, ease basis constraints across Appalachian producers including Range.",
    timeHorizon: "medium_term",
    confidence: 0.6,
    aiProvider: "anthropic",
    aiModel: "claude-haiku-4-5",
    impactFrameworkVersion: "1.0.0",
    analysisSchemaVersion: "1.0.0",
    analyzedAt: "2026-08-15T12:00:00.000Z",
    ...overrides
  };
}

test("accepts a well-formed AI analysis response", () => {
  const result = validateAiAnalysisResult(validMock({}));
  assert.equal(result.rangeImpact, "positive");
});

test("rejects a non-object response", () => {
  assert.throws(() => validateAiAnalysisResult(null), AiAnalysisValidationError);
  assert.throws(() => validateAiAnalysisResult("not an object"), AiAnalysisValidationError);
});

test("rejects an invalid rangeImpact enum value", () => {
  assert.throws(() => validateAiAnalysisResult(validMock({ rangeImpact: "very bullish" })), AiAnalysisValidationError);
});

test("rejects an invalid impactStrength enum value", () => {
  assert.throws(() => validateAiAnalysisResult(validMock({ impactStrength: "extreme" })), AiAnalysisValidationError);
});

test("rejects a non-array affectedDrivers", () => {
  assert.throws(() => validateAiAnalysisResult(validMock({ affectedDrivers: "appalachian_takeaway" })), AiAnalysisValidationError);
});

test("rejects an empty affectedDrivers array", () => {
  assert.throws(() => validateAiAnalysisResult(validMock({ affectedDrivers: [] })), AiAnalysisValidationError);
});

test("rejects an affectedDrivers entry that isn't a real impact-framework driver key -- the model must select, not invent, drivers", () => {
  assert.throws(() => validateAiAnalysisResult(validMock({ affectedDrivers: ["stock_buyback_signal"] })), AiAnalysisValidationError);
});

test("accepts multiple valid driver keys", () => {
  const result = validateAiAnalysisResult(validMock({ affectedDrivers: ["appalachian_takeaway", "gas_pricing"] }));
  assert.deepEqual(result.affectedDrivers, ["appalachian_takeaway", "gas_pricing"]);
});

test("rejects a confidence value outside [0, 1]", () => {
  assert.throws(() => validateAiAnalysisResult(validMock({ confidence: 1.5 })), AiAnalysisValidationError);
  assert.throws(() => validateAiAnalysisResult(validMock({ confidence: -0.1 })), AiAnalysisValidationError);
});

test("rejects an empty summary", () => {
  assert.throws(() => validateAiAnalysisResult(validMock({ summary: "   " })), AiAnalysisValidationError);
});

test("rejects an unparseable analyzedAt timestamp", () => {
  assert.throws(() => validateAiAnalysisResult(validMock({ analyzedAt: "not-a-date" })), AiAnalysisValidationError);
});

test("rejects a response missing analysisSchemaVersion", () => {
  const mock = validMock({});
  delete mock.analysisSchemaVersion;
  assert.throws(() => validateAiAnalysisResult(mock), AiAnalysisValidationError);
});

test("rejects the retired 'immediate' timeHorizon value -- Phase 3 replaced it with the near_term/medium_term/long_term/multi_horizon set", () => {
  assert.throws(() => validateAiAnalysisResult(validMock({ timeHorizon: "immediate" })), AiAnalysisValidationError);
});

test("accepts the multi_horizon timeHorizon value", () => {
  const result = validateAiAnalysisResult(validMock({ timeHorizon: "multi_horizon" }));
  assert.equal(result.timeHorizon, "multi_horizon");
});

test("rejects rangeAnalysis written with guaranteed-outcome language instead of conditional language", () => {
  assert.throws(
    () => validateAiAnalysisResult(validMock({ rangeAnalysis: "This will increase Range's realized gas prices next quarter." })),
    AiAnalysisValidationError
  );
  assert.throws(
    () => validateAiAnalysisResult(validMock({ rangeAnalysis: "The impact on Range is definitely positive." })),
    AiAnalysisValidationError
  );
});

test("rejects a summary written with guaranteed-outcome language", () => {
  assert.throws(
    () => validateAiAnalysisResult(validMock({ summary: "EQT's pipeline expansion will increase Appalachian takeaway capacity." })),
    AiAnalysisValidationError
  );
});

test("accepts properly conditional language in rangeAnalysis", () => {
  const result = validateAiAnalysisResult(
    validMock({ rangeAnalysis: "This could potentially support Range's realized pricing if the capacity is utilized as described." })
  );
  assert.ok(result.rangeAnalysis.includes("could potentially"));
});

test("NoopNewsAnalysisProvider refuses to analyze -- must not wire a live AI call into the pipeline by default", async () => {
  const provider = new NoopNewsAnalysisProvider();
  await assert.rejects(() => provider.analyze(), NewsAnalysisProviderError);
});
