const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const {
  buildRangeMacroSignals,
  buildMacroRiskPayload,
  classifySignalMagnitude,
  classifyForecastDirection,
  computeSignalChanges,
  rankRangeMacroSignals,
  RANGE_MACRO_SIGNAL_PRIORITY
} = load("lib/market/macro-risk-engine.ts");
const { computeMacroSummaryFingerprint } = load("lib/market/persistence/summary-repo.ts");

function baseInputs(overrides = {}) {
  return {
    henryHub: { trendPct: 2, value: 3.1, period: "2026-08-25" },
    storage: { vs5yrPct: 1, value: 3169, period: "2026-08-14" },
    usGasSupply: { yoyPct: 2, value: 110, period: "2026-05" },
    appalachiaSupply: { yoyPct: 2, value: 1_150_000, period: "2026-05", statesIncluded: ["PA", "WV", "OH"] },
    lngDemand: { yoyPct: 2, value: 500_000, period: "2026-05", forecastDirection: null },
    powerDemand: { yoyPct: 2, value: 900_000, period: "2026-05" },
    industrialDemand: { yoyPct: 2, value: 700_000, period: "2026-05", forecastDirection: null },
    ...overrides
  };
}

test("classifySignalMagnitude: HIGH_RISK <= -10%, MODERATE_RISK <= -5%, WATCH between -5% and +5%, SUPPORTIVE >= +5%, UNAVAILABLE for null", () => {
  assert.equal(classifySignalMagnitude(-15), "HIGH_RISK");
  assert.equal(classifySignalMagnitude(-10), "HIGH_RISK");
  assert.equal(classifySignalMagnitude(-9.9), "MODERATE_RISK");
  assert.equal(classifySignalMagnitude(-5), "MODERATE_RISK");
  assert.equal(classifySignalMagnitude(-4.9), "WATCH");
  assert.equal(classifySignalMagnitude(4.9), "WATCH");
  assert.equal(classifySignalMagnitude(5), "SUPPORTIVE");
  assert.equal(classifySignalMagnitude(20), "SUPPORTIVE");
  assert.equal(classifySignalMagnitude(null), "UNAVAILABLE");
});

test("classifyForecastDirection compares near vs. far STEO horizon values using the same +/-5% threshold, never blended with the actual pressure number", () => {
  assert.equal(classifyForecastDirection(10, 12), "rising");
  assert.equal(classifyForecastDirection(10, 8), "falling");
  assert.equal(classifyForecastDirection(10, 10.2), "flat");
  assert.equal(classifyForecastDirection(null, 10), null);
  assert.equal(classifyForecastDirection(0, 10), null);
});

test("gas_pricing: rising Henry Hub is directly supportive (no inversion)", () => {
  const signals = buildRangeMacroSignals(baseInputs({ henryHub: { trendPct: 12, value: 4, period: "2026-08-25" } }));
  const signal = signals.find((s) => s.driver === "gas_pricing");
  assert.equal(signal.state, "SUPPORTIVE");
  assert.equal(signal.pressurePct, 12);
});

test("gas_pricing: falling Henry Hub is a risk", () => {
  const signals = buildRangeMacroSignals(baseInputs({ henryHub: { trendPct: -12, value: 2, period: "2026-08-25" } }));
  const signal = signals.find((s) => s.driver === "gas_pricing");
  assert.equal(signal.state, "HIGH_RISK");
});

test("storage_levels: a large surplus (positive vs5yrPct) is INVERTED into risk pressure -- high storage is bearish, not bullish", () => {
  const signals = buildRangeMacroSignals(baseInputs({ storage: { vs5yrPct: 15, value: 3600, period: "2026-08-14" } }));
  const signal = signals.find((s) => s.driver === "storage_levels");
  assert.equal(signal.pressurePct, -15);
  assert.equal(signal.state, "HIGH_RISK");
});

test("storage_levels: a deficit (negative vs5yrPct) is INVERTED into supportive pressure", () => {
  const signals = buildRangeMacroSignals(baseInputs({ storage: { vs5yrPct: -15, value: 2700, period: "2026-08-14" } }));
  const signal = signals.find((s) => s.driver === "storage_levels");
  assert.equal(signal.pressurePct, 15);
  assert.equal(signal.state, "SUPPORTIVE");
});

test("us_gas_supply: accelerating national production YoY is INVERTED into risk (loosens the balance)", () => {
  const signals = buildRangeMacroSignals(baseInputs({ usGasSupply: { yoyPct: 11, value: 115, period: "2026-05" } }));
  const signal = signals.find((s) => s.driver === "us_gas_supply");
  assert.equal(signal.pressurePct, -11);
  assert.equal(signal.state, "HIGH_RISK");
});

test("appalachia_supply: accelerating PA+WV+OH production YoY is INVERTED into risk (regional takeaway competition)", () => {
  const signals = buildRangeMacroSignals(baseInputs({ appalachiaSupply: { yoyPct: 11, value: 1_200_000, period: "2026-05", statesIncluded: ["PA", "WV", "OH"] } }));
  const signal = signals.find((s) => s.driver === "appalachia_supply");
  assert.equal(signal.pressurePct, -11);
  assert.equal(signal.state, "HIGH_RISK");
  assert.match(signal.metrics[0].label, /PA \+ WV \+ OH marketed production/, "never labeled Marcellus production");
  assert.doesNotMatch(signal.reason, /Marcellus/i);
});

test("lng_demand: rising LNG exports YoY is directly supportive (no inversion), and forecast direction is appended as context only, not blended into pressurePct", () => {
  const signals = buildRangeMacroSignals(baseInputs({ lngDemand: { yoyPct: 12, value: 550_000, period: "2026-05", forecastDirection: "rising" } }));
  const signal = signals.find((s) => s.driver === "lng_demand");
  assert.equal(signal.pressurePct, 12);
  assert.equal(signal.state, "SUPPORTIVE");
  assert.match(signal.reason, /STEO forecast horizon is rising/);
});

test("lng_demand: no fabricated forecast revision language when forecastDirection is null", () => {
  const signals = buildRangeMacroSignals(baseInputs({ lngDemand: { yoyPct: 2, value: 500_000, period: "2026-05", forecastDirection: null } }));
  const signal = signals.find((s) => s.driver === "lng_demand");
  assert.doesNotMatch(signal.reason, /STEO forecast horizon/);
});

test("power_data_center_demand: rising electric power gas demand YoY is supportive, and the reason explicitly notes the forecast is not combined due to unit ambiguity", () => {
  const signals = buildRangeMacroSignals(baseInputs({ powerDemand: { yoyPct: 8, value: 950_000, period: "2026-05" } }));
  const signal = signals.find((s) => s.driver === "power_data_center_demand");
  assert.equal(signal.state, "SUPPORTIVE");
  assert.match(signal.reason, /could not be safely combined/);
});

test("industrial_demand: rising industrial gas demand YoY is supportive", () => {
  const signals = buildRangeMacroSignals(baseInputs({ industrialDemand: { yoyPct: 8, value: 750_000, period: "2026-05", forecastDirection: "falling" } }));
  const signal = signals.find((s) => s.driver === "industrial_demand");
  assert.equal(signal.state, "SUPPORTIVE");
  assert.match(signal.reason, /STEO forecast horizon is falling/);
});

test("a null input produces UNAVAILABLE, never a guessed or zero-filled state", () => {
  const signals = buildRangeMacroSignals(baseInputs({ henryHub: { trendPct: null, value: null, period: null } }));
  const signal = signals.find((s) => s.driver === "gas_pricing");
  assert.equal(signal.state, "UNAVAILABLE");
  assert.equal(signal.pressurePct, null);
  assert.equal(signal.reason, "Henry Hub trend data is currently unavailable.");
});

test("Range-priority tiers: 5 primary drivers, 2 secondary, matching Section 7's exact list", () => {
  assert.deepEqual(
    Object.entries(RANGE_MACRO_SIGNAL_PRIORITY).filter(([, tier]) => tier === "primary").map(([key]) => key).sort(),
    ["appalachia_supply", "gas_pricing", "lng_demand", "storage_levels", "us_gas_supply"]
  );
  assert.deepEqual(
    Object.entries(RANGE_MACRO_SIGNAL_PRIORITY).filter(([, tier]) => tier === "secondary").map(([key]) => key).sort(),
    ["industrial_demand", "power_data_center_demand"]
  );
});

test("buildRangeMacroSignals is deterministic: identical inputs produce identical output", () => {
  const inputs = baseInputs();
  const first = JSON.stringify(buildRangeMacroSignals(inputs));
  const second = JSON.stringify(buildRangeMacroSignals(inputs));
  assert.equal(first, second);
});

test("rankRangeMacroSignals sorts HIGH_RISK > MODERATE_RISK > WATCH > SUPPORTIVE, excludes UNAVAILABLE", () => {
  const inputs = baseInputs({
    henryHub: { trendPct: -12, value: 2, period: "2026-08-25" }, // HIGH_RISK
    storage: { vs5yrPct: null, value: null, period: null }, // UNAVAILABLE
    usGasSupply: { yoyPct: 8, value: 118, period: "2026-05" }, // -8 => MODERATE_RISK
    appalachiaSupply: { yoyPct: 1, value: 1_150_000, period: "2026-05", statesIncluded: ["PA", "WV", "OH"] }, // -1 => WATCH
    lngDemand: { yoyPct: 12, value: 550_000, period: "2026-05", forecastDirection: null }, // SUPPORTIVE
    powerDemand: { yoyPct: 1, value: 900_000, period: "2026-05" }, // WATCH
    industrialDemand: { yoyPct: 1, value: 700_000, period: "2026-05", forecastDirection: null } // WATCH
  });
  const ranked = rankRangeMacroSignals(buildRangeMacroSignals(inputs), 5);
  assert.equal(ranked.length, 5);
  assert.equal(ranked[0].driver, "gas_pricing");
  assert.equal(ranked[0].state, "HIGH_RISK");
  assert.equal(ranked[1].driver, "us_gas_supply");
  assert.equal(ranked[1].state, "MODERATE_RISK");
  assert.ok(ranked.every((s) => s.state !== "UNAVAILABLE"));
});

test("rankRangeMacroSignals tie-breaks equal-state signals by Range priority tier (primary before secondary), then alphabetically by driver key", () => {
  const inputs = baseInputs({
    henryHub: { trendPct: 1, value: 3, period: "2026-08-25" }, // WATCH, primary
    storage: { vs5yrPct: -1, value: 3100, period: "2026-08-14" }, // WATCH, primary
    usGasSupply: { yoyPct: -1, value: 111, period: "2026-05" }, // WATCH, primary
    appalachiaSupply: { yoyPct: -1, value: 1_150_000, period: "2026-05", statesIncluded: ["PA", "WV", "OH"] }, // WATCH, primary
    lngDemand: { yoyPct: 1, value: 500_000, period: "2026-05", forecastDirection: null }, // WATCH, primary
    powerDemand: { yoyPct: 1, value: 900_000, period: "2026-05" }, // WATCH, secondary
    industrialDemand: { yoyPct: 1, value: 700_000, period: "2026-05", forecastDirection: null } // WATCH, secondary
  });
  const ranked = rankRangeMacroSignals(buildRangeMacroSignals(inputs), 7);
  const secondaryIndexes = ranked.map((s, i) => (s.priority === "secondary" ? i : -1)).filter((i) => i >= 0);
  const primaryIndexes = ranked.map((s, i) => (s.priority === "primary" ? i : -1)).filter((i) => i >= 0);
  assert.ok(Math.max(...primaryIndexes) < Math.min(...secondaryIndexes), "all primary-tier WATCH signals rank before secondary-tier WATCH signals");
  // Within the 5 primary-tier WATCH signals, alphabetical by driver key.
  assert.deepEqual(ranked.slice(0, 5).map((s) => s.driver), ["appalachia_supply", "gas_pricing", "lng_demand", "storage_levels", "us_gas_supply"]);
});

test("rankRangeMacroSignals guarantees at least one SUPPORTIVE signal in the top slice when one exists, even if it would otherwise be sorted out (Section 11: not only-negative)", () => {
  const inputs = baseInputs({
    henryHub: { trendPct: -12, value: 2, period: "2026-08-25" }, // HIGH_RISK
    storage: { vs5yrPct: 12, value: 3600, period: "2026-08-14" }, // HIGH_RISK (inverted)
    usGasSupply: { yoyPct: 8, value: 118, period: "2026-05" }, // MODERATE_RISK (inverted)
    appalachiaSupply: { yoyPct: 8, value: 1_200_000, period: "2026-05", statesIncluded: ["PA", "WV", "OH"] }, // MODERATE_RISK (inverted)
    lngDemand: { yoyPct: 12, value: 550_000, period: "2026-05", forecastDirection: null }, // SUPPORTIVE
    powerDemand: { yoyPct: 1, value: 900_000, period: "2026-05" }, // WATCH
    industrialDemand: { yoyPct: 1, value: 700_000, period: "2026-05", forecastDirection: null } // WATCH
  });
  const ranked = rankRangeMacroSignals(buildRangeMacroSignals(inputs), 4);
  assert.ok(ranked.some((s) => s.state === "SUPPORTIVE"), "top-4 slice must include the SUPPORTIVE signal even though 4 more-severe signals exist");
  assert.equal(ranked.find((s) => s.state === "SUPPORTIVE").driver, "lng_demand");
});

test("rankRangeMacroSignals with maxItems 0 never crashes and returns an empty list", () => {
  assert.deepEqual(rankRangeMacroSignals(buildRangeMacroSignals(baseInputs()), 0), []);
});

test("buildMacroRiskPayload's snapshotAsOf is the latest data period among included signals, never a wall-clock fetch timestamp", () => {
  const all = buildRangeMacroSignals(baseInputs());
  const ranked = rankRangeMacroSignals(all, 5);
  const payload = buildMacroRiskPayload(ranked, all);
  assert.equal(payload.snapshotAsOf, "2026-08-25");
});

test("buildMacroRiskPayload's supportingMetrics covers all evaluated (non-UNAVAILABLE) drivers, not just the top-N ranked slice", () => {
  const all = buildRangeMacroSignals(baseInputs());
  const ranked = rankRangeMacroSignals(all, 2);
  const payload = buildMacroRiskPayload(ranked, all);
  assert.equal(payload.signals.length, 2);
  assert.equal(Object.keys(payload.supportingMetrics).length, 7);
});

test("buildMacroRiskPayload omits UNAVAILABLE drivers from supportingMetrics rather than including a fabricated neutral reading", () => {
  const all = buildRangeMacroSignals(baseInputs({ powerDemand: { yoyPct: null, value: null, period: null } }));
  const ranked = rankRangeMacroSignals(all, 5);
  const payload = buildMacroRiskPayload(ranked, all);
  assert.equal(payload.supportingMetrics.power_data_center_demand, undefined);
});

test("computeMacroSummaryFingerprint is stable across two independent computations of the SAME underlying data -- required for the cron job and the browser route to agree on cache hits", () => {
  const all = buildRangeMacroSignals(baseInputs());
  const payloadA = buildMacroRiskPayload(rankRangeMacroSignals(all, 5), all);
  const payloadB = buildMacroRiskPayload(rankRangeMacroSignals(buildRangeMacroSignals(baseInputs()), 5), buildRangeMacroSignals(baseInputs()));
  assert.equal(computeMacroSummaryFingerprint(payloadA), computeMacroSummaryFingerprint(payloadB));
});

test("computeMacroSummaryFingerprint changes when a signal's underlying value materially changes", () => {
  const allA = buildRangeMacroSignals(baseInputs());
  const allB = buildRangeMacroSignals(baseInputs({ henryHub: { trendPct: -12, value: 2, period: "2026-08-25" } }));
  const fingerprintA = computeMacroSummaryFingerprint(buildMacroRiskPayload(rankRangeMacroSignals(allA, 5), allA));
  const fingerprintB = computeMacroSummaryFingerprint(buildMacroRiskPayload(rankRangeMacroSignals(allB, 5), allB));
  assert.notEqual(fingerprintA, fingerprintB);
});

test("computeSignalChanges returns an empty list (never fabricates change) when there is no prior snapshot", () => {
  const all = buildRangeMacroSignals(baseInputs());
  const payload = buildMacroRiskPayload(rankRangeMacroSignals(all, 5), all);
  assert.deepEqual(computeSignalChanges(payload, null), []);
});

test("computeSignalChanges detects a real state change between two persisted snapshots", () => {
  const allBefore = buildRangeMacroSignals(baseInputs());
  const payloadBefore = buildMacroRiskPayload(rankRangeMacroSignals(allBefore, 5), allBefore);

  const allAfter = buildRangeMacroSignals(baseInputs({ storage: { vs5yrPct: 15, value: 3600, period: "2026-08-14" } }));
  const payloadAfter = buildMacroRiskPayload(rankRangeMacroSignals(allAfter, 5), allAfter);

  const changes = computeSignalChanges(payloadAfter, payloadBefore);
  assert.equal(changes.length, 1);
  assert.equal(changes[0].driver, "storage_levels");
  assert.equal(changes[0].fromState, "WATCH");
  assert.equal(changes[0].toState, "HIGH_RISK");
});

test("computeSignalChanges reports nothing when nothing changed between two snapshots of identical underlying data", () => {
  const all = buildRangeMacroSignals(baseInputs());
  const payloadA = buildMacroRiskPayload(rankRangeMacroSignals(all, 5), all);
  const payloadB = buildMacroRiskPayload(rankRangeMacroSignals(buildRangeMacroSignals(baseInputs()), 5), buildRangeMacroSignals(baseInputs()));
  assert.deepEqual(computeSignalChanges(payloadB, payloadA), []);
});

test("computeSignalChanges skips a driver that was UNAVAILABLE (and therefore absent from supportingMetrics) in either snapshot, rather than reporting a fabricated from/to", () => {
  const allBefore = buildRangeMacroSignals(baseInputs({ powerDemand: { yoyPct: null, value: null, period: null } }));
  const payloadBefore = buildMacroRiskPayload(rankRangeMacroSignals(allBefore, 5), allBefore);
  const allAfter = buildRangeMacroSignals(baseInputs());
  const payloadAfter = buildMacroRiskPayload(rankRangeMacroSignals(allAfter, 5), allAfter);
  const changes = computeSignalChanges(payloadAfter, payloadBefore);
  assert.ok(!changes.some((change) => change.driver === "power_data_center_demand"));
});

test("rankRangeMacroSignals with all signals unavailable returns an empty list, not a crash or fabricated ranking", () => {
  const inputs = {
    henryHub: { trendPct: null, value: null, period: null },
    storage: { vs5yrPct: null, value: null, period: null },
    usGasSupply: { yoyPct: null, value: null, period: null },
    appalachiaSupply: { yoyPct: null, value: null, period: null, statesIncluded: [] },
    lngDemand: { yoyPct: null, value: null, period: null, forecastDirection: null },
    powerDemand: { yoyPct: null, value: null, period: null },
    industrialDemand: { yoyPct: null, value: null, period: null, forecastDirection: null }
  };
  assert.deepEqual(rankRangeMacroSignals(buildRangeMacroSignals(inputs), 5), []);
});
