/**
 * Renders the PHASE 4 review report: FIELD / CURRENT / PROPOSED / SOURCE /
 * CLASSIFICATION / CONFIDENCE-STATUS / ACTION. Used identically by --dry-run
 * (display only) and --apply (display + gate the write).
 */

function formatValue(value) {
  if (value === null || value === undefined) return "--";
  if (typeof value === "number") return String(Math.round(value * 1e6) / 1e6);
  return String(value);
}

export function buildReportRows(classificationSummary) {
  return classificationSummary.map((row) => ({
    field: `${row.group}.${row.field}`,
    current: formatValue(row.currentValue),
    proposed: formatValue(row.value),
    source: row.source,
    classification: row.classification,
    confidence: row.confidence ?? "n/a",
    action: row.action,
    notes: row.notes ?? "",
  }));
}

export function renderReportTable(rows) {
  const headers = ["FIELD", "CURRENT", "PROPOSED", "SOURCE", "CLASS", "CONFIDENCE", "ACTION"];
  const widths = headers.map((header, index) => {
    const key = ["field", "current", "proposed", "source", "classification", "confidence", "action"][index];
    return Math.max(header.length, ...rows.map((row) => String(row[key]).length));
  });
  const line = (cells) => cells.map((cell, index) => String(cell).padEnd(widths[index])).join("  ");
  const out = [line(headers), line(widths.map((width) => "-".repeat(width)))];
  for (const row of rows) {
    out.push(line([row.field, row.current, row.proposed, row.source, row.classification, row.confidence, row.action]));
  }
  return out.join("\n");
}

export function summarizeActions(rows) {
  const counts = { AUTO_APPLY: 0, REVIEW_REQUIRED: 0, LEAVE_BLANK: 0, UNCHANGED: 0 };
  for (const row of rows) counts[row.action] = (counts[row.action] ?? 0) + 1;
  return counts;
}

export function buildFullReport(candidate, classificationSummary, { guardrailErrors = [], marketDataStatus, forecastImpact } = {}) {
  const rows = buildReportRows(classificationSummary);
  return {
    identity: candidate.identity,
    generatedAt: candidate.meta?.generatedAt ?? null,
    replay: Boolean(candidate.meta?.replay),
    rows,
    table: renderReportTable(rows),
    actionCounts: summarizeActions(rows),
    guardrailErrors,
    marketDataStatus,
    forecastImpact: forecastImpact ?? null,
    readyToApply: guardrailErrors.length === 0,
  };
}
