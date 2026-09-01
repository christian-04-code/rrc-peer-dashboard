const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const { formatAnalystInputForPrompt, SYSTEM_PROMPT } = load("lib/reports/ai/prompt.ts");

function baseInput(overrides = {}) {
  return {
    schemaVersion: "1.0.0",
    report: { storageWeekEnding: "2026-08-28", dataCutoffAt: "2026-09-03T18:00:00.000Z" },
    marketBackdrop: [{ evidenceId: "storage:lower48", category: "storage", label: "Storage", displayValue: "3000 Bcf", period: "2026-08-28" }],
    riskCandidates: [{ evidenceId: "deterministic_risk_opportunity:storage_levels", driver: "storage_levels", label: "Storage", state: "MODERATE_RISK", rank: 1, reason: "Surplus." }],
    opportunityCandidates: [],
    whatChanged: [{ kind: "value_changed", evidenceId: "storage:lower48", category: "storage", label: "Storage", fromValue: "2900 Bcf", toValue: "3000 Bcf", fromState: null, toState: null }],
    range: [],
    peers: [],
    news: [],
    outlook: [],
    sourcesFreshness: [{ key: "macro_storage", label: "EIA Weekly Storage", period: "2026-08-28", freshness: "current" }],
    previousReportContext: null,
    evidenceAllowlist: ["storage:lower48", "deterministic_risk_opportunity:storage_levels"],
    ...overrides
  };
}

test("SYSTEM_PROMPT establishes the analyst persona and the never-invent-evidence rule", () => {
  assert.match(SYSTEM_PROMPT, /Range Resources/);
  assert.match(SYSTEM_PROMPT, /evidenceId/);
  assert.match(SYSTEM_PROMPT, /never invent/i);
});

test("formatAnalystInputForPrompt includes every evidence id in brackets so the model can cite it precisely", () => {
  const text = formatAnalystInputForPrompt(baseInput());
  assert.match(text, /\[storage:lower48\]/);
  assert.match(text, /\[deterministic_risk_opportunity:storage_levels\]/);
});

test("formatAnalystInputForPrompt includes the report identity and data cutoff", () => {
  const text = formatAnalystInputForPrompt(baseInput());
  assert.match(text, /2026-08-28/);
  assert.match(text, /2026-09-03T18:00:00\.000Z/);
});

test("formatAnalystInputForPrompt states plainly when no previous report exists", () => {
  const text = formatAnalystInputForPrompt(baseInput({ previousReportContext: null }));
  assert.match(text, /No previous published report exists/);
});

test("formatAnalystInputForPrompt includes the previous report's bottom line as context only when supplied", () => {
  const text = formatAnalystInputForPrompt(baseInput({ previousReportContext: { storageWeekEnding: "2026-08-21", bottomLine: "Prior bottom line text." } }));
  assert.match(text, /Prior bottom line text\./);
});

test("formatAnalystInputForPrompt lists the complete evidence allowlist explicitly", () => {
  const text = formatAnalystInputForPrompt(baseInput());
  assert.match(text, /storage:lower48, deterministic_risk_opportunity:storage_levels|deterministic_risk_opportunity:storage_levels, storage:lower48/);
});

test("formatAnalystInputForPrompt is fully deterministic -- identical input produces identical text", () => {
  const a = formatAnalystInputForPrompt(baseInput());
  const b = formatAnalystInputForPrompt(baseInput());
  assert.equal(a, b);
});

test("formatAnalystInputForPrompt handles an entirely empty section gracefully, not a crash", () => {
  const text = formatAnalystInputForPrompt(baseInput({ news: [], peers: [], range: [], outlook: [] }));
  assert.match(text, /none supplied this week/);
});
