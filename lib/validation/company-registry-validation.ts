import rawRegistry from "@/config/companies.json";
import { buildValidationResult, formatValidationIssues, type ValidationIssue, type ValidationResult } from "./validation-types";

const ALLOWED_EXCHANGES = new Set(["NYSE", "NASDAQ"]);

export function validateCompanyRegistry(): ValidationResult {
  const issues: ValidationIssue[] = [];
  const registry = rawRegistry as typeof rawRegistry;
  const companyKeys = Object.keys(registry.companies);
  const displayOrder = registry.displayOrder as string[];

  if (registry.schemaVersion !== 1) {
    issues.push({ severity: "error", code: "COMPANY_SCHEMA_VERSION", path: "schemaVersion", message: "Expected schemaVersion 1." });
  }

  if (!companyKeys.includes(registry.defaultCompany)) {
    issues.push({ severity: "error", code: "DEFAULT_COMPANY_MISSING", path: "defaultCompany", message: `Default company ${registry.defaultCompany} is not defined.` });
  }

  const duplicateDisplayTickers = displayOrder.filter((ticker, index) => displayOrder.indexOf(ticker) !== index);
  for (const ticker of [...new Set(duplicateDisplayTickers)]) {
    issues.push({ severity: "error", code: "DUPLICATE_DISPLAY_TICKER", path: "displayOrder", message: `${ticker} appears more than once.` });
  }

  for (const ticker of displayOrder) {
    if (!companyKeys.includes(ticker)) {
      issues.push({ severity: "error", code: "DISPLAY_TICKER_UNKNOWN", path: "displayOrder", message: `${ticker} is not defined in companies.` });
    }
  }

  for (const ticker of companyKeys) {
    const company = registry.companies[ticker as keyof typeof registry.companies];
    const basePath = `companies.${ticker}`;

    if (company.ticker !== ticker) {
      issues.push({ severity: "error", code: "TICKER_KEY_MISMATCH", path: `${basePath}.ticker`, message: `Ticker value ${company.ticker} must match registry key ${ticker}.` });
    }
    if (!company.name.trim() || !company.shortName.trim()) {
      issues.push({ severity: "error", code: "COMPANY_NAME_REQUIRED", path: basePath, message: "name and shortName are required." });
    }
    if (!ALLOWED_EXCHANGES.has(company.exchange)) {
      issues.push({ severity: "warning", code: "UNRECOGNIZED_EXCHANGE", path: `${basePath}.exchange`, message: `${company.exchange} is not in the approved exchange list.` });
    }
    if (!company.logo.path.startsWith("assets/logos/") || !/\.(png|svg)$/i.test(company.logo.path)) {
      issues.push({ severity: "error", code: "INVALID_LOGO_PATH", path: `${basePath}.logo.path`, message: "Logo path must point to a PNG or SVG in assets/logos/." });
    }
    if (!company.logo.alt.trim()) {
      issues.push({ severity: "error", code: "LOGO_ALT_REQUIRED", path: `${basePath}.logo.alt`, message: "Accessible logo alt text is required." });
    }
    if (!company.ui.selectorLabel.trim()) {
      issues.push({ severity: "error", code: "SELECTOR_LABEL_REQUIRED", path: `${basePath}.ui.selectorLabel`, message: "Selector label is required." });
    }
    if (!company.ui.description.trim()) {
      issues.push({ severity: "error", code: "DESCRIPTION_REQUIRED", path: `${basePath}.ui.description`, message: "Company description is required." });
    }
    if (!company.business.primaryRegion.trim() || !company.business.primaryBasin.trim()) {
      issues.push({ severity: "error", code: "BUSINESS_CONTEXT_REQUIRED", path: `${basePath}.business`, message: "primaryRegion and primaryBasin are required." });
    }
    if (company.business.productFocus.length === 0) {
      issues.push({ severity: "warning", code: "PRODUCT_FOCUS_EMPTY", path: `${basePath}.business.productFocus`, message: "At least one product focus is recommended." });
    }
    if (!company.map.defaultView.trim()) {
      issues.push({ severity: "error", code: "DEFAULT_MAP_VIEW_REQUIRED", path: `${basePath}.map.defaultView`, message: "defaultView is required." });
    }
    const exposureKeys = company.map.exposureKeys as string[];
    const duplicateExposureKeys = exposureKeys.filter((key, index) => exposureKeys.indexOf(key) !== index);
    if (duplicateExposureKeys.length > 0) {
      issues.push({ severity: "error", code: "DUPLICATE_EXPOSURE_KEY", path: `${basePath}.map.exposureKeys`, message: "Exposure keys must be unique." });
    }
    const routeLayerKeys = company.map.routeLayerKeys as string[];
    const duplicateRouteKeys = routeLayerKeys.filter((key, index) => routeLayerKeys.indexOf(key) !== index);
    if (duplicateRouteKeys.length > 0) {
      issues.push({ severity: "error", code: "DUPLICATE_ROUTE_KEY", path: `${basePath}.map.routeLayerKeys`, message: "Route layer keys must be unique." });
    }
  }

  const enabledDefaults = companyKeys.filter((ticker) => {
    const company = registry.companies[ticker as keyof typeof registry.companies];
    return company.ui.enabled && company.ui.defaultSelected;
  });
  if (enabledDefaults.length !== 1 || enabledDefaults[0] !== registry.defaultCompany) {
    issues.push({ severity: "error", code: "DEFAULT_SELECTION_INCONSISTENT", path: "companies.*.ui.defaultSelected", message: "Exactly one enabled company must be defaultSelected and it must match defaultCompany." });
  }

  return buildValidationResult(issues);
}

export function assertCompanyRegistryValid(): void {
  const result = validateCompanyRegistry();
  if (!result.valid) throw new Error(formatValidationIssues("Company registry", result));
}
