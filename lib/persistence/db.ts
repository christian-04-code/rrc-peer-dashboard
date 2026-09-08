import { Pool } from "pg";

/**
 * Shared Postgres pool for the whole app (moved here from
 * lib/news/persistence/db.ts during Phase 6 so the Macro EIA intelligence
 * system's own persistence -- STEO snapshots, cached AI risk summaries --
 * can use the same one Neon connection pool as News, instead of opening a
 * second pool to the same database or creating a Macro -> News dependency).
 * One module-level singleton per warm serverless instance, same as before.
 */
let pool: Pool | null = null;

/**
 * Matches this repo's flat SCREAMING_SNAKE_CASE env convention
 * (lib/eia/client.ts, lib/fmp/*). DATABASE_URL is the generic Postgres
 * convention; POSTGRES_URL is what Vercel's Postgres/Neon marketplace
 * integration injects -- checking both means whichever the user's Vercel
 * dashboard integration lands on works without renaming anything.
 */
export function getDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim() || undefined;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(getDatabaseUrl());
}

function shouldUseSsl(connectionString: string): boolean {
  // Name kept as NEWS_DB_SSL (not renamed on this move) -- it's the
  // established local-dev/test toggle already used throughout the test
  // suite and developer workflow; renaming it would be a pure-risk change
  // with no behavioral benefit, for a single shared SSL knob that applies
  // equally to News's and Macro's use of this same pool.
  if (process.env.NEWS_DB_SSL === "false") return false;
  if (process.env.NEWS_DB_SSL === "true") return true;
  try {
    const url = new URL(connectionString);
    return !["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return true;
  }
}

export function getPool(): Pool {
  const connectionString = getDatabaseUrl();
  if (!connectionString) {
    throw new Error("DATABASE_URL (or POSTGRES_URL) is not set. This app's persistence layer requires it.");
  }
  if (!pool) {
    pool = new Pool({
      connectionString,
      ssl: shouldUseSsl(connectionString) ? { rejectUnauthorized: false } : undefined
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
