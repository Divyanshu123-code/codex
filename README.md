# 🛡️ AI Governance and Control Plane

CODEX 3.0 PS5 Core Build — Synthetic Agent Enforcement Boundary, Bounded Diagnostics & Verified Recovery.

## 📖 Overview
An independent governance layer for AI agents that monitors proposed tool actions, evaluates them against versioned deterministic policies, and enforces `ALLOW`, `REQUIRE_APPROVAL`, or `BLOCK` before protected tools execute. When violations occur, it pauses the agent, opens an auditable incident, runs signature-based diagnostics, and requires regression-tested, human-approved recovery.

Companion documents:
- [REQUIREMENTS.md](REQUIREMENTS.md) — PS5 Core requirements and demo scenarios
- [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) — Phase-by-phase build plan
- [TECH_AND_FEASIBILITY.md](TECH_AND_FEASIBILITY.md) — Binding design decisions and technical specs

---

## 🚀 Quickstart

### Prerequisites
- Node.js >= 20 (Node 22 or 26 recommended)
- npm >= 10

### 1. Installation
Install all dependencies:
```bash
npm install --prefix backend
npm install --prefix frontend
```

### 2. Database Setup & Seeding
Initialize the SQLite database with synthetic users, policies, task types, operations catalog, and `doc-agent-01`:
```bash
npm run seed
```

### 3. Run Automated Tests
Execute the Vitest test suite:
```bash
npm run test:backend
```

### 4. Start Development Servers
Start both backend and frontend:
```bash
# Terminal 1: Backend (Port 4000)
npm run dev:backend

# Terminal 2: Frontend (Port 5173)
npm run dev:frontend
```

Open your browser at `http://localhost:5173`.

---

## 🧪 Current Status: Phase 1 Complete
- **Backend:** Node.js + Express + TypeScript with native SQLite (`node:sqlite`).
- **Database Schema:** Full Section 3.6 schema with agents, versioned policies, task types, operations catalog, action requests, approvals, executions, incidents, corrections, and audit log.
- **Seeded Agent:** `doc-agent-01` with faulty cleanup routine ready for Scenario C/D.
- **Test Harness:** Vitest + Supertest passing integration checks.
- **Frontend Skeleton:** React + Vite operator console skeleton with health polling and demo reset.
