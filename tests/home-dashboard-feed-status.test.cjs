const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(process.cwd(), "components", "HomeDashboard.tsx"), "utf8");

test("feed status shows a loading state, not a fabricated 0, while market data is still resolving", () => {
  assert.match(source, /market\.loading \? "Checking feeds…"/);
  assert.doesNotMatch(source, />●\s*\{activeFeedCount\} feeds active</, "must not unconditionally render the numeric count regardless of loading state");
});

test("feed status shows an honest degraded state when the market API truly fails", () => {
  assert.match(source, /market\.error \? "Feeds unavailable"/);
});

test("feed status only renders the numeric feed count once market data has resolved successfully", () => {
  assert.match(source, /`\$\{activeFeedCount\} feeds active`/);
  assert.match(source, /feedStatusText/);
  assert.match(source, /● \{feedStatusText\}/);
});

test("feed detail drawer text mirrors the same loading/error/resolved states instead of a separate stale computation", () => {
  assert.match(source, /feedDetailText = market\.error \?\? \(market\.loading \? "Checking market feeds…" : `\$\{activeFeedCount\} of \$\{totalFeedCount\} EIA feeds available`\)/);
  assert.match(source, /onClick=\{\(\) => openDrawer\(feedDetailText\)\}/);
});
