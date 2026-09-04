import { readFileSync } from "node:fs";
import path from "node:path";
import { getPool } from "@/lib/persistence/db";

/**
 * Single shared implementation of "apply the news schema" -- called by
 * `npm run news:migrate` (scripts/news/migrate.mjs). schema.sql remains the
 * one canonical schema definition; this only centralizes how it gets
 * applied so callers don't duplicate the read-file-then-query logic.
 */
export async function runNewsMigrations(): Promise<void> {
  const schemaPath = path.join(process.cwd(), "lib", "news", "persistence", "schema.sql");
  const sql = readFileSync(schemaPath, "utf8");
  const pool = getPool();
  await pool.query(sql);
}
