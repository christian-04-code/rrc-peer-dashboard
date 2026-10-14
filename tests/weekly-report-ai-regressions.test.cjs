const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

// Regressions from real Preview test runs (2026-10-14):
//  - run 2: riskTable cited a SUPPORTIVE/opportunity id; responses truncated at 5,120 tokens
//  - run 3: riskTable[0].whyItMatters 337/339 chars (limit 320); biggestRisk returned as JSON text
const { validateWeeklyAnalystAssessment, WeeklyAnalystValidationError } = load("lib/reports/ai-contract.ts");
const { decodeTextEncodedObjects, parseTextEncodedObject } = load("lib/reports/ai/decode-tool-input.ts");
const { SYSTEM_PROMPT } = load("lib/reports/ai/prompt.ts");
const { WEEKLY_ANALYST_MAX_OUTPUT_TOKENS } = load("lib/reports/ai/model-config.ts");
const { AnthropicWeeklyAnalystProvider } = load("lib/reports/ai/anthropic-provider.ts");
const fs = require("node:fs");

const RISK = "deterministic_risk_opportunity:us_gas_supply";
const OPP = "deterministic_risk_opportunity:gas_pricing";

function input() {
  return {
    schemaVersion: "1.3.0",
    report: { storageWeekEnding: "2026-10-02", dataCutoffAt: "2026-10-09T17:00:00.000Z" },
    marketBackdrop: [],
    riskCandidates: [{ evidenceId: RISK, driver: "us_gas_supply", label: "U.S. Gas Supply", state: "MODERATE_RISK", rank: 1, reason: "Supply +5.3% YoY." }],
    opportunityCandidates: [{ evidenceId: OPP, driver: "gas_pricing", label: "Pricing", state: "SUPPORTIVE", rank: 2, reason: "HH up." }],
    whatChanged: [{ kind: "value_changed", evidenceId: "storage:lower48", category: "storage", label: "Storage", fromValue: "3,415 Bcf", toValue: "3,500 Bcf", fromState: null, toState: null }],
    range: [], peers: [], news: [], outlook: [], sourcesFreshness: [], previousReportContext: null, rangeAnnouncements: [],
    evidenceAllowlist: [RISK, OPP, "storage:lower48"]
  };
}

function toolInput(overrides = {}) {
  return {
    executiveAssessment: new Array(110).fill("word").join(" "),
    biggestRisk: { title: "Supply", assessment: "Supply is growing faster than demand.", evidenceIds: [RISK] },
    biggestOpportunity: { title: "Prices", assessment: "Prices are higher than a month ago.", evidenceIds: [OPP] },
    whatChanged: [{ title: "Storage rose", assessment: "Storage rose to 3,500 Bcf.", evidenceIds: ["storage:lower48"], impact: "mixed" }],
    managementWatchItems: [{ item: "Next storage report", reason: "Shows whether storage stays near normal.", evidenceIds: ["storage:lower48"] }],
    bottomLine: "A steady week for Range with supply growth the main risk.",
    selectedEvidenceIds: [RISK, "storage:lower48"],
    investorQuestions: [],
    riskTable: [{ evidenceId: RISK, whyItMatters: "More supply can lower prices." }],
    ...overrides
  };
}

const withMeta = (record) => ({ ...record, schemaVersion: "1.3.0", aiProvider: "anthropic", aiModel: "claude-haiku-4-5", generatedAt: "2026-10-14T00:00:00.000Z" });

// --- Oversized risk explanations: the 320-char validation limit is unchanged; the prompt asks for 250. ---

test("a 337-char whyItMatters (real run 3) is still rejected -- the 320-char validation limit is unchanged", () => {
  const long = "x".repeat(337);
  assert.throws(() => validateWeeklyAnalystAssessment(withMeta(toolInput({ riskTable: [{ evidenceId: RISK, whyItMatters: long }] })), input()), /is 337 chars -- keep it to 1-2 short sentences \(max 320\)/);
  // 250-320 remains valid: the 250 target is an instruction, not a new rule.
  assert.doesNotThrow(() => validateWeeklyAnalystAssessment(withMeta(toolInput({ riskTable: [{ evidenceId: RISK, whyItMatters: "y".repeat(300) }] })), input()));
});

test("prompt and tool schema state the 250-character limit for every risk-table text field", () => {
  for (const field of ["whyItMatters", "announcedAction", "possibleResponse"]) {
    assert.match(SYSTEM_PROMPT, new RegExp(`${field}:[^\\n]*At most 250 characters`), `${field} prompt instruction`);
  }
  const provider = fs.readFileSync("lib/reports/ai/anthropic-provider.ts", "utf8");
  for (const field of ["whyItMatters", "announcedAction", "possibleResponse"]) {
    assert.match(provider, new RegExp(`${field}: \\{ type: "string", maxLength: 250, description: "[^"]*At most 250 characters`), `${field} schema`);
  }
});

// --- Opportunity cited in riskTable (real run 2): still rejected. ---

test("a riskTable row citing an opportunity/SUPPORTIVE id (real run 2) is still rejected", () => {
  assert.throws(() => validateWeeklyAnalystAssessment(withMeta(toolInput({ riskTable: [{ evidenceId: OPP, whyItMatters: "x" }] })), input()), /not one of the supplied deterministic risk candidates/);
});

test("output token cap leaves headroom above the ~5,300 tokens observed in real runs", () => {
  assert.ok(WEEKLY_ANALYST_MAX_OUTPUT_TOKENS >= 8192);
});

// --- Text-encoded objects (real run 3: "biggestRisk" is not an object) ---

test("parseTextEncodedObject accepts only a valid JSON object", () => {
  assert.deepEqual(parseTextEncodedObject('{"title":"Supply"}'), { title: "Supply" });
  assert.deepEqual(parseTextEncodedObject('  {"a":1}  '), { a: 1 });
  for (const bad of ['[{"title":"x"}]', "null", "42", '"text"', "{not json", "Supply is growing", "", { already: "object" }, null, 7, ["x"]]) {
    assert.equal(parseTextEncodedObject(bad), null, `must not parse ${JSON.stringify(bad)}`);
  }
});

test("a JSON-text biggestRisk is decoded, then passes the SAME validation as a native object", () => {
  const raw = toolInput({ biggestRisk: JSON.stringify(toolInput().biggestRisk) });
  assert.throws(() => validateWeeklyAnalystAssessment(withMeta(raw), input()), /"biggestRisk" is not an object/, "undecoded text still fails exactly as in run 3");
  const { input: decoded, decodedFields } = decodeTextEncodedObjects(raw);
  assert.deepEqual(decodedFields, ["biggestRisk"]);
  const result = validateWeeklyAnalystAssessment(withMeta(decoded), input());
  assert.equal(result.biggestRisk.title, "Supply");
});

test("a decoded object is still subject to every content rule (e.g. must cite a real risk candidate)", () => {
  const raw = toolInput({ biggestRisk: JSON.stringify({ title: "Pricing", assessment: "Prices up.", evidenceIds: [OPP] }) });
  const { input: decoded } = decodeTextEncodedObjects(raw);
  assert.throws(() => validateWeeklyAnalystAssessment(withMeta(decoded), input()), /does not cite any of the supplied deterministic risk candidates/);
});

test("invalid text, arrays, and other values are left untouched so validation rejects them", () => {
  for (const bad of ["{broken json", '[{"title":"x","assessment":"y","evidenceIds":["a"]}]', "null", "Supply is growing faster than demand."]) {
    const { input: decoded, decodedFields } = decodeTextEncodedObjects(toolInput({ biggestRisk: bad }));
    assert.equal(decoded.biggestRisk, bad);
    assert.deepEqual(decodedFields, []);
    assert.throws(() => validateWeeklyAnalystAssessment(withMeta(decoded), input()), WeeklyAnalystValidationError);
  }
});

test("text-encoded elements inside object arrays are decoded; string arrays like selectedEvidenceIds are never touched", () => {
  const raw = toolInput({
    riskTable: [JSON.stringify({ evidenceId: RISK, whyItMatters: "More supply can lower prices." })],
    whatChanged: [JSON.stringify({ title: "Storage rose", assessment: "Storage rose.", evidenceIds: ["storage:lower48"], impact: "mixed" })],
    selectedEvidenceIds: [RISK, "storage:lower48"]
  });
  const { input: decoded, decodedFields } = decodeTextEncodedObjects(raw);
  assert.deepEqual(decodedFields, ["whatChanged[0]", "riskTable[0]"]);
  assert.deepEqual(decoded.selectedEvidenceIds, [RISK, "storage:lower48"]);
  assert.doesNotThrow(() => validateWeeklyAnalystAssessment(withMeta(decoded), input()));
});

test("decoding never mutates the model's original tool input", () => {
  const raw = toolInput({ biggestRisk: JSON.stringify(toolInput().biggestRisk) });
  const before = JSON.stringify(raw);
  decodeTextEncodedObjects(raw);
  assert.equal(JSON.stringify(raw), before);
});

test("end to end through the provider: a JSON-text biggestRisk response validates and is reported in diagnostics", async () => {
  const metas = [];
  const provider = new AnthropicWeeklyAnalystProvider({ apiKey: "test-key", onResponseMeta: (m) => metas.push(m) });
  provider.client.messages.create = async () => ({
    stop_reason: "tool_use",
    usage: { input_tokens: 9272, output_tokens: 4629 },
    content: [{ type: "tool_use", name: "submit_weekly_range_analyst_assessment", input: toolInput({ biggestRisk: JSON.stringify(toolInput().biggestRisk) }) }]
  });
  const assessment = await provider.analyze(input());
  assert.equal(assessment.biggestRisk.title, "Supply");
  assert.deepEqual(metas[0].decodedFields, ["biggestRisk"]);
});

test("end to end through the provider: an oversized risk cell is still rejected after decoding", async () => {
  const provider = new AnthropicWeeklyAnalystProvider({ apiKey: "test-key" });
  provider.client.messages.create = async () => ({
    stop_reason: "tool_use",
    usage: { input_tokens: 1, output_tokens: 1 },
    content: [{ type: "tool_use", name: "submit_weekly_range_analyst_assessment", input: toolInput({ riskTable: [{ evidenceId: RISK, whyItMatters: "z".repeat(339) }] }) }]
  });
  await assert.rejects(provider.analyze(input()), /is 339 chars/);
});
