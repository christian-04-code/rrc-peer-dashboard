const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./helpers/ts-loader.cjs");

const {
  getCompanyGuidanceHighlights,
  getCompanyGuidanceFullText,
  getCompanyGuidanceSections,
  getGuidanceMeta,
  hasGuidance
} = load("lib/dashboard/guidance.ts");

const CORE_PEERS = ["RRC", "AR", "CNX", "CRK", "EQT", "EXE", "GPOR"];

test("every core peer has current Q2-cycle guidance highlights", () => {
  for (const ticker of CORE_PEERS) {
    assert.ok(hasGuidance(ticker));
    assert.ok(getCompanyGuidanceHighlights(ticker).length > 0);
  }
});

test("compact highlights use current Q2 values and status rather than stale Q1 actuals", () => {
  const rrc = getCompanyGuidanceHighlights("RRC");
  const production = rrc.find((item) => item.label === "Production · FY 2026");
  assert.deepEqual(production, {
    section: "Production",
    label: "Production · FY 2026",
    value: "2.35–2.4 Bcfe/d",
    status: "Reaffirmed"
  });
  assert.ok(!rrc.some((item) => /Q1 2026 Actual/.test(item.label)));
});

test("the panel source is official company disclosure, never AlphaSense ingestion metadata", () => {
  const meta = getGuidanceMeta();
  assert.match(meta.source, /Official company disclosures/);
  assert.match(meta.source, /Q2 2026/);
  assert.doesNotMatch(meta.source, /AlphaSense/i);
});

test("the full drawer contains every current Q2 record except the unsupported AR inferred total", () => {
  const raw = require(path.join(process.cwd(), "data", "management-guidance.json"));
  for (const ticker of CORE_PEERS) {
    const expected = raw.companies[ticker].entries.filter((record) =>
      record.reportingCycle === "Q2 2026" &&
      !(record.company === "AR" && record.metric === "capex" && record.note?.includes("not independently restated"))
    ).length;
    const actual = getCompanyGuidanceSections(ticker).reduce((sum, section) => sum + section.rows.length, 0);
    assert.equal(actual, expected, `${ticker} should retain every current display record`);
  }
});

test("full guidance preserves non-chartable thresholds and official source metadata", () => {
  const sections = getCompanyGuidanceSections("RRC");
  const rows = sections.flatMap((section) => section.rows);
  const liquids = rows.find((row) => row.kind === "pair" && row.label === "Liquids Mix · FY 2026");
  assert.equal(liquids.value, ">30 % of total production");
  assert.match(liquids.detail, /Range Resources Corp Q2 2026 Earnings/);
  const cumulativeFcf = rows.find((row) => row.kind === "pair" && row.label === "FCF · 2026-2027 cumulative");
  assert.equal(cumulativeFcf.value, ">1,700 $MM cumulative");
});

test("AR displays reaffirmed CapEx components without an inferred total", () => {
  const rows = getCompanyGuidanceSections("AR").flatMap((section) => section.rows);
  assert.ok(rows.some((row) => row.kind === "pair" && /CapEx D&C Maintenance/.test(row.label) && row.value === "$1,000MM"));
  assert.ok(rows.some((row) => row.kind === "pair" && /CapEx Land/.test(row.label) && row.value === "$100MM"));
  assert.ok(rows.some((row) => row.kind === "pair" && /CapEx Growth Potential/.test(row.label) && row.value === "≤$200MM"));
  assert.ok(!rows.some((row) => row.kind === "pair" && row.label === "CapEx · FY 2026"));
});

test("GPOR keeps base operated CapEx and the $140MM acreage program separate", () => {
  const rows = getCompanyGuidanceSections("GPOR").flatMap((section) => section.rows);
  assert.ok(rows.some((row) => row.kind === "pair" && /CapEx Base Operated/.test(row.label) && row.value === "~$430MM"));
  assert.ok(rows.some((row) => row.kind === "pair" && /Discretionary Acreage Program/.test(row.label) && row.value === "$140MM"));
  assert.ok(!rows.some((row) => row.kind === "pair" && /\$570MM/.test(row.value)));
});

test("EXE current drawer shows Q2 ranges and no preserved Q1 point duplicate", () => {
  const rows = getCompanyGuidanceSections("EXE").flatMap((section) => section.rows);
  const production = rows.find((row) => row.kind === "pair" && row.label === "Production · FY 2026");
  assert.equal(production.value, "7,400–7,600 MMcfe/d");
  assert.equal(rows.filter((row) => row.kind === "pair" && row.label === "Production · FY 2026").length, 1);
});

test("CRK current panel contains the updated FY26 CapEx range", () => {
  const text = getCompanyGuidanceFullText("CRK");
  assert.match(text, /CapEx · FY 2026: \$1,450–\$1,550MM/);
  assert.doesNotMatch(text, /CapEx · FY 2026: \$1,400–\$1,500MM/);
});

test("guidance remains isolated by company", () => {
  for (const ticker of CORE_PEERS) {
    const text = getCompanyGuidanceFullText(ticker);
    for (const other of CORE_PEERS.filter((candidate) => candidate !== ticker)) {
      assert.doesNotMatch(text, new RegExp(`^${other} ·`, "m"));
    }
  }
});

test("the application uses management-guidance.json for both chart and panel pipelines", () => {
  const panelSource = fs.readFileSync(path.join(process.cwd(), "lib", "dashboard", "guidance.ts"), "utf8");
  const chartSource = fs.readFileSync(path.join(process.cwd(), "lib", "dashboard", "chart-guidance.ts"), "utf8");
  assert.match(panelSource, /management-guidance\.json/);
  assert.doesNotMatch(panelSource, /data\/guidance\.json/);
  assert.match(chartSource, /management-guidance\.json/);
});

test("HomeDashboard still renders the existing compact GuidancePanel", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "components", "HomeDashboard.tsx"), "utf8");
  assert.match(source, /GuidancePanel/);
});
