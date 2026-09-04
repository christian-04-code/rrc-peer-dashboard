import Anthropic from "@anthropic-ai/sdk";
import type { WeeklyAnalystProvider } from "@/lib/reports/ai/provider";
import { WeeklyAnalystProviderError } from "@/lib/reports/ai/provider";
import type { WeeklyAnalystAssessment, WeeklyAnalystInput } from "@/lib/reports/ai-contract";
import { WEEKLY_ANALYST_SCHEMA_VERSION, validateWeeklyAnalystAssessment } from "@/lib/reports/ai-contract";
import { WEEKLY_ANALYST_MAX_OUTPUT_TOKENS, WEEKLY_ANALYST_MODEL } from "@/lib/reports/ai/model-config";
import { SYSTEM_PROMPT, formatAnalystInputForPrompt } from "@/lib/reports/ai/prompt";

const ASSESSMENT_TOOL_NAME = "submit_weekly_range_analyst_assessment";

const NARRATIVE_ITEM_SCHEMA = {
  type: "object" as const,
  properties: {
    title: { type: "string", description: "Short, specific title (a few words)." },
    assessment: { type: "string", description: "Grounded analytical explanation, 2-4 sentences." },
    evidenceIds: { type: "array", items: { type: "string" }, description: "Evidence ids relied on, from the supplied allowlist only." }
  },
  required: ["title", "assessment", "evidenceIds"]
};

const WATCH_ITEM_SCHEMA = {
  type: "object" as const,
  properties: {
    item: { type: "string", description: "A short, specific forward-looking monitoring priority." },
    reason: { type: "string", description: "Why this matters, grounded in supplied evidence." },
    evidenceIds: { type: "array", items: { type: "string" }, description: "Evidence ids this watch item is grounded in." }
  },
  required: ["item", "reason", "evidenceIds"]
};

/**
 * Wired into a future Phase 7F scheduled orchestration (not built in
 * Phase 7C -- see lib/reports/analyst-service.ts's own header). Forces
 * structured tool-use output for the same reliability reason
 * AnthropicMacroSummaryProvider/AnthropicNewsAnalysisProvider do: a plain-
 * text completion could come back conversational, truncated, or
 * non-JSON, but a tool call must supply every required field in a
 * type-checked shape.
 */
export class AnthropicWeeklyAnalystProvider implements WeeklyAnalystProvider {
  readonly providerName = "anthropic";
  readonly modelName: string;
  private readonly client: Anthropic;

  constructor(options: { apiKey?: string; model?: string } = {}) {
    const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new WeeklyAnalystProviderError("ANTHROPIC_API_KEY is not set. Add it before constructing AnthropicWeeklyAnalystProvider.");
    }
    this.modelName = options.model ?? WEEKLY_ANALYST_MODEL;
    this.client = new Anthropic({ apiKey });
  }

  async analyze(input: WeeklyAnalystInput): Promise<WeeklyAnalystAssessment> {
    const response = await this.client.messages.create({
      model: this.modelName,
      max_tokens: WEEKLY_ANALYST_MAX_OUTPUT_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: formatAnalystInputForPrompt(input) }],
      tool_choice: { type: "tool", name: ASSESSMENT_TOOL_NAME },
      tools: [
        {
          name: ASSESSMENT_TOOL_NAME,
          description: "Submit the structured weekly Range Resources analyst assessment.",
          input_schema: {
            type: "object",
            properties: {
              executiveAssessment: { type: "string", description: "~150-250 word, 2-3 paragraph opening assessment synthesizing the week for Range Resources -- a fast read, not the full analysis." },
              biggestRisk: { ...NARRATIVE_ITEM_SCHEMA, description: "Must explain one of the supplied riskCandidates." },
              biggestOpportunity: { ...NARRATIVE_ITEM_SCHEMA, description: "Must explain one of the supplied opportunityCandidates." },
              whatChanged: { type: "array", items: NARRATIVE_ITEM_SCHEMA, maxItems: 5, description: "At most 5 items, each grounded in supplied change evidence." },
              managementWatchItems: { type: "array", items: WATCH_ITEM_SCHEMA, minItems: 1, maxItems: 6 },
              bottomLine: { type: "string", minLength: 20, description: "1-3 sentence closing synthesis. Required and must not be left empty." },
              selectedEvidenceIds: { type: "array", items: { type: "string" }, description: "Every evidence id relied on anywhere in the response." }
            },
            required: ["executiveAssessment", "biggestRisk", "biggestOpportunity", "whatChanged", "managementWatchItems", "bottomLine", "selectedEvidenceIds"]
          }
        }
      ]
    });

    const toolUse = response.content.find((block) => block.type === "tool_use" && block.name === ASSESSMENT_TOOL_NAME);
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new WeeklyAnalystProviderError("Anthropic response did not include the expected tool_use block.");
    }
    // Caught here, before validation, so a truncated response produces a
    // clear, actionable error ("raise WEEKLY_ANALYST_MAX_OUTPUT_TOKENS")
    // instead of a confusing "missing bottomLine" -- bottomLine and
    // selectedEvidenceIds are the schema's last two properties, so they are
    // exactly what a max_tokens cutoff drops first. withBoundedRetry (the
    // caller) still retries this like any other error.
    if (response.stop_reason === "max_tokens") {
      throw new WeeklyAnalystProviderError(
        "Anthropic response was truncated by the max_tokens limit before the structured output finished -- raise WEEKLY_ANALYST_MAX_OUTPUT_TOKENS."
      );
    }

    return validateWeeklyAnalystAssessment(
      {
        ...(toolUse.input as Record<string, unknown>),
        aiProvider: this.providerName,
        aiModel: this.modelName,
        schemaVersion: WEEKLY_ANALYST_SCHEMA_VERSION,
        generatedAt: new Date().toISOString()
      },
      input
    );
  }
}
