# Known limitations

- Gate 10 does not access customer databases, servers, SQL Server, MES, PLC, or deployment environments.
- GitHub Actions are supplied as workflow contracts and are validated locally by structure; this task does not run them on GitHub.
- The AI predevelopment workflow is disabled by default. Even when a human enables it, this repository does not auto-merge, auto-push, auto-deploy, or invoke an unverified Codex CLI option.
- ANALYZE can record dirty-tree, main-branch, FREEZE, and protected-path warnings. PREDEVELOP blocks those conditions.
- A report is an evidence queue. `finalDecision` remains a human-owned empty value until a consultant or developer decides.
