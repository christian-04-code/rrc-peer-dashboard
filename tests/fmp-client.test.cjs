const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

function loadClient() {
  const filename = path.resolve(__dirname, "../lib/fmp/client.ts");
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename
  }).outputText;

  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  loaded._compile(output, filename);
  return loaded.exports;
}

const originalFetch = global.fetch;
const originalKey = process.env.FMP_KEY;

function restoreGlobals() {
  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.FMP_KEY;
  else process.env.FMP_KEY = originalKey;
}

test.afterEach(restoreGlobals);
test.after(restoreGlobals);

test("getFmpApiKey throws when FMP_KEY is missing or blank", () => {
  const { getFmpApiKey } = loadClient();
  delete process.env.FMP_KEY;
  assert.throws(() => getFmpApiKey(), /FMP_KEY is not set/);
  process.env.FMP_KEY = "   ";
  assert.throws(() => getFmpApiKey(), /FMP_KEY is not set/);
});

test("fetchFmpCommodityQuotes builds one batched request and normalizes numeric prices", async () => {
  const { fetchFmpCommodityQuotes } = loadClient();
  process.env.FMP_KEY = "test-key";
  let requestedUrl;

  global.fetch = async (url) => {
    requestedUrl = new URL(url.toString());
    return new Response(
      JSON.stringify([
        { symbol: "NGUSD", name: "Natural Gas", price: 3.21 },
        { symbol: "CLUSD", name: "Crude Oil", price: 64.5 }
      ]),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  };

  const quotes = await fetchFmpCommodityQuotes(["NGUSD", "CLUSD"]);
  assert.equal(requestedUrl.origin, "https://financialmodelingprep.com");
  assert.equal(requestedUrl.pathname, "/stable/quote");
  assert.equal(requestedUrl.searchParams.get("symbol"), "NGUSD,CLUSD");
  assert.equal(requestedUrl.searchParams.get("apikey"), "test-key");
  assert.deepEqual(quotes, [
    { symbol: "NGUSD", price: 3.21, name: "Natural Gas" },
    { symbol: "CLUSD", price: 64.5, name: "Crude Oil" }
  ]);
});

test("a row with a missing/non-numeric price normalizes to price: null, never a fabricated 0", async () => {
  const { fetchFmpStockQuotes } = loadClient();
  process.env.FMP_KEY = "test-key";
  global.fetch = async () =>
    new Response(JSON.stringify([{ symbol: "GPOR", price: "not-a-number" }, { symbol: "RRC" }]), {
      status: 200,
      headers: { "content-type": "application/json" }
    });

  const quotes = await fetchFmpStockQuotes(["GPOR", "RRC"]);
  for (const quote of quotes) {
    assert.equal(quote.price, null);
    assert.notEqual(quote.price, 0);
  }
});

test("an FMP error-shaped payload (invalid key) throws with the FMP error message, not a silent empty result", async () => {
  const { fetchFmpCommodityQuotes } = loadClient();
  process.env.FMP_KEY = "test-key";
  global.fetch = async () =>
    new Response(JSON.stringify({ "Error Message": "Invalid API KEY." }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });

  await assert.rejects(fetchFmpCommodityQuotes(["NGUSD"]), /Invalid API KEY/);
});

test("a non-OK HTTP response is rejected rather than treated as an empty/zero result", async () => {
  const { fetchFmpStockQuotes } = loadClient();
  process.env.FMP_KEY = "test-key";
  global.fetch = async () => new Response("rate limit exceeded", { status: 429, statusText: "Too Many Requests" });

  await assert.rejects(fetchFmpStockQuotes(["RRC"]), /429 Too Many Requests.*rate limit exceeded/);
});

test("an empty symbol list makes no request and returns an empty array", async () => {
  const { fetchFmpStockQuotes } = loadClient();
  process.env.FMP_KEY = "test-key";
  let called = false;
  global.fetch = async () => {
    called = true;
    throw new Error("should not be called");
  };
  const quotes = await fetchFmpStockQuotes([]);
  assert.deepEqual(quotes, []);
  assert.equal(called, false);
});

test("FMP_KEY is read from process.env only, never a NEXT_PUBLIC_-prefixed (client-exposed) variable, and lib/fmp/client.ts is never imported by a \"use client\" component", () => {
  const clientSource = fs.readFileSync(path.resolve(__dirname, "../lib/fmp/client.ts"), "utf8");
  assert.match(clientSource, /process\.env\.FMP_KEY/);
  assert.doesNotMatch(clientSource, /NEXT_PUBLIC/);

  const componentsDir = path.resolve(__dirname, "../components");
  const offenders = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
        const source = fs.readFileSync(full, "utf8");
        if (/"use client"/.test(source) && /lib\/fmp\/client/.test(source)) offenders.push(full);
      }
    }
  })(componentsDir);
  assert.deepEqual(offenders, [], "no client component may import the server-only FMP client directly");
});
