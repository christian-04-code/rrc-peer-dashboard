import type { AiAnalysisResult, AnalysisInput } from "@/lib/news/ai/types";

/**
 * Provider-agnostic boundary for Phase 3 analysis. Nothing in lib/news/
 * outside this file and its implementations should import an AI vendor SDK
 * directly -- swapping providers later means writing a new class here, not
 * touching the pipeline.
 */
export interface NewsAnalysisProvider {
  readonly providerName: string;
  readonly modelName: string;
  analyze(input: AnalysisInput): Promise<AiAnalysisResult>;
}

export class NewsAnalysisProviderError extends Error {}

/**
 * Phase 2 default. Throws unconditionally: Phase 2 must not spend AI budget
 * or make live calls, and a pipeline runner wired to this provider fails
 * loudly instead of silently skipping analysis if something in Phase 3
 * forgets to swap it out.
 */
export class NoopNewsAnalysisProvider implements NewsAnalysisProvider {
  readonly providerName = "noop";
  readonly modelName = "none";

  async analyze(): Promise<AiAnalysisResult> {
    throw new NewsAnalysisProviderError(
      "NoopNewsAnalysisProvider cannot analyze articles. Phase 2 intentionally ships without a live AI provider wired into the pipeline runner; select a real NewsAnalysisProvider in Phase 3."
    );
  }
}
