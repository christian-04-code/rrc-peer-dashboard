/**
 * Turns a CandidateField's classification (A/B/C/D, see candidate-schema.mjs)
 * plus its relationship to the current canonical value into a review action.
 *
 * This is the one place the "AUTO_APPLY only for high-confidence values"
 * critical principle is enforced. Nothing outside this function should decide
 * whether a value gets written automatically.
 */

const numbersRoughlyEqual = (a, b, tolerance = 1e-6) => Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(a), Math.abs(b));

function valuesEqual(current, proposed) {
  if (current === null || proposed === null) return current === proposed;
  if (typeof current === "number" && typeof proposed === "number") return numbersRoughlyEqual(current, proposed);
  return current === proposed;
}

/**
 * @param {object} field CandidateField from candidate-schema.mjs
 * @param {number|string|null} currentValue current canonical value for this field, or undefined if unknown
 * @param {{materialChangeThreshold?: number}} [options]
 * @returns {object} the same field, with `.action` set
 */
export function classifyField(field, currentValue, options = {}) {
  const materialChangeThreshold = options.materialChangeThreshold ?? 0.25; // 25% QoQ move

  if (field.classification === "D" || field.value === null) {
    return { ...field, action: "LEAVE_BLANK" };
  }

  if (currentValue !== undefined && valuesEqual(currentValue, field.value)) {
    return { ...field, action: "UNCHANGED" };
  }

  if (field.classification === "C") {
    return { ...field, action: "REVIEW_REQUIRED" };
  }

  // A or B: eligible for auto-apply, but only when confidence is high.
  if (field.confidence !== "high") {
    return { ...field, action: "REVIEW_REQUIRED", notes: appendNote(field.notes, "Downgraded to review: confidence below high.") };
  }

  // If this exact ticker/quarter/field ALREADY has a recorded canonical value
  // that disagrees with the freshly extracted one, that is never auto-applied
  // regardless of how small the difference is -- it means either a genuine
  // restatement or (as found during the PHASE 9 AR replay, where a raw XBRL
  // diluted-share fact differed ~0.8% from the already-canonical, human
  // -transcribed EPS-note figure for the identical filing/period) a
  // definitional mismatch between two "same-named" concepts. Either way a
  // human needs to look, not just the pipeline overwriting a settled number.
  if (typeof currentValue === "number" && typeof field.value === "number" && currentValue !== 0) {
    const changePct = ((field.value - currentValue) / currentValue) * 100;
    return {
      ...field,
      action: "REVIEW_REQUIRED",
      notes: appendNote(
        field.notes,
        `Flagged for review: proposed value disagrees with the already-canonical value (${currentValue}) by ${changePct.toFixed(1)}% for this same ticker/quarter -- never auto-applied over an existing recorded figure, however small the delta.`
      ),
    };
  }

  return { ...field, action: "AUTO_APPLY" };
}

function appendNote(existing, addition) {
  if (!existing) return addition;
  return `${existing} ${addition}`;
}

/**
 * Classifies every field in a candidate against a lookup of current canonical
 * values, returning a new candidate object (fields are replaced, never mutated
 * in place) plus a flat summary list used to render the review report.
 *
 * @param {object} candidate output of createCandidateSkeleton() with fields filled in
 * @param {(group:string, field:string) => number|string|null|undefined} getCurrentValue
 */
export function classifyCandidate(candidate, getCurrentValue, options = {}) {
  const classified = { ...candidate };
  const summary = [];

  for (const group of ["financial", "production", "pricing", "costs", "operating"]) {
    classified[group] = { ...candidate[group] };
    for (const [fieldName, field] of Object.entries(candidate[group])) {
      const currentValue = getCurrentValue(group, fieldName);
      const result = classifyField(field, currentValue, options);
      classified[group][fieldName] = result;
      summary.push({ group, field: fieldName, currentValue: currentValue ?? null, ...result });
    }
  }

  return { candidate: classified, summary };
}
