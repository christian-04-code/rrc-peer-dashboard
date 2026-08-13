/**
 * Production volumes, realized pricing, per-unit costs, and wells/TILs are not
 * standardized us-gaap XBRL concepts for these issuers -- they live in
 * free-form MD&A/"Selected Operating Data" tables and earnings-release
 * exhibits, in units and column layouts that differ company to company and
 * quarter to quarter (the exact failure modes PHASE 3 calls out: gross vs net
 * wells, completed vs TIL, YTD vs standalone, pre- vs post-hedge pricing).
 *
 * Rather than guess at HTML table structure, this module turns a reviewed
 * operator worksheet (a small JSON file the person who read the filing fills
 * in) into candidate fields. Every field produced here is classification C
 * (REVIEW_REQUIRED) by construction -- a human already read the source and
 * transcribed the number, but only Phase 4's review step promotes it into an
 * applied value. This is intentional: it is the sanctioned way non-XBRL data
 * enters the pipeline without becoming a silent auto-apply path.
 */

import { makeCandidateField, makeBlankField } from "./candidate-schema.mjs";

/**
 * @typedef {object} ManualWorksheetEntry
 * @property {number} value
 * @property {string} unit
 * @property {string} sourceLocation e.g. "RRC Q2 2026 10-Q, MD&A production table, p.20"
 * @property {string} [note]
 */

const WORKSHEET_FIELDS = Object.freeze({
  // adjustedEbitdax is non-GAAP by definition; capitalExpenditures and netDebt
  // are deliberately NOT auto-applied even when an XBRL concept technically
  // matches (see xbrl.mjs header) because this repo's own canonical
  // convention for both is company-specific (e.g. "all-in capital spending"
  // from the earnings release, face-value debt from the footnote, not the
  // raw cash-flow-statement/balance-sheet XBRL tag) -- exactly the
  // D&C-vs-total-capex and carrying-vs-face-value-debt traps PHASE 3 calls
  // out. A human confirming the number against the earnings release is the
  // correct and only path for these three fields.
  financial: ["adjustedEbitdax", "capitalExpenditures", "netDebt"],
  production: ["total", "naturalGas", "ngl", "oilCondensate"],
  pricing: ["realizedGas", "realizedNgl", "realizedOil", "benchmarkDifferential"],
  costs: ["leaseOperatingExpense", "gatheringProcessingTransport", "cashGA", "productionTaxes"],
  operating: ["wellsDrilled", "tils"],
});

export function validateWorksheet(worksheet) {
  const errors = [];
  for (const [group, fields] of Object.entries(WORKSHEET_FIELDS)) {
    const groupData = worksheet?.[group] ?? {};
    for (const field of fields) {
      const entry = groupData[field];
      if (entry === undefined || entry === null) continue; // absent = not disclosed, handled as blank
      if (typeof entry.value !== "number" || !Number.isFinite(entry.value)) {
        errors.push(`${group}.${field}.value must be a finite number.`);
      }
      if (!entry.unit) errors.push(`${group}.${field}.unit is required.`);
      if (!entry.sourceLocation) errors.push(`${group}.${field}.sourceLocation is required (exact filing/exhibit + table/page).`);
    }
  }
  return errors;
}

/**
 * Applies a reviewed worksheet onto a candidate skeleton's production/pricing/
 * costs/operating groups. Fields absent from the worksheet stay LEAVE_BLANK.
 */
export function applyManualWorksheet(candidate, worksheet) {
  const errors = validateWorksheet(worksheet);
  if (errors.length > 0) throw new Error(`Invalid manual worksheet: ${errors.join(" ")}`);

  const next = { ...candidate };
  for (const [group, fields] of Object.entries(WORKSHEET_FIELDS)) {
    next[group] = { ...candidate[group] };
    for (const field of fields) {
      const entry = worksheet?.[group]?.[field];
      if (!entry) {
        next[group][field] = candidate[group][field] ?? makeBlankField();
        continue;
      }
      next[group][field] = makeCandidateField({
        value: entry.value,
        unit: entry.unit,
        source: "sec-text",
        sourcePeriod: entry.sourcePeriod ?? null,
        extractionStatus: "manual-input",
        classification: "C",
        confidence: "medium",
        notes: entry.note ? `${entry.sourceLocation} -- ${entry.note}` : entry.sourceLocation,
        provenance: { sourceLocation: entry.sourceLocation },
      });
    }
  }
  return next;
}
