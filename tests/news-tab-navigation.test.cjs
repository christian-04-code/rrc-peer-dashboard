const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const homeDashboardSource = fs.readFileSync(path.join(process.cwd(), "components", "HomeDashboard.tsx"), "utf8");

test("News is present in the primary navigation, alongside the existing tabs", () => {
  const navMatch = homeDashboardSource.match(/<nav aria-label="Primary navigation">([\s\S]*?)<\/nav>/);
  assert.ok(navMatch, "primary navigation block should exist");
  assert.match(navMatch[1], />News</);
  assert.match(navMatch[1], />Overview</);
  assert.match(navMatch[1], />Forecast</);
  assert.match(navMatch[1], />Macro</);
});

test("the News nav button uses the same active-state convention as the other tabs", () => {
  assert.match(homeDashboardSource, /className=\{view === "news" \? "active" : ""\}/);
});

test("the News nav button sets view to 'news' on click, using the shared View state", () => {
  assert.match(homeDashboardSource, /onClick=\{\(\) => setView\("news"\)\}/);
});

test("selecting the News view renders NewsPanel, and NewsPanel is imported from components/news", () => {
  assert.match(homeDashboardSource, /import \{ NewsPanel \} from "@\/components\/news\/NewsPanel";/);
  assert.match(homeDashboardSource, /view === "news" \? \(\s*<NewsPanel \/>/);
});

test("existing Overview/Forecast/Macro render branches are untouched", () => {
  assert.match(homeDashboardSource, /view === "macro" \? \(\s*<MacroPanel \/>/);
  assert.match(homeDashboardSource, /view === "forecast" \? \(\s*<ForecastWorkspacePanel \/>/);
  assert.match(homeDashboardSource, /<CompanyHero company=\{company\} activity=\{activity\} \/>/, "the Overview (default) branch must still render CompanyHero");
});

test("'news' was added to the shared View union rather than a parallel navigation type", () => {
  const typesSource = fs.readFileSync(path.join(process.cwd(), "lib", "dashboard", "types.ts"), "utf8");
  assert.match(typesSource, /export type View = "dashboard" \| "macro" \| "forecast" \| "news";/);
});

test("News.css is registered in app/layout.tsx alongside the other component stylesheets", () => {
  const layoutSource = fs.readFileSync(path.join(process.cwd(), "app", "layout.tsx"), "utf8");
  assert.match(layoutSource, /import "@\/components\/news\/News\.css";/);
});
