const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./helpers/ts-loader.cjs");

/**
 * VercelBlobArtifactStore lazy-imports the real `@vercel/blob` SDK inside
 * each method (await import(...)), and this project has no module-mocking
 * infrastructure to intercept that -- the same gap noted in
 * weekly-report-ai-provider.test.cjs for the Anthropic SDK. Behavioral
 * coverage of put()/get() against a fake store lives in
 * InMemoryArtifactStore's own use across weekly-report-publish-service and
 * weekly-report-latest-report-service tests, which is unaffected by this
 * fix (InMemoryArtifactStore was never touched). These are source-
 * inspection tests confirming the actual private-store fix.
 *
 * Context: the project's Vercel Blob store is PRIVATE. The first real
 * publish attempt failed with "Cannot use public access on a private
 * store" -- put() was hard-coded to `access: "public"`, and get() used a
 * bare `fetch()`, which only works for public blob URLs. Fixed to
 * `access: "private"` on both sides, with get() switched from `fetch()`
 * to @vercel/blob's own exported `get()` function (confirmed present in
 * the installed v2.8.0 API, node_modules/@vercel/blob/dist/index.d.ts),
 * which authenticates with BLOB_READ_WRITE_TOKEN and returns
 * `{ stream, blob } | null`.
 */

function readSource() {
  return fs.readFileSync(path.resolve(__dirname, "../lib/reports/render/artifact-store.ts"), "utf8");
}

test("VercelBlobArtifactStore.put() requests private access, never public", () => {
  const source = readSource();
  const classBody = source.slice(source.indexOf("export class VercelBlobArtifactStore"));
  assert.match(classBody, /access:\s*"private"/, "put() must request access: \"private\"");
  assert.doesNotMatch(classBody, /access:\s*"public"/, "no code path in the class body may request public access on this store");
});

test("VercelBlobArtifactStore.get() uses @vercel/blob's own authenticated get(), not a bare fetch()", () => {
  const source = readSource();
  const getMethodBody = source.slice(source.indexOf("async get(key: string)"));
  assert.match(getMethodBody, /await import\("@vercel\/blob"\)/, "must import the SDK inside get(), matching put()'s lazy-import convention");
  assert.match(getMethodBody, /get\(key,\s*\{\s*access:\s*"private",\s*token:\s*this\.token\s*\}\)/, "must call the SDK's get() with access: \"private\" and the read-write token");
  assert.doesNotMatch(getMethodBody, /\bfetch\(key\)/, "must not fall back to a bare fetch() -- a private blob's URL is not fetchable without authentication");
});

test("VercelBlobArtifactStore.get() returns null for a not-found blob without throwing (matches the ArtifactStorageProvider contract)", () => {
  const source = readSource();
  const getMethodBody = source.slice(source.indexOf("async get(key: string)"), source.lastIndexOf("}"));
  assert.match(getMethodBody, /if\s*\(!result/, "must handle a null/falsy SDK result as \"not found\", not an error");
});

test("VercelBlobArtifactStore.put() still returns the blob's own URL as the ArtifactPutResult.key, unaffected by the access-level fix", () => {
  const { VercelBlobArtifactStore } = load("lib/reports/render/artifact-store.ts");
  assert.equal(typeof VercelBlobArtifactStore, "function");
  const source = readSource();
  assert.match(source, /return \{ key: result\.url, checksum, sizeBytes: buffer\.byteLength, contentType \}/);
});

test("InMemoryArtifactStore is untouched by the private-Blob fix (still a plain in-process Map, no access-level concept)", () => {
  const { InMemoryArtifactStore } = load("lib/reports/render/artifact-store.ts");
  const store = new InMemoryArtifactStore();
  return (async () => {
    const buffer = Buffer.from("test-bytes");
    const putResult = await store.put("some/path.pdf", buffer, "application/pdf");
    const readBack = await store.get(putResult.key);
    assert.deepEqual(readBack, buffer);
    assert.equal(await store.get("nonexistent"), null);
  })();
});
