/**
 * Phase 7C -- the real Weekly Intelligence AI contract, replacing Phase 7A's
 * placeholder flat-narrative-string shape (`WeeklyIntelligenceAIInput`/
 * `WeeklyIntelligenceAIOutput`) now that a real evidence-selection layer
 * (analyst-evidence-selection.ts) and provider (ai/anthropic-provider.ts)
 * exist to populate/consume it. Same boundary as before, now enforced with
 * real grounding checks: the AI receives one bounded, already-computed
 * payload per weekly report and returns only narrative fields plus
 * evidence-id citations -- it may prioritize/synthesize the evidence it was
 * given; it may never invent a fact, metric, date, ranking, guidance
 * figure, chart, or source, and every evidence id it cites must both (a)
 * exist in the input's allowlist and (b) for biggestRisk/biggestOpportunity/
 * whatChanged specifically, trace back to the deterministic candidate it
 * claims to explain -- see validateWeeklyAnalystAssessment.
 */

export type WeeklyAnalystEvidenceRef = {
  evidenceId: string;
  category: string;
  label: string;
  displayValue: string;
  period: string | null;
};

export type WeeklyAnalystRiskCandidate = {
  evidenceId: string;
  driver: string;
  label: string;
  state: string;
  rank: number;
  reason: string;
};

export type WeeklyAnalystChangeRef = {
  kind: string;
  evidenceId: string;
  category: string;
  label: string;
  fromValue: string | null;
  toValue: string | null;
  fromState: string | null;
  toState: string | null;
};

export type WeeklyAnalystSourceFreshness = {
  key: string;
  label: string;
  period: string | null;
  freshness: string;
};

/**
 * The one bounded payload sent to the model. Every array here is already
 * deterministically selected/limited (analyst-evidence-selection.ts) --
 * this file only defines the shape, it does not select anything itself.
 */
export type WeeklyAnalystInput = {
  schemaVersion: string;
  report: { storageWeekEnding: string; dataCutoffAt: string };
  marketBackdrop: WeeklyAnalystEvidenceRef[];
  /** Deterministic risk-engine candidates at HIGH_RISK/MODERATE_RISK/WATCH -- the AI may explain WHY the top one(s) matter, never invent or reorder them. */
  riskCandidates: WeeklyAnalystRiskCandidate[];
  /** Deterministic risk-engine candidates at SUPPORTIVE. */
  opportunityCandidates: WeeklyAnalystRiskCandidate[];
  whatChanged: WeeklyAnalystChangeRef[];
  range: WeeklyAnalystEvidenceRef[];
  peers: WeeklyAnalystEvidenceRef[];
  news: WeeklyAnalystEvidenceRef[];
  outlook: WeeklyAnalystEvidenceRef[];
  sourcesFreshness: WeeklyAnalystSourceFreshness[];
  /** The previous published report's own bottom line, for change-detection framing only -- never part of the analysis fingerprint and never treated as current data. Null until at least one prior report has been published. */
  previousReportContext: { storageWeekEnding: string; bottomLine: string } | null;
  /**
   * Range's own published guidance records (plain-English report pass,
   * 2026-10-13) -- the ONLY evidence a risk-table "announced action" may
   * cite besides analyzed News. Optional so inputs built before this field
   * existed still validate; treated as empty when absent.
   */
  rangeAnnouncements?: WeeklyAnalystEvidenceRef[];
  /** Every evidence id appearing anywhere above, union'd -- the complete, explicit allowlist the AI may cite. Nothing outside this set may appear in the output. */
  evidenceAllowlist: string[];
};

export const WEEKLY_ANALYST_IMPACTS = ["positive", "negative", "mixed"] as const;
export type WeeklyAnalystImpact = (typeof WEEKLY_ANALYST_IMPACTS)[number];

export type WeeklyAnalystNarrativeItem = {
  title: string;
  assessment: string;
  evidenceIds: string[];
  /** whatChanged only (plain-English report pass): is this change good or bad for Range? Optional -- assessments generated before this field existed simply render without the tag. */
  impact?: WeeklyAnalystImpact;
};

/**
 * One row of the report's "Key Risks" table (plain-English report pass,
 * 2026-10-13). The risk itself and its High/Medium/Low level are NOT chosen
 * by the AI -- both come from the deterministic risk engine candidate this
 * row cites (render-model-builder.ts maps the engine's own state to a
 * level). The AI only explains why it matters and what Range can do, and
 * must keep two things strictly apart:
 *  - announcedAction: something Range has ACTUALLY announced, citing a
 *    supplied Range guidance record or analyzed News item;
 *  - possibleResponse: an option Range could consider -- never presented
 *    as a decision, commitment, or plan.
 */
export type WeeklyAnalystRiskRow = {
  evidenceId: string;
  whyItMatters: string;
  announcedAction?: string;
  announcedActionEvidenceIds?: string[];
  possibleResponse?: string;
};

export type WeeklyAnalystWatchItem = {
  item: string;
  reason: string;
  evidenceIds: string[];
};

/**
 * "Investor Questions to Prepare For" (IR-report enhancement, 2026-09-08).
 * The one genuinely new AI-synthesized field this pass adds -- everything
 * else new in this release (Valuation, Key Metrics to Watch, Guidance
 * Watch, Catalysts Calendar, Company/Peer News) is deterministic, composed
 * entirely from already-existing evidence with no new model output. Every
 * question must cite >=1 evidenceId (validateInvestorQuestion below) --
 * never a question invented with no grounding in the supplied evidence.
 * `context`/`responseFramework`/`followUpNeeded` are all optional: a
 * question can be included with only its `whyNow` reasoning and citations
 * if that's all the evidence actually supports.
 */
export type WeeklyAnalystInvestorQuestion = {
  question: string;
  whyNow: string;
  evidenceIds: string[];
  context?: string;
  /** Always rendered with an explicit "preparation based on public information, not an official Range statement" label -- see html-template.ts. Never an invented management position, commitment, or guidance. */
  responseFramework?: string;
  followUpNeeded?: string;
};

export type WeeklyAnalystAssessment = {
  schemaVersion: string;
  aiProvider: string;
  aiModel: string;
  generatedAt: string;
  executiveAssessment: string;
  biggestRisk: WeeklyAnalystNarrativeItem;
  biggestOpportunity: WeeklyAnalystNarrativeItem;
  whatChanged: WeeklyAnalystNarrativeItem[];
  managementWatchItems: WeeklyAnalystWatchItem[];
  bottomLine: string;
  /** Every evidence id the assessment relies on, union'd across all fields above -- a convenience summary, still validated as a subset of the allowlist like everything else. */
  selectedEvidenceIds: string[];
  /** May be empty -- zero is the normal, expected value for a quiet week (see WeeklyAnalystInvestorQuestion's own header). Never padded to a minimum count. */
  investorQuestions: WeeklyAnalystInvestorQuestion[];
  /** Optional for backward compatibility with assessments persisted before 1.3.0; the renderer falls back to the risk engine's own reason text when absent. */
  riskTable?: WeeklyAnalystRiskRow[];
};

export const WEEKLY_ANALYST_SCHEMA_VERSION = "1.4.0";

export class WeeklyAnalystValidationError extends Error {}

// ~150-250 word target (Phase 7C.1 brief -- revised down from Phase 7C's
// original ~450-550: the executive assessment is now the report's fast-read
// opening, not its entire analytical payload, once Phase 7D's evidence
// sections/charts carry the detailed analysis). Floor/ceiling keep the same
// proportional buffer around the target Phase 7C's original bounds used
// (roughly -22%/+27% around the target's own min/max) so a genuinely quiet
// or eventful week still isn't rejected for being modestly shorter/longer
// than a point estimate, while staying tight enough that the executive
// assessment reads in the intended ~30-60 seconds and the PDF's 5-page hard
// maximum stays honest.
// Plain-English report pass (2026-10-13): target lowered again to ~90-150
// words of short sentences, so the bounds keep the same proportional buffer
// around that smaller target.
// Five-page layout pass (2026-10-14, owner-approved): hard maximum 150 words,
// prompt target 100-130. A real Preview response at 214 words pushed page 1 over.
const MIN_EXECUTIVE_ASSESSMENT_WORDS = 70;
const MAX_EXECUTIVE_ASSESSMENT_WORDS = 150;
/** "1-2 sentences" per risk-table cell, enforced as a generous character ceiling rather than a sentence parser. */
const MAX_RISK_CELL_CHARS = 320;

// Rejects a technically-non-empty but meaningless bottomLine (e.g. "N/A",
// a stray period) that isNonEmptyString alone would let through.
const MIN_BOTTOM_LINE_CHARS = 15;
// Owner-approved (2026-10-14): two sentences, ~250 characters. Enforced as a
// character ceiling with a small margin -- sentence counting is unreliable on
// text like "U.S. supply", so the two-sentence rule lives in the prompt.
const MAX_BOTTOM_LINE_CHARS = 300;

const MAX_WHAT_CHANGED_ITEMS = 5;
// Owner-approved (2026-10-14): at most three watch items (was 6).
const MAX_WATCH_ITEMS = 3;
const MIN_WATCH_ITEMS = 1;
/** No minimum -- 0 is the normal, expected value for a quiet week (see WeeklyAnalystInvestorQuestion's own header). This is a safety ceiling only, never a target the model should try to fill. */
// Owner-approved (2026-10-14): at most two concise investor questions (was 6).
const MAX_INVESTOR_QUESTIONS = 2;

/**
 * Known generic-filler phrasing this project has decided is never an
 * acceptable substitute for a grounded assessment (Phase 7C brief: "No
 * fallback generic AI text... fail explicitly rather than publish
 * boilerplate"). Not an exhaustive NLP detector -- a deliberately narrow,
 * cheap, deterministic denylist of the exact kind of filler the brief
 * calls out by name, mirroring the same "small denylist, not a fragile
 * classifier" approach lib/market/ai/types.ts's GUARANTEED_LANGUAGE_PATTERNS
 * already uses for a different concern (guaranteed-outcome language).
 */
const GENERIC_FILLER_PATTERNS = [
  /market conditions remain dynamic/i,
  /continue(?:s)? to monitor the situation/i,
  /as the situation (?:develops|evolves)/i,
  /stay(?:ing)? informed/i,
  /time will tell/i,
  /only time will tell/i,
  /remains to be seen/i,
  /in (?:today's|this) (?:ever-changing|fast-paced|dynamic) (?:market|environment)/i
];

/** Mirrors lib/market/ai/types.ts's GUARANTEED_LANGUAGE_PATTERNS -- this output is also equity-research-adjacent commentary about Range, so the same no-guaranteed-outcome discipline applies. Kept as this subsystem's own copy (not imported) for the same reason Phase 6A drew between News/Macro: each domain's AI validation stays independently editable. */
const GUARANTEED_LANGUAGE_PATTERNS = [
  /\bwill increase\b/i,
  /\bwill decrease\b/i,
  /\bwill rise\b/i,
  /\bwill fall\b/i,
  /\bwill outperform\b/i,
  /\bwill underperform\b/i,
  /\bstock will\b/i,
  /\bshares will\b/i,
  /\bguaranteed to\b/i,
  /\bcertain to\b/i,
  /\bis certain\b/i
];

/**
 * A real Preview PDF's first-ever report characterized an EIA STEO forecast
 * value as a "$3.00/Mcf forecast floor" (and, inconsistently, a "forecast
 * midpoint" elsewhere in the same report) -- treating a projection as if it
 * were a price support level or trading threshold (Phase 7 release review
 * finding). Same denylist discipline as GENERIC_FILLER_PATTERNS/
 * GUARANTEED_LANGUAGE_PATTERNS above: a small, cheap, deterministic backstop
 * for a specific known failure mode, not a general claims-checker.
 */
const FORECAST_OVERCLAIM_PATTERNS = [
  /forecast floor/i,
  /forecast ceiling/i,
  /price floor/i,
  /support level/i,
  /resistance level/i,
  /investment threshold/i,
  /trading threshold/i
];

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function findPattern(patterns: RegExp[], text: string): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}

function fail(message: string): never {
  throw new WeeklyAnalystValidationError(message);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function validateNarrativeItem(value: unknown, fieldName: string): WeeklyAnalystNarrativeItem {
  if (typeof value !== "object" || value === null) fail(`Weekly analyst response "${fieldName}" is not an object.`);
  const record = value as Record<string, unknown>;
  if (!isNonEmptyString(record.title)) fail(`Weekly analyst response "${fieldName}.title" is missing or empty.`);
  if (!isNonEmptyString(record.assessment)) fail(`Weekly analyst response "${fieldName}.assessment" is missing or empty.`);
  if (!isStringArray(record.evidenceIds) || record.evidenceIds.length === 0) {
    fail(`Weekly analyst response "${fieldName}.evidenceIds" must be a non-empty string array.`);
  }
  // Every narrative item gets the same guarded-text check as executiveAssessment/
  // bottomLine -- a real Preview PDF's overclaim ("storage normality that would
  // otherwise suppress Henry Hub prices") appeared in biggestOpportunity, which
  // this check did not previously cover at all.
  checkGuardedText(record.assessment as string, `${fieldName}.assessment`);
  if (record.impact !== undefined && !(WEEKLY_ANALYST_IMPACTS as readonly unknown[]).includes(record.impact)) {
    fail(`Weekly analyst response "${fieldName}.impact", if present, must be one of ${WEEKLY_ANALYST_IMPACTS.join("/")}.`);
  }
  return record as WeeklyAnalystNarrativeItem;
}

function validateWatchItem(value: unknown, index: number): WeeklyAnalystWatchItem {
  if (typeof value !== "object" || value === null) fail(`Weekly analyst response managementWatchItems[${index}] is not an object.`);
  const record = value as Record<string, unknown>;
  if (!isNonEmptyString(record.item)) fail(`Weekly analyst response managementWatchItems[${index}].item is missing or empty.`);
  if (!isNonEmptyString(record.reason)) fail(`Weekly analyst response managementWatchItems[${index}].reason is missing or empty.`);
  if (!isStringArray(record.evidenceIds) || record.evidenceIds.length === 0) {
    fail(`Weekly analyst response managementWatchItems[${index}].evidenceIds must be a non-empty string array -- a watch item must be grounded in supplied evidence, never a fabricated forecast.`);
  }
  checkGuardedText(record.reason as string, `managementWatchItems[${index}].reason`);
  return record as WeeklyAnalystWatchItem;
}

function validateInvestorQuestion(value: unknown, index: number): WeeklyAnalystInvestorQuestion {
  if (typeof value !== "object" || value === null) fail(`Weekly analyst response investorQuestions[${index}] is not an object.`);
  const record = value as Record<string, unknown>;
  if (!isNonEmptyString(record.question)) fail(`Weekly analyst response investorQuestions[${index}].question is missing or empty.`);
  if (!isNonEmptyString(record.whyNow)) fail(`Weekly analyst response investorQuestions[${index}].whyNow is missing or empty.`);
  if (!isStringArray(record.evidenceIds) || record.evidenceIds.length === 0) {
    fail(`Weekly analyst response investorQuestions[${index}].evidenceIds must be a non-empty string array -- a question must be grounded in supplied evidence, never invented.`);
  }
  for (const [field, val] of [
    ["context", record.context],
    ["responseFramework", record.responseFramework],
    ["followUpNeeded", record.followUpNeeded]
  ] as const) {
    if (val !== undefined && !isNonEmptyString(val)) {
      fail(`Weekly analyst response investorQuestions[${index}].${field}, if present, must be a non-empty string.`);
    }
    if (typeof val === "string") checkGuardedText(val, `investorQuestions[${index}].${field}`);
  }
  checkGuardedText(record.question as string, `investorQuestions[${index}].question`);
  checkGuardedText(record.whyNow as string, `investorQuestions[${index}].whyNow`);
  return record as unknown as WeeklyAnalystInvestorQuestion;
}

function validateRiskRow(value: unknown, index: number): WeeklyAnalystRiskRow {
  if (typeof value !== "object" || value === null) fail(`Weekly analyst response riskTable[${index}] is not an object.`);
  const record = value as Record<string, unknown>;
  if (!isNonEmptyString(record.evidenceId)) fail(`Weekly analyst response riskTable[${index}].evidenceId is missing or empty.`);
  if (!isNonEmptyString(record.whyItMatters)) fail(`Weekly analyst response riskTable[${index}].whyItMatters is missing or empty.`);
  for (const field of ["whyItMatters", "announcedAction", "possibleResponse"] as const) {
    const val = record[field];
    if (val === undefined) continue;
    if (!isNonEmptyString(val)) fail(`Weekly analyst response riskTable[${index}].${field}, if present, must be a non-empty string.`);
    if (val.length > MAX_RISK_CELL_CHARS) fail(`Weekly analyst response riskTable[${index}].${field} is ${val.length} chars -- keep it to 1-2 short sentences (max ${MAX_RISK_CELL_CHARS}).`);
    checkGuardedText(val, `riskTable[${index}].${field}`);
  }
  if (record.announcedAction !== undefined && (!isStringArray(record.announcedActionEvidenceIds) || record.announcedActionEvidenceIds.length === 0)) {
    fail(`Weekly analyst response riskTable[${index}].announcedAction must cite announcedActionEvidenceIds -- an "announced" action has to trace to a real Range guidance record or News item.`);
  }
  return record as unknown as WeeklyAnalystRiskRow;
}

function checkGuardedText(text: string, fieldName: string): void {
  const filler = findPattern(GENERIC_FILLER_PATTERNS, text);
  if (filler) fail(`Weekly analyst response "${fieldName}" uses generic filler language ("${filler}") instead of a grounded assessment.`);
  const guaranteed = findPattern(GUARANTEED_LANGUAGE_PATTERNS, text);
  if (guaranteed) fail(`Weekly analyst response "${fieldName}" uses guaranteed-outcome language ("${guaranteed}") instead of conditional language.`);
  const overclaim = findPattern(FORECAST_OVERCLAIM_PATTERNS, text);
  if (overclaim) fail(`Weekly analyst response "${fieldName}" mischaracterizes a forecast/price level as a threshold ("${overclaim}") -- a forecast is a projection, never a floor/ceiling/support/resistance/investment threshold.`);
}

/**
 * Pure structural/content/grounding validation of a future AI response
 * against this contract and the exact input that produced it -- calls no
 * AI provider itself. Reused by ai/anthropic-provider.ts to reject and
 * retry a malformed, out-of-bounds, or ungrounded response before it is
 * ever persisted.
 */
export function validateWeeklyAnalystAssessment(value: unknown, input: WeeklyAnalystInput): WeeklyAnalystAssessment {
  if (typeof value !== "object" || value === null) fail("Weekly analyst response is not an object.");
  const record = value as Record<string, unknown>;

  for (const field of ["schemaVersion", "aiProvider", "aiModel"] as const) {
    if (!isNonEmptyString(record[field])) fail(`Weekly analyst response is missing non-empty "${field}".`);
  }
  if (!isNonEmptyString(record.generatedAt) || Number.isNaN(Date.parse(record.generatedAt as string))) {
    fail('Weekly analyst response "generatedAt" must be a valid ISO timestamp.');
  }

  if (!isNonEmptyString(record.executiveAssessment)) fail('Weekly analyst response is missing non-empty "executiveAssessment".');
  if (!isNonEmptyString(record.bottomLine)) fail('Weekly analyst response is missing non-empty "bottomLine".');
  if ((record.bottomLine as string).trim().length < MIN_BOTTOM_LINE_CHARS) {
    fail(`Weekly analyst response "bottomLine" is too short (${(record.bottomLine as string).trim().length} chars) to be a meaningful closing synthesis -- must be at least ${MIN_BOTTOM_LINE_CHARS}.`);
  }

  if ((record.bottomLine as string).trim().length > MAX_BOTTOM_LINE_CHARS) {
    fail(`Weekly analyst response "bottomLine" is ${(record.bottomLine as string).trim().length} chars -- keep it to two sentences, about 250 characters (max ${MAX_BOTTOM_LINE_CHARS}).`);
  }

  const words = wordCount(record.executiveAssessment as string);
  if (words < MIN_EXECUTIVE_ASSESSMENT_WORDS || words > MAX_EXECUTIVE_ASSESSMENT_WORDS) {
    fail(`Weekly analyst executiveAssessment is ${words} words -- outside the ${MIN_EXECUTIVE_ASSESSMENT_WORDS}-${MAX_EXECUTIVE_ASSESSMENT_WORDS} word contract range.`);
  }
  checkGuardedText(record.executiveAssessment as string, "executiveAssessment");
  checkGuardedText(record.bottomLine as string, "bottomLine");

  const biggestRisk = validateNarrativeItem(record.biggestRisk, "biggestRisk");
  const biggestOpportunity = validateNarrativeItem(record.biggestOpportunity, "biggestOpportunity");

  if (!Array.isArray(record.whatChanged) || record.whatChanged.length > MAX_WHAT_CHANGED_ITEMS) {
    fail(`Weekly analyst response "whatChanged" must be an array of at most ${MAX_WHAT_CHANGED_ITEMS} items.`);
  }
  // Hard ceiling at the number of deterministic change records actually
  // supplied -- a model may combine several supplied changes into one
  // narrative item (fewer items than records is fine), but it may never
  // invent an extra item beyond that count by re-purposing a non-change
  // evidence id (e.g. a market-backdrop or company metric) to manufacture
  // a "what changed" claim that was never in the deterministic change set.
  // The per-item grounding check below would eventually catch such an item
  // too, but only once the model has already gone looking for something to
  // cite for it; bounding the count up front is the more direct fix.
  if (record.whatChanged.length > input.whatChanged.length) {
    fail(
      `Weekly analyst response returned ${record.whatChanged.length} "whatChanged" items but only ${input.whatChanged.length} deterministic change record(s) were supplied -- at most one narrative item per supplied change record (items may combine multiple change ids into one, but the model may not invent additional items beyond the supplied count).`
    );
  }
  const whatChanged = record.whatChanged.map((item, index) => validateNarrativeItem(item, `whatChanged[${index}]`));

  if (!Array.isArray(record.managementWatchItems) || record.managementWatchItems.length < MIN_WATCH_ITEMS || record.managementWatchItems.length > MAX_WATCH_ITEMS) {
    fail(`Weekly analyst response "managementWatchItems" must be an array of ${MIN_WATCH_ITEMS}-${MAX_WATCH_ITEMS} items.`);
  }
  const managementWatchItems = record.managementWatchItems.map((item, index) => validateWatchItem(item, index));

  // investorQuestions may be genuinely absent from an older/looser response shape
  // during the transition to this field -- treated as an empty array (0 is always
  // valid) rather than a hard failure, so this new field can never be the reason
  // an otherwise-sound response gets rejected.
  const rawInvestorQuestions = record.investorQuestions === undefined ? [] : record.investorQuestions;
  if (!Array.isArray(rawInvestorQuestions) || rawInvestorQuestions.length > MAX_INVESTOR_QUESTIONS) {
    fail(`Weekly analyst response "investorQuestions" must be an array of at most ${MAX_INVESTOR_QUESTIONS} items.`);
  }
  const investorQuestions = rawInvestorQuestions.map((item, index) => validateInvestorQuestion(item, index));

  // riskTable: optional (absent = renderer's deterministic fallback), but when
  // present each row must explain a real supplied risk candidate, once.
  const rawRiskTable = record.riskTable === undefined ? [] : record.riskTable;
  if (!Array.isArray(rawRiskTable) || rawRiskTable.length > input.riskCandidates.length) {
    fail(`Weekly analyst response "riskTable" must be an array of at most ${input.riskCandidates.length} item(s) (one per supplied risk candidate).`);
  }
  const riskTable = rawRiskTable.map((row, index) => validateRiskRow(row, index));

  if (!isStringArray(record.selectedEvidenceIds)) fail('Weekly analyst response "selectedEvidenceIds" must be a string array.');
  const selectedEvidenceIds = record.selectedEvidenceIds as string[];
  if (new Set(selectedEvidenceIds).size !== selectedEvidenceIds.length) {
    fail('Weekly analyst response "selectedEvidenceIds" contains duplicate evidence ids.');
  }

  // --- Grounding: every cited evidence id must exist in the allowlist. ---
  const allowlist = new Set(input.evidenceAllowlist);
  const allCitedIds = [
    ...biggestRisk.evidenceIds,
    ...biggestOpportunity.evidenceIds,
    ...whatChanged.flatMap((item) => item.evidenceIds),
    ...managementWatchItems.flatMap((item) => item.evidenceIds),
    ...investorQuestions.flatMap((item) => item.evidenceIds),
    ...riskTable.flatMap((row) => [row.evidenceId, ...(row.announcedActionEvidenceIds ?? [])]),
    ...selectedEvidenceIds
  ];
  const unknownIds = [...new Set(allCitedIds)].filter((id) => !allowlist.has(id));
  if (unknownIds.length > 0) {
    fail(`Weekly analyst response cites evidence id(s) not present in the supplied allowlist: ${unknownIds.join(", ")}.`);
  }

  // --- Grounding: biggestRisk/biggestOpportunity must map to a real deterministic candidate, not an AI-invented ranking. ---
  const riskCandidateIds = new Set(input.riskCandidates.map((candidate) => candidate.evidenceId));
  if (!biggestRisk.evidenceIds.some((id) => riskCandidateIds.has(id))) {
    fail('Weekly analyst response "biggestRisk" does not cite any of the supplied deterministic risk candidates -- the AI may not invent a risk outside the risk engine\'s own ranking.');
  }
  const opportunityCandidateIds = new Set(input.opportunityCandidates.map((candidate) => candidate.evidenceId));
  if (!biggestOpportunity.evidenceIds.some((id) => opportunityCandidateIds.has(id))) {
    fail('Weekly analyst response "biggestOpportunity" does not cite any of the supplied deterministic opportunity candidates -- the AI may not invent an opportunity outside the risk engine\'s own ranking.');
  }

  // --- Grounding: each risk-table row explains exactly one supplied risk candidate, and an "announced" action cites only Range guidance or News. ---
  const seenRiskRows = new Set<string>();
  const announcementIds = new Set([...(input.rangeAnnouncements ?? []).map((ref) => ref.evidenceId), ...input.news.map((ref) => ref.evidenceId)]);
  riskTable.forEach((row, index) => {
    if (!riskCandidateIds.has(row.evidenceId)) {
      fail(`Weekly analyst response "riskTable[${index}]" cites ${row.evidenceId}, which is not one of the supplied deterministic risk candidates.`);
    }
    if (seenRiskRows.has(row.evidenceId)) fail(`Weekly analyst response "riskTable" lists risk ${row.evidenceId} more than once.`);
    seenRiskRows.add(row.evidenceId);
    const badAnnouncementIds = (row.announcedActionEvidenceIds ?? []).filter((id) => !announcementIds.has(id));
    if (badAnnouncementIds.length > 0) {
      fail(`Weekly analyst response "riskTable[${index}].announcedAction" cites ${badAnnouncementIds.join(", ")} -- an announced action may cite only supplied Range guidance or News evidence.`);
    }
  });

  // --- Grounding: each whatChanged narrative item must trace to at least one real supplied change. ---
  const changeIds = new Set(input.whatChanged.map((change) => change.evidenceId));
  whatChanged.forEach((item, index) => {
    if (!item.evidenceIds.some((id) => changeIds.has(id))) {
      fail(`Weekly analyst response "whatChanged[${index}]" does not cite any of the supplied deterministic change evidence -- the AI may not describe a change that was not actually supplied.`);
    }
  });

  return {
    schemaVersion: record.schemaVersion as string,
    aiProvider: record.aiProvider as string,
    aiModel: record.aiModel as string,
    generatedAt: record.generatedAt as string,
    executiveAssessment: record.executiveAssessment as string,
    biggestRisk,
    biggestOpportunity,
    whatChanged,
    managementWatchItems,
    bottomLine: record.bottomLine as string,
    selectedEvidenceIds,
    investorQuestions,
    riskTable
  };
}
