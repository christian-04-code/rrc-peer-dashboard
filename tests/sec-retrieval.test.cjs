const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const companies = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "config", "companies.json"), "utf8")
);
const rrc = companies.companies.RRC;
const tempRoots = [];

async function loadModules() {
  const [discovery, retrieval] = await Promise.all([
    import("../scripts/sec/discover.mjs"),
    import("../scripts/sec/retrieve.mjs"),
  ]);
  return { ...discovery, ...retrieval };
}

function makeTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rrc-sec-retrieval-"));
  tempRoots.push(root);
  return root;
}

function makeFiling(overrides = {}) {
  return {
    companyName: "Range Resources Corporation",
    ticker: "RRC",
    cik: "0000315852",
    form: "10-Q",
    reportDate: "2026-06-30",
    filingDate: "2026-07-21",
    accessionNumber: "0001193125-26-310446",
    primaryDocument: "rrc-20260630.htm",
    filingUrl: "https://www.sec.gov/Archives/edgar/data/315852/000119312526310446/rrc-20260630.htm",
    repositoryPath: "data/sec/RRC/2026-06-30/0001193125-26-310446/filing.htm",
    ...overrides,
  };
}

function makeManifest(filings) {
  return {
    schemaVersion: 1,
    company: {
      companyName: "Range Resources Corporation",
      ticker: "RRC",
      cik: "0000315852",
    },
    filings,
  };
}

test.afterEach(() => {
  for (const root of tempRoots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

test("repository path generation uses ticker, report date, and exact accession", async () => {
  const { buildFilingRepositoryPath } = await loadModules();
  assert.equal(
    buildFilingRepositoryPath(makeFiling()),
    "data/sec/RRC/2026-06-30/0001193125-26-310446/filing.htm"
  );
});

test("an existing filing is skipped without an HTTP request", async () => {
  const { retrieveManifestFilings } = await loadModules();
  const root = makeTempRoot();
  const filing = makeFiling();
  const destination = path.join(root, ...filing.repositoryPath.split("/"));
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, "already present");

  const result = await retrieveManifestFilings(rrc, makeManifest([filing]), {
    root,
    userAgent: "rrc-peer-dashboard test@example.com",
    fetchImpl: async () => {
      throw new Error("fetch should not be called");
    },
    delayMs: 0,
  });

  assert.equal(result.downloaded, 0);
  assert.equal(result.skipped, 1);
  assert.equal(fs.readFileSync(destination, "utf8"), "already present");
});

test("a duplicate accession is retrieved and stored only once", async () => {
  const { retrieveManifestFilings } = await loadModules();
  const root = makeTempRoot();
  const filing = makeFiling();
  let requests = 0;
  const result = await retrieveManifestFilings(rrc, makeManifest([filing, { ...filing }]), {
    root,
    userAgent: "rrc-peer-dashboard test@example.com",
    fetchImpl: async () => {
      requests += 1;
      return new Response("official filing html");
    },
    delayMs: 0,
  });

  assert.equal(requests, 1);
  assert.equal(result.total, 1);
  assert.equal(result.downloaded, 1);
});

test("an empty HTTP body fails without creating a filing", async () => {
  const { retrieveManifestFilings } = await loadModules();
  const root = makeTempRoot();
  const filing = makeFiling();
  await assert.rejects(
    retrieveManifestFilings(rrc, makeManifest([filing]), {
      root,
      userAgent: "rrc-peer-dashboard test@example.com",
      fetchImpl: async () => new Response(new Uint8Array()),
      delayMs: 0,
    }),
    /response was empty/
  );
  assert.equal(fs.existsSync(path.join(root, ...filing.repositoryPath.split("/"))), false);
});

test("a non-200 HTTP response fails without creating a filing", async () => {
  const { retrieveManifestFilings } = await loadModules();
  const root = makeTempRoot();
  const filing = makeFiling();
  await assert.rejects(
    retrieveManifestFilings(rrc, makeManifest([filing]), {
      root,
      userAgent: "rrc-peer-dashboard test@example.com",
      fetchImpl: async () => new Response("created", { status: 201, statusText: "Created" }),
      delayMs: 0,
    }),
    /201 Created/
  );
  assert.equal(fs.existsSync(path.join(root, ...filing.repositoryPath.split("/"))), false);
});

test("rerunning retrieval creates no duplicate file and makes no second request", async () => {
  const { retrieveManifestFilings } = await loadModules();
  const root = makeTempRoot();
  const filing = makeFiling();
  const options = {
    root,
    userAgent: "rrc-peer-dashboard test@example.com",
    fetchImpl: async () => new Response("official filing html"),
    delayMs: 0,
  };

  const first = await retrieveManifestFilings(rrc, makeManifest([filing]), options);
  const second = await retrieveManifestFilings(rrc, makeManifest([filing]), {
    ...options,
    fetchImpl: async () => {
      throw new Error("fetch should not be called on rerun");
    },
  });

  assert.equal(first.downloaded, 1);
  assert.equal(second.downloaded, 0);
  assert.equal(second.skipped, 1);
  assert.equal(fs.readFileSync(path.join(root, ...filing.repositoryPath.split("/")), "utf8"), "official filing html");
});
