import Anthropic from "@anthropic-ai/sdk";
import type { NewsAnalysisProvider } from "@/lib/news/ai/provider";
import { NewsAnalysisProviderError } from "@/lib/news/ai/provider";
import type { AiAnalysisResult, AnalysisInput } from "@/lib/news/ai/types";
import { validateAiAnalysisResult } from "@/lib/news/ai/types";
import { IMPACT_DRIVERS, IMPACT_FRAMEWORK_VERSION } from "@/lib/news/impact-framework";

const ANALYSIS_TOOL_NAME = "submit_range_impact_analysis";

/**
 * Not wired into the Phase 2 pipeline runner and not called by any test in
 * this phase -- it exists so Phase 3 has a working implementation to
 * activate, not to spend AI budget now. Forces structured output via tool
 * use so the response shape is enforced by the API itself, not just parsed
 * hopefully from free text.
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
    this.modelName = options.model ?? "claude-haiku-4-5-20251001";
    this.client = new Anthropic({ apiKey });
  }

  async analyze(input: AnalysisInput): Promise<AiAnalysisResult> {
    const driverKeys = Object.keys(IMPACT_DRIVERS);

    const response = await this.client.messages.create({
      model: this.modelName,
      max_tokens: 1024,
      system:
        "You analyze public energy-market news for potential impact on Range Resources (RRC), an Appalachian natural gas producer. " +
        "Only describe potential directional relationships already established in the provided impact-driver framework. " +
        "Never fabricate facts absent from the supplied article text. Never issue trading recommendations or price targets.",
      messages: [
        {
          role: "user",
          content:
            `Headline: ${input.headline}\n` +
            `Publisher: ${input.publisher}\n` +
            `Categories: ${input.categories.join(", ")}\n` +
            `Matched keywords: ${input.matchedKeywords.join(", ")}\n` +
            `Excerpt: ${input.excerpt ?? "(none provided)"}\n\n` +
            `Available impact drivers: ${driverKeys.join(", ")}`
        }
      ],
      tool_choice: { type: "tool", name: ANALYSIS_TOOL_NAME },
      tools: [
        {
          name: ANALYSIS_TOOL_NAME,
          description: "Submit a structured Range Resources impact analysis for this article.",
          input_schema: {
            type: "object",
            properties: {
              summary: { type: "string", description: "Factual, neutral summary of the article itself." },
              rangeImpact: { type: "string", enum: ["positive", "negative", "neutral"] },
              impactStrength: { type: "string", enum: ["low", "medium", "high"] },
              affectedDrivers: { type: "array", items: { type: "string", enum: driverKeys } },
              rangeAnalysis: { type: "string", description: "Why this matters to Range, framed as potential impact only." },
              timeHorizon: { type: "string", enum: ["immediate", "near_term", "medium_term", "long_term"] },
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
      analyzedAt: new Date().toISOString()
    });
  }
}
