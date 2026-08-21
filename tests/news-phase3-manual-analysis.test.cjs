const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

test("Phase 3 manual validation has a non-configurable hard cap of five AI analyses", () => {
  const source = read("lib/news/ai/manual-analysis.ts");
  assert.match(source, /MANUAL_ANALYSIS_HARD_CAP\s*=\s*5/);
  assert.match(source, /Math\.min\(requestedMax, MANUAL_ANALYSIS_HARD_CAP\)/);
});

test("Phase 3 only selects deterministically retained articles before any AI call", () => {
  const source = read("lib/news/ai/manual-analysis.ts");
  const selectionIndex = source.indexOf('queryArticles(pool, { status: "retained"');
  const analyzeIndex = source.indexOf("provider.analyze(");
  assert.ok(selectionIndex >= 0, "manual analysis must query only retained articles");
  assert.ok(analyzeIndex > selectionIndex, "deterministic retained filtering must occur before provider.analyze");
});

test("Phase 3 manual endpoint remains authenticated and is not a scheduled cron", () => {
  const route = read("app/api/cron/news/analyze/route.ts");
  assert.match(route, /process\.env\.CRON_SECRET/);
  assert.match(route, /Bearer \$\{secret\}/);

  const vercelPath = path.join(process.cwd(), "vercel.json");
  if (fs.existsSync(vercelPath)) {
    const vercel = read("vercel.json");
    assert.doesNotMatch(vercel, /\/api\/cron\/news\/analyze/);
  }
});

test("Phase 3 validation performs no automatic AI retry", () => {
  const source = read("lib/news/ai/manual-analysis.ts");
  const analyzeCalls = source.match(/provider\.analyze\(/g) ?? [];
  assert.equal(analyzeCalls.length, 1, "manual runner should contain one provider call site and no retry loop");
  assert.doesNotMatch(source, /retry/i);
});
