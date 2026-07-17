import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

const [action, mode] = process.argv.slice(2);
const host = "127.0.0.1";
const frontendUrl = `http://${host}:5173`;
const backendUrl = `http://${host}:5080`;
const isApi = mode !== "mock";
const isSqlServer = mode === "sqlserver";
const children = [];
const e2eDirectory = resolve("tests", "e2e");

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
  return child;
}

async function waitFor(url, label) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    try { if ((await fetch(url)).ok) return; } catch { /* still starting */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`${label} did not start within 60 seconds.`);
}

async function stop(child) {
  if (child.exitCode !== null || child.killed) return;
  child.kill();
  await Promise.race([new Promise(resolve => child.once("exit", resolve)), new Promise(resolve => setTimeout(resolve, 5_000))]);
}

async function main() {
  if (!['dev', 'test'].includes(action) || !['mock', 'inmemory', 'sqlserver'].includes(mode)) throw new Error("Usage: node scripts/run-mode.mjs <dev|test> <mock|inmemory|sqlserver>");
  if (isApi) {
    const apiEnv = isSqlServer
      ? { RepositoryMode: "SqlServer", ASPNETCORE_ENVIRONMENT: "Development", G2ERP_POC_ALLOW_UNENCRYPTED_LOCAL: "true", ConnectionStrings__G2Erp: "Server=.;Database=G2ERP_DEV_LOCAL_TEST;Trusted_Connection=True;Encrypt=False;TrustServerCertificate=True" }
      : { RepositoryMode: "InMemory", ASPNETCORE_ENVIRONMENT: "Development" };
    start("dotnet", ["run", "--project", "server/G2Erp.Api/G2Erp.Api.csproj", "--urls", backendUrl], apiEnv);
    await waitFor(`${backendUrl}/api/purchase-orders`, "ASP.NET API");
  }
  start(process.execPath, ["./node_modules/vite/bin/vite.js", "--host", host, "--port", "5173"], isApi ? { VITE_DATA_MODE: "api", VITE_API_BASE_URL: backendUrl } : { VITE_DATA_MODE: "mock" });
  await waitFor(frontendUrl, "Vite");
  console.log(`Mode: ${mode}`); console.log(`Frontend: ${frontendUrl}`); console.log(`Backend: ${isApi ? backendUrl : "not started"}`); console.log(`Repository: ${isSqlServer ? "SqlServer (localhost / G2ERP_DEV_LOCAL_TEST)" : isApi ? "InMemory" : "Mock"}`);
  if (action === "test") {
    const selectedFile = selectedTestFile();
    const testFiles = selectedFile
      ? [selectedFile]
      : isApi
        ? ["tests/e2e/api-mode.spec.ts", "tests/e2e/work-order-api-mode.spec.ts", "tests/e2e/work-order-api-validation.spec.ts"]
        : ["tests/e2e/sales-order.spec.ts", "tests/e2e/purchase-order.spec.ts", "tests/e2e/work-order.spec.ts"];
    const grepArgs = process.env.PLAYWRIGHT_GREP ? ["--grep", process.env.PLAYWRIGHT_GREP] : [];
    const testArgs = [
      "./node_modules/@playwright/test/cli.js",
      "test",
      ...grepArgs,
      ...testFiles
    ];
    const test = start(process.execPath, testArgs, { CI: "true", ...(isApi ? { VITE_DATA_MODE: "api", VITE_API_BASE_URL: backendUrl } : { VITE_DATA_MODE: "mock" }) });
    process.exitCode = await new Promise(resolve => test.once("exit", code => resolve(code ?? 1)));
  } else await new Promise(resolve => process.once("SIGINT", resolve));
}

try { await main(); } finally { await Promise.all(children.reverse().map(stop)); }
