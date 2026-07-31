import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const sensitivePattern = /api[_-]?key|token|secret|password|connectionstring|authorization/i;

export function loadMaintenanceConfig(rootDirectory = root) {
  return JSON.parse(readFileSync(resolve(rootDirectory, "config", "ai-maintenance.json"), "utf8"));
}

function normalizePath(value) {
  return value.replaceAll("\\", "/").replace(/^\.\//, "");
}

function matchesPath(path, pattern) {
  const normalized = normalizePath(path);
  if (pattern.endsWith("/**")) return normalized.startsWith(pattern.slice(0, -2));
  if (pattern === "**/*.sql") return normalized.toLowerCase().endsWith(".sql");
  if (pattern === "**/*Dto*.cs") return /Dto.*\.cs$/i.test(normalized);
  if (pattern === "**/Contracts/**") return normalized.split("/").includes("Contracts");
  if (pattern.endsWith(".*")) return normalized.startsWith(pattern.slice(0, -1));
  return normalized === pattern;
}

export function redactSensitiveText(value) {
  return sensitivePattern.test(value) ? "sensitive-looking input" : value;
}

export function evaluateMaintenanceBoundary(input, config) {
  const mode = String(input.mode ?? "ANALYZE").toUpperCase();
  const category = input.category ?? "Green";
  const branch = input.branch ?? "";
  const dirty = Boolean(input.dirty);
  const now = new Date(input.now ?? new Date().toISOString());
  const changedPaths = [...new Set((input.changedPaths ?? []).map(normalizePath))];
  const command = input.command ?? "";
  const frozen = config.mode === "FREEZE" || now >= new Date(config.freezeAt);
  const protectedPaths = changedPaths.filter((path) => config.protectedPaths.some((rule) => matchesPath(path, rule.pattern)));
  const forbiddenPaths = changedPaths.filter((path) => config.forbiddenPaths.some((pattern) => matchesPath(path, pattern)));
  const warnings = [];
  const blockedBy = [];
  const commandBlocked = config.forbiddenCommands.some((name) => new RegExp(`\\b${name}\\b`, "i").test(command));

  if (!["ANALYZE", "PREDEVELOP"].includes(mode)) blockedBy.push("invalid-mode");
  if (!config.allowedRiskLevels.includes(category)) blockedBy.push("invalid-risk-level");
  if (commandBlocked) blockedBy.push("forbidden-command");
  if (sensitivePattern.test(command)) blockedBy.push("sensitive-input");

  const risks = [
    ["main-branch", /^(main|master)$/i.test(branch)],
    ["dirty-working-tree", dirty],
    ["freeze-active", frozen],
    ["protected-path", protectedPaths.length > 0],
    ["forbidden-path", forbiddenPaths.length > 0],
    ["red-risk", category === "Red"]
  ];

  if (mode === "ANALYZE") {
    for (const [reason, active] of risks) if (active) warnings.push(reason);
  }

  if (mode === "PREDEVELOP") {
    for (const [reason, active] of risks) if (active) blockedBy.push(reason);
    if (category === "Yellow" && !input.yellowApproved) blockedBy.push("yellow-human-approval-required");
    if (input.checksPassed === false) blockedBy.push("required-checks-not-passed");
  }

  return {
    ok: blockedBy.length === 0,
    mode,
    branch,
    category,
    policyMode: config.mode,
    frozen,
    dirty,
    changedPathCount: changedPaths.length,
    protectedPathCount: protectedPaths.length,
    warnings,
    blockedBy: [...new Set(blockedBy)],
    predevelopmentEligible: mode === "PREDEVELOP" && blockedBy.length === 0,
    evidence: {
      protectedPathDetected: protectedPaths.length > 0,
      forbiddenPathDetected: forbiddenPaths.length > 0,
      sensitiveInformationPatternDetected: sensitivePattern.test(command)
    }
  };
}

function git(args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).replace(/\r?\n$/, "");
  } catch {
    return "";
  }
}

function valuesFor(name) {
  const values = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === name && process.argv[index + 1]) values.push(process.argv[index + 1]);
  }
  return values;
}

function option(name, fallback) {
  return valuesFor(name).at(-1) ?? fallback;
}

function workingTreePaths() {
  const statusLines = git(["status", "--porcelain", "--untracked-files=all"]).split(/\r?\n/).filter(Boolean);
  const paths = statusLines.map((line) => normalizePath(line.slice(3).split(" -> ").at(-1)));
  const diffPaths = git(["diff", "--name-only", "HEAD"]).split(/\r?\n/).filter(Boolean).map(normalizePath);
  return { dirty: statusLines.length > 0, paths: [...new Set([...paths, ...diffPaths])] };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = loadMaintenanceConfig();
  const state = workingTreePaths();
  const explicitPaths = valuesFor("--path");
  const result = evaluateMaintenanceBoundary({
    mode: option("--mode", "ANALYZE"),
    category: option("--category", "Green"),
    branch: option("--branch", git(["branch", "--show-current"])),
    dirty: state.dirty,
    changedPaths: explicitPaths.length ? explicitPaths : state.paths,
    command: option("--command", ""),
    now: option("--now", new Date().toISOString()),
    yellowApproved: option("--yellow-approved", "false") === "true",
    checksPassed: option("--checks-passed", "true") !== "false"
  }, config);
  console.log(JSON.stringify(result, null, 2));
  if (!result.ok) process.exitCode = 1;
}
