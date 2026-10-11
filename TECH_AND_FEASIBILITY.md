# AI Governance and Control Plane: Technology, Feasibility and Binding Design Decisions

**Project:** CODEX 3.0 PS5 core build  
**Version:** 2 (pre-implementation adjustments applied)  
**Companion documents:** `REQUIREMENTS.md`, `IMPLEMENTATION_PLAN.md`  
**Status:** Working baseline. We build the current feature set now; the PS5 gap research runs in parallel (Section 8).  
**Note:** All hour figures are rough estimates, not measurements. Where this document is more specific than the two companion documents, **this document wins for implementation**.

---

## 0. What changed in version 2

| # | Adjustment | Where defined | Requirements and phases affected |
|---|---|---|---|
| 1 | Diagnostics bounded to known failure patterns | 3.1 | FR-7, Phase 6 |
| 2 | Approval decisions separated from execution outcomes | 3.2 | FR-5, FR-9, FR-10, Phases 3 and 4 |
| 3 | Structural and behavioural checks on corrections | 3.3 | FR-8, Phase 7 |
| 4 | Precise definitions of `active`, `restricted`, `paused` | 3.4 | FR-1, FR-6, Phases 2 and 5 |
| 5 | Centralized resume conditions | 3.5 | FR-6, FR-8, Phases 5 and 7 |
| 6 | Metadata for task allocation, analytics and reports | 3.6 | FR-3, FR-10, Phases 2 to 7 (schema from the start) |
| 7 | Schedule protection: enforcement and recovery before polish | 5 | All phases |

---

## 1. Verdict and schedule impact

The core build remains **feasible in 36 hours with four people**, but the adjustments add about 12 hours of work. The buffer shrinks from roughly 30% to roughly 15%, which is why Section 5 (schedule protection) is now binding. If fewer than four people are fully active, apply the cut order in Section 5.4 early.

The enforcement path (registry, evaluator, gateway, protected tools, approvals, audit) uses well-understood techniques. The risky areas are bounded diagnostics, correction checks and the resume gate, because they must be precise to be credible, not because they are technically exotic.

---

## 2. Technology stack

| Layer | Choice | Reason |
|---|---|---|
| Language | TypeScript on frontend and backend (or JavaScript + Zod) | Shared types and schemas catch integration bugs early |
| Backend | Node 20 + Express | Matches the plan; fast to build |
| Database | **SQLite via `better-sqlite3`** for the local build | Zero setup; synchronous transactions simplify atomic transitions; works offline. Use Postgres only if a hosted link is also wanted |
| Validation | Zod | Input validation on every endpoint; also validates correction patches |
| Policy engine | Plain TypeScript rules (optionally `json-logic-js`) | Deterministic, explainable, no LLM in enforcement |
| Human auth | Seeded users, JWT, bcrypt | Server-side role enforcement |
| Agent auth | Separate agent API keys | Agent identity differs from human identity; no self-authorization |
| Hashing | `node:crypto` | Patch hashes, protected-field invariants, optional audit hash chain |
| Tests | Vitest + Supertest | Fast; tests the API end to end |
| Frontend | React + Vite, Tailwind, shadcn/ui with default theme | Fast to build; no custom design system |
| Live updates | TanStack Query polling every 2 to 3 seconds | Sufficient; avoids WebSocket complexity |
| Reports | Incident detail view first; PDF only after gate G3 (Section 5) | Matches the plan's priority |
| LLM | None in the core path | Demo works offline; removes a failure mode |
| Deployment | Local run for the demo; optional hosted build with reset button | Free hosted tiers can reset SQLite files |

---

## 3. Binding design decisions

### 3.1 Diagnostics are bounded to known failure patterns (adjustment 1)

Diagnostics are **known-pattern triage**, not general root-cause analysis. State this in the UI, README and pitch.

**Closed signature catalog.** Diagnostics may only report a cause that matches an entry in a versioned, code-defined catalog. Each entry has:

| Field | Meaning |
|---|---|
| `signature_id` | Stable ID, for example `SIG-DISALLOWED-OP` |
| `matcher` | Deterministic function over recorded evidence (failed rule type, operation, resource-scope relation, validation errors, repeat count) |
| `cause_category` | Human-readable category |
| `correction_template` | A patch template that touches workflow configuration only (see 3.3) |
| `explanation` | Fixed text citing the matched evidence fields |

**Initial catalog (keep to these four unless time clearly allows more):**

1. `SIG-DISALLOWED-OP`: a workflow step called an operation outside the agent's allowed operations. Template: replace the step's operation with an allowed one, or remove the step.
2. `SIG-OUT-OF-SCOPE-RESOURCE`: a step referenced a resource outside the agent's scope. Template: change the step's resource reference to an in-scope resource, or remove the step.
3. `SIG-MALFORMED-INPUT`: required parameters missing or invalid. Template: replace the step's parameter mapping.
4. `SIG-REPEATED-VIOLATION`: the same rule was violated N or more times in a time window. Template: none; requires human investigation (classification only).

**Rules**
- **No match** returns `UNKNOWN_HUMAN_INVESTIGATION_REQUIRED`. No cause is invented.
- **More than one match** returns `AMBIGUOUS_HUMAN_INVESTIGATION_REQUIRED`. The system does not pick.
- A diagnosis stores `catalog_version`, `signature_id` (or `UNKNOWN`/`AMBIGUOUS`), the evidence references used, and the explicit description of what a correction would change.
- No confidence scores, no free-form generated causes, no LLM in the decision. An LLM may later rephrase the fixed explanation text only (P2).
- Diagnostics **propose**; they never apply anything, and never produce a template that touches permissions, policies or limits.
- Tests: for each signature, one positive fixture and one negative fixture; one fixture matching nothing; one fixture matching two signatures.

### 3.2 Decision, approval and execution are three separate things (adjustment 2)

Three layers, each with its own status and its own audit events. None implies another.

| Layer | Field | Values | Meaning |
|---|---|---|---|
| Gate decision | `gate_decision` (+ `gate_reason_code`, `policy_id`, `policy_version`) | `ALLOW`, `REQUIRE_APPROVAL`, `BLOCK` | What the policy said when the request was evaluated. Immutable once written |
| Approval | `approval.status` | `PENDING`, `APPROVED`, `REJECTED`, `EXPIRED` (P1) | A human authorization decision only. Records who decided, role and reason |
| Execution | `execution.status` | `NOT_STARTED`, `EXECUTING`, `SUCCEEDED`, `FAILED`, `NOT_EXECUTED` | What the simulated tool actually did |

`NOT_EXECUTED` carries a mandatory `non_execution_reason`: `BLOCKED_BY_POLICY`, `APPROVAL_PENDING`, `APPROVAL_REJECTED`, `APPROVAL_EXPIRED`, `REVALIDATION_FAILED`, `AGENT_NOT_ACTIVE`, `VALIDATOR_FAILURE`.

**Invariants (each needs a test)**
1. `BLOCK` means execution stays `NOT_EXECUTED (BLOCKED_BY_POLICY)` forever.
2. `APPROVED` is **authorization to attempt**, not proof of execution. The executor must revalidate against the current policy version and current agent status before starting. A failed revalidation ends as `NOT_EXECUTED (REVALIDATION_FAILED)` with the approval still `APPROVED`.
3. `REJECTED` is terminal: execution is `NOT_EXECUTED (APPROVAL_REJECTED)`.
4. Execution can reach `EXECUTING` only if the gate said `ALLOW`, or the gate said `REQUIRE_APPROVAL` and the approval is `APPROVED`, and revalidation passed.
5. Approval decisions and execution starts are each an atomic compare-and-set (`UPDATE ... WHERE status = <expected>` and confirm exactly one row changed). A request has at most one execution row (unique on request ID).
6. Pending approvals never execute. A paused agent's approved request fails revalidation.

**Audit event types are distinct:** `GATE_DECIDED`, `APPROVAL_REQUESTED`, `APPROVAL_DECIDED` (approved or rejected), `EXECUTION_STARTED`, `EXECUTION_SUCCEEDED`, `EXECUTION_FAILED`, `NOT_EXECUTED` (with reason).

**Corrections follow the same split:** `approval_status` (`PENDING`, `APPROVED`, `REJECTED`) is separate from `application_status` (`NOT_APPLIED`, `APPLYING`, `APPLIED`, `FAILED`).

**UI rule:** show two badges on every request, "Decision" and "Execution", so an approved-but-not-executed request is never mistaken for an executed one. Approver statistics come from approvals; outcome statistics come from executions.

### 3.3 Corrections must pass structural and behavioural checks (adjustment 3)

A correction is a patch to the agent's **workflow configuration only**. It is never a patch to policies, permissions, limits or scope. Both groups of checks must pass.

**Structural checks (run first, deterministic, on the patch itself)**

| ID | Check |
|---|---|
| S1 | Patch validates against a strict schema; only allowed patch operations (`replace_step_operation`, `remove_step`, `replace_step_params`) |
| S2 | Every touched path is inside the allowlist `workflow.steps[*]`; any other path fails |
| S3 | **Protected-field invariant:** a hash of the agent's protected fields (allowed operations, resource scope, permissions, limits, policy version, risk category, status, owner) is identical before and after applying the patch |
| S4 | Any operation the patch introduces must already exist in the operation catalog **and** already be in the agent's allowed operations (a patch cannot introduce a new capability) |
| S5 | Patch size is bounded and contains no duplicate or conflicting changes |
| S6 | Integrity of reference artifacts: the regression suite and fixtures match their committed hashes, so a correction cannot alter its own tests |

**Behavioural checks (run in the sandbox, only if structural checks pass)**

The sandbox clones synthetic fixture state into memory and runs the corrected workflow through the **original, unmodified policy evaluator**.

| ID | Check |
|---|---|
| B1 | **Original-trace replay:** the failing trace, replayed with the corrected workflow, produces no `BLOCK` and no violation events |
| B2 | **Negative control:** submitting the originally violating operation directly under the corrected configuration is **still blocked** (proves the policy was not weakened) |
| B3 | Regression must-block cases (for example delete, out-of-scope resource, paused agent) all still `BLOCK` |
| B4 | Must-allow and must-approve cases are unchanged (no over-restriction, no bypass) |
| B5 | State-diff assertion: sandbox state changed only through expected allowed operations; protected resources are unchanged |
| B6 | The sandbox used the same policy version (hash recorded) as the incident |

**Verdicts**
- `PASS` only if every structural and behavioural check passes.
- `FAIL` if any check fails. Later checks are recorded as `SKIPPED`.
- `INCONCLUSIVE` on error or timeout. Treated exactly like `FAIL`: the agent stays paused or restricted.
- Results are stored per check ID with the policy hash and correction patch hash.
- A correction cannot be **approved** unless its verdict is `PASS`, and cannot be **applied** unless it is approved, still `PASS`, and not stale (the policy hash is unchanged since testing).
- The demo's "bad correction" (a patch granting delete permission) fails at S2 or S3. The "safe correction" (replace the faulty delete step with an allowed operation) passes all checks.

### 3.4 Agent statuses, defined precisely (adjustment 4)

Operations carry a `mutating` flag (true for anything that changes state) and an optional `sensitive` flag in the operation catalog.

| | `active` | `restricted` | `paused` |
|---|---|---|---|
| Meaning | Normal operation under policy | Reduced autonomy: continues, but changes need a human | Stopped: no action may proceed |
| Gateway behaviour | Evaluates policy normally | Evaluates policy normally, then **elevates any `ALLOW` on a `mutating` operation to `REQUIRE_APPROVAL`** (reason `RESTRICTED_AGENT`). `BLOCK` stays `BLOCK`. `ALLOW` on non-mutating operations proceeds | Rejects every request immediately: `BLOCK` with reason `AGENT_PAUSED` after identity check; no execution |
| Execution allowed | Per gate decision | Per gate decision after elevation | Never; the executor's revalidation fails with `AGENT_NOT_ACTIVE` |
| Pending approvals | Normal | Normal | Remain `PENDING`; a human may still decide them, but execution fails revalidation while paused |
| Entered by | Initial state; resume | Admin action; policy-configured medium-severity violation | Admin action; policy-configured high-severity violation; failed recovery stays here |
| May leave to | `restricted`, `paused` | `active` (admin, with reason, only if no open incident), `paused` | `active` or `restricted` only through the resume gate (3.5) |

**Rules**
- Only `transitionAgentStatus(agentId, to, actor, reason)` may write an agent's status. It records `from`, `to`, actor, reason, correlation IDs and an audit event.
- Any transition **into** `paused` is always allowed for an admin or the system and needs no conditions.
- An agent can never change its own status.
- When an incident pauses an agent, the incident stores `pre_incident_status`. The resume target is that status.

### 3.5 Resume conditions are centralized (adjustment 5)

One module, one function: `evaluateResumeEligibility(agentId)` returns `{ eligible, unmet[] }`. It is used by `POST /api/agents/:id/resume`, by the recovery flow, and by the UI (to display unmet conditions). **No other code may move an agent out of `paused`.** This is enforced by routing every status write through `transitionAgentStatus`, which calls the gate for any `paused → *` transition, plus a test that no other code path writes the status column.

**Conditions (all must hold)**

| ID | Condition |
|---|---|
| R1 | The caller is a human with the administrator role (never an agent) |
| R2 | A written reason is supplied |
| R3 | The agent exists, is not terminated, and its policy version still exists |
| R4 | No open incident exists, **or** every open incident satisfies R5 to R8 |
| R5 | The incident has a diagnosis recorded (a matched signature, `UNKNOWN` or `AMBIGUOUS`) |
| R6 | An applied correction exists for the incident with verdict `PASS`, correction approval `APPROVED`, and `application_status = APPLIED` |
| R7 | The correction approver is a human reviewer who is neither the proposer nor the agent (separation of duties) |
| R8 | **Revalidation succeeded:** the regression suite re-run against the live, applied configuration passes, and the policy hash equals the hash used in the sandbox (otherwise the result is stale and must be re-tested) |
| R9 | For a manual pause with no incident, R1 to R3 suffice |

**Rules**
- Any error while evaluating a condition counts as **not eligible** (fail-safe).
- An incident whose diagnosis is `UNKNOWN` or `AMBIGUOUS`, or has no passing correction, **cannot** be resumed. The agent remains paused; the only other path is termination.
- Every attempt writes `RESUME_ATTEMPTED` (with the unmet conditions); success writes `RESUMED` with the target status.
- The call is idempotent: resuming an already-resumed agent changes nothing.
- The UI resume button is disabled with the unmet conditions listed, and the server enforces the same function regardless of the UI.

### 3.6 Metadata captured from the start (adjustment 6)

Capture these fields in the schema from day one so later work (task allocation, leadership analytics, accountability reports) only reads them. **Capture now; do not build the analytics now.** Copy owner and policy version into each event at the time of the event, so history stays correct if an owner or policy later changes.

| Entity | Fields to capture |
|---|---|
| Agent | `owner_user_id` (named human), `team`, `cost_per_operation` (nullable, simulated and labelled as an estimate), `risk_category`, `pre_incident_status` (on incident) |
| Task type (new small table) | `task_type`, description, `default_handler`, `escalation_role`, `human_minutes_estimate`, `human_cost_estimate` (labelled estimates) |
| Operation catalog (new small table) | `operation`, `mutating`, `sensitive`, `simulated_cost` |
| Action request | `task_type`, `handler` (`agent`, `human`, `escalated`, `blocked`), `handler_reason`, resource reference (not payload), `resource_sensitivity`, correlation ID, timestamps: `received_at`, `gated_at`, `approval_requested_at`, `approval_decided_at`, `execution_started_at`, `execution_finished_at`, `escalated_at`, `escalation_target_role` |
| Approval | approver ID and role, reason, `requested_at`, `opened_at`, `decided_at`, `sla_deadline` (nullable) |
| Execution | status, `non_execution_reason`, `duration_ms`, `simulated_cost`, result reference |
| Incident | severity, policy ID and version, `opened_at`, `diagnosed_at`, `correction_proposed_at`, `correction_approved_at`, `applied_at`, `resumed_at`, signature ID, agent owner at the time |
| Correction | proposer (system or human), patch hash, structural and behavioural results per check ID, policy hash, approver, `applied_at` |
| Audit event | event type, actor type and ID, agent ID, **agent owner at the time**, policy ID and version, resource reference, decision, outcome, correlation IDs (request, incident, correction), timestamp, optional previous and current hash |

**What these fields will support later (not built now)**

| Later need | Derived from |
|---|---|
| Task allocation: handled by agent, human, escalated, blocked | `handler`, `handler_reason`, `task_type`, escalation fields |
| Risk | Violation counts by severity, open incidents, time to contain (`opened_at` to pause), time to recover (`opened_at` to `resumed_at`) |
| Usage | Request counts per agent, operation and handler |
| Cost (estimate) | Operation counts multiplied by `cost_per_operation`, labelled as an estimate |
| Value (estimate) | Agent-handled tasks multiplied by `human_minutes_estimate` or `human_cost_estimate`, labelled as estimates |
| Approval quality | `requested_at`, `opened_at`, `decided_at`, reason length |
| Accountability report | The full chain: agent, owner at the time, task type, action, resource reference, policy version, gate decision, approver, execution outcome, incident, diagnosis, correction, resume |

Never store secrets or sensitive payloads in events; use resource IDs and safe summaries.

### 3.7 Tool boundary and identities (retained)

- Protected tools live in a module that exports only the executor. No route imports a tool directly.
- A test asserts blocked and pending requests leave simulated state unchanged, and that no endpoint reaches a tool except through the gateway.
- Stronger option (about 1.5 h): the executor requires a signed execution token (HMAC over request ID, operation and a hash of the parameters); a direct call without a valid token is rejected and logged.
- Agents authenticate with API keys; humans with JWT. Approval endpoints accept only human reviewer identities. A natural-language claim of authority is stored as evidence at most and never used for a decision.

### 3.8 Fail-safe by construction (retained)

- The whole evaluation is wrapped in try/catch that returns `BLOCK` and writes an audit event.
- Missing policy data is default-deny.
- Scenario E is tested explicitly (missing policy, validator exception).

---

## 4. Feasibility by component (updated estimates)

| Component | Requirement | Feasibility | Est. person-hours | Main risk |
|---|---|---|---|---|
| Registry and status model (3.4) | FR-1 | Easy | 4 | Status semantics drifting; use the single transition function |
| Versioned policies | FR-2 | Easy | 3 | Version handling |
| Evaluator and validator | FR-4 | Easy | 4 | Missed edge cases |
| Gateway and protected tools | FR-5 | Easy to moderate | 5 | Proving "no bypass" |
| Approval and execution separation (3.2) | FR-5, FR-9 | Moderate | 7 | Double execution, stale revalidation |
| Audit trail | FR-10 | Easy | 4 (+2 for hash chain) | Correlation gaps |
| Containment, incidents, transitions | FR-6 | Easy to moderate | 4 | Transition rules |
| Bounded diagnostics (3.1) | FR-7 | Moderate | 4 | Overclaiming |
| Correction checks (3.3) | FR-8 | **Hardest** | 11 | Sandbox precision |
| Central resume gate (3.5) | FR-6, FR-8 | Moderate | 3 | A second code path writing status |
| Fail-safe | Scenario E | Easy | 2 | None |
| Metadata capture (3.6) | FR-3, FR-10 | Easy | 2 | Forgetting to set fields at every write |
| Operator console, functional | FR-11 | Moderate | 14 | Time sink |
| Operator console, polish (gated) | FR-11 | Optional | 4 | Only after gate G3 |
| Demo simulator and reset | FR-12 | Easy | 3 | None |
| Tests | Phase 9 | Moderate | 9 | Written too late |
| README and demo prep | Definition of done | Easy | 3 | None |

**Required total: about 84 person-hours** (82, plus 2 for the hash chain). **Optional polish: 4.** Four people over 36 hours give roughly 100 effective hours, so the buffer is about 15%. Gap features (Section 8) are **not** included in this total.

---

## 5. Schedule protection (adjustment 7)

**Principle:** enforcement and recovery come before anything visual. A plain screen that proves the controls work beats a polished screen over a half-built backend.

### 5.1 Priority tiers

- **P0 (must work):** registry and status model, evaluator, gateway, protected tool boundary, decision/approval/execution separation, containment, bounded diagnostics, structural and behavioural correction checks, central resume gate, audit events, failure tests, repeatable demo.
- **P1 (after all P0 gates):** hash chain, correction diff view, policy version display, incident timeline polish, incident report export, signed execution tokens, role-specific UI.
- **P2 (only if gates are green and time remains):** visual polish, PDF, LLM-phrased explanations, any gap feature not yet agreed.

### 5.2 UI ladder (a screen advances one level at a time)

| Level | Description | Allowed when |
|---|---|---|
| 0 | API works and is covered by tests | Always first |
| 1 | Functional, unstyled-or-default screen that completes the flow | After Level 0 for that feature |
| 2 | Clarity only: Decision and Execution badges, disabled-button reasons, error messages | After Level 1 |
| 3 | Visual polish | **Only after gate G3 and all P0 tests are green** |

**UI rules:** the shadcn default theme, no custom design system, no animations, and only the eight screens in the plan. The UI budget for Levels 1 and 2 is capped at 14 hours total. No UI work is merged for a feature whose backend test is not passing.

### 5.3 Gates

| Gate | Hour | Must be true |
|---|---|---|
| G1 | 10 | A prohibited action cannot change simulated state (test proves it); evaluator tests pass; every agent status behaves as defined in 3.4 |
| G2 | 18 | A held action executes once and only once after approval; approval and execution are separate records; rejection never executes; violation pauses the agent and opens an incident |
| G3 | 27 | Full recovery path: bounded diagnosis, bad correction fails structural check and agent stays paused, safe correction passes all checks, approval, central resume gate, resume only after revalidation |
| G4 | 31 | All failure tests green; the demo runs from a clean reset; offline run confirmed |

**Do not start the next stage's polish with a failing gate.** Feature freeze at hour 32.

### 5.4 Time-box and cut order

- If any task exceeds 150% of its estimate, the team leader decides immediately: cut scope, reassign help, or defer.
- When the UI developer finishes Level 1 for all screens, they help on recovery and tests before touching Level 3.
- Gap features do not enter the build before G3.

**Cut order (first to last):** UI polish, PDF export, role-specific UI, incident timeline polish, hash chain, signed execution tokens, correction diff view, policy version display.
**Never cut:** gateway, tool boundary, decision/approval/execution separation, containment, bounded diagnostics, structural and behavioural checks, central resume gate, failure tests, repeatable demo.

---

## 6. Time mapping (36 hours)

| Hours | Work |
|---|---|
| 0 to 3 | Skeleton, schema including all Section 3.6 fields, seed (operation catalog, task types, agent with a faulty workflow), auth, health endpoint, README stub |
| 3 to 10 | Registry, status model and transition function, evaluator, gateway, protected tools, tests alongside. **G1** |
| From 8 | Frontend Level 0 and Level 1 against API stubs |
| 10 to 18 | Approval and execution separation, audit events, containment, incidents. **G2** |
| 18 to 27 | Signature catalog and diagnostics, correction checks, sandbox, resume gate, recovery flow. **G3** |
| 27 to 31 | Failure tests, demo reset, rehearsal prep; Level 3 polish only if G3 and all P0 tests are green; agreed gap features only if time allows. **G4** |
| 32 | Feature freeze |
| 32 to 36 | Rehearsal, backup video, final reset, README |

---

## 7. Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| UI consumes the schedule | High | UI ladder and 14-hour cap (5.2); polish gated behind G3 |
| Correction checks stay vague | Medium | Use the S1 to S6 and B1 to B6 checks as written |
| Diagnostics look overclaimed | Medium | Closed catalog, `UNKNOWN` and `AMBIGUOUS` paths, label as known-pattern triage |
| Approval and execution confused in code or UI | Medium | Three-layer model, invariants with tests, two badges |
| A second code path writes agent status | Medium | Single transition function; test that no other path writes status |
| Metadata forgotten at write time | Medium | Seed and schema first; add a test that required fields are non-null per event type |
| Buffer too thin | Medium | Gates, time-box rule, cut order |
| Demo breaks live | Medium | Local build, reset button, recorded backup video, no external API dependency |
| Overclaiming | Low to medium | Honesty labels (Section 9) |

---

## 8. The PS5 gap (research in progress)

The core build covers the registry, policy enforcement, human approval, activity trail, pause and restriction, auditability, plus the diagnostics and recovery differentiator. PS5 also lists items the core build does **not** yet cover. Research on these is in progress, and implementation proceeds on the current features in the meantime.

| PS5 requirement | Current status | What research must answer | Where it plugs in |
|---|---|---|---|
| Human-versus-agent work allocation, escalation, exception handling | Not built | Minimum workflow; what decides agent, human approval or direct human handling; one demo workflow | Task type table, `handler` and escalation fields (3.6); approval flow; escalation as a timeout transition |
| Leadership risk, cost, usage and value dashboard | Not built (basic counts from real records are allowed, but must not be presented as the full dashboard) | Which metrics real events support; calculation methods; how estimates are labelled | Read-only queries over events and requests using the 3.6 fields |
| Audit-ready reports and accountability chain | Partial (incident view and audit history) | Fields that complete the story; report format | 3.6 accountability chain; export endpoint and report view |

**Integration rules**
1. Gap modules only read events or add optional fields. They never alter the gateway, evaluator, executor, correction checks or resume gate.
2. The Section 3.6 event model is the contract. It is captured from day one so nothing needs reworking.
3. Review the research as a team before hour 24 and agree a thin scope. Anything not agreed by then stays out. Nothing enters before G3.
4. Until built, describe these items as researched or planned, never as implemented.
5. If time allows, the cheapest additions in order are: counts derived from real events, an incident report export, then a rule table for allocation with handled-by counts.

---

## 9. Honesty labels (for README and pitch)

| Capability | Label |
|---|---|
| Registry, versioned policies, deterministic evaluator | Implemented |
| Backend gateway, protected simulated tools, allow / approval / block | Implemented |
| Separate decision, approval and execution records | Implemented |
| Human approval and rejection with reasons | Implemented |
| Agent status model (`active`, `restricted`, `paused`) and central resume gate | Implemented |
| Append-only audit trail (hash chain if built) | Implemented; tamper-evident, not tamper-proof |
| Diagnostics | Implemented as known-pattern triage over a closed catalog; unknown and ambiguous cases go to a human |
| Sandbox, structural and behavioural checks, verified recovery | Implemented on simulated workflows |
| Agents, tools, resources, data | Simulated (synthetic only) |
| Metadata for allocation, analytics and reports | Captured; analytics and reports not yet built |
| Human-versus-agent allocation, leadership dashboard, full accountability reports | Researched or planned, not implemented |
| Autonomous Systems Governance Infrastructure, real defence or enterprise integrations | Future vision |
| Compliance or regulatory certification, production readiness | Not claimed |

---

## 10. Definition of ready to present

**Enforcement**
- [ ] Blocked and pending requests have no side effects (test)
- [ ] No route reaches a protected tool except through the gateway (test)
- [ ] Missing policy and validator failure both block a high-risk action (tests)

**Decision, approval, execution separation**
- [ ] Every request shows Decision and Execution as separate states
- [ ] Approved-but-revalidation-failed ends as `NOT_EXECUTED (REVALIDATION_FAILED)` with approval still `APPROVED` (test)
- [ ] Rejection never executes; duplicate request and duplicate approval execute at most once (tests)

**Statuses and resume**
- [ ] `active`, `restricted` and `paused` behave exactly as in 3.4 (tests, including elevation of mutating operations in `restricted`)
- [ ] Only `transitionAgentStatus` writes status; only the resume gate leaves `paused` (tests)
- [ ] Resume is refused for unknown or ambiguous diagnoses, failed or stale checks, self-approval, and missing reasons (tests for R1 to R9)

**Diagnostics and recovery**
- [ ] Each catalog signature has positive and negative fixtures; unknown and ambiguous cases return human-investigation results
- [ ] Bad correction fails S2 or S3 and the agent stays paused
- [ ] Safe correction passes S1 to S6 and B1 to B6, is approved by a different human, passes revalidation and resumes
- [ ] Inconclusive checks keep the agent paused

**Metadata**
- [ ] Required Section 3.6 fields are populated for every event type (test)

**Demo**
- [ ] Runs offline from a clean reset; backup video recorded
- [ ] README distinguishes implemented, simulated and planned capabilities
- [ ] Gap items are described honestly as researched or planned
