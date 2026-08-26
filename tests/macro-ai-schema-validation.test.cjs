const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const { validateMacroSummaryResult, MacroSummaryValidationError, findGuaranteedLanguageInMacroSummary } = load("lib/market/ai/types.ts");
const { NoopMacroSummaryProvider, MacroSummaryProviderError } = load("lib/market/ai/provider.ts");

function validMock(overrides) {
  return {
    summary:
      "Range's macro backdrop is mixed heading into the fall. Elevated storage remains the largest current headwind, while strengthening LNG export demand is a supportive offset. Henry Hub trend is roughly flat, suggesting near-term price direction is unresolved. IR should watch upcoming storage injection reports and any STEO revision to the LNG export outlook.",
    aiProvider: "anthropic",
    aiModel: "claude-haiku-4-5",
    schemaVersion: "1.0.0",
    generatedAt: "2026-08-26T12:00:00.000Z",
    ...overrides
  };
}

test("accepts a well-formed Macro AI summary", () => {
  const result = validateMacroSummaryResult(validMock({}));
  assert.equal(result.aiProvider, "anthropic");
});

test("rejects a non-object response", () => {
  assert.throws(() => validateMacroSummaryResult(null), MacroSummaryValidationError);
  assert.throws(() => validateMacroSummaryResult("not an object"), MacroSummaryValidationError);
});

test("rejects an empty summary", () => {
  assert.throws(() => validateMacroSummaryResult(validMock({ summary: "" })), MacroSummaryValidationError);
  assert.throws(() => validateMacroSummaryResult(validMock({ summary: "   " })), MacroSummaryValidationError);
});

test("rejects a summary that is too short to be a useful executive summary", () => {
  assert.throws(() => validateMacroSummaryResult(validMock({ summary: "Storage is high. LNG is strong." })), MacroSummaryValidationError);
});

test("rejects a summary that is too long (not a 3-6 sentence executive summary)", () => {
  const longSummary = Array.from({ length: 260 }, (__, i) => `word${i}`).join(" ");
  assert.throws(() => validateMacroSummaryResult(validMock({ summary: longSummary })), MacroSummaryValidationError);
});

test("rejects guaranteed-outcome language about the stock", () => {
  assert.throws(() => validateMacroSummaryResult(validMock({ summary: validMock({}).summary + " Range stock will rise on this news." })), MacroSummaryValidationError);
  assert.throws(() => validateMacroSummaryResult(validMock({ summary: validMock({}).summary + " This will support realized pricing going forward." })), MacroSummaryValidationError);
});

test("accepts conditional language (may/could/suggests/potentially)", () => {
  const result = validateMacroSummaryResult(validMock({ summary: validMock({}).summary + " This could potentially support realized pricing if it persists." }));
  assert.ok(result.summary.includes("could potentially"));
});

test("findGuaranteedLanguageInMacroSummary flags stock-specific certainty phrases", () => {
  assert.equal(findGuaranteedLanguageInMacroSummary("Range shares will outperform peers."), "will outperform");
  assert.equal(findGuaranteedLanguageInMacroSummary("This may support realized pricing."), null);
});

test("rejects missing metadata fields", () => {
  assert.throws(() => validateMacroSummaryResult(validMock({ aiProvider: "" })), MacroSummaryValidationError);
  assert.throws(() => validateMacroSummaryResult(validMock({ aiModel: "" })), MacroSummaryValidationError);
  assert.throws(() => validateMacroSummaryResult(validMock({ schemaVersion: "" })), MacroSummaryValidationError);
  assert.throws(() => validateMacroSummaryResult(validMock({ generatedAt: "not-a-date" })), MacroSummaryValidationError);
});

test("NoopMacroSummaryProvider always throws -- never silently returns a fabricated summary", async () => {
  const provider = new NoopMacroSummaryProvider();
  await assert.rejects(() => provider.summarize({}), MacroSummaryProviderError);
});
