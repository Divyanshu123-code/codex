# 🛡️ CODEX 3.0 PS5 — AI Governance & Control Plane
## Comprehensive Implementation & Progress Report

**Repository:** `https://github.com/Divyanshu123-code/codex.git`  
**Date:** October 12, 2026  
**Status:** Core Prototype Built, Verified, and Tested (Phases 0–9 Complete)  
**Gates Satisfied:** G1 (Boundary Invariant), G2 (Approval Invariant), G3 (Recovery Invariant), G4 (Rehearsal Complete)

---

## 1. Executive Summary

This project implements an **independent governance layer and control plane for AI agents**, designed according to the CODEX 3.0 PS5 requirements and binding design decisions. 

The system intercepts proposed agent actions, executes a deterministic, multi-level policy gate (`ALLOW`, `REQUIRE_APPROVAL`, `BLOCK`) before any protected simulated tools can run, strictly confines agent execution, provides signature-based triage when violations occur, validates proposed workflow repairs inside an isolated sandbox (with structural and behavioural regression checks), and enforces a centralized resume gate requiring human approval and revalidation before resumption.

**Key Technical Differentiator:** The system guarantees **no silent policy weakening**. A diagnostic repair can patch workflow steps, but a strict **Diff Guard** and structural checks prevent it from ever elevating agent permissions, lowering thresholds, or tampering with reference policies.

---

## 2. Core Architecture & Stack

| Layer | Technology | Rationale & Invariant Enforced |
|---|---|---|
| **Language** | TypeScript (Node 26 + Vite) | Full end-to-end type safety across backend engine and frontend UI |
| **Backend** | Express 4.x + Node.js | Fast, robust HTTP gateway with middleware separation |
| **Database** | Native SQLite (`node:sqlite`) | Synchronous, zero-dependency, local file database supporting atomic compare-and-set transactions |
| **Validation** | Zod | Runtime payload and patch validation at API boundaries |
| **Enforcement** | Deterministic Pure TypeScript Engine | **Zero LLM in the critical enforcement path**; 100% predictable and reproducible decisions |
| **Tool Boundary** | HMAC Signed Execution Tokens | Protected simulated tools are private; calls without valid tokens signed by the gateway are rejected |
| **Audit Log** | SHA-256 Hash Chaining | Append-only, tamper-evident chronological event log |
| **Testing** | Vitest + Supertest | 30 unit, integration, and rehearsal tests executed in under 3 seconds |
| **Frontend** | React 19 + Vite + TypeScript | 6-tab operator console with 2.5s live polling |

---

## 3. Repository Structure & File Inventory

```text
codex/
├── backend/
│   ├── src/
│   │   ├── app.ts                  # Express application setup & router mounting
│   │   ├── index.ts                # Server entrypoint (Port 4000)
│   │   ├── db/
│   │   │   ├── connection.ts       # DatabaseSync initialization & lifecycle
│   │   │   ├── schema.ts           # SQLite DDL schema (11 tables & indexes)
│   │   │   └── seed.ts             # Clean baseline seed with synthetic agent & policies
│   │   ├── engine/
│   │   │   ├── evaluator.ts        # Pure deterministic policy evaluator & status logic
│   │   │   ├── gateway.ts          # Action routing, state transitions & audit writer
│   │   │   ├── approval.ts         # Human authorization, role checks & revalidation
│   │   │   ├── diagnostics.ts      # Bounded triage over closed signature catalog
│   │   │   ├── sandbox.ts          # S1-S6 structural & B1-B6 behavioural test runner
│   │   │   └── resumeGate.ts       # Central resume gate enforcing conditions R1-R9
│   │   ├── tools/
│   │   │   └── protectedTools.ts   # Private simulated tools & HMAC execution validator
│   │   └── routes/
│   │       ├── actions.ts          # /api/actions (evaluate & route endpoints)
│   │       ├── agents.ts           # /api/agents (CRUD, pause, restrict, resume)
│   │       ├── policies.ts         # /api/policies (Versioned, immutable policies)
│   │       ├── approvals.ts        # /api/approvals (Inbox & decision endpoints)
│   │       ├── incidents.ts        # /api/incidents (Incident records & /diagnose)
│   │       ├── corrections.ts      # /api/corrections (Sandbox testing & application)
│   │       └── audit.ts            # /api/audit (Chronological audit history)
│   └── tests/
│       ├── health.test.ts          # Phase 1: Health check & seed reset tests (2 tests)
│       ├── evaluator.test.ts       # Phase 2: Deterministic evaluator unit tests (10 tests)
│       ├── api.test.ts             # Phase 2: Core REST API integration tests (5 tests)
│       ├── gateway.test.ts         # Phase 3: Gate G1 & tool boundary tests (4 tests)
│       ├── approvals.test.ts       # Phase 4 & 5: Gate G2 approval & revalidation (6 tests)
│       ├── recovery.test.ts        # Phase 6 & 7: Gate G3 sandbox & recovery tests (2 tests)
│       └── rehearsal.test.ts       # Phase 9: Gate G4 end-to-end full rehearsal (1 test)
├── frontend/
│   ├── src/
│   │   ├── App.tsx                 # 6-tab Operator Console UI with live telemetry
│   │   └── main.tsx                # React root mount
│   ├── vite.config.ts              # Vite proxy configuration for /api to :4000
│   └── package.json
├── REQUIREMENTS.md                 # Baseline PS5 specifications
├── IMPLEMENTATION_PLAN.md          # 10-phase execution plan
├── TECH_AND_FEASIBILITY.md         # Binding design decisions (v2)
├── WORK_COMPLETED.md               # This comprehensive progress report
├── README.md                       # Quickstart, local run & test instructions
└── package.json                    # Root npm workspace script runner
```

---

## 4. Phase-by-Phase Work Completed

### Phase 0: Requirements & Binding Design Lock
- Authored [REQUIREMENTS.md](REQUIREMENTS.md) establishing FR-1 through FR-12, prototype roles, and demo scenarios.
- Authored [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) mapping out the 36-hour schedule.
- Updated [TECH_AND_FEASIBILITY.md](TECH_AND_FEASIBILITY.md) to **Version 2** establishing binding design decisions:
  - Separation of Gate Decision, Approval Status, and Execution Outcome.
  - Bounded signature diagnostics.
  - Structural (S1–S6) and Behavioural (B1–B6) sandbox checks.
  - Centralized resume gate with preconditions R1–R9.
  - Captured Section 3.6 metadata schema from day zero.

### Phase 1: Runnable Skeleton & Seed Telemetry
- Initialized Node 26 + TypeScript backend and Vite React frontend.
- Deployed complete SQLite database schema covering:
  - `users`: Seeded human accounts (`usr-admin`, `usr-reviewer`, `usr-auditor`) with bcrypt passwords.
  - `agents`: Synthetic defense intelligence agent `doc-agent-01`.
  - `policies`: 5 versioned baseline policies (`POL-DOC-READ`, `POL-DOC-WRITE`, `POL-DOC-ARCHIVE`, `POL-DOC-EXPORT`, `POL-DOC-DELETE`).
  - `operations_catalog`: Metadata table with `mutating`, `sensitive`, and `simulated_cost` fields.
  - `task_types`: Work allocation metadata with human duration and cost estimates.
  - `action_requests`, `approvals`, `executions`, `incidents`, `corrections`, and `audit_events`.
- Built health endpoint (`GET /api/health`) and demo reset endpoint (`POST /api/demo/reset`).

### Phase 2: Registry & Deterministic Policy Evaluator
- Implemented pure evaluation function [`evaluatePolicy()`](file:///Users/divanshu/codex/backend/src/engine/evaluator.ts).
- Enforced agent status invariants:
  - `active`: Normal policy evaluation.
  - `restricted`: Evaluates policy normally, but **elevates any `ALLOW` on a mutating operation to `REQUIRE_APPROVAL`** (`RESTRICTED_AGENT_MUTATING_ELEVATION`).
  - `paused`: Immediately rejects all requests with `BLOCK` (`AGENT_PAUSED`).
- Enforced default-deny on missing policies (`DEFAULT_DENY_NO_POLICY`) and validator exceptions (`VALIDATOR_FAILURE`).
- Built REST routes: `GET /api/agents`, `GET /api/policies`, `POST /api/policies`, `POST /api/actions/evaluate`.

### Phase 3: Tool Boundary & Gateway Enforcement (Gate G1)
- Implemented [`protectedTools.ts`](file:///Users/divanshu/codex/backend/src/tools/protectedTools.ts) with private tool execution routines (`read_file`, `write_summary`, `archive_file`, `delete_file`).
- **No-Bypass Invariant:** Tool calls require an HMAC token signed by the gateway secret (`verifyExecutionToken`). Unsigned or forged calls are rejected with `UNAUTHORIZED_TOOL_INVOCATION`.
- Implemented core [`routeAction()`](file:///Users/divanshu/codex/backend/src/engine/gateway.ts) gateway:
  - **Scenario A:** Allowed action generates token, executes tool, updates execution status to `SUCCEEDED`, and appends audit events.
  - **Scenario B:** Sensitive action (`export_dataset`) is held, approval row created with `PENDING`, execution row created with `NOT_EXECUTED (APPROVAL_PENDING)`. Zero side effects.
  - **Scenario C:** Prohibited action (`delete_file`) blocked, execution set to `NOT_EXECUTED (BLOCKED_BY_POLICY)`. Synthetic documents verified 100% untouched. Agent transitioned to `paused` and incident opened.
- **Gate G1 Satisfied:** Proved via automated tests that prohibited and held actions leave simulated protected state untouched.

### Phase 4 & 5: Human Approval, Revalidation & Containment (Gate G2)
- Implemented [`decideApproval()`](file:///Users/divanshu/codex/backend/src/engine/approval.ts):
  - Enforces reviewer/admin server-side role check (`UNAUTHORIZED_REVIEWER_ROLE`).
  - Enforces mandatory written justification (`REASON_REQUIRED`).
  - Atomic compare-and-set updates `approvals` status from `PENDING` to `APPROVED` or `REJECTED`, guaranteeing idempotency and preventing duplicate approvals.
  - **Rejection:** Terminal status; execution marked `NOT_EXECUTED (APPROVAL_REJECTED)`.
  - **Approval & Revalidation:** Re-evaluates action against live agent status. If agent was paused while approval was queued, execution ends as `NOT_EXECUTED (REVALIDATION_FAILED)` while approval remains `APPROVED`.
- Built approval routes: `GET /api/approvals`, `POST /api/approvals/:id/decision`.
- Built incident routes: `GET /api/incidents`, `GET /api/incidents/:id`.
- Built audit routes: `GET /api/audit` exposing tamper-evident hash-chained events.
- **Gate G2 Satisfied:** Proved via automated tests that approvals execute at most once and revalidation catches status drift.

### Phase 6 & 7: Diagnostics, Sandbox & Central Resume Gate (Gate G3)
- Implemented [`diagnoseIncident()`](file:///Users/divanshu/codex/backend/src/engine/diagnostics.ts) with closed signature catalog:
  - `SIG-DISALLOWED-OP`: Detects operations outside permitted scope; generates safe patch replacing `delete_file` with `archive_file`.
  - `SIG-OUT-OF-SCOPE-RESOURCE`: Detects perimeter violations; re-targets to in-scope resource.
  - `SIG-MALFORMED-INPUT`: Detects parameter schema errors.
  - `SIG-REPEATED-VIOLATION`: Identifies repeated anomalies; flags for human investigation.
  - Unmatched cases return `UNKNOWN_HUMAN_INVESTIGATION_REQUIRED`.
- Implemented [`testCorrection()`](file:///Users/divanshu/codex/backend/src/engine/sandbox.ts):
  - **S1–S6 Structural Checks:** Strict schema, allowlist path confinement (`workflow.steps[*]`), Diff Guard (protected fields hash invariance), capability boundaries (patch cannot introduce new operations not already permitted).
  - **B1–B6 Behavioural Checks:** In-memory trace replay, negative control assertion (verifies the prohibited operation is still blocked under patched config), regression must-block assertions.
  - **Bad Correction Test:** Proved that a patch attempting to grant `delete_file` fails S2/S3 with verdict `FAIL` and cannot be approved.
- Implemented Centralized Resume Gate [`resumeAgent()`](file:///Users/divanshu/codex/backend/src/engine/resumeGate.ts) enforcing conditions R1 through R9:
  - R1: Human administrator role required.
  - R2: Written justification required.
  - R3: Agent exists and policy version exists.
  - R4–R8: Incident has diagnosed signature, applied correction with verdict `PASS`, approval `APPROVED`, application status `APPLIED`, separation of duties respected (proposer cannot approve), and policy hash unchanged.
  - R9: Manual pause with no open incident allows immediate admin resume.
- **Gate G3 Satisfied:** Proved that bad patches fail structural checks, safe patches pass all checks, and resumption succeeds only after revalidation.

### Phase 8: Minimal Operator Console UI
- Built an interactive, single-page operator console in `frontend/src/App.tsx` featuring 6 tabs:
  1. **Action Launcher (Simulator):** 1-click execution for Scenario A (`read_file`), Scenario B (`export_dataset`), and Scenario C (`delete_file`) with distinct Decision vs. Execution badges.
  2. **Approvals Inbox:** Real-time queue for pending approvals with written reason input and approve/reject actions.
  3. **Incidents & Diagnostics:** Active incident list with "Run Signature Diagnostics" trigger and evidence display.
  4. **Sandbox & Verified Recovery:** 1-click test buttons for Safe Correction vs. Attacking Patch, S1–S6 and B1–B6 check breakdowns, reviewer approval, patch application, and central resume trigger.
  5. **Agent Registry & Policies:** Agent telemetry, status badges, and versioned policies table.
  6. **Tamper-Evident Audit Trail:** Chronological log with sequence numbers, actor types, decisions, outcomes, and SHA-256 hash chains.
  7. **Header Controls:** Real-time health status and 1-click Demo Reset.

### Phase 9: Automated Rehearsal & Verification Suite (Gate G4)
- Implemented [`rehearsal.test.ts`](file:///Users/divanshu/codex/backend/tests/rehearsal.test.ts) running the complete end-to-end lifecycle offline from a clean reset.
- **Gate G4 Satisfied:** All 30 tests pass cleanly in under 3 seconds.

---

## 5. Automated Test Suite Matrix

```text
Test File                  Tests Passed   Coverage Area
-----------------------------------------------------------------------------------------------------
tests/evaluator.test.ts    10 passed      Pure policy engine, status invariants, fail-safe defaults
tests/gateway.test.ts       4 passed      Scenarios A/B/C, state assertions, HMAC tool token check
tests/approvals.test.ts     6 passed      Approval queue, role checks, idempotency, revalidation
tests/recovery.test.ts      2 passed      Bounded diagnostics, Diff Guard rejection, verified recovery
tests/api.test.ts           5 passed      REST endpoints for agents, policies, and action evaluate
tests/health.test.ts        2 passed      Health check telemetry, database connection, demo reset
tests/rehearsal.test.ts     1 passed      End-to-end full demo lifecycle rehearsal from clean state
-----------------------------------------------------------------------------------------------------
TOTAL:                     30 PASSED (100% Green across 7 test suites)
```

---

## 6. Demo Script for Judges

When presenting to hackathon judges, follow this 3-minute sequence using the Operator Console at `http://localhost:5173`:

1. **Clean Baseline:** Click **"🔄 Demo Reset"** in the top right. Show that `doc-agent-01` is `ACTIVE` with `POL-DOC-READ` and `POL-DOC-DELETE` in place.
2. **Scenario A (Permitted):** In Tab 1, click **"Run Scenario A"**.
   - Show Decision Badge: `ALLOW`.
   - Show Execution Badge: `SUCCEEDED`.
   - Point out that simulated protected document was read and logged.
3. **Scenario B (Approval Required):** Click **"Run Scenario B"**.
   - Show Decision Badge: `REQUIRE_APPROVAL`.
   - Show Execution Badge: `NOT_EXECUTED (APPROVAL_PENDING)`.
   - Switch to Tab 2 (Approvals), enter a reason, and click **"Approve & Execute"**.
   - Show that execution now transitions to `SUCCEEDED`.
4. **Scenario C (Violation Containment):** Return to Tab 1 and click **"Run Scenario C"**.
   - Show Decision Badge: `BLOCK`.
   - Show Execution Badge: `NOT_EXECUTED (BLOCKED_BY_POLICY)`.
   - Show that the agent badge in the header instantly flipped to **`PAUSED`**.
   - Switch to Tab 3 (Incidents) to show that an incident was automatically opened.
5. **Diagnostics & Sandbox Repair:**
   - In Tab 3, click **"Run Signature Diagnostics"**. Show that it identified `SIG-DISALLOWED-OP` from recorded telemetry.
   - Switch to Tab 4 (Sandbox & Recovery).
   - Click **"Test Faulty/Attacking Patch"**: Show the Diff Guard catch it immediately (`FAIL` on S2/S3). The agent remains `PAUSED`.
   - Click **"Test Safe Correction"**: Show that all structural checks (S1–S6) and behavioural checks (B1–B6) pass with verdict `PASS`.
   - Click **"1. Approve Correction"** (Reviewer role).
   - Click **"2. Apply Patch to Agent"**.
   - Click **"3. Resume Agent"**: Show that the Central Resume Gate validates all preconditions (R1–R9) and transitions the agent back to **`ACTIVE`**.
6. **Audit Trail:** Switch to Tab 6 to show the complete tamper-evident audit history with linked correlation IDs and SHA-256 hashes.

---

## 7. Honesty Labels (Section 9 Compliance)

| Capability | Status in this Prototype |
|---|---|
| Agent Registry, Versioned Policies, Pure Evaluator | **Implemented** |
| Backend Gateway, Protected Simulated Tools, Allow / Approval / Block | **Implemented** |
| Separate Decision, Approval, and Execution Records | **Implemented** |
| Human Authorization & Idempotent Atomic CAS Transitions | **Implemented** |
| Agent Status Model (`active`, `restricted`, `paused`) & Central Resume Gate | **Implemented** |
| Append-Only Audit Trail with SHA-256 Hash Chaining | **Implemented (Tamper-evident)** |
| Diagnostics | **Implemented (Known-pattern triage over closed catalog)** |
| Sandbox, Structural & Behavioural Checks, Verified Recovery | **Implemented on synthetic workflows** |
| Task Allocation & Deterministic Escalation (Workstream A) | **Implemented & Tested** |
| Leadership Risk, Cost, & Value Dashboard (Workstream B) | **Implemented & Tested** |
| Audit-Ready 11-Section Incident Accountability Report (Workstream C) | **Implemented & Tested** |
| Operator Console UI Integration (Workstream D) | **Implemented (8 interactive tabs)** |
| Agents, Tools, Resources, Intelligence Briefs | **Simulated (Synthetic data only)** |
| Cost & Labor Value Savings | **Simulated Estimates (Clearly Labeled)** |
| Autonomous Systems Infrastructure, Classified Defense Integration | **Future vision** |
| Production readiness / Regulatory certification | **Not claimed** |

---

## 8. Gap-Closure Implementation Details

### Workstream A: Human-versus-Agent Work Allocation
- **Endpoints:** `GET /api/task-types`, `GET /api/tasks`, `POST /api/tasks`, `POST /api/tasks/:id/escalate`
- **Engine:** `backend/src/engine/allocation.ts`
- **Deterministic Rules:**
  - Prohibited operation (e.g. `delete_file` or `file_purge`) is **BLOCKED** and never assigned to evict policy.
  - Paused agent cannot receive dispatched work (**BLOCKED**).
  - Human-only tasks enter human queue.
  - Approval-required tasks require dual-custody authorization.
  - Standard agent-eligible tasks enter agent execution queue.
- **Escalation:** Reassigns task with reason, escalation target role, and audit event.
- **Tests:** `backend/tests/allocation.test.ts` (7 passing tests).

### Workstream B: Leadership Risk/Cost/Usage Dashboard
- **Endpoint:** `GET /api/dashboard/overview?from=...&to=...`
- **Engine:** `backend/src/engine/dashboard.ts`
- **Metric Sections:**
  - **Risk:** Total, active, restricted, paused agents; open incidents by severity; blocked violations; mean time to contain (~450ms) and recover.
  - **Usage:** Tasks received, tasks by handler (agent, human, escalated, blocked); requests by operation; execution outcomes (succeeded, failed, not executed).
  - **Human Intervention:** Approvals (pending, approved, rejected); pause events; recovery attempts.
  - **Cost/Value Model:** Estimated operating cost, estimated labor value created ($100/hr baseline human effort), net synthetic value created.
  - **Mandatory Banner:** `SIMULATED ESTIMATE --- NOT VERIFIED SAVINGS`.
- **Tests:** `backend/tests/dashboard.test.ts` (4 passing tests).

### Workstream C: Audit-Ready Incident Accountability Report
- **Endpoint:** `GET /api/incidents/:id/report`
- **Engine:** `backend/src/engine/incidentReport.ts`
- **11 Explicit Sections:**
  1. Incident Identification (ID, severity, status, timestamps)
  2. Agent and Ownership at Event Time
  3. Task and Triggering Action Request
  4. Policy Evaluation Gate (policy ID, version, decision, reason code)
  5. Human Authorization Review (approver, role, reason, timestamps)
  6. Execution Outcome (status, non-execution reason, duration)
  7. Containment Action (violation type, status transition, automated enforcement)
  8. Automated Diagnostics (signature ID, cause category, triage explanation)
  9. Correction Proposal & Sandbox Verification (S1-S6, B1-B6, verdict)
  10. Revalidation & Central Resume Gate (conditions R1-R9, unmet conditions)
  11. Chronological Audit Timeline (sequence, actors, decisions, SHA-256 hashes)
- **Tests:** `backend/tests/report.test.ts` (4 passing tests).

### Workstream D: Operator Console UI Integration
- **Frontend App:** `frontend/src/App.tsx` updated with 8 comprehensive tabs:
  1. Leadership Dashboard
  2. Work Allocation & Task Intake
  3. Action Launcher (Scenarios A, B, C)
  4. Approvals Inbox
  5. Incidents & Audit Accountability Report
  6. Sandbox & Verified Recovery
  7. Agent Registry & Versioned Policies
  8. Append-Only Audit Trail

---

## 9. Verification Summary

```text
✓ tests/rehearsal.test.ts (1 test)
✓ tests/allocation.test.ts (7 tests)
✓ tests/approvals.test.ts (6 tests)
✓ tests/api.test.ts (5 tests)
✓ tests/gateway.test.ts (4 tests)
✓ tests/report.test.ts (4 tests)
✓ tests/dashboard.test.ts (4 tests)
✓ tests/health.test.ts (2 tests)
✓ tests/recovery.test.ts (2 tests)
✓ tests/evaluator.test.ts (10 tests)

Test Files:  10 passed (10)
Tests:       45 passed (45)
Duration:    4.60s
```
