import { spawn } from "node:child_process";
import { existsSync, rmSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { inspectTestCleanup, removePlaywrightArtifacts, reportTestCleanup } from "./qa/check-test-cleanup.mjs";

const [action, mode] = process.argv.slice(2);
const host = "127.0.0.1";
const frontendUrl = `http://${host}:5173`;
const backendUrl = `http://${host}:5080`;
const isApi = mode !== "mock";
const isSqlServer = mode === "sqlserver";
const children = [];
const e2eDirectory = resolve("tests", "e2e");

function removeManagedSessionFile() {
  const sessionFile = process.env.G2ERP_SESSION_FILE;
  if (!sessionFile) return;
  try { rmSync(sessionFile, { force: true }); } catch { /* process shutdown must remain best-effort */ }
}

process.once("exit", removeManagedSessionFile);

function selectedTestFile() {
  const requestedFile = process.env.PLAYWRIGHT_TEST_FILE;
  if (!requestedFile) return null;

  const resolvedFile = resolve(requestedFile);
  const relativeFile = relative(e2eDirectory, resolvedFile);
  const isE2eSpec = relativeFile && !relativeFile.startsWith(`..${sep}`) && relativeFile !== ".." && resolvedFile.endsWith(".spec.ts");
  if (!isE2eSpec || !existsSync(resolvedFile) || !statSync(resolvedFile).isFile()) {
    throw new Error("PLAYWRIGHT_TEST_FILE must reference an existing .spec.ts file under tests/e2e.");
  }

  return relative(process.cwd(), resolvedFile).split(sep).join("/");
}

function start(command, args, env) {
  const child = spawn(command, args, { stdio: "inherit", windowsHide: true, env: { ...process.env, ...env } });
  children.push(child);
  console.log(`[test-lifecycle] started PID ${child.pid}: ${command}`);
  return child;
}

function openBrowserWhenRequested(url) {
  if (action !== "dev" || process.env.G2ERP_OPEN_BROWSER !== "true") return;
  const command = process.platform === "win32" ? "explorer.exe" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = [url];
  const browser = spawn(command, args, { detached: true, stdio: "ignore", windowsHide: true });
  browser.once("error", () => {});
  browser.unref();
  console.log(`Opening browser: ${url}`);
}

async function waitFor(url, label) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try { if ((await fetch(url)).ok) return; } catch { /* still starting */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`${label} did not start within 60 seconds.`);
}

async function waitForExit(child, label) {
  const code = await new Promise(resolve => child.once("exit", exitCode => resolve(exitCode ?? 1)));
  if (code !== 0) throw new Error(`${label} exited with code ${code}.`);
}

async function warmFrontendForParallelRun() {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: true });

  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(frontendUrl, { waitUntil: "domcontentloaded" });
    await page.getByTestId("page-title").waitFor();
    await page.getByTestId("btn-search").click();
    await page.getByTestId("sales-order-header-grid-row-1000::SO2026070001").waitFor();

    await page.getByTestId("nav-purchase-order").click();
    await page.getByTestId("purchase-page-title").waitFor();
    await page.getByTestId("po-btn-search").click();
    await page.getByTestId("purchase-header-grid-row-1000::PO2026070001").waitFor();

    await page.getByTestId("nav-work-order").click();
    await page.getByTestId("work-order-page-title").waitFor();
    await page.getByTestId("wo-btn-new").click();
    await page.getByTestId("work-order-header-grid-row-1000::TEMP-WO-001").waitFor();

    await page.getByTestId("nav-development-data").click();
    await page.getByTestId("development-data-page-title").waitFor();
    await page.getByTestId("tdm-btn-preview-all").click();
    await page.getByTestId("tdm-preview-result").waitFor();
  } finally {
    await browser.close();
  }

  console.log("[test-lifecycle] frontend and lookup paths warmed before the parallel run.");
}

function orderTestFiles(testFiles) {
  const order = process.env.PLAYWRIGHT_TEST_ORDER ?? "default";
  if (order === "default") return testFiles;
  if (order === "reverse") return [...testFiles].reverse();
  throw new Error("PLAYWRIGHT_TEST_ORDER must be either default or reverse.");
}

async function stop(child) {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  const exited = new Promise(resolve => child.once("exit", resolve));
  child.kill();
  const result = await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 5_000))]);
  const stopped = result !== undefined || child.exitCode !== null || child.signalCode !== null;
  if (!stopped) console.error(`[test-lifecycle] graceful shutdown did not finish for PID ${child.pid}.`);
  return stopped;
}

async function main() {
  if (!['dev', 'test'].includes(action) || !['mock', 'inmemory', 'sqlserver'].includes(mode)) throw new Error("Usage: node scripts/run-mode.mjs <dev|test> <mock|inmemory|sqlserver>");
  if (action === "test") {
    const artifactFailures = removePlaywrightArtifacts();
    for (const failure of artifactFailures) console.error(`[test-lifecycle] pre-run artifact cleanup failed: ${failure}`);
    if (artifactFailures.length) process.exitCode = 1;
  }
  if (isApi) {
    const apiEnv = isSqlServer
      ? { RepositoryMode: "SqlServer", ASPNETCORE_ENVIRONMENT: "Development", G2ERP_POC_ALLOW_UNENCRYPTED_LOCAL: "true", ConnectionStrings__G2Erp: "Server=.;Database=G2ERP_DEV_LOCAL_TEST;Trusted_Connection=True;Encrypt=False;TrustServerCertificate=True" }
      : { RepositoryMode: "InMemory", ASPNETCORE_ENVIRONMENT: "Development" };
    start("dotnet", ["run", "--project", "server/G2Erp.Api/G2Erp.Api.csproj", "--urls", backendUrl], apiEnv);
    await waitFor(`${backendUrl}/api/purchase-orders`, "ASP.NET API");
  }
  const frontendEnv = isApi ? { VITE_DATA_MODE: "api", VITE_API_BASE_URL: backendUrl } : { VITE_DATA_MODE: "mock" };
  if (action === "test") {
    const build = start(process.execPath, ["./node_modules/vite/bin/vite.js", "build", "--mode", "e2e"], { ...frontendEnv, VITE_E2E_TEST_MODE: "true" });
    await waitForExit(build, "Vite production build");
    start(process.execPath, ["./node_modules/vite/bin/vite.js", "preview", "--host", host, "--port", "5173"], frontendEnv);
  } else {
    start(process.execPath, ["./node_modules/vite/bin/vite.js", "--host", host, "--port", "5173"], frontendEnv);
  }
  await waitFor(frontendUrl, "Vite");
  console.log(`Mode: ${mode}`); console.log(`Frontend: ${frontendUrl}`); console.log(`Backend: ${isApi ? backendUrl : "not started"}`); console.log(`Repository: ${isSqlServer ? "SqlServer (localhost / G2ERP_DEV_LOCAL_TEST)" : isApi ? "InMemory" : "Mock"}`);
  openBrowserWhenRequested(frontendUrl);
  if (action === "test") {
    console.log("[test-lifecycle] frontend production bundle prepared before the parallel run.");
    await warmFrontendForParallelRun();
    const selectedFile = selectedTestFile();
    const testFiles = orderTestFiles(selectedFile
      ? [selectedFile]
      : isApi
        ? ["tests/e2e/api-mode.spec.ts", "tests/e2e/work-order-api-mode.spec.ts", "tests/e2e/work-order-api-validation.spec.ts", "tests/e2e/development-data.spec.ts"]
        : ["tests/e2e/sales-order.spec.ts", "tests/e2e/purchase-order.spec.ts", "tests/e2e/work-order.spec.ts", "tests/e2e/development-data.spec.ts"]);
    const grepArgs = process.env.PLAYWRIGHT_GREP ? ["--grep", process.env.PLAYWRIGHT_GREP] : [];
    const workerArgs = process.env.PLAYWRIGHT_WORKERS ? ["--workers", process.env.PLAYWRIGHT_WORKERS] : [];
    const headedArgs = process.env.PLAYWRIGHT_HEADED === "true" ? ["--headed"] : [];
    const testArgs = [
      "./node_modules/@playwright/test/cli.js",
      "test",
      ...grepArgs,
      ...workerArgs,
      ...headedArgs,
      ...testFiles
    ];
    const test = start(process.execPath, testArgs, { CI: "true", ...(isApi ? { VITE_DATA_MODE: "api", VITE_API_BASE_URL: backendUrl } : { VITE_DATA_MODE: "mock" }) });
    process.exitCode = await new Promise(resolve => test.once("exit", code => resolve(code ?? 1)));
  } else await new Promise(resolve => {
    const stop = () => resolve();
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
    process.once("SIGHUP", stop);
  });
}

try { await main(); } finally {
  const trackedPids = children.map((child) => child.pid).filter(Number.isInteger);
  const stopResults = await Promise.all(children.reverse().map(stop));
  const runFailed = process.exitCode !== undefined && process.exitCode !== 0;
  const artifactFailures = !runFailed ? removePlaywrightArtifacts() : [];
  for (const failure of artifactFailures) console.error(`[test-lifecycle] post-run artifact cleanup failed: ${failure}`);
  const cleanupPassed = reportTestCleanup(inspectTestCleanup({
    pids: trackedPids,
    allowArtifacts: runFailed
  }));
  if (stopResults.some((stopped) => !stopped) || artifactFailures.length || !cleanupPassed) process.exitCode = 1;
  removeManagedSessionFile();
}
