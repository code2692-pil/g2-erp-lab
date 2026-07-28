import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMaintenanceConfig } from "./verify-maintenance-boundaries.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ignoredDirectories = new Set([".git", "node_modules", ".pnpm-store", "dist", "build", "artifacts", ".artifacts", "playwright-report", "test-results", "bin", "obj"]);
const sensitivePattern = /api[_-]?key|token|secret|password|connectionstring|authorization/i;

function git(args, rootDirectory) {
  try {
    return execFileSync("git", args, { cwd: rootDirectory, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).replace(/\r?\n$/, "");
  } catch {
    return "";
  }
}

function safeText(value) {
  return sensitivePattern.test(value) ? "sensitive-looking pattern detected" : value;
}

function walk(directory, files = []) {
  try {
    for (const entry of readdirSync(directory)) {
      if (ignoredDirectories.has(entry)) continue;
      const absolute = resolve(directory, entry);
      const details = statSync(absolute);
      if (details.isDirectory()) walk(absolute, files);
      else files.push(absolute);
    }
  } catch {
    // Collection remains best-effort and reports a warning rather than failing a project gate.
  }
  return files;
}

export function stableSignalId(category, title, evidence, affectedPaths) {
  const input = [category, title, evidence, ...[...affectedPaths].sort()].join("|");
  return `signal-${createHash("sha256").update(input).digest("hex").slice(0, 14)}`;
}

export function detectSourceMarkers(text) {
  return {
    todoOrFixme: /\b(TODO|FIXME)\b/.test(text),
    isolatedTest: /\.(only|skip)\s*\(/.test(text),
    diagnostic: /\b(console\.log|debugger|GATE\d+-DIAG)\b/.test(text),
    sensitive: sensitivePattern.test(text)
  };
}

function findFilesWithMarker(files, rootDirectory, marker) {
  const results = [];
  for (const file of files) {
    try {
      if (statSync(file).size > 1_000_000) continue;
      const content = readFileSync(file, "utf8");
      if (marker(content)) results.push(relative(rootDirectory, file).replaceAll("\\", "/"));
    } catch {
      // Unreadable generated files are intentionally ignored.
    }
  }
  return results;
}

function signal({ category, title, evidence, source, confidence, affectedPaths, detectedAt, kind }) {
  return {
    id: stableSignalId(category, title, evidence, affectedPaths),
    category,
    title,
    evidence: safeText(evidence),
    source,
    confidence,
    affectedPaths,
    detectedAt,
    kind
  };
}

function statusEntries(statusText) {
  return statusText.split(/\r?\n/).filter(Boolean).map((line) => ({
    code: line.slice(0, 2),
    path: line.slice(3).split(" -> ").at(-1).replaceAll("\\", "/")
  }));
}

function isProtectedPath(path) {
  return /^(server|database|src\/api)\//.test(path) || /\.sql$/i.test(path) || /Dto.*\.cs$/i.test(path) || /\/Contracts\//.test(path);
}

export function collectMaintenanceSignals({ rootDirectory = root, now = new Date().toISOString() } = {}) {
  const config = loadMaintenanceConfig(rootDirectory);
  const collectionWarnings = [];
  let packageJson = { scripts: {} };
  try { packageJson = JSON.parse(readFileSync(resolve(rootDirectory, "package.json"), "utf8")); } catch { collectionWarnings.push("package.json could not be read"); }
  const files = walk(rootDirectory);
  const applicationOrTestFiles = files.filter((file) => /^(src|tests)\//.test(relative(rootDirectory, file).replaceAll("\\", "/")) && /\.[cm]?[jt]sx?$/.test(file));
  const statusText = git(["status", "--porcelain", "--untracked-files=all"], rootDirectory);
  const entries = statusEntries(statusText);
  const stagedFiles = entries.filter((entry) => entry.code[0] !== " " && entry.code[0] !== "?").map((entry) => entry.path);
  const untrackedFiles = entries.filter((entry) => entry.code === "??").map((entry) => entry.path);
  const dirtyFiles = entries.filter((entry) => entry.code !== "??").map((entry) => entry.path);
  const diffPaths = git(["diff", "--name-only", "HEAD"], rootDirectory).split(/\r?\n/).filter(Boolean);
  const changedPaths = [...new Set([...dirtyFiles, ...stagedFiles, ...untrackedFiles, ...diffPaths])];
  const branch = git(["branch", "--show-current"], rootDirectory);
  const head = git(["rev-parse", "HEAD"], rootDirectory);
  const aheadBehind = git(["rev-list", "--left-right", "--count", "origin/main...HEAD"], rootDirectory).split(/\s+/).filter(Boolean);
  const recentCommits = git(["log", "--oneline", "-n", "10"], rootDirectory).split(/\r?\n/).filter(Boolean).map(safeText);
  const todoPaths = findFilesWithMarker(applicationOrTestFiles, rootDirectory, (text) => detectSourceMarkers(text).todoOrFixme);
  const isolatedTestPaths = findFilesWithMarker(applicationOrTestFiles, rootDirectory, (text) => detectSourceMarkers(text).isolatedTest);
  const diagnosticPaths = findFilesWithMarker(applicationOrTestFiles, rootDirectory, (text) => detectSourceMarkers(text).diagnostic);
  const sensitivePaths = findFilesWithMarker(applicationOrTestFiles, rootDirectory, (text) => detectSourceMarkers(text).sensitive);
  const protectedPaths = changedPaths.filter(isProtectedPath);
  const dependencyPaths = changedPaths.filter((path) => /(^|\/)(package\.json|pnpm-lock\.yaml)$/.test(path));
  const requiredDocuments = ["docs/quality-gates.md", "docs/known-limitations.md", "docs/report-evidence/ai-maintenance-summary.md"];
  const missingDocuments = requiredDocuments.filter((path) => !existsSync(resolve(rootDirectory, path)));
  const availableChecks = Object.keys(packageJson.scripts ?? {}).filter((name) => /test|build|typecheck|qa:/.test(name));
  const signals = [];

  if (statusText) signals.push(signal({ category: "Yellow", title: "Uncommitted maintenance changes", evidence: `${changedPaths.length} changed path(s) require review before PREDEVELOP.`, source: "git status", confidence: "high", affectedPaths: changedPaths, detectedAt: now, kind: "working-tree" }));
  if (todoPaths.length) signals.push(signal({ category: "Green", title: "TODO or FIXME markers", evidence: `${todoPaths.length} source or test file(s) contain TODO/FIXME markers.`, source: "static scan", confidence: "medium", affectedPaths: todoPaths, detectedAt: now, kind: "todo" }));
  if (isolatedTestPaths.length) signals.push(signal({ category: "Green", title: "Isolated test markers", evidence: `${isolatedTestPaths.length} test file(s) contain test.only or test.skip.`, source: "static scan", confidence: "high", affectedPaths: isolatedTestPaths, detectedAt: now, kind: "test-isolation" }));
  if (diagnosticPaths.length) signals.push(signal({ category: "Green", title: "Diagnostic code markers", evidence: `${diagnosticPaths.length} source or test file(s) contain diagnostic markers.`, source: "static scan", confidence: "medium", affectedPaths: diagnosticPaths, detectedAt: now, kind: "diagnostic" }));
  if (sensitivePaths.length) signals.push(signal({ category: "Red", title: "Sensitive information pattern", evidence: `Sensitive-looking information pattern detected in ${sensitivePaths.length} source or test file(s).`, source: "static scan", confidence: "medium", affectedPaths: sensitivePaths, detectedAt: now, kind: "sensitive" }));
  if (protectedPaths.length) signals.push(signal({ category: "Red", title: "Protected path change", evidence: `${protectedPaths.length} API, DTO, DB, or SQL protected path(s) changed.`, source: "git diff", confidence: "high", affectedPaths: protectedPaths, detectedAt: now, kind: "protected-path" }));
  if (dependencyPaths.length) signals.push(signal({ category: "Yellow", title: "Dependency manifest change", evidence: `${dependencyPaths.length} dependency manifest path(s) changed.`, source: "git diff", confidence: "high", affectedPaths: dependencyPaths, detectedAt: now, kind: "dependency" }));
  if (missingDocuments.length) signals.push(signal({ category: "Green", title: "Maintenance documentation gap", evidence: `${missingDocuments.length} required maintenance document(s) are missing.`, source: "document check", confidence: "high", affectedPaths: missingDocuments, detectedAt: now, kind: "documentation" }));
  signals.push(signal({ category: "Green", title: "Verification command inventory", evidence: `${availableChecks.length} existing verification command(s) are available.`, source: "package.json", confidence: "high", affectedPaths: ["package.json"], detectedAt: now, kind: "verification-inventory" }));

  return {
    generatedAt: now,
    configuration: { mode: config.mode, freezeAt: config.freezeAt, maxCandidatesPerRun: config.maxCandidatesPerRun },
    git: { branch, head, originMainAhead: Number(aheadBehind[1] ?? 0), originMainBehind: Number(aheadBehind[0] ?? 0), dirtyFiles, stagedFiles, untrackedFiles, changedPaths, recentCommits },
    testCommands: availableChecks,
    artifactPresence: { playwrightReport: existsSync(resolve(rootDirectory, "playwright-report")), testResults: existsSync(resolve(rootDirectory, "test-results")) },
    collectionWarnings,
    signals
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(collectMaintenanceSignals(), null, 2));
}
