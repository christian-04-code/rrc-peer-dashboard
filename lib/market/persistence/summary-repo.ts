import type { Pool } from "pg";
import { createHash } from "node:crypto";

export type MacroRiskSummaryRecord = {
  inputFingerprint: string;
  summary: string;
  riskSignals: unknown;
  aiProvider: string;
  aiModel: string;
  schemaVersion: string;
  generatedAt: string;
};

type MacroRiskSummaryRow = {
  input_fingerprint: string;
  summary: string;
  risk_signals: unknown;
  ai_provider: string;
  ai_model: string;
  schema_version: string;
  generated_at: Date | string;
};

/**
 * Deterministic order-independent JSON stringification, so two structurally
 * identical payloads always fingerprint identically regardless of object
 * key insertion order (the deterministic risk-signal builder in Phase 6D
 * has no reason to guarantee stable key order on its own).
 */
function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(",")}}`;
}

/**
 * Fingerprints the structured deterministic-signal payload that will be
 * sent to the AI provider (Phase 6D) -- this is the cache/idempotency key,
 * per Section 25/33: the summary must never regenerate for an unchanged
 * snapshot, and a page view must never be what decides to call AI.
 */
export function computeMacroSummaryFingerprint(payload: unknown): string {
  return createHash("sha256").update(canonicalize(payload)).digest("hex");
}

function mapRow(row: MacroRiskSummaryRow): MacroRiskSummaryRecord {
  return {
    inputFingerprint: row.input_fingerprint,
    summary: row.summary,
    riskSignals: row.risk_signals,
    aiProvider: row.ai_provider,
    aiModel: row.ai_model,
    schemaVersion: row.schema_version,
    generatedAt: row.generated_at instanceof Date ? row.generated_at.toISOString() : row.generated_at
  };
}

export async function getCachedMacroSummary(pool: Pool, inputFingerprint: string): Promise<MacroRiskSummaryRecord | null> {
  const result = await pool.query(
    `SELECT input_fingerprint, summary, risk_signals, ai_provider, ai_model, schema_version, generated_at
     FROM macro_risk_summaries WHERE input_fingerprint = $1`,
    [inputFingerprint]
  );
  const row = result.rows[0] as MacroRiskSummaryRow | undefined;
  return row ? mapRow(row) : null;
}

/**
 * The most recently generated summary regardless of fingerprint -- used to
 * serve a clearly-labeled "as of an older snapshot" fallback (Section 17)
 * when the current data's fingerprint has no cached row yet (the cron
 * hasn't run since the underlying data last changed), instead of showing
 * nothing or silently presenting stale commentary as current.
 */
export async function getLatestMacroSummary(pool: Pool): Promise<MacroRiskSummaryRecord | null> {
  const result = await pool.query(
    `SELECT input_fingerprint, summary, risk_signals, ai_provider, ai_model, schema_version, generated_at
     FROM macro_risk_summaries ORDER BY generated_at DESC LIMIT 1`
  );
  const row = result.rows[0] as MacroRiskSummaryRow | undefined;
  return row ? mapRow(row) : null;
}

/**
 * The most recent summary strictly before a given fingerprint's row (by
 * generated_at) -- the "prior snapshot" the AI is given as change-detection
 * context (Section 20). Real persisted history only; returns null (never a
 * fabricated placeholder) until at least two distinct snapshots exist.
 */
export async function getPreviousMacroSummary(pool: Pool, excludeFingerprint: string): Promise<MacroRiskSummaryRecord | null> {
  const result = await pool.query(
    `SELECT input_fingerprint, summary, risk_signals, ai_provider, ai_model, schema_version, generated_at
     FROM macro_risk_summaries WHERE input_fingerprint != $1 ORDER BY generated_at DESC LIMIT 1`,
    [excludeFingerprint]
  );
  const row = result.rows[0] as MacroRiskSummaryRow | undefined;
  return row ? mapRow(row) : null;
}

/**
 * `ON CONFLICT DO NOTHING` on the fingerprint means a race between two
 * concurrent callers computing the same unchanged snapshot never produces
 * two AI calls' worth of duplicate rows -- the second write is just a
 * no-op, same idempotency pattern as lib/news/persistence/articles-repo.ts's
 * insertArticleIfNew.
 */
export async function saveMacroSummary(pool: Pool, record: MacroRiskSummaryRecord): Promise<{ inserted: boolean }> {
  const result = await pool.query(
    `INSERT INTO macro_risk_summaries (input_fingerprint, summary, risk_signals, ai_provider, ai_model, schema_version, generated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (input_fingerprint) DO NOTHING
     RETURNING id`,
    [record.inputFingerprint, record.summary, JSON.stringify(record.riskSignals), record.aiProvider, record.aiModel, record.schemaVersion, record.generatedAt]
  );
  return { inserted: result.rows.length > 0 };
}
