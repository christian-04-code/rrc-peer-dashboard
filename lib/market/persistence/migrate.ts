import { readFileSync } from "node:fs";
import path from "node:path";
import { getPool } from "@/lib/persistence/db";

/**
 * Single shared implementation of "apply the macro schema", mirroring
 * lib/news/persistence/migrate.ts. schema.sql remains the one canonical
 * schema definition for Macro's own tables; this only centralizes how it
 * gets applied so callers don't duplicate the read-file-then-query logic.
 */
export async function runMacroMigrations(): Promise<void> {
  const schemaPath = path.join(process.cwd(), "lib", "market", "persistence", "schema.sql");
  const sql = readFileSync(schemaPath, "utf8");
  const pool = getPool();
  await pool.query(sql);
}
