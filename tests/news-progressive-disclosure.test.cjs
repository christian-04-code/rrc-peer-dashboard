const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./helpers/ts-loader.cjs");

const cardSource = fs.readFileSync(path.join(process.cwd(), "components", "news", "ArticleCard.tsx"), "utf8");
const infoSource = fs.readFileSync(path.join(process.cwd(), "components", "news", "FeedInfoDisclosure.tsx"), "utf8");
const headerSource = fs.readFileSync(path.join(process.cwd(), "components", "news", "DailyIntelligenceHeader.tsx"), "utf8");
const cssSource = fs.readFileSync(path.join(process.cwd(), "components", "news", "News.css"), "utf8");

test("the factual summary section is not rendered unconditionally -- it only appears once summaryOpen is true", () => {
  assert.match(cardSource, /const \[summaryOpen, setSummaryOpen\] = useState\(false\)/, "summary must be collapsed by default (initial state false)");
  assert.match(cardSource, /\{summaryOpen \? \(/, "the Factual Summary block must be gated on summaryOpen");
});

test("the AI Range analysis section is not rendered unconditionally -- it only appears once analysisOpen is true", () => {
  assert.match(cardSource, /const \[analysisOpen, setAnalysisOpen\] = useState\(false\)/, "analysis must be collapsed by default (initial state false)");
  assert.match(cardSource, /\{analysisOpen && hasAnalysis/, "the AI Range Analysis block must be gated on analysisOpen");
});

test("independent toggle buttons: 'Show summary'/'Hide summary' and 'Show Range analysis'/'Hide Range analysis', each with its own state setter", () => {
  assert.match(cardSource, /\{summaryOpen \? "Hide summary" : "Show summary"\}/);
  assert.match(cardSource, /\{analysisOpen \? "Hide Range analysis" : "Show Range analysis"\}/);
  assert.match(cardSource, /onClick=\{\(\) => setSummaryOpen\(\(open\) => !open\)\}/);
  assert.match(cardSource, /onClick=\{\(\) => setAnalysisOpen\(\(open\) => !open\)\}/);
});

test("the two toggles are independent -- neither setter appears inside the other's onClick, so opening one never touches the other's state", () => {
  const summaryClickMatch = cardSource.match(/onClick=\{\(\) => setSummaryOpen\([^}]*\}/);
  const analysisClickMatch = cardSource.match(/onClick=\{\(\) => setAnalysisOpen\([^}]*\}/);
  assert.ok(summaryClickMatch && analysisClickMatch);
  assert.doesNotMatch(summaryClickMatch[0], /setAnalysisOpen/);
  assert.doesNotMatch(analysisClickMatch[0], /setSummaryOpen/);
});

test("an unanalyzed (pending) article never renders a 'Show Range analysis' button -- there is nothing real to reveal", () => {
  assert.match(cardSource, /\{hasAnalysis \? \(\s*<button[\s\S]*?Show Range analysis/, "the analysis toggle must be gated on hasAnalysis");
  assert.match(cardSource, /const hasAnalysis = isAnalyzed && Boolean\(article\.rangeImpact\) && Boolean\(article\.impactStrength\)/);
});

test("a failed analysis shows the safe 'Analysis Unavailable' chip and never exposes provider error text or a misleading toggle", () => {
  assert.match(cardSource, /isFailed \? \(\s*<span className="news-status-chip muted">Analysis Unavailable<\/span>/);
  assert.doesNotMatch(cardSource, /article\.rangeAnalysis[\s\S]{0,40}isFailed/, "failed articles must never render rangeAnalysis text");
});

test("the impact badge / status chip is always visible in the collapsed card -- not gated behind either toggle", () => {
  const beforeControls = cardSource.slice(0, cardSource.indexOf("news-card-controls"));
  assert.match(beforeControls, /news-card-signal/, "the signal (impact pill or status chip) must render before the toggle controls, i.e. always visible");
});

test("headline color still comes from the unchanged Phase 5.1 rangeImpactTone(article) rule", () => {
  assert.match(cardSource, /const tone = rangeImpactTone\(article\)/);
  assert.match(cardSource, /className=\{`news-card-headline news-headline-\$\{tone\}`\}/);
  const { rangeImpactTone } = load("lib/news/article-display.ts");
  assert.equal(rangeImpactTone({ rangeImpact: "positive", impactStrength: "high" }), "positive");
  assert.equal(rangeImpactTone({ rangeImpact: "positive", impactStrength: "low" }), "caution");
  assert.equal(rangeImpactTone({ rangeImpact: "neutral", impactStrength: "high" }), "caution");
  assert.equal(rangeImpactTone({ rangeImpact: null, impactStrength: null }), "neutral");
});

test("expand/collapse buttons carry proper button semantics and ARIA wiring (aria-expanded, aria-controls matching a real element id)", () => {
  assert.match(cardSource, /<button\s+type="button"\s+className="news-card-toggle"\s+aria-expanded=\{summaryOpen\}\s+aria-controls=\{summaryPanelId\}/);
  assert.match(cardSource, /<button\s+type="button"\s+className="news-card-toggle"\s+aria-expanded=\{analysisOpen\}\s+aria-controls=\{analysisPanelId\}/);
  assert.match(cardSource, /id=\{summaryPanelId\}/, "the expanded summary panel must carry the id aria-controls points to");
  assert.match(cardSource, /id=\{analysisPanelId\}/, "the expanded analysis panel must carry the id aria-controls points to");
});

test("View Original links are untouched by the collapse/expand change", () => {
  assert.match(cardSource, /\{article\.canonicalUrl \? \(/);
  assert.match(cardSource, /View Original/);
});

test("the 'How this feed works' control exists, is keyboard-operable (a real <button>, not hover-only), and is accessible (aria-expanded/aria-controls, a labeled region)", () => {
  assert.match(infoSource, /How this feed works/);
  assert.match(infoSource, /<button\s/);
  assert.doesNotMatch(infoSource, /onMouseEnter|onMouseOver/, "must not require hover to open -- only a click/keyboard-activatable button");
  assert.match(infoSource, /aria-expanded=\{open\}/);
  assert.match(infoSource, /aria-controls=\{panelId\}/);
  assert.match(infoSource, /id=\{panelId\}/);
  assert.match(infoSource, /role="region"/);
  assert.match(infoSource, /aria-label="How this feed works"/);
});

test("the info panel is collapsed by default and only appears once opened -- not a permanent explanatory box", () => {
  assert.match(infoSource, /const \[open, setOpen\] = useState\(false\)/);
  assert.match(infoSource, /\{open \? \(/);
});

test("DailyIntelligenceHeader renders the FeedInfoDisclosure control", () => {
  assert.match(headerSource, /import \{ FeedInfoDisclosure \} from "@\/components\/news\/FeedInfoDisclosure";/);
  assert.match(headerSource, /<FeedInfoDisclosure \/>/);
});

test("the feed-rules copy reflects verified source registration -- lists only the sources actually registered in getDefaultSourceAdapters, and does not claim SEC EDGAR is active", () => {
  const sourcesSource = fs.readFileSync(path.join(process.cwd(), "lib", "news", "sources", "index.ts"), "utf8");
  assert.match(sourcesSource, /EiaTodayInEnergyAdapter/);
  assert.match(sourcesSource, /NaturalGasIntelligenceAdapter/);
  assert.match(sourcesSource, /OilPriceAdapter/);
  assert.match(sourcesSource, /SEC_USER_AGENT/, "sanity check: SEC EDGAR really is conditional on this env var, not unconditionally registered");

  // Scoped to the visible copy array, not the whole file -- the file's own
  // explanatory doc comment legitimately mentions SEC EDGAR to document
  // *why* it's excluded, which must not trip this check.
  const copyMatch = infoSource.match(/const FEED_INFO_SECTIONS[\s\S]*?\n\];/);
  assert.ok(copyMatch, "expected to find the FEED_INFO_SECTIONS literal");
  const visibleCopy = copyMatch[0];

  assert.match(visibleCopy, /EIA Today in Energy/);
  assert.match(visibleCopy, /Natural Gas Intelligence/);
  assert.match(visibleCopy, /OilPrice\.com/);
  assert.doesNotMatch(visibleCopy, /SEC EDGAR/, "SEC EDGAR is not enabled on this deployment (no SEC_USER_AGENT) and must not be listed as an active source in the user-visible copy");
});

test("the feed-rules copy states the real sort order (published_at DESC, verified against the actual SQL) and the real retention behavior (never deleted, capped by fetch limit)", () => {
  const repoSource = fs.readFileSync(path.join(process.cwd(), "lib", "news", "persistence", "articles-repo.ts"), "utf8");
  assert.match(repoSource, /ORDER BY published_at DESC NULLS LAST/, "sanity check: this is really the query's sort order");
  assert.doesNotMatch(repoSource, /DELETE FROM articles/, "sanity check: articles really are never deleted");

  assert.match(infoSource, /Newest published stories first/);
  assert.match(infoSource, /never deleted/i);
});

test("the feed-rules copy states the real automated schedule from vercel.json without overclaiming exact-minute precision", () => {
  const vercelConfig = JSON.parse(fs.readFileSync(path.join(process.cwd(), "vercel.json"), "utf8"));
  const newsCron = (vercelConfig.crons ?? []).find((c) => c.path === "/api/cron/news");
  assert.ok(newsCron, "sanity check: the cron entry this copy describes actually exists");
  assert.equal(newsCron.schedule, "15 11 * * *");

  assert.match(infoSource, /once a day/i);
  assert.match(infoSource, /Central time/);
  assert.doesNotMatch(infoSource, /exactly|precisely/i, "must not overclaim exact-minute precision given Hobby's documented scheduling variance");
});

test("no News UI file (including the new FeedInfoDisclosure) calls or references any /api/cron/* endpoint -- covered by the broader read-only scan, re-asserted here for this specific new file", () => {
  assert.doesNotMatch(infoSource, /\/api\/cron\//);
  assert.doesNotMatch(infoSource, /fetch\(/, "the info panel is static copy -- it must not fetch anything");
});

test("card padding/gap were reduced for a more compact default (collapsed) card, without going to zero/cramped spacing", () => {
  assert.match(cssSource, /\.news-card \{[^}]*padding: 14px/);
  const paddingMatch = cssSource.match(/\.news-card \{[^}]*padding: (\d+)px/);
  assert.ok(paddingMatch);
  assert.ok(Number(paddingMatch[1]) >= 10, "padding should be reduced but still comfortably readable, not cramped");
});
