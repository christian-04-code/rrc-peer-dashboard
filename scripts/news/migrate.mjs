import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import pg from "pg";

/**
 * Applies lib/news/persistence/schema.sql against DATABASE_URL (or
 * POSTGRES_URL). Deliberately a standalone script, not code reachable from
 * app/api/cron/news/route.ts -- migrations run once per deploy/manual step,
 * not per request, and reading the .sql file at request time would also
 * require it to survive Vercel's serverless bundling/file tracing.
 */
export async function runMigrations(root = process.cwd()) {
  const connectionString = process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL (or POSTGRES_URL) is not set.");
  }

  const schemaPath = path.join(root, "lib", "news", "persistence", "schema.sql");
  const sql = await readFile(schemaPath, "utf8");

  const useSsl = process.env.NEWS_DB_SSL === "true" || (process.env.NEWS_DB_SSL !== "false" && !/localhost|127\.0\.0\.1/.test(connectionString));
  const client = new pg.Client({ connectionString, ssl: useSsl ? { rejectUnauthorized: false } : undefined });

  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
}

async function main() {
  await runMigrations();
  process.stdout.write("News schema migration applied.\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
