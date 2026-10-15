const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { load } = require("./helpers/ts-loader.cjs");
const { buildLayoutPayload, buildLayoutAssessment, RISK_IDS } = require("./helpers/report-layout-fixture.cjs");

// Five-page layout regression tests (2026-10-14). Unit checks always run; real PDF
// page-count checks launch a local Chrome with production's exact page.pdf() options
// and skip (like the DB-gated tests) when no Chrome is available.
const { validateWeeklyAnalystAssessment } = load("lib/reports/ai-contract.ts");
const { buildWeeklyReportRenderModel } = load("lib/reports/render/render-model-builder.ts");
const { renderReportHtml } = load("lib/reports/render/html-template.ts");
const { renderWeeklyReportPdf } = load("lib/reports/render/weekly-report-pdf-service.ts");
const { PDF_PAGE_OPTIONS, countPdfPages } = load("lib/reports/render/pdf-renderer.ts");
const { loadRrcLogoDataUri } = load("lib/reports/render/branding.ts");
const { splitSentences, firstSentences } = load("lib/reports/render/text-trim.ts");

// --- Sentence trimming (reduced tier) ---

test("splitSentences does not break on U.S., e.g., vs., initials, or decimals", () => {
  assert.deepEqual(splitSentences("U.S. supply is up 5.3% vs. last year. Prices fell to $3.03. E.g. storage rose."), ["U.S. supply is up 5.3% vs. last year.", "Prices fell to $3.03.", "E.g. storage rose."]);
  assert.deepEqual(splitSentences("Range (RRC) guided to approx. 2.6 Bcfe/d. Why? Demand!"), ["Range (RRC) guided to approx. 2.6 Bcfe/d.", "Why?", "Demand!"]);
});

test("firstSentences is always a verbatim prefix and leaves short text untouched", () => {
  const text = "U.S. dry gas supply is +5.3% YoY. Absent matching demand growth, prices may soften. Range has hedges.";
  assert.equal(firstSentences(text, 1), "U.S. dry gas supply is +5.3% YoY.");
  assert.ok(text.startsWith(firstSentences(text, 2)));
  assert.equal(firstSentences("One sentence only.", 2), "One sentence only.");
});

// --- Contract limits approved for the five-page layout ---

function contractInput(assessment) {
  return {
    schemaVersion: "1.4.0", report: { storageWeekEnding: "2026-10-02", dataCutoffAt: "2026-10-14T16:28:05.371Z" }, marketBackdrop: [],
    riskCandidates: RISK_IDS.map((id, i) => ({ evidenceId: id, driver: id.split(":")[1], label: id, state: i === 0 ? "MODERATE_RISK" : "WATCH", rank: i + 1, reason: "r" })),
    opportunityCandidates: [{ evidenceId: "deterministic_risk_opportunity:gas_pricing", driver: "gas_pricing", label: "p", state: "SUPPORTIVE", rank: 5, reason: "r" }],
    whatChanged: [{ kind: "value_changed", evidenceId: "storage:lower48", category: "storage", label: "Storage", fromValue: "1", toValue: "2", fromState: null, toState: null }, { kind: "x", evidenceId: "storage:lower48", category: "storage", label: "s", fromValue: null, toValue: null, fromState: null, toState: null }, { kind: "x", evidenceId: "storage:lower48", category: "storage", label: "s", fromValue: null, toValue: null, fromState: null, toState: null }],
    range: [], peers: [], news: [], outlook: [], sourcesFreshness: [], previousReportContext: null,
    rangeAnnouncements: [{ evidenceId: "range_company:guidance:RRC:hedging_summary:2H 2026", category: "range_company", label: "h", displayValue: "h", period: null }, { evidenceId: "range_company:guidance:RRC:gas_takeaway:Growth Plan Through 2027", category: "range_company", label: "t", displayValue: "t", period: null }],
    evidenceAllowlist: [...RISK_IDS, "deterministic_risk_opportunity:gas_pricing", "storage:lower48", "range_company:guidance:RRC:hedging_summary:2H 2026", "range_company:guidance:RRC:gas_takeaway:Growth Plan Through 2027", ...assessment.selectedEvidenceIds]
  };
}

function forValidation(a) {
  return { ...a, biggestRisk: { ...a.biggestRisk, evidenceIds: [RISK_IDS[0]] }, biggestOpportunity: { ...a.biggestOpportunity, evidenceIds: ["deterministic_risk_opportunity:gas_pricing"] } };
}

test("both layout fixtures are valid under the approved contract (so the layout tests exercise reachable responses)", () => {
  for (const kind of ["compliant", "worst"]) {
    const a = forValidation(buildLayoutAssessment(kind));
    assert.doesNotThrow(() => validateWeeklyAnalystAssessment(a, contractInput(a)), kind);
  }
});

test("approved limits: summary >150 words, >3 watch items, bottom line >300 chars, >2 investor questions are rejected", () => {
  const base = forValidation(buildLayoutAssessment("compliant"));
  const words = (n) => new Array(n).fill("word").join(" ");
  const cases = [
    [{ executiveAssessment: words(151) }, /151 words/],
    [{ managementWatchItems: [...base.managementWatchItems, base.managementWatchItems[0]] }, /managementWatchItems/],
    [{ bottomLine: "x".repeat(301) }, /bottomLine" is 301 chars/],
    [{ investorQuestions: [...base.investorQuestions, base.investorQuestions[0]] }, /investorQuestions/]
  ];
  for (const [override, pattern] of cases) assert.throws(() => validateWeeklyAnalystAssessment({ ...base, ...override }, contractInput(base)), pattern);
  assert.doesNotThrow(() => validateWeeklyAnalystAssessment({ ...base, executiveAssessment: words(150) }, contractInput(base)));
});

// --- Render model: reduced tier shortens text, never drops risks or charts ---

test("reduced tier keeps every risk row and every core chart while shortening AI text to verbatim leading sentences", () => {
  const payload = buildLayoutPayload();
  const assessment = buildLayoutAssessment("worst");
  const standard = buildWeeklyReportRenderModel(payload, assessment, "standard");
  const reduced = buildWeeklyReportRenderModel(payload, assessment, "reduced");
  for (const model of [standard, reduced]) {
    assert.equal(model.riskTable.length, 4, "all four risk-engine rows");
    assert.equal(model.marketCharts.length, 2);
    assert.ok(model.rangeFcfChart);
    assert.equal(model.peerPanels.length, 3);
    assert.equal(model.whatChanged.length, 3);
    assert.equal(model.managementWatchItems.length, 3);
    assert.equal(model.investorQuestions.length, 2);
  }
  reduced.riskTable.forEach((row, i) => {
    assert.ok(standard.riskTable[i].whyItMatters.startsWith(row.whyItMatters) && row.whyItMatters.length < standard.riskTable[i].whyItMatters.length);
    assert.equal(splitSentences(row.whyItMatters).length, 1);
  });
  assert.ok(reduced.managementWatchItems.every((item) => item.body === "" && item.title.length > 0), "reduced watch items keep titles");
  assert.equal(reduced.executiveAssessmentParagraphs.length, 2);
  assert.ok(assessment.bottomLine.startsWith(reduced.bottomLine));
});

test("every engine risk gets a row even when the AI skipped one -- the engine's own reason fills it", () => {
  const payload = buildLayoutPayload();
  const assessment = { ...buildLayoutAssessment("compliant"), riskTable: buildLayoutAssessment("compliant").riskTable.slice(0, 2) };
  const rows = buildWeeklyReportRenderModel(payload, assessment, "standard").riskTable;
  assert.equal(rows.length, 4);
  assert.equal(rows[3].whyItMatters, payload.modules.deterministic_risk_opportunity[3].metadata.deterministicReason);
  assert.equal(rows[3].announced, null);
});

test("announced actions carry the cited guidance record's own source label", () => {
  const rows = buildWeeklyReportRenderModel(buildLayoutPayload(), buildLayoutAssessment("compliant"), "standard").riskTable;
  assert.match(rows[0].announcedSource, /Form 10-Q/);
  assert.equal(rows[2].announcedSource, null);
});

test("the Biggest Risk/Opportunity boxes are no longer rendered", () => {
  const html = renderReportHtml(buildWeeklyReportRenderModel(buildLayoutPayload(), buildLayoutAssessment("compliant"), "standard"), null);
  assert.doesNotMatch(html, /Biggest Risk|Biggest Opportunity|class="callout/);
});

// --- Real PDF page counts (local Chrome, production page options) ---

const CHROME = process.env.CHROME_PATH || ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find((p) => fs.existsSync(p));
const skip = CHROME ? false : "No local Chrome/Chromium found -- set CHROME_PATH to run the PDF layout checks.";
if (!CHROME) console.log("[weekly-report-layout.test.cjs] PDF checks SKIPPED: no Chrome found.");

class LocalChromeRenderer {
  constructor() { this.pages = []; }
  async renderPdf(html) {
    const puppeteer = require("puppeteer-core");
    const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-first-run", "--no-sandbox"] });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "load" });
      await page.evaluate("document.fonts.ready.then(() => true)");
      const pdf = Buffer.from(await page.pdf(PDF_PAGE_OPTIONS));
      this.pages.push(countPdfPages(pdf));
      return { pdf, pageCount: countPdfPages(pdf) };
    } finally {
      await browser.close();
    }
  }
}

test("a prompt-compliant response renders in five pages at the STANDARD tier", { skip, timeout: 120000 }, async () => {
  const renderer = new LocalChromeRenderer();
  const result = await renderWeeklyReportPdf(buildLayoutPayload(), buildLayoutAssessment("compliant"), renderer, loadRrcLogoDataUri());
  assert.equal(result.status, "rendered", result.reason);
  assert.equal(result.reducedContent, false, `standard tier rendered ${renderer.pages[0]} pages`);
  assert.ok(result.pageCount <= 5);
});

test("a worst-case (validator-ceiling / longest-observed) response still renders in five pages via the REDUCED tier", { skip, timeout: 120000 }, async () => {
  const renderer = new LocalChromeRenderer();
  const result = await renderWeeklyReportPdf(buildLayoutPayload(), buildLayoutAssessment("worst"), renderer, loadRrcLogoDataUri());
  assert.equal(result.status, "rendered", result.reason);
  assert.ok(result.pageCount <= 5, `pages: ${renderer.pages.join(" -> ")}`);
  assert.equal(result.renderModel.riskTable.length, 4);
});
