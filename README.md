# 🛡️ AegisOS — Defence AI Governance & Human Accountability Control Plane

**Hackathon CODEX 3.0 — Problem Statement 5 (PS5): AI Agent Governance & Control Plane**  
*An Independent Deterministic Governance Layer for Autonomous Systems (Synthetic, Non-Operational Data Only).*

[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.5-brightgreen.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Frontend-React%2019%20%2B%20Vite-646CFF.svg)](https://vitejs.dev)
[![Tests](https://img.shields.io/badge/Tests-72%20passing%20%2F%2013%20suites-success.svg)]()
[![License](https://img.shields.io/badge/Classification-UNCLASSIFIED%20%2F%20SYNTHETIC-orange.svg)]()

> **⚠️ DEMO ENVIRONMENT NOTICE & DEFENCE SCOPE DISCLAIMER:**  
> This platform is an unclassified academic/hackathon demonstration running on strictly synthetic, simulated, non-operational data. It possesses **zero** connectivity to classified networks, operational defence infrastructure, real weapon systems, or live command-and-control networks. All agent actions, telemetry, sensor streams, and tool executions occur inside an isolated simulated sandbox.

---

## 🎯 1. The Problem Statement (PS5 Breakdown)

### The Core Challenge
Autonomous AI agents are increasingly entrusted with complex, multi-step tasks across enterprise, aerospace, cyber, and defence-support operations. These agents can ingest sensory telemetry, form plans, and autonomously invoke tools (databases, firewalls, provisioning scripts, external APIs).

However, autonomous systems introduce existential operational risks:
1. **The "Monitoring is Too Late" Fallacy:** Passive post-execution logging or dashboard monitoring is useless once an agent executes an unauthorized, destructive, or invalid command (e.g., wiping firewall credentials, dispatching faulty maintenance work orders, or executing actions based on corrupted sensor feeds).
2. **LLM Non-Determinism & Hallucination:** Relying on Large Language Models for self-policing or policy evaluation is fundamentally insecure. LLMs suffer from prompt injections, hallucinations, probabilistic drift, and unpredictable edge-case handling.
3. **Privilege Widening in Self-Healing ("Silent Degradation"):** When autonomous systems detect failures and attempt self-correction, automated debuggers often secretly loosen security rules, lower safety thresholds, or grant unauthorized permissions simply to make tasks succeed.
4. **Lack of Dual-Custody & Cryptographic Accountability:** In high-consequence domains, high-risk operations cannot be unilateral; they require verifiable human dual-custody, mandatory written operational justification, atomic state synchronization, and tamper-evident audit trails.

---

## 💡 2. What We Built to Solve PS5: AegisOS

**AegisOS** is an **independent, zero-trust governance control plane** situated strictly between autonomous AI agents and protected execution environments. Agents have **zero direct credentials** to tools. Every single tool invocation must be proposed as an action, evaluated against immutable policies and numerical sensor quality rules, and validated before execution can occur.

```
+-------------------------------------------------------------------------------------------------------+
|                                        AEGISOS CONTROL PLANE                                          |
|                                                                                                       |
|   +--------------------+       +------------------------------------+       +---------------------+   |
|   |  Autonomous Agent  | ----> |  Deterministic Decision Gateway    | ----> |   Protected Tools   |   |
|   |  (No Credentials)  |       |  (Zero LLM, Input Quality Precond) |       |  (HMAC Token Only)  |   |
|   +--------------------+       +------------------------------------+       +---------------------+   |
|                                                  |                                                    |
|                                       [Hold / Require Approval]                                       |
|                                                  v                                                    |
|                                +------------------------------------+                                 |
|                                |   Human-in-the-Loop Dual Custody   |                                 |
|                                |   (Atomic CAS + Revalidation)      |                                 |
|                                +------------------------------------+                                 |
|                                                  |                                                    |
|                                             [Violation]                                               |
|                                                  v                                                    |
|                                +------------------------------------+                                 |
|                                | Closed Triage & Diff Guard Sandbox |                                 |
|                                | (Central Recovery Gate R1 - R9)    |                                 |
|                                +------------------------------------+                                 |
+-------------------------------------------------------------------------------------------------------+
```

### The 4 Core Architectural Invariants (G1–G4)
- **G1 — Boundary Invariant (Strict Zero Side-Effects):** Actions that evaluate to `BLOCK` or `REQUIRE_APPROVAL` produce strictly **zero** tool execution or state mutation. Protected tools remain completely untouched.
- **G2 — Approval Invariant (Dual-Custody with Revalidation):** Sensitive or uncertain actions require explicit human approval with mandatory written rationale. Before firing, execution tokens revalidate that agent and policy states have not drifted between approval and execution.
- **G3 — Recovery Invariant (Diff Guard & Anti-Widening):** Diagnostics propose workflow patches, but the **Diff Guard** strictly rejects patches that expand permissions, drop required checks, or weaken policy thresholds. Recovery requires passing structural (S1–S6), behavioural (B1–B6), and the central **R1–R9 checklist**.
- **G4 — Deterministic Authority (Zero LLM in the Critical Path):** Enforcement decisions (`ALLOW`, `REQUIRE_APPROVAL`, `BLOCK`) are governed entirely by pure, deterministic TypeScript evaluators and cryptographic checks.

---

## 🔄 3. End-to-End Governance Flowcharts

### Flowchart 1: Action Proposal & Deterministic Enforcement Pipeline
Every tool action proposed by an agent passes through this gateway. An action cannot touch a simulated tool without a time-limited HMAC-SHA256 signed execution token.

```mermaid
flowchart TD
    A["Autonomous Agent Proposes Tool Action"] --> B["AegisOS Action Gateway (POST /api/actions/route)"]
    
    subgraph S1 ["Phase 1: Deterministic Quality & Preconditions"]
        B --> C{"Agent Status Check"}
        C -- "Paused / Restricted" --> C1["BLOCK: Execution Halted"]
        C -- "Active" --> D{"Input Quality Preconditions"}
        D -- "Sensor Range Violation" --> D1["BLOCK: Out-of-bounds Sensor Telemetry"]
        D -- "Stale Telemetry (>3600s)" --> D2["ELEVATE: Require Approval (Stale Evidence)"]
        D -- "Multi-source Evidence Conflict" --> D3["ELEVATE: Require Approval (Conflicting Feed)"]
        D -- "Passed & Fresh" --> E["Evaluate Deterministic Policies"]
    end

    subgraph S2 ["Phase 2: Policy Engine Evaluation"]
        E --> F{"Policy Decision"}
        F -- "Prohibited Operation" --> G["BLOCK Decision"]
        F -- "Sensitive / Restricted" --> H["REQUIRE_APPROVAL Decision"]
        F -- "Allowed & Verified" --> I["ALLOW Decision"]
    end

    subgraph S3 ["Phase 3: Execution vs Containment"]
        I --> J["Generate HMAC-SHA256 Signed Tool Token"]
        J --> K["Dispatch to Protected Tool (Zero Direct Agent Access)"]
        K --> L["Record Result in Append-Only Audit Trail"]

        H --> M["Hold Action in Dual-Custody Approval Queue"]
        M --> N["Zero Side Effects: Tool Remains Untouched (G1)"]

        G --> O["Containment: Auto-Pause Agent & Log Incident"]
        C1 --> C1_BLOCK["BLOCK: Execution Halted (Agent Already Paused)"]
        D1 --> D1_BLOCK["BLOCK: Zero Tool Execution (Sensor Out of Bounds; Agent Remains Active)"]
        O --> P["Emit Tamper-Evident SHA-256 Audit Event"]
        C1_BLOCK --> P
        D1_BLOCK --> P
    end

    style S1 fill:#1e293b,stroke:#3b82f6,stroke-width:2px,color:#fff
    style S2 fill:#0f172a,stroke:#6366f1,stroke-width:2px,color:#fff
    style S3 fill:#111827,stroke:#10b981,stroke-width:2px,color:#fff
```

> **Deterministic Containment vs. Out-of-Range Sensor Blocks:**  
> - **Prohibited Policy Breach (`pause_on_violation === 1`):** Triggers immediate containment. The gateway transitions the agent status to `PAUSED`, opens an immutable incident record in the database, and prevents all further operations until formal recovery.  
> - **Sensor-Range Violation (`INPUT_VALUES_OUT_OF_RANGE`):** Strictly halts execution with **zero tool side-effects**, but **does NOT auto-pause the agent** (`pauseOnViolation: false`). The agent remains `ACTIVE` so it can continue processing future nominal telemetry feeds without unnecessary operational outages.

---

### Flowchart 2: Human-in-the-Loop Dual-Custody Approval
Guards against unauthorized execution, human bypass, and race conditions via Atomic Compare-And-Swap (CAS) and pre-execution revalidation.

```mermaid
flowchart TD
    A["Action Placed in Pending Queue (REQUIRE_APPROVAL)"] --> B["Operator Opens AegisOS Approval Inbox"]
    
    B --> C["Inspect 6-Domain Evidence Matrix"]
    C --> D{"Reviewer Role & Decision"}
    
    D -- "Reject with Written Reason" --> E["Atomic CAS: State -> REJECTED"]
    E --> F["Rejection is Terminal: Zero Execution (Cannot proceed unless reopened via backup re-review)"]
    
    D -- "Approve with Written Rationale" --> G["Atomic CAS: State -> APPROVED"]
    G --> H{"Post-Approval Revalidation"}
    H -- "Agent was Paused in Interim" --> I["Revalidation Fails: Execution Aborted"]
    H -- "Policy Version Modified" --> I
    H -- "Agent & Policy Intact" --> J["Generate One-Time HMAC-SHA256 Token"]
    
    J --> K["Execute Protected Simulated Tool"]
    K --> L["Append Full Decision & Rationale to Audit Trail"]

    style D fill:#1e293b,stroke:#f59e0b,stroke-width:2px,color:#fff
    style H fill:#0f172a,stroke:#ef4444,stroke-width:2px,color:#fff
    style K fill:#111827,stroke:#10b981,stroke-width:2px,color:#fff
```

> **Terminal Rejection & Reopening Invariant:**  
> An approval rejection is terminal and irreversible through normal approval endpoints. To prevent unrecoverable operational lockouts while maintaining dual-custody rigor, AegisOS allows administrative supervisors to re-examine rejected requests via **Scenario Backup Re-Review** (`POST /api/backups/:id/reopen`). Reopening cryptographically verifies the SHA-256 snapshot hash and generates a fresh dual-custody approval record with immutable audit linkage.

---

### Flowchart 3: Closed Diagnostics, Sandbox Regression & Central Recovery Gate (R1–R9)
When an agent is paused due to a violation, AegisOS enforces closed diagnostic signature triage, sandbox verification, and a central recovery checklist to prevent permission widening.

```mermaid
flowchart TD
    A["High-Severity Breach (e.g. SIG-DISALLOWED-OP)"] --> B["Agent PAUSED & Incident Logged"]
    B --> C["Closed Diagnostic Engine Classifies Signature"]
    C --> D["Generate Correction Proposal (Code/Config Patch)"]
    
    subgraph Sandbox ["Isolated Sandbox Verification"]
        D --> E{"Diff Guard Check"}
        E -- "Attempts Permission Widening / Rule Loosening" --> F["Diff Guard REJECT: Patch Prohibited (G3)"]
        E -- "Safe Constrained Patch" --> G["Structural Verification (S1 - S6)"]
        G --> H["Behavioural Regression Tests (B1 - B6)"]
    end
    
    H --> I{"Sandbox Tests Pass?"}
    I -- "Failure" --> J["Agent Remains PAUSED"]
    I -- "Success" --> K["Human Reviewer Approves Verified Patch"]
    
    subgraph Gate ["Central Recovery Gate (R1 - R9 Checklist in resumeGate.ts)"]
        K --> L{"R1: Caller is Admin & R2: Written Reason?"}
        L --> M{"R3: Agent & Policy Version Exist?"}
        M --> N{"R4: Open Incidents Evaluated? (If None -> R9 Direct Resume)"}
        N -- "Incidents Exist" --> O{"R5: Valid Catalog Signature Diagnosis?"}
        O --> P{"R6: Applied Correction Verified (PASS / APPROVED / APPLIED)?"}
        P --> Q{"R7: Separation of Duties & R8: Policy Hash Match?"}
    end
    
    Q -- "All Passed" --> R["Agent Restored to ACTIVE Status"]
    Q -- "Any Check Fails" --> J

    style Sandbox fill:#1e293b,stroke:#8b5cf6,stroke-width:2px,color:#fff
    style Gate fill:#0f172a,stroke:#3b82f6,stroke-width:2px,color:#fff
    style R fill:#111827,stroke:#10b981,stroke-width:2px,color:#fff
```

#### Central Resume Gate: Real R1–R9 Invariants (from `backend/src/engine/resumeGate.ts`)
Resumption of any paused agent is strictly centralized in `evaluateResumeEligibility()`:

| Condition | Verification Rule | Code Implementation in `resumeGate.ts` |
| :---: | :--- | :--- |
| **R1** | **Administrator Role Required** | Caller must possess human administrator credentials (`actor.role === 'admin'`). |
| **R2** | **Mandatory Written Justification** | Non-empty written reason must be supplied by the operator (`reason.trim().length > 0`). |
| **R3** | **Agent & Policy Exist** | Target agent must exist in database (not terminated) and its configured `policy_version` must be active. |
| **R4** | **Open Incident Assessment** | Queries open incidents (`status != 'RESOLVED'`). If 0 open incidents exist, condition **R9** applies. |
| **R5** | **Catalog Diagnosis Recorded** | Every open incident must have a resolved catalog signature (cannot be null, `UNKNOWN`, or `AMBIGUOUS`). |
| **R6** | **Verified & Applied Correction** | An associated correction must exist with `verdict === 'PASS'`, `approval_status === 'APPROVED'`, and `application_status === 'APPLIED'`. |
| **R7** | **Separation of Duties** | Correction approver must be an authorized reviewer/admin who is neither the proposer nor the agent itself (`approver_id !== proposer_id` and `approver_id !== agentId`). |
| **R8** | **Live Policy Hash Match** | Current SHA-256 hash of all policies must match `appliedCorr.policy_hash` captured during sandbox testing, guaranteeing policies did not drift. |
| **R9** | **Manual Pause Fast Path** | For manual administrative pauses where zero open incidents exist, conditions **R1–R3** suffice for safe resumption. |

---

## 🧩 4. System Components & Architecture

AegisOS is built across a modular backend and a high-fidelity tactical operator frontend:

```
codex/
├── backend/                        # Node.js (>=22.5) + Express + TypeScript Backend
│   ├── src/
│   │   ├── engine/                 # Core Governance Logic
│   │   │   ├── evaluator.ts        # Pure deterministic policy decision engine
│   │   │   ├── gateway.ts          # Action routing, state transitions & HMAC tool tokens
│   │   │   ├── inputQuality.ts     # Numerical sensor profiles, freshness & conflict checks
│   │   │   ├── approval.ts         # Dual-custody workflow, CAS transitions, revalidation
│   │   │   ├── diagnostics.ts      # Closed signature catalog & root-cause classifier
│   │   │   ├── sandbox.ts          # S1–S6 structural, B1–B6 behavioural & Diff Guard
│   │   │   ├── resumeGate.ts       # Central R1–R9 resumption checklist validator
│   │   │   ├── incidentReport.ts   # 11-section formal accountability report generator
│   │   │   ├── llmClient.ts        # Advisory LLM (env-configurable, offline fallback)
│   │   │   ├── allocation.ts       # Deterministic task intake & role escalation
│   │   │   └── dashboard.ts        # Governance telemetry & executive risk engine
│   │   ├── tools/
│   │   │   └── protectedTools.ts   # Protected simulated tools & HMAC-SHA256 validator
│   │   ├── routes/                 # Express REST API routes (actions, agents, backups, etc.)
│   │   └── db/                     # SQLite schema, connection & clean baseline seed
│   └── tests/                      # 12 Vitest test suites (67 passing tests)
│
└── frontend/                       # React 19 + Vite + Tailwind Operator Console
    └── src/
        ├── components/
            ├── Header.tsx          # Institutional header & global status indicator
            ├── Sidebar.tsx         # Section navigation with dynamic counters
            ├── OverviewView.tsx    # Governance status, KPI metrics & attention panel
            ├── AgentsView.tsx      # Agent fleet registry with slide-out drawer
            ├── PoliciesView.tsx    # Versioned policy explorer & rule inspector
            ├── ApprovalsView.tsx   # Tri-state dual-custody approval workbench
            ├── IncidentsView.tsx   # Incident response & 11-section report viewer
            ├── CorrectionsView.tsx # Diff viewer, sandbox test matrix & R1–R9 gate
            ├── TasksView.tsx       # Intake task registry & human escalation bounds
            ├── AuditLogView.tsx    # Tamper-evident hash strip & event inspector
            ├── BackupsView.tsx     # Immutable scenario backups, re-review & reinstatement
            └── ScenarioLauncherModal.tsx # Interactive 1-click test scenario runner
        ├── types.ts                # Frontend TypeScript interfaces
        └── App.tsx                 # Real-time state synchronization
```

---

## 🧪 5. Synthetic Demonstration Scenarios

AegisOS includes built-in synthetic test scenarios mirroring realistic high-consequence support workflows:

| Scenario | Agent Category | Trigger Action | Evaluator Result | Governance Outcome |
| :--- | :--- | :--- | :---: | :--- |
| **Scenario 1** | Predictive Maintenance | Telemetry analysis with fresh sensor data | `ALLOW` | One-time HMAC token issued; simulated work order created in `protectedTools.ts`. |
| **Scenario 2A** | Predictive Maintenance | Missing mandatory telemetry fields | `BLOCK` | Request blocked before tool call (`MISSING_REQUIRED_INPUT_FIELDS`). Zero side-effects; agent remains active. |
| **Scenario 2B** | Predictive Maintenance | Telemetry analysis with stale data (>300s) | `REQUIRE_APPROVAL` | Ticket held in queue (`STALE_TELEMETRY_HELD_FOR_HUMAN`); zero tool mutation. Human reviewer inspects evidence and authorizes ticket with written rationale. |
| **Scenario 2C** | Predictive Maintenance | Out-of-bounds sensor values (vibration > 15) | `BLOCK` | Numerical check fails (`INPUT_VALUES_OUT_OF_RANGE`); zero tool mutation. Agent is **not** auto-paused (remains active for next cycle). |
| **Scenario 3** | Cybersecurity Monitoring | Unauthorized `wipe_credentials` execution | `BLOCK` | Prohibited policy triggered. Agent paused, containment incident logged, protected enclave untouched. |
| **Scenario 4** | Tactical Decision Support | Ingest contradictory UAV vs Radar reconnaissance | `REQUIRE_APPROVAL` | Conflicting sensor vectors detected; recommendation held for human intelligence analyst validation. |
| **Scenario 5** | System Recovery & Repair | Patch proposal with Diff Guard validation | `RECOVERY FLOW` | Patch tested in sandbox (S1–S6, B1–B6). Central Resume Gate validates R1–R9 checklist before agent restoration. |
| **Scenario 6** | Finance / Delegated Ops | Delegated refund ($4,000 <= $5,000 auto limit) | `ALLOW` | Autonomous threshold met; payment executed directly in synthetic protected ledger. |
| **Scenario 7** | Finance / Delegated Ops | Delegated refund ($6,000 > $5,000 auto limit) | `REQUIRE_APPROVAL` | Threshold exceeded; held for dual-custody approval. Auto-creates immutable SHA-256 scenario backup for administrative re-review. |

---

## ⚡ 6. Quickstart & Installation

### Prerequisites
- **Node.js** >= 22.5 (Node 22.5+ or Node 26 required for native `node:sqlite`)
- **npm** >= 10

### 1. Installation
Clone the repository and install dependencies for both the backend and frontend:
```bash
git clone https://github.com/Divyanshu123-code/codex.git
cd codex

# Install backend dependencies
npm install --prefix backend

# Install frontend dependencies
npm install --prefix frontend
```

### 2. Database Initialization & Seeding
Initialize the SQLite database (`backend/data/governance.db`) with synthetic agents, versioned policies, sample users, and baseline task types:
```bash
npm run seed
```

### 3. Run Automated Tests
Execute the full test suite comprising 72 automated tests across 13 test files:
```bash
npm test
```
*All 72 tests validate deterministic policy decisions, sensor bounds, stale telemetry holds, prohibited containment, atomic CAS approvals, Diff Guard rejections, scenario backups, administrative reopening, and R1–R9 resume gates.*

### 4. Launch the Platform
Start the backend API server and frontend operator console:
```bash
# Terminal 1: Backend API (runs on Port 4000)
npm run dev:backend

# Terminal 2: Frontend Operator Console (runs on Port 5173)
npm run dev:frontend
```

Open your browser at **`http://localhost:5173`**.

---

## 🖥️ 7. Operator Console Walkthrough

The **AegisOS Operator Console** provides an institutional, military-grade interface tailored for governance reviewers, system administrators, and compliance auditors:

1. **Governance Overview:** High-level status cards (Active Fleet, Pending Approvals, Containment Incidents, 24h Policy Outcomes), actionable "Needs Attention" queue, and live enforcement pulse.
2. **Agent Fleet Registry:** Real-time agent status indicators (`ACTIVE`, `RESTRICTED`, `PAUSED`). Clicking any agent opens the **Inspection Drawer** displaying allowed tools, sensor validation thresholds, and active policies.
3. **Policy Matrix:** Browse active and draft policies with deterministic rule breakdowns and severity levels.
4. **Dual-Custody Approvals:** Tri-state inbox (`Pending`, `Approved`, `Rejected`). Each request features a 6-domain evidence validation badge, raw JSON payload viewer, role selector, and mandatory written rationale box.
5. **Incident Response & 11-Section Reports:** Triage active violations, view the immutable event timeline, and inspect the full 11-section formal accountability report.
6. **Controlled Corrections & Central Resume Gate:** Review proposed workflow diffs, run isolated sandbox tests (S1–S6 structural, B1–B6 behavioural), and execute the R1–R9 checklist to resume contained agents safely.
7. **Tamper-Evident Audit Log:** Browse append-only cryptographic event records, inspect raw payloads, and verify SHA-256 hash linkage integrity with one click.
8. **Quick Scenario Launcher (`⌘K` or Header Button):** Instantly trigger any of the 5 synthetic demonstration scenarios to see live gate decisions in action.

---

## 🔒 8. Security & Cryptographic Guarantees

- **HMAC-SHA256 Execution Tokens:** Protected simulated tools reject all execution requests lacking a valid, time-limited cryptographic token signed by the governance gateway.
- **Atomic Compare-And-Swap (CAS):** Approval state transitions use atomic database updates (`WHERE status = 'pending'`), completely preventing double-approval race conditions.
- **Tamper-Evident Hash Chaining:** Every audit log event computes `SHA256(index + timestamp + eventType + payload + previousHash)`, establishing an immutable verification trail.
- **Permission Widening Prevention:** The `Diff Guard` mathematically inspects patch diffs; any patch that attempts to add new tool scopes or relax policy constraints fails immediately with an invariant violation.

---

## 📄 9. Verification & Compliance Baseline

| Metric | Status | Detail |
| :--- | :--- | :--- |
| **Backend Unit & Integration Tests** | ✅ 67 / 67 Passing | 12 test suites covering engine, gateway, approvals, sandbox, backups, and scenarios. |
| **Frontend Production Build** | ✅ 0 Errors | Pure TypeScript strict mode + Vite build (`tsc -b && vite build`). |
| **LLM Dependency in Decision Path** | ❌ None (0%) | 100% deterministic TypeScript evaluation. |
| **Rehearsal & Reset** | ✅ Verified | Clean database reset and state re-seeding supported via `npm run seed`. |

---

*AegisOS is engineered for the Hackathon CODEX 3.0 PS5 challenge. Built with precision, safety, and human accountability at the core.*
