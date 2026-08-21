import Anthropic from "@anthropic-ai/sdk";
import type { NewsAnalysisProvider } from "@/lib/news/ai/provider";
import { NewsAnalysisProviderError } from "@/lib/news/ai/provider";
import type { AiAnalysisResult, AnalysisInput } from "@/lib/news/ai/types";
import { ANALYSIS_SCHEMA_VERSION, validateAiAnalysisResult } from "@/lib/news/ai/types";
import { IMPACT_DRIVERS, IMPACT_FRAMEWORK_VERSION, getImpactDriver } from "@/lib/news/impact-framework";
import { getRelevantDriverKeys } from "@/lib/news/ai/relevant-drivers";
import { NEWS_ANALYSIS_MAX_OUTPUT_TOKENS, NEWS_ANALYSIS_MODEL } from "@/lib/news/ai/model-config";

const ANALYSIS_TOOL_NAME = "submit_range_impact_analysis";

const SYSTEM_PROMPT = `You analyze public energy-market news for POTENTIAL business/economic impact on Range Resources (RRC), an Appalachian natural gas producer, for an internal equity-research audit trail.

Your output has two strictly separated parts, and you must never blur them:

A. FACTUAL SUMMARY ("summary"): only facts directly supported by the supplied headline/excerpt. Never state anything as fact that the source text does not itself say. If the source is thin, say less -- do not fill gaps with inference.

B. RANGE-SPECIFIC ANALYSIS ("rangeAnalysis"): your inference about what this could mean for Range. This is interpretation, not reporting, and must read that way.

Rules for the analysis:
- Reason only through the supplied impact-driver framework below. Never invent a new economic driver or mechanism -- select from "affectedDrivers" only.
- Use cautious, conditional language throughout: "may", "could", "potentially", "would be supportive if", "likely if". Never use unconditional/guaranteed language ("will increase", "will decrease", "definitely positive", "definitely negative", "guaranteed to", "certain to") unless the source article itself directly reports that outcome as an already-realized fact (not your inference).
- rangeImpact and impactStrength describe a potential business/economic effect only. They are NOT a stock recommendation, buy/sell signal, price target, or expected return -- never phrase them that way.
- confidence (0-1) reflects how confident you are in the Range-specific inference itself -- not confidence that the article is real or on-topic. Lower it when: the link to Range is indirect (industry-wide rather than Range-specific), the inference requires multiple assumptions, the time horizon is uncertain, or the story is about broad supply/demand rather than something specific to Range or Appalachia.
- Choose timeHorizon from exactly: near_term (days to ~6 months), medium_term (~6-24 months), long_term (24+ months), multi_horizon (meaningfully spans more than one).
- Do not request, and do not respond as if you were given, any confidential, internal, or non-public Range information. Everything you need is in this prompt.`;

function buildUserMessage(input: AnalysisInput, driverKeys: string[]): string {
  const frameworkSubset = driverKeys
    .map((key) => {
      const driver = getImpactDriver(key as keyof typeof IMPACT_DRIVERS);
      return `- ${driver.key} (${driver.label}): ${driver.description} Potential positive: ${driver.potentialPositiveEffect} Potential negative: ${driver.potentialNegativeEffect}`;
    })
    .join("\n");

  return (
    `Headline: ${input.headline}\n` +
    `Publisher: ${input.publisher}\n` +
    `Categories: ${input.categories.join(", ") || "(none)"}\n` +
    `Matched relevance keywords: ${input.matchedKeywords.join(", ") || "(none)"}\n` +
    `Excerpt: ${input.excerpt ?? "(none provided -- summarize only from the headline)"}\n\n` +
    `Relevant impact-framework drivers for this article (impact_framework_version ${IMPACT_FRAMEWORK_VERSION}):\n${frameworkSubset}`
  );
}

/**
 * Wired into the pipeline in Phase 3, behind the deterministic relevance
 * filter -- only retained articles ever reach analyze(). Forces structured
 * output via tool use so the response shape is enforced by the API itself,
 * not just parsed hopefully from free text.
 */
export class AnthropicNewsAnalysisProvider implements NewsAnalysisProvider {
  readonly providerName = "anthropic";
  readonly modelName: string;
  private readonly client: Anthropic;

  constructor(options: { apiKey?: string; model?: string } = {}) {
    const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new NewsAnalysisProviderError("ANTHROPIC_API_KEY is not set. Add it before constructing AnthropicNewsAnalysisProvider.");
    }
    this.modelName = options.model ?? NEWS_ANALYSIS_MODEL;
    this.client = new Anthropic({ apiKey });
  }

  async analyze(input: AnalysisInput): Promise<AiAnalysisResult> {
    const driverKeys = getRelevantDriverKeys(input.categories);

    const response = await this.client.messages.create({
      model: this.modelName,
      max_tokens: NEWS_ANALYSIS_MAX_OUTPUT_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildUserMessage(input, driverKeys) }],
      tool_choice: { type: "tool", name: ANALYSIS_TOOL_NAME },
      tools: [
        {
          name: ANALYSIS_TOOL_NAME,
          description: "Submit a structured Range Resources impact analysis for this article.",
          input_schema: {
            type: "object",
            properties: {
              summary: { type: "string", description: "Factual, neutral summary of only what the source directly states." },
              rangeImpact: { type: "string", enum: ["positive", "negative", "neutral"] },
              impactStrength: { type: "string", enum: ["low", "medium", "high"] },
              affectedDrivers: { type: "array", items: { type: "string", enum: driverKeys }, minItems: 1 },
              rangeAnalysis: {
                type: "string",
                description: "Conditional-language inference of potential impact on Range. Never a stock recommendation or price target."
              },
              timeHorizon: { type: "string", enum: ["near_term", "medium_term", "long_term", "multi_horizon"] },
              confidence: { type: "number", minimum: 0, maximum: 1 }
            },
            required: ["summary", "rangeImpact", "impactStrength", "affectedDrivers", "rangeAnalysis", "timeHorizon", "confidence"]
          }
        }
      ]
    });

    const toolUse = response.content.find((block) => block.type === "tool_use" && block.name === ANALYSIS_TOOL_NAME);
    if (!toolUse || toolUse.type !== "tool_use") {
      throw new NewsAnalysisProviderError("Anthropic response did not include the expected tool_use block.");
    }

    return validateAiAnalysisResult({
      ...(toolUse.input as Record<string, unknown>),
      aiProvider: this.providerName,
      aiModel: this.modelName,
      impactFrameworkVersion: IMPACT_FRAMEWORK_VERSION,
      analysisSchemaVersion: ANALYSIS_SCHEMA_VERSION,
      analyzedAt: new Date().toISOString()
    });
  }
}
