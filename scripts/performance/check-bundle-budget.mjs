import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

function bundleError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function normalizePath(value) {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

function isJavaScriptAsset(file) {
  return /\.(?:js|mjs)$/i.test(file);
}

function formatBytes(value) {
  return `${value.toLocaleString("en-US")} B (${(value / 1024).toFixed(2)} KiB)`;
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    if (!existsSync(path)) throw bundleError("MANIFEST_MISSING", `${label} is missing.`);
    throw bundleError("JSON_INVALID", `${label} is not valid JSON: ${error instanceof Error ? error.message : "unknown error"}`);
  }
}

export function validateBundleBudget(budget) {
  if (!budget || budget.version !== 1) throw bundleError("BUDGET_INVALID", "budget.version must be 1.");
  const limits = [budget.entry?.maxRawBytes, budget.entry?.maxGzipBytes, budget.initial?.maxRawBytes, budget.initial?.maxGzipBytes, budget.initial?.maxNonDefaultScreenModules, budget.dynamicChunk?.warningRawBytes];
  if (limits.some((value) => !Number.isInteger(value) || value < 0)) throw bundleError("BUDGET_INVALID", "all byte and module limits must be non-negative integers.");
  if (!Array.isArray(budget.initial.nonDefaultScreenSources) || budget.initial.nonDefaultScreenSources.some((value) => typeof value !== "string" || value.length === 0)) {
    throw bundleError("BUDGET_INVALID", "initial.nonDefaultScreenSources must be a string array.");
  }
  if (!budget.initial.nonDefaultScreenMarkers || typeof budget.initial.nonDefaultScreenMarkers !== "object" || Array.isArray(budget.initial.nonDefaultScreenMarkers) || Object.entries(budget.initial.nonDefaultScreenMarkers).some(([source, marker]) => typeof source !== "string" || source.length === 0 || typeof marker !== "string" || marker.length === 0)) {
    throw bundleError("BUDGET_INVALID", "initial.nonDefaultScreenMarkers must map source names to marker strings.");
  }
  return budget;
}

function toManifestLookup(manifest) {
  return new Map(Object.keys(manifest).map((key) => [normalizePath(key), { key, item: manifest[key] }]));
}

function initialChain(manifest) {
  const lookup = toManifestLookup(manifest);
  const entry = [...lookup.values()].find(({ item }) => item?.isEntry);
  if (!entry) throw bundleError("MANIFEST_INVALID", "manifest has no entry module.");

  const visited = new Set();
  const visit = (normalizedKey) => {
    if (visited.has(normalizedKey)) return;
    const node = lookup.get(normalizedKey);
    if (!node) throw bundleError("MANIFEST_INVALID", `manifest import is missing: ${normalizedKey}`);
    visited.add(normalizedKey);
    for (const imported of node.item.imports ?? []) visit(normalizePath(imported));
  };
  visit(normalizePath(entry.key));
  return { entryKey: normalizePath(entry.key), keys: [...visited], lookup };
}

function assetMetric(distDirectory, file) {
  const normalizedFile = normalizePath(file);
  const path = resolve(distDirectory, normalizedFile);
  const root = resolve(distDirectory);
  const pathWithinDist = relative(root, path);
  if (pathWithinDist === "" || pathWithinDist.startsWith(`..${sep}`) || pathWithinDist === "..") throw bundleError("MANIFEST_INVALID", `asset path escapes dist: ${normalizedFile}`);
  if (!existsSync(path)) throw bundleError("ASSET_MISSING", `manifest asset is missing: ${normalizedFile}`);
  const data = readFileSync(path);
  return { file: normalizedFile, rawBytes: data.length, gzipBytes: gzipSync(data).length };
}

function assetText(distDirectory, file) {
  const normalizedFile = normalizePath(file);
  const path = resolve(distDirectory, normalizedFile);
  const root = resolve(distDirectory);
  const pathWithinDist = relative(root, path);
  if (pathWithinDist === "" || pathWithinDist.startsWith(`..${sep}`) || pathWithinDist === "..") throw bundleError("MANIFEST_INVALID", `asset path escapes dist: ${normalizedFile}`);
  return readFileSync(path, "utf8");
}

function check(name, actual, maximum) {
  return { name, actual, maximum, passed: actual <= maximum };
}

export function checkBundleBudget({ distDirectory, manifest, budget }) {
  validateBundleBudget(budget);
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) throw bundleError("MANIFEST_INVALID", "manifest must be an object.");

  const chain = initialChain(manifest);
  const entryItem = chain.lookup.get(chain.entryKey).item;
  if (!isJavaScriptAsset(entryItem.file)) throw bundleError("MANIFEST_INVALID", "entry module must reference a JavaScript asset.");
  const entryMetric = assetMetric(distDirectory, entryItem.file);
  const initialMetrics = chain.keys
    .map((key) => ({ key, item: chain.lookup.get(key).item }))
    .filter(({ item }) => isJavaScriptAsset(item.file))
    .map(({ key, item }) => ({ key, ...assetMetric(distDirectory, item.file) }));
  const initialRawBytes = initialMetrics.reduce((sum, item) => sum + item.rawBytes, 0);
  const initialGzipBytes = initialMetrics.reduce((sum, item) => sum + item.gzipBytes, 0);
  const manifestNonDefaultScreens = budget.initial.nonDefaultScreenSources
    .map(normalizePath)
    .filter((source) => chain.keys.includes(source));
  const initialAssetText = initialMetrics.map((item) => assetText(distDirectory, item.file)).join("\n");
  const markerNonDefaultScreens = Object.entries(budget.initial.nonDefaultScreenMarkers)
    .filter(([, marker]) => initialAssetText.includes(marker))
    .map(([source]) => normalizePath(source));
  const nonDefaultScreens = [...new Set([...manifestNonDefaultScreens, ...markerNonDefaultScreens])];
  const dynamicChunks = [...chain.lookup.values()]
    .filter(({ item }) => item?.isDynamicEntry && isJavaScriptAsset(item.file))
    .map(({ key, item }) => ({ source: normalizePath(item.src ?? key), ...assetMetric(distDirectory, item.file) }))
    .sort((left, right) => right.rawBytes - left.rawBytes);
  const checks = [
    check("entry raw", entryMetric.rawBytes, budget.entry.maxRawBytes),
    check("entry gzip", entryMetric.gzipBytes, budget.entry.maxGzipBytes),
    check("initial total raw", initialRawBytes, budget.initial.maxRawBytes),
    check("initial total gzip", initialGzipBytes, budget.initial.maxGzipBytes),
    check("initial non-default screen modules", nonDefaultScreens.length, budget.initial.maxNonDefaultScreenModules)
  ];
  const warnings = dynamicChunks
    .filter((chunk) => chunk.rawBytes > budget.dynamicChunk.warningRawBytes)
    .map((chunk) => ({ name: "dynamic chunk raw", source: chunk.source, actual: chunk.rawBytes, warning: budget.dynamicChunk.warningRawBytes }));

  return {
    passed: checks.every((item) => item.passed),
    checks,
    warnings,
    entry: entryMetric,
    initial: { modules: initialMetrics, rawBytes: initialRawBytes, gzipBytes: initialGzipBytes, nonDefaultScreens },
    dynamicChunks,
    largestDynamicChunk: dynamicChunks[0] ?? null
  };
}

export function checkBundleBudgetFromFiles({ distDirectory, manifestPath, budgetPath }) {
  const manifest = readJson(manifestPath, "manifest");
  const budget = readJson(budgetPath, "budget configuration");
  return checkBundleBudget({ distDirectory, manifest, budget });
}

export function printBundleBudgetResult(result) {
  for (const item of result.checks) {
    const actual = item.name.includes("modules") ? String(item.actual) : formatBytes(item.actual);
    const maximum = item.name.includes("modules") ? String(item.maximum) : formatBytes(item.maximum);
    console.log(`${item.passed ? "PASS" : "FAIL"} ${item.name}: actual ${actual}, budget ${maximum}`);
  }
  console.log(`INFO initial JS: ${formatBytes(result.initial.rawBytes)} raw, ${formatBytes(result.initial.gzipBytes)} gzip, ${result.initial.modules.length} module(s)`);
  console.log(`INFO entry JS: ${result.entry.file}, ${formatBytes(result.entry.rawBytes)} raw, ${formatBytes(result.entry.gzipBytes)} gzip`);
  if (result.largestDynamicChunk) console.log(`INFO largest dynamic chunk: ${result.largestDynamicChunk.source}, ${formatBytes(result.largestDynamicChunk.rawBytes)} raw`);
  for (const warning of result.warnings) console.log(`WARN ${warning.name}: ${warning.source}, actual ${formatBytes(warning.actual)}, warning ${formatBytes(warning.warning)}`);
  if (result.initial.nonDefaultScreens.length > 0) console.log(`INFO initial non-default sources: ${result.initial.nonDefaultScreens.join(", ")}`);
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  try {
    const result = checkBundleBudgetFromFiles({
      distDirectory: resolve(root, "dist"),
      manifestPath: resolve(root, "dist", ".vite", "manifest.json"),
      budgetPath: resolve(root, "scripts", "performance", "bundle-budget.json")
    });
    printBundleBudgetResult(result);
    if (!result.passed) process.exitCode = 1;
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : "BUNDLE_BUDGET_ERROR";
    const message = error instanceof Error ? error.message : "unknown error";
    console.error(`FAIL ${code}: ${message}`);
    process.exitCode = 1;
  }
}
