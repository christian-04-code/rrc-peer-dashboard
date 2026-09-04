import type { MacroRiskPayload } from "@/lib/market/macro-risk-engine";
import type { MacroSummaryResult } from "@/lib/market/ai/types";

/**
 * Provider-agnostic boundary for the Macro AI summary, mirroring
 * lib/news/ai/provider.ts's shape for News. The provider only ever receives
 * the already-computed, already-ranked MacroRiskPayload -- it never sees
 * raw EIA rows and is never asked to rank or invent a signal.
 */
export interface MacroSummaryProvider {
  readonly providerName: string;
  readonly modelName: string;
  /** priorSummary, when available, is prompt context only ("what changed") -- it is never part of the fingerprinted payload and never affects caching. */
  summarize(payload: MacroRiskPayload, priorSummary?: { generatedAt: string; summary: string } | null): Promise<MacroSummaryResult>;
}

export class MacroSummaryProviderError extends Error {}

/** Default when no ANTHROPIC_API_KEY is configured -- callers must check availability and degrade to "AI summary unavailable" rather than construct this and expect it to work. */
export class NoopMacroSummaryProvider implements MacroSummaryProvider {
  readonly providerName = "noop";
  readonly modelName = "none";

  async summarize(): Promise<MacroSummaryResult> {
    throw new MacroSummaryProviderError(
      "NoopMacroSummaryProvider cannot generate a Macro AI summary. Configure ANTHROPIC_API_KEY and use AnthropicMacroSummaryProvider."
    );
  }
}
