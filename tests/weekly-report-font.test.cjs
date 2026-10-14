const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const crypto = require("node:crypto");
const { load } = require("./helpers/ts-loader.cjs");

// Embedded Arimo font (2026-10-14): Vercel's serverless Chromium has no Arial, so the
// report embeds an Arial-metric-compatible font to render identically everywhere.
const { loadReportFontFaceCss, REPORT_FONT_FAMILY } = load("lib/reports/render/report-font.ts");
const { buildWeeklyReportRenderModel } = load("lib/reports/render/render-model-builder.ts");
const { renderReportHtml } = load("lib/reports/render/html-template.ts");
const { SAMPLE_WEEKLY_REPORT_PAYLOAD, SAMPLE_WEEKLY_ANALYST_ASSESSMENT } = load("tests/fixtures/weekly-report-fixture.ts");

test("the bundled font is the documented Arimo file and ships with its OFL license", () => {
  const bytes = fs.readFileSync("assets/fonts/arimo/Arimo-wght.ttf");
  const sha = crypto.createHash("sha256").update(bytes).digest("hex");
  assert.match(fs.readFileSync("assets/fonts/arimo/README.md", "utf8"), new RegExp(sha));
  assert.match(fs.readFileSync("assets/fonts/arimo/OFL.txt", "utf8"), /SIL Open Font License, Version 1\.1/);
});

test("the report HTML embeds the font as a data-URI @font-face and uses it first for body text and chart labels", () => {
  const css = loadReportFontFaceCss();
  assert.match(css, /^@font-face \{ font-family: "Report Sans"; src: url\(data:font\/ttf;base64,[A-Za-z0-9+/=]{1000,}\) format\("truetype"\); font-weight: 400 700;/);
  const html = renderReportHtml(buildWeeklyReportRenderModel(SAMPLE_WEEKLY_REPORT_PAYLOAD, SAMPLE_WEEKLY_ANALYST_ASSESSMENT), null);
  assert.ok(html.includes(css), "the @font-face rule is inlined (no network fetch)");
  assert.match(html, new RegExp(`body \\{ font-family: "${REPORT_FONT_FAMILY}", Arial, Helvetica, sans-serif;`));
  assert.match(fs.readFileSync("lib/reports/render/report-charts.ts", "utf8"), /const FONT = "'Report Sans', Arial, Helvetica, sans-serif";/);
});

test("both report routes trace the font file into their serverless bundles", () => {
  const config = require("../next.config.js");
  const includes = config.experimental.outputFileTracingIncludes;
  for (const route of ["/api/cron/reports", "/api/reports/preview-test"]) assert.ok(includes[route].includes("./assets/fonts/**"), route);
});

test("the PDF renderer waits for fonts to load before printing", () => {
  const source = fs.readFileSync("lib/reports/render/pdf-renderer.ts", "utf8");
  const setContent = source.indexOf("await page.setContent(html");
  const fontsReady = source.indexOf('await page.evaluate("document.fonts.ready');
  const pdfCall = source.indexOf("await page.pdf(");
  assert.ok(setContent > 0 && fontsReady > setContent && pdfCall > fontsReady);
});
