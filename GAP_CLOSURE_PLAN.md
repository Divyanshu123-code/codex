# AI Governance and Control Plane --- Gap-Closure Implementation Plan

**Purpose:** Close the CODEX 3.0 PS5 gaps in (1) human-versus-agent work allocation, (2) leadership risk/cost/usage/value dashboard, (3) audit-ready accountability reports, and (4) explicit end-to-end demonstrations.

**Implementation rule:** Extend the existing TypeScript/Node.js/Express/SQLite governance system. Do not create a second policy engine or any route that bypasses the protected executor. Use synthetic, non-operational data.

## 1. Priority and scope

### P0 --- Preserve and prove the core
- A prohibited action is blocked before the protected tool runs.
- A pending action never executes.
- Gate decision, human approval, and execution outcome are separate records.
- A policy breach opens an incident and pauses the agent when configured.
- A paused agent cannot execute.
- Corrections cannot modify permissions, policies, scope, or limits.
- A correction must pass structural and behavioral checks before approval/application.
- Resume is allowed only through the centralized resume gate.
- Audit events are generated for important transitions.

### P1 --- Close the gaps
- Deterministic task allocation and escalation.
- Read-only leadership dashboard.
- Unified incident/accountability report.
- Clear UI states for decision, approval, execution, agent status, and estimates.

### P2 --- Only if P0/P1 are complete
- PDF export, additional charts, visual polish, optional audit hash chain.

Do not build real defence integrations, predictive risk scoring, complex drag-and-drop orchestration, or an LLM that authorizes actions or changes policies.

## 2. Target architecture

```text
Task intake → Task type/allocation rules → Agent / Human queue / Escalation
                                         |
Agent action request → Authentication → Policy evaluator
                                         |
                         ALLOW / REQUIRE_APPROVAL / BLOCK
                              |          |          |
                           Executor   Human review  No execution
                              |          |
                              +----------+
                                   |
                     Execution outcome + audit events
                                   |
                       +-----------+-----------+
                       |                       |
                Leadership dashboard     Incident report
```

Allocation assigns work but does not grant permissions. The backend policy gateway remains authoritative. The dashboard and reports read from the same persisted records.

## 3. Workstream A --- Human-versus-agent allocation

### Data model
Create or extend `task_types` with:
- `id`, `name`, `description`
- `default_handler` (`agent`, `human`, `approval_required`)
- `risk_category`
- `required_capabilities`
- `approval_required`
- `escalation_role`
- `human_minutes_estimate` and `human_cost_estimate` (nullable estimates)

Add to task/action records where missing:
- `task_type`
- `handler` (`agent`, `human`, `escalated`, `blocked`)
- `handler_reason`
- `escalation_target_role`
- `escalated_at`
- `correlation_id`
- timestamps for receipt, assignment, escalation, and completion

Keep estimates clearly labeled. Do not store secrets or sensitive payloads in audit events.

### Rules
Use deterministic rules, not an LLM:
- Summarize an in-scope synthetic document → assign to agent, then apply normal policy checks.
- Human-only task → human queue; agent cannot execute it.
- Sensitive change → agent may prepare the request, but action requires human approval.
- Unknown/ambiguous policy violation → human investigation; keep agent paused when required.
- Prohibited operation → block; never reassign it to evade policy.
- Missing policy/validator failure → fail closed and escalate where appropriate.

### API/UI
Suggested endpoints:
- `GET /api/task-types`
- `POST /api/tasks`
- `GET /api/tasks?handler=human`
- `POST /api/tasks/:id/escalate`

Build a simple task table: task, handler, reason, risk, status, escalation target. Avoid drag-and-drop workflow editing.

### Tests
- Agent-eligible task is assigned to an agent.
- Human-only task enters the human queue.
- Approval-required task cannot execute while pending.
- Prohibited task is blocked, not reassigned.
- Escalation records the reason and target role.
- Every allocation decision is auditable.

## 4. Workstream B --- Leadership dashboard

Build read-only aggregate queries over the existing database. Do not create a separate analytics store.

### Dashboard sections

**Risk**
- Registered, active, restricted, and paused agents.
- Violations during the selected period.
- Open incidents by severity.
- Time to contain/recover when timestamps exist.

**Usage**
- Tasks received.
- Agent-handled, human-handled, escalated, and blocked tasks.
- Requests by agent/operation.
- Successful, failed, and not-executed actions.

**Human intervention**
- Pending, approved, rejected, and expired approvals.
- Escalated tasks, pause events, and recovery attempts.

**Estimated cost/value**
- Estimated operation cost.
- Estimated human effort/value for eligible agent-handled tasks.
- Show assumptions and label values **SIMULATED ESTIMATE --- NOT VERIFIED SAVINGS**.

### Metric rules
- Define the reporting time window.
- Prevent double-counting retries.
- Keep gate decisions, approvals, and execution outcomes separate.
- An approved request is not necessarily executed.
- A blocked request is not a successful execution.
- If cost assumptions are missing, show "not available," not invented savings.

Example formulas:
`Estimated operating cost = sum(operation count × estimated cost per operation)`
`Estimated labor value = sum(eligible agent-handled tasks × estimated human minutes per task × assumed labor rate per minute)`

Only calculate value for task types with documented assumptions.

### Data/API/UI
Suggested endpoint: `GET /api/dashboard/overview?from=...&to=...`

Build metric cards, a paused/high-risk agent table, recent incidents, approval/escalation counts, handler breakdown, and an estimate panel. Dashboard pause/restrict controls must call authorized backend endpoints.

### Tests
- Dashboard counts match database records.
- Approval metrics differ from execution metrics.
- Date filters work.
- Costs/value are deterministic and documented.
- Estimates are visibly labeled.
- UI cannot bypass backend authorization.

## 5. Workstream C --- Audit-ready incident report

Suggested endpoint: `GET /api/incidents/:id/report`

The report should assemble persisted records; it must not invent missing events or change enforcement state.

### Required sections
1. Incident ID, severity, status, timestamps.
2. Agent and owner at the time of the event.
3. Task type, handler, requested operation, safe resource reference.
4. Policy ID/version, gate decision, reason code, evidence references.
5. Approval requirement, approver identity/role, decision, reason, timestamps.
6. Execution outcome or explicit non-execution reason.
7. Containment: violation, pause/restriction, incident status.
8. Diagnosis: known signature, evidence, or `UNKNOWN`/`AMBIGUOUS` human-investigation result.
9. Correction reference/hash, structural and behavioral checks, policy hash, approver, application status.
10. Revalidation and resume decision, including unmet conditions.
11. Chronological audit timeline.

If a stage does not apply, label it "Not applicable." If expected evidence is missing, label it "Missing evidence." Do not silently omit it.

Preserve owner and policy version at event time; connect request, incident, and correction records using stable IDs/correlation IDs. Do not include secrets or sensitive raw payloads.

Build the web report first. PDF export comes only after the report is correct and tested.

### Tests
- Report connects agent, owner-at-event, task/action, policy, decision, approval, and outcome.
- Approved-but-not-executed is represented accurately.
- Blocked action is shown as not executed.
- Recovery records match database events.
- Missing/ambiguous evidence is explicit.
- Timeline order matches timestamps.
- Report generation cannot change enforcement state.

## 6. Workstream D --- End-to-end demonstration

Use synthetic, non-operational data and a reset button.

### Scenario 1: High-impact action requires approval
1. Seed an active agent and a simulated sensitive configuration-change operation requiring approval.
2. Submit the request.
3. Verify `REQUIRE_APPROVAL`, approval `PENDING`, execution `NOT_STARTED`.
4. Prove the simulated state is unchanged while pending.
5. Approve as an authenticated human reviewer with a reason.
6. Revalidate current policy and agent status.
7. Execute once through the protected executor.
8. Show separate approval and execution records.

### Scenario 2: Prohibited action pauses the agent
1. Seed a document agent allowed to `read_file` and `write_summary`, but not `delete_file`.
2. Request deletion of a synthetic file.
3. Verify `BLOCK`, no protected-tool call, and unchanged file state.
4. Record the violation and open an incident.
5. Pause the agent according to the configured violation policy.
6. Submit another action and verify it is blocked because the agent is paused.

### Scenario 3: Safe recovery
1. Open the incident report.
2. Show a known-pattern diagnosis or explicitly route unknown/ambiguous cases to human investigation.
3. Submit a bad correction attempting to expand permissions; structural validation rejects it.
4. Submit a safe workflow-only correction using already-permitted operations.
5. Run structural and behavioral checks against the original policy.
6. Obtain required approval from a different authorized human where required.
7. Apply only if approved and still valid for the same policy hash.
8. Revalidate live configuration.
9. Resume only through the centralized resume gate.
10. Show the complete timeline.

## 7. Definition of done

### Allocation
- [ ] Agent, human, approval-required, blocked, and escalation outcomes work.
- [ ] Reasons and audit events are recorded.
- [ ] Allocation cannot bypass policy enforcement.

### Dashboard
- [ ] Risk/status and usage derive from persisted records.
- [ ] Approval and execution are separate.
- [ ] Cost/value assumptions and formulas are documented.
- [ ] Estimates are clearly labeled.
- [ ] Controls are enforced by the backend.

### Report
- [ ] Report links agent, owner-at-event, task, action, policy, decision, approval, execution, incident, correction, and recovery.
- [ ] Missing evidence is explicit.
- [ ] Timeline matches audit records.

### Demo
- [ ] High-impact action waits for approval.
- [ ] Prohibited action has no side effect.
- [ ] Agent is paused after the configured breach.
- [ ] Paused agent cannot execute.
- [ ] Unsafe correction fails; safe correction passes.
- [ ] Resume is denied unless centralized conditions pass.
- [ ] Demo resets and runs reliably.
