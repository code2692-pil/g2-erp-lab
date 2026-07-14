import { spawn } from "node:child_process";

const host = "127.0.0.1";
const port = 5173;
const baseUrl = `http://${host}:${port}`;

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

const vite = spawn(process.execPath, ["./node_modules/vite/bin/vite.js", "--host", host, "--port", String(port)], {
  stdio: "inherit",
  windowsHide: true
});

let shuttingDown = false;
async function stopVite() {
  if (shuttingDown || vite.exitCode !== null) return;
  shuttingDown = true;
  vite.kill("SIGTERM");
  await waitForExit(vite);
}

try {
  await waitForVite();
  const playwright = spawn(process.execPath, ["./node_modules/@playwright/test/cli.js", "test"], {
    stdio: "inherit",
    windowsHide: true,
    env: { ...process.env, CI: "true" }
  });
  process.exitCode = await waitForExit(playwright);
} finally {
  await stopVite();
}
