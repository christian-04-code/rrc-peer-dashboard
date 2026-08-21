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
    aiModel: "claude-haiku-4-5-20251001",
    impactFrameworkVersion: "1.0.0",
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

test("NoopNewsAnalysisProvider refuses to analyze -- Phase 2 must not wire a live AI call into the pipeline", async () => {
  const provider = new NoopNewsAnalysisProvider();
  await assert.rejects(() => provider.analyze(), NewsAnalysisProviderError);
});
