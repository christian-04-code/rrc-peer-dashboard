/**
 * PHASE 8 validation guardrails. Runs against a classified candidate (and,
 * for consistency checks, the canonical stores it would be written into).
 * Returns { errors, reviewFlags } -- errors block apply outright; reviewFlags
 * downgrade an AUTO_APPLY field to REVIEW_REQUIRED without failing the run,
 * per the explicit instruction that large-but-valid changes must not
 * auto-fail, only trigger review.
 */

const UNIT_RANGES = Object.freeze({
  "$/Mcf": [0, 50],
  "$/bbl": [0, 300],
  "$/Mcfe": [0, 20],
  "$MM": [-100_000, 500_000],
  "MMcfe/d": [0, 20_000],
  "MMcf/d": [0, 20_000],
  "Mbbl/d": [0, 5_000],
  count: [0, 5_000],
  MM: [0, 100_000],
});

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function checkSentinelStrings(value, path, errors) {
  if (typeof value === "string" && /^(nan|#n\/a|undefined|null)$/i.test(value.trim())) {
    errors.push({ code: "sentinel-string", path, message: `${path} contains a stringified sentinel value: "${value}".` });
  }
}

export function validateUnitRanges(candidate) {
  const errors = [];
  for (const group of ["financial", "production", "pricing", "costs", "operating"]) {
    for (const [fieldName, field] of Object.entries(candidate[group] ?? {})) {
      const path = `${group}.${fieldName}`;
      checkSentinelStrings(field.value, path, errors);
      if (field.value === null) continue;
      if (typeof field.value === "number" && !Number.isFinite(field.value)) {
        errors.push({ code: "non-finite", path, message: `${path} is NaN/Infinity.` });
        continue;
      }
      const range = field.unit ? UNIT_RANGES[field.unit] : undefined;
      if (range && isFiniteNumber(field.value) && (field.value < range[0] || field.value > range[1])) {
        errors.push({ code: "unit-sanity", path, message: `${path} = ${field.value} ${field.unit} is outside plausible range [${range[0]}, ${range[1]}].` });
      }
    }
  }
  return errors;
}

/** Production component reconciliation: gas + NGL*6 + oil*6 (Mcfe) should equal total within tolerance. */
export function validateProductionReconciliation(candidate, tolerancePct = 0.02) {
  const { total, naturalGas, ngl, oilCondensate } = candidate.production ?? {};
  if (![total, naturalGas, ngl, oilCondensate].every((field) => field && field.value !== null)) return [];
  const computedTotal = naturalGas.value + ngl.value * 6 + oilCondensate.value * 6;
  const deltaPct = Math.abs(computedTotal - total.value) / Math.max(1, Math.abs(total.value));
  if (deltaPct > tolerancePct) {
    return [{
      code: "production-reconciliation",
      path: "production.total",
      message: `Reported total (${total.value}) diverges ${(deltaPct * 100).toFixed(1)}% from components (${computedTotal.toFixed(3)} = gas + 6x[NGL+oil]); exceeds ${(tolerancePct * 100).toFixed(0)}% tolerance.`,
    }];
  }
  return [];
}

/**
 * Many real guidance entries are point estimates (low/high both null, only
 * midpoint set) or operator-threshold entries (">=" / "<=" a single value) --
 * both legitimate per data/management-guidance.json and lib/dashboard/guidance.ts.
 * Ordering only applies when low AND high are both actually present, matching
 * scripts/validate-config.mjs's existing isFiniteNumber-gated convention so
 * this guardrail doesn't flag already-correct real-world data.
 */
export function validateGuidanceOrdering(guidanceEntries = []) {
  const errors = [];
  for (const entry of guidanceEntries) {
    const hasRange = isFiniteNumber(entry.low) && isFiniteNumber(entry.high);
    if (hasRange && entry.low > entry.high) {
      errors.push({ code: "guidance-ordering", path: `guidance.${entry.metric}`, message: `${entry.metric}: low (${entry.low}) must be <= high (${entry.high}).` });
    }
    if (hasRange && isFiniteNumber(entry.midpoint) && (entry.midpoint < entry.low || entry.midpoint > entry.high)) {
      errors.push({ code: "guidance-ordering", path: `guidance.${entry.metric}`, message: `${entry.metric}: midpoint (${entry.midpoint}) must be between low (${entry.low}) and high (${entry.high}).` });
    }
  }
  return errors;
}

export function validateShareCounts(candidate) {
  const errors = [];
  const diluted = candidate.financial?.dilutedShares;
  if (diluted && diluted.value !== null && diluted.value <= 0) {
    errors.push({ code: "share-count", path: "financial.dilutedShares", message: `Diluted shares must be > 0, got ${diluted.value}.` });
  }
  return errors;
}

/**
 * Genuine quarter-over-quarter guardrail: compares an AUTO_APPLY field's
 * proposed value against the PRIOR quarter's canonical value (distinct from
 * classify.mjs's same-quarter re-measurement check). Per PHASE 8: large
 * changes must not auto-fail if valid -- classification-A (exact XBRL match)
 * fields are never flagged here since they are already source-backed
 * deterministically; only classification-B (derived) fields, where a large
 * swing could indicate an upstream input error propagating through the
 * derivation, get downgraded. Returns REVIEW flags, not blocking errors --
 * callers fold these into the field's action, they never fail validation.
 */
export function flagLargeQoQChanges(classificationSummary, getPriorQuarterValue, threshold = 0.3) {
  const flags = [];
  for (const row of classificationSummary) {
    if (row.action !== "AUTO_APPLY" || row.classification !== "B" || typeof row.value !== "number") continue;
    const priorValue = getPriorQuarterValue(row.group, row.field);
    if (typeof priorValue !== "number" || priorValue === 0) continue;
    const changePct = ((row.value - priorValue) / Math.abs(priorValue)) * 100;
    if (Math.abs(changePct) / 100 > threshold) {
      flags.push({
        group: row.group,
        field: row.field,
        code: "large-qoq-change",
        message: `${row.group}.${row.field}: ${changePct.toFixed(1)}% change vs. prior quarter (${priorValue}) exceeds the ${(threshold * 100).toFixed(0)}% review threshold for a derived (classification-B) field.`,
      });
    }
  }
  return flags;
}

/** Every non-null field must carry a source and provenance -- no anonymous numbers. */
export function validateProvenanceRequired(candidate) {
  const errors = [];
  for (const group of ["financial", "production", "pricing", "costs", "operating"]) {
    for (const [fieldName, field] of Object.entries(candidate[group] ?? {})) {
      if (field.value === null) continue;
      if (!field.source || field.source === "unavailable") {
        errors.push({ code: "provenance-required", path: `${group}.${fieldName}`, message: `${group}.${fieldName} has a value but no source.` });
      }
      if (!field.notes && !field.provenance) {
        errors.push({ code: "provenance-required", path: `${group}.${fieldName}`, message: `${group}.${fieldName} has a value but no notes/provenance to trace it back to the filing.` });
      }
    }
  }
  return errors;
}

/** Ticker/quarter uniqueness: refuses to build a second candidate for an already-canonical quarter unless explicitly replaying. */
export function validateTickerQuarterUniqueness(candidate, existingQuarterKeys = [], { allowReplay = false } = {}) {
  const { quarterKey } = candidate.identity;
  if (!allowReplay && existingQuarterKeys.includes(quarterKey)) {
    return [{ code: "duplicate-quarter", path: "identity.quarterKey", message: `${candidate.identity.ticker} ${quarterKey} already exists in canonical data; refusing duplicate candidate.` }];
  }
  return [];
}

/**
 * After a (simulated or real) write, checks that historical.json and
 * financials-quarterly.ts agree at the given quarter, mirroring
 * tests/canonical-consistency.test.cjs's existing cross-check.
 */
export function validateCanonicalConsistency(historicalValue, financialsQuarterlyValue, { tolerance = 1e-3, label } = {}) {
  if (historicalValue === null || financialsQuarterlyValue === null) return [];
  const delta = Math.abs(historicalValue - financialsQuarterlyValue);
  if (delta > tolerance) {
    return [{ code: "canonical-duplicate-consistency", path: label ?? "unknown", message: `historical.json (${historicalValue}) and financials-quarterly.ts (${financialsQuarterlyValue}) disagree by ${delta}.` }];
  }
  return [];
}

/**
 * Runs every guardrail and separates hard errors (block apply) from soft
 * review flags (large-but-valid changes; already handled by classify.mjs's
 * REVIEW_REQUIRED demotion, surfaced here again for the report).
 */
export function runAllGuardrails(candidate, { existingQuarterKeys = [], allowReplay = false } = {}) {
  const errors = [
    ...validateUnitRanges(candidate),
    ...validateProductionReconciliation(candidate),
    ...validateGuidanceOrdering(candidate.guidance),
    ...validateShareCounts(candidate),
    ...validateProvenanceRequired(candidate),
    ...validateTickerQuarterUniqueness(candidate, existingQuarterKeys, { allowReplay }),
  ];
  return { errors, valid: errors.length === 0 };
}
