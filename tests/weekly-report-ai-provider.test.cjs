const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

/**
 * lib/reports/ai/anthropic-provider.ts constructs a real `Anthropic` SDK
 * client directly in its constructor (no injection point), and this
 * project has no established Anthropic-SDK-mocking infrastructure (the
 * same gap tests/weekly-report-overview-ui.test.cjs's own header notes for
 * JSX/React Testing Library) -- building one now is out of scope for this
 * narrow fix. These are source-inspection tests, the same convention used
 * throughout this project for guarantees that don't need a live/mocked
 * call to verify.
 *
 * Context: the first real Preview invocation returned a `bottomLine` that
 * failed validateWeeklyAnalystAssessment's non-empty check. Root cause:
 * `bottomLine` is the schema's second-to-last property, and the original
 * WEEKLY_ANALYST_MAX_OUTPUT_TOKENS (2200) was a pre-live estimate that
 * proved too tight for a real response -- consistent with the model
 * hitting max_tokens and getting cut off before reaching bottomLine (and
 * selectedEvidenceIds, the actual last property), while everything earlier
 * in the schema validated fine.
 */

function readSource(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), "utf8");
}

test("WEEKLY_ANALYST_MAX_OUTPUT_TOKENS was raised well above the original untested 2200 estimate", () => {
  const { WEEKLY_ANALYST_MAX_OUTPUT_TOKENS } = require("./helpers/ts-loader.cjs").load("lib/reports/ai/model-config.ts");
  assert.ok(WEEKLY_ANALYST_MAX_OUTPUT_TOKENS >= 4096, `expected >= 4096, got ${WEEKLY_ANALYST_MAX_OUTPUT_TOKENS}`);
});

test("anthropic-provider.ts checks response.stop_reason === 'max_tokens' before validating the tool_use input", () => {
  const source = readSource("../lib/reports/ai/anthropic-provider.ts");
  const stopReasonCheckIndex = source.indexOf('response.stop_reason === "max_tokens"');
  const validateCallIndex = source.indexOf("return validateWeeklyAnalystAssessment(");
  assert.ok(stopReasonCheckIndex > 0, "must check response.stop_reason for a truncated generation");
  assert.ok(validateCallIndex > stopReasonCheckIndex, "the max_tokens check must run BEFORE validation, not after");
});

test("anthropic-provider.ts throws a WeeklyAnalystProviderError (not a generic error) on max_tokens truncation, distinct from a validation failure", () => {
  const source = readSource("../lib/reports/ai/anthropic-provider.ts");
  assert.match(source, /stop_reason === "max_tokens"\s*\)\s*\{\s*throw new WeeklyAnalystProviderError/);
});

test("the bottomLine tool-schema property requires a non-trivial minLength, not just any string", () => {
  const source = readSource("../lib/reports/ai/anthropic-provider.ts");
  assert.match(source, /bottomLine:\s*\{\s*type:\s*"string",\s*minLength:\s*\d+/);
});

test("bottomLine remains in the tool schema's top-level required array (not weakened to optional)", () => {
  const source = readSource("../lib/reports/ai/anthropic-provider.ts");
  const requiredArrays = [...source.matchAll(/required:\s*\[([^\]]+)\]/g)].map((m) => m[1]);
  assert.ok(requiredArrays.length > 0, "tool input_schema must declare at least one required array");
  assert.ok(requiredArrays.some((list) => list.includes('"bottomLine"')), "bottomLine must appear in some required array");
});
