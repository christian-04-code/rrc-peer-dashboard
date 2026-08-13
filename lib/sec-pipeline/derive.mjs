/**
 * Mathematically-certain derived values (classification B): computed only
 * from other candidate fields that are themselves already classification A
 * or B with non-null values. Never touches raw filing text.
 */

import { makeCandidateField, makeBlankField } from "./candidate-schema.mjs";

function isUsable(field) {
  return field && field.value !== null && (field.classification === "A" || field.classification === "B");
}

function derivedFrom(inputs, value, unit, note) {
  const confidence = inputs.every((field) => field.confidence === "high") ? "high" : "medium";
  return makeCandidateField({
    value,
    unit,
    source: "derived",
    extractionStatus: "derived",
    classification: "B",
    confidence,
    notes: note,
    provenance: { derivedFromFields: inputs.map((field) => field.provenance?.concept ?? field.notes ?? "candidate field") },
  });
}

/** Net debt = total debt - cash, both already-extracted A/B fields. */
export function deriveNetDebt(totalDebtField, cashField) {
  if (!isUsable(totalDebtField) || !isUsable(cashField)) return makeBlankField("Net debt requires both total debt and cash as high-confidence inputs.");
  const value = totalDebtField.value - cashField.value;
  return derivedFrom([totalDebtField, cashField], value, "$MM", `Derived = total debt (${totalDebtField.value}) - cash (${cashField.value}).`);
}

/** Free cash flow = cash from operations - capital expenditures. */
export function deriveFreeCashFlow(cashFromOpsField, capexField) {
  if (!isUsable(cashFromOpsField) || !isUsable(capexField)) return makeBlankField("Free cash flow requires cash-from-operations and capex as high-confidence inputs.");
  const value = cashFromOpsField.value - capexField.value;
  return derivedFrom([cashFromOpsField, capexField], value, "$MM", `Derived = cash from operations (${cashFromOpsField.value}) - capital expenditures (${capexField.value}).`);
}

/**
 * Commodity mix percentages on an Mcfe-equivalent basis. NGL and oil/condensate
 * barrels are converted at 6 Mcfe/bbl, matching the convention already documented
 * in lib/dashboard/financials-quarterly.ts.
 */
export function deriveCommodityMix({ naturalGas, ngl, oilCondensate }) {
  if (![naturalGas, ngl, oilCondensate].every(isUsable)) {
    return {
      naturalGasPct: makeBlankField("Commodity mix requires all three production components."),
      nglPct: makeBlankField("Commodity mix requires all three production components."),
      oilCondensatePct: makeBlankField("Commodity mix requires all three production components."),
    };
  }
  const gasMcfe = naturalGas.value;
  const nglMcfe = ngl.value * 6;
  const oilMcfe = oilCondensate.value * 6;
  const totalMcfe = gasMcfe + nglMcfe + oilMcfe;
  const inputs = [naturalGas, ngl, oilCondensate];
  return {
    naturalGasPct: derivedFrom(inputs, gasMcfe / totalMcfe, "%", "Derived = natural gas Mcfe / total Mcfe (6 Mcfe/bbl NGL and oil conversion)."),
    nglPct: derivedFrom(inputs, nglMcfe / totalMcfe, "%", "Derived = NGL bbl x 6 Mcfe/bbl / total Mcfe."),
    oilCondensatePct: derivedFrom(inputs, oilMcfe / totalMcfe, "%", "Derived = oil/condensate bbl x 6 Mcfe/bbl / total Mcfe."),
  };
}

/**
 * Total cash unit costs = LOE + gathering/processing/transport + production
 * taxes + cash G&A, all already per-unit ($/Mcfe) fields, divided by nothing
 * further (they are already unit-normalized) -- this mirrors the RRC
 * convention documented in financials-quarterly.ts.
 */
export function deriveTotalCashUnitCosts({ leaseOperatingExpense, gatheringProcessingTransport, cashGA, productionTaxes }) {
  const components = [leaseOperatingExpense, gatheringProcessingTransport, cashGA, productionTaxes].filter(Boolean);
  const usableComponents = components.filter(isUsable);
  if (usableComponents.length === 0 || usableComponents.length !== components.filter((field) => field.classification !== "D").length) {
    return makeBlankField("Total cash unit costs requires all disclosed per-unit cost components to be resolved first (not left REVIEW_REQUIRED).");
  }
  const value = usableComponents.reduce((sum, field) => sum + field.value, 0);
  return derivedFrom(usableComponents, value, usableComponents[0].unit ?? "$/Mcfe", `Derived = sum of ${usableComponents.length} per-unit cost components.`);
}

/**
 * Standalone Q4 value derived as full-year minus the sum of the first three
 * quarters, only when all four inputs share the exact same definition/unit.
 * This is the one deterministic case where "derived quarter" extraction is
 * safe per PHASE 3 -- it must never be used to approximate any other quarter.
 */
export function deriveStandaloneQ4FromFullYear(fullYearField, q1Field, q2Field, q3Field) {
  const parts = [fullYearField, q1Field, q2Field, q3Field];
  if (!parts.every(isUsable)) {
    return makeBlankField("Standalone Q4 derivation requires full-year and all three prior quarters as high-confidence inputs of the same definition.");
  }
  const units = new Set(parts.map((field) => field.unit));
  if (units.size > 1) {
    return makeBlankField(`Standalone Q4 derivation blocked: mismatched units across inputs (${[...units].join(", ")}).`);
  }
  const value = fullYearField.value - q1Field.value - q2Field.value - q3Field.value;
  return derivedFrom(parts, value, fullYearField.unit, `Derived = full year (${fullYearField.value}) - Q1 (${q1Field.value}) - Q2 (${q2Field.value}) - Q3 (${q3Field.value}).`);
}

/** Net leverage = net debt / trailing adjusted EBITDAX (already resolved elsewhere; caller supplies the TTM figure). */
export function deriveNetLeverage(netDebtField, ttmEbitdaxValue) {
  if (!isUsable(netDebtField) || typeof ttmEbitdaxValue !== "number" || !Number.isFinite(ttmEbitdaxValue) || ttmEbitdaxValue === 0) {
    return makeBlankField("Net leverage requires net debt and a non-zero trailing-twelve-month EBITDAX.");
  }
  const value = netDebtField.value / ttmEbitdaxValue;
  return derivedFrom([netDebtField], value, "x", `Derived = net debt (${netDebtField.value}) / TTM adjusted EBITDAX (${ttmEbitdaxValue}).`);
}
