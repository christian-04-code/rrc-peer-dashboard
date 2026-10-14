const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const { load } = require("./helpers/ts-loader.cjs");

// Preview-only, non-publishing weekly report test route (2026-10-13).
const { isPreviewTestRequestAuthorized, assertReadOnly, createReadOnlyPool, PreviewTestSafetyError } = load("lib/reports/preview-test-report.ts");

const SECRET = "s".repeat(40);
const previewEnv = (extra = {}) => ({ VERCEL_ENV: "preview", REPORT_PREVIEW_TEST_SECRET: SECRET, ...extra });

test("authorized only on a Vercel Preview with the exact dedicated secret", () => {
  assert.equal(isPreviewTestRequestAuthorized(previewEnv(), `Bearer ${SECRET}`), true);
  assert.equal(isPreviewTestRequestAuthorized(previewEnv(), `Bearer ${SECRET}x`), false);
  assert.equal(isPreviewTestRequestAuthorized(previewEnv(), SECRET), false, "must be a Bearer token");
  assert.equal(isPreviewTestRequestAuthorized(previewEnv(), null), false);
});

test("never authorized in production, locally, or without a strong secret", () => {
  assert.equal(isPreviewTestRequestAuthorized(previewEnv({ VERCEL_ENV: "production" }), `Bearer ${SECRET}`), false);
  assert.equal(isPreviewTestRequestAuthorized(previewEnv({ VERCEL_ENV: undefined }), `Bearer ${SECRET}`), false);
  assert.equal(isPreviewTestRequestAuthorized(previewEnv({ VERCEL_TARGET_ENV: "production" }), `Bearer ${SECRET}`), false);
  assert.equal(isPreviewTestRequestAuthorized(previewEnv({ REPORT_PREVIEW_TEST_SECRET: undefined }), "Bearer undefined"), false);
  assert.equal(isPreviewTestRequestAuthorized(previewEnv({ REPORT_PREVIEW_TEST_SECRET: "short" }), "Bearer short"), false);
});

test("the CRON_SECRET does not unlock the preview test route", () => {
  assert.equal(isPreviewTestRequestAuthorized(previewEnv({ CRON_SECRET: "c".repeat(40) }), `Bearer ${"c".repeat(40)}`), false);
});

test("assertReadOnly refuses to proceed unless Postgres reports the session read-only", async () => {
  const fakePool = (value) => ({ query: async () => ({ rows: [{ transaction_read_only: value }] }) });
  await assert.doesNotReject(assertReadOnly(fakePool("on")));
  await assert.rejects(assertReadOnly(fakePool("off")), PreviewTestSafetyError);
});

test("the read-only pool uses only the direct (non-pooled) URL and a single long-lived session", () => {
  assert.equal(createReadOnlyPool({ POSTGRES_URL: "postgres://u:p@h/db" }), null, "never falls back to the pooled/shared URL");
  const pool = createReadOnlyPool({ POSTGRES_URL_NON_POOLING: "postgres://u:p@h/db" });
  assert.equal(pool.options.max, 1);
  assert.equal(pool.options.idleTimeoutMillis, 0);
  pool.end();
});

const WRITE_PATH_PATTERNS = [
  /publish-service/,
  /artifact-store/,
  /@vercel\/blob/,
  /orchestrate-weekly/,
  /storage-observation-repo/,
  /\bgetPool\b/,
  /\b(createDraftSnapshot|transitionToBuilding|freezeSnapshot|publishSnapshot|markSnapshotFailed|createPendingAnalysis|markAnalysisReady|markAnalysisFailed|generateWeeklyAnalysisIfNeeded|runWeeklySnapshotBuild)\b/
];

test("the route and its module never reference a publish, Blob, or DB-write path", () => {
  for (const file of ["app/api/reports/preview-test/route.ts", "lib/reports/preview-test-report.ts"]) {
    const source = fs.readFileSync(file, "utf8").replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const pattern of WRITE_PATH_PATTERNS) assert.doesNotMatch(source, pattern, `${file} must not reference ${pattern}`);
  }
});

test("the preview test route is not scheduled as a cron", () => {
  const crons = JSON.parse(fs.readFileSync("vercel.json", "utf8")).crons.map((c) => c.path);
  assert.ok(!crons.some((p) => p.includes("preview-test")));
});

test("GET and unauthorized POST both return a plain 404", async () => {
  const route = load("app/api/reports/preview-test/route.ts");
  assert.equal((await route.GET()).status, 404);
  const saved = process.env.VERCEL_ENV;
  delete process.env.VERCEL_ENV;
  try {
    const response = await route.POST(new Request("http://localhost/api/reports/preview-test", { method: "POST", headers: { authorization: `Bearer ${SECRET}` } }));
    assert.equal(response.status, 404);
  } finally {
    if (saved !== undefined) process.env.VERCEL_ENV = saved;
  }
});
