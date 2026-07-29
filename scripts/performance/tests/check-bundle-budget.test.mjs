import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { checkBundleBudgetFromFiles } from "../check-bundle-budget.mjs";

function budget(overrides = {}) {
  return {
    version: 1,
    entry: { maxRawBytes: 1000, maxGzipBytes: 1000 },
    initial: {
      maxRawBytes: 1500,
      maxGzipBytes: 1500,
      maxNonDefaultScreenModules: 0,
      nonDefaultScreenSources: ["src/features/purchase-order/PurchaseOrderRegistration.tsx"],
      nonDefaultScreenMarkers: { "src/features/purchase-order/PurchaseOrderRegistration.tsx": "purchase-page-title" }
    },
    dynamicChunk: { warningRawBytes: 400 },
    ...overrides
  };
}

function withFixture(t, { manifest, files, budgetConfig = budget() }, callback) {
  const root = mkdtempSync(join(tmpdir(), "g2erp-bundle-budget-"));
  const dist = resolve(root, "dist");
  const manifestPath = resolve(dist, ".vite", "manifest.json");
  const budgetPath = resolve(root, "bundle-budget.json");
  try {
    mkdirSync(resolve(dist, ".vite"), { recursive: true });
    for (const [file, contents] of Object.entries(files)) {
      const assetPath = resolve(dist, file.replaceAll("\\", "/"));
      mkdirSync(resolve(assetPath, ".."), { recursive: true });
      writeFileSync(assetPath, contents);
    }
    writeFileSync(manifestPath, JSON.stringify(manifest));
    writeFileSync(budgetPath, JSON.stringify(budgetConfig));
    return callback({ dist, manifestPath, budgetPath });
  } finally {
    rmSync(root, { recursive: true });
  }
}

function manifest({ includePurchaseInInitial = false, windowsPath = false } = {}) {
  const entryFile = windowsPath ? "assets\\entry.js" : "assets/entry.js";
  return {
    "index.html": { file: entryFile, isEntry: true, imports: includePurchaseInInitial ? ["src/features/purchase-order/PurchaseOrderRegistration.tsx"] : [] },
    "src/features/purchase-order/PurchaseOrderRegistration.tsx": { file: "assets/purchase.js", src: "src/features/purchase-order/PurchaseOrderRegistration.tsx", isDynamicEntry: !includePurchaseInInitial }
  };
}

test("bundle budget passes with a normal manifest and Windows path separators", (t) => {
  withFixture(t, { manifest: manifest({ windowsPath: true }), files: { "assets/entry.js": "entry", "assets/purchase.js": "purchase" } }, ({ dist, manifestPath, budgetPath }) => {
    const result = checkBundleBudgetFromFiles({ distDirectory: dist, manifestPath, budgetPath });
    assert.equal(result.passed, true);
    assert.equal(result.initial.modules.length, 1);
    assert.equal(result.dynamicChunks.length, 1);
  });
});

test("bundle budget fails when entry raw bytes exceed the limit", (t) => {
  withFixture(t, { manifest: manifest(), files: { "assets/entry.js": "x".repeat(50), "assets/purchase.js": "purchase" }, budgetConfig: budget({ entry: { maxRawBytes: 10, maxGzipBytes: 1000 } }) }, ({ dist, manifestPath, budgetPath }) => {
    const result = checkBundleBudgetFromFiles({ distDirectory: dist, manifestPath, budgetPath });
    assert.equal(result.passed, false);
    assert.equal(result.checks.find((item) => item.name === "entry raw")?.passed, false);
  });
});

test("bundle budget fails when entry gzip bytes exceed the limit", (t) => {
  withFixture(t, { manifest: manifest(), files: { "assets/entry.js": "entry gzip", "assets/purchase.js": "purchase" }, budgetConfig: budget({ entry: { maxRawBytes: 1000, maxGzipBytes: 1 } }) }, ({ dist, manifestPath, budgetPath }) => {
    const result = checkBundleBudgetFromFiles({ distDirectory: dist, manifestPath, budgetPath });
    assert.equal(result.passed, false);
    assert.equal(result.checks.find((item) => item.name === "entry gzip")?.passed, false);
  });
});

test("bundle budget fails when a non-default screen enters the initial dependency chain", (t) => {
  withFixture(t, { manifest: manifest({ includePurchaseInInitial: true }), files: { "assets/entry.js": "entry", "assets/purchase.js": "purchase" } }, ({ dist, manifestPath, budgetPath }) => {
    const result = checkBundleBudgetFromFiles({ distDirectory: dist, manifestPath, budgetPath });
    assert.equal(result.passed, false);
    assert.deepEqual(result.initial.nonDefaultScreens, ["src/features/purchase-order/PurchaseOrderRegistration.tsx"]);
  });
});

test("bundle budget fails when an inlined non-default screen marker is found in the entry asset", (t) => {
  withFixture(t, { manifest: manifest(), files: { "assets/entry.js": "entry purchase-page-title", "assets/purchase.js": "purchase" } }, ({ dist, manifestPath, budgetPath }) => {
    const result = checkBundleBudgetFromFiles({ distDirectory: dist, manifestPath, budgetPath });
    assert.equal(result.passed, false);
    assert.deepEqual(result.initial.nonDefaultScreens, ["src/features/purchase-order/PurchaseOrderRegistration.tsx"]);
  });
});

test("bundle budget reports an oversized dynamic chunk as a warning without failing the baseline", (t) => {
  withFixture(t, { manifest: manifest(), files: { "assets/entry.js": "entry", "assets/purchase.js": "x".repeat(50) }, budgetConfig: budget({ dynamicChunk: { warningRawBytes: 10 } }) }, ({ dist, manifestPath, budgetPath }) => {
    const result = checkBundleBudgetFromFiles({ distDirectory: dist, manifestPath, budgetPath });
    assert.equal(result.passed, true);
    assert.equal(result.warnings.length, 1);
  });
});

test("bundle budget fails with a clear error when the manifest is missing", (t) => {
  const root = mkdtempSync(join(tmpdir(), "g2erp-bundle-budget-missing-"));
  try {
    const budgetPath = resolve(root, "bundle-budget.json");
    writeFileSync(budgetPath, JSON.stringify(budget()));
    assert.throws(() => checkBundleBudgetFromFiles({ distDirectory: resolve(root, "dist"), manifestPath: resolve(root, "dist", ".vite", "manifest.json"), budgetPath }), { code: "MANIFEST_MISSING" });
  } finally {
    rmSync(root, { recursive: true });
  }
});

test("bundle budget fails with a clear error for invalid configuration", (t) => {
  withFixture(t, { manifest: manifest(), files: { "assets/entry.js": "entry", "assets/purchase.js": "purchase" }, budgetConfig: { version: 1, entry: {}, initial: {}, dynamicChunk: {} } }, ({ dist, manifestPath, budgetPath }) => {
    assert.throws(() => checkBundleBudgetFromFiles({ distDirectory: dist, manifestPath, budgetPath }), { code: "BUDGET_INVALID" });
  });
});
