# AI maintenance talking points

## 30 seconds

The system gathers safe evidence, classifies the risk of a maintenance idea, and gives people a decision queue. It never decides business changes or deploys by itself.

## 1 minute

ANALYZE is safe even when a branch is dirty, frozen, or on main: it only records warnings and reports. PREDEVELOP is stricter: it blocks main, dirty trees, FREEZE, Red risk, protected paths, unsafe commands, and sensitive-looking input. Quality gates then provide recorded local evidence.

## 3 minutes

Signals become stable candidate IDs so the same evidence does not create a new item on every run. The queue separates the AI recommendation from the human `finalDecision`. Green candidates are only eligible when evidence is high-confidence, small, testable, and outside protected paths; Yellow and Red require human ownership.

## Expected questions

- **Does it change ERP rules automatically?** No. Red work is blocked and final decisions are human-owned.
- **Does it deploy?** No. The workflows contain no merge, push, or deployment step.
- **What happens when a report is noisy?** The queue records confidence, source, evidence, and affected paths so a consultant can hold or reject it.
- **Can it access a customer system?** No. Gate 10 uses only the local repository and local verification commands.
- **What should a user do?** Review the decision queue, decide APPLY/HOLD/REJECT/NEEDS-BUSINESS-DECISION, then issue a separate scoped task if needed.
