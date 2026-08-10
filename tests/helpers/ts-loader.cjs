/**
 * Recursive TS module loader for tests, extending the single-file transpile-and-load
 * pattern already used by tests/financials-quarterly.test.cjs and
 * tests/live-market-prices.test.cjs to modules that have real (non-type-only) "@/" or
 * relative cross-file imports, so those modules can be executed and asserted on directly
 * instead of only pattern-matched as source text.
 */

const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const root = process.cwd();
const cache = new Map();

function resolveSpecifier(specifier, fromDir) {
  let target;
  if (specifier.startsWith("@/")) {
    target = path.join(root, specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    target = path.resolve(fromDir, specifier);
  } else {
    return null; // node built-in or npm package; let the host require() handle it
  }
  if (fs.existsSync(`${target}.ts`)) return `${target}.ts`;
  if (fs.existsSync(target) && fs.statSync(target).isFile()) return target;
  if (fs.existsSync(path.join(target, "index.ts"))) return path.join(target, "index.ts");
  return null;
}

function loadTs(absPath) {
  if (cache.has(absPath)) return cache.get(absPath);

  const source = fs.readFileSync(absPath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    },
    fileName: absPath
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

function load(relativePath) {
  return loadTs(path.resolve(root, relativePath));
}

module.exports = { load };
