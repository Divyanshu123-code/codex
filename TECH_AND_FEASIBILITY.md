# AI Governance and Control Plane: Technology and Feasibility

**Project:** CODEX 3.0 PS5 core build  
**Companion documents:** `REQUIREMENTS.md`, `IMPLEMENTATION_PLAN.md`  
**Status:** Working baseline. We are building the current feature set now; the PS5 gap research runs in parallel (Section 8).  
**Note:** All hour figures are rough estimates, not measurements.

---

## 1. Verdict

The core build is **feasible in 36 hours with four people**, provided two conditions hold:

1. The operator console stays minimal (8 screens, polling, a component library).
2. The sandbox and recovery logic is defined precisely (Section 4.3) rather than left vague.

The enforcement path (registry, policy evaluator, gateway, protected tools, approvals, audit) uses well-understood techniques. The risky areas are diagnostics and verified recovery, because they can look hand-wavy to judges if overclaimed, not because they are technically hard.

---

## 2. Technology stack

| Layer | Choice | Reason |
|---|---|---|
| Language | TypeScript on frontend and backend (or JavaScript + Zod if the team prefers) | Shared types and schemas catch integration bugs early |
| Backend | Node 20 + Express | Matches the plan; fast to build |
| Database | **SQLite via `better-sqlite3`** for the local build | Zero setup, synchronous transactions simplify idempotency, works offline. Use Postgres only if a hosted link is also wanted |
| Validation | Zod | Input validation at every endpoint; schemas can be shared with the frontend |
| Policy engine | Plain TypeScript rules (optionally `json-logic-js`) | Deterministic, explainable, no LLM in the enforcement path |
| Human auth | Seeded users, JWT, bcrypt | Server-side role enforcement |
| Agent auth | **Separate agent API keys** | Agent identity must differ from human identity so an agent cannot self-authorize |
| Hashing | `node:crypto` | Optional hash chain for the audit log (tamper-evident) |
| Tests | Vitest + Supertest | Fast; tests the API end to end |
| Frontend | React + Vite, Tailwind, shadcn/ui | Fast to build, easy to restyle |
| Live updates | TanStack Query polling every 2 to 3 seconds | Sufficient; avoids WebSocket complexity |
| Reports | Incident detail view first; PDF (`pdfkit`) only after P0 tests pass | Matches the plan's priority |
| LLM | **None in the core path** | The demo must work offline; removes a failure mode. An LLM may later phrase explanations only |
| Deployment | Local run for the demo; optional hosted build with a reset button | Free hosted tiers can reset SQLite files, so the local build is the reliable one |

---

## 3. Feasibility by component

| Component | Requirement | Feasibility | Est. person-hours | Main risk | Approach |
|---|---|---|---|---|---|
| Agent registry | FR-1 | Easy | 3 | None | CRUD plus status field (`active`, `restricted`, `paused`) |
| Versioned policies | FR-2 | Easy | 3 | Version handling | Immutable rows: a change creates a new version; agents reference a version |
| Policy and limitation validator | FR-4 | Easy | 4 | Missed edge cases | Pure function; table-driven tests |
| Decision gate + protected tools | FR-5 | Easy to moderate | 5 | Proving "no bypass" | Tools private to the executor module (Section 4.2) |
| Human authorization | FR-9 | Moderate | 6 | Double execution, stale policy | State machine plus atomic transition (Section 4.1) |
| Audit trail | FR-10 | Easy | 4 (+2 for hash chain) | Gaps in correlation | One append function used by every state change |
| Violation containment + incidents | FR-6 | Easy | 3 | None | Driven by policy flags `pause_on_violation`, `open_incident` |
| Automated diagnostics | FR-7 | Moderate | 5 | Looks fake if overclaimed | Signature-based classifier (Section 4.5) |
| Sandbox + verified recovery | FR-8 | **Hardest** | 9 | Vague definition | Precise sandbox and diff guard (Section 4.3) |
| Fail-safe behavior | Scenario E | Easy | 2 | None | try/catch returns `BLOCK`; missing policy is default-deny |
| Operator console | FR-11 | Moderate (largest cost) | 18 | Time sink | 8 screens, polling, component library |
| Demo simulator + reset | FR-12 | Easy | 3 | None | Seed script plus demo-only reset endpoint |
| Tests | Phase 9 | Moderate | 8 | Written too late | Write alongside each phase |
| README and demo prep | Definition of done | Easy | 4 | None | Distinguish implemented, simulated and planned |

**Total core: about 70 person-hours.** Four people over 36 hours give roughly 100 effective hours after sleep and overhead, so there is about 30% buffer. With only two or three fully active people the schedule becomes tight.

---

## 4. Key technical decisions

### 4.1 Execution as a state machine

States: `PROPOSED → BLOCKED`, or `PROPOSED → PENDING_APPROVAL → APPROVED → EXECUTING → EXECUTED`, plus `REJECTED`.

Only the executor may move a request into `EXECUTING`, using one atomic statement (`UPDATE ... WHERE status = 'APPROVED'`, then confirm exactly one row changed). This single technique provides idempotency, prevents duplicate approval, and prevents double execution. It covers several listed requirements and tests (duplicate request, duplicate approval, stale policy).

On approval, always re-evaluate against the **current** policy version and agent status before executing.

### 4.2 Proving the tool boundary

In one Node process, "no bypass" is a code-structure claim, so make it testable:

- Protected tools live in a module that exports only the executor function; no route imports a tool directly.
- A test asserts that blocked and pending requests leave simulated state unchanged.
- A test asserts that no endpoint reaches a tool except through the gateway.
- **Stronger option (about 1.5 h):** the executor requires a signed execution token (HMAC over request ID, operation and a hash of the parameters). A direct call without a valid token is rejected and written to the audit log.

### 4.3 Sandbox, diff guard and verified recovery (defined precisely)

- A **correction** is a patch to the agent's *workflow configuration* only (for example, which operation a step calls). It is never a patch to policies, permissions or limits.
- A **diff guard** rejects any patch that touches forbidden fields: permissions, allowed operations, policy references, limits, resource scope. This is what makes "no silent weakening" enforceable in code.
- The **sandbox** clones the synthetic fixture state into memory and replays the corrected workflow through the **original, unmodified policy evaluator**.
- A **regression suite** (a fixed list of must-hold cases, such as delete is blocked, out-of-scope resource is blocked, paused agent is blocked, limits still apply) runs against the corrected configuration.
- **Pass condition:** diff guard clean, replay produces no violations, and every regression case still behaves as expected. Anything else leaves the agent paused or restricted.
- Because the evaluator is a pure function, the sandbox is mostly "call it again with cloned state", which keeps it feasible.

### 4.4 Making Scenario D coherent

Scenario D needs a safe correction to exist. Define it in the seed data:

- The document agent is allowed `read_file` and `write_summary` only.
- Its workflow contains a faulty cleanup step that calls `delete_file`.
- The safe correction removes or replaces that step with an allowed operation.
- For the "bad correction fails" moment, provide a clearly labeled manual "submit correction" action (or a faulty-debugger mode) whose patch grants delete permission, so the diff guard visibly rejects it. Diagnostics themselves never propose this.

### 4.5 What the diagnostics actually are

A deterministic classifier over a small set of failure signatures (disallowed operation, out-of-scope resource, malformed input, repeated workflow error) is credible and feasible. It is **signature-based triage, not general root-cause analysis**. State this plainly in the pitch, and demonstrate the "unknown, human investigation required" path that the plan already supports.

### 4.6 Fail-safe by construction

- Wrap the entire evaluation in try/catch that returns `BLOCK` and writes an audit event.
- Missing policy data is default-deny.
- Test Scenario E explicitly (missing policy, validator exception).

### 4.7 Separation of identities

- Agents authenticate with agent API keys; humans authenticate with JWT.
- Approval endpoints accept only human identities with the reviewer role.
- An agent can never approve its own action or correction.
- Natural-language claims of authority are stored as evidence at most and never used for decisions.

---

## 5. Data model notes

Use the minimal model from the implementation plan (Agent, Policy, Action Request, Approval, Audit Event, Incident, Correction Proposal). Technical additions recommended now so later features do not force rework:

- `action_requests`: add `task_type` (nullable) and `handler` (`agent`, `human`, `escalated`, `blocked`, nullable).
- `audit_events`: always store actor type and ID, agent ID, **agent owner**, policy ID and version, resource reference, decision, outcome, and the correlation IDs (request, incident, correction).
- `corrections`: store the explicit diff and the diff-guard result.
- Audit log is append-only (database trigger rejects UPDATE and DELETE). If hash chaining is added, use canonical JSON and describe it as **tamper-evident, not tamper-proof**.
- Never store secrets in events; prefer resource IDs and safe summaries.

---

## 6. Time mapping (36 hours)

| Hours | Work |
|---|---|
| 0 to 3 | Skeleton, schema, seed, auth, health endpoint, run instructions (Phases 0 and 1) |
| 3 to 10 | Registry, evaluator, gateway, protected tools (Phases 2 and 3), tests alongside |
| From 8 | Frontend starts in parallel against API stubs |
| 10 to 18 | Approvals, audit events, containment, incidents (Phases 4 and 5) |
| 18 to 27 | Diagnostics, sandbox, verified recovery (Phases 6 and 7) |
| 27 to 31 | Failure tests, rehearsal prep (Phase 9), plus any gap features that have been agreed |
| 32 | Feature freeze |
| 32 to 36 | Rehearsal, backup video, reset and README |

**Checkpoints**
- **Hour 10:** a prohibited action cannot change simulated state, and a test proves it.
- **Hour 18:** a held action executes once and only once after approval.
- **Hour 27:** a bad correction fails and leaves the agent paused; a safe correction passes with approval and revalidation.

---

## 7. Risks and mitigations (core build)

| Risk | Likelihood | Mitigation |
|---|---|---|
| UI consumes the schedule | High | Component library, polling, 8 screens only, polish after P0 tests pass |
| Sandbox and recovery is vague | Medium | Use the precise definition in Section 4.3 |
| Diagnostics look overclaimed | Medium | Label as signature-based triage; demo the "unknown" path |
| Duplicate execution or approval bugs | Medium | State machine with atomic transition; explicit tests |
| Demo breaks live | Medium | Local build, reset button, recorded backup video, no external API dependency |
| Differentiator takes too long | Medium | If short on time, prioritize the visible failed-recovery demo (bad correction rejected, agent stays paused) |
| Overclaiming | Low to medium | Keep claims to what is built; label simulated and future items |

---

## 8. The PS5 gap (research in progress)

The core build deliberately covers the registry, policy enforcement, human approval, activity trail, pause and restriction, and auditability, plus the diagnostics and recovery differentiator. PS5 also lists items that the core build does **not** yet cover. Research on these is in progress, and the work below proceeds on the current features in the meantime.

### 8.1 Gap items

| PS5 requirement | Current status | What the research must answer | Where it will plug in |
|---|---|---|---|
| Human-versus-agent work allocation, escalation and exception handling | Not built (deferred) | What minimum workflow satisfies allocation, escalation and exceptions? What decides agent, human approval or direct human handling? One demo workflow and a minimal data model | `task_type` and `handler` fields on action requests; existing approval queue; escalation as a timeout transition in the approval state machine |
| Leadership risk, cost, usage and value dashboard | Not built (basic counts from real records are allowed, but must not be presented as the full dashboard) | Which metrics can real events support? Calculation methods? Which numbers are estimates and how are they labeled? | Read-only queries over audit events and requests; no changes to enforcement |
| Audit-ready reports and a clear accountability chain | Partial (incident detail view and audit history exist) | Which fields complete the accountability story? How are owner, policy version, action, resource reference, approver, outcome and recovery linked? What report format? | Existing audit events and incident record; export endpoint and a report view |

### 8.2 Rules for integrating gap features later

1. **Gap modules only read events or add optional fields.** They must never alter the enforcement path (gateway, evaluator, executor).
2. **The event model is the contract.** Section 5 lists the fields to capture now so no rework is needed.
3. **Decision point:** review the research as a team before hour 24 and agree a thin scope. Anything not agreed by then stays out.
4. **Label honestly.** Until built, describe these items as researched or planned, never as implemented.
5. **If research finishes early,** the cheapest additions are, in order: counts derived from real events, an incident report export, then a rule table for allocation with handled-by counts.

### 8.3 Fields to capture now (so the gap modules plug in later)

- Owner or team on every agent, copied into audit events
- Task type and handler on every action request
- Timestamps for each state transition (supports time-to-decision and escalation metrics)
- Policy ID and version on every decision
- Resource reference (not payload) on every action
- Approver identity, role, reason and timestamp on every approval
- Outcome and recovery status on every incident
- A simulated cost-per-operation setting per agent (nullable; used only if the dashboard is built)

---

## 9. Honesty labels (for README and pitch)

| Capability | Label |
|---|---|
| Agent registry, versioned policies, deterministic evaluator | Implemented |
| Backend gateway, protected simulated tools, allow / approval / block | Implemented |
| Human approval and rejection with reasons | Implemented |
| Append-only audit trail (hash chain if built) | Implemented; tamper-evident, not tamper-proof |
| Containment (pause, restrict, incident) | Implemented |
| Diagnostics | Implemented as signature-based triage |
| Sandbox, diff guard, verified recovery | Implemented on simulated workflows |
| Agents, tools, resources, data | Simulated (synthetic only) |
| Human-versus-agent allocation, leadership dashboard, full accountability reports | Researched / planned, not yet implemented |
| Autonomous Systems Governance Infrastructure, real defence or enterprise integrations | Future vision |
| Compliance or regulatory certification, production readiness | Not claimed |

---

## 10. Definition of ready to present

- [ ] All P0 items from the implementation plan work from a clean reset
- [ ] A test proves blocked and pending actions have no side effects
- [ ] A test proves no route reaches a protected tool except through the gateway
- [ ] Duplicate request and duplicate approval tests pass
- [ ] Bad correction fails and the agent stays paused; safe correction passes with approval and revalidation
- [ ] Missing policy and validator failure both block a high-risk action
- [ ] Demo runs offline with synthetic data; backup video recorded
- [ ] README states implemented, simulated and planned capabilities
- [ ] Gap items are described honestly as researched or planned
