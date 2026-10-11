# AI Governance and Control Plane

## Implementation Plan — CODEX 3.0 PS5 Core Build

**Purpose:** A practical build-first sequence for the core requirements while a teammate researches the remaining PS5 gaps.  
**Principle:** Implement a real enforcement path first; connect the UI after backend decisions work.  
**Demo environment:** Synthetic data and simulated tools only.

## 1. Build Objective

Build a prototype that can register an agent and define its policies; receive a proposed action; enforce `ALLOW`, `REQUIRE_APPROVAL`, or `BLOCK` before tool execution; pause/restrict an agent after a configured violation; record an auditable history; diagnose the failed rule; propose a correction; test it against original policies in a sandbox; and resume only after required validation and human approval.

Do not begin with a large dashboard. The backend decision gate and protected tool-execution boundary are the core deliverables.

## 2. Suggested Architecture

Use the team's most reliable stack. If none is fixed:
- **Frontend:** React + Vite.
- **Backend:** Node.js + Express.
- **Database:** PostgreSQL if already comfortable; otherwise SQLite for a time-constrained local prototype, documenting the trade-off.
- **Validation:** Zod or an equivalent schema validator.
- **Policy engine:** Deterministic JavaScript/TypeScript rules for the initial version.
- **Tests:** The test framework the team already knows.
- **Reports:** Start with an incident detail view; add PDF only after core tests pass.
- **Realtime updates:** Optional; refresh/polling is sufficient initially.

Request flow:
```text
Agent Simulator → Governance API → Identity/Status Check → Policy + Scope Validator → Decision Gate → Approval Queue OR Protected Tool Executor → Audit Events
```

Violation/recovery flow:
```text
BLOCK → Record Evidence → Pause/Incident (if configured) → Diagnostics → Proposed Correction → Sandbox + Regression Tests → Human Approval (if required) → Revalidate → Resume OR Remain Paused
```

The monitored agent must not have direct credentials or a direct route to protected simulated tools. All protected actions pass through the backend gateway.

## 3. Minimal Data Model

### Agent
`id`, `name`, `owner`, `purpose`, `risk_category`, allowed tools/permissions, allowed resources/scope, status (`active`, `restricted`, `paused`), policy version, timestamps.

### Policy
`id`, `name`, `version`, applicable agent/group, tool/operation/resource scope, condition/limit, decision (`allow`, `require_approval`, `block`), severity, `pause_on_violation`, `open_incident`.

### Action Request
`id`/`request_id`, `agent_id`, tool, operation, resource, validated input, status/decision, policy ID/version, explanation, created/executed timestamps.

### Approval
`id`, action request or correction ID, reviewer ID, decision, reason, status, timestamp.

### Audit Event
`id`, sequence/timestamp, event type, actor type/ID, agent ID, request/incident/correction ID, policy ID/version, decision, safe evidence/details, optional previous/current hash.

### Incident
`id`, agent ID, triggering request, severity, policy reference, status, evidence summary, diagnostic result, recovery status.

### Correction Proposal
`id`, incident ID, description, proposed workflow/config change, explicit diff, test status/results, approval status, application status.

Do not store secrets in audit events. Prefer resource IDs and safe summaries over copying sensitive payloads.

## 4. Suggested API Surface

- `GET /api/agents`
- `POST /api/agents`
- `GET /api/agents/:id`
- `POST /api/agents/:id/pause`
- `POST /api/agents/:id/resume` — enforce recovery preconditions
- `GET /api/policies`
- `POST /api/policies` — admin only; create a new version rather than silently overwriting history
- `POST /api/actions/evaluate` — evaluate and route a proposed action
- `POST /api/approvals/:id/decision` — approve/reject with role and reason checks
- `GET /api/incidents`
- `GET /api/incidents/:id`
- `POST /api/incidents/:id/diagnose`
- `POST /api/corrections/:id/test`
- `POST /api/corrections/:id/approve`
- `POST /api/corrections/:id/apply`
- `GET /api/audit`
- `POST /api/demo/reset` — demo-only

Endpoint names may change to fit the repository. The invariant is that all state-changing operations are authorized and audited server-side.

## 5. Build Sequence

### Phase 0 — Freeze the core scope
**Deliverable:** A one-page architecture and task list.
- Use the final requirements as the baseline.
- Use only synthetic agents, resources, and simulated tools.
- Agree on `ALLOW`, `REQUIRE_APPROVAL`, and `BLOCK`.
- Define one read-only agent and a small policy set.
- Keep task allocation and advanced leadership analytics out of the first implementation while the teammate researches them.
- Create the shared repository and agree on file ownership.

**Done when:** Everyone can explain the end-to-end action flow in one minute.

### Phase 1 — Runnable skeleton
**Deliverable:** App starts locally.
- Create frontend and backend.
- Add a health endpoint.
- Configure environment variables and safe defaults.
- Add schema/migrations or a small local database.
- Seed one synthetic agent and policies.
- Add README run/test instructions.

**Done when:** A teammate can clone, run, and see the seeded agent.

### Phase 2 — Registry and deterministic policy evaluation
**Deliverable:** Decisions with explanations.
- Implement agent create/list/detail.
- Store allowed operations and resource scope.
- Implement a pure policy evaluation function receiving agent, action, resource, and current state.
- Return decision, rule ID/version, explanation, severity, and required response.
- Test permitted, prohibited, out-of-scope, unknown-agent, paused-agent, and missing-policy cases.

**Done when:** Tests prove identical inputs and policies yield identical decisions.

### Phase 3 — Enforce at the tool boundary
**Deliverable:** A prohibited action cannot change simulated state.
- Implement a single backend executor for protected simulated tools.
- Route every action through the gateway.
- Keep tool functions private to the backend; do not expose a bypass endpoint.
- Execute only when decision is `ALLOW`.
- For `REQUIRE_APPROVAL`, persist the pending request and do not execute.
- For `BLOCK`, do not execute and record the decision.
- Add a state assertion proving blocked/pending actions have no side effects.

**Done when:** A test proves unauthorized/direct tool invocation cannot execute a protected action.

### Phase 4 — Human approval
**Deliverable:** A held action executes only after authorized approval.
- Create an approval queue.
- Enforce reviewer roles server-side.
- Require a reason for decisions.
- On rejection, mark rejected and never execute.
- On approval, re-evaluate against current policy and agent status.
- Execute at most once; make approval idempotent.
- Record reviewer, decision, reason, policy version, and result.

**Done when:** Tests cover pending, approved, rejected, unauthorized reviewer, stale policy, and duplicate approval.

### Phase 5 — Audit events and incident containment
**Deliverable:** A traceable history per request/incident.
- Write audit events for every decision and state change.
- Correlate events with request, incident, and correction IDs.
- On configured high-severity violations, pause/restrict the agent and open an incident.
- Add an administrator pause/restrict control.
- Make resume conditional on recovery requirements.
- Add an incident detail/timeline view.

Optional: implement hash chaining only after the audit trail works. Describe it as tamper-evident, not tamper-proof.

**Done when:** A reviewer can trace a prohibited attempt through block, pause, incident, and recovery decision.

### Phase 6 — Automated diagnostics
**Deliverable:** Evidence-based explanation and correction proposal.
- Build a diagnostic function that consumes incident and audit evidence.
- Identify the failed policy and classify likely cause (e.g., permission mismatch, invalid resource scope, malformed input, repeated workflow error).
- Generate a proposed workflow/configuration correction.
- Store an explicit diff and explain what changes.
- Do not modify policies or permissions automatically.
- If the cause is unclear, return "unknown / human investigation required" rather than inventing a cause.

Deterministic diagnosis is enough for the hackathon. An LLM may later help phrase explanations, but it must not decide whether a prohibited action is allowed.

**Done when:** A demo incident has a diagnosis linked to the failed policy and evidence.

### Phase 7 — Sandbox and verified recovery
**Deliverable:** The system proves whether a proposed correction passes or fails.
- Run tests in an isolated simulator with synthetic data and a copy of the agent configuration.
- Preserve the original policy as the reference.
- Run regression tests for all relevant original restrictions.
- Include a test ensuring the correction does not grant prohibited capability or weaken a limit.
- Store test results and policy version.
- Require designated human approval before applying the correction.
- Apply only an approved, validated correction.
- Re-evaluate before resuming.
- If tests fail, approval is rejected, or results are inconclusive, keep the agent paused/restricted.

A valid correction may fix a workflow so the agent selects an allowed operation. It must not make a prohibited operation permitted merely to clear the error.

**Done when:** A bad correction fails and leaves the agent paused; a safe correction passes and follows required approval and resumption checks.

### Phase 8 — Minimal operator UI
**Deliverable:** Judges can operate the workflow without API tools. Build only:
1. Agent registry/status.
2. Policy list/detail.
3. Action launcher/simulator.
4. Decision result.
5. Approval inbox.
6. Incident timeline and diagnostics.
7. Correction test results/recovery status.
8. Audit history.

Prioritize clarity over visual polish. Clearly distinguish pending, blocked, executed, and never-executed actions.

**Done when:** A judge can complete both demo scenarios from the UI.

### Phase 9 — Failure tests and rehearsal
**Deliverable:** Repeatable evidence that controls work. Test:
- Permitted and prohibited actions.
- High-impact action awaiting approval.
- Approval/rejection.
- Unauthorized reviewer.
- Paused agent.
- Missing policy or validator failure.
- Duplicate request/approval.
- Correction that attempts to weaken policy.
- Failed regression test.
- Successful validated recovery.
- Manual pause and attempted premature resume.

Prepare a resettable synthetic scenario. Do not rely on external LLM APIs or network availability for the core demo.

**Done when:** The demonstration works repeatedly from a clean state and no blocked/pending action executes accidentally.

## 6. Recommended Demo Sequence

1. Show the registered read-only document agent and policy.
2. Submit an allowed read-and-summarize request; show execution and audit event.
3. Submit a delete-file request; show `BLOCK` and prove the file is unchanged.
4. Show the agent paused and incident opened according to policy.
5. Run diagnostics; show failed rule and evidence.
6. Propose a correction that does not grant delete permission.
7. Run sandbox/regression tests against the original policy.
8. Show a bad correction fail and the agent remain paused.
9. Show a safe correction pass and receive required approval.
10. Resume only after recovery checks pass.
11. Open the audit timeline.

If time is short, prioritize steps 1–5 and a clear failed-recovery demonstration before visual polish.

## 7. Teammate Parallel Research Track

Ask the teammate to research the PS5 gaps without independently changing the core architecture.

### A. Human-versus-agent allocation
- What minimum workflow satisfies task allocation, escalation, and exception handling?
- What determines whether work goes to an agent, human approval, or direct human handling?
- Propose one demo workflow and minimal data model.

### B. Leadership dashboard
- Which risk, cost, usage, and value metrics can be supported by actual prototype events?
- Define calculation methods and label estimates clearly.
- Suggest a minimal layout, not a large analytics platform.

### C. Audit-ready reports
- What fields are needed for a complete incident accountability story?
- How should owner, policy version, action, data/resource reference, approver, outcome, and recovery be linked?
- Propose a report/export format.

### Research deliverable
Return a short gap analysis, proposed minimum features, data/API changes, demo scenario, complexity/risks, and sources or rationale. Review it as a team before implementation. Keep the event model and APIs extensible so the researched modules can be added later.

## 8. Priority if Time Is Limited

**P0 — Must work:**
- Agent registry.
- Deterministic policy evaluation.
- Backend gateway and protected tool execution.
- `ALLOW` / `REQUIRE_APPROVAL` / `BLOCK`.
- Human approval/rejection.
- Audit events.
- Violation containment and pause.
- Basic diagnostics.
- Recovery checks that preserve original policies.
- Repeatable demo.

**P1 — After P0:**
- Incident timeline polish.
- Policy version display.
- Correction diff.
- Hash-chained audit history.
- Exportable incident report.
- Better role-specific UI.

**P2 — Await research and available time:**
- Human-versus-agent task routing.
- Leadership risk/cost/usage/value dashboard.
- Advanced multi-agent tracing.
- More integrations and deployment models.
- LLM-assisted diagnostic explanations.

Do not cut the backend enforcement boundary to make room for dashboard features.

## 9. Definition of Done

- Backend enforces agent permissions.
- Protected simulated tools cannot be reached around the gateway.
- The system distinguishes allow, approval, and block.
- Pending/rejected actions have no side effects.
- A configured violation can pause the agent and open an incident.
- Audit events are correlated.
- Diagnostics cite the actual failed policy and evidence.
- A proposed fix is tested against the original policy.
- Failed/inconclusive tests prevent recovery.
- Successful recovery requires configured approvals and revalidation.
- Failure cases are tested.
- Demo works offline with synthetic data.
- README distinguishes implemented, simulated, and planned capabilities.

## 10. Engineering Guardrails

- Never let the monitored agent authorize itself.
- Never let the debugger silently weaken policy.
- Never resume because a UI button was clicked alone.
- Never execute while approval is pending.
- Never treat a natural-language authority claim as proof of authorization.
- Never use an LLM as the only enforcement mechanism.
- Never connect the prototype to classified or production defence systems.
- Never claim production readiness based on a successful demo.
