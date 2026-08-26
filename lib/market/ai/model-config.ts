/**
 * Same reasoning as lib/news/ai/model-config.ts (Claude Haiku 4.5: lowest-cost
 * current model that still reliably supports structured tool-use output and
 * short financial synthesis) applied to Macro's own summary task -- a 3-6
 * sentence executive synthesis of an already-computed, already-ranked
 * signal list, not open-ended reasoning. Kept as Macro's own constant
 * rather than importing News's, per the Phase 6A boundary (each domain
 * keeps its own AI config so a News-only change can never silently affect
 * Macro's spend/behavior and vice versa) -- revisit independently if real
 * output ever proves insufficient.
 */
export const MACRO_SUMMARY_MODEL = "claude-haiku-4-5";

/** A 3-6 sentence executive summary is a few hundred words at most; 400 output tokens is generous headroom while still capping worst-case spend per generation. */
export const MACRO_SUMMARY_MAX_OUTPUT_TOKENS = 400;

/** Anthropic per-million-token pricing for MACRO_SUMMARY_MODEL, used only for cost estimates in reporting -- not sent to the API. */
export const MACRO_SUMMARY_MODEL_PRICING = {
  inputPerMillionUsd: 1.0,
  outputPerMillionUsd: 5.0
};
