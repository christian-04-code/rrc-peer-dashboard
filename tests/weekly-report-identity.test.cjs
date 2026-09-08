const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const {
  isValidStorageWeekEnding,
  isValidStatusTransition,
  WEEKLY_REPORT_STATUS_TRANSITIONS
} = load("lib/reports/weekly-report-types.ts");

test("isValidStorageWeekEnding accepts a real Friday storage-week-ending date", () => {
  // 2026-08-28 is a Friday.
  assert.equal(isValidStorageWeekEnding("2026-08-28"), true);
});

test("isValidStorageWeekEnding rejects a non-Friday date", () => {
  // 2026-08-27 is a Thursday.
  assert.equal(isValidStorageWeekEnding("2026-08-27"), false);
});

test("isValidStorageWeekEnding rejects a malformed string", () => {
  assert.equal(isValidStorageWeekEnding("08/28/2026"), false);
  assert.equal(isValidStorageWeekEnding("2026-8-28"), false);
  assert.equal(isValidStorageWeekEnding(""), false);
});

test("isValidStorageWeekEnding rejects a calendar date that does not exist, not silently normalized forward", () => {
  // JS Date would silently roll 2026-02-30 forward into March; must be rejected instead.
  assert.equal(isValidStorageWeekEnding("2026-02-30"), false);
});

test("isValidStatusTransition allows every documented forward transition", () => {
  assert.equal(isValidStatusTransition("pending", "building"), true);
  assert.equal(isValidStatusTransition("building", "ready"), true);
  assert.equal(isValidStatusTransition("ready", "published"), true);
  assert.equal(isValidStatusTransition("pending", "failed"), true);
  assert.equal(isValidStatusTransition("building", "failed"), true);
  assert.equal(isValidStatusTransition("ready", "failed"), true);
});

test("isValidStatusTransition rejects skipping a state", () => {
  assert.equal(isValidStatusTransition("pending", "ready"), false);
  assert.equal(isValidStatusTransition("pending", "published"), false);
  assert.equal(isValidStatusTransition("building", "published"), false);
});

test("published and failed are both terminal -- no documented transition leaves them", () => {
  assert.deepEqual(WEEKLY_REPORT_STATUS_TRANSITIONS.published, []);
  assert.deepEqual(WEEKLY_REPORT_STATUS_TRANSITIONS.failed, []);
});

test("isValidStatusTransition rejects any transition out of a terminal state", () => {
  assert.equal(isValidStatusTransition("published", "building"), false);
  assert.equal(isValidStatusTransition("published", "failed"), false);
  assert.equal(isValidStatusTransition("failed", "pending"), false);
  assert.equal(isValidStatusTransition("failed", "building"), false);
});
