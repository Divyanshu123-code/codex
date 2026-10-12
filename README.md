# 🛡️ AegisOS — Defence AI Governance & Human Accountability Control Plane

**Hackathon CODEX 3.0 PS5** — Independent Governance Layer for Autonomous Defence Systems (Synthetic, Non-Operational Data Only).

> **DEMO ENVIRONMENT NOTICE:** This platform is an unclassified demonstration running on synthetic, non-operational data. It has no connection to classified networks, operational command systems, real weapons, or live defence infrastructure.

---

## 📖 Overview

**AegisOS** provides a deterministic policy gate, input-quality preconditions, and uncertainty hold boundaries for autonomous AI systems operating in defence-relevant support domains. 

Before any protected tool action is permitted to run, AegisOS evaluates the proposal against immutable versioned policies, numerical sensor validation profiles, data freshness windows, and multi-source evidence conflict detectors.

### Core Governance Invariants (G1–G4)
- **G1 (Boundary Invariant):** Blocked and held requests have strictly zero protected side effects. Simulated tools remain untouched.
- **G2 (Approval Invariant):** Mutating or sensitive actions require human approval with written justification; execution tokens revalidate agent and policy state before firing.
- **G3 (Recovery Invariant):** Workflows can be repaired, but a Diff Guard prevents patches from elevating permissions or tampering with reference policies.
- **G4 (Deterministic Authority):** **Zero LLM in the critical enforcement path**. All gate decisions (`ALLOW`, `REQUIRE_APPROVAL`, `BLOCK`) are pure, reproducible, and verifiable.

---

## 🤖 Synthetic Demonstration Agents

1. **Predictive Maintenance Agent (`agent-pred-maint-01`)**
   - **Category:** `predictive_maintenance`
   - **Purpose:** Analyze synthetic vehicle telemetry and schedule maintenance tickets.
   - **Preconditions:** Enforces vibration (10–120 Hz), temperature (20–130°C), hydraulic pressure (1000–3500 psi) ranges, 3600s freshness window, and max uncertainty 0.35.
2. **Cybersecurity Monitoring Agent (`agent-cyber-monitor-02`)**
   - **Category:** `cybersecurity_monitoring`
   - **Purpose:** Inspect synthetic DMZ security logs and enforce bounded containment (host isolation, IP blocking).
   - **Boundary Enforcement:** High-impact `wipe_credentials` operation is explicitly prohibited; triggers immediate containment pause and incident logging.
3. **Tactical Decision Support Agent (`agent-decision-support-03`)**
   - **Category:** `decision_support`
   - **Purpose:** Synthesize multi-source reconnaissance reports and formulate tactical recommendations for human commanders.
   - **Preconditions:** Flags contradictory observations between intelligence feeds (e.g., conflicting movement vectors) and holds recommendations for human analyst review.

---

## 🚀 Quickstart

### Prerequisites
- Node.js >= 20 (Node 22 or 26 recommended)
- npm >= 10

### 1. Installation
Install all dependencies for backend and frontend:
```bash
npm install --prefix backend
npm install --prefix frontend
```

### 2. Database Setup & Seeding
Initialize the SQLite database with synthetic agents, policies, task types, operations catalog, and users:
```bash
npm run seed
```

### 3. Run Automated Tests
Execute the 57 automated unit, integration, and defence scenario tests:
```bash
npm run test:backend
```

### 4. Start Development Servers
Start both backend (:4000) and frontend (:5173):
```bash
# Terminal 1: Backend (Port 4000)
npm run dev:backend

# Terminal 2: Frontend (Port 5173)
npm run dev:frontend
```

Open your browser at `http://localhost:5173`.

---

## 🧪 Demonstration Scenarios in Operator Console

- **Scenario 1 (Permitted Maintenance):** Fresh synthetic telemetry evaluates to `ALLOW` ➔ Ticket created via HMAC signed token.
- **Scenario 2 (Stale Telemetry Hold):** Stale telemetry (>3600s old) evaluates to `REQUIRE_APPROVAL` ➔ Ticket creation held for human, zero side effects.
- **Scenario 3 (Prohibited Cyber Action):** Attempted credential wipe evaluates to `BLOCK` ➔ Agent paused, incident opened, protected enclave untouched.
- **Scenario 4 (Conflicting Reconnaissance):** Contradictory UAV vs Radar observations evaluate to `REQUIRE_APPROVAL` ➔ Held for human intelligence analyst.
- **Scenario 5 (Sandbox Verification & Central Resume Gate):** Sandbox verifies patch with structural (S1–S6) and behavioural (B1–B6) checks; central gate enforces preconditions R1–R9 before agent resumption.

---

## 📊 Verification Baseline
- **Backend Tests:** 57 tests passing across 11 test files (`vitest`).
- **Frontend Build:** Clean compilation with Vite + React 19 (`tsc -b && vite build`).
- **Audit Logging:** Append-only SHA-256 hash chaining on all events.
- **Incident Reports:** Comprehensive 11-section accountability reports linking requests, policies, human decisions, and sandbox verification.
