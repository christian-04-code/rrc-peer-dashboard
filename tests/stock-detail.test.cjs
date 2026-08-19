const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./helpers/ts-loader.cjs");

const originalFetch = global.fetch;
const originalKey = process.env.FINNHUB_API_KEY;
test.afterEach(() => {
  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.FINNHUB_API_KEY;
  else process.env.FINNHUB_API_KEY = originalKey;
});

const stockHistory = load("lib/market/stock-history.ts");
const tickers = ["RRC", "AR", "CNX", "CRK", "EQT", "EXE", "GPOR"];
const observation = (date, close, high = close + 1, low = close - 1, volume = 100) => ({ date, open: close, high, low, close, volume });

test("all seven normalized workbook datasets are present and internally consistent", () => {
  for (const ticker of tickers) {
    const file = path.join(process.cwd(), "data/stock-history", `${ticker}.json`);
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.equal(data.ticker, ticker);
    assert.equal(data.source.type, "workbook");
    assert.equal(data.source.priceBasis, "close");
    assert.equal(data.observationCount, data.observations.length);
    assert.equal(data.earliestDate, data.observations[0].date);
    assert.equal(data.latestDate, data.observations.at(-1).date);
    assert.ok(data.observationCount >= 200);
  }
});

test("period returns anchor to the latest close and actual prior trading observations", () => {
  const observations = [
    observation("2020-08-14", 10), observation("2022-08-15", 20),
    observation("2024-08-15", 40), observation("2025-02-14", 45), observation("2025-08-15", 50)
  ];
  assert.equal(stockHistory.calculatePeriodReturn(observations, 6, "months"), (50 / 45 - 1) * 100);
  assert.equal(stockHistory.calculatePeriodReturn(observations, 1, "years"), 25);
  assert.equal(stockHistory.calculatePeriodReturn(observations, 3, "years"), 150);
  assert.equal(stockHistory.calculatePeriodReturn(observations, 5, "years"), 400);
});

test("YTD return uses the latest close on or before January 1", () => {
  const observations = [observation("2024-12-31", 20), observation("2025-01-02", 22), observation("2025-08-15", 30)];
  assert.equal(stockHistory.calculateYtdReturn(observations), 50);
});

test("insufficient return history returns null instead of estimating", () => {
  const observations = [observation("2024-11-01", 90), observation("2025-08-15", 100)];
  assert.equal(stockHistory.calculatePeriodReturn(observations, 1, "years"), null);
  assert.equal(stockHistory.calculatePeriodReturn(observations, 3, "years"), null);
  assert.equal(stockHistory.calculatePeriodReturn(observations, 5, "years"), null);
});

test("range, moving-average, position, and one-year volume metrics use raw OHLCV", () => {
  const start = new Date("2024-01-02T00:00:00Z");
  const observations = Array.from({ length: 260 }, (_, index) => {
    const date = new Date(start); date.setUTCDate(date.getUTCDate() + index);
    return observation(date.toISOString().slice(0, 10), index + 10, index + 12, index + 8, 1_000 + index);
  });
  const metrics = stockHistory.calculateStockMetrics(observations, 300);
  assert.equal(metrics.fiftyTwoWeekHigh, 271);
  assert.equal(metrics.fiftyTwoWeekLow, 8);
  assert.equal(metrics.movingAverage50, 244.5);
  assert.equal(metrics.movingAverage200, 169.5);
  assert.equal(metrics.averageVolume1y, 1130);
  assert.equal(metrics.distanceFrom52WeekHigh, (300 / 271 - 1) * 100);
});

test("EXE dataset excludes predecessor-era history and returns null for 3Y/5Y", () => {
  const data = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data/stock-history/EXE.json"), "utf8"));
  assert.equal(data.earliestDate, "2024-10-02");
  assert.equal(data.excludedPreTickerObservations, 784);
  assert.equal(stockHistory.calculatePeriodReturn(data.observations, 3, "years"), null);
  assert.equal(stockHistory.calculatePeriodReturn(data.observations, 5, "years"), null);
});

test("stock detail route serves workbook history with a Finnhub current quote", async () => {
  process.env.FINNHUB_API_KEY = "test-key";
  global.fetch = async (url) => {
    const parsed = new URL(url.toString());
    assert.equal(parsed.hostname, "finnhub.io");
    return Response.json({ c: 42.5, t: 1787144400 });
  };
  const route = load("app/api/stocks/[ticker]/route.ts");
  const response = await route.GET(new Request("http://localhost/api/stocks/RRC"), { params: { ticker: "rrc" } });
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.ticker, "RRC");
  assert.equal(body.companyName, "Range Resources Corporation");
  assert.equal(body.currentPrice, 42.5);
  assert.equal(body.history.source, "Workbook");
  assert.equal(body.history.observations.length, 1254);
});

test("unsupported ticker returns 404 without calling Finnhub", async () => {
  let calls = 0;
  global.fetch = async () => { calls += 1; throw new Error("must not be called"); };
  const route = load("app/api/stocks/[ticker]/route.ts");
  const response = await route.GET(new Request("http://localhost/api/stocks/TSLA"), { params: { ticker: "TSLA" } });
  assert.equal(response.status, 404);
  assert.equal(calls, 0);
});

test("route preserves dynamic and CDN cache conventions", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "app/api/stocks/[ticker]/route.ts"), "utf8");
  assert.match(source, /export const dynamic = "force-dynamic"/);
  assert.match(source, /s-maxage=60, stale-while-revalidate=120/);
  assert.doesNotMatch(source, /FMP|Stooq/);
});
