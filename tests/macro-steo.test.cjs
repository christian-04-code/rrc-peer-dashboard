const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const {
  normalizeSteoTable,
  snapshotMonthFrom,
  toSnapshotRecord,
  computeForecastRevisions,
  calculateSnapshotFreshness
} = load("lib/market/macro-steo.ts");

const fetchedAt = "2026-08-10T12:00:00.000Z";
const table = (rows) => ({ rows, fetchedAt, route: "steo/data", frequency: "monthly" });
const row = (seriesId, period, value, extra = {}) => ({
  period,
  value,
  seriesId,
  seriesDescription: extra.seriesDescription ?? "Test Series",
  unit: extra.unit ?? "test unit"
});

test("normalizeSteoTable groups rows by known series and reads label/unit directly from EIA's own response fields", () => {
  const normalized = normalizeSteoTable(
    table([
      row("NGHHMCF", "2027-01", 3.5, { seriesDescription: "Natural Gas Henry Hub Spot Price ($/mcf)", unit: "dollars per thousand cubic feet" }),
      row("NGHHMCF", "2026-12", 3.4, { seriesDescription: "Natural Gas Henry Hub Spot Price ($/mcf)", unit: "dollars per thousand cubic feet" }),
      row("NGPRPUS", "2027-01", 118.2, { seriesDescription: "Natural Gas Total Dry Production", unit: "billion cubic feet per day" })
    ])
  );

  assert.equal(normalized.henryHubForecast.label, "Natural Gas Henry Hub Spot Price ($/mcf)");
  assert.equal(normalized.henryHubForecast.unit, "dollars per thousand cubic feet");
  assert.equal(normalized.henryHubForecast.seriesId, "NGHHMCF");
  assert.deepEqual(normalized.henryHubForecast.points.map((p) => p.period), ["2027-01", "2026-12"], "points sorted newest-first");
  assert.equal(normalized.dryGasProductionForecast.label, "Natural Gas Total Dry Production");
  assert.equal(normalized.electricPowerConsumptionForecast, undefined, "a series with no rows in this table must not appear");
});

test("normalizeSteoTable silently ignores rows for a seriesId not in our verified registry -- never fabricates a 5th series", () => {
  const normalized = normalizeSteoTable(table([row("NGICPUS", "2027-01", 999, {})]));
  assert.deepEqual(Object.keys(normalized), []);
});

test("snapshotMonthFrom extracts the calendar month from a fetch timestamp", () => {
  assert.equal(snapshotMonthFrom("2026-08-10T12:00:00.000Z"), "2026-08");
  assert.equal(snapshotMonthFrom("2026-01-31T23:59:59.000Z"), "2026-01");
});

test("toSnapshotRecord carries the series' points/label/unit and derives snapshotMonth from fetchedAt", () => {
  const normalized = normalizeSteoTable(table([row("NGHHMCF", "2027-01", 3.5)]));
  const snapshot = toSnapshotRecord(normalized.henryHubForecast, "steo/data");
  assert.equal(snapshot.seriesId, "NGHHMCF");
  assert.equal(snapshot.snapshotMonth, "2026-08");
  assert.equal(snapshot.sourceRoute, "steo/data");
  assert.equal(snapshot.points.length, 1);
});

function snapshot(seriesId, snapshotMonth, points) {
  return { seriesId, label: "Test", unit: "test unit", snapshotMonth, fetchedAt: `${snapshotMonth}-15T00:00:00.000Z`, sourceRoute: "steo/data", points };
}

test("computeForecastRevisions diffs matching periods between two snapshots of the same series", () => {
  const previous = snapshot("NGLXPUS", "2026-07", [
    { period: "2027-01", value: 14.0 },
    { period: "2027-02", value: 14.2 }
  ]);
  const current = snapshot("NGLXPUS", "2026-08", [
    { period: "2027-01", value: 14.5 },
    { period: "2027-02", value: 14.0 }
  ]);

  const revisions = computeForecastRevisions(previous, current);
  assert.equal(revisions.length, 2);
  const jan = revisions.find((r) => r.period === "2027-01");
  assert.equal(jan.previousValue, 14.0);
  assert.equal(jan.currentValue, 14.5);
  assert.ok(Math.abs(jan.delta - 0.5) < 1e-9);
  assert.ok(Math.abs(jan.deltaPct - (0.5 / 14.0) * 100) < 1e-9);
  const feb = revisions.find((r) => r.period === "2027-02");
  assert.ok(feb.delta < 0, "a downward revision must be negative, not clamped to zero or flipped");
});

test("computeForecastRevisions only returns periods present in BOTH snapshots -- never invents a revision for a period only one of them covers", () => {
  const previous = snapshot("NGLXPUS", "2026-07", [{ period: "2027-01", value: 14.0 }]);
  const current = snapshot("NGLXPUS", "2026-08", [
    { period: "2027-01", value: 14.5 },
    { period: "2028-01", value: 15.0 }
  ]);
  const revisions = computeForecastRevisions(previous, current);
  assert.equal(revisions.length, 1);
  assert.equal(revisions[0].period, "2027-01");
});

test("computeForecastRevisions rejects comparing snapshots of two different series", () => {
  const previous = snapshot("NGHHMCF", "2026-07", [{ period: "2027-01", value: 3.5 }]);
  const current = snapshot("NGLXPUS", "2026-08", [{ period: "2027-01", value: 14.5 }]);
  assert.throws(() => computeForecastRevisions(previous, current), /seriesId mismatch/);
});

test("computeForecastRevisions never divides by zero -- deltaPct is null when the previous value was zero", () => {
  const previous = snapshot("NGLXPUS", "2026-07", [{ period: "2027-01", value: 0 }]);
  const current = snapshot("NGLXPUS", "2026-08", [{ period: "2027-01", value: 5 }]);
  const [revision] = computeForecastRevisions(previous, current);
  assert.equal(revision.deltaPct, null);
  assert.equal(revision.delta, 5);
});

test("calculateSnapshotFreshness is based on when the snapshot was fetched, not any period it contains", () => {
  const now = new Date("2026-08-20T00:00:00.000Z");
  assert.equal(calculateSnapshotFreshness("2026-08-10T00:00:00.000Z", now), "current");
  assert.equal(calculateSnapshotFreshness("2026-07-01T00:00:00.000Z", now), "lagged");
  assert.equal(calculateSnapshotFreshness("2026-01-01T00:00:00.000Z", now), "stale");
  assert.equal(calculateSnapshotFreshness(null, now), "unavailable");
  assert.equal(calculateSnapshotFreshness("not-a-date", now), "unavailable");
});
