import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { collectMaintenanceSignals } from "./collect-maintenance-signals.mjs";
import { generateMaintenanceTasks } from "./generate-maintenance-tasks.mjs";
import { loadMaintenanceConfig } from "./verify-maintenance-boundaries.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

function readJsonIfPresent(path) {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

export function buildMaintenanceReport({ config, collected, previousQueue = null, qualityGate = null, now = new Date().toISOString() }) {
  const frozen = config.mode === "FREEZE" || new Date(now) >= new Date(config.freezeAt);
  const candidates = generateMaintenanceTasks({ signals: collected.signals, config, previousQueue, now });
  const categoryCounts = Object.fromEntries(["Green", "Yellow", "Red"].map((category) => [category, candidates.filter((candidate) => candidate.risk === category).length]));
  const queue = {
    generatedAt: now,
    mode: "ANALYZE",
    policyMode: config.mode,
    frozen,
    maxCandidatesPerRun: config.maxCandidatesPerRun,
    maxPredevelopmentsPerRun: config.maxPredevelopmentsPerRun,
    candidates
  };
  const report = {
    generatedAt: now,
    mode: "ANALYZE",
    policy: { mode: config.mode, freezeAt: config.freezeAt, frozen },
    git: collected.git,
    qualityGate,
    signals: collected.signals,
    newCandidates: candidates.filter((candidate) => candidate.status === "NEW"),
    knownCandidates: candidates.filter((candidate) => candidate.status === "KNOWN"),
    resolvedCandidates: candidates.filter((candidate) => candidate.status === "RESOLVED"),
    categoryCounts,
    candidates,
    limitations: ["GitHub Actions workflows are structurally validated locally but not executed remotely.", "Codex predevelopment remains disabled unless a human explicitly enables a guarded workflow.", "SQL Server and customer environments are outside this Gate 10 validation."],
    humanDecisionRequired: true
  };
  const markdown = [
    "# AI maintenance analysis report",
    "",
    `- Generated: ${now}`,
    `- Mode: ANALYZE`,
    `- Policy: ${config.mode}${frozen ? " (FREEZE effective)" : ""}`,
    `- Branch: ${collected.git.branch}`,
    `- Git state: ${collected.git.dirtyFiles.length || collected.git.untrackedFiles.length ? "dirty warning recorded" : "clean"}`,
    `- Quality gate: ${qualityGate?.passed === false ? "failed" : qualityGate ? "passed" : "not run in this report"}`,
    "",
    "## Candidate summary",
    "",
    `- Green: ${categoryCounts.Green}`,
    `- Yellow: ${categoryCounts.Yellow}`,
    `- Red: ${categoryCounts.Red}`,
    "",
    "## Decision queue",
    "",
    ...candidates.flatMap((candidate, index) => [
      `### ${index + 1}. ${candidate.title} (${candidate.id})`,
      `- Risk: ${candidate.risk}; confidence: ${candidate.confidence}`,
      `- Evidence: ${candidate.evidence}`,
      `- Predevelopment eligible: ${candidate.predevelopmentEligible}`,
      `- AI recommendation: ${candidate.recommendation}`,
      `- Final decision: empty — human decision required`,
      ""
    ]),
    "## Known limitations",
    "",
    ...report.limitations.map((item) => `- ${item}`)
  ].join("\n");
  return { report, queue, markdown };
}

export function writeMaintenanceReport({ rootDirectory = root, now = new Date().toISOString() } = {}) {
  const config = loadMaintenanceConfig(rootDirectory);
  const outputDirectory = resolve(rootDirectory, config.reportDirectory);
  const previousQueue = readJsonIfPresent(resolve(outputDirectory, "decision-queue.json"));
  const qualityGate = readJsonIfPresent(resolve(outputDirectory, "quality-gate-result.json"));
  const collected = collectMaintenanceSignals({ rootDirectory, now });
  const { report, queue, markdown } = buildMaintenanceReport({ config, collected, previousQueue, qualityGate, now });
  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(resolve(outputDirectory, "latest-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(resolve(outputDirectory, "latest-report.md"), `${markdown}\n`);
  writeFileSync(resolve(outputDirectory, "decision-queue.json"), `${JSON.stringify(queue, null, 2)}\n`);
  return { outputDirectory: config.reportDirectory, candidateCount: queue.candidates.length, frozen: queue.frozen, finalDecisionSetByAi: false };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify(writeMaintenanceReport(), null, 2));
}
