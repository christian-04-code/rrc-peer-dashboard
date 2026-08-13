/**
 * Deterministic extraction from SEC XBRL "company facts" data.
 *
 * XBRL is the only source in PHASE 3's priority order that is genuinely
 * machine-checkable: every fact carries an explicit start/end date and a
 * standardized unit, so we can refuse a match instead of guessing when the
 * period or scale looks wrong. Operating metrics (production, realized
 * pricing, per-unit costs, wells) are NOT standardized in us-gaap XBRL across
 * these seven issuers -- they live in free-form MD&A tables -- so this module
 * deliberately limits itself to the handful of us-gaap concepts that are
 * both universal and load-bearing for the FINANCIAL group. Everything else
 * is left to the manual-review worksheet path (see manual-input.mjs) so nothing
 * downstream is silently guessed from unstructured HTML tables.
 */

import { makeCandidateField, makeBlankField } from "./candidate-schema.mjs";

const COMPANY_FACTS_ORIGIN = "https://data.sec.gov";

/** us-gaap concepts pulled deterministically, in priority order per field. */
export const GAAP_CONCEPT_MAP = Object.freeze({
  revenue: ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax"],
  capitalExpenditures: [
    "PaymentsToAcquireOilAndGasProperty",
    "PaymentsToExploreAndDevelopOilAndGasProperties",
    "PaymentsForCapitalImprovements",
    "PaymentsToAcquirePropertyPlantAndEquipment",
  ],
  cashAndEquivalents: ["CashAndCashEquivalentsAtCarryingValue"],
  totalDebtFaceValue: ["LongTermDebt", "DebtInstrumentFaceAmount"],
  dilutedShares: ["WeightedAverageNumberOfDilutedSharesOutstanding"],
  cashFromOperations: ["NetCashProvidedByUsedInOperatingActivities"],
});

function requireText(value, label) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${label} is required.`);
  return value;
}

export async function fetchCompanyFacts(cik, { fetchImpl = fetch, userAgent } = {}) {
  requireText(userAgent, "SEC_USER_AGENT");
  if (!/^\d{10}$/.test(cik)) throw new Error("CIK must be a zero-padded 10-character string.");
  const url = `${COMPANY_FACTS_ORIGIN}/api/xbrl/companyfacts/CIK${cik}.json`;
  const response = await fetchImpl(url, { headers: { Accept: "application/json", "User-Agent": userAgent } });
  if (!response.ok) throw new Error(`SEC companyfacts request failed: ${response.status} ${response.statusText}.`);
  return response.json();
}

function daysBetween(startIso, endIso) {
  return (new Date(`${endIso}T00:00:00Z`) - new Date(`${startIso}T00:00:00Z`)) / 86_400_000;
}

/**
 * Finds the single fact for `concept` whose reporting window exactly matches
 * the requested [periodStart, periodEnd] standalone-quarter window. Refuses
 * (returns null) rather than guessing when:
 *  - no fact matches the exact dates (guards wrong-comparative-column errors,
 *    since prior-year comparative facts carry different start/end dates)
 *  - more than one fact matches with different values (ambiguous restatement)
 *  - the window duration is a YTD/annual span rather than ~1 quarter (guards
 *    "YTD mistaken for standalone quarter")
 */
export function findExactPeriodFact(companyFacts, concept, { periodStart, periodEnd, expectQuarterDuration = true }) {
  const usGaap = companyFacts?.facts?.["us-gaap"];
  if (!usGaap || !usGaap[concept]) return { fact: null, reason: `Concept ${concept} not present in company facts.` };

  const durationDays = daysBetween(periodStart, periodEnd);
  if (expectQuarterDuration && (durationDays < 80 || durationDays > 100)) {
    return { fact: null, reason: `Requested window ${periodStart}..${periodEnd} is ${durationDays}d, not a standalone quarter -- refusing to guess.` };
  }

  const units = usGaap[concept].units ?? {};
  const candidates = [];
  for (const [unitLabel, facts] of Object.entries(units)) {
    for (const fact of facts) {
      if (fact.start === periodStart && fact.end === periodEnd) {
        candidates.push({ ...fact, unitLabel });
      }
    }
  }

  if (candidates.length === 0) {
    return { fact: null, reason: `No ${concept} fact with exact start/end ${periodStart}..${periodEnd} (comparative-column protection).` };
  }

  const distinctValues = new Set(candidates.map((candidate) => candidate.val));
  if (distinctValues.size > 1) {
    return { fact: null, reason: `Ambiguous ${concept}: ${distinctValues.size} conflicting values reported for the same exact period.` };
  }

  // Prefer the most recently filed instance (later restatements override earlier ones).
  candidates.sort((left, right) => (right.filed ?? "").localeCompare(left.filed ?? ""));
  return { fact: candidates[0], reason: null };
}

/** Converts a raw USD companyfacts value to $MM, matching this repo's convention. */
function toMillions(rawUsd) {
  return rawUsd / 1_000_000;
}

/**
 * Extracts one FINANCIAL candidate field for `fieldName` from company facts,
 * trying each concept alias in GAAP_CONCEPT_MAP order and returning classification
 * A (auto-apply eligible) only on an exact, unambiguous period match.
 */
export function extractFinancialField(companyFacts, fieldName, { periodStart, periodEnd, accessionNumber, filingUrl, unit = "$MM", scale = "millions", expectQuarterDuration = true }) {
  const concepts = GAAP_CONCEPT_MAP[fieldName];
  if (!concepts) throw new Error(`No GAAP concept mapping registered for field "${fieldName}".`);

  const attempts = [];
  for (const concept of concepts) {
    const { fact, reason } = findExactPeriodFact(companyFacts, concept, { periodStart, periodEnd, expectQuarterDuration });
    if (fact) {
      const value = scale === "millions" ? toMillions(fact.val) : fact.val;
      if (!Number.isFinite(value)) {
        attempts.push(`${concept}: non-finite value.`);
        continue;
      }
      return makeCandidateField({
        value,
        unit,
        source: "sec-xbrl",
        sourcePeriod: `${periodStart}/${periodEnd}`,
        extractionStatus: "extracted",
        classification: "A",
        confidence: "high",
        notes: `us-gaap:${concept}, accession ${fact.accn ?? accessionNumber}, exact period match.`,
        provenance: { concept, accessionNumber: fact.accn ?? accessionNumber, filingUrl, rawValue: fact.val, rawUnit: fact.unitLabel },
      });
    }
    attempts.push(`${concept}: ${reason}`);
  }

  return makeBlankField(`No deterministic XBRL match for ${fieldName}. Attempts: ${attempts.join(" | ")}`);
}
