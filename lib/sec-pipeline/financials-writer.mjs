/**
 * PHASE 5 canonical writer, half 2 of 2: lib/dashboard/financials-quarterly.ts.
 *
 * Unlike historical.json this file is hand-authored TypeScript with dense
 * per-field commentary that must survive untouched. Per the task's explicit
 * instruction not to attempt a broad canonical-data refactor, this writer
 * does the one operation that is genuinely safe to automate: appending a
 * brand-new "Qn YYYY": { ... } quarter block for a ticker whose quarter does
 * not exist yet, as plain text surgery anchored on brace-matching (never a
 * regex replace over the whole file, never touching an existing quarter's
 * text). It refuses outright if the quarter already exists.
 *
 * By default it also refuses if any field mapped into this file is still
 * REVIEW_REQUIRED, because every existing quarter block in the file was only
 * ever written after full review -- a partially-reviewed block would look
 * indistinguishable from a fully-reviewed one to the next person reading it.
 * Pass allowPartial to override that once REVIEW_REQUIRED fields have been
 * knowingly left for a later pass (they are still written as null, never as
 * their proposed value).
 */

import { deriveCommodityMix } from "./derive.mjs";

function findMatchingBrace(source, openBraceIndex) {
  let depth = 0;
  let inString = false;
  let stringChar = null;
  for (let index = openBraceIndex; index < source.length; index += 1) {
    const char = source[index];
    const prevChar = source[index - 1];
    if (inString) {
      if (char === stringChar && prevChar !== "\\") inString = false;
      continue;
    }
    if (char === '"' || char === "`") {
      inString = true;
      stringChar = char;
      continue;
    }
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error("Unbalanced braces while scanning financials-quarterly.ts.");
}

function findTickerBlock(source, ticker) {
  const tickerKeyPattern = new RegExp(`\\n  ${ticker}: \\{`);
  const match = tickerKeyPattern.exec(source);
  if (!match) throw new Error(`Could not find "  ${ticker}: {" block in financials-quarterly.ts.`);
  const openBraceIndex = match.index + match[0].length - 1;
  const closeBraceIndex = findMatchingBrace(source, openBraceIndex);
  return { openBraceIndex, closeBraceIndex };
}

export function quarterExistsInSource(source, ticker, quarterKey) {
  const { openBraceIndex, closeBraceIndex } = findTickerBlock(source, ticker);
  const block = source.slice(openBraceIndex, closeBraceIndex);
  return block.includes(`"${quarterKey}":`);
}

function fieldLiteral(candidateField, { sourceOverride, basis }) {
  const parts = [`value: ${candidateField.value === null ? "null" : JSON.stringify(candidateField.value)}`];
  parts.push(`source: ${JSON.stringify(sourceOverride)}`);
  parts.push(`basis: ${JSON.stringify(basis)}`);
  if (candidateField.notes) parts.push(`note: ${JSON.stringify(candidateField.notes)}`);
  return `{ ${parts.join(", ")} }`;
}

function resolvedField(field, { allowPartial }) {
  if (field.action === "REVIEW_REQUIRED" && !allowPartial) {
    throw new Error(`Field is REVIEW_REQUIRED and allowPartial was not set: ${field.notes ?? "no notes"}`);
  }
  if (field.action === "REVIEW_REQUIRED") {
    return { value: null, notes: `REVIEW_REQUIRED, not yet resolved -- left blank pending manual confirmation. ${field.notes ?? ""}`.trim() };
  }
  return { value: field.value, notes: field.notes };
}

const FIELD_SOURCE = "sec-direct";

function buildQuarterObjectText(candidate, { allowPartial, indent = "    " }) {
  const literal = (group, field) => {
    const target = candidate[group][field];
    const resolved = resolvedField(target, { allowPartial });
    const basis = target.classification === "B" ? "derived" : "actual";
    return fieldLiteral({ value: resolved.value, notes: resolved.notes }, { sourceOverride: FIELD_SOURCE, basis });
  };
  // commodityMix is always classification-B, derived purely from production
  // components -- never extracted/manual -- so it is computed here rather
  // than carried as its own candidate-schema group.
  const commodityMix = deriveCommodityMix(candidate.production);
  const mixLiteral = (field) => fieldLiteral({ value: commodityMix[field].value, notes: commodityMix[field].notes }, { sourceOverride: FIELD_SOURCE, basis: "derived" });

  const i2 = indent + "  ";
  const i3 = indent + "    ";
  const lines = [];
  lines.push(`${indent}"${candidate.identity.quarterKey}": {`);
  lines.push(`${i2}ticker: "${candidate.identity.ticker}",`);
  lines.push(`${i2}quarter: "${candidate.identity.quarterKey}",`);
  lines.push(`${i2}revenue: ${literal("financial", "revenue")},`);
  lines.push(`${i2}adjustedEbitdax: ${literal("financial", "adjustedEbitdax")},`);
  lines.push(`${i2}capitalExpenditures: ${literal("financial", "capitalExpenditures")},`);
  lines.push(`${i2}netDebt: ${literal("financial", "netDebt")},`);
  lines.push(`${i2}production: {`);
  lines.push(`${i3}total: ${literal("production", "total")},`);
  lines.push(`${i3}naturalGas: ${literal("production", "naturalGas")},`);
  lines.push(`${i3}ngl: ${literal("production", "ngl")},`);
  lines.push(`${i3}oilCondensate: ${literal("production", "oilCondensate")}`);
  lines.push(`${i2}},`);
  lines.push(`${i2}commodityMix: {`);
  lines.push(`${i3}naturalGasPct: ${mixLiteral("naturalGasPct")},`);
  lines.push(`${i3}nglPct: ${mixLiteral("nglPct")},`);
  lines.push(`${i3}oilCondensatePct: ${mixLiteral("oilCondensatePct")}`);
  lines.push(`${i2}},`);
  lines.push(`${i2}realizedPrices: {`);
  lines.push(`${i3}naturalGas: ${literal("pricing", "realizedGas")},`);
  lines.push(`${i3}ngl: ${literal("pricing", "realizedNgl")},`);
  lines.push(`${i3}oilCondensate: ${literal("pricing", "realizedOil")}`);
  lines.push(`${i2}},`);
  lines.push(`${i2}costs: {`);
  lines.push(`${i3}leaseOperatingExpense: ${literal("costs", "leaseOperatingExpense")},`);
  lines.push(`${i3}gatheringProcessingTransportation: ${literal("costs", "gatheringProcessingTransport")},`);
  lines.push(`${i3}cashGA: ${literal("costs", "cashGA")},`);
  lines.push(`${i3}totalCashUnitCosts: ${literal("costs", "totalCashUnitCosts")}`);
  lines.push(`${i2}},`);
  lines.push(`${i2}wells: {`);
  lines.push(`${i3}drilled: ${literal("operating", "wellsDrilled")},`);
  lines.push(`${i3}turnedInLine: ${literal("operating", "tils")},`);
  lines.push(`${i3}ducInventory: ${fieldLiteral({ value: null, notes: "DUC inventory is outside this pipeline's supported field set; left blank, not guessed." }, { sourceOverride: FIELD_SOURCE, basis: "actual" })}`);
  lines.push(`${i2}}`);
  lines.push(`${indent}},`);
  return lines.join("\n");
}

/**
 * @returns {{ source: string, inserted: boolean, reason?: string }}
 */
export function insertQuarterIntoFinancialsQuarterly(source, candidate, { allowPartial = false } = {}) {
  const { ticker, quarterKey } = candidate.identity;
  if (quarterExistsInSource(source, ticker, quarterKey)) {
    return { source, inserted: false, reason: `${ticker} ${quarterKey} already exists in financials-quarterly.ts; refusing to modify an existing quarter block.` };
  }

  const reviewRequiredFields = [];
  for (const [group, fields] of Object.entries({
    financial: ["revenue", "adjustedEbitdax", "capitalExpenditures", "netDebt"],
    production: ["total", "naturalGas", "ngl", "oilCondensate"],
    pricing: ["realizedGas", "realizedNgl", "realizedOil"],
    costs: ["leaseOperatingExpense", "gatheringProcessingTransport", "cashGA", "totalCashUnitCosts"],
    operating: ["wellsDrilled", "tils"],
  })) {
    for (const field of fields) {
      if (candidate[group][field].action === "REVIEW_REQUIRED") reviewRequiredFields.push(`${group}.${field}`);
    }
  }
  if (reviewRequiredFields.length > 0 && !allowPartial) {
    return {
      source,
      inserted: false,
      reason: `${reviewRequiredFields.length} field(s) still REVIEW_REQUIRED (${reviewRequiredFields.join(", ")}); resolve them or pass allowPartial to insert with those fields left null.`,
    };
  }

  const { openBraceIndex, closeBraceIndex } = findTickerBlock(source, ticker);
  const quarterText = buildQuarterObjectText(candidate, { allowPartial });
  const insertionPoint = closeBraceIndex; // just before the ticker block's own closing "}"
  const before = source.slice(0, insertionPoint).replace(/[ \t]+$/, ""); // drop trailing indent-only whitespace so the insertion doesn't leave a blank line with stray spaces
  const after = source.slice(insertionPoint);
  const needsLeadingNewline = !before.endsWith("\n");
  const patched = `${before}${needsLeadingNewline ? "\n" : ""}${quarterText}\n  ${after}`;
  return { source: patched, inserted: true };
}
