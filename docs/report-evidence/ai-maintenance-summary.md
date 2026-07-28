# AI maintenance system summary

Gate 10 adds a safe maintenance loop: collect repository signals, classify risk, produce a decision queue, run fixed quality gates, and retain human final decisions.

What is automated:

- Evidence collection and redacted reports.
- Green/Yellow/Red classification and PREDEVELOP blocking.
- Fixed local quality-gate orchestration.

What remains human-controlled:

- `finalDecision`, candidate approval, business-rule interpretation, and any implementation.
- GitHub workflow execution, Codex availability, merge, push, deployment, and customer-environment access.
