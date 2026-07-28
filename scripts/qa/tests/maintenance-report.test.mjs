import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { buildMaintenanceReport } from "../build-maintenance-report.mjs";
import { generateMaintenanceTasks, stableCandidateId } from "../generate-maintenance-tasks.mjs";
import { loadMaintenanceConfig } from "../verify-maintenance-boundaries.mjs";
import { listQualityGateCommands } from "../run-quality-gates.mjs";

const config = loadMaintenanceConfig();
const signal = { id: "signal-fixture", category: "Green", title: "Fixture documentation", evidence: "A documentation fixture exists.", source: "fixture", confidence: "high", affectedPaths: ["docs/example.md"], detectedAt: "2026-07-28T00:00:00.000Z", kind: "documentation" };

test("candidate IDs are stable, deduplicated, and final decisions start empty", () => {
  assert.equal(stableCandidateId(signal), stableCandidateId({ ...signal, affectedPaths: ["docs/example.md"] }));
  const candidates = generateMaintenanceTasks({ signals: [signal, signal], config, now: "2026-07-28T00:00:00.000Z" });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].finalDecision, "");
  assert.equal(candidates[0].predevelopmentEligible, true);
});

test("report has decision queue fields and fixed quality profiles", () => {
  const collected = { git: { branch: "feature/example", dirtyFiles: [], untrackedFiles: [], stagedFiles: [], changedPaths: [], recentCommits: [] }, signals: [signal] };
  const { report, queue, markdown } = buildMaintenanceReport({ config, collected, now: "2026-07-28T00:00:00.000Z" });
  assert.equal(report.humanDecisionRequired, true);
  assert.equal(queue.candidates[0].finalDecision, "");
  assert.match(markdown, /Final decision: empty/);
  assert.equal(listQualityGateCommands("quick").length, 6);
  for (const file of ["pr-quality.yml", "nightly-quality.yml", "maintenance-scan.yml", "ai-predevelopment.yml"]) {
    const content = readFileSync(resolve(".github", "workflows", file), "utf8");
    assert.match(content, /contents: read/);
    assert.doesNotMatch(content, /git push|git merge|vercel --prod|npm run deploy/i);
  }
});
