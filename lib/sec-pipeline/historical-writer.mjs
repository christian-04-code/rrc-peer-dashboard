/**
 * PHASE 5 canonical writer, half 1 of 2: data/historical.json.
 *
 * This store is pure JSON (no hand-authored TS literals/comments to
 * preserve), so it is safe to patch programmatically. The writer only ever
 * ADDS a quarter value for a metric that doesn't already have one, or
 * confirms an existing value matches (no-op) -- it never overwrites a
 * differing existing value, since that would be a silent-guess risk the
 * task's critical principle forbids. A differing value is reported as a
 * conflict for a human to resolve via the existing data/conflict_log.csv
 * convention, not written.
 */

import { CANDIDATE_TO_HISTORICAL_METRIC } from "./canonical-field-map.mjs";

const numbersRoughlyEqual = (a, b, tolerance = 1e-3) => Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(a), Math.abs(b));

/**
 * @param {object} historicalFile parsed data/historical.json
 * @param {string} ticker
 * @param {string} quarterKey e.g. "Q3 2026"
 * @param {Array<{path:string, value:number, field:object}>} autoApplyFields flat AUTO_APPLY rows (group.field -> value) from classify.mjs's summary, already filtered to action === "AUTO_APPLY"
 * @param {{accessionNumber:string, filingUrl:string, filingType:string}} sourceMeta
 */
export function applyHistoricalUpdate(historicalFile, ticker, quarterKey, autoApplyFields, sourceMeta) {
  const next = JSON.parse(JSON.stringify(historicalFile));
  const written = [];
  const conflicts = [];
  const unmapped = [];

  const companyMetrics = next.companies?.[ticker]?.metrics;
  if (!companyMetrics) {
    throw new Error(`data/historical.json has no companies.${ticker}.metrics -- refusing to create a new company section automatically.`);
  }

  for (const row of autoApplyFields) {
    const metricName = CANDIDATE_TO_HISTORICAL_METRIC[row.path];
    if (!metricName) {
      unmapped.push(row.path);
      continue;
    }
    const metric = companyMetrics[metricName];
    if (!metric) {
      unmapped.push(`${row.path} -> historical.json metric "${metricName}" does not exist for ${ticker}`);
      continue;
    }

    const existingValue = metric.values?.[quarterKey];
    if (existingValue !== undefined && existingValue !== null) {
      if (numbersRoughlyEqual(existingValue, row.value)) continue; // already correct, no-op
      conflicts.push({ metric: metricName, quarterKey, existingValue, proposedValue: row.value, path: row.path });
      continue;
    }

    metric.values = { ...metric.values, [quarterKey]: row.value };
    metric.source_by_quarter = {
      ...metric.source_by_quarter,
      [quarterKey]: `${sourceMeta.filingType} accession ${sourceMeta.accessionNumber} (${sourceMeta.filingUrl}) via sec-quarterly-update-pipeline, auto-applied ${row.classification === "A" ? "XBRL-exact-match" : "derived"} field.`,
    };
    written.push({ metric: metricName, quarterKey, value: row.value });
  }

  return { file: next, written, conflicts, unmapped };
}

export function serializeHistoricalFile(file) {
  return `${JSON.stringify(file, null, 2)}\n`;
}
