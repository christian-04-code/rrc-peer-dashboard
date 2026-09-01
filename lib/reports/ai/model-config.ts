/**
 * Same reasoning as lib/market/ai/model-config.ts's MACRO_SUMMARY_MODEL and
 * lib/news/ai/model-config.ts: Claude Haiku 4.5 is this project's
 * currently-approved, lowest-cost model that still reliably supports
 * structured tool-use output. The Weekly Analyst task is a larger
 * synthesis than Macro's 3-6 sentence summary (a full executive assessment
 * plus several structured narrative sections), but it is still bounded
 * synthesis over an already-computed, already-selected evidence set, not
 * open-ended reasoning -- no reason to reach for a larger model. Kept as
 * this subsystem's own constant (not imported from lib/market/ai/ or
 * lib/news/ai/) per the established Phase 6A boundary: each domain's AI
 * config stays independently editable so a change to one can never
 * silently affect another's spend/behavior.
 */
export const WEEKLY_ANALYST_MODEL = "claude-haiku-4-5";

/**
 * Generous headroom for the full structured output: a ~450-550 word
 * executiveAssessment (~700 tokens) + biggestRisk/biggestOpportunity
 * narrative (~150-200 tokens each) + up to 5 whatChanged items (~100
 * tokens each) + up to 6 watch items (~60 tokens each) + bottomLine + JSON
 * structure overhead -- comfortably under 3000 output tokens in practice,
 * with headroom kept for a verbose response without giving the model an
 * effectively unbounded budget.
 */
export const WEEKLY_ANALYST_MAX_OUTPUT_TOKENS = 3000;

/** Anthropic per-million-token pricing for WEEKLY_ANALYST_MODEL, used only for cost estimates in reporting -- not sent to the API. */
export const WEEKLY_ANALYST_MODEL_PRICING = {
  inputPerMillionUsd: 1.0,
  outputPerMillionUsd: 5.0
};

/**
 * Versions the PROMPT (system message + input formatting), independent of
 * WEEKLY_ANALYST_SCHEMA_VERSION (ai-contract.ts, versions the output
 * shape/validation rules) and the model identifier -- all three are
 * distinct components of the analysis fingerprint (see
 * lib/reports/analyst-service.ts's computeWeeklyAnalystFingerprint). A
 * prompt wording change that doesn't touch the output schema still
 * deserves a fresh analysis, so it gets its own version to bump.
 */
export const WEEKLY_ANALYST_PROMPT_VERSION = "1.0.0";
