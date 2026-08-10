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

test("most recent original filings exclude amended 10-Q and 10-K forms", async () => {
  const { selectMostRecentOriginalFilings } = await loadDiscovery();
  const records = selectMostRecentOriginalFilings(rrc, fixture);

  assert.deepEqual(records.map((record) => record.form), ["10-K", "10-Q"]);
  assert.equal(records[0].accessionNumber, "0000315852-25-000011");
  assert.equal(records[1].accessionNumber, "0000315852-26-000010");
  assert.ok(records.every((record) => !record.form.endsWith("/A")));
});

test("discovery preserves SEC dates, accession number, and primary document exactly", async () => {
  const { selectMostRecentOriginalFilings } = await loadDiscovery();
  const [, quarterly] = selectMostRecentOriginalFilings(rrc, fixture);

  assert.equal(quarterly.reportDate, "2026-03-31");
  assert.equal(quarterly.filingDate, "2026-04-24");
  assert.notEqual(quarterly.reportDate, quarterly.filingDate);
  assert.equal(quarterly.accessionNumber, "0000315852-26-000010");
  assert.equal(quarterly.primaryDocument, "rrc-20260331.htm");
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
