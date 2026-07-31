import { spawn } from "node:child_process";
import { inspectTestCleanup, removePlaywrightArtifacts, reportTestCleanup } from "./qa/check-test-cleanup.mjs";

const host = "127.0.0.1";
const port = 5173;
const baseUrl = `http://${host}:${port}`;
const children = [];

function waitForExit(process) {
  return new Promise((resolve) => process.once("exit", (code) => resolve(code ?? 1)));
}

async function waitForVite() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Vite did not start within 120 seconds.");
}

const preRunArtifactFailures = removePlaywrightArtifacts();
preRunArtifactFailures.forEach((failure) => console.error(`[test-lifecycle] pre-run artifact cleanup failed: ${failure}`));

const vite = spawn(process.execPath, ["./node_modules/vite/bin/vite.js", "--host", host, "--port", String(port)], {
  stdio: "inherit",
  windowsHide: true
});
children.push(vite);
console.log(`[test-lifecycle] started PID ${vite.pid}: Vite`);

let shuttingDown = false;
async function stopVite() {
  if (shuttingDown || vite.exitCode !== null || vite.signalCode !== null) return true;
  shuttingDown = true;
  const exited = waitForExit(vite);
  vite.kill("SIGTERM");
  await exited;
  return true;
}

try {
  await waitForVite();
  const playwright = spawn(process.execPath, ["./node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)], {
    stdio: "inherit",
    windowsHide: true,
    env: { ...process.env, CI: "true" }
  });
  children.push(playwright);
  console.log(`[test-lifecycle] started PID ${playwright.pid}: Playwright`);
  process.exitCode = await waitForExit(playwright);
} finally {
  const trackedPids = children.map((child) => child.pid).filter(Number.isInteger);
  const stopped = await stopVite();
  const runFailed = process.exitCode !== undefined && process.exitCode !== 0;
  const artifactFailures = !runFailed ? removePlaywrightArtifacts() : [];
  for (const failure of artifactFailures) console.error(`[test-lifecycle] post-run artifact cleanup failed: ${failure}`);
  const cleanupPassed = reportTestCleanup(inspectTestCleanup({ pids: trackedPids, allowArtifacts: runFailed }));
  if (preRunArtifactFailures.length || !stopped || artifactFailures.length || !cleanupPassed) process.exitCode = 1;
}
