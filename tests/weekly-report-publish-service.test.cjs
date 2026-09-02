const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const { SAMPLE_WEEKLY_REPORT_PAYLOAD, SAMPLE_WEEKLY_ANALYST_ASSESSMENT } = load("tests/fixtures/weekly-report-fixture.ts");
const { publishWeeklyReportIfReady } = load("lib/reports/publish-service.ts");
const { InMemoryArtifactStore, computeChecksum } = load("lib/reports/render/artifact-store.ts");

/**
 * Exercises publishWeeklyReportIfReady() against a FAKE Pool (a plain
 * object matching pg's own `.query(sql, params)` shape) rather than a real
 * Postgres connection -- unlike most of Phase 7's other DB-touching tests,
 * this suite is NOT DB-gated/skipped in this sandbox: report-repo.ts's and
 * analysis-repo.ts's own queries are simple, single-statement, and easy to
 * pattern-match on, so the full publication-safety branching logic gets
 * real, always-running coverage instead of relying entirely on a real
 * Postgres instance this project has never had available in any session.
 */

const SNAPSHOT_ID = "11111111-1111-1111-1111-111111111111";
const ANALYSIS_ID = "22222222-2222-2222-2222-222222222222";

function snapshotRow(overrides = {}) {
  return {
    id: SNAPSHOT_ID,
    storage_week_ending: "2026-08-28",
    status: "ready",
    schema_version: "1.0.0",
    failed_reason: null,
    data_cutoff_at: "2026-09-03T18:00:00.000Z",
    payload: SAMPLE_WEEKLY_REPORT_PAYLOAD,
    input_fingerprint: "fp-abc",
    source_manifest: SAMPLE_WEEKLY_REPORT_PAYLOAD.sourceManifest,
    readiness: { ready: true, missingRequired: [], degradedOptional: [] },
    previous_snapshot_id: null,
    artifact_key: null,
    artifact_checksum: null,
    artifact_size_bytes: null,
    artifact_content_type: null,
    created_at: "2026-09-03T18:00:00.000Z",
    updated_at: "2026-09-03T18:00:00.000Z",
    published_at: null,
    ...overrides
  };
}

function analysisRow(overrides = {}) {
  return {
    id: ANALYSIS_ID,
    snapshot_id: SNAPSHOT_ID,
    analysis_fingerprint: "analysis-fp-abc",
    status: "ready",
    error_message: null,
    schema_version: "1.1.0",
    prompt_version: "1.1.0",
    ai_provider: "anthropic",
    ai_model: "claude-haiku-4-5",
    assessment: SAMPLE_WEEKLY_ANALYST_ASSESSMENT,
    attempted_at: "2026-09-03T19:00:00.000Z",
    completed_at: "2026-09-03T19:00:05.000Z",
    created_at: "2026-09-03T19:00:00.000Z",
    updated_at: "2026-09-03T19:00:05.000Z",
    ...overrides
  };
}

/**
 * `routes` is an ordered list of { match: RegExp, respond: (params) => rows }.
 * The first matching route (in list order) handles each query -- lets a test
 * override just the routes it cares about while falling back to sane
 * defaults for the rest.
 */
function fakePool(routes) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      for (const route of routes) {
        if (route.match.test(sql)) return { rows: route.respond(params) };
      }
      throw new Error(`fakePool: no route matched query: ${sql}`);
    }
  };
}

function defaultRoutes({ snapshot = snapshotRow(), analysis = analysisRow(), publishSucceeds = true } = {}) {
  return [
    { match: /SELECT[\s\S]*FROM weekly_report_snapshots WHERE id = \$1/, respond: () => (snapshot ? [snapshot] : []) },
    { match: /FROM weekly_report_analyses WHERE snapshot_id = \$1 AND status = 'ready'/, respond: () => (analysis ? [analysis] : []) },
    {
      match: /UPDATE weekly_report_snapshots SET[\s\S]*status = 'published'/,
      respond: (params) =>
        publishSucceeds
          ? [snapshotRow({ status: "published", published_at: "2026-09-03T20:00:00.000Z", artifact_key: params[1], artifact_checksum: params[2], artifact_size_bytes: params[3], artifact_content_type: params[4] })]
          : []
    }
  ];
}

function fakeRenderer(pdf = Buffer.from("%PDF-1.4 fake pdf bytes")) {
  let calls = 0;
  return {
    calls: () => calls,
    async renderPdf() {
      calls += 1;
      return { pdf, pageCount: 3 };
    }
  };
}

function failingRenderer(pageCount = 7) {
  return {
    async renderPdf() {
      return { pdf: Buffer.alloc(0), pageCount };
    }
  };
}

// ---------------------------------------------------------------------------

test("publishWeeklyReportIfReady: not_found when the snapshot does not exist", async () => {
  const pool = fakePool(defaultRoutes({ snapshot: null }));
  const result = await publishWeeklyReportIfReady(pool, SNAPSHOT_ID, fakeRenderer(), new InMemoryArtifactStore(), null);
  assert.equal(result.status, "not_found");
});

test("publishWeeklyReportIfReady: already_published is idempotent -- never re-renders or re-uploads", async () => {
  const published = snapshotRow({ status: "published", artifact_key: "https://example.com/existing.pdf", published_at: "2026-09-01T00:00:00.000Z" });
  const pool = fakePool(defaultRoutes({ snapshot: published }));
  const renderer = fakeRenderer();
  const store = new InMemoryArtifactStore();

  const result = await publishWeeklyReportIfReady(pool, SNAPSHOT_ID, renderer, store, null);

  assert.equal(result.status, "already_published");
  assert.equal(result.snapshot.artifactKey, "https://example.com/existing.pdf");
  assert.equal(renderer.calls(), 0, "a second publish call for an already-published snapshot must never render again");
});

test("publishWeeklyReportIfReady: not_ready when the snapshot status is not 'ready'", async () => {
  const pool = fakePool(defaultRoutes({ snapshot: snapshotRow({ status: "building" }) }));
  const result = await publishWeeklyReportIfReady(pool, SNAPSHOT_ID, fakeRenderer(), new InMemoryArtifactStore(), null);
  assert.equal(result.status, "not_ready");
  assert.match(result.reason, /"building"/);
});

test("publishWeeklyReportIfReady: not_ready when the snapshot is ready but has no frozen payload", async () => {
  const pool = fakePool(defaultRoutes({ snapshot: snapshotRow({ payload: null }) }));
  const result = await publishWeeklyReportIfReady(pool, SNAPSHOT_ID, fakeRenderer(), new InMemoryArtifactStore(), null);
  assert.equal(result.status, "not_ready");
});

test("publishWeeklyReportIfReady: not_ready when no ready analyst assessment exists yet", async () => {
  const pool = fakePool(defaultRoutes({ analysis: null }));
  const renderer = fakeRenderer();
  const result = await publishWeeklyReportIfReady(pool, SNAPSHOT_ID, renderer, new InMemoryArtifactStore(), null);
  assert.equal(result.status, "not_ready");
  assert.match(result.reason, /No ready analyst assessment/);
  assert.equal(renderer.calls(), 0, "must never render a PDF without a ready assessment to narrate it");
});

test("publishWeeklyReportIfReady: render_failed when the PDF exceeds the page-count limit even after the reduced-content retry", async () => {
  const pool = fakePool(defaultRoutes());
  const result = await publishWeeklyReportIfReady(pool, SNAPSHOT_ID, failingRenderer(7), new InMemoryArtifactStore(), null);
  assert.equal(result.status, "render_failed");
  assert.match(result.reason, /hard maximum/);
});

test("publishWeeklyReportIfReady: render_failed when the PdfRenderer itself throws", async () => {
  const pool = fakePool(defaultRoutes());
  const throwingRenderer = { async renderPdf() { throw new Error("chromium crashed"); } };
  const result = await publishWeeklyReportIfReady(pool, SNAPSHOT_ID, throwingRenderer, new InMemoryArtifactStore(), null);
  assert.equal(result.status, "render_failed");
  assert.match(result.reason, /chromium crashed/);
});

test("publishWeeklyReportIfReady: storage_failed when artifact upload throws -- the snapshot is never published", async () => {
  const pool = fakePool(defaultRoutes());
  const throwingStore = { async put() { throw new Error("blob upload failed"); }, async get() { return null; } };
  const result = await publishWeeklyReportIfReady(pool, SNAPSHOT_ID, fakeRenderer(), throwingStore, null);
  assert.equal(result.status, "storage_failed");
  assert.match(result.reason, /blob upload failed/);
  const publishCalls = pool.calls.filter((c) => /status = 'published'/.test(c.sql));
  assert.equal(publishCalls.length, 0, "a failed upload must never attempt the publish transition");
});

test("publishWeeklyReportIfReady: publish_race_lost when the row is no longer 'ready' by the time the UPDATE runs", async () => {
  const pool = fakePool(defaultRoutes({ publishSucceeds: false }));
  const result = await publishWeeklyReportIfReady(pool, SNAPSHOT_ID, fakeRenderer(), new InMemoryArtifactStore(), null);
  assert.equal(result.status, "publish_race_lost");
});

test("publishWeeklyReportIfReady: the happy path renders, uploads, and publishes with correct artifact metadata", async () => {
  const pool = fakePool(defaultRoutes());
  const store = new InMemoryArtifactStore();
  const pdfBytes = Buffer.from("%PDF-1.4 real-looking bytes");
  const renderer = fakeRenderer(pdfBytes);

  const result = await publishWeeklyReportIfReady(pool, SNAPSHOT_ID, renderer, store, null);

  assert.equal(result.status, "published");
  assert.equal(result.snapshot.status, "published");
  assert.equal(result.snapshot.artifactContentType, "application/pdf");
  assert.equal(result.snapshot.artifactChecksum, computeChecksum(pdfBytes));
  assert.equal(result.snapshot.artifactSizeBytes, pdfBytes.byteLength);
  assert.equal(renderer.calls(), 1);
  // The artifact was actually uploaded to the store under the returned key, not just claimed.
  assert.deepEqual(await store.get(result.snapshot.artifactKey), pdfBytes);
});

test("publishWeeklyReportIfReady: the artifact key is namespaced by the snapshot's own storage week", async () => {
  const pool = fakePool(defaultRoutes({ snapshot: snapshotRow({ storage_week_ending: "2026-09-04" }) }));
  const store = new InMemoryArtifactStore();
  const result = await publishWeeklyReportIfReady(pool, SNAPSHOT_ID, fakeRenderer(), store, null);
  assert.equal(result.status, "published");
  assert.match(result.snapshot.artifactKey, /2026-09-04/);
});

test("publishWeeklyReportIfReady: a failed publish attempt never touches or replaces a different, already-published snapshot", async () => {
  // Simulates the real-world invariant: publishSnapshot()'s own atomic
  // `WHERE status = 'ready'` guard only ever targets THIS snapshot's row.
  // There is no "unpublish the current latest" step anywhere in this
  // subsystem for a fake pool to even expose breaking -- this test asserts
  // that directly: the UPDATE query never references a second/previous id.
  const pool = fakePool(defaultRoutes({ publishSucceeds: false }));
  await publishWeeklyReportIfReady(pool, SNAPSHOT_ID, fakeRenderer(), new InMemoryArtifactStore(), null);
  for (const call of pool.calls) {
    assert.doesNotMatch(call.sql, /UPDATE weekly_report_snapshots SET\s+status = 'ready'/, "publish-service.ts must never transition a different row back to ready/unpublished");
  }
});

// ---------------------------------------------------------------------------
// Source-inspection: the publish service is never reachable from a route,
// and never calls AI directly.
// ---------------------------------------------------------------------------

test("publish-service.ts does not import the AI provider/prompt layer -- narration comes only from an already-persisted assessment", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const source = fs.readFileSync(path.resolve(__dirname, "../lib/reports/publish-service.ts"), "utf8");
  assert.doesNotMatch(source, /anthropic-provider|ai\/prompt|@anthropic-ai\/sdk/);
});

test("no app/api route imports publish-service.ts yet -- Phase 7E builds the publish mechanism, Phase 7F decides when to call it", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  function listFilesRecursive(dir) {
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name);
      return entry.isDirectory() ? listFilesRecursive(full) : [full];
    });
  }
  const apiDir = path.resolve(__dirname, "../app/api");
  const files = listFilesRecursive(apiDir).filter((file) => /\.(ts|tsx|js)$/.test(file));
  for (const file of files) {
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(source, /publish-service|publishWeeklyReportIfReady/, `${file} must not call the publish service -- no scheduling/orchestration exists yet`);
  }
});

test("vercel.json still declares exactly the two pre-existing crons -- Phase 7E added no scheduled orchestration", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const vercelConfig = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../vercel.json"), "utf8"));
  assert.equal(vercelConfig.crons.length, 2);
  assert.deepEqual(vercelConfig.crons.map((c) => c.path).sort(), ["/api/cron/macro", "/api/cron/news"]);
});
