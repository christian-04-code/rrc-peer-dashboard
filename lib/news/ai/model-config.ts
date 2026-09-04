/**
 * Single place to change the Anthropic model/token ceiling used for news
 * analysis. Chosen deliberately: Claude Haiku 4.5 is the lowest-cost
 * current Anthropic model that still reliably supports structured tool-use
 * output, short financial classification/reasoning, and consistent
 * instruction-following -- exactly this task's shape (a fixed schema,
 * a narrow driver taxonomy to select from, a few hundred words of source
 * text). Revisit only if real validation output proves it insufficient;
 * do not upgrade preemptively for a task this narrowly scoped.
 */
export const NEWS_ANALYSIS_MODEL = "claude-haiku-4-5";

/**
 * The structured response is a handful of short fields (a summary, a
 * driver list, a short analysis paragraph) -- 512 output tokens is
 * generous headroom for that shape while keeping a hard ceiling on
 * per-article spend regardless of what the model tries to generate.
 */
export const NEWS_ANALYSIS_MAX_OUTPUT_TOKENS = 512;

/** Anthropic per-million-token pricing for NEWS_ANALYSIS_MODEL, used only for the cost estimates in reporting -- not sent to the API. */
export const NEWS_ANALYSIS_MODEL_PRICING = {
  inputPerMillionUsd: 1.0,
  outputPerMillionUsd: 5.0
};
