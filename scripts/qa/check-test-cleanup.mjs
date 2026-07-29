import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";

export const playwrightArtifactDirectories = [
  "test-results",
  "playwright-report",
  ".artifacts/playwright/test-results",
  ".artifacts/playwright/report"
];

function hasEntries(directory) {
  return existsSync(directory) && readdirSync(directory).length > 0;
}

function listeningTestPorts() {
  if (process.platform !== "win32") return [];

  const output = execFileSync("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8" });
  return output
    .split(/\r?\n/)
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length >= 5 && parts[0].toUpperCase() === "TCP" && parts[3].toUpperCase() === "LISTENING")
    .filter((parts) => /:(5173|5080)$/.test(parts[1]))
    .map((parts) => ({ port: Number(parts[1].match(/:(\d+)$/)?.[1]), pid: Number(parts[4]) }));
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error && typeof error === "object" && "code" in error && error.code === "EPERM";
  }
}

export function removePlaywrightArtifacts() {
  const failures = [];
  for (const directory of playwrightArtifactDirectories) {
    try {
      if (existsSync(directory)) rmSync(directory, { recursive: true });
    } catch (error) {
      failures.push(`${directory}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return failures;
}

export function inspectTestCleanup({ pids = [], allowArtifacts = false } = {}) {
  const residualPids = [...new Set(pids.filter(Number.isInteger))].filter(isProcessAlive);
  const residualArtifacts = allowArtifacts
    ? []
    : playwrightArtifactDirectories.filter(hasEntries);
  const listeningPorts = listeningTestPorts();
  return {
    clean: residualPids.length === 0 && listeningPorts.length === 0 && residualArtifacts.length === 0,
    residualPids,
    listeningPorts,
    residualArtifacts
  };
}

export function reportTestCleanup(result) {
  if (result.clean) {
    console.log("[test-cleanup] PASS: tracked process, ports, and managed artifacts are clean.");
    return true;
  }

  if (result.residualPids.length) console.error(`[test-cleanup] residual tracked PID(s): ${result.residualPids.join(", ")}`);
  if (result.listeningPorts.length) console.error(`[test-cleanup] listening test port(s): ${result.listeningPorts.map(({ port, pid }) => `${port} (PID ${pid})`).join(", ")}`);
  if (result.residualArtifacts.length) console.error(`[test-cleanup] residual managed artifact directory(ies): ${result.residualArtifacts.join(", ")}`);
  return false;
}

if (process.argv[1]?.endsWith("check-test-cleanup.mjs")) {
  const cleanArtifacts = process.argv.includes("--clean-artifacts");
  const allowArtifacts = process.argv.includes("--allow-artifacts");
  const pids = process.argv.flatMap((argument, index, argumentsList) => argument === "--pid" ? [Number(argumentsList[index + 1])] : []);
  const cleanupFailures = cleanArtifacts ? removePlaywrightArtifacts() : [];
  for (const failure of cleanupFailures) console.error(`[test-cleanup] artifact cleanup failed: ${failure}`);
  const clean = cleanupFailures.length === 0 && reportTestCleanup(inspectTestCleanup({ pids, allowArtifacts }));
  if (!clean) process.exitCode = 1;
}
