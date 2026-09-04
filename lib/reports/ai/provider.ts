import type { WeeklyAnalystAssessment, WeeklyAnalystInput } from "@/lib/reports/ai-contract";

/**
 * Provider-agnostic boundary for the Weekly Analyst assessment, mirroring
 * lib/market/ai/provider.ts's shape for Macro (which itself mirrors
 * lib/news/ai/provider.ts for News). The provider only ever receives the
 * already-selected, already-bounded WeeklyAnalystInput -- it never sees the
 * raw frozen payload or raw DB rows, and is never asked to select, rank, or
 * invent evidence.
 */
export interface WeeklyAnalystProvider {
  readonly providerName: string;
  readonly modelName: string;
  analyze(input: WeeklyAnalystInput): Promise<WeeklyAnalystAssessment>;
}

export class WeeklyAnalystProviderError extends Error {}

/** Default when no ANTHROPIC_API_KEY is configured -- callers must check availability and degrade rather than construct this and expect it to work. */
export class NoopWeeklyAnalystProvider implements WeeklyAnalystProvider {
  readonly providerName = "noop";
  readonly modelName = "none";

  async analyze(): Promise<WeeklyAnalystAssessment> {
    throw new WeeklyAnalystProviderError("NoopWeeklyAnalystProvider cannot generate a weekly analyst assessment. Configure ANTHROPIC_API_KEY and use AnthropicWeeklyAnalystProvider.");
  }
}
