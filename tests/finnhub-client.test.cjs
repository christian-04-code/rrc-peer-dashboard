const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

function loadClient() {
  const filename = path.resolve(__dirname, "../lib/finnhub/client.ts");
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
const originalKey = process.env.FINNHUB_API_KEY;

function restoreGlobals() {
  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.FINNHUB_API_KEY;
  else process.env.FINNHUB_API_KEY = originalKey;
}

test.afterEach(restoreGlobals);
test.after(restoreGlobals);

test("getFinnhubApiKey throws when FINNHUB_API_KEY is missing or blank", () => {
  const { getFinnhubApiKey } = loadClient();
  delete process.env.FINNHUB_API_KEY;
  assert.throws(() => getFinnhubApiKey(), /FINNHUB_API_KEY is not set/);
  process.env.FINNHUB_API_KEY = "   ";
  assert.throws(() => getFinnhubApiKey(), /FINNHUB_API_KEY is not set/);
});

test("fetchFinnhubQuotes hits /quote once per symbol and normalizes c -> price, t -> timestamp", async () => {
  const { fetchFinnhubQuotes } = loadClient();
  process.env.FINNHUB_API_KEY = "test-key";
  const requestedUrls = [];

  global.fetch = async (url) => {
    const parsed = new URL(url.toString());
    requestedUrls.push(parsed);
    const symbol = parsed.searchParams.get("symbol");
    return new Response(JSON.stringify({ c: symbol === "RRC" ? 40.39 : 37.15, d: 2.11, dp: 5.5, h: 41, l: 38, o: 39, pc: 38.28, t: 1786384706 }), {
      status: 200
    });
  };

  const settled = await fetchFinnhubQuotes(["RRC", "AR"]);
  assert.equal(requestedUrls.length, 2);
  assert.equal(requestedUrls[0].origin, "https://finnhub.io");
  assert.equal(requestedUrls[0].pathname, "/api/v1/quote");
  assert.equal(requestedUrls[0].searchParams.get("symbol"), "RRC");
  assert.equal(requestedUrls[0].searchParams.get("token"), "test-key");

  assert.equal(settled[0].status, "fulfilled");
  assert.equal(settled[0].value.price, 40.39);
  assert.equal(settled[0].value.timestamp, 1786384706);
  assert.equal(settled[1].value.price, 37.15);
});

test("a c: 0 quote (Finnhub's own no-data convention, confirmed against the real account) normalizes to price: null, never a literal $0", async () => {
  const { fetchFinnhubQuotes } = loadClient();
  process.env.FINNHUB_API_KEY = "test-key";
  global.fetch = async () => new Response(JSON.stringify({ c: 0, d: 0, dp: 0, h: 0, l: 0, o: 0, pc: 0, t: 0 }), { status: 200 });

  const [settled] = await fetchFinnhubQuotes(["UNKNOWN"]);
  assert.equal(settled.status, "fulfilled");
  assert.equal(settled.value.price, null);
  assert.notEqual(settled.value.price, 0);
  assert.equal(settled.value.timestamp, null);
});

test("one symbol's request failure does not affect the others (per-symbol fault isolation)", async () => {
  const { fetchFinnhubQuotes } = loadClient();
  process.env.FINNHUB_API_KEY = "test-key";
  global.fetch = async (url) => {
    const symbol = new URL(url.toString()).searchParams.get("symbol");
    if (symbol === "CRK") return new Response("rate limit exceeded", { status: 429, statusText: "Too Many Requests" });
    return new Response(JSON.stringify({ c: 50, t: 1786384706 }), { status: 200 });
  };

  const settled = await fetchFinnhubQuotes(["CRK", "EQT"]);
  assert.equal(settled[0].status, "rejected");
  assert.match(settled[0].reason.message, /429 Too Many Requests/);
  assert.equal(settled[1].status, "fulfilled");
  assert.equal(settled[1].value.price, 50);
});

test("FINNHUB_API_KEY is read from process.env only, never NEXT_PUBLIC_-prefixed, and lib/finnhub/client.ts is never imported by a \"use client\" component", () => {
  const clientSource = fs.readFileSync(path.resolve(__dirname, "../lib/finnhub/client.ts"), "utf8");
  assert.match(clientSource, /process\.env\.FINNHUB_API_KEY/);
  assert.doesNotMatch(clientSource, /NEXT_PUBLIC/);

  const componentsDir = path.resolve(__dirname, "../components");
  const offenders = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
        const source = fs.readFileSync(full, "utf8");
        if (/"use client"/.test(source) && /lib\/finnhub\/client/.test(source)) offenders.push(full);
      }
    }
  })(componentsDir);
  assert.deepEqual(offenders, [], "no client component may import the server-only Finnhub client directly");
});
