const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures", "sec", "rrc-submissions.json"), "utf8")
);
const companies = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "config", "companies.json"), "utf8")
);
const rrc = companies.companies.RRC;
const tempRoots = [];

async function loadModules() {
  const [manifest, sync] = await Promise.all([
    import("../scripts/sec/manifest.mjs"),
    import("../scripts/sec/sync.mjs"),
  ]);
  return { ...manifest, ...sync };
}

function makeTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rrc-sec-sync-"));
  tempRoots.push(root);
  fs.mkdirSync(path.join(root, "config"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "config", "companies.json"),
    JSON.stringify({ companies: { RRC: rrc } })
  );
  return root;
}

function addRecentFiling(submissions, filing) {
  const copy = structuredClone(submissions);
  const recent = copy.filings.recent;
  for (const field of ["accessionNumber", "filingDate", "reportDate", "form", "primaryDocument"]) {
    recent[field].push(filing[field]);
  }
  return copy;
}

function submissionsResponse(submissions, calls) {
  return async () => {
    calls.count += 1;
    return new Response(JSON.stringify(submissions), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
}

function writeManifestAndFiles(root, manifest) {
  fs.mkdirSync(path.join(root, "data", "sec"), { recursive: true });
  fs.writeFileSync(path.join(root, "data", "sec", "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  for (const filing of manifest.filings) {
    const destination = path.join(root, ...filing.repositoryPath.split("/"));
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(destination, "existing filing");
  }
}

test.afterEach(() => {
  for (const root of tempRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

test("manifest starts at 2024-01-01 and includes originals after 2026-06-30", async () => {
  const { buildManifest } = await loadModules();
  let submissions = addRecentFiling(fixture, {
    accessionNumber: "0000315852-26-000201",
    filingDate: "2026-10-20",
    reportDate: "2026-09-30",
    form: "10-Q",
    primaryDocument: "rrc-20260930.htm",
  });
  submissions = addRecentFiling(submissions, {
    accessionNumber: "0000315852-26-000202",
    filingDate: "2026-10-21",
    reportDate: "2026-09-30",
    form: "10-Q/A",
    primaryDocument: "rrc-20260930x10qa.htm",
  });
  submissions = addRecentFiling(submissions, {
    accessionNumber: "0000315852-26-000203",
    filingDate: "2026-10-22",
    reportDate: "2026-09-30",
    form: "8-K",
    primaryDocument: "rrc-20261022.htm",
  });

  const manifest = buildManifest(rrc, submissions);
  assert.deepEqual(manifest.reportDateRange, { from: "2024-01-01" });
  assert.ok(manifest.filings.every((filing) => filing.reportDate >= "2024-01-01"));
  assert.equal(manifest.filings.filter((filing) => filing.reportDate === "2026-09-30").length, 1);
  assert.ok(manifest.filings.every((filing) => filing.form === "10-Q" || filing.form === "10-K"));
});

test("unchanged SEC data creates no duplicate manifest entry", async () => {
  const { buildManifest, serializeManifest } = await loadModules();
  const existing = buildManifest(rrc, fixture);
  const regenerated = buildManifest(rrc, fixture, existing);
  assert.equal(new Set(regenerated.filings.map((filing) => filing.accessionNumber)).size, regenerated.filings.length);
  assert.equal(serializeManifest(regenerated), serializeManifest(existing));
});

test("a temporary SEC response omission does not delete a known historical accession", async () => {
  const { buildManifest } = await loadModules();
  const existing = buildManifest(rrc, fixture);
  const incompleteSubmissions = structuredClone(fixture);
  const omittedIndex = incompleteSubmissions.filings.recent.accessionNumber.indexOf("0000315852-24-000011");
  incompleteSubmissions.filings.recent.form[omittedIndex] = "8-K";

  const regenerated = buildManifest(rrc, incompleteSubmissions, existing);
  assert.ok(regenerated.filings.some((filing) => filing.accessionNumber === "0000315852-24-000011"));
  assert.equal(regenerated.filings.length, existing.filings.length);
});

test("unchanged stored filings cause no re-download", async () => {
  const { buildManifest, syncRrc } = await loadModules();
  const root = makeTempRoot();
  const existing = buildManifest(rrc, fixture);
  writeManifestAndFiles(root, existing);
  const submissionCalls = { count: 0 };

  const result = await syncRrc({
    root,
    userAgent: "rrc-peer-dashboard test@example.com",
    submissionsFetchImpl: submissionsResponse(fixture, submissionCalls),
    filingFetchImpl: async () => { throw new Error("filing fetch should not be called"); },
    delayMs: 0,
  });

  assert.equal(submissionCalls.count, 1);
  assert.equal(result.newFilingsDiscovered, 0);
  assert.equal(result.downloaded, 0);
  assert.equal(result.existingSkipped, existing.filings.length);
  assert.equal(result.manifestUpdated, false);
});

test("a new accession is added and retrieved exactly once across repeated syncs", async () => {
  const { buildManifest, syncRrc } = await loadModules();
  const root = makeTempRoot();
  const existing = buildManifest(rrc, fixture);
  writeManifestAndFiles(root, existing);
  const submissions = addRecentFiling(fixture, {
    accessionNumber: "0000315852-26-000201",
    filingDate: "2026-10-20",
    reportDate: "2026-09-30",
    form: "10-Q",
    primaryDocument: "rrc-20260930.htm",
  });
  const submissionCalls = { count: 0 };
  let filingRequests = 0;
  const options = {
    root,
    userAgent: "rrc-peer-dashboard test@example.com",
    submissionsFetchImpl: submissionsResponse(submissions, submissionCalls),
    filingFetchImpl: async () => {
      filingRequests += 1;
      return new Response("new official filing");
    },
    delayMs: 0,
  };

  const first = await syncRrc(options);
  const second = await syncRrc({
    ...options,
    filingFetchImpl: async () => { throw new Error("new filing must not be fetched twice"); },
  });
  const stored = JSON.parse(fs.readFileSync(path.join(root, "data", "sec", "manifest.json"), "utf8"));

  assert.equal(first.newFilingsDiscovered, 1);
  assert.equal(first.downloaded, 1);
  assert.equal(second.newFilingsDiscovered, 0);
  assert.equal(second.downloaded, 0);
  assert.equal(filingRequests, 1);
  assert.equal(submissionCalls.count, 2);
  assert.equal(stored.filings.filter((filing) => filing.accessionNumber === "0000315852-26-000201").length, 1);
});
