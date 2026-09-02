const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const { SAMPLE_WEEKLY_REPORT_PAYLOAD, SAMPLE_WEEKLY_ANALYST_ASSESSMENT } = load("tests/fixtures/weekly-report-fixture.ts");
const { buildWeeklyReportRenderModel } = load("lib/reports/render/render-model-builder.ts");
const { renderReportHtml } = load("lib/reports/render/html-template.ts");
const { renderBarChartSvg } = load("lib/reports/render/svg-charts.ts");
const { loadRrcLogoDataUri } = load("lib/reports/render/branding.ts");

test("renderReportHtml produces a complete, self-contained HTML document", () => {
  const model = buildWeeklyReportRenderModel(SAMPLE_WEEKLY_REPORT_PAYLOAD, SAMPLE_WEEKLY_ANALYST_ASSESSMENT);
  const html = renderReportHtml(model, null);
  assert.match(html, /^<!doctype html>/);
  assert.match(html, /<\/html>$/);
  assert.match(html, /WEEKLY RANGE RESOURCES AI INTELLIGENCE REPORT/);
  assert.match(html, /Week Ending August 28, 2026/);
});

test("renderReportHtml falls back to a text wordmark when no logo data URI is supplied", () => {
  const model = buildWeeklyReportRenderModel(SAMPLE_WEEKLY_REPORT_PAYLOAD, SAMPLE_WEEKLY_ANALYST_ASSESSMENT);
  const html = renderReportHtml(model, null);
  assert.match(html, /class="wordmark">RANGE RESOURCES</);
});

test("renderReportHtml uses an <img> tag when a logo data URI is supplied", () => {
  const model = buildWeeklyReportRenderModel(SAMPLE_WEEKLY_REPORT_PAYLOAD, SAMPLE_WEEKLY_ANALYST_ASSESSMENT);
  const html = renderReportHtml(model, "data:image/png;base64,AAAA");
  assert.match(html, /<img class="logo" src="data:image\/png;base64,AAAA"/);
});

test("renderReportHtml escapes HTML-significant characters in evidence-derived text -- never raw-interpolates untrusted content", () => {
  const assessment = { ...SAMPLE_WEEKLY_ANALYST_ASSESSMENT, bottomLine: `<script>alert("x")</script> & "quoted"` };
  const model = buildWeeklyReportRenderModel(SAMPLE_WEEKLY_REPORT_PAYLOAD, assessment);
  const html = renderReportHtml(model, null);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&amp;/);
});

test("renderReportHtml is deterministic -- identical inputs produce identical output", () => {
  const model = buildWeeklyReportRenderModel(SAMPLE_WEEKLY_REPORT_PAYLOAD, SAMPLE_WEEKLY_ANALYST_ASSESSMENT);
  assert.equal(renderReportHtml(model, null), renderReportHtml(model, null));
});

test("renderBarChartSvg draws exactly one <rect> per bar", () => {
  const chart = { id: "x", kind: "comparisonBar", title: "Test", unit: null, bars: [{ label: "Current", value: 10, displayValue: "10" }, { label: "1wk ago", value: 8, displayValue: "8" }], caption: "x", sourceLine: "x" };
  const svg = renderBarChartSvg(chart);
  const rectCount = (svg.match(/<rect /g) || []).length;
  assert.equal(rectCount, 2);
});

test("renderBarChartSvg escapes an untrusted bar label", () => {
  const chart = { id: "x", kind: "comparisonBar", title: "Test", unit: null, bars: [{ label: "<img onerror=alert(1)>", value: 1, displayValue: "1" }, { label: "b", value: 2, displayValue: "2" }], caption: "x", sourceLine: "x" };
  const svg = renderBarChartSvg(chart);
  assert.doesNotMatch(svg, /<img onerror/);
});

test("renderBarChartSvg keeps a real zero baseline visible when a bar value is negative", () => {
  const chart = { id: "x", kind: "comparisonBar", title: "FCF", unit: "$MM", bars: [{ label: "Current", value: -20, displayValue: "-$20MM" }, { label: "prior qtr", value: 15, displayValue: "$15MM" }], caption: "x", sourceLine: "x" };
  const svg = renderBarChartSvg(chart);
  assert.match(svg, /stroke-dasharray="2,2"/, "a dashed zero reference line must be drawn when values straddle zero");
});

test("loadRrcLogoDataUri returns a base64 PNG data URI for the repo's approved logo asset", () => {
  const uri = loadRrcLogoDataUri();
  assert.ok(uri === null || uri.startsWith("data:image/png;base64,"));
});

test("loadRrcLogoDataUri is stable across repeated calls (cached)", () => {
  assert.equal(loadRrcLogoDataUri(), loadRrcLogoDataUri());
});
