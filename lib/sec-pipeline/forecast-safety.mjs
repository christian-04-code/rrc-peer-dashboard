/**
 * PHASE 5 Forecast rule: a new quarter update must never automatically change
 * a Forecast's forward assumptions. This module only (a) decides whether the
 * new quarter is complete enough to be eligible as the "latest detailed
 * actual" anchor (mirroring lib/forecast/data/rrc-actuals.ts's
 * RRC_LATEST_DETAILED_ACTUAL_PERIOD concept, discovered in PHASE 1), and
 * (b) compares the new quarter's realized values against the forecast's
 * existing forward assumptions for the same line items, flagging
 * REVIEW_REQUIRED when they diverge materially -- exactly the class of bug
 * the RRC gas-differential incident was (a single realized quarter silently
 * overriding management's own forward guidance). It never edits a baseline
 * or scenario file itself.
 */

const DETAIL_FIELDS = Object.freeze([
  ["production", "total"], ["production", "naturalGas"], ["production", "ngl"], ["production", "oilCondensate"],
  ["pricing", "realizedGas"], ["pricing", "realizedNgl"], ["pricing", "realizedOil"],
  ["costs", "leaseOperatingExpense"], ["costs", "gatheringProcessingTransport"], ["costs", "cashGA"],
]);

/**
 * A quarter is eligible to become the latest-detailed-actual anchor once
 * every detail field is either AUTO_APPLY (freshly confirmed) or was already
 * UNCHANGED against canonical data (i.e., not blocked on review or blank).
 */
export function checkDetailedActualEligibility(classifiedCandidate) {
  const missing = [];
  for (const [group, field] of DETAIL_FIELDS) {
    const action = classifiedCandidate[group][field].action;
    // Anything other than AUTO_APPLY/UNCHANGED is not eligible -- including an
    // unclassified field (action === null, e.g. a raw skeleton that was never
    // run through classify.mjs), which must fail safe rather than read as "ok".
    if (action !== "AUTO_APPLY" && action !== "UNCHANGED") missing.push(`${group}.${field} (${action ?? "unclassified"})`);
  }
  return { eligible: missing.length === 0, missingFields: missing };
}

/**
 * @param {Record<string, number>} newQuarterActuals e.g. { gasDifferential: -0.47, cashGA: 0.2283 }
 * @param {Record<string, number>} currentForwardAssumptions same keys, the forecast's current forward-year defaults
 * @param {number} materialThreshold fractional change that triggers review, default 15%
 */
export function compareForwardAssumptions(newQuarterActuals, currentForwardAssumptions, materialThreshold = 0.15) {
  const deltas = [];
  for (const [key, actual] of Object.entries(newQuarterActuals)) {
    const assumption = currentForwardAssumptions[key];
    if (typeof assumption !== "number" || !Number.isFinite(assumption) || assumption === 0) continue;
    const changeFraction = (actual - assumption) / Math.abs(assumption);
    if (Math.abs(changeFraction) > materialThreshold) {
      deltas.push({
        assumption: key,
        currentForwardAssumption: assumption,
        newQuarterActual: actual,
        changePct: changeFraction * 100,
        action: "REVIEW_REQUIRED",
        reason: `New quarter's realized ${key} (${actual}) diverges ${(changeFraction * 100).toFixed(1)}% from the forecast's current forward assumption (${assumption}). Per the Forecast safety rule, this quarter's ACTUAL is being recorded, but forward assumptions are NOT auto-updated -- confirm whether management guidance (not a single realized quarter) should still anchor forward years before touching any baseline/scenario file.`,
      });
    }
  }
  return deltas;
}

export function buildForecastDeltaReport({ ticker, quarterKey, classifiedCandidate, newQuarterActuals, currentForwardAssumptions, materialThreshold }) {
  const eligibility = checkDetailedActualEligibility(classifiedCandidate);
  const deltas = newQuarterActuals && currentForwardAssumptions
    ? compareForwardAssumptions(newQuarterActuals, currentForwardAssumptions, materialThreshold)
    : [];
  return {
    ticker,
    quarterKey,
    latestDetailedActualEligible: eligibility.eligible,
    missingDetailFields: eligibility.missingFields,
    forwardAssumptionDeltas: deltas,
    guidancePrecedencePreserved: true, // this module never writes to baseline/scenario files, so guidance precedence logic there is untouched by construction
    recommendation: deltas.length > 0
      ? "REVIEW_REQUIRED before promoting this quarter to the Forecast baseline -- see forwardAssumptionDeltas."
      : eligibility.eligible
        ? "Safe to record as latest actual and eligible as latest-detailed-actual anchor; no forward-assumption divergence detected."
        : "Record as latest actual, but not yet eligible as latest-detailed-actual anchor (missing detail fields).",
  };
}
