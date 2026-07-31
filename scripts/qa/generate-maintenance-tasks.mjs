import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { collectMaintenanceSignals } from "./collect-maintenance-signals.mjs";
import { loadMaintenanceConfig } from "./verify-maintenance-boundaries.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const validDecisions = new Set(["", "APPLY", "HOLD", "REJECT", "NEEDS-BUSINESS-DECISION"]);
const validStatuses = new Set(["NEW", "KNOWN", "RESOLVED", "DISMISSED"]);

export function stableCandidateId(signal) {
  const basis = [signal.category, signal.title, signal.evidence, ...[...signal.affectedPaths].sort()].join("|");
  return `candidate-${createHash("sha256").update(basis).digest("hex").slice(0, 14)}`;
}

function candidateRisk(signal) {
  if (signal.category === "Red") return { risk: "Red", reason: "Business contract, protected path, or sensitive-information risk", role: "Business owner and technical owner" };
  if (signal.category === "Yellow") return { risk: "Yellow", reason: "Cross-cutting change requires consultant review", role: "Consultant and developer" };
  return { risk: "Green", reason: "No business-rule or protected-path change is implied by the evidence", role: "Consultant review" };
}

function eligible(signal, config, frozen) {
  if (config.mode !== "ACTIVE" || frozen || signal.category !== "Green" || signal.confidence !== "high") return false;
  return ["todo", "test-isolation", "diagnostic", "documentation"].includes(signal.kind);
}

function previousById(previousQueue) {
  return new Map((previousQueue?.candidates ?? []).map((candidate) => [candidate.id, candidate]));
}

export function generateMaintenanceTasks({ signals, config, previousQueue = null, now = new Date().toISOString() }) {
  const frozen = config.mode === "FREEZE" || new Date(now) >= new Date(config.freezeAt);
  const previous = previousById(previousQueue);
  const unique = new Map();
  for (const signal of signals) {
    const id = stableCandidateId(signal);
    if (!unique.has(id)) unique.set(id, signal);
  }
  return [...unique.entries()].slice(0, config.maxCandidatesPerRun).map(([id, signal]) => {
    const existing = previous.get(id);
    const classification = candidateRisk(signal);
    const finalDecision = validDecisions.has(existing?.finalDecision) ? existing.finalDecision : "";
    return {
      id,
      title: signal.title,
      type: signal.kind,
      description: signal.evidence,
      evidence: signal.evidence,
      sourceSignals: [signal.id],
      affectedPaths: signal.affectedPaths,
      userVisibleChange: signal.category === "Green" ? "Reviewable maintenance quality improvement; no application behavior is changed by this report." : "User-visible effect requires human review before any implementation.",
      expectedBenefit: signal.category === "Green" ? "Improves verification, documentation, or safe recovery visibility." : "Makes risk and required ownership explicit before implementation.",
      risk: classification.risk,
      riskReason: classification.reason,
      confidence: signal.confidence,
      effort: signal.category === "Green" ? "small" : signal.category === "Yellow" ? "medium" : "not-estimated",
      testability: signal.category === "Red" ? "human-decision-required" : "existing focused checks required",
      rollbackDifficulty: signal.category === "Green" ? "low" : signal.category === "Yellow" ? "medium" : "high",
      predevelopmentEligible: eligible(signal, config, frozen),
      recommendation: signal.category === "Red" ? "NEEDS-BUSINESS-DECISION" : signal.category === "Yellow" ? "HOLD" : "HOLD",
      requiredHumanRole: classification.role,
      status: validStatuses.has(existing?.status) ? existing.status : "NEW",
      firstDetectedAt: existing?.firstDetectedAt ?? now,
      lastDetectedAt: now,
      finalDecision
    };
  });
}

function readPreviousQueue(config) {
  const queuePath = resolve(root, config.reportDirectory, "decision-queue.json");
  if (!existsSync(queuePath)) return null;
  try { return JSON.parse(readFileSync(queuePath, "utf8")); } catch { return null; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = loadMaintenanceConfig();
  const collected = collectMaintenanceSignals();
  const candidates = generateMaintenanceTasks({ signals: collected.signals, config, previousQueue: readPreviousQueue(config) });
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), candidateCount: candidates.length, candidates }, null, 2));
}
