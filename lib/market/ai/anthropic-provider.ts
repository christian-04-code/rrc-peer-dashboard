import Anthropic from "@anthropic-ai/sdk";
import type { MacroSummaryProvider } from "@/lib/market/ai/provider";
import { MacroSummaryProviderError } from "@/lib/market/ai/provider";
import type { MacroSummaryResult } from "@/lib/market/ai/types";
import { MACRO_SUMMARY_SCHEMA_VERSION, validateMacroSummaryResult } from "@/lib/market/ai/types";
import { MACRO_SUMMARY_MAX_OUTPUT_TOKENS, MACRO_SUMMARY_MODEL } from "@/lib/market/ai/model-config";
import type { MacroRiskPayload } from "@/lib/market/macro-risk-engine";

const SUMMARY_TOOL_NAME = "submit_range_macro_summary";

const SYSTEM_PROMPT = `You write a concise executive/IR summary of Range Resources' (RRC) current natural-gas macro backdrop for an internal audience, from a deterministic risk-signal snapshot that has already been calculated and ranked. You do not calculate, re-rank, or second-guess any signal -- you only explain what is already in the structured payload.

Your summary must be 3-6 concise sentences, answering (weave these together naturally, do not mechanically restate every metric):
- What is the overall macro backdrop for Range right now?
- What is currently the biggest downside risk?
- What is currently the biggest supportive factor/opportunity?
- What changed materially since the prior snapshot, if that context is provided -- omit this if no prior-snapshot comparison is given.
- What should the IR team watch next?

Strict rules:
- Use ONLY the structured payload provided. Never invent a fact, metric, or causal relationship not present in it.
- Clearly distinguish fact (what the payload states) from interpretation (your synthesis).
- Never guarantee an outcome and never state or imply that Range's stock will rise, fall, outperform, or underperform. Use conditional language throughout: "may", "could", "suggests", "potentially", "would be supportive if".
- If a driver's data is unavailable, you may note the resulting uncertainty briefly -- never fill the gap with an assumption.
- Do not recommend any trading action.
- Synthesize the strongest 2-4 signals; do not mechanically list all of them.`;

function formatPayloadForPrompt(payload: MacroRiskPayload, priorSummary?: { generatedAt: string; summary: string } | null): string {
  const signalLines = payload.signals
    .map((signal) => `${signal.rank}. ${signal.label} [${signal.state}, ${signal.priority} priority]: ${signal.deterministicReason}`)
    .join("\n");

  const supportingLines = Object.entries(payload.supportingMetrics)
    .map(([driver, info]) => `- ${driver} [${info?.state}]: ${info?.metrics.map((metric) => `${metric.label} ${metric.value}`).join(", ")}`)
    .join("\n");

  const priorContext = priorSummary
    ? `\n\nPrior snapshot summary (generated ${priorSummary.generatedAt}), for identifying what changed -- do not treat this as current data, only as a point of comparison:\n${priorSummary.summary}`
    : "\n\nNo prior snapshot is available for comparison -- do not claim anything changed.";

  return (
    `Snapshot as of data period: ${payload.snapshotAsOf ?? "unknown"}\n\n` +
    `Ranked signals (most severe first):\n${signalLines}\n\n` +
    `All evaluated signals (supporting context):\n${supportingLines}` +
    priorContext
  );
}

/**
 * Wired into the Phase 6D scheduled Macro orchestration (never called from
 * a browser-facing route -- see app/api/cron/macro/route.ts). Forces
 * structured tool-use output for the same reliability reason
 * AnthropicNewsAnalysisProvider does: a plain-text completion could come
 * back conversational or empty, but a tool call must supply the field.
 */
export class AnthropicMacroSummaryProvider implements MacroSummaryProvider {
  readonly providerName = "anthropic";
  readonly modelName: string;
  private readonly client: Anthropic;

  constructor(options: { apiKey?: string; model?: string } = {}) {
    const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new MacroSummaryProviderError("ANTHROPIC_API_KEY is not set. Add it before constructing AnthropicMacroSummaryProvider.");
    }
    this.modelName = options.model ?? MACRO_SUMMARY_MODEL;
    this.client = new Anthropic({ apiKey });
  }

  async summarize(payload: MacroRiskPayload, priorSummary?: { generatedAt: string; summary: string } | null): Promise<MacroSummaryResult> {
    const response = await this.client.messages.create({
      model: this.modelName,
      max_tokens: MACRO_SUMMARY_MAX_OUTPUT_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: formatPayloadForPrompt(payload, priorSummary) }],
      tool_choice: { type: "tool", name: SUMMARY_TOOL_NAME },
      tools: [
        {
          name: SUMMARY_TOOL_NAME,
          description: "Submit the 3-6 sentence Range Macro executive summary.",
          input_schema: {
            type: "object",
            properties: {
              summary: {
                type: "string",
                description: "3-6 concise sentences. Conditional language only. No stock-direction guarantees."
              }
            },
            required: ["summary"]
          }
        }
      ]
    });

    const toolUse = response.content.find((block) => block.type === "tool_use" && block.name === SUMMARY_TOOL_NAME);
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new MacroSummaryProviderError("Anthropic response did not include the expected tool_use block.");
    }

    return validateMacroSummaryResult({
      ...(toolUse.input as Record<string, unknown>),
      aiProvider: this.providerName,
      aiModel: this.modelName,
      schemaVersion: MACRO_SUMMARY_SCHEMA_VERSION,
      generatedAt: new Date().toISOString()
    });
  }
}
