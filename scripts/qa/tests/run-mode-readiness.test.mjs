import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { collectInitialAssetUrls, verifyApiReadiness, verifyFrontendReadiness, waitForReadiness } from "../../run-mode-readiness.mjs";

function response(body, { status = 200, contentType = "application/json" } = {}) {
  return new Response(body, { status, headers: { "content-type": contentType } });
}

test("frontend readiness rejects an unopened frontend port", async () => {
  await assert.rejects(
    () => verifyFrontendReadiness("http://127.0.0.1:5173", { fetchImpl: async () => { throw new TypeError("fetch failed"); } }),
    /fetch failed/
  );
});

test("frontend readiness rejects an index whose entry script is missing", async () => {
  const calls = [];
  await assert.rejects(
    () => verifyFrontendReadiness("http://127.0.0.1:5173", {
      fetchImpl: async (url) => {
        calls.push(url);
        return url.endsWith("/") || url.endsWith("5173")
          ? response('<div id="root"></div><script type="module" src="/assets/index.js"></script>', { contentType: "text/html" })
          : response("missing", { status: 404, contentType: "text/plain" });
      }
    }),
    /HTTP 404/
  );
  assert.equal(calls.length, 2);
});

test("frontend readiness accepts application root, JavaScript, and CSS assets", async () => {
  const calls = [];
  await verifyFrontendReadiness("http://127.0.0.1:5173", {
    fetchImpl: async (url) => {
      calls.push(url);
      if (url.endsWith("5173")) return response('<div id="root"></div><script type="module" src="\\assets\\index.js"></script><link rel="stylesheet" href="/assets/index.css">', { contentType: "text/html" });
      if (url.endsWith("index.js")) return response("export {};", { contentType: "text/javascript" });
      return response("body {}", { contentType: "text/css" });
    }
  });
  assert.deepEqual(calls, ["http://127.0.0.1:5173", "http://127.0.0.1:5173/assets/index.js", "http://127.0.0.1:5173/assets/index.css"]);
});

test("API readiness rejects a port that does not return the status JSON document", async () => {
  await assert.rejects(
    () => verifyApiReadiness("http://127.0.0.1:5080/api/development-data/status", { fetchImpl: async () => response("not-json", { contentType: "text/plain" }) }),
    /did not return JSON/
  );
});

test("API readiness requires two successful status JSON responses without mutations", async () => {
  const calls = [];
  await verifyApiReadiness("http://127.0.0.1:5080/api/development-data/status", {
    fetchImpl: async (url, options) => {
      calls.push({ url, method: options?.method ?? "GET" });
      return response(JSON.stringify({ RepositoryMode: "InMemory", IsAllowed: true }));
    }
  });
  assert.deepEqual(calls, [
    { url: "http://127.0.0.1:5080/api/development-data/status", method: "GET" },
    { url: "http://127.0.0.1:5080/api/development-data/status", method: "GET" }
  ]);
});

test("readiness timeout preserves the last error and clears its timer", async () => {
  let clock = 0;
  let cleared = false;
  await assert.rejects(
    () => waitForReadiness({
      label: "Vite",
      timeoutMs: 20,
      pollIntervalMs: 10,
      now: () => clock,
      delay: async () => { clock += 10; },
      setTimer: () => "timer",
      clearTimer: (timer) => { cleared = timer === "timer"; },
      check: async () => { throw new Error("asset unavailable"); }
    }),
    /Vite did not start within 20ms\. Last error: asset unavailable/
  );
  assert.equal(cleared, true);
});

test("readiness polling stops as soon as the managed process exits", async () => {
  const child = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  let checks = 0;
  await assert.rejects(
    () => waitForReadiness({
      label: "API",
      child,
      timeoutMs: 100,
      now: () => 0,
      delay: async () => { child.exitCode = 7; child.emit("exit", 7); },
      setTimer: () => "timer",
      clearTimer: () => {},
      check: async () => { checks += 1; throw new Error("not ready"); }
    }),
    /API process stopped before readiness \(exit code 7\)/
  );
  assert.equal(checks, 1);
});

test("Windows-style asset references resolve to the frontend origin", () => {
  assert.deepEqual(
    collectInitialAssetUrls("http://127.0.0.1:5173", '<div id="root"></div><script src="\\assets\\index.js"></script>'),
    [{ kind: "script", url: "http://127.0.0.1:5173/assets/index.js" }]
  );
});
