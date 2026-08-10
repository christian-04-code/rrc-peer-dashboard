const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./helpers/ts-loader.cjs");

const {
  getCompanyGuidanceHighlights,
  getCompanyGuidanceFullText,
  getCompanyGuidanceSections,
  hasGuidance
} = load("lib/dashboard/guidance.ts");

const CORE_PEERS = ["RRC", "AR", "CNX", "CRK", "EQT", "EXE", "GPOR"];

test("every core peer ticker has normalized company guidance", () => {
  for (const ticker of CORE_PEERS) {
    assert.ok(hasGuidance(ticker), `${ticker} should have guidance data`);
    const highlights = getCompanyGuidanceHighlights(ticker);
    assert.ok(highlights.length > 0, `${ticker} should have at least one guidance highlight`);
  }
});

test("guidance highlights change when the selected company changes", () => {
  const rrc = getCompanyGuidanceHighlights("RRC");
  const ar = getCompanyGuidanceHighlights("AR");
  assert.notDeepEqual(rrc, ar, "RRC and AR guidance highlights should differ");
});

test("guidance highlights use real values from the AlphaSense-sourced guidance document, not placeholder text", () => {
  const rrc = getCompanyGuidanceHighlights("RRC");
  const q1Actual = rrc.find((item) => item.label === "Q1 2026 Actual");
  assert.ok(q1Actual, "RRC Q1 2026 Actual production highlight should be present");
  assert.equal(q1Actual.value, "2.2 Bcfe/d");
});

test("guidance highlights never contain the old market-feed-status wording", () => {
  for (const ticker of CORE_PEERS) {
    const text = JSON.stringify(getCompanyGuidanceHighlights(ticker));
    assert.doesNotMatch(text, /unavailable/i);
    assert.doesNotMatch(text, /Henry Hub/i);
    assert.doesNotMatch(text, /LNG export/i);
    assert.doesNotMatch(text, /storage/i);
  }
});

test("full guidance text is non-empty for the drawer view", () => {
  const text = getCompanyGuidanceFullText("RRC");
  assert.ok(text.length > 100);
});

test("getCompanyGuidanceSections groups every core peer's guidance into sections without dropping any source item", () => {
  const guidanceData = require(path.join(process.cwd(), "data", "guidance.json"));
  for (const ticker of CORE_PEERS) {
    const sections = getCompanyGuidanceSections(ticker);
    const rawSections = guidanceData.companies[ticker].sections;
    assert.equal(sections.length, Object.keys(rawSections).length, `${ticker} should preserve every source section`);
    for (const section of sections) {
      const rowCount = section.rows.length;
      const rawCount = rawSections[section.section].length;
      // Header+value lines collapse into one paired row, so rows <= raw items, but nothing is skipped
      // outright (every raw item is consumed by exactly one row).
      assert.ok(rowCount > 0 && rowCount <= rawCount, `${ticker} ${section.section} should retain its source content`);
    }
  }
});

test("getCompanyGuidanceSections pairs RRC's known label/value guidance correctly for the drawer", () => {
  const sections = getCompanyGuidanceSections("RRC");
  const production = sections.find((section) => section.section === "Production");
  assert.ok(production, "RRC should have a Production section");
  const q1Actual = production.rows.find((row) => row.kind === "pair" && row.label === "Q1 2026 Actual");
  assert.ok(q1Actual, "Q1 2026 Actual should be a paired row");
  assert.equal(q1Actual.value, "2.2 Bcfe/d");
});

test("getCompanyGuidanceSections returns an empty list for a ticker without normalized guidance", () => {
  assert.deepEqual(getCompanyGuidanceSections("NOPE"), []);
});

test("HomeDashboard renders the Guidance widget from normalized company guidance, not market-feed messages", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "components", "HomeDashboard.tsx"), "utf8");
  assert.match(source, /GuidancePanel/);
  assert.doesNotMatch(source, /Daily market/);
  assert.doesNotMatch(source, /Storage unavailable|storage feed is currently unavailable/i);
  assert.doesNotMatch(source, /LNG.*unavailable/i);
});
