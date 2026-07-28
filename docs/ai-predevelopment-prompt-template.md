# AI predevelopment prompt template

Use this template only after a human selects one Green candidate.

1. Read the root `AGENTS.md` and process exactly one candidate ID.
2. Do not change `main`, API endpoints, DTOs, DB, SQL, repository contracts, ERP rules, money, quantity, status transitions, authentication, or customer logic.
3. Do not merge, push, deploy, create a pull request, or modify a FREEZE branch.
4. Keep the diff minimal; do not hide failures by adding timeout, retry, skip, or weaker assertions.
5. Return the diff, focused verification evidence, risk, limitation, and a human decision request.

This template is a review contract. It is not an authorization for autonomous execution.
