const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Phase 7E's Overview UI pieces (`WeeklyReportDownloadButton.tsx`,
 * `InfoTip.tsx`) are .tsx files -- this project's test harness
 * (tests/helpers/ts-loader.cjs) only transpiles/resolves plain .ts modules
 * (no JSX support, and this repo has no React Testing Library/jsdom
 * dependency to render a component tree against). Rather than adding that
 * infrastructure for two small presentational components -- out of scope
 * for "keep this pass small" -- these tests verify the same behavioral
 * contracts the brief calls out (correct endpoints, no regeneration,
 * required tooltip copy, keyboard-focusable trigger) via source
 * inspection, the same convention this project already uses extensively
 * for route/AI-boundary guarantees (see e.g.
 * tests/weekly-report-render-model.test.cjs's app/api scans).
 */

const REQUIRED_TOOLTIP_COPY =
  "Generated automatically each week after the latest EIA natural gas storage data is validated. The report combines Range company data, natural gas market fundamentals, peer trends, forecasts and material news into a frozen weekly snapshot. Deterministic analytics identify the key changes, risks and opportunities, then AI synthesizes the validated evidence into a concise Range-focused management briefing.";

function readSource(relativePath) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), "utf8");
}

test("WeeklyReportDownloadButton checks availability via the lightweight status endpoint, not the download endpoint", () => {
  const source = readSource("../components/dashboard/WeeklyReportDownloadButton.tsx");
  assert.match(source, /fetch\(\s*["']\/api\/reports\/latest["']/, "must check status via /api/reports/latest");
});

test("WeeklyReportDownloadButton's download control links to the download endpoint with a native download attribute -- no client-side regeneration logic", () => {
  const source = readSource("../components/dashboard/WeeklyReportDownloadButton.tsx");
  assert.match(source, /href=["']\/api\/reports\/latest\/download["']/);
  assert.match(source, /\bdownload\b/, "must use the native <a download> mechanism, not a JS-driven fetch/blob/save flow");
});

test("WeeklyReportDownloadButton never imports AI, Chromium, or snapshot-building code -- it only ever talks to the two safe read routes", () => {
  const source = readSource("../components/dashboard/WeeklyReportDownloadButton.tsx");
  assert.doesNotMatch(source, /anthropic|chromium|pdf-renderer|snapshot-builder|publish-service|analyst-service/i);
});

test("WeeklyReportDownloadButton renders the exact required management-facing tooltip copy", () => {
  const source = readSource("../components/dashboard/WeeklyReportDownloadButton.tsx");
  assert.match(source, new RegExp(REQUIRED_TOOLTIP_COPY.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), "tooltip copy must match the required text verbatim");
});

test("WeeklyReportDownloadButton has a distinct, non-alarming unavailable state (not merely a broken/disabled button with no text)", () => {
  const source = readSource("../components/dashboard/WeeklyReportDownloadButton.tsx");
  assert.match(source, /not yet available/i);
});

test("WeeklyReportDownloadButton has a loading state distinct from the unavailable state -- never flashes 'unavailable' before the status check resolves", () => {
  const source = readSource("../components/dashboard/WeeklyReportDownloadButton.tsx");
  assert.match(source, /"loading"/);
  assert.match(source, /Checking/i);
});

test("InfoTip's trigger is a real, keyboard-focusable <button> with an aria-label carrying the full tooltip text, and a role=\"tooltip\" bubble", () => {
  const source = readSource("../components/dashboard/InfoTip.tsx");
  assert.match(source, /<button[\s\S]*?aria-label=\{text\}/, "the trigger must be a real button so it is Tab-focusable, with the full text exposed to assistive tech via aria-label");
  assert.match(source, /role=["']tooltip["']/);
});

test("InfoTip is pure CSS hover/focus-within -- no click-to-toggle JS state (the brief requires 'no click required merely to see it')", () => {
  const source = readSource("../components/dashboard/InfoTip.tsx");
  assert.doesNotMatch(source, /useState|onMouseEnter|onFocus\b/, "must rely on CSS :hover/:focus-within, not React state toggled by a click/mouseenter handler");
});

test("the .info-tip-bubble CSS shows on both :hover and :focus-within (keyboard-accessible, not hover-only)", () => {
  const source = readSource("../components/dashboard/ForecastPanel.css");
  assert.match(source, /\.info-tip:hover \.info-tip-bubble,\s*\.info-tip:focus-within \.info-tip-bubble/);
});

test("the weekly-report control sits near the top of the Overview view, before the metric strip", () => {
  const source = readSource("../components/HomeDashboard.tsx");
  const heroIndex = source.indexOf("<CompanyHero");
  const controlIndex = source.indexOf("<WeeklyReportDownloadButton");
  const metricStripIndex = source.indexOf("<MetricStrip");
  assert.ok(heroIndex >= 0 && controlIndex > heroIndex, "the control must render after the hero header");
  assert.ok(controlIndex >= 0 && controlIndex < metricStripIndex, "the control must render before the metric strip -- near the top of Overview");
});

test("HomeDashboard.tsx does not add a Previous Reports view or navigation entry", () => {
  const source = readSource("../components/HomeDashboard.tsx");
  assert.doesNotMatch(source, /previous reports/i);
});
