import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import ts from "typescript";

const require = createRequire(import.meta.url);

/**
 * Minimal runtime TS loader for the SEC update CLI, so scripts/sec/update.mjs
 * can read the CURRENT value already recorded in lib/dashboard/financials-quarterly.ts
 * (a hand-authored .ts module, not JSON) without adding a build step to the
 * pipeline or duplicating its data. Same single-file-transpile-then-`Function`-eval
 * technique already used by tests/helpers/ts-loader.cjs -- read-only, never
 * used to modify these files (writes go through lib/sec-pipeline/financials-writer.mjs's
 * text-surgery instead, which preserves comments/formatting this loader discards).
 */

const root = process.cwd();
const cache = new Map();

function resolveSpecifier(specifier, fromDir) {
  let target;
  if (specifier.startsWith("@/")) target = path.join(root, specifier.slice(2));
  else if (specifier.startsWith(".")) target = path.resolve(fromDir, specifier);
  else return null;
  if (fs.existsSync(`${target}.ts`)) return `${target}.ts`;
  if (fs.existsSync(target) && fs.statSync(target).isFile()) return target;
  if (fs.existsSync(path.join(target, "index.ts"))) return path.join(target, "index.ts");
  return null;
}

function loadTs(absPath) {
  if (cache.has(absPath)) return cache.get(absPath);
  const source = fs.readFileSync(absPath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: absPath,
  }).outputText;

  const moduleObj = { exports: {} };
  cache.set(absPath, moduleObj.exports);

  const customRequire = (specifier) => {
    const resolved = resolveSpecifier(specifier, path.dirname(absPath));
    if (!resolved) return require(specifier);
    if (resolved.endsWith(".json")) return JSON.parse(fs.readFileSync(resolved, "utf8"));
    return loadTs(resolved);
  };

  // eslint-disable-next-line no-new-func
  const wrapper = new Function("exports", "require", "module", "__filename", "__dirname", output);
  wrapper(moduleObj.exports, customRequire, moduleObj, absPath, path.dirname(absPath));
  cache.set(absPath, moduleObj.exports);
  return moduleObj.exports;
}

export function loadTsModule(relativePath, fromRoot = root) {
  return loadTs(path.resolve(fromRoot, relativePath));
}
