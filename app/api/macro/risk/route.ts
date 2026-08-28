import { NextResponse } from "next/server";
import { buildMacroRiskSnapshot } from "@/lib/market/macro-risk-orchestrate";
import { computeSignalChanges, type MacroRiskPayload, type RangeMacroSignal, type RangeMacroSignalChange } from "@/lib/market/macro-risk-engine";
import { getPool, isDatabaseConfigured } from "@/lib/persistence/db";
import { runMacroMigrations } from "@/lib/market/persistence/migrate";
import { getCachedMacroSummary, getPreviousMacroSummary } from "@/lib/market/persistence/summary-repo";
import { getLatestOrchestrationTimestamp } from "@/lib/market/persistence/orchestration-repo";

export const dynamic = "force-dynamic";
export const revalidate = 3600;

export type MacroRiskAiSummary = {
  summary: string;
  aiProvider: string;
  aiModel: string;
  generatedAt: string;
  /** The data-period snapshot this summary was generated from (MacroRiskPayload.snapshotAsOf, persisted alongside the summary) -- distinct from generatedAt (a wall-clock timestamp). Lets the UI show "Based on Macro snapshot X · Generated Y" instead of only a generation time. */
  snapshotAsOf: string | null;
  /** True when this summary was generated from the exact current deterministic snapshot; false when it's the most recent available summary but the underlying data has since changed (Section 17: never silently present stale commentary as current). */
  current: boolean;
};

export type MacroRiskResponse = {
  generatedAt: string;
  fingerprint: string;
  /** The current deterministic snapshot's own data-period marker (MacroRiskPayload.snapshotAsOf) -- for the risk widget's "Macro snapshot: X" line. Never a fetch timestamp. */
  snapshotAsOf: string | null;
  signals: RangeMacroSignal[];
  allSignalsEvaluated: number;
  aiSummary: MacroRiskAiSummary | null;
  aiSummaryStatus: "ready" | "stale" | "pending" | "unavailable";
  changes: RangeMacroSignalChange[];
  /** False until at least one prior (different-fingerprint) snapshot has ever been persisted -- distinguishes "no history to compare yet" from "compared, and nothing changed" (both render changes: []). */
  hasPriorSnapshot: boolean;
  /**
   * The last successful Macro orchestration completion time (Phase 6E) --
   * see getLatestOrchestrationTimestamp's doc comment for exactly what this
   * reuses. Null when the DB isn't configured or no cron run has ever
   * completed; the UI must show an honest "not yet available" state, never
   * fall back to the browser's own clock.
   */
  lastOrchestrationAt: string | null;
};

/**
 * Read-only from the browser's perspective: computes the deterministic
 * signals fresh on every request (cheap -- the same live EIA fetches the
 * rest of the Macro tab already does), but NEVER calls the AI provider.
 * The AI summary is whatever the scheduled /api/cron/macro route has
 * already generated and cached; if nothing is cached yet for the current
 * fingerprint, this falls back to the most recent available summary,
 * clearly labeled as not-current, rather than blocking on a live
 * generation or showing nothing.
 */
export async function GET() {
  const generatedAt = new Date().toISOString();
  const snapshot = await buildMacroRiskSnapshot(5);

  let aiSummary: MacroRiskAiSummary | null = null;
  let aiSummaryStatus: MacroRiskResponse["aiSummaryStatus"] = "unavailable";
  let changes: RangeMacroSignalChange[] = [];
  let hasPriorSnapshot = false;
  let lastOrchestrationAt: string | null = null;

  if (isDatabaseConfigured()) {
    try {
      await runMacroMigrations();
      const pool = getPool();
      const cached = await getCachedMacroSummary(pool, snapshot.fingerprint);
      const previous = await getPreviousMacroSummary(pool, snapshot.fingerprint);
      lastOrchestrationAt = await getLatestOrchestrationTimestamp(pool);

      if (previous) {
        hasPriorSnapshot = true;
        changes = computeSignalChanges(snapshot.payload, previous.riskSignals as MacroRiskPayload);
      }

      if (cached) {
        aiSummary = {
          summary: cached.summary,
          aiProvider: cached.aiProvider,
          aiModel: cached.aiModel,
          generatedAt: cached.generatedAt,
          snapshotAsOf: (cached.riskSignals as MacroRiskPayload)?.snapshotAsOf ?? null,
          current: true
        };
        aiSummaryStatus = "ready";
      } else if (previous) {
        aiSummary = {
          summary: previous.summary,
          aiProvider: previous.aiProvider,
          aiModel: previous.aiModel,
          generatedAt: previous.generatedAt,
          snapshotAsOf: (previous.riskSignals as MacroRiskPayload)?.snapshotAsOf ?? null,
          current: false
        };
        aiSummaryStatus = "stale";
      } else {
        aiSummaryStatus = "pending";
      }
    } catch {
      // A degraded/unreachable DB never blocks the deterministic signals below -- AI summary simply stays unavailable.
      aiSummaryStatus = "unavailable";
    }
  }

  const response: MacroRiskResponse = {
    generatedAt,
    fingerprint: snapshot.fingerprint,
    snapshotAsOf: snapshot.payload.snapshotAsOf,
    signals: snapshot.rankedSignals,
    allSignalsEvaluated: snapshot.allSignals.filter((signal) => signal.state !== "UNAVAILABLE").length,
    aiSummary,
    aiSummaryStatus,
    changes,
    hasPriorSnapshot,
    lastOrchestrationAt
  };

  return NextResponse.json(response, {
    headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" }
  });
}
