const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const { formatDataDate, formatWeekEnding, formatRefreshTimestamp } = load("lib/market/format-dates.ts");

test("formatDataDate renders a monthly period (YYYY-MM) as 'Mon YYYY'", () => {
  assert.equal(formatDataDate("2026-08"), "Aug 2026");
  assert.equal(formatDataDate("2026-01"), "Jan 2026");
});

test("formatDataDate renders a daily/weekly period (YYYY-MM-DD) as 'Mon D, YYYY'", () => {
  assert.equal(formatDataDate("2026-08-14"), "Aug 14, 2026");
  assert.equal(formatDataDate("2026-12-31"), "Dec 31, 2026");
});

test("formatDataDate never shifts a date-only observation by timezone -- UTC-anchored regardless of the host TZ", () => {
  const originalTz = process.env.TZ;
  process.env.TZ = "Pacific/Kiritimati"; // UTC+14, the most likely to expose an off-by-one-day bug if local time were used
  try {
    assert.equal(formatDataDate("2026-08-14"), "Aug 14, 2026");
  } finally {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  }
});

test("formatDataDate returns '--' for null/undefined, never fabricates a date", () => {
  assert.equal(formatDataDate(null), "--");
  assert.equal(formatDataDate(undefined), "--");
});

test("formatDataDate returns the raw string unchanged for an unparseable period rather than throwing or inventing a date", () => {
  assert.equal(formatDataDate("not-a-period"), "not-a-period");
});

test("formatWeekEnding renders 'Week ending Mon D, YYYY'", () => {
  assert.equal(formatWeekEnding("2026-08-14"), "Week ending Aug 14, 2026");
});

test("formatRefreshTimestamp renders a real ISO instant in Central Time with a 'CT' suffix, never a raw ISO string", () => {
  const result = formatRefreshTimestamp("2026-08-26T17:15:00.000Z");
  assert.match(result, /CT$/);
  assert.doesNotMatch(result, /\d{4}-\d{2}-\d{2}T/, "must never render a raw ISO timestamp in the UI");
});

test("formatRefreshTimestamp returns 'Not yet available' for null -- never falls back to the viewer's current time", () => {
  assert.equal(formatRefreshTimestamp(null), "Not yet available");
  assert.equal(formatRefreshTimestamp(undefined), "Not yet available");
});

test("formatRefreshTimestamp returns 'Not yet available' for an unparseable timestamp rather than 'Invalid Date'", () => {
  assert.equal(formatRefreshTimestamp("not-a-timestamp"), "Not yet available");
});
