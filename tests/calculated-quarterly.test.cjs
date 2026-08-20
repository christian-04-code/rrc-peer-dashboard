const test = require("node:test");
const assert = require("node:assert/strict");
const { load } = require("./helpers/ts-loader.cjs");

const {
  daysInQuarter,
  getCapexPerMcfe,
  getLtmAdjustedEbitdax,
  getNetDebtToLtmAdjustedEbitdax,
  getRealizedPricePerMcfe
} = load("lib/dashboard/calculated-quarterly.ts");
const { getQuarterlyFinancials, quarters } = load("lib/dashboard/financials-quarterly.ts");

test("daysInQuarter returns exact calendar days, accounting for leap years", () => {
  assert.equal(daysInQuarter("Q1 2024"), 91); // Jan(31) + Feb(29, leap) + Mar(31)
  assert.equal(daysInQuarter("Q1 2025"), 90); // Jan(31) + Feb(28) + Mar(31)
  assert.equal(daysInQuarter("Q2 2024"), 91); // Apr(30) + May(31) + Jun(30)
  assert.equal(daysInQuarter("Q3 2024"), 92); // Jul(31) + Aug(31) + Sep(30)
  assert.equal(daysInQuarter("Q4 2024"), 92); // Oct(31) + Nov(30) + Dec(31)
  assert.equal(daysInQuarter("not a quarter"), null);
});

test("LTM Adjusted EBITDAX sums exactly four standalone quarters, never a YTD figure", () => {
  const q1 = getQuarterlyFinancials("RRC", "Q1 2024").adjustedEbitdax.value;
  const q2 = getQuarterlyFinancials("RRC", "Q2 2024").adjustedEbitdax.value;
  const q3 = getQuarterlyFinancials("RRC", "Q3 2024").adjustedEbitdax.value;
  const q4 = getQuarterlyFinancials("RRC", "Q4 2024").adjustedEbitdax.value;
  const ltm = getLtmAdjustedEbitdax("RRC", "Q4 2024");
  assert.ok(Math.abs(ltm.value - (q1 + q2 + q3 + q4)) < 1e-6);
  // A YTD figure through Q4 would equal the same four-quarter sum for the first fiscal
  // year (nothing to accidentally double with here), but a YTD-summation bug applied to
  // an EARLY quarter would double count -- confirm Q2's independent LTM call (which
  // requires four PRIOR quarters and Q2 2024 only has two available) is unavailable
  // rather than silently substituting a partial-year total.
  const early = getLtmAdjustedEbitdax("RRC", "Q2 2024");
  assert.equal(early.value, null);
  assert.match(early.note, /Four reported quarters/);
});

test("LTM EBITDAX is unavailable, not partially summed, when any of the four underlying quarters is blank", () => {
  const result = getLtmAdjustedEbitdax("GPOR", "Q2 2026");
  // GPOR Q2 2026 adjustedEbitdax is outside the accepted six-metric actuals scope for
  // some fields; if adjustedEbitdax itself is ever blank for GPOR, LTM must not silently
  // sum the other three quarters as if that were a valid trailing-twelve-month figure.
  const q2 = getQuarterlyFinancials("GPOR", "Q2 2026").adjustedEbitdax.value;
  if (q2 === null) {
    assert.equal(result.value, null);
  } else {
    assert.notEqual(result.value, null);
  }
});

test("CapEx / Mcfe is a small $/Mcfe figure, not $MM or a bare ratio (unit check)", () => {
  for (const ticker of ["RRC", "AR", "CNX", "EQT"]) {
    for (const quarter of quarters) {
      const financials = getQuarterlyFinancials(ticker, quarter);
      const result = getCapexPerMcfe(ticker, quarter);
      if (financials.capitalExpenditures.value === null || financials.production.total.value === null) {
        assert.equal(result.value, null);
        continue;
      }
      assert.ok(result.value > 0 && result.value < 20, `${ticker} ${quarter}: ${result.value} outside plausible $/Mcfe range`);
    }
  }
});

test("CapEx / Mcfe reproduces the manual unit conversion for RRC Q1 2024", () => {
  const financials = getQuarterlyFinancials("RRC", "Q1 2024");
  const days = daysInQuarter("Q1 2024");
  const expected = (financials.capitalExpenditures.value * 1_000_000) / (financials.production.total.value * days * 1000);
  assert.ok(Math.abs(getCapexPerMcfe("RRC", "Q1 2024").value - expected) < 1e-9);
});

test("CapEx / Mcfe is unavailable when capex or production is blank, never defaults to zero", () => {
  const result = getCapexPerMcfe("GPOR", "Q2 2026");
  const financials = getQuarterlyFinancials("GPOR", "Q2 2026");
  if (financials.capitalExpenditures.value === null || financials.production.total.value === null) {
    assert.equal(result.value, null);
    assert.notEqual(result.value, 0);
  }
});

test("Realized Price / Mcfe is unavailable (not zero-filled) when a nonzero-production component has no reported price", () => {
  // CRK's NGL production is documented as unresolved (null) for every stored quarter.
  for (const quarter of quarters) {
    const result = getRealizedPricePerMcfe("CRK", quarter);
    assert.equal(result.value, null);
    assert.match(result.note, /ngl/);
  }
});

test("Realized Price / Mcfe reproduces the manual price x volume / total-Mcfe calculation for RRC Q1 2024", () => {
  const financials = getQuarterlyFinancials("RRC", "Q1 2024");
  const days = daysInQuarter("Q1 2024");
  const gasRevenue = financials.production.naturalGas.value * days * 1000 * financials.realizedPrices.naturalGas.value;
  const nglRevenue = financials.production.ngl.value * days * 1000 * financials.realizedPrices.ngl.value;
  const oilRevenue = financials.production.oilCondensate.value * days * 1000 * financials.realizedPrices.oilCondensate.value;
  const totalMcfe = financials.production.total.value * days * 1000;
  const expected = (gasRevenue + nglRevenue + oilRevenue) / totalMcfe;
  assert.ok(Math.abs(getRealizedPricePerMcfe("RRC", "Q1 2024").value - expected) < 1e-9);
});

test("Realized Price / Mcfe sits within a plausible blended band (between the lowest and highest per-Mcfe-equivalent commodity price) whenever it resolves", () => {
  for (const ticker of ["RRC", "AR", "CNX", "EQT", "EXE", "GPOR"]) {
    for (const quarter of quarters) {
      const blended = getRealizedPricePerMcfe(ticker, quarter);
      if (blended.value === null) continue;
      const financials = getQuarterlyFinancials(ticker, quarter);
      const perMcfePrices = [financials.realizedPrices.naturalGas.value, financials.realizedPrices.ngl.value === null ? null : financials.realizedPrices.ngl.value / 6, financials.realizedPrices.oilCondensate.value === null ? null : financials.realizedPrices.oilCondensate.value / 6].filter((value) => value !== null);
      const min = Math.min(...perMcfePrices);
      const max = Math.max(...perMcfePrices);
      assert.ok(blended.value >= min - 1e-6 && blended.value <= max + 1e-6, `${ticker} ${quarter}: blended ${blended.value} outside component band [${min}, ${max}]`);
    }
  }
});

test("Net Debt / LTM EBITDAX is unavailable, not fabricated, when net debt or LTM EBITDAX is blank", () => {
  const result = getNetDebtToLtmAdjustedEbitdax("RRC", "Q2 2024");
  assert.equal(result.value, null);
});
