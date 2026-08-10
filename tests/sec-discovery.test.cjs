const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures", "sec", "rrc-submissions.json"), "utf8")
);
const companies = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "config", "companies.json"), "utf8")
);
const rrc = companies.companies.RRC;

async function loadDiscovery() {
  return import("../scripts/sec/discover.mjs");
}

test("RRC SEC CIK remains a zero-padded 10-character string", () => {
  assert.equal(rrc.sec.cik, "0000315852");
  assert.match(rrc.sec.cik, /^\d{10}$/);
});

test("every configured peer has its verified zero-padded SEC CIK", () => {
  const expected = {
    RRC: "0000315852",
    AR: "0001433270",
    CNX: "0001070412",
    CRK: "0000023194",
    EQT: "0000033213",
    EXE: "0000895126",
    GPOR: "0000874499",
  };
  for (const [ticker, cik] of Object.entries(expected)) {
    assert.equal(companies.companies[ticker].sec.cik, cik);
    assert.match(cik, /^\d{10}$/);
  }
});

test("configured peer identity verification requires the matching CIK", async () => {
  const { verifySubmissionIdentity } = await loadDiscovery();
  for (const ticker of companies.displayOrder) {
    const company = companies.companies[ticker];
    const submissions = {
      cik: Number(company.sec.cik),
      name: company.name,
      tickers: [ticker],
    };
    assert.doesNotThrow(() => verifySubmissionIdentity(company, submissions));
    assert.throws(
      () => verifySubmissionIdentity(company, { ...submissions, cik: Number(company.sec.cik) + 1 }),
      /does not match configured CIK/
    );
  }
});

test("most recent original filings exclude amended 10-Q and 10-K forms", async () => {
  const { selectMostRecentOriginalFilings } = await loadDiscovery();
  const records = selectMostRecentOriginalFilings(rrc, fixture);

  assert.deepEqual(records.map((record) => record.form), ["10-K", "10-Q"]);
  assert.equal(records[0].accessionNumber, "0000315852-26-000071");
  assert.equal(records[1].accessionNumber, "0000315852-26-000082");
  assert.ok(records.every((record) => !record.form.endsWith("/A")));
});

test("manifest selection includes only exact original forms in the report-date range", async () => {
  const { collectOriginalFilings } = await loadDiscovery();
  const withUpperOutOfRangeFiling = structuredClone(fixture);
  const recent = withUpperOutOfRangeFiling.filings.recent;
  recent.accessionNumber.push("0000315852-26-000101");
  recent.filingDate.push("2026-10-20");
  recent.reportDate.push("2026-09-30");
  recent.form.push("10-Q");
  recent.primaryDocument.push("rrc-20260930.htm");

  const records = collectOriginalFilings(rrc, withUpperOutOfRangeFiling, {
    fromReportDate: "2024-01-01",
    throughReportDate: "2026-06-30",
  });

  assert.equal(records.length, 10);
  assert.ok(records.every((record) => record.form === "10-Q" || record.form === "10-K"));
  assert.ok(records.every((record) => record.reportDate >= "2024-01-01"));
  assert.ok(records.every((record) => record.reportDate <= "2026-06-30"));
});

test("manifest selection deduplicates accessions and sorts deterministically", async () => {
  const { collectOriginalFilings } = await loadDiscovery();
  const records = collectOriginalFilings(rrc, fixture, {
    fromReportDate: "2024-01-01",
    throughReportDate: "2026-06-30",
  });

  assert.equal(new Set(records.map((record) => record.accessionNumber)).size, records.length);
  assert.deepEqual(records.map((record) => record.reportDate), [
    "2024-03-31",
    "2024-06-30",
    "2024-09-30",
    "2024-12-31",
    "2025-03-31",
    "2025-06-30",
    "2025-09-30",
    "2025-12-31",
    "2026-03-31",
    "2026-06-30",
  ]);
  assert.deepEqual(records.map((record) => record.form), [
    "10-Q",
    "10-Q",
    "10-Q",
    "10-K",
    "10-Q",
    "10-Q",
    "10-Q",
    "10-K",
    "10-Q",
    "10-Q",
  ]);
});

test("SEC filing URLs use the official archive path components", async () => {
  const { buildSecFilingUrl } = await loadDiscovery();
  assert.equal(
    buildSecFilingUrl("0000315852", "0001193125-26-067292", "rrc-20251231.htm"),
    "https://www.sec.gov/Archives/edgar/data/315852/000119312526067292/rrc-20251231.htm"
  );
});

test("manifest serialization is identical across repeated generation", async () => {
  const { buildManifest, serializeManifest } = await import("../scripts/sec/manifest.mjs");
  const first = serializeManifest(buildManifest(rrc, fixture));
  const second = serializeManifest(buildManifest(rrc, fixture));
  assert.equal(first, second);
});

test("discovery preserves SEC dates, accession number, and primary document exactly", async () => {
  const { selectMostRecentOriginalFilings } = await loadDiscovery();
  const [, quarterly] = selectMostRecentOriginalFilings(rrc, fixture);

  assert.equal(quarterly.reportDate, "2026-06-30");
  assert.equal(quarterly.filingDate, "2026-07-21");
  assert.notEqual(quarterly.reportDate, quarterly.filingDate);
  assert.equal(quarterly.accessionNumber, "0000315852-26-000082");
  assert.equal(quarterly.primaryDocument, "rrc-20260630.htm");
});

test("missing required SEC metadata is surfaced rather than guessed", async () => {
  const { validateCompanySecConfig } = await loadDiscovery();
  const withoutSec = { ...rrc, sec: undefined };
  assert.throws(() => validateCompanySecConfig(withoutSec, "RRC"), /SEC CIK for RRC is required/);
});

test("mocked discovery makes one submissions request with the declared User-Agent", async () => {
  const { discoverCompanyFilings } = await loadDiscovery();
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify(fixture), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  await discoverCompanyFilings(rrc, { fetchImpl, userAgent: "rrc-peer-dashboard test@example.com" });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://data.sec.gov/submissions/CIK0000315852.json");
  assert.equal(calls[0].options.headers["User-Agent"], "rrc-peer-dashboard test@example.com");
});
