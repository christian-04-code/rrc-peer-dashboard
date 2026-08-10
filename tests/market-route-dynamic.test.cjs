const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.join(process.cwd(), "app", "api", "market", "route.ts"), "utf8");

test("market route is force-dynamic like the other live-data routes, so EIA_API_KEY is read fresh on every invocation instead of being baked into a build-time-cached response", () => {
  assert.match(source, /export const dynamic = "force-dynamic";/);
  assert.match(source, /export const revalidate = 900;/, "CDN-level revalidate window is preserved");
});

test("Cache-Control header still gives the intended 900s edge caching despite force-dynamic", () => {
  assert.match(source, /s-maxage=900/);
});

test("route/series identifiers used for live commodity data are unchanged (Henry Hub RNGWHHD, WTI PET.RWTC.D via seriesid route)", () => {
  const clientSource = fs.readFileSync(path.join(process.cwd(), "lib", "eia", "client.ts"), "utf8");
  const seriesSource = fs.readFileSync(path.join(process.cwd(), "lib", "eia", "series.ts"), "utf8");
  assert.match(clientSource, /EIA_SERIES/, "client reads identifiers from the central registry");
  assert.match(seriesSource, /RNGWHHD/);
  assert.match(seriesSource, /PET\.RWTC\.D/);
  assert.match(seriesSource, /NG\.N9070US2\.M/, "U.S. monthly dry-gas production series is explicit");
  assert.match(seriesSource, /PET\.W_EPLLP0C_SKB_NUS_MBBL\.W/, "U.S. weekly fractionated propane inventory series is explicit");
});
