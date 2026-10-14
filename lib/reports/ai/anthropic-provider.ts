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

const WHAT_CHANGED_ITEM_SCHEMA = {
  type: "object" as const,
  properties: {
    ...NARRATIVE_ITEM_SCHEMA.properties,
    impact: { type: "string", enum: ["positive", "negative", "mixed"], description: "Does this change help (positive) or hurt (negative) Range, or both (mixed)?" }
  },
  required: ["title", "assessment", "evidenceIds", "impact"]
};

const RISK_ROW_SCHEMA = {
  type: "object" as const,
  properties: {
    evidenceId: { type: "string", description: "The evidenceId of ONE supplied risk candidate." },
    whyItMatters: { type: "string", description: "1-2 short plain-English sentences: how this risk affects Range." },
    announcedAction: { type: "string", description: "Optional. ONLY an action Range has actually announced, from the supplied Range guidance or News. Omit if none." },
    announcedActionEvidenceIds: { type: "array", items: { type: "string" }, description: "Required with announcedAction: the Range guidance / News evidence ids it comes from." },
    possibleResponse: { type: "string", description: "Optional. One short sentence on an option Range could consider -- phrased as an option, never as a decision." }
  },
  required: ["evidenceId", "whyItMatters"]
};

const INVESTOR_QUESTION_SCHEMA = {
  type: "object" as const,
  properties: {
    question: { type: "string", description: "A specific, credible investor question, only when a real triggering development in the supplied evidence justifies it." },
    whyNow: { type: "string", description: "The specific development/evidence that makes this question timely right now -- not a generic recurring question." },
    evidenceIds: { type: "array", items: { type: "string" }, description: "Evidence ids that justify why this question is credible right now, from the supplied allowlist only." },
    context: { type: "string", description: "Optional additional company/macro context relevant to the question." },
    responseFramework: {
      type: "string",
      description:
        "Optional concise preparation framework for IR, ONLY if adequately supported by supplied evidence. Must read as preparation based on public information, never as an official Range statement, management position, guidance, or commitment."
    },
    followUpNeeded: { type: "string", description: "Optional: specific data IR may need to gather/verify before being ready to answer this well." }
  },
  required: ["question", "whyNow", "evidenceIds"]
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
/**
 * Non-sensitive per-call metadata (no prompt or response text) for diagnostics only --
 * used by the Preview-only test route (lib/reports/preview-test-report.ts). The
 * production orchestrator never passes a callback, so its behavior is unchanged.
 */
export type WeeklyAnalystResponseMeta = {
  stopReason: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  maxOutputTokens: number;
  durationMs: number;
};

export class AnthropicWeeklyAnalystProvider implements WeeklyAnalystProvider {
  readonly providerName = "anthropic";
  readonly modelName: string;
  private readonly client: Anthropic;
  private readonly onResponseMeta?: (meta: WeeklyAnalystResponseMeta) => void;

  constructor(options: { apiKey?: string; model?: string; onResponseMeta?: (meta: WeeklyAnalystResponseMeta) => void } = {}) {
    const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new WeeklyAnalystProviderError("ANTHROPIC_API_KEY is not set. Add it before constructing AnthropicWeeklyAnalystProvider.");
    }
    this.modelName = options.model ?? WEEKLY_ANALYST_MODEL;
    this.client = new Anthropic({ apiKey });
    this.onResponseMeta = options.onResponseMeta;
  }

  async analyze(input: WeeklyAnalystInput): Promise<WeeklyAnalystAssessment> {
    const startedAt = Date.now();
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
              executiveAssessment: { type: "string", description: "~90-150 word, 2-3 short-paragraph plain-English summary of the week for Range Resources: what happened, why it matters, helps or hurts." },
              biggestRisk: { ...NARRATIVE_ITEM_SCHEMA, description: "Must explain one of the supplied riskCandidates." },
              biggestOpportunity: { ...NARRATIVE_ITEM_SCHEMA, description: "Must explain one of the supplied opportunityCandidates." },
              whatChanged: {
                type: "array",
                items: WHAT_CHANGED_ITEM_SCHEMA,
                maxItems: 5,
                description:
                  "At most 5 items, each grounded in one or more of the supplied deterministic change records. Never more items than the number of change records actually supplied -- combine related records into one item rather than inventing an extra one. Zero items is correct and expected when no real change was supplied (e.g. the first-ever report)."
              },
              managementWatchItems: { type: "array", items: WATCH_ITEM_SCHEMA, minItems: 1, maxItems: 6 },
              bottomLine: { type: "string", minLength: 20, description: "1-3 sentence closing synthesis. Required and must not be left empty." },
              selectedEvidenceIds: { type: "array", items: { type: "string" }, description: "Every evidence id relied on anywhere in the response." },
              riskTable: {
                type: "array",
                items: RISK_ROW_SCHEMA,
                maxItems: 5,
                description: "One row per important supplied risk candidate (most important first). Keep announced actions and possible responses strictly separate."
              },
              investorQuestions: {
                type: "array",
                items: INVESTOR_QUESTION_SCHEMA,
                maxItems: 6,
                description:
                  "Investor questions IR should prepare for, ONLY when a real, credible triggering development exists in the supplied evidence. Zero items is correct and expected most weeks -- do not invent a question merely to fill this field, and never force a fixed count."
              }
            },
            required: ["executiveAssessment", "biggestRisk", "biggestOpportunity", "whatChanged", "managementWatchItems", "bottomLine", "selectedEvidenceIds", "investorQuestions", "riskTable"]
          }
        }
      ]
    });

    this.onResponseMeta?.({
      stopReason: response.stop_reason ?? null,
      inputTokens: response.usage?.input_tokens ?? null,
      outputTokens: response.usage?.output_tokens ?? null,
      maxOutputTokens: WEEKLY_ANALYST_MAX_OUTPUT_TOKENS,
      durationMs: Date.now() - startedAt
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
