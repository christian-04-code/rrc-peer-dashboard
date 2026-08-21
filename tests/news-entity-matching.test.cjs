const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const { matchCompanyEntities } = load("lib/news/relevance/entities.ts");

test("matches a peer company by full name", () => {
  const matches = matchCompanyEntities("Antero Resources Corporation reported strong Marcellus production this quarter.");
  assert.ok(matches.some((m) => m.ticker === "AR" && m.kind === "company_name"));
});

test("matches a peer company by short name", () => {
  const matches = matchCompanyEntities("EQT Corporation announced a new pipeline agreement.");
  assert.ok(matches.some((m) => m.ticker === "EQT"));
});

test("matches a ticker only when accompanied by financial context (NYSE:, $, parenthetical)", () => {
  const withContext = matchCompanyEntities("Shares of the company (NYSE: CRK) rose 3% Tuesday.");
  assert.ok(withContext.some((m) => m.ticker === "CRK" && m.kind === "ticker"));

  const withDollarSign = matchCompanyEntities("Traders were watching $GPOR ahead of earnings.");
  assert.ok(withDollarSign.some((m) => m.ticker === "GPOR" && m.kind === "ticker"));
});

test("a bare ticker with no financial context is never attributed to that company (avoids ambiguous-word false positives)", () => {
  const matches = matchCompanyEntities("The AR headset market grew significantly this year.");
  assert.ok(!matches.some((m) => m.ticker === "AR"), "bare 'AR' (augmented reality) must not match Antero Resources");
});

test("does not match a company when neither name nor ticker+context is present", () => {
  const matches = matchCompanyEntities("Oil prices ticked higher amid geopolitical tension.");
  assert.equal(matches.length, 0);
});

test("matches multiple distinct companies mentioned in the same article", () => {
  const matches = matchCompanyEntities("Both EQT Corporation and CNX Resources Corporation operate in the Marcellus.");
  const tickers = matches.map((m) => m.ticker);
  assert.ok(tickers.includes("EQT"));
  assert.ok(tickers.includes("CNX"));
});

test("RRC is routed through the guarded Range Resources matcher, not a plain name/ticker check", () => {
  const strongPhrase = matchCompanyEntities("Range Resources Corporation posted higher free cash flow.");
  assert.ok(strongPhrase.some((m) => m.ticker === "RRC"));

  const bareWordNoContext = matchCompanyEntities("The product comes in a wide range of colors.");
  assert.ok(!bareWordNoContext.some((m) => m.ticker === "RRC"));
});
