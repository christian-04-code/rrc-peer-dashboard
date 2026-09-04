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
 * Headroom for the full structured output: a ~150-250 word
 * executiveAssessment (~350 tokens, Phase 7C.1 -- shortened from Phase 7C's
 * original ~450-550 words now that the report's own evidence sections carry
 * the detailed analysis) + biggestRisk/biggestOpportunity narrative (~150-200
 * tokens each) + up to 5 whatChanged items (~100 tokens each) + up to 6
 * watch items (~60 tokens each) + bottomLine + JSON structure overhead.
 *
 * Raised from the original 2200 (Phase 7C's pre-live estimate, never
 * verified against a real call) to 4096 after the first real Preview
 * invocation: `bottomLine` -- the second-to-last property in the tool
 * schema -- came back empty, consistent with the real response hitting
 * this budget and getting cut off (`stop_reason: "max_tokens"`) before
 * reaching the schema's final two properties. Everything earlier in the
 * schema (executiveAssessment, biggestRisk, biggestOpportunity,
 * whatChanged, managementWatchItems) validated fine, which is exactly the
 * truncation signature you'd expect. See anthropic-provider.ts's explicit
 * stop_reason check, added alongside this change, for a clear error the
 * next time this budget proves too tight instead of a confusing
 * "missing bottomLine" message.
 */
export const WEEKLY_ANALYST_MAX_OUTPUT_TOKENS = 4096;

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
 *
 * Bumped to 1.1.0 for Phase 7C.1's executiveAssessment length/structure
 * rewording (SYSTEM_PROMPT text changed; the output shape itself did not,
 * hence WEEKLY_ANALYST_SCHEMA_VERSION bumping independently in ai-contract.ts).
 */
export const WEEKLY_ANALYST_PROMPT_VERSION = "1.1.0";
