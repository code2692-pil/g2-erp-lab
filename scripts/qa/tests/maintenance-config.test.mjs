import assert from "node:assert/strict";
import test from "node:test";
import { loadMaintenanceConfig } from "../verify-maintenance-boundaries.mjs";

test("maintenance config has valid policy keys", () => {
  const config = loadMaintenanceConfig();
  assert.equal(config.mode, "ACTIVE");
  assert.ok(config.allowedModes.includes(config.mode));
  assert.ok(!Number.isNaN(new Date(config.freezeAt).valueOf()));
  assert.deepEqual(config.allowedRiskLevels, ["Green", "Yellow", "Red"]);
  assert.equal(config.maxCandidatesPerRun, 10);
  assert.equal(config.maxPredevelopmentsPerRun, 2);
  assert.equal(config.predevelopmentPolicy.Red, "prohibited");
  assert.ok(config.protectedPaths.length > 0);
  assert.ok(config.requiredChecks.quick.length > 0);
});
