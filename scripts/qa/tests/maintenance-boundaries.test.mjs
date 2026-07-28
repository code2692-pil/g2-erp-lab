import assert from "node:assert/strict";
import test from "node:test";
import { evaluateMaintenanceBoundary, loadMaintenanceConfig } from "../verify-maintenance-boundaries.mjs";

const config = loadMaintenanceConfig();
const activeNow = "2026-07-28T12:00:00+09:00";
const cleanGreen = { branch: "feature/example", dirty: false, category: "Green", changedPaths: ["docs/example.md"], now: activeNow };

test("ANALYZE records main, dirty, freeze, Red, and protected warnings without blocking", () => {
  const result = evaluateMaintenanceBoundary({ ...cleanGreen, mode: "ANALYZE", branch: "main", dirty: true, category: "Red", changedPaths: ["server/G2Erp.Api/Contracts/ExampleDto.cs"], now: "2026-08-01T00:00:00+09:00" }, config);
  assert.equal(result.ok, true);
  assert.ok(result.warnings.includes("main-branch"));
  assert.ok(result.warnings.includes("dirty-working-tree"));
  assert.ok(result.warnings.includes("freeze-active"));
  assert.ok(result.warnings.includes("protected-path"));
  assert.ok(result.warnings.includes("red-risk"));
});

test("PREDEVELOP blocks unsafe conditions and permits a clean Green fixture", () => {
  assert.equal(evaluateMaintenanceBoundary({ ...cleanGreen, mode: "PREDEVELOP" }, config).ok, true);
  assert.ok(evaluateMaintenanceBoundary({ ...cleanGreen, mode: "PREDEVELOP", branch: "main" }, config).blockedBy.includes("main-branch"));
  assert.ok(evaluateMaintenanceBoundary({ ...cleanGreen, mode: "PREDEVELOP", dirty: true }, config).blockedBy.includes("dirty-working-tree"));
  assert.ok(evaluateMaintenanceBoundary({ ...cleanGreen, mode: "PREDEVELOP", now: "2026-08-01T00:00:00+09:00" }, config).blockedBy.includes("freeze-active"));
  assert.ok(evaluateMaintenanceBoundary({ ...cleanGreen, mode: "PREDEVELOP", category: "Red" }, config).blockedBy.includes("red-risk"));
  assert.ok(evaluateMaintenanceBoundary({ ...cleanGreen, mode: "PREDEVELOP", changedPaths: ["database/local/example.sql"] }, config).blockedBy.includes("protected-path"));
  assert.ok(evaluateMaintenanceBoundary({ ...cleanGreen, mode: "PREDEVELOP", command: "git merge feature/example" }, config).blockedBy.includes("forbidden-command"));
});

test("Yellow requires approval and sensitive input is redacted", () => {
  assert.ok(evaluateMaintenanceBoundary({ ...cleanGreen, mode: "PREDEVELOP", category: "Yellow" }, config).blockedBy.includes("yellow-human-approval-required"));
  assert.equal(evaluateMaintenanceBoundary({ ...cleanGreen, mode: "PREDEVELOP", category: "Yellow", yellowApproved: true }, config).ok, true);
  const result = evaluateMaintenanceBoundary({ ...cleanGreen, mode: "ANALYZE", command: "demo-token-value" }, config);
  assert.ok(result.blockedBy.includes("sensitive-input"));
  assert.equal(JSON.stringify(result).includes("demo-token-value"), false);
});
