/**
 * Canonical quarterly company-update candidate contract.
 *
 * A "candidate" is the reviewable, not-yet-applied output of the SEC quarterly
 * update pipeline (see scripts/sec/update.mjs). It never IS the canonical data;
 * it is a structured proposal that a human (or the deterministic apply step,
 * for fields classified AUTO_APPLY) turns into a canonical write.
 *
 * Every leaf value in a candidate is a CandidateField, not a raw number, so
 * provenance and confidence travel with the value all the way to the report
 * and to canonical storage. This mirrors the SourcedValue pattern already
 * used by lib/dashboard/financials-quarterly.ts.
 */

/** @typedef {"A"|"B"|"C"|"D"} FieldClassification
 * A = deterministic/high-confidence extraction (e.g. exact XBRL concept + exact period match)
 * B = derived value that is mathematically certain and source-backed (computed from A/B fields)
 * C = ambiguous/new-definition value that requires manual review
 * D = unavailable/not-disclosed; must remain blank
 */

/** @typedef {"AUTO_APPLY"|"REVIEW_REQUIRED"|"LEAVE_BLANK"|"UNCHANGED"} FieldAction */

/** @typedef {"sec-xbrl"|"sec-text"|"derived"|"manual-review"|"unavailable"} FieldSource */

export const FIELD_CLASSIFICATIONS = Object.freeze(["A", "B", "C", "D"]);
export const FIELD_ACTIONS = Object.freeze(["AUTO_APPLY", "REVIEW_REQUIRED", "LEAVE_BLANK", "UNCHANGED"]);
export const FIELD_SOURCES = Object.freeze(["sec-xbrl", "sec-text", "derived", "manual-review", "unavailable"]);
export const FIELD_STATUSES = Object.freeze(["extracted", "derived", "manual-input", "not-disclosed", "ambiguous"]);

const FINANCIAL_FIELDS = Object.freeze([
  "revenue",
  "adjustedEbitdax",
  "capitalExpenditures",
  "netDebt",
  "dilutedShares",
]);

const PRODUCTION_FIELDS = Object.freeze(["total", "naturalGas", "ngl", "oilCondensate"]);
const PRICING_FIELDS = Object.freeze(["realizedGas", "realizedNgl", "realizedOil", "benchmarkDifferential"]);
const COSTS_FIELDS = Object.freeze([
  "leaseOperatingExpense",
  "gatheringProcessingTransport",
  "cashGA",
  "productionTaxes",
  "totalCashUnitCosts",
]);
const OPERATING_FIELDS = Object.freeze(["wellsDrilled", "tils"]);

export const CANDIDATE_GROUPS = Object.freeze({
  financial: FINANCIAL_FIELDS,
  production: PRODUCTION_FIELDS,
  pricing: PRICING_FIELDS,
  costs: COSTS_FIELDS,
  operating: OPERATING_FIELDS,
});

function requireOneOf(value, allowed, label) {
  if (!allowed.includes(value)) {
    throw new Error(`${label} must be one of ${allowed.join(", ")}; got ${JSON.stringify(value)}.`);
  }
  return value;
}

/**
 * Builds a single CandidateField leaf. `value`/`unit` may be null (classification D,
 * or C awaiting review) but every other attribute is required so provenance is never lost.
 */
export function makeCandidateField({
  value = null,
  unit = null,
  source,
  sourcePeriod = null,
  extractionStatus,
  classification,
  confidence = null,
  notes = null,
  provenance = null,
}) {
  requireOneOf(source, FIELD_SOURCES, "CandidateField.source");
  requireOneOf(extractionStatus, FIELD_STATUSES, "CandidateField.extractionStatus");
  requireOneOf(classification, FIELD_CLASSIFICATIONS, "CandidateField.classification");
  if (confidence !== null) requireOneOf(confidence, ["high", "medium", "low"], "CandidateField.confidence");
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new Error("CandidateField.value must be a finite number or null, never NaN/Infinity.");
  }
  if (typeof value === "string" && /^(nan|#n\/a|undefined|null)$/i.test(value.trim())) {
    throw new Error(`CandidateField.value must not be a stringified sentinel: ${value}`);
  }
  return {
    value,
    unit,
    source,
    sourcePeriod,
    extractionStatus,
    classification,
    confidence,
    notes,
    provenance,
    action: null, // assigned by classify.mjs, never set by extraction
  };
}

/** Builds an empty (classification D, LEAVE_BLANK) field for a not-disclosed metric. */
export function makeBlankField(notes = "Not disclosed in reviewed source material.") {
  return makeCandidateField({
    source: "unavailable",
    extractionStatus: "not-disclosed",
    classification: "D",
    notes,
  });
}

const FIELD_KEY_PATTERN = /^[A-Z][A-Z0-9.-]*$/;
const QUARTER_KEY_PATTERN = /^Q[1-4] \d{4}$/;

export function validateIdentity(identity) {
  const errors = [];
  const { ticker, fiscalYear, fiscalQuarter, filingType, filingDate, accessionNumber, sourcePath } = identity ?? {};
  if (!ticker || !FIELD_KEY_PATTERN.test(ticker)) errors.push("identity.ticker is required and must be an uppercase ticker.");
  if (!Number.isInteger(fiscalYear) || fiscalYear < 2000 || fiscalYear > 2100) errors.push("identity.fiscalYear must be a plausible integer year.");
  if (![1, 2, 3, 4].includes(fiscalQuarter)) errors.push("identity.fiscalQuarter must be 1-4.");
  if (!["10-Q", "10-K"].includes(filingType)) errors.push('identity.filingType must be "10-Q" or "10-K".');
  if (!filingDate || !/^\d{4}-\d{2}-\d{2}$/.test(filingDate)) errors.push("identity.filingDate must be an ISO date.");
  if (!accessionNumber || !/^\d{10}-\d{2}-\d{6}$/.test(accessionNumber)) errors.push("identity.accessionNumber must be a valid SEC accession number.");
  if (!sourcePath) errors.push("identity.sourcePath is required.");
  return errors;
}

export function quarterKeyFor(identity) {
  return `Q${identity.fiscalQuarter} ${identity.fiscalYear}`;
}

/**
 * Creates an empty candidate skeleton for the given identity, with every
 * supported field pre-populated as a blank (classification D) field. Callers
 * fill in extracted/derived/manual fields over this skeleton so that any
 * field the extractor forgets to touch fails safe as LEAVE_BLANK rather than
 * silently missing from the report.
 */
export function createCandidateSkeleton(identity) {
  const identityErrors = validateIdentity(identity);
  if (identityErrors.length > 0) throw new Error(`Invalid candidate identity: ${identityErrors.join(" ")}`);

  const candidate = {
    schemaVersion: 1,
    identity: { ...identity, quarterKey: quarterKeyFor(identity) },
    financial: {},
    production: {},
    pricing: {},
    costs: {},
    operating: {},
    guidance: [],
    marketValuation: {
      status: "unknown",
      note: "Market-cap/share-price data is sourced separately from company filings; see PHASE 7 boundary documentation.",
    },
    meta: {
      generatedBy: "sec-quarterly-update-pipeline",
      replay: false,
    },
  };

  for (const [group, fields] of Object.entries(CANDIDATE_GROUPS)) {
    for (const field of fields) {
      candidate[group][field] = makeBlankField();
    }
  }
  return candidate;
}

/**
 * @typedef {{value:number|string,low:number|null,midpoint:number|null,high:number|null}} GuidanceCandidateEntry
 * low/high may both be null for a point-estimate entry (only midpoint set) or
 * an operator-threshold entry (">=" / "<=" a single reportedValue) -- both are
 * legitimate shapes already present in data/management-guidance.json. Ordering
 * (low <= midpoint <= high) is only enforced when low AND high are both
 * present, matching scripts/validate-config.mjs's existing convention.
 */

export function makeGuidanceCandidate({
  metric,
  low = null,
  midpoint = null,
  high = null,
  unit,
  period,
  status,
  reportingCycle,
  source,
  directVsDerived,
  chartable,
  note = null,
}) {
  if (!metric) throw new Error("Guidance candidate requires metric.");
  if (low !== null && (typeof low !== "number" || !Number.isFinite(low))) throw new Error(`Guidance ${metric}: low must be a finite number or null.`);
  if (high !== null && (typeof high !== "number" || !Number.isFinite(high))) throw new Error(`Guidance ${metric}: high must be a finite number or null.`);
  if (midpoint !== null && !Number.isFinite(midpoint)) throw new Error(`Guidance ${metric}: midpoint must be finite or null.`);
  if (low === null && high === null && midpoint === null) throw new Error(`Guidance ${metric}: at least one of low/midpoint/high must be set.`);
  if (low !== null && high !== null) {
    if (low > high) throw new Error(`Guidance ${metric}: low (${low}) must be <= high (${high}).`);
    if (midpoint !== null && (midpoint < low || midpoint > high)) {
      throw new Error(`Guidance ${metric}: midpoint (${midpoint}) must be between low (${low}) and high (${high}).`);
    }
  }
  requireOneOf(directVsDerived, ["direct", "derived"], `Guidance ${metric}.directVsDerived`);
  if (typeof chartable !== "boolean") throw new Error(`Guidance ${metric}: chartable must be boolean.`);
  return {
    metric, low, midpoint, high, unit, period, status, reportingCycle, source, directVsDerived, chartable, note,
  };
}

export { QUARTER_KEY_PATTERN };
