import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import ts from "typescript";

const require = createRequire(import.meta.url);

/**
 * Minimal single-file TS loader so this script can call the one shared
 * migration implementation in lib/reports/persistence/migrate.ts instead of
 * duplicating the read-schema-then-query logic here. Mirrors
 * scripts/macro/migrate.mjs's and scripts/news/migrate.mjs's identical
 * pattern.
 */
function loadTs(absPath, root, cache = new Map()) {
  if (cache.has(absPath)) return cache.get(absPath);
  const source = fs.readFileSync(absPath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: absPath
  }).outputText;

  const moduleObj = { exports: {} };
  cache.set(absPath, moduleObj.exports);

  const customRequire = (specifier) => {
    let target;
    if (specifier.startsWith("@/")) target = path.join(root, specifier.slice(2));
    else if (specifier.startsWith(".")) target = path.resolve(path.dirname(absPath), specifier);
    else return require(specifier);
    const resolved = fs.existsSync(`${target}.ts`) ? `${target}.ts` : target;
    return loadTs(resolved, root, cache);
  };

  const wrapper = new Function("exports", "require", "module", "__filename", "__dirname", output);
  wrapper(moduleObj.exports, customRequire, moduleObj, absPath, path.dirname(absPath));
  cache.set(absPath, moduleObj.exports);
  return moduleObj.exports;
}

export async function runMigrations(root = process.cwd()) {
  const connectionString = process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL (or POSTGRES_URL) is not set.");
  }
  const { runWeeklyReportMigrations } = loadTs(path.join(root, "lib", "reports", "persistence", "migrate.ts"), root);
  await runWeeklyReportMigrations();
  const { closePool } = loadTs(path.join(root, "lib", "persistence", "db.ts"), root);
  await closePool();
}

async function main() {
  await runMigrations();
  process.stdout.write("Weekly report schema migration applied.\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
