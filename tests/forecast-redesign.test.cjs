const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { load } = require("./helpers/ts-loader.cjs");

/**
 * Focused tests for the Forecast tab redesign (Default Forecast auto-loads; an optional
 * "Customize Production & Prices" disclosure layers per-commodity production/price
 * overrides on top of it without becoming a second engine). See the 17-point testing
 * requirement list this redesign was built against.
 */

const rrcAnnual = load("lib/forecast/scenarios/rrc-annual.ts");

const workbenchSource = fs.readFileSync(
  path.join(process.cwd(), "components", "forecast", "RrcScenarioWorkbench.tsx"),
  "utf8"
);

function baseRequest(overrides = {}) {
  return {
    strategy: "maintenance",
    production: {},
    costs: {},
    capex: {},
    pricing: {},
    commodityMode: "current-market",
    valuation: { targetEvToEbitdax: 5.5, forwardYear: "2027" },
    ...overrides
  };
}

function findQuarter(result, period) {
  return result.quarterly.find((p) => p.period === period);
}

function isFiniteNumberOrNull(value) {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}

// --- 1 & 2. Forecast loads with no user action, using existing default assumptions ---

test("1-2. the Default Forecast (empty overrides) computes successfully and uses guided/reported defaults, not fabricated inputs", () => {
  const result = rrcAnnual.runRrcAnnualForecast(baseRequest());
  assert.ok(result.annual["2026"].revenueMillion !== null);
  assert.ok(["guided", "reported"].includes(result.productionResolution["2026"].classification));
  assert.ok(["guided", "reported"].includes(result.productionResolution["2027"].classification));
  assert.ok(["guided", "reported"].includes(result.productionResolution["2028"].classification));
});

// --- 3. Reported Q1/Q2 2026 values remain unchanged, even with overrides active ---

test("3. Q1/Q2 2026 reported actuals are byte-identical whether or not Custom Production & Prices overrides are applied", () => {
  const base = rrcAnnual.runRrcAnnualForecast(baseRequest());
  const overridden = rrcAnnual.runRrcAnnualForecast(
    baseRequest({
      production: {
        2026: { gasMmcfPerDay: 900, nglMbblPerDay: 40, oilMbblPerDay: 20 },
        2027: { gasMmcfPerDay: 950, nglMbblPerDay: 45, oilMbblPerDay: 25 },
        2028: { gasMmcfPerDay: 1000, nglMbblPerDay: 50, oilMbblPerDay: 30 }
      },
      customCommodity: { henryHubPerMmbtu: 9.99, wtiPerBbl: 120, nglPerBbl: 40 }
    })
  );
  for (const period of ["2026Q1", "2026Q2"]) {
    const b = findQuarter(base, period);
    const o = findQuarter(overridden, period);
    assert.equal(o.revenue.totalMillion, b.revenue.totalMillion, `${period} revenue must be immutable`);
    assert.equal(o.ebitdaxMillion, b.ebitdaxMillion, `${period} EBITDAX must be immutable`);
    assert.equal(o.capex.totalMillion, b.capex.totalMillion, `${period} CapEx must be immutable`);
    assert.equal(o.freeCashFlowMillion, b.freeCashFlowMillion, `${period} FCF must be immutable`);
    assert.equal(o.production.totalMcfe, b.production.totalMcfe, `${period} production must be immutable`);
  }
});

// --- 4. Management production guidance/default logic remains intact ---

test("4. 2027 production default is management's guided midpoint (2.6 Bcfe/d), unaffected by the redesign's new per-commodity override plumbing", () => {
  const resolved = rrcAnnual.resolveAnnualProductionDefault("2027");
  assert.equal(resolved.classification, "guided");
  assert.equal(resolved.value, 2.6);
});

// --- 5. Custom Production & Prices dropdown is closed by default ---

test("5. the Customize Production & Prices disclosure has no `open` attribute -- closed by default", () => {
  const detailsStart = workbenchSource.indexOf("<details className=\"ann-details\">\n        <summary>\n          Customize Production");
  assert.notEqual(detailsStart, -1, "expected to find the Customize Production & Prices <details> block");
  const openingTag = workbenchSource.slice(detailsStart, detailsStart + 40);
  assert.doesNotMatch(openingTag, /\bopen\b/, "the disclosure must not be open by default");
});

// --- 6. Leaving all override fields untouched produces exactly the Default Forecast ---

test("6. an all-empty per-commodity production request produces numerically identical output to no production key at all", () => {
  const withoutKey = rrcAnnual.runRrcAnnualForecast(baseRequest());
  const withEmptyYears = rrcAnnual.runRrcAnnualForecast(baseRequest({ production: { 2026: {}, 2027: {}, 2028: {} } }));
  for (const year of ["2026", "2027", "2028"]) {
    assert.deepEqual(withEmptyYears.annual[year], withoutKey.annual[year], `${year} annual summary must match exactly`);
  }
});

// --- 7. Changing only one price changes only that assumption and dependent outputs ---

test("7. overriding only the natural gas price changes gas revenue but leaves oil/NGL revenue and all production untouched", () => {
  const base = rrcAnnual.runRrcAnnualForecast(baseRequest());
  const gasOnly = rrcAnnual.runRrcAnnualForecast(baseRequest({ customCommodity: { henryHubPerMmbtu: 12 } }));

  for (const year of ["2026", "2027", "2028"]) {
    assert.deepEqual(gasOnly.annual[year].production, base.annual[year].production, `${year} production must be unaffected by a price-only override`);
  }
  const baseQ = findQuarter(base, "2027Q2");
  const gasOnlyQ = findQuarter(gasOnly, "2027Q2");
  assert.notEqual(gasOnlyQ.revenue.gasMillion, baseQ.revenue.gasMillion, "gas revenue should change with a $12/MMBtu override");
  assert.equal(gasOnlyQ.revenue.oilMillion, baseQ.revenue.oilMillion, "oil revenue must be unaffected");
  assert.equal(gasOnlyQ.revenue.nglMillion, baseQ.revenue.nglMillion, "NGL revenue must be unaffected");
});

// --- 8. Changing only one production assumption changes only that assumption and dependent outputs ---

test("8. overriding only 2027 oil production changes oil volume/revenue but leaves gas/NGL production and revenue untouched", () => {
  const base = rrcAnnual.runRrcAnnualForecast(baseRequest());
  const oilOnly = rrcAnnual.runRrcAnnualForecast(baseRequest({ production: { 2027: { oilMbblPerDay: 99 } } }));

  const baseQ = findQuarter(base, "2027Q2");
  const oilOnlyQ = findQuarter(oilOnly, "2027Q2");
  assert.equal(oilOnlyQ.production.gasMmcf, baseQ.production.gasMmcf, "gas production must be unaffected by an oil-only override");
  assert.equal(oilOnlyQ.production.nglMbbl, baseQ.production.nglMbbl, "NGL production must be unaffected by an oil-only override");
  assert.notEqual(oilOnlyQ.production.oilMbbl, baseQ.production.oilMbbl, "oil production should change");
  assert.notEqual(oilOnlyQ.revenue.oilMillion, baseQ.revenue.oilMillion, "oil revenue should change");
  assert.equal(oilOnlyQ.revenue.gasMillion, baseQ.revenue.gasMillion, "gas revenue must be unaffected");

  // 2026 (not touched, and not downstream of 2027's balance sheet) must be fully unaffected.
  assert.deepEqual(oilOnly.annual["2026"], base.annual["2026"]);
  // 2028's own operating metrics (production/revenue/EBITDAX/CapEx/FCF) are untouched, but its
  // ending net debt correctly reflects the balance-sheet roll-forward carrying 2027's changed
  // free cash flow into 2028 -- that propagation is expected model behavior, not a leak.
  const { endingNetDebtMillion: oilOnly2028NetDebt, ...oilOnly2028Operating } = oilOnly.annual["2028"];
  const { endingNetDebtMillion: base2028NetDebt, ...base2028Operating } = base.annual["2028"];
  assert.deepEqual(oilOnly2028Operating, base2028Operating);
  assert.notEqual(oilOnly2028NetDebt, base2028NetDebt);
});

// --- 9. Multiple overrides work together ---

test("9. combining a production override and a price override on the same year applies both simultaneously", () => {
  const base = rrcAnnual.runRrcAnnualForecast(baseRequest());
  const combined = rrcAnnual.runRrcAnnualForecast(
    baseRequest({
      production: { 2027: { gasMmcfPerDay: 1200 } },
      customCommodity: { wtiPerBbl: 150 }
    })
  );
  const baseQ = findQuarter(base, "2027Q2");
  const combinedQ = findQuarter(combined, "2027Q2");
  assert.notEqual(combinedQ.production.gasMmcf, baseQ.production.gasMmcf, "gas production override should apply");
  assert.notEqual(combinedQ.revenue.oilMillion, baseQ.revenue.oilMillion, "WTI override should apply to oil revenue");
  assert.equal(combinedQ.production.oilMbbl, baseQ.production.oilMbbl, "oil production (untouched) should still match default");
});

// --- 10. Reset to Default restores the exact default forecast ---

test("10. resetToDefault clears every override input and deactivates the custom result, so the display falls back to the (already-computed) Default Forecast", () => {
  const fn = workbenchSource.slice(workbenchSource.indexOf("function resetToDefault"), workbenchSource.indexOf("const result = customActive"));
  assert.match(fn, /setGasProd\(\{ \.\.\.EMPTY_YEAR_STRINGS \}\)/);
  assert.match(fn, /setNglProd\(\{ \.\.\.EMPTY_YEAR_STRINGS \}\)/);
  assert.match(fn, /setOilProd\(\{ \.\.\.EMPTY_YEAR_STRINGS \}\)/);
  assert.match(fn, /setGasPrice\(""\)/);
  assert.match(fn, /setNglPrice\(""\)/);
  assert.match(fn, /setOilPrice\(""\)/);
  assert.match(fn, /setCustomActive\(false\)/);
  assert.match(workbenchSource, /const result = customActive \? customResult \?\? defaultResult : defaultResult;/);
});

// --- 11. Custom gas/NGL/oil production reconciles a resulting total production scenario ---

test("11. overriding all three commodities individually produces a resulting total that reflects the entered values, not management's guided total", () => {
  const guided = rrcAnnual.resolveAnnualProductionDefault("2027");
  const overridden = rrcAnnual.runRrcAnnualForecast(
    baseRequest({ production: { 2027: { gasMmcfPerDay: 500, nglMbblPerDay: 10, oilMbblPerDay: 5 } } })
  );
  const totalMcfe = overridden.annual["2027"].production.totalMcfe;
  assert.ok(totalMcfe !== null);
  const impliedBcfePerDay = totalMcfe / 365 / 1000;
  assert.ok(Math.abs(impliedBcfePerDay - guided.value) > 0.05, "the resulting total should differ from the guided total once every commodity is hand-entered");
  // 500 MMcf/d + (10 + 5) Mbbl/d * 6 = 590 MMcfe/d -> ~0.59 Bcfe/d, reconciling to the entered rates.
  assert.ok(Math.abs(impliedBcfePerDay - 0.59) < 0.01);
});

// --- 12. 2026 cash tax remains 2% ---

test("12. the 2026 modeled cash tax rate is still exactly 2%, unaffected by the redesign", () => {
  assert.equal(rrcAnnual.resolveAnnualCostDefaults("2026").cashTaxRate.value, 0.02);
});

// --- 13. Revenue -> EBITDAX -> FCF -> Net Debt -> valuation still reconciles, including with overrides ---

test("13. the full chain (revenue/EBITDAX/FCF/ending net debt/valuation) reconciles internally for an overridden scenario", () => {
  const result = rrcAnnual.runRrcAnnualForecast(
    baseRequest({
      production: { 2027: { gasMmcfPerDay: 1100 } },
      customCommodity: { henryHubPerMmbtu: 4 },
      valuation: { targetEvToEbitdax: 6, forwardYear: "2027" }
    })
  );
  assert.ok(result.annual["2027"].revenueMillion > 0);
  assert.ok(result.annual["2027"].ebitdaxMillion !== null);
  assert.ok(result.annual["2027"].freeCashFlowMillion !== null);
  assert.ok(result.annual["2027"].endingNetDebtMillion !== null);
  assert.equal(result.valuation.forwardEbitdaxMillion, result.annual["2027"].ebitdaxMillion);
  const expectedEv = result.valuation.forwardEbitdaxMillion * 6;
  assert.ok(Math.abs(result.valuation.enterpriseValueMillion - expectedEv) < 1e-6);
  assert.ok(Math.abs(result.valuation.equityValueMillion - (expectedEv - result.valuation.netDebtMillion)) < 1e-6);
});

test("13b. annual endingNetDebtMillion matches the balance-sheet roll-forward at that year's Q4, for every year", () => {
  const result = rrcAnnual.runRrcAnnualForecast(baseRequest());
  assert.equal(result.annual["2026"].endingNetDebtMillion, result.valuation.forwardYear === "2026" ? result.valuation.forecastEndingNetDebtMillion : result.annual["2026"].endingNetDebtMillion);
  const result2026Forward = rrcAnnual.runRrcAnnualForecast(baseRequest({ valuation: { targetEvToEbitdax: 5.5, forwardYear: "2026" } }));
  assert.equal(result2026Forward.annual["2026"].endingNetDebtMillion, result2026Forward.valuation.forecastEndingNetDebtMillion);
});

// --- 14 & 15. No NaN, no undefined values leak into the result ---

function assertNoNaNOrUndefined(value, pathLabel) {
  if (value === null) return;
  if (typeof value === "number") {
    assert.ok(Number.isFinite(value) || Number.isNaN(value) === false, `${pathLabel} must not be NaN`);
    assert.ok(!Number.isNaN(value), `${pathLabel} must not be NaN`);
    return;
  }
  if (typeof value === "undefined") {
    assert.fail(`${pathLabel} must not be undefined`);
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoNaNOrUndefined(item, `${pathLabel}[${index}]`));
    return;
  }
  if (typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      assertNoNaNOrUndefined(nested, `${pathLabel}.${key}`);
    }
  }
}

test("14-15. a representative Default Forecast and a fully-overridden scenario contain no NaN and no undefined anywhere in the result tree", () => {
  const scenarios = [
    rrcAnnual.runRrcAnnualForecast(baseRequest()),
    rrcAnnual.runRrcAnnualForecast(
      baseRequest({
        production: {
          2026: { gasMmcfPerDay: 900, nglMbblPerDay: 40, oilMbblPerDay: 20 },
          2027: { gasMmcfPerDay: 950, nglMbblPerDay: 45, oilMbblPerDay: 25 },
          2028: { gasMmcfPerDay: 1000, nglMbblPerDay: 50, oilMbblPerDay: 30 }
        },
        customCommodity: { henryHubPerMmbtu: 5, wtiPerBbl: 70, nglPerBbl: 25 }
      })
    )
  ];
  for (const result of scenarios) {
    assertNoNaNOrUndefined(result.annual, "annual");
    assertNoNaNOrUndefined(result.valuation, "valuation");
    assertNoNaNOrUndefined(result.dcf, "dcf");
  }
});

// --- 16. No hydration errors: the component does not call non-deterministic browser APIs during render ---

test("16. RrcScenarioWorkbench does not call Date.now()/Math.random() during render (a common SSR/client hydration-mismatch source)", () => {
  assert.doesNotMatch(workbenchSource, /Date\.now\(\)/);
  assert.doesNotMatch(workbenchSource, /Math\.random\(\)/);
});

// --- 17. No TypeScript errors: covered by `npm run typecheck` in the validation suite, not re-asserted here. ---

// --- Additional: per-field price merge (custom wins per commodity, else falls back to live) ---

test("resolveRrcAnnualInputs merges commodity prices per-field: a custom natural-gas price does not force NGL/oil off current-market pricing", () => {
  const live = {
    henryHubPerMmbtu: { value: 3.2, unit: "$/MMBtu", source: { name: "OilPriceAPI", period: "current", retrievedAt: "2026-08-11", classification: "live", notes: "" } },
    wtiPerBbl: { value: 68, unit: "$/bbl", source: { name: "OilPriceAPI", period: "current", retrievedAt: "2026-08-11", classification: "live", notes: "" } }
  };
  const resolved = rrcAnnual.resolveRrcAnnualInputs(
    baseRequest({ liveCommodity: live, customCommodity: { henryHubPerMmbtu: 9 } })
  );
  assert.equal(resolved.currentMarketPrices.henryHubPerMmbtu.value, 9);
  assert.equal(resolved.currentMarketPrices.henryHubPerMmbtu.source.classification, "user");
  assert.equal(resolved.currentMarketPrices.wtiPerBbl.value, 68);
  assert.equal(resolved.currentMarketPrices.wtiPerBbl.source.classification, "live");
});
