const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./helpers/ts-loader.cjs");

const { getLatestWeeklyReportStatus, getLatestWeeklyReportDownload } = load("lib/reports/latest-report-service.ts");
const { InMemoryArtifactStore } = load("lib/reports/render/artifact-store.ts");

/** Same fake-Pool convention as tests/weekly-report-publish-service.test.cjs. */
function fakePool(rows) {
  return {
    async query() {
      return { rows: rows ? [rows] : [] };
    }
  };
}

function publishedSnapshotRow(overrides = {}) {
  return {
    id: "snap-1",
    storage_week_ending: "2026-08-28",
    status: "published",
    schema_version: "1.0.0",
    failed_reason: null,
    data_cutoff_at: "2026-09-03T18:00:00.000Z",
    payload: { schemaVersion: "1.0.0", storageWeekEnding: "2026-08-28", dataCutoffAt: "2026-09-03T18:00:00.000Z", modules: {}, sourceManifest: { generatedFrom: [] } },
    input_fingerprint: "fp-abc",
    source_manifest: { generatedFrom: [] },
    readiness: { ready: true, missingRequired: [], degradedOptional: [] },
    previous_snapshot_id: null,
    artifact_key: "https://example.blob.vercel-storage.com/reports/weekly/2026-08-28.pdf",
    artifact_checksum: "abc123",
    artifact_size_bytes: 49301,
    artifact_content_type: "application/pdf",
    created_at: "2026-09-03T18:00:00.000Z",
    updated_at: "2026-09-03T20:00:00.000Z",
    published_at: "2026-09-03T20:00:00.000Z",
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// getLatestWeeklyReportStatus
// ---------------------------------------------------------------------------

test("getLatestWeeklyReportStatus: available when a fully published snapshot exists", async () => {
  const status = await getLatestWeeklyReportStatus(fakePool(publishedSnapshotRow()));
  assert.deepEqual(status, { available: true, storageWeekEnding: "2026-08-28", publishedAt: "2026-09-03T20:00:00.000Z", sizeBytes: 49301 });
});

test("getLatestWeeklyReportStatus: unavailable when nothing has ever been published", async () => {
  const status = await getLatestWeeklyReportStatus(fakePool(null));
  assert.deepEqual(status, { available: false });
});

test("getLatestWeeklyReportStatus: unavailable when the row is missing its artifact key (defensive -- should never happen for a real published row)", async () => {
  const status = await getLatestWeeklyReportStatus(fakePool(publishedSnapshotRow({ artifact_key: null })));
  assert.deepEqual(status, { available: false });
});

// ---------------------------------------------------------------------------
// getLatestWeeklyReportDownload
// ---------------------------------------------------------------------------

test("getLatestWeeklyReportDownload: returns the real stored bytes, content type, and a friendly filename", async () => {
  const store = new InMemoryArtifactStore();
  const pdfBytes = Buffer.from("%PDF-1.4 fake pdf bytes");
  await store.put("https://example.blob.vercel-storage.com/reports/weekly/2026-08-28.pdf", pdfBytes, "application/pdf");

  const result = await getLatestWeeklyReportDownload(fakePool(publishedSnapshotRow()), store);

  assert.equal(result.available, true);
  assert.deepEqual(result.bytes, pdfBytes);
  assert.equal(result.contentType, "application/pdf");
  assert.equal(result.filename, "Weekly-Range-Resources-AI-Intelligence-Report-2026-08-28.pdf");
});

test("getLatestWeeklyReportDownload: unavailable when nothing has ever been published", async () => {
  const result = await getLatestWeeklyReportDownload(fakePool(null), new InMemoryArtifactStore());
  assert.deepEqual(result, { available: false });
});

test("getLatestWeeklyReportDownload: unavailable when no artifact storage provider is configured", async () => {
  const result = await getLatestWeeklyReportDownload(fakePool(publishedSnapshotRow()), null);
  assert.deepEqual(result, { available: false });
});

test("getLatestWeeklyReportDownload: unavailable when the artifact metadata exists but the store has no bytes for that key (never crashes)", async () => {
  const result = await getLatestWeeklyReportDownload(fakePool(publishedSnapshotRow()), new InMemoryArtifactStore());
  assert.deepEqual(result, { available: false });
});

test("getLatestWeeklyReportDownload: unavailable (not thrown) when the artifact store itself throws", async () => {
  const throwingStore = { async get() { throw new Error("network error"); } };
  const result = await getLatestWeeklyReportDownload(fakePool(publishedSnapshotRow()), throwingStore);
  assert.deepEqual(result, { available: false });
});

// ---------------------------------------------------------------------------
// Source-inspection: the read path never builds/generates anything
// ---------------------------------------------------------------------------

test("latest-report-service.ts never imports the AI, Chromium, or snapshot-building layers", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../lib/reports/latest-report-service.ts"), "utf8");
  assert.doesNotMatch(source, /anthropic-provider|ai\/prompt|pdf-renderer|weekly-report-pdf-service|snapshot-builder|publish-service/);
});

test("both /api/reports/latest route files never import the AI, PDF-rendering, or snapshot-building layers", () => {
  for (const file of ["../app/api/reports/latest/route.ts", "../app/api/reports/latest/download/route.ts"]) {
    const source = fs.readFileSync(path.resolve(__dirname, file), "utf8");
    assert.doesNotMatch(source, /anthropic-provider|ai\/prompt|pdf-renderer|weekly-report-pdf-service|snapshot-builder|publish-service|analyst-service/, `${file} must stay a pure read/serve path`);
  }
});
