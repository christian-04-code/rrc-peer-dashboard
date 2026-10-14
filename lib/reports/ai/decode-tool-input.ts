/**
 * Transport-level decoding of the model's tool input, applied BEFORE
 * validateWeeklyAnalystAssessment (ai-contract.ts). Added 2026-10-14 after a
 * real Preview run where the model returned `biggestRisk` as a JSON-encoded
 * string rather than an object -- a known occasional tool-use quirk with
 * large structured outputs.
 *
 * Deliberately narrow: only fields the contract defines as objects (or as
 * arrays of objects) are touched, and a string is replaced ONLY when it
 * parses to a plain JSON object. Invalid JSON, arrays, numbers, null, or any
 * other value are left exactly as received, so the unchanged validator still
 * rejects them. Nothing here relaxes a content rule -- every decoded object
 * goes through the same validation as a natively structured one.
 */

const OBJECT_FIELDS = ["biggestRisk", "biggestOpportunity"] as const;
const OBJECT_ARRAY_FIELDS = ["whatChanged", "managementWatchItems", "investorQuestions", "riskTable"] as const;

export type DecodedToolInput = {
  input: Record<string, unknown>;
  /** Field paths that were decoded from text (e.g. "biggestRisk", "riskTable[1]") -- for diagnostics only. */
  decodedFields: string[];
};

/** The parsed value only if `value` is a string holding a plain JSON object; otherwise null. */
export function parseTextEncodedObject(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith("{")) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function decodeTextEncodedObjects(raw: Record<string, unknown>): DecodedToolInput {
  const input: Record<string, unknown> = { ...raw };
  const decodedFields: string[] = [];

  for (const field of OBJECT_FIELDS) {
    const parsed = parseTextEncodedObject(input[field]);
    if (parsed) {
      input[field] = parsed;
      decodedFields.push(field);
    }
  }

  for (const field of OBJECT_ARRAY_FIELDS) {
    const value = input[field];
    if (!Array.isArray(value)) continue;
    input[field] = value.map((element, index) => {
      const parsed = parseTextEncodedObject(element);
      if (!parsed) return element;
      decodedFields.push(`${field}[${index}]`);
      return parsed;
    });
  }

  return { input, decodedFields };
}
