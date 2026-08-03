import rawMetrics from "@/config/metric-definitions.json";
import { buildValidationResult, formatValidationIssues, type ValidationIssue, type ValidationResult } from "./validation-types";

const ALLOWED_VALUE_TYPES = new Set(["number", "integer", "currency", "percentage", "multiple", "text"]);
const ALLOWED_AGGREGATIONS = new Set(["period_average", "period_sum", "period_end", "point_in_time", "not_applicable"]);
const ALLOWED_PEER_COMPARABLE = new Set([true, false, "conditional"]);

export function validateMetricRegistry(): ValidationResult {
  const issues: ValidationIssue[] = [];
  const registry = rawMetrics as unknown as {
    schemaVersion: number;
    categories: Record<string, string>;
    metrics: Record<string, Record<string, unknown>>;
  };

  if (registry.schemaVersion !== 1) {
    issues.push({ severity: "error", code: "METRIC_SCHEMA_VERSION", path: "schemaVersion", message: "Expected schemaVersion 1." });
  }

  const categoryKeys = Object.keys(registry.categories ?? {});
  const metricEntries = Object.entries(registry.metrics ?? {});
  const normalizedAliases = new Map<string, string>();

  if (categoryKeys.length === 0) {
    issues.push({ severity: "error", code: "NO_METRIC_CATEGORIES", path: "categories", message: "At least one category is required." });
  }
  if (metricEntries.length === 0) {
    issues.push({ severity: "error", code: "NO_METRICS", path: "metrics", message: "At least one metric definition is required." });
  }

  for (const [metricKey, rawDefinition] of metricEntries) {
    const definition = rawDefinition as {
      displayName?: unknown;
      shortLabel?: unknown;
      category?: unknown;
      unit?: unknown;
      valueType?: unknown;
      aggregation?: unknown;
      aliases?: unknown;
      supports?: Record<string, unknown>;
      ui?: Record<string, unknown>;
    };
    const basePath = `metrics.${metricKey}`;

    if (!/^[A-Z][A-Z0-9_]*$/.test(metricKey)) {
      issues.push({ severity: "error", code: "INVALID_METRIC_KEY", path: basePath, message: "Metric keys must use uppercase snake case." });
    }
    for (const [field, value] of [["displayName", definition.displayName], ["shortLabel", definition.shortLabel], ["unit", definition.unit]]) {
      if (typeof value !== "string" || value.trim() === "") {
        issues.push({ severity: "error", code: "METRIC_FIELD_REQUIRED", path: `${basePath}.${field}`, message: `${field} must be a non-empty string.` });
      }
    }
    if (typeof definition.category !== "string" || !categoryKeys.includes(definition.category)) {
      issues.push({ severity: "error", code: "UNKNOWN_METRIC_CATEGORY", path: `${basePath}.category`, message: `${String(definition.category)} is not defined in categories.` });
    }
    if (typeof definition.valueType !== "string" || !ALLOWED_VALUE_TYPES.has(definition.valueType)) {
      issues.push({ severity: "error", code: "INVALID_VALUE_TYPE", path: `${basePath}.valueType`, message: `${String(definition.valueType)} is not an allowed valueType.` });
    }
    if (typeof definition.aggregation !== "string" || !ALLOWED_AGGREGATIONS.has(definition.aggregation)) {
      issues.push({ severity: "error", code: "INVALID_AGGREGATION", path: `${basePath}.aggregation`, message: `${String(definition.aggregation)} is not an allowed aggregation.` });
    }

    if (!Array.isArray(definition.aliases) || definition.aliases.length === 0) {
      issues.push({ severity: "error", code: "ALIASES_REQUIRED", path: `${basePath}.aliases`, message: "At least one alias is required." });
    } else {
      const seenAliases = new Set<string>();
      for (const alias of definition.aliases) {
        if (typeof alias !== "string" || alias.trim() === "") {
          issues.push({ severity: "error", code: "INVALID_ALIAS", path: `${basePath}.aliases`, message: "Aliases must be non-empty strings." });
          continue;
        }
        const normalized = alias.trim().toLowerCase();
        if (seenAliases.has(normalized)) {
          issues.push({ severity: "error", code: "DUPLICATE_ALIAS_WITHIN_METRIC", path: `${basePath}.aliases`, message: `Duplicate alias: ${alias}.` });
        }
        seenAliases.add(normalized);
        const existingMetric = normalizedAliases.get(normalized);
        if (existingMetric && existingMetric !== metricKey) {
          issues.push({ severity: "warning", code: "ALIAS_COLLISION", path: `${basePath}.aliases`, message: `Alias “${alias}” is also assigned to ${existingMetric}; adapters must not resolve it without source context.` });
        } else {
          normalizedAliases.set(normalized, metricKey);
        }
      }
    }

    const supports = definition.supports;
    for (const supportKey of ["historical", "guidance", "consensus", "market"]) {
      if (!supports || typeof supports[supportKey] !== "boolean") {
        issues.push({ severity: "error", code: "SUPPORT_FLAG_REQUIRED", path: `${basePath}.supports.${supportKey}`, message: "Support flags must be boolean." });
      }
    }

    const ui = definition.ui;
    for (const uiKey of ["homepage", "chartable", "mapTooltip", "sourceRequired"]) {
      if (!ui || typeof ui[uiKey] !== "boolean") {
        issues.push({ severity: "error", code: "UI_FLAG_REQUIRED", path: `${basePath}.ui.${uiKey}`, message: "UI flags must be boolean." });
      }
    }
    if (!ui || !ALLOWED_PEER_COMPARABLE.has(ui.peerComparable as boolean | "conditional")) {
      issues.push({ severity: "error", code: "INVALID_PEER_COMPARABLE", path: `${basePath}.ui.peerComparable`, message: "peerComparable must be true, false, or conditional." });
    }
    if (ui?.homepage === true && ui?.chartable !== true) {
      issues.push({ severity: "warning", code: "HOMEPAGE_NOT_CHARTABLE", path: `${basePath}.ui`, message: "Homepage metrics are normally expected to be chartable." });
    }
    if (ui?.sourceRequired !== true) {
      issues.push({ severity: "warning", code: "SOURCE_NOT_REQUIRED", path: `${basePath}.ui.sourceRequired`, message: "Financial and operating metrics should normally require source metadata." });
    }
  }

  return buildValidationResult(issues);
}

export function assertMetricRegistryValid(): void {
  const result = validateMetricRegistry();
  if (!result.valid) throw new Error(formatValidationIssues("Metric registry", result));
}
