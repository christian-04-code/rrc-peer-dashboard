const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const { SAMPLE_WEEKLY_REPORT_PAYLOAD, SAMPLE_WEEKLY_ANALYST_ASSESSMENT } = load("tests/fixtures/weekly-report-fixture.ts");
const { renderWeeklyReportPdf } = load("lib/reports/render/weekly-report-pdf-service.ts");
const { countPdfPages, NoopPdfRenderer, PdfRendererError, PDF_FOOTER_TEMPLATE } = load("lib/reports/render/pdf-renderer.ts");
const { MAX_PDF_PAGES } = load("lib/reports/render/content-budget.ts");
const { InMemoryArtifactStore, VercelBlobArtifactStore, ArtifactStorageError, computeChecksum } = load("lib/reports/render/artifact-store.ts");

// ---------------------------------------------------------------------------
// countPdfPages -- a lightweight, dependency-free page-object scan
// ---------------------------------------------------------------------------

test("countPdfPages counts real /Type /Page objects", () => {
  const fakePdf = Buffer.from("1 0 obj <</Type /Page>> endobj 2 0 obj <</Type /Page>> endobj 3 0 obj <</Type /Page>> endobj");
  assert.equal(countPdfPages(fakePdf), 3);
});

test("countPdfPages never counts the /Type /Pages page-TREE node as a page", () => {
  const fakePdf = Buffer.from("1 0 obj <</Type /Pages /Kids [2 0 R]>> endobj 2 0 obj <</Type /Page>> endobj");
  assert.equal(countPdfPages(fakePdf), 1);
});

test("countPdfPages returns 0 for a buffer with no page objects", () => {
  assert.equal(countPdfPages(Buffer.from("not a pdf")), 0);
});

// ---------------------------------------------------------------------------
// PdfRenderer safe default
// ---------------------------------------------------------------------------

test("NoopPdfRenderer throws PdfRendererError -- never silently returns fake bytes", async () => {
  await assert.rejects(() => new NoopPdfRenderer().renderPdf(), PdfRendererError);
});

// ---------------------------------------------------------------------------
// renderWeeklyReportPdf -- initial render + one reduced retry + fail-safe
// ---------------------------------------------------------------------------

function fakeRenderer(pageCounts) {
  let call = 0;
  const htmlByCall = [];
  return {
    calls: () => call,
    htmlByCall,
    async renderPdf(html) {
      htmlByCall.push(html);
      const pageCount = pageCounts[call] ?? pageCounts[pageCounts.length - 1];
      call += 1;
      return { pdf: Buffer.from(`fake-pdf-${call}`), pageCount };
    }
  };
}

test("a standard render within the page limit is returned directly -- no reduced retry", async () => {
  const renderer = fakeRenderer([4]);
  const result = await renderWeeklyReportPdf(SAMPLE_WEEKLY_REPORT_PAYLOAD, SAMPLE_WEEKLY_ANALYST_ASSESSMENT, renderer, null);
  assert.equal(result.status, "rendered");
  assert.equal(result.reducedContent, false);
  assert.equal(result.pageCount, 4);
  assert.equal(renderer.calls(), 1);
  assert.equal(result.renderModel.budgetTier, "standard");
});

test("an oversized standard render retries exactly once at the reduced budget, then returns it if it fits", async () => {
  const renderer = fakeRenderer([7, 4]);
  const result = await renderWeeklyReportPdf(SAMPLE_WEEKLY_REPORT_PAYLOAD, SAMPLE_WEEKLY_ANALYST_ASSESSMENT, renderer, null);
  assert.equal(result.status, "rendered");
  assert.equal(result.reducedContent, true);
  assert.equal(result.pageCount, 4);
  assert.equal(renderer.calls(), 2);
  assert.equal(result.renderModel.budgetTier, "reduced");
  assert.notEqual(renderer.htmlByCall[0], renderer.htmlByCall[1], "the reduced-budget HTML must differ from the standard-budget HTML");
});

test("a still-oversized reduced render fails safely -- exactly two attempts, never a third", async () => {
  const renderer = fakeRenderer([7, 6]);
  const result = await renderWeeklyReportPdf(SAMPLE_WEEKLY_REPORT_PAYLOAD, SAMPLE_WEEKLY_ANALYST_ASSESSMENT, renderer, null);
  assert.equal(result.status, "failed");
  assert.equal(result.lastPageCount, 6);
  assert.equal(renderer.calls(), 2);
  assert.match(result.reason, new RegExp(`hard maximum ${MAX_PDF_PAGES}`));
});

test("a page count exactly at the hard maximum is accepted, not treated as oversized", async () => {
  const renderer = fakeRenderer([MAX_PDF_PAGES]);
  const result = await renderWeeklyReportPdf(SAMPLE_WEEKLY_REPORT_PAYLOAD, SAMPLE_WEEKLY_ANALYST_ASSESSMENT, renderer, null);
  assert.equal(result.status, "rendered");
  assert.equal(renderer.calls(), 1);
});

test("renderWeeklyReportPdf propagates a PdfRenderer failure rather than swallowing it", async () => {
  const throwingRenderer = { async renderPdf() { throw new Error("chromium crashed"); } };
  await assert.rejects(() => renderWeeklyReportPdf(SAMPLE_WEEKLY_REPORT_PAYLOAD, SAMPLE_WEEKLY_ANALYST_ASSESSMENT, throwingRenderer, null), /chromium crashed/);
});

test("PDF_FOOTER_TEMPLATE includes page-number placeholders for Puppeteer's own substitution", () => {
  assert.match(PDF_FOOTER_TEMPLATE, /class="pageNumber"/);
  assert.match(PDF_FOOTER_TEMPLATE, /class="totalPages"/);
});

// ---------------------------------------------------------------------------
// Artifact storage abstraction
// ---------------------------------------------------------------------------

test("InMemoryArtifactStore round-trips a buffer and computes a stable checksum", async () => {
  const store = new InMemoryArtifactStore();
  const buffer = Buffer.from("sample pdf bytes");
  const result = await store.put("reports/2026-08-28.pdf", buffer, "application/pdf");
  assert.equal(result.key, "reports/2026-08-28.pdf");
  assert.equal(result.sizeBytes, buffer.byteLength);
  assert.equal(result.checksum, computeChecksum(buffer));
  assert.deepEqual(store.get("reports/2026-08-28.pdf"), buffer);
});

test("VercelBlobArtifactStore throws ArtifactStorageError immediately when no token is configured", () => {
  const originalToken = process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  try {
    assert.throws(() => new VercelBlobArtifactStore(), ArtifactStorageError);
  } finally {
    if (originalToken !== undefined) process.env.BLOB_READ_WRITE_TOKEN = originalToken;
  }
});

test("VercelBlobArtifactStore constructs successfully when an explicit token is supplied", () => {
  assert.doesNotThrow(() => new VercelBlobArtifactStore({ token: "fake-token-for-construction-test-only" }));
});
