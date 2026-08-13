const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const RRC_FACTS = JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures/sec-pipeline/rrc-companyfacts-trimmed.json"), "utf8"));
const tempRoots = [];

function makeTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rrc-sec-update-cli-"));
  tempRoots.push(root);
  return root;
}

async function loadUpdateCli() {
  return import("../scripts/sec/update.mjs");
}

const FINANCIALS_FIXTURE = `export type Ticker = "RRC";
export type Quarter = "Q1 2026" | "Q2 2026";
export const quarters = ["Q1 2026", "Q2 2026"];

export const data = {
  RRC: {
    "Q1 2026": {
      ticker: "RRC",
      quarter: "Q1 2026",
      revenue: { value: 1034.17, source: "codex", basis: "actual" },
      adjustedEbitdax: { value: 569.529, source: "codex", basis: "actual" },
      capitalExpenditures: { value: 139, source: "codex", basis: "actual" },
      netDebt: { value: 833.753, source: "codex", basis: "derived" },
      production: {
        total: { value: 2207.436, source: "codex", basis: "actual" },
        naturalGas: { value: 1500, source: "codex", basis: "actual" },
        ngl: { value: 100, source: "codex", basis: "actual" },
        oilCondensate: { value: 5, source: "codex", basis: "actual" }
      },
      commodityMix: {
        naturalGasPct: { value: 0.6, source: "codex", basis: "derived" },
        nglPct: { value: 0.3, source: "codex", basis: "derived" },
        oilCondensatePct: { value: 0.1, source: "codex", basis: "derived" }
      },
      realizedPrices: {
        naturalGas: { value: 5.18, source: "codex", basis: "actual" },
        ngl: { value: 26.62, source: "codex", basis: "actual" },
        oilCondensate: { value: 63.3, source: "codex", basis: "actual" }
      },
      costs: {
        leaseOperatingExpense: { value: 0.14, source: "codex", basis: "actual" },
        gatheringProcessingTransportation: { value: 1.63, source: "codex", basis: "actual" },
        cashGA: { value: 0.18, source: "codex", basis: "actual" },
        totalCashUnitCosts: { value: 1.97, source: "codex", basis: "derived" }
      },
      wells: {
        drilled: { value: 9, source: "codex", basis: "actual" },
        turnedInLine: { value: 17, source: "codex", basis: "actual" },
        ducInventory: { value: null, source: "codex", basis: "actual" }
      }
    },
  },
};

export function getQuarterlyFinancials(ticker, quarter) {
  const row = data[ticker][quarter];
  if (!row) throw new Error(\`No reported financials for \${ticker} \${quarter}\`);
  return row;
}

export function getAllQuartersForTicker(ticker) {
  return quarters.filter((q) => data[ticker][q]).map((q) => getQuarterlyFinancials(ticker, q));
}

export const financialsQuarterly = data;
`;

const MARKET_CAP_FIXTURE = `export function getQuarterlyMarketCap(ticker, quarter) {
  if (ticker === "RRC" && quarter === "Q2 2026") return { value: 8784.65, source: "nasdaq-historical" };
  return undefined;
}
`;

function seedTempRoot() {
  const root = makeTempRoot();
  fs.mkdirSync(path.join(root, "lib", "dashboard"), { recursive: true });
  fs.mkdirSync(path.join(root, "data", "sec", "RRC", "2026-06-30", "0001193125-26-310446"), { recursive: true });
  fs.mkdirSync(path.join(root, "config"), { recursive: true });

  fs.writeFileSync(path.join(root, "lib", "dashboard", "financials-quarterly.ts"), FINANCIALS_FIXTURE);
  fs.writeFileSync(path.join(root, "lib", "dashboard", "market-cap-quarterly.ts"), MARKET_CAP_FIXTURE);
  fs.writeFileSync(
    path.join(root, "data", "historical.json"),
    JSON.stringify({ companies: { RRC: { metrics: { Revenue: { unit: "$mm", values: {}, source_by_quarter: {} } } } } })
  );
  fs.writeFileSync(
    path.join(root, "data", "sec", "manifest.json"),
    JSON.stringify({
      companies: {
        RRC: {
          companyName: "Range Resources Corporation", ticker: "RRC", cik: "0000315852",
          filings: [{
            companyName: "Range Resources Corporation", ticker: "RRC", cik: "0000315852", form: "10-Q",
            reportDate: "2026-06-30", filingDate: "2026-07-21", accessionNumber: "0001193125-26-310446",
            primaryDocument: "rrc-20260630.htm", filingUrl: "https://example.com/filing.htm",
            repositoryPath: "data/sec/RRC/2026-06-30/0001193125-26-310446/filing.htm",
          }],
        },
      },
    })
  );
  fs.writeFileSync(
    path.join(root, "config", "companies.json"),
    JSON.stringify({ displayOrder: ["RRC"], companies: { RRC: { ticker: "RRC", name: "Range Resources Corporation", sec: { cik: "0000315852" } } } })
  );
  return root;
}

test("CLI: buildCandidate end-to-end against a temp root reproduces the known RRC Q2 2026 revenue, and getCurrentValue correctly finds it as UNCHANGED once already recorded", async () => {
  const cli = await loadUpdateCli();
  const root = seedTempRoot();
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "data", "sec", "manifest.json"), "utf8"));
  const { financialsModule, historicalFile, getMarketCapForQuarter } = await cli.loadCurrentCanonicalContext(root);

  const { candidate, summary, report } = await cli.buildCandidate({
    ticker: "RRC", fiscalYear: 2026, fiscalQuarter: 2, root, manifest, companyFacts: RRC_FACTS,
    financialsModule, historicalFile, getMarketCapForQuarter, allowReplay: true,
  });

  assert.equal(candidate.financial.revenue.value, 833.571);
  const revenueRow = summary.find((row) => row.group === "financial" && row.field === "revenue");
  assert.equal(revenueRow.action, "AUTO_APPLY"); // no prior value recorded in this fresh temp fixture
  assert.equal(report.readyToApply, true);
  assert.equal(report.marketDataStatus.status, "complete"); // temp market-cap-quarterly.ts fixture has Q2 2026
});

test("CLI: applyCandidate writes revenue into historical.json and never touches the real repo's files (temp root only)", async () => {
  const cli = await loadUpdateCli();
  const root = seedTempRoot();
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "data", "sec", "manifest.json"), "utf8"));
  const { financialsModule, historicalFile, getMarketCapForQuarter } = await cli.loadCurrentCanonicalContext(root);

  const { candidate, summary } = await cli.buildCandidate({
    ticker: "RRC", fiscalYear: 2026, fiscalQuarter: 2, root, manifest, companyFacts: RRC_FACTS,
    financialsModule, historicalFile, getMarketCapForQuarter, allowReplay: true,
  });

  await cli.applyCandidate({ candidate, summary, root, historicalFile, allowPartial: true });

  const writtenHistorical = JSON.parse(fs.readFileSync(path.join(root, "data", "historical.json"), "utf8"));
  assert.equal(writtenHistorical.companies.RRC.metrics.Revenue.values["Q2 2026"], 833.571);

  const writtenFinancials = fs.readFileSync(path.join(root, "lib", "dashboard", "financials-quarterly.ts"), "utf8");
  assert.match(writtenFinancials, /"Q2 2026": \{/); // inserted since allowPartial covers the still-blank operating fields
  assert.match(writtenFinancials, /"Q1 2026": \{/); // original untouched

  // the real repo's canonical files were never opened by this test
  const realFinancials = fs.readFileSync(path.join(__dirname, "..", "lib", "dashboard", "financials-quarterly.ts"), "utf8");
  assert.doesNotMatch(realFinancials, /rrc-sec-update-cli-/);
});

test("CLI: refuses --apply insertion when a manual-worksheet field is REVIEW_REQUIRED and allowPartial is not set", async () => {
  const cli = await loadUpdateCli();
  const root = seedTempRoot();
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "data", "sec", "manifest.json"), "utf8"));
  const { financialsModule, historicalFile, getMarketCapForQuarter } = await cli.loadCurrentCanonicalContext(root);

  // manual-input.mjs always classifies worksheet-sourced fields as C (REVIEW_REQUIRED) --
  // supplying just one operating field this way is enough to prove the writer refuses.
  const manualWorksheet = { production: { total: { value: 2296.399, unit: "MMcfe/d", sourceLocation: "10-Q p.20" } } };

  const { candidate, summary } = await cli.buildCandidate({
    ticker: "RRC", fiscalYear: 2026, fiscalQuarter: 2, root, manifest, companyFacts: RRC_FACTS,
    manualWorksheet, financialsModule, historicalFile, getMarketCapForQuarter, allowReplay: true,
  });
  assert.equal(candidate.production.total.action, "REVIEW_REQUIRED");

  const { financialsResult } = await cli.applyCandidate({ candidate, summary, root, historicalFile, allowPartial: false });
  assert.equal(financialsResult.inserted, false);
  assert.match(financialsResult.reason, /REVIEW_REQUIRED/);

  const { financialsResult: allowed } = await cli.applyCandidate({ candidate, summary, root, historicalFile, allowPartial: true });
  assert.equal(allowed.inserted, true);
});

test("CLI: findFilingForQuarter throws a clear error when no filing exists for the requested quarter", async () => {
  const cli = await loadUpdateCli();
  const root = seedTempRoot();
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "data", "sec", "manifest.json"), "utf8"));
  assert.throws(() => cli.findFilingForQuarter(manifest, "RRC", "2026-09-30"), /No filing with reportDate/);
});

test("CLI: fiscalQuarterDates / previousQuarterKey compute correct calendar windows and rollover across year boundary", async () => {
  const cli = await loadUpdateCli();
  assert.deepEqual(cli.fiscalQuarterDates(2026, 2), { periodStart: "2026-04-01", periodEnd: "2026-06-30" });
  assert.deepEqual(cli.fiscalQuarterDates(2026, 4), { periodStart: "2026-10-01", periodEnd: "2026-12-31" });
  assert.equal(cli.previousQuarterKey(2026, 1), "Q4 2025");
  assert.equal(cli.previousQuarterKey(2026, 3), "Q2 2026");
});

test.after(() => {
  for (const root of tempRoots) fs.rmSync(root, { recursive: true, force: true });
});
