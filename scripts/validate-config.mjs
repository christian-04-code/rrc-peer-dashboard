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
const managementGuidance = await readJson("data/management-guidance.json");
const historical = await readJson("data/historical.json");

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

/**
 * Data-quality checks (fix/q2-data-foundation, Phase A5).
 *
 * Deliberately simple, non-exhaustive checks for obviously-malformed entries in the
 * two hand-maintained data files -- not a schema system, just the specific failure
 * modes that have actually shown up in this project (e.g. the EXE FY2026 production
 * guidance midpoint stored as 7.5 while low/high were 7400/7600, a ~1000x unit
 * mismatch fixed earlier on this branch). Every check here is something a real bug
 * would trip; there is no attempt to validate every field of every record.
 */
function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

const VALID_QUARTER = /^Q[1-4] \d{4}$/;
const VALID_PLOT_PERIOD = /^(Q[1-4] \d{4}|FY \d{4})$/;

if (managementGuidance) {
  for (const [ticker, company] of Object.entries(managementGuidance.companies ?? {})) {
    for (const [index, entry] of (company.entries ?? []).entries()) {
      const at = `management-guidance.${ticker}.entries[${index}] (${entry.metric}, ${entry.period})`;

      for (const field of ["low", "midpoint", "high", "reportedValue"]) {
        const value = entry[field];
        if (value !== null && value !== undefined && !isFiniteNumber(value)) {
          error("GUIDANCE_NON_FINITE_VALUE", `${at}.${field}`, `${field} is ${value}, not a finite number or null.`);
        }
      }

      if (isFiniteNumber(entry.low) && isFiniteNumber(entry.high) && entry.low > entry.high) {
        error("GUIDANCE_LOW_ABOVE_HIGH", at, `low (${entry.low}) is greater than high (${entry.high}).`);
      }

      if (isFiniteNumber(entry.low) && isFiniteNumber(entry.high) && isFiniteNumber(entry.midpoint)) {
        if (entry.midpoint < entry.low || entry.midpoint > entry.high) {
          error(
            "GUIDANCE_MIDPOINT_OUT_OF_RANGE",
            `${at}.midpoint`,
            `midpoint (${entry.midpoint}) falls outside [low, high] = [${entry.low}, ${entry.high}]; ` +
              `often a unit mismatch (e.g. Bcfe/d vs MMcfe/d) between midpoint and low/high.`
          );
        }
      }

      if (/production/.test(entry.metric) && !entry.operator) {
        for (const field of ["low", "midpoint", "high", "reportedValue"]) {
          if (isFiniteNumber(entry[field]) && entry[field] < 0) {
            error("GUIDANCE_NEGATIVE_PRODUCTION", `${at}.${field}`, `${field} is negative (${entry[field]}) for a production metric.`);
          }
        }
      }

      // plotPeriod drives chart placement, so it must be a real quarter/FY -- unlike
      // `period` (a free-text display label that legitimately holds things like
      // "2028+", "Beginning 2027", or "Mid-Cycle / Long-Term" for qualitative
      // long-term targets), which is not validated here.
      if (typeof entry.plotPeriod === "string" && !VALID_PLOT_PERIOD.test(entry.plotPeriod)) {
        error("GUIDANCE_INVALID_PLOT_PERIOD", `${at}.plotPeriod`, `"${entry.plotPeriod}" does not match "Q# YYYY" or "FY YYYY".`);
      }
    }
  }
}

if (historical) {
  const PRODUCTION_METRICS = new Set(["Total Production", "Natural Gas Production", "NGL Production", "Oil / Condensate Production"]);
  for (const [ticker, company] of Object.entries(historical.companies ?? {})) {
    for (const [metricName, metric] of Object.entries(company.metrics ?? {})) {
      for (const [quarter, value] of Object.entries(metric.values ?? {})) {
        const at = `historical.${ticker}.metrics["${metricName}"].values["${quarter}"]`;
        if (!VALID_QUARTER.test(quarter)) {
          error("HISTORICAL_INVALID_QUARTER_KEY", at, `"${quarter}" is not a valid "Q# YYYY" key.`);
        }
        if (value !== null && !isFiniteNumber(value)) {
          error("HISTORICAL_NON_FINITE_VALUE", at, `value is ${value}, not a finite number or null.`);
        }
        if (PRODUCTION_METRICS.has(metricName) && isFiniteNumber(value) && value < 0) {
          error("HISTORICAL_NEGATIVE_PRODUCTION", at, `${metricName} is negative (${value}).`);
        }
      }
    }
  }
}

for (const issue of issues) console.log(`[${issue.severity}] ${issue.code} at ${issue.at}: ${issue.message}`);
const errors = issues.filter((issue) => issue.severity === "ERROR");
const warnings = issues.filter((issue) => issue.severity === "WARNING");
console.log(`Validated configuration: ${errors.length} error(s), ${warnings.length} warning(s).`);
if (errors.length > 0) process.exit(1);
