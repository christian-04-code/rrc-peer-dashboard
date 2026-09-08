const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const { withBoundedRetry } = load("lib/news/ai/retry.ts");

test("returns the result immediately on first-attempt success without retrying", async () => {
  let calls = 0;
  const result = await withBoundedRetry(async () => {
    calls += 1;
    return "ok";
  }, { maxAttempts: 3, baseDelayMs: 1 });
  assert.equal(result, "ok");
  assert.equal(calls, 1);
});

test("retries on failure and succeeds within the bound", async () => {
  let calls = 0;
  const result = await withBoundedRetry(async () => {
    calls += 1;
    if (calls < 2) throw new Error("transient failure");
    return "recovered";
  }, { maxAttempts: 3, baseDelayMs: 1 });
  assert.equal(result, "recovered");
  assert.equal(calls, 2);
});

test("exhausts retries and throws the last error once maxAttempts is reached", async () => {
  let calls = 0;
  await assert.rejects(
    () =>
      withBoundedRetry(async () => {
        calls += 1;
        throw new Error(`failure ${calls}`);
      }, { maxAttempts: 3, baseDelayMs: 1 }),
    /failure 3/
  );
  assert.equal(calls, 3, "must attempt exactly maxAttempts times, no more");
});

test("retries a validation-shaped error the same as any other error -- Phase 3 requires bounded retry on malformed output too", async () => {
  class FakeValidationError extends Error {}
  let calls = 0;
  const result = await withBoundedRetry(async () => {
    calls += 1;
    if (calls === 1) throw new FakeValidationError("malformed tool output");
    return { ok: true };
  }, { maxAttempts: 3, baseDelayMs: 1 });
  assert.deepEqual(result, { ok: true });
  assert.equal(calls, 2);
});

test("maxAttempts of 1 means no retry at all", async () => {
  let calls = 0;
  await assert.rejects(() =>
    withBoundedRetry(async () => {
      calls += 1;
      throw new Error("single failure");
    }, { maxAttempts: 1, baseDelayMs: 1 })
  );
  assert.equal(calls, 1);
});
