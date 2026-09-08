const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

function collectSourceFiles(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectSourceFiles(fullPath));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      files.push(fullPath);
    }
  }
  return files;
}

// Scoped to components/news (the whole News UI tree) plus only the specific
// Phase 4 client-layer files under lib/news -- NOT the entire lib/news
// directory, which legitimately contains server-only backend code (e.g.
// lib/news/ai/anthropic-provider.ts, which correctly does import the
// Anthropic SDK -- scanning it here would be a false positive, not a
// finding).
const uiSourceFiles = [
  ...collectSourceFiles(path.join(process.cwd(), "components", "news")),
  path.join(process.cwd(), "lib", "news", "client-types.ts"),
  path.join(process.cwd(), "lib", "news", "article-display.ts"),
  path.join(process.cwd(), "lib", "news", "use-news-articles.ts"),
  path.join(process.cwd(), "lib", "news", "use-news-status.ts")
];

test("no file under components/news or lib/news references any /api/cron/* endpoint (collection or AI analysis)", () => {
  for (const file of uiSourceFiles) {
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(source, /\/api\/cron\//, `${path.relative(process.cwd(), file)} must never reference /api/cron/*`);
  }
});

test("no file under components/news or lib/news imports the Anthropic SDK or an AI provider directly", () => {
  for (const file of uiSourceFiles) {
    const source = fs.readFileSync(file, "utf8");
    assert.doesNotMatch(source, /@anthropic-ai\/sdk/, `${path.relative(process.cwd(), file)} must never import the Anthropic SDK`);
    assert.doesNotMatch(source, /AnthropicNewsAnalysisProvider/, `${path.relative(process.cwd(), file)} must never reference the AI provider directly`);
  }
});

test("the only fetch() targets in the News UI are the two read-only endpoints", () => {
  const fetchTargets = new Set();
  for (const file of uiSourceFiles) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(/fetch\(`?"?(\/api\/[a-z0-9/-]+)/g)) {
      fetchTargets.add(match[1]);
    }
  }
  assert.ok(fetchTargets.size > 0, "expected at least one read fetch target to be found");
  for (const target of fetchTargets) {
    assert.ok(target === "/api/news" || target === "/api/news/status", `unexpected fetch target in News UI: ${target}`);
  }
});

test("useNewsArticles and useNewsStatus only ever issue GET requests (no method override)", () => {
  const articlesHookSource = fs.readFileSync(path.join(process.cwd(), "lib", "news", "use-news-articles.ts"), "utf8");
  const statusHookSource = fs.readFileSync(path.join(process.cwd(), "lib", "news", "use-news-status.ts"), "utf8");
  for (const source of [articlesHookSource, statusHookSource]) {
    assert.doesNotMatch(source, /method:\s*["']POST["']/i);
    assert.doesNotMatch(source, /method:\s*["']PUT["']/i);
    assert.doesNotMatch(source, /method:\s*["']DELETE["']/i);
  }
});

test("app/api/news/status/route.ts only exports GET -- no write handler", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app", "api", "news", "status", "route.ts"), "utf8");
  assert.match(source, /export async function GET/);
  assert.doesNotMatch(source, /export async function (POST|PUT|DELETE)/);
});
