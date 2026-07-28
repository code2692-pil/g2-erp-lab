import assert from "node:assert/strict";
import test from "node:test";
import { detectSourceMarkers, stableSignalId } from "../collect-maintenance-signals.mjs";

test("signal IDs are stable regardless of path order", () => {
  const first = stableSignalId("Green", "Example", "Evidence", ["src/a.ts", "tests/b.spec.ts"]);
  const second = stableSignalId("Green", "Example", "Evidence", ["tests/b.spec.ts", "src/a.ts"]);
  assert.equal(first, second);
});

test("marker detection identifies fixtures without retaining values", () => {
  const markers = detectSourceMarkers("// TODO\ntest.only(() => {}); console.log('diag'); const token = 'fixture';");
  assert.equal(markers.todoOrFixme, true);
  assert.equal(markers.isolatedTest, true);
  assert.equal(markers.diagnostic, true);
  assert.equal(markers.sensitive, true);
});
