/**
 * PHASE 6: turns reviewed guidance candidates (candidate.guidance, built via
 * makeGuidanceCandidate in candidate-schema.mjs from primary-source material
 * -- earnings release, supplement, presentation, filing) into an update to
 * data/management-guidance.json.
 *
 * Important existing-architecture fact (found in PHASE 1 discovery): the file
 * has ONE global `meta.reportingCycle`, used by lib/dashboard/guidance.ts's
 * isCurrentRecord() to decide what counts as "current" for every ticker at
 * once. Bumping it early would silently hide any peer's guidance that hasn't
 * actually rolled forward to the new cycle yet. This module therefore always
 * appends new entries and never deletes old ones (stale entries stay, tagged
 * with their original reportingCycle, exactly as the current file already
 * does for the "Q1 2026" holdovers) but treats bumping meta.reportingCycle as
 * a guarded, explicit, separately-reported decision rather than an automatic
 * side effect of one company's update.
 */

function entryKey(entry) {
  return `${entry.company}|${entry.metric}|${entry.period}|${entry.reportingCycle}`;
}

/**
 * @param {object} guidanceFile parsed data/management-guidance.json
 * @param {string} ticker
 * @param {Array} candidateEntries output of makeGuidanceCandidate(), already guardrail-validated
 * @returns {{ file: object, added: number, skippedDuplicates: string[], cycleBumpEligible: boolean, cycleBumpBlockers: string[] }}
 */
export function applyGuidanceUpdate(guidanceFile, ticker, candidateEntries) {
  const next = {
    meta: { ...guidanceFile.meta },
    companies: { ...guidanceFile.companies },
  };
  const existingCompany = next.companies[ticker] ?? { entries: [] };
  const existingEntries = existingCompany.entries ?? [];
  const existingKeys = new Set(existingEntries.map(entryKey));

  const newRecords = candidateEntries.map((entry) => ({
    company: ticker,
    metric: entry.metric,
    period: entry.period,
    plotPeriod: entry.period,
    low: entry.low,
    midpoint: entry.midpoint,
    high: entry.high,
    unit: entry.unit,
    guidanceType: entry.directVsDerived === "direct" ? "company-reported" : "derived",
    source: entry.source,
    sourceDate: entry.note ?? null,
    reportingCycle: entry.reportingCycle,
    status: entry.status,
    chartable: entry.chartable,
    note: entry.note ?? null,
  }));

  const skippedDuplicates = [];
  const added = [];
  for (const record of newRecords) {
    const key = entryKey(record);
    if (existingKeys.has(key)) {
      skippedDuplicates.push(key);
      continue;
    }
    added.push(record);
    existingKeys.add(key);
  }

  next.companies[ticker] = { ...existingCompany, entries: [...existingEntries, ...added] };

  const { cycleBumpEligible, blockers } = evaluateCycleBumpReadiness(next, candidateEntries[0]?.reportingCycle);

  return {
    file: next,
    added: added.length,
    skippedDuplicates,
    cycleBumpEligible,
    cycleBumpBlockers: blockers,
  };
}

/**
 * Bumping meta.reportingCycle affects every company's "current" guidance view
 * at once, so we only report it as eligible -- never do it automatically --
 * and only when every roster company already has at least one entry tagged
 * with the candidate cycle.
 */
export function evaluateCycleBumpReadiness(guidanceFile, candidateCycle) {
  if (!candidateCycle || candidateCycle === guidanceFile.meta.reportingCycle) {
    return { cycleBumpEligible: false, blockers: ["No newer reporting cycle proposed."] };
  }
  const blockers = [];
  for (const [ticker, company] of Object.entries(guidanceFile.companies)) {
    const hasCycle = (company.entries ?? []).some((entry) => entry.reportingCycle === candidateCycle);
    if (!hasCycle) blockers.push(`${ticker} has no ${candidateCycle} guidance entries yet.`);
  }
  return { cycleBumpEligible: blockers.length === 0, blockers };
}

export function serializeGuidanceFile(file) {
  return `${JSON.stringify(file, null, 2)}\n`;
}
