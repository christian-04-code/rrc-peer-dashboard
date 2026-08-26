import type { Pool } from "pg";
import { getPool, isDatabaseConfigured } from "@/lib/persistence/db";
import { runMacroMigrations } from "@/lib/market/persistence/migrate";
import { refreshSteoSnapshots } from "@/lib/market/macro-steo-refresh";
import { buildMacroRiskSnapshot } from "@/lib/market/macro-risk-orchestrate";
import { generateMacroSummaryIfNeeded, macroSummarySafeErrorMessage } from "@/lib/market/macro-summary-service";
import { AnthropicMacroSummaryProvider } from "@/lib/market/ai/anthropic-provider";
import type { MacroSummaryProvider } from "@/lib/market/ai/provider";

/**
 * Same fixed-advisory-lock guard lib/news/pipeline/orchestrate.ts uses,
 * under Macro's own lock key -- a genuinely separate cron entry (Section 18:
 * "prefer clean separation" from News) means a genuinely separate lock, so
 * a duplicate Macro cron delivery can never race a duplicate News delivery
 * or vice versa.
 */
const ORCHESTRATION_LOCK_QUERY = `SELECT pg_try_advisory_lock(hashtext('rrc_macro_daily_orchestration')::bigint) AS locked`;
const ORCHESTRATION_UNLOCK_QUERY = `SELECT pg_advisory_unlock(hashtext('rrc_macro_daily_orchestration')::bigint) AS unlocked`;

async function tryAcquireLock(pool: Pool): Promise<boolean> {
  try {
    const result = await pool.query(ORCHESTRATION_LOCK_QUERY);
    return result.rows[0]?.locked === true;
  } catch {
    return false;
  }
}

async function releaseLock(pool: Pool): Promise<void> {
  await pool.query(ORCHESTRATION_UNLOCK_QUERY).catch(() => undefined);
}

export type MacroDailyOrchestrationResult =
  | {
      concurrentRunSkipped: false;
      steoRefreshed: number;
      steoFailed: number;
      fingerprint: string;
      aiSkippedReason: string | null;
      aiCacheHit: boolean | null;
      aiGenerated: boolean;
    }
  | { concurrentRunSkipped: true; reason: string };

/**
 * The one scheduled Macro orchestration path (app/api/cron/macro/route.ts):
 * persist this run's STEO snapshot (existing Phase 6B refreshSteoSnapshots,
 * unchanged), compute the current deterministic risk snapshot, and generate
 * the AI summary only if nothing is cached for its exact fingerprint yet.
 * Never called from a browser-facing route -- this is the only place in the
 * whole Macro system that may call the AI provider.
 */
export async function runMacroDailyOrchestration(options: { provider?: MacroSummaryProvider } = {}): Promise<MacroDailyOrchestrationResult> {
  if (!isDatabaseConfigured()) {
    return {
      concurrentRunSkipped: false,
      steoRefreshed: 0,
      steoFailed: 0,
      fingerprint: "",
      aiSkippedReason: "Database not configured -- STEO snapshot persistence and AI summary generation both skipped.",
      aiCacheHit: null,
      aiGenerated: false
    };
  }

  const pool = getPool();
  const lockAcquired = await tryAcquireLock(pool);
  if (!lockAcquired) {
    return { concurrentRunSkipped: true, reason: "Another Macro orchestration run is already in progress; skipped to avoid duplicate AI generation." };
  }

  try {
    await runMacroMigrations();

    const steoResult = await refreshSteoSnapshots(pool);
    const snapshot = await buildMacroRiskSnapshot(5);

    let aiSkippedReason: string | null = null;
    let aiCacheHit: boolean | null = null;
    let aiGenerated = false;

    if (!process.env.ANTHROPIC_API_KEY) {
      aiSkippedReason = "ANTHROPIC_API_KEY not configured -- AI summary generation skipped; STEO snapshots and deterministic signals are unaffected.";
    } else {
      try {
        const provider = options.provider ?? new AnthropicMacroSummaryProvider();
        const result = await generateMacroSummaryIfNeeded(pool, provider, snapshot.payload, snapshot.fingerprint);
        aiCacheHit = result.cacheHit;
        aiGenerated = !result.cacheHit;
      } catch (error) {
        aiSkippedReason = `AI summary generation did not complete: ${macroSummarySafeErrorMessage(error)}`;
      }
    }

    return {
      concurrentRunSkipped: false,
      steoRefreshed: steoResult.succeeded,
      steoFailed: steoResult.failed,
      fingerprint: snapshot.fingerprint,
      aiSkippedReason,
      aiCacheHit,
      aiGenerated
    };
  } finally {
    await releaseLock(pool);
  }
}
