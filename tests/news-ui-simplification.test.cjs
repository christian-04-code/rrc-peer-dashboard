const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const panelSource = fs.readFileSync(path.join(process.cwd(), "components", "news", "NewsPanel.tsx"), "utf8");
const cardSource = fs.readFileSync(path.join(process.cwd(), "components", "news", "ArticleCard.tsx"), "utf8");
const drawerSource = fs.readFileSync(path.join(process.cwd(), "components", "news", "NewsDetailDrawer.tsx"), "utf8");
const filtersSource = fs.readFileSync(path.join(process.cwd(), "components", "news", "NewsFilters.tsx"), "utf8");
const clientTypesSource = fs.readFileSync(path.join(process.cwd(), "lib", "news", "client-types.ts"), "utf8");
const cssSource = fs.readFileSync(path.join(process.cwd(), "components", "news", "News.css"), "utf8");

test("NewsPanel no longer imports or renders the category/impact/strength filter control rows", () => {
  assert.doesNotMatch(panelSource, /import \{ NewsFilters \}/, "NewsPanel must not import NewsFilters");
  assert.doesNotMatch(panelSource, /<NewsFilters\b/, "NewsPanel must not render <NewsFilters />");
  assert.doesNotMatch(panelSource, /NewsFilterState/, "NewsPanel must not hold filter state");
});

test("NewsPanel renders every displayable article unfiltered -- the full daily feed, not a filtered subset", () => {
  assert.match(panelSource, /displayable\.map\(/, "the card grid must map directly over the displayable list");
  assert.doesNotMatch(panelSource, /filterArticles\(/, "NewsPanel must not call filterArticles(...)");
});

test("NewsPanel shows a single understated 'All News' section heading in place of the removed filter rows", () => {
  assert.match(panelSource, /news-feed-heading/);
  assert.match(panelSource, />All News</);
});

test("NewsFilters.tsx (and the category/impact/strength filter data it depends on) still exists -- removed from the primary experience, not deleted", () => {
  assert.ok(filtersSource.length > 0);
  assert.match(clientTypesSource, /NEWS_CATEGORY_FILTERS/);
  assert.match(clientTypesSource, /IMPACT_FILTERS/);
  assert.match(clientTypesSource, /IMPACT_STRENGTH_FILTERS/);
});

test("ArticleCard colors the headline by rangeImpactTone(article), not a second ad-hoc classification", () => {
  assert.match(cardSource, /rangeImpactTone\(article\)/);
  assert.match(cardSource, /className=\{`news-card-headline news-headline-\$\{tone\}`\}/);
});

test("NewsDetailDrawer colors its headline by the same rangeImpactTone(article) function as ArticleCard", () => {
  assert.match(drawerSource, /rangeImpactTone\(article\)/);
  assert.match(drawerSource, /className=\{`news-headline-\$\{tone\}`\}/);
});

test("the headline color classes are controlled to the headline only, not applied to the whole card", () => {
  // The tone class is interpolated into the headline's own className, never into
  // the <article className="news-card panel"> wrapper.
  assert.doesNotMatch(cardSource, /className="news-card panel[^"]*\$\{tone\}/);
  assert.match(cssSource, /var\(--positive\)/);
  assert.match(cssSource, /var\(--negative\)/);
  assert.match(cssSource, /var\(--caution\)/);
});

test("the card headline's tone color rule uses a compound selector that outranks the global `.panel button { color: var(--accent) }` rule -- a bare single-class selector would be silently overridden on this <button>-based headline (specificity 0,1,0 < 0,1,1)", () => {
  const globalsSource = fs.readFileSync(path.join(process.cwd(), "app", "globals.css"), "utf8");
  assert.match(globalsSource, /\.panel button \{[^}]*color: var\(--accent\)/, "sanity check: the global panel-button rule this must outrank still exists");
  assert.match(cssSource, /\.news-card-headline\.news-headline-positive/, "must use a two-class compound selector, not a bare .news-headline-positive alone");
  assert.match(cssSource, /\.news-card-headline\.news-headline-negative/);
  assert.match(cssSource, /\.news-card-headline\.news-headline-caution/);
});

test("Factual Summary and AI Range Analysis headings remain present, and get distinct visual treatment (muted vs. accent-colored) in both the card and the drawer", () => {
  assert.match(cardSource, />Factual Summary</);
  assert.match(cardSource, />AI Range Analysis</);
  assert.match(drawerSource, /<h3>Factual Summary<\/h3>/);
  assert.match(drawerSource, /<h3>AI Range Analysis<\/h3>/);
  assert.match(cssSource, /\.news-card-label \{[^}]*color: var\(--muted\);/);
  assert.match(cssSource, /\.news-ai-label \{ color: var\(--accent\); \}/);
  assert.match(cssSource, /\.news-drawer-section h3\.news-ai-label \{ color: var\(--accent\); \}/);
});

test("the Daily Energy Intelligence header is visually strengthened (larger, bolder) relative to body copy", () => {
  assert.match(cssSource, /\.news-header-title h2 \{[^}]*font-weight: 700/);
});

test("--caution is a real design token defined in app/globals.css, not a one-off hardcoded color in News.css", () => {
  const globalsSource = fs.readFileSync(path.join(process.cwd(), "app", "globals.css"), "utf8");
  assert.match(globalsSource, /--caution:\s*#[0-9a-f]{6};/i);
});
