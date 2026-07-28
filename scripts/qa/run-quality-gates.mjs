import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadMaintenanceConfig } from "./verify-maintenance-boundaries.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const config = loadMaintenanceConfig(root);
const activeChildren = new Set();

function command(label, executable, args, env = {}) {
  return { label, executable, args, env };
}

function quickCommands() {
  return [
    command("git diff --check", "git", ["diff", "--check"]),
    command("pnpm run typecheck", process.execPath, ["./node_modules/typescript/bin/tsc", "--noEmit", "-p", "tsconfig.json"]),
    command("pnpm run build", process.execPath, ["./node_modules/vite/bin/vite.js", "build"]),
    command("dotnet build server/G2Erp.sln", "dotnet", ["build", "server/G2Erp.sln"]),
    command("Mock smoke", process.execPath, ["scripts/run-mode.mjs", "test", "mock"], { PLAYWRIGHT_TEST_FILE: "tests/e2e/sales-order.spec.ts", PLAYWRIGHT_GREP: "A: 기본 화면에서 조회 후 수주정보와 수주상세를 표시한다", PLAYWRIGHT_WORKERS: "1" }),
    command("InMemory smoke", process.execPath, ["scripts/run-mode.mjs", "test", "inmemory"], { PLAYWRIGHT_TEST_FILE: "tests/e2e/api-mode.spec.ts", PLAYWRIGHT_GREP: "API mode: sales order CRUD, lookup, validation, and server amounts", PLAYWRIGHT_WORKERS: "1" })
  ];
}

function commandsFor(profile) {
  const full = [
    ...quickCommands(),
    command("Mock full", process.execPath, ["scripts/run-mode.mjs", "test", "mock"]),
    command("InMemory full", process.execPath, ["scripts/run-mode.mjs", "test", "inmemory"])
  ];
  if (profile === "quick") return quickCommands();
  if (profile === "full") return full;
  if (profile === "nightly") return [
    ...full,
    command("Nightly race contract", process.execPath, ["scripts/run-mode.mjs", "test", "inmemory"], { PLAYWRIGHT_TEST_FILE: "tests/e2e/api-mode.spec.ts", PLAYWRIGHT_GREP: "Gate 9:", PLAYWRIGHT_WORKERS: "1" }),
    command("Nightly validation contract", process.execPath, ["scripts/run-mode.mjs", "test", "mock"], { PLAYWRIGHT_TEST_FILE: "tests/e2e/sales-order.spec.ts", PLAYWRIGHT_GREP: "Validation", PLAYWRIGHT_WORKERS: "1" }),
    command("Nightly dirty guard contract", process.execPath, ["scripts/run-mode.mjs", "test", "mock"], { PLAYWRIGHT_TEST_FILE: "tests/e2e/sales-order.spec.ts", PLAYWRIGHT_GREP: "Dirty guard", PLAYWRIGHT_WORKERS: "1" }),
    command("Nightly Grid keyboard contract", process.execPath, ["scripts/run-mode.mjs", "test", "mock"], { PLAYWRIGHT_TEST_FILE: "tests/e2e/work-order.spec.ts", PLAYWRIGHT_GREP: "Gate 7: process detail Enter", PLAYWRIGHT_WORKERS: "1" }),
    command("Nightly Ctrl+V contract", process.execPath, ["scripts/run-mode.mjs", "test", "mock"], { PLAYWRIGHT_TEST_FILE: "tests/e2e/work-order.spec.ts", PLAYWRIGHT_GREP: "Ctrl\\+V", PLAYWRIGHT_WORKERS: "1" })
  ];
  throw new Error(`Unknown quality-gate profile: ${profile}`);
}

function summarize(value) {
  const compact = value.trim().replaceAll(/\s+/g, " ");
  return compact.length > 500 ? `${compact.slice(-500)}…` : compact;
}

function run(entry) {
  return new Promise((resolveRun) => {
    const startedAt = new Date().toISOString();
    const started = Date.now();
    const child = spawn(entry.executable, entry.args, { cwd: root, windowsHide: true, env: { ...process.env, ...entry.env } });
    activeChildren.add(child);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", (error) => { stderr += error.message; });
    child.once("close", (exitCode, signal) => {
      activeChildren.delete(child);
      resolveRun({ label: entry.label, startedAt, finishedAt: new Date().toISOString(), durationMs: Date.now() - started, exitCode: exitCode ?? 1, signal: signal ?? null, stdoutSummary: summarize(stdout), stderrSummary: summarize(stderr) });
    });
  });
}

function stopChildren() {
  for (const child of activeChildren) child.kill();
}

process.once("SIGINT", stopChildren);
process.once("SIGTERM", stopChildren);

export function listQualityGateCommands(profile) {
  return commandsFor(profile).map(({ label, executable, args }) => ({ label, executable, args }));
}

function readPreviousResult(outputDirectory) {
  const path = resolve(outputDirectory, "quality-gate-result.json");
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

export async function runQualityGates(profile = "quick", { dryRun = false, from = 0, to, resume = false } = {}) {
  const profileCommands = commandsFor(profile);
  const lastIndex = to ?? profileCommands.length - 1;
  if (!Number.isInteger(from) || !Number.isInteger(lastIndex) || from < 0 || lastIndex < from || lastIndex >= profileCommands.length) throw new Error("Invalid quality-gate command range.");
  const startedAt = new Date().toISOString();
  const outputDirectory = resolve(root, config.reportDirectory);
  const selectedCommands = profileCommands.slice(from, lastIndex + 1);
  const previous = resume ? readPreviousResult(outputDirectory) : null;
  const selectedLabels = new Set(selectedCommands.map((entry) => entry.label));
  const results = previous?.profile === profile
    ? (previous.results ?? []).filter((result) => !selectedLabels.has(result.label) && !result.planned)
    : [];
  for (const entry of selectedCommands) {
    if (dryRun) {
      results.push({ label: entry.label, planned: true, exitCode: null, durationMs: 0 });
      continue;
    }
    console.log(`[quality-gate] ${entry.label}`);
    const result = await run(entry);
    results.push(result);
    if (result.exitCode !== 0) break;
  }
  const failed = results.find((result) => result.exitCode !== 0 && result.exitCode !== null);
  const completed = profileCommands.every((entry) => results.some((result) => result.label === entry.label && result.exitCode === 0));
  const report = { profile, startedAt, finishedAt: new Date().toISOString(), durationMs: results.reduce((sum, result) => sum + result.durationMs, 0), requiredChecks: config.requiredChecks[profile], selectedRange: [from, lastIndex], completed, passed: completed && !failed, nextCommand: failed ? "Stop and inspect the failed command before continuing." : completed ? "All requested commands completed." : "Run the remaining fixed quality-gate command range.", results };
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(resolve(outputDirectory, "quality-gate-result.json"), `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const profile = process.argv[2] ?? "quick";
  const dryRun = process.argv.includes("--dry-run");
  const from = process.argv.indexOf("--from");
  const to = process.argv.indexOf("--to");
  const report = await runQualityGates(profile, { dryRun, resume: process.argv.includes("--resume"), from: from >= 0 ? Number(process.argv[from + 1]) : 0, to: to >= 0 ? Number(process.argv[to + 1]) : undefined });
  console.log(JSON.stringify({ profile: report.profile, completed: report.completed, passed: report.passed, resultCount: report.results.length, durationMs: report.durationMs }, null, 2));
  if (report.results.some((result) => result.exitCode !== 0 && result.exitCode !== null)) process.exitCode = 1;
}
