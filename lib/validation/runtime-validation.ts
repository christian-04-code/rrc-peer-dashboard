import { validateCompanyRegistry } from "./company-registry-validation";
import { validateMetricRegistry } from "./metric-registry-validation";
import { formatValidationIssues, type ValidationIssue, type ValidationResult } from "./validation-types";

export type RegistryValidationReport = {
  valid: boolean;
  companyRegistry: ValidationResult;
  metricRegistry: ValidationResult;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
};

export function validateRuntimeRegistries(): RegistryValidationReport {
  const companyRegistry = validateCompanyRegistry();
  const metricRegistry = validateMetricRegistry();
  const errors = [...companyRegistry.errors, ...metricRegistry.errors];
  const warnings = [...companyRegistry.warnings, ...metricRegistry.warnings];
  return { valid: errors.length === 0, companyRegistry, metricRegistry, errors, warnings };
}

export function assertRuntimeRegistriesValid(): RegistryValidationReport {
  const report = validateRuntimeRegistries();
  if (!report.valid) {
    const sections = [
      report.companyRegistry.valid ? null : formatValidationIssues("Company registry", report.companyRegistry),
      report.metricRegistry.valid ? null : formatValidationIssues("Metric registry", report.metricRegistry)
    ].filter(Boolean);
    throw new Error(sections.join("\n\n"));
  }
  return report;
}
