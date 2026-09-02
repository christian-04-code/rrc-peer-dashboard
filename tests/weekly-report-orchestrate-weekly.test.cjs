const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./helpers/ts-loader.cjs");

const { orchestrateWeeklyReport, PUBLISH_SAFETY_BUFFER_MS } = load("lib/reports/orchestrate-weekly.ts");
const { SAMPLE_WEEKLY_REPORT_PAYLOAD, SAMPLE_WEEKLY_ANALYST_ASSESSMENT } = load("tests/fixtures/weekly-report-fixture.ts");
const { InMemoryArtifactStore } = load("lib/reports/render/artifact-store.ts");

/**
 * Exercises orchestrateWeeklyReport() end to end against fakes for every
 * dependency that would otherwise touch a real network/DB connection:
 * `buildSnapshot`/`buildAnalystInput` (Macro's own evidence collection is
 * entirely live-fetched -- see the file's own header), `provider`
 * (never a real Anthropic call), `pdfRenderer` (never real Chromium),
 * `artifactStorage` (never real Vercel Blob), `pool` (a fake matching pg's
 * `.query()` shape, same technique as weekly-report-publish-service.test.cjs),
 * and `runMigrations` (a no-op, since the real one always touches the real
 * shared pool regardless of what `pool` is injected here).
 */

const SNAPSHOT_ID = "33333333-3333-3333-3333-333333333333";
const NOW = new Date("2026-09-04T17:00:00.000Z");

function readySnapshot(overrides = {}) {
  return {
    id: SNAPSHOT_ID,
    storageWeekEnding: "2026-08-28",
    status: "ready",
    schemaVersion: "1.0.0",
    failedReason: null,
    dataCutoffAt: "2026-09-03T18:00:00.000Z",
    payload: SAMPLE_WEEKLY_REPORT_PAYLOAD,
    inputFingerprint: "fp-abc",
    sourceManifest: SAMPLE_WEEKLY_REPORT_PAYLOAD.sourceManifest,
    readiness: { ready: true, missingRequired: [], degradedOptional: [] },
    previousSnapshotId: null,
    artifactKey: null,
    artifactChecksum: null,
    artifactSizeBytes: null,
    artifactContentType: null,
    // Two hours before NOW -- comfortably outside PUBLISH_SAFETY_BUFFER_MS (1h).
    createdAt: "2026-09-04T15:00:00.000Z",
    updatedAt: "2026-09-04T15:00:00.000Z",
    publishedAt: null,
    ...overrides
  };
}

function snapshotRow(record) {
  return {
    id: record.id,
    storage_week_ending: record.storageWeekEnding,
    status: record.status,
    schema_version: record.schemaVersion,
    failed_reason: record.failedReason,
    data_cutoff_at: record.dataCutoffAt,
    payload: record.payload,
    input_fingerprint: record.inputFingerprint,
    source_manifest: record.sourceManifest,
    readiness: record.readiness,
    previous_snapshot_id: record.previousSnapshotId,
    artifact_key: record.artifactKey,
    artifact_checksum: record.artifactChecksum,
    artifact_size_bytes: record.artifactSizeBytes,
    artifact_content_type: record.artifactContentType,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    published_at: record.publishedAt
  };
}

/** Same ordered-route fake Pool as weekly-report-publish-service.test.cjs. */
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

function lockRoutes(locked = true) {
  return [
    { match: /pg_try_advisory_lock/, respond: () => [{ locked }] },
    { match: /pg_advisory_unlock/, respond: () => [{ unlocked: true }] }
  ];
}

/** Routes for generateWeeklyAnalysisIfNeeded + publishWeeklyReportIfReady's own real queries, given a starting snapshot record. `analysisReadyOnFirstLookup` simulates a pre-existing cached analysis (cache-hit path). */
function fullPipelineRoutes({ snapshot, analysisReadyOnFirstLookup = false, publishSucceeds = true } = {}) {
  let pendingAnalysisRow = null;
  return [
    ...lockRoutes(true),
    { match: /SELECT[\s\S]*FROM weekly_report_analyses WHERE analysis_fingerprint = \$1 AND status = 'ready'/, respond: () => (analysisReadyOnFirstLookup ? [analysisRow()] : pendingAnalysisRow && pendingAnalysisRow.status === "ready" ? [pendingAnalysisRow] : []) },
    { match: /SELECT[\s\S]*FROM weekly_report_analyses WHERE analysis_fingerprint = \$1 AND status = 'pending'/, respond: () => (pendingAnalysisRow && pendingAnalysisRow.status === "pending" ? [pendingAnalysisRow] : []) },
    {
      match: /INSERT INTO weekly_report_analyses/,
      respond: (params) => {
        pendingAnalysisRow = { id: "analysis-1", snapshot_id: params[0], analysis_fingerprint: params[1], status: "pending", error_message: null, schema_version: params[2], prompt_version: params[3], ai_provider: null, ai_model: null, assessment: null, attempted_at: NOW.toISOString(), completed_at: null, created_at: NOW.toISOString(), updated_at: NOW.toISOString() };
        return [pendingAnalysisRow];
      }
    },
    {
      match: /UPDATE weekly_report_analyses SET\s+status = 'ready'/,
      respond: (params) => {
        // A real jsonb column round-trips markAnalysisReady's JSON.stringify(assessment)
        // back into a parsed object -- the fake pool must mimic that, or the assessment
        // downstream code reads back out is a raw JSON string instead of an object.
        pendingAnalysisRow = { ...pendingAnalysisRow, status: "ready", ai_provider: params[1], ai_model: params[2], assessment: JSON.parse(params[3]), completed_at: NOW.toISOString() };
        return [pendingAnalysisRow];
      }
    },
    {
      match: /UPDATE weekly_report_analyses SET status = 'failed'/,
      respond: (params) => {
        pendingAnalysisRow = { ...pendingAnalysisRow, status: "failed", error_message: params[1] };
        return [pendingAnalysisRow];
      }
    },
    { match: /SELECT[\s\S]*FROM weekly_report_snapshots WHERE id = \$1/, respond: () => [snapshotRow(snapshot)] },
    {
      match: /FROM weekly_report_analyses WHERE snapshot_id = \$1 AND status = 'ready'/,
      respond: () => (analysisReadyOnFirstLookup ? [analysisRow()] : pendingAnalysisRow && pendingAnalysisRow.status === "ready" ? [pendingAnalysisRow] : [])
    },
    {
      match: /UPDATE weekly_report_snapshots SET[\s\S]*status = 'published'/,
      respond: (params) =>
        publishSucceeds ? [snapshotRow({ ...snapshot, status: "published", publishedAt: NOW.toISOString(), artifactKey: params[1], artifactChecksum: params[2], artifactSizeBytes: params[3], artifactContentType: params[4] })] : []
    }
  ];
}

function analysisRow() {
  return {
    id: "analysis-cached",
    snapshot_id: SNAPSHOT_ID,
    analysis_fingerprint: "whatever",
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
    updated_at: "2026-09-03T19:00:05.000Z"
  };
}

function fakeProvider(assessment = SAMPLE_WEEKLY_ANALYST_ASSESSMENT, failTimes = 0) {
  let calls = 0;
  return {
    providerName: "fake",
    modelName: "fake-model",
    calls: () => calls,
    async analyze() {
      calls += 1;
      if (calls <= failTimes) throw new Error(`simulated failure #${calls}`);
      return assessment;
    }
  };
}

function fakeRenderer(pageCount = 3) {
  let calls = 0;
  return {
    calls: () => calls,
    async renderPdf() {
      calls += 1;
      return { pdf: Buffer.from("%PDF-1.4 fake"), pageCount };
    }
  };
}

function noopMigrations() {
  return async () => undefined;
}

function neverBuildSnapshot() {
  return async () => {
    throw new Error("buildSnapshot must not be called when the lock is unavailable");
  };
}

// ---------------------------------------------------------------------------

test("orchestrateWeeklyReport: locked when the advisory lock is unavailable -- never calls buildSnapshot/AI/render/upload", async () => {
  const pool = fakePool(lockRoutes(false));
  const buildSnapshot = neverBuildSnapshot();
  const renderer = fakeRenderer();
  const provider = fakeProvider();

  const result = await orchestrateWeeklyReport({ pool, now: NOW, runMigrations: noopMigrations(), buildSnapshot, provider, pdfRenderer: renderer, artifactStorage: new InMemoryArtifactStore() });

  assert.equal(result.stage, "locked");
  assert.equal(provider.calls(), 0);
  assert.equal(renderer.calls(), 0);
});

test("orchestrateWeeklyReport: always releases the lock, even after an unexpected error", async () => {
  const pool = fakePool(lockRoutes(true));
  const buildSnapshot = async () => {
    throw new Error("boom");
  };
  await orchestrateWeeklyReport({ pool, now: NOW, runMigrations: noopMigrations(), buildSnapshot });
  const unlockCalls = pool.calls.filter((c) => /pg_advisory_unlock/.test(c.sql));
  assert.equal(unlockCalls.length, 1);
});

test("orchestrateWeeklyReport: already_published when the storage week is not newer than the latest published report -- no AI/render/upload", async () => {
  const pool = fakePool(lockRoutes(true));
  const buildSnapshot = async () => ({ status: "already_published", snapshot: readySnapshot({ status: "published" }) });
  const provider = fakeProvider();
  const renderer = fakeRenderer();

  const result = await orchestrateWeeklyReport({ pool, now: NOW, runMigrations: noopMigrations(), buildSnapshot, provider, pdfRenderer: renderer, artifactStorage: new InMemoryArtifactStore() });

  assert.equal(result.stage, "already_published");
  assert.equal(provider.calls(), 0);
  assert.equal(renderer.calls(), 0);
});

test("orchestrateWeeklyReport: not_ready when required inputs have not passed readiness yet -- no AI/render/upload, never reported as 'failed'", async () => {
  const pool = fakePool(lockRoutes(true));
  const buildSnapshot = async () => ({ status: "failed", snapshot: readySnapshot({ status: "failed" }), reason: "Required input(s) missing: macroFundamentalsSnapshot" });
  const provider = fakeProvider();

  const result = await orchestrateWeeklyReport({ pool, now: NOW, runMigrations: noopMigrations(), buildSnapshot, provider });

  assert.equal(result.stage, "not_ready");
  assert.match(result.reason, /macroFundamentalsSnapshot/);
  assert.equal(provider.calls(), 0);
});

test("orchestrateWeeklyReport: not_ready when no valid EIA storage period exists yet", async () => {
  const pool = fakePool(lockRoutes(true));
  const buildSnapshot = async () => ({ status: "no_valid_storage_period" });
  const result = await orchestrateWeeklyReport({ pool, now: NOW, runMigrations: noopMigrations(), buildSnapshot });
  assert.equal(result.stage, "not_ready");
});

test("orchestrateWeeklyReport: not_ready while a freshly-built snapshot is still inside its safety buffer -- no AI/render/upload", async () => {
  const pool = fakePool(lockRoutes(true));
  // createdAt === now: zero time has elapsed since this snapshot was first built.
  const buildSnapshot = async () => ({ status: "ready", snapshot: readySnapshot({ createdAt: NOW.toISOString(), updatedAt: NOW.toISOString() }), changes: [] });
  const provider = fakeProvider();
  const renderer = fakeRenderer();

  const result = await orchestrateWeeklyReport({ pool, now: NOW, runMigrations: noopMigrations(), buildSnapshot, provider, pdfRenderer: renderer, artifactStorage: new InMemoryArtifactStore() });

  assert.equal(result.stage, "not_ready");
  assert.match(result.reason, /safety buffer/);
  assert.equal(provider.calls(), 0);
  assert.equal(renderer.calls(), 0);
});

test("orchestrateWeeklyReport: a snapshot built exactly at the buffer boundary is not yet eligible (strictly greater-than-buffer required)", async () => {
  const pool = fakePool(lockRoutes(true));
  const createdAt = new Date(NOW.getTime() - PUBLISH_SAFETY_BUFFER_MS + 1000).toISOString(); // 1s short of the full buffer
  const buildSnapshot = async () => ({ status: "ready", snapshot: readySnapshot({ createdAt, updatedAt: createdAt }), changes: [] });
  const result = await orchestrateWeeklyReport({ pool, now: NOW, runMigrations: noopMigrations(), buildSnapshot });
  assert.equal(result.stage, "not_ready");
});

test("orchestrateWeeklyReport: not_ready (not failed) when ANTHROPIC_API_KEY is not configured -- deterministic snapshot work is unaffected", async () => {
  const pool = fakePool(lockRoutes(true));
  const buildSnapshot = async () => ({ status: "ready", snapshot: readySnapshot(), changes: [] });
  const originalKey = process.env.ANTHROPIC_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  try {
    const result = await orchestrateWeeklyReport({ pool, now: NOW, runMigrations: noopMigrations(), buildSnapshot });
    assert.equal(result.stage, "not_ready");
    assert.equal(result.analysisStatus, "skipped_not_configured");
  } finally {
    if (originalKey !== undefined) process.env.ANTHROPIC_API_KEY = originalKey;
  }
});

test("orchestrateWeeklyReport: not_ready (not failed) when BLOB_READ_WRITE_TOKEN is not configured", async () => {
  const pool = fakePool(lockRoutes(true));
  const buildSnapshot = async () => ({ status: "ready", snapshot: readySnapshot(), changes: [] });
  const originalToken = process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.BLOB_READ_WRITE_TOKEN;
  try {
    const result = await orchestrateWeeklyReport({ pool, now: NOW, runMigrations: noopMigrations(), buildSnapshot, provider: fakeProvider() });
    assert.equal(result.stage, "not_ready");
    assert.equal(result.publishStatus, "skipped_not_configured");
  } finally {
    if (originalToken !== undefined) process.env.BLOB_READ_WRITE_TOKEN = originalToken;
  }
});

test("orchestrateWeeklyReport: the full happy path reaches 'published' with exactly one semantic AI call", async () => {
  const snapshot = readySnapshot();
  const pool = fakePool(fullPipelineRoutes({ snapshot }));
  const buildSnapshot = async () => ({ status: "ready", snapshot, changes: [] });
  const buildAnalystInput = async () => ({
    schemaVersion: "1.0.0",
    report: { storageWeekEnding: snapshot.storageWeekEnding, dataCutoffAt: snapshot.dataCutoffAt },
    marketBackdrop: [],
    riskCandidates: [],
    opportunityCandidates: [],
    whatChanged: [],
    range: [],
    peers: [],
    news: [],
    outlook: [],
    sourcesFreshness: [],
    previousReportContext: null,
    evidenceAllowlist: []
  });
  const provider = fakeProvider();
  const renderer = fakeRenderer(3);
  const store = new InMemoryArtifactStore();

  const result = await orchestrateWeeklyReport({ pool, now: NOW, runMigrations: noopMigrations(), buildSnapshot, buildAnalystInput, provider, pdfRenderer: renderer, artifactStorage: store });

  assert.equal(result.stage, "published");
  assert.equal(result.snapshotStatus, "built");
  assert.equal(result.analysisStatus, "generated");
  assert.equal(result.publishStatus, "published");
  assert.equal(provider.calls(), 1, "exactly one semantic analyst call -- no per-section/multiple AI calls");
  assert.equal(renderer.calls(), 1);
});

test("orchestrateWeeklyReport: reuses an existing ready snapshot (active_attempt_exists) once its own buffer has elapsed", async () => {
  const snapshot = readySnapshot(); // createdAt is 2h before NOW
  const pool = fakePool(fullPipelineRoutes({ snapshot }));
  const buildSnapshot = async () => ({ status: "active_attempt_exists", snapshot });
  const buildAnalystInput = async () => ({
    schemaVersion: "1.0.0",
    report: { storageWeekEnding: snapshot.storageWeekEnding, dataCutoffAt: snapshot.dataCutoffAt },
    marketBackdrop: [],
    riskCandidates: [],
    opportunityCandidates: [],
    whatChanged: [],
    range: [],
    peers: [],
    news: [],
    outlook: [],
    sourcesFreshness: [],
    previousReportContext: null,
    evidenceAllowlist: []
  });

  const result = await orchestrateWeeklyReport({ pool, now: NOW, runMigrations: noopMigrations(), buildSnapshot, buildAnalystInput, provider: fakeProvider(), pdfRenderer: fakeRenderer(), artifactStorage: new InMemoryArtifactStore() });

  assert.equal(result.stage, "published");
  assert.equal(result.snapshotStatus, "reused");
});

test("orchestrateWeeklyReport: locked (not failed) when another process's snapshot attempt is still pending/building", async () => {
  const pool = fakePool(lockRoutes(true));
  const buildSnapshot = async () => ({ status: "active_attempt_exists", snapshot: readySnapshot({ status: "building" }) });
  const result = await orchestrateWeeklyReport({ pool, now: NOW, runMigrations: noopMigrations(), buildSnapshot });
  assert.equal(result.stage, "locked");
});

test("orchestrateWeeklyReport: reuses a cached ready analysis (cache_hit) -- the provider is never invoked", async () => {
  const snapshot = readySnapshot();
  const pool = fakePool(fullPipelineRoutes({ snapshot, analysisReadyOnFirstLookup: true }));
  const buildSnapshot = async () => ({ status: "ready", snapshot, changes: [] });
  const buildAnalystInput = async () => ({
    schemaVersion: "1.0.0",
    report: { storageWeekEnding: snapshot.storageWeekEnding, dataCutoffAt: snapshot.dataCutoffAt },
    marketBackdrop: [],
    riskCandidates: [],
    opportunityCandidates: [],
    whatChanged: [],
    range: [],
    peers: [],
    news: [],
    outlook: [],
    sourcesFreshness: [],
    previousReportContext: null,
    evidenceAllowlist: []
  });
  const provider = fakeProvider();
  const renderer = fakeRenderer();

  const result = await orchestrateWeeklyReport({ pool, now: NOW, runMigrations: noopMigrations(), buildSnapshot, buildAnalystInput, provider, pdfRenderer: renderer, artifactStorage: new InMemoryArtifactStore() });

  assert.equal(result.stage, "published");
  assert.equal(result.analysisStatus, "cache_hit");
  assert.equal(provider.calls(), 0, "a cached ready analysis must never trigger a new Anthropic call");
  assert.equal(renderer.calls(), 1, "rendering still happens from the cached assessment");
});

test("orchestrateWeeklyReport: AI failure -- no render, no publish", async () => {
  const snapshot = readySnapshot();
  const pool = fakePool(fullPipelineRoutes({ snapshot }));
  const buildSnapshot = async () => ({ status: "ready", snapshot, changes: [] });
  const buildAnalystInput = async () => ({
    schemaVersion: "1.0.0",
    report: { storageWeekEnding: snapshot.storageWeekEnding, dataCutoffAt: snapshot.dataCutoffAt },
    marketBackdrop: [],
    riskCandidates: [],
    opportunityCandidates: [],
    whatChanged: [],
    range: [],
    peers: [],
    news: [],
    outlook: [],
    sourcesFreshness: [],
    previousReportContext: null,
    evidenceAllowlist: []
  });
  const provider = fakeProvider(SAMPLE_WEEKLY_ANALYST_ASSESSMENT, 99); // always fails
  const renderer = fakeRenderer();

  const result = await orchestrateWeeklyReport({ pool, now: NOW, runMigrations: noopMigrations(), buildSnapshot, buildAnalystInput, provider, pdfRenderer: renderer, artifactStorage: new InMemoryArtifactStore() });

  assert.equal(result.stage, "failed");
  assert.equal(result.analysisStatus, "failed");
  assert.equal(renderer.calls(), 0, "a failed analyst assessment must never reach the renderer");
}, { timeout: 15000 });

test("orchestrateWeeklyReport: render failure (oversized even after the reduced-content retry) -- no publish", async () => {
  const snapshot = readySnapshot();
  const pool = fakePool(fullPipelineRoutes({ snapshot }));
  const buildSnapshot = async () => ({ status: "ready", snapshot, changes: [] });
  const buildAnalystInput = async () => ({
    schemaVersion: "1.0.0",
    report: { storageWeekEnding: snapshot.storageWeekEnding, dataCutoffAt: snapshot.dataCutoffAt },
    marketBackdrop: [],
    riskCandidates: [],
    opportunityCandidates: [],
    whatChanged: [],
    range: [],
    peers: [],
    news: [],
    outlook: [],
    sourcesFreshness: [],
    previousReportContext: null,
    evidenceAllowlist: []
  });
  const renderer = fakeRenderer(7); // always over the 5-page limit

  const result = await orchestrateWeeklyReport({ pool, now: NOW, runMigrations: noopMigrations(), buildSnapshot, buildAnalystInput, provider: fakeProvider(), pdfRenderer: renderer, artifactStorage: new InMemoryArtifactStore() });

  assert.equal(result.stage, "failed");
  assert.equal(result.publishStatus, "render_failed");
  const publishCalls = pool.calls.filter((c) => /status = 'published'/.test(c.sql));
  assert.equal(publishCalls.length, 0, "the previous published report must remain untouched -- no publish transition attempted");
});

test("orchestrateWeeklyReport: artifact storage failure -- the snapshot is never published, previous published report unaffected", async () => {
  const snapshot = readySnapshot();
  const pool = fakePool(fullPipelineRoutes({ snapshot }));
  const buildSnapshot = async () => ({ status: "ready", snapshot, changes: [] });
  const buildAnalystInput = async () => ({
    schemaVersion: "1.0.0",
    report: { storageWeekEnding: snapshot.storageWeekEnding, dataCutoffAt: snapshot.dataCutoffAt },
    marketBackdrop: [],
    riskCandidates: [],
    opportunityCandidates: [],
    whatChanged: [],
    range: [],
    peers: [],
    news: [],
    outlook: [],
    sourcesFreshness: [],
    previousReportContext: null,
    evidenceAllowlist: []
  });
  const throwingStore = { async put() { throw new Error("blob upload failed"); }, async get() { return null; } };

  const result = await orchestrateWeeklyReport({ pool, now: NOW, runMigrations: noopMigrations(), buildSnapshot, buildAnalystInput, provider: fakeProvider(), pdfRenderer: fakeRenderer(), artifactStorage: throwingStore });

  assert.equal(result.stage, "failed");
  assert.equal(result.publishStatus, "storage_failed");
  const publishCalls = pool.calls.filter((c) => /status = 'published'/.test(c.sql));
  assert.equal(publishCalls.length, 0);
});

test("orchestrateWeeklyReport: locked (not failed) when the final publish transition loses a concurrent race", async () => {
  const snapshot = readySnapshot();
  const pool = fakePool(fullPipelineRoutes({ snapshot, publishSucceeds: false }));
  const buildSnapshot = async () => ({ status: "ready", snapshot, changes: [] });
  const buildAnalystInput = async () => ({
    schemaVersion: "1.0.0",
    report: { storageWeekEnding: snapshot.storageWeekEnding, dataCutoffAt: snapshot.dataCutoffAt },
    marketBackdrop: [],
    riskCandidates: [],
    opportunityCandidates: [],
    whatChanged: [],
    range: [],
    peers: [],
    news: [],
    outlook: [],
    sourcesFreshness: [],
    previousReportContext: null,
    evidenceAllowlist: []
  });

  const result = await orchestrateWeeklyReport({ pool, now: NOW, runMigrations: noopMigrations(), buildSnapshot, buildAnalystInput, provider: fakeProvider(), pdfRenderer: fakeRenderer(), artifactStorage: new InMemoryArtifactStore() });

  assert.equal(result.stage, "locked");
  assert.equal(result.publishStatus, "race_lost");
});

// ---------------------------------------------------------------------------
// Source-inspection: exactly one semantic AI call site, no per-section calls
// ---------------------------------------------------------------------------

test("orchestrate-weekly.ts calls generateWeeklyAnalysisIfNeeded exactly once and never calls an AI provider's analyze() directly itself", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../lib/reports/orchestrate-weekly.ts"), "utf8");
  const calls = source.match(/generateWeeklyAnalysisIfNeeded\(/g) ?? [];
  assert.equal(calls.length, 1, "exactly one call site for the one semantic analyst assessment per report");
  assert.doesNotMatch(source, /\.analyze\(/, "must never call a provider's analyze() directly -- only through generateWeeklyAnalysisIfNeeded's own cache/retry logic");
});

test("orchestrate-weekly.ts constructs at most one AnthropicWeeklyAnalystProvider per call, and only when not already injected", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../lib/reports/orchestrate-weekly.ts"), "utf8");
  const constructions = source.match(/new AnthropicWeeklyAnalystProvider\(/g) ?? [];
  assert.equal(constructions.length, 1);
});

// ---------------------------------------------------------------------------
// Cron route: auth + Chromium packaging configuration
// ---------------------------------------------------------------------------

test("GET /api/cron/reports rejects a request with no Authorization header", async () => {
  const originalSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "test-secret";
  try {
    const { GET } = load("app/api/cron/reports/route.ts");
    const response = await GET(new Request("http://localhost/api/cron/reports"));
    assert.equal(response.status, 401);
  } finally {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  }
});

test("GET /api/cron/reports rejects an incorrect bearer token", async () => {
  const originalSecret = process.env.CRON_SECRET;
  process.env.CRON_SECRET = "test-secret";
  try {
    const { GET } = load("app/api/cron/reports/route.ts");
    const response = await GET(new Request("http://localhost/api/cron/reports", { headers: { authorization: "Bearer wrong-secret" } }));
    assert.equal(response.status, 401);
  } finally {
    if (originalSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalSecret;
  }
});

test("GET /api/cron/reports rejects every request when CRON_SECRET itself is not configured", async () => {
  const originalSecret = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  try {
    const { GET } = load("app/api/cron/reports/route.ts");
    const response = await GET(new Request("http://localhost/api/cron/reports", { headers: { authorization: "Bearer anything" } }));
    assert.equal(response.status, 401);
  } finally {
    if (originalSecret !== undefined) process.env.CRON_SECRET = originalSecret;
  }
});

test("app/api/cron/reports/route.ts never exposes internal error detail -- its own catch block returns a generic message", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../app/api/cron/reports/route.ts"), "utf8");
  assert.doesNotMatch(source, /error\.message|error\.stack/i);
});

test("next.config.js declares outputFileTracingIncludes for /api/cron/reports's own path, including @sparticuz/chromium's bin assets", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../next.config.js"), "utf8");
  assert.match(source, /outputFileTracingIncludes/);
  assert.match(source, /"\/api\/cron\/reports"/);
  assert.match(source, /@sparticuz\/chromium\/bin\/\*\*/);
});

test("next.config.js retains serverComponentsExternalPackages for @sparticuz/chromium", () => {
  const source = fs.readFileSync(path.resolve(__dirname, "../next.config.js"), "utf8");
  assert.match(source, /serverComponentsExternalPackages:\s*\["@sparticuz\/chromium"\]/);
});

test("vercel.json declares exactly one daily cron for the weekly report, preserving the pre-existing News and Macro crons", () => {
  const vercelConfig = JSON.parse(fs.readFileSync(path.resolve(__dirname, "../vercel.json"), "utf8"));
  assert.equal(vercelConfig.crons.length, 3);
  const reportsCron = vercelConfig.crons.find((c) => c.path === "/api/cron/reports");
  assert.ok(reportsCron, "the weekly report cron must be registered");
  // 5-field cron, exactly one run per day: minute hour * * * (no sub-daily fields).
  assert.match(reportsCron.schedule, /^\d{1,2} \d{1,2} \* \* \*$/);
  assert.deepEqual(
    vercelConfig.crons.map((c) => c.path).sort(),
    ["/api/cron/macro", "/api/cron/news", "/api/cron/reports"]
  );
});
