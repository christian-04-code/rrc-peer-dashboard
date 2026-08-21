import { Pool } from "pg";

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
    throw new Error("DATABASE_URL (or POSTGRES_URL) is not set. The news pipeline's persistence layer requires it.");
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
