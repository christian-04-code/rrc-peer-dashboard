import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const issues = [];
const error = (code, at, message) => issues.push({ severity: "ERROR", code, at, message });
const warning = (code, at, message) => issues.push({ severity: "WARNING", code, at, message });

async function readJson(relativePath) {
  const fullPath = path.join(root, relativePath);
  try {
    return JSON.parse(await readFile(fullPath, "utf8"));
  } catch (cause) {
    error("JSON_READ_FAILED", relativePath, cause instanceof Error ? cause.message : String(cause));
    return null;
  }
}

const companies = await readJson("config/companies.json");
const metrics = await readJson("config/metric-definitions.json");

if (companies) {
  const keys = Object.keys(companies.companies ?? {});
  if (companies.schemaVersion !== 1) error("COMPANY_SCHEMA_VERSION", "config/companies.json", "Expected schemaVersion 1.");
  if (!keys.includes(companies.defaultCompany)) error("DEFAULT_COMPANY_MISSING", "defaultCompany", `${companies.defaultCompany} is not defined.`);
  if (new Set(companies.displayOrder ?? []).size !== (companies.displayOrder ?? []).length) error("DUPLICATE_DISPLAY_TICKER", "displayOrder", "Display order contains duplicate tickers.");
  for (const ticker of companies.displayOrder ?? []) {
    if (!keys.includes(ticker)) error("DISPLAY_TICKER_UNKNOWN", "displayOrder", `${ticker} is not defined.`);
  }
  for (const ticker of keys) {
    const company = companies.companies[ticker];
    if (company.ticker !== ticker) error("TICKER_KEY_MISMATCH", `companies.${ticker}.ticker`, "Ticker must match the registry key.");
    if (!company.logo?.path) {
      error("LOGO_PATH_REQUIRED", `companies.${ticker}.logo.path`, "Logo path is required.");
    } else {
      try {
        await access(path.join(root, company.logo.path));
      } catch {
        error("LOGO_FILE_MISSING", `companies.${ticker}.logo.path`, `${company.logo.path} does not exist.`);
      }
    }
    if (!company.logo?.alt?.trim()) error("LOGO_ALT_REQUIRED", `companies.${ticker}.logo.alt`, "Logo alt text is required.");
    if (!company.ui?.selectorLabel?.trim()) error("SELECTOR_LABEL_REQUIRED", `companies.${ticker}.ui.selectorLabel`, "Selector label is required.");
    if (!company.map?.defaultView?.trim()) error("DEFAULT_MAP_VIEW_REQUIRED", `companies.${ticker}.map.defaultView`, "Default map view is required.");
    if (new Set(company.map?.exposureKeys ?? []).size !== (company.map?.exposureKeys ?? []).length) error("DUPLICATE_EXPOSURE_KEY", `companies.${ticker}.map.exposureKeys`, "Exposure keys must be unique.");
    if (new Set(company.map?.routeLayerKeys ?? []).size !== (company.map?.routeLayerKeys ?? []).length) error("DUPLICATE_ROUTE_KEY", `companies.${ticker}.map.routeLayerKeys`, "Route keys must be unique.");
  }
}

if (metrics) {
  const categoryKeys = Object.keys(metrics.categories ?? {});
  const aliases = new Map();
  if (metrics.schemaVersion !== 1) error("METRIC_SCHEMA_VERSION", "config/metric-definitions.json", "Expected schemaVersion 1.");
  for (const [key, definition] of Object.entries(metrics.metrics ?? {})) {
    const at = `metrics.${key}`;
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) error("INVALID_METRIC_KEY", at, "Metric keys must use uppercase snake case.");
    if (!categoryKeys.includes(definition.category)) error("UNKNOWN_METRIC_CATEGORY", `${at}.category`, `${definition.category} is not defined.`);
    for (const field of ["displayName", "shortLabel", "unit", "valueType", "aggregation"]) {
      if (typeof definition[field] !== "string" || !definition[field].trim()) error("METRIC_FIELD_REQUIRED", `${at}.${field}`, `${field} is required.`);
    }
    if (!Array.isArray(definition.aliases) || definition.aliases.length === 0) error("ALIASES_REQUIRED", `${at}.aliases`, "At least one alias is required.");
    for (const alias of definition.aliases ?? []) {
      const normalized = String(alias).trim().toLowerCase();
      const existing = aliases.get(normalized);
      if (existing && existing !== key) warning("ALIAS_COLLISION", `${at}.aliases`, `“${alias}” is also assigned to ${existing}.`);
      else aliases.set(normalized, key);
    }
    for (const support of ["historical", "guidance", "consensus", "market"]) {
      if (typeof definition.supports?.[support] !== "boolean") error("SUPPORT_FLAG_REQUIRED", `${at}.supports.${support}`, "Must be boolean.");
    }
    for (const uiKey of ["homepage", "chartable", "mapTooltip", "sourceRequired"]) {
      if (typeof definition.ui?.[uiKey] !== "boolean") error("UI_FLAG_REQUIRED", `${at}.ui.${uiKey}`, "Must be boolean.");
    }
    if (![true, false, "conditional"].includes(definition.ui?.peerComparable)) error("INVALID_PEER_COMPARABLE", `${at}.ui.peerComparable`, "Must be true, false, or conditional.");
  }
}

for (const issue of issues) console.log(`[${issue.severity}] ${issue.code} at ${issue.at}: ${issue.message}`);
const errors = issues.filter((issue) => issue.severity === "ERROR");
const warnings = issues.filter((issue) => issue.severity === "WARNING");
console.log(`Validated configuration: ${errors.length} error(s), ${warnings.length} warning(s).`);
if (errors.length > 0) process.exit(1);
