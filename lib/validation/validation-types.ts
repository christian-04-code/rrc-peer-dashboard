export type ValidationSeverity = "error" | "warning";

export type ValidationIssue = {
  severity: ValidationSeverity;
  code: string;
  path: string;
  message: string;
};

export type ValidationResult = {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
};

export function buildValidationResult(issues: ValidationIssue[]): ValidationResult {
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  return { valid: errors.length === 0, errors, warnings };
}

export function formatValidationIssues(label: string, result: ValidationResult): string {
  const lines = [...result.errors, ...result.warnings].map(
    (issue) => `- [${issue.severity.toUpperCase()}] ${issue.code} at ${issue.path}: ${issue.message}`
  );
  return `${label} validation failed:\n${lines.join("\n")}`;
}
