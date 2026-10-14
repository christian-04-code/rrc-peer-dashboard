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

// --- Diagnostics (2026-10-14): sanitized errors, per-attempt AI metadata, read-only session init ---

const { sanitizeDiagnosticMessage, errorClassOf, ReadOnlyClient, READ_ONLY_SESSION_SQL } = load("lib/reports/preview-test-report.ts");
const { WeeklyAnalystValidationError } = load("lib/reports/ai-contract.ts");
const { WeeklyAnalystProviderError } = load("lib/reports/ai/provider.ts");

test("sanitizeDiagnosticMessage strips credentials but keeps validator reasons readable", () => {
  const dirty = "connect failed postgres://user:pa55@ep-x.neon.tech/db?sslmode=require key sk-ant-api03-abcDEF_123 Bearer abc.def token " + "a".repeat(64);
  const clean = sanitizeDiagnosticMessage(new Error(dirty));
  assert.doesNotMatch(clean, /pa55|neon\.tech|sk-ant|abc\.def|a{32}/);
  assert.match(clean, /\[url\]/);
  const reason = 'Weekly analyst response riskTable[2].whyItMatters is 412 chars -- keep it to 1-2 short sentences (max 320).';
  assert.equal(sanitizeDiagnosticMessage(new WeeklyAnalystValidationError(reason)), reason);
  assert.ok(sanitizeDiagnosticMessage("x".repeat(5000).replace(/x/g, "word ")).length <= 400);
});

test("errorClassOf names custom error classes even though none of them set .name", () => {
  assert.equal(errorClassOf(new WeeklyAnalystValidationError("x")), "WeeklyAnalystValidationError");
  assert.equal(errorClassOf(new WeeklyAnalystProviderError("x")), "WeeklyAnalystProviderError");
  assert.equal(errorClassOf(new TypeError("x")), "TypeError");
});

test("errorClassOf stays readable when the production build minifies class names (real run reported 't' and 'r')", () => {
  // Simulate minification: subclasses whose constructor names are single letters.
  class t extends WeeklyAnalystValidationError {}
  class r extends WeeklyAnalystProviderError {}
  assert.equal(errorClassOf(new t("x")), "WeeklyAnalystValidationError");
  assert.equal(errorClassOf(new r("x")), "WeeklyAnalystProviderError");
  const Anthropic = require("@anthropic-ai/sdk").default ?? require("@anthropic-ai/sdk");
  assert.equal(errorClassOf(new Anthropic.APIConnectionTimeoutError()), "AnthropicTimeoutError");
});

test("sanitizeDiagnosticMessage keeps configuration setting NAMES readable while still hiding secret-like values", () => {
  const msg = sanitizeDiagnosticMessage(new Error("Anthropic response was truncated by the max_tokens limit -- raise WEEKLY_ANALYST_MAX_OUTPUT_TOKENS."));
  assert.match(msg, /WEEKLY_ANALYST_MAX_OUTPUT_TOKENS/);
  assert.doesNotMatch(sanitizeDiagnosticMessage("token 9f2c4e7a1b3d5f6e8a0c2e4f6a8b0d1c3e5f7a9b"), /9f2c4e7a/);
  assert.doesNotMatch(sanitizeDiagnosticMessage("secret QWxhZGRpbjpvcGVuIHNlc2FtZSBhbmQgbW9yZSBzdHVmZg=="), /QWxhZGRp/);
});

test("ReadOnlyClient switches the session to read-only BEFORE connect() resolves, and a failed SET fails the connection", async () => {
  const { Client } = require("pg");
  const original = { connect: Client.prototype.connect, query: Client.prototype.query };
  const calls = [];
  try {
    Client.prototype.connect = async function () { calls.push("connect"); };
    Client.prototype.query = async function (sql) { calls.push(sql); return { rows: [] }; };
    const client = new ReadOnlyClient({ connectionString: "postgres://u:p@h/db" });
    await client.connect();
    assert.deepEqual(calls, ["connect", READ_ONLY_SESSION_SQL]);

    // pg-pool's callback form: callback(null, client) only after the SET.
    calls.length = 0;
    const viaCallback = await new Promise((resolve, reject) => client.connect((err, c) => (err ? reject(err) : resolve(c))));
    assert.equal(viaCallback, client);
    assert.deepEqual(calls, ["connect", READ_ONLY_SESSION_SQL]);

    Client.prototype.query = async function () { throw new Error("permission denied"); };
    await assert.rejects(new ReadOnlyClient({}).connect(), /permission denied/);
    const err = await new Promise((resolve) => new ReadOnlyClient({}).connect((e) => resolve(e)));
    assert.match(String(err), /permission denied/);
  } finally {
    Client.prototype.connect = original.connect;
    Client.prototype.query = original.query;
  }
});

test("the read-only pool opens every session through ReadOnlyClient (no fire-and-forget connect handler)", () => {
  const pool = createReadOnlyPool({ POSTGRES_URL_NON_POOLING: "postgres://u:p@h/db" });
  assert.equal(pool.options.Client, ReadOnlyClient);
  assert.equal(pool.listenerCount("connect"), 0);
  pool.end();
});

test("the Anthropic provider reports stop reason / token usage to an optional hook, and still rejects a truncated response", async () => {
  const { AnthropicWeeklyAnalystProvider } = load("lib/reports/ai/anthropic-provider.ts");
  const { WEEKLY_ANALYST_MAX_OUTPUT_TOKENS } = load("lib/reports/ai/model-config.ts");
  const metas = [];
  const provider = new AnthropicWeeklyAnalystProvider({ apiKey: "test-key", onResponseMeta: (m) => metas.push(m) });
  provider.client.messages.create = async () => ({
    stop_reason: "max_tokens",
    usage: { input_tokens: 9000, output_tokens: WEEKLY_ANALYST_MAX_OUTPUT_TOKENS },
    content: [{ type: "tool_use", name: "submit_weekly_range_analyst_assessment", input: {} }]
  });
  const minimalInput = { report: { storageWeekEnding: "2026-10-02", dataCutoffAt: "2026-10-09T17:00:00.000Z" }, riskCandidates: [], opportunityCandidates: [], marketBackdrop: [], whatChanged: [], range: [], peers: [], news: [], outlook: [], sourcesFreshness: [], previousReportContext: null, evidenceAllowlist: [] };
  await assert.rejects(provider.analyze(minimalInput), /truncated by the max_tokens limit/);
  assert.equal(metas.length, 1);
  assert.deepEqual({ ...metas[0], durationMs: 0 }, { stopReason: "max_tokens", inputTokens: 9000, outputTokens: WEEKLY_ANALYST_MAX_OUTPUT_TOKENS, maxOutputTokens: WEEKLY_ANALYST_MAX_OUTPUT_TOKENS, durationMs: 0 });
});

test("the provider hook carries metadata only -- never prompt or response text", () => {
  const source = fs.readFileSync("lib/reports/ai/anthropic-provider.ts", "utf8");
  const hookCall = source.slice(source.indexOf("this.onResponseMeta?.("), source.indexOf("});", source.indexOf("this.onResponseMeta?.(")));
  assert.doesNotMatch(hookCall, /content|SYSTEM_PROMPT|formatAnalystInputForPrompt|toolUse/);
});
