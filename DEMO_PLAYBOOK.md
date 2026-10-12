# AegisOS — Defence AI Governance Control Plane
## Judges' Live Demonstration Playbook (5-Minute Rehearsal Script)

**System URL**: `http://localhost:5173`  
**Backend API**: `http://localhost:4000`  
**Environment**: `DEMO_MODE=true` (Synthetic, Non-Operational Defence Exercise Enclave)

---

### Seeded Credentials & Role Matrix

| Display Persona | Role ID | Authority Level | Capabilities | Demo Password |
| :--- | :--- | :---: | :--- | :--- |
| **Commander / System Authority** | `admin` | **Level 2** | Full clearance: Dual-key 2nd approval, policy corrections, overrides, reopen, demo resets | `password123` |
| **Secondary Commander (2nd Authority)** | `admin2` | **Level 2** | Independent 2nd commander: Approves reopened requests previously rejected by admin 1, TPI co-signer | `password123` |
| **Duty Officer** | `reviewer` | **Level 1** | Operational clearance: Approvals/rejections up to $15,000 threshold, first-signatory for TPI | `password123` |
| **Inspector** | `auditor` | **Level 0** | Independent oversight: Read-only access across all enclaves, audit verification, exports | `password123` |

> [!TIP]
> **Presenter Quick-Switch**: When logged in, click the **"Switch Role"** pill in the top-right header (or select persona on Login screen) to instantly swap personas without typing credentials.
>
> **Reopened Request Governance**: If Commander 1 (`admin`) rejects an action request and it is later reopened, the system blocks `admin` from approving it (`SEPARATION_OF_DUTIES_VIOLATION`). Switch to **`admin2`** to provide the required independent secondary administrator clearance.

---

### Step-by-Step 5-Minute Demonstration Flow

#### 1. The Operational Enclave & Doctrinal Mapping (30s)
1. **Navigate to Overview Dashboard (`/`)**:
   - Point out the prominent top banner: `DEMO ENVIRONMENT — SYNTHETIC, NON-OPERATIONAL DATA ONLY (EXERCISE ENCLAVE)`.
   - Open the **Defence Governance Mapping** panel: highlight mappings to UK MOD JSP 936, US DoD Directive 3000.09 (Human Autonomy in Weapons/Command Systems), NATO STANAG 2014, and JSP 440.
   - Explain the core architecture: **Pre-execution interlock gateway** that evaluates policies before tool invocations touch protected systems.

#### 2. Live Agent Console — Deterministic Enforcement (90s)
1. **Navigate to Live Agent Console (`/live-agent`)**:
   - Show the 6 deterministic Defence Mission Presets:
   - **Preset 1 (Spares 4,000)**: Click `Run Mission`. Result: **`ALLOW`** (within $5,000 single requisition authority).
   - **Preset 2 (Requisition 6,000)**: Click `Run Mission`. Result: **`HOLD (REQUIRE_APPROVAL)`** (exceeds single requisition threshold, holds for Duty Officer review).
   - **Preset 3 (Split Requisition 5x 2,000)**: Click `Run Mission`.
     - Watch steps 1–4 ($8,000) pass, and step 5 breach the $8,000 / 24h rolling velocity cap.
     - Result: **`HOLD (CUMULATIVE_CAP_EXCEEDED)`** — prevents smurfing/split-transaction evasion.
   - **Preset 4 (Maintenance Log Prompt Injection)**: Click `Run Mission`.
     - Payload contains adversarial prompt injection attempting a 50,000 credit exfiltration.
     - Result: **`HOLD`** — policy rule violation contained before execution.
   - **Preset 5 (Cyber Agent Wipe Credentials)**: Click `Run Mission`.
     - Rogue action attempting `wipe_credentials`.
     - Result: **`BLOCK + AUTO-PAUSE`** — agent is immediately isolated with zero human polling latency.
   - **Preset 6 (Conflicting Equal-Grade Sensor Reports)**: Click `Run Mission`.
     - Conflicting UAV vs Satellite reports of equal Admiralty grade (`A1` vs `A1`).
     - Result: **`HOLD (CONFLICTING_INTELLIGENCE_EQUAL_GRADE_HELD)`** — holds for human commander resolution.

#### 3. Human Clearances, Delegation Matrix & Two-Person Integrity (60s)
1. **Navigate to Approvals View (`/approvals`)**:
   - Filter by `PENDING`. Select the held 6,000 spares requisition.
   - Click **Approve**. As Duty Officer (`reviewer`), approvals up to $15,000 succeed.
   - Show Separation of Duties: Approver cannot approve their own initiated requests.
   - For high-consequence containment actions (`isolate_host`, `wipe_credentials`):
     - First approval transitions request to **`PENDING_SECOND_APPROVAL`**.
     - Attempting approval by the same operator is strictly blocked (**`TWO_PERSON_INTEGRITY_VIOLATION`**).
     - Switch to Commander (`admin`) to apply the second signatory.

#### 4. The "Turn Red" Moment — Tamper-Evidence & Hash Chaining (60s)
1. **Navigate to Audit Trail (`/audit`)**:
   - Point out the sequential SHA-256 Merkle chain strip (`GENESIS ➔ #EVT-01 ➔ #EVT-02 ➔ HEAD`).
   - Click **"Verify Hash Chain"**:
     - System displays a **Green Banner**: `Cryptographic Audit Verification Passed — All N chain links verified intact`.
   - Click **"Simulate Tamper (Demo)"**:
     - Simulates an out-of-band unauthorized database mutation.
     - **The Banner Instantly Turns Red**: `TAMPER DETECTED — Cryptographic Chain Integrity Breached at Block #2 (evt-inc-demo-001)`!
     - Explains to judges: Any modified payload, forged prev-hash, or reordered sequence is mathematically impossible to hide.
   - Click **"Re-Seed Clean Ledger"**: Ledger immediately restores to clean verified state.
   - Click **"CSV"** and **"JSON"** buttons to show compliance export.

#### 5. Incident Containment & NATO 12-Section After-Action Report (60s)
1. **Navigate to Security Incidents (`/incidents`)**:
   - Select an incident (e.g. `inc-demo-001`).
   - Click **"Run Signature Triage"**: Closed-loop diagnostic categorizes root cause within 0ms.
   - Click **"View 12-Section AAR"**:
     - Expand Section 12 (*Lessons Identified & Doctrinal Recommendations*).
     - Note cryptographic hash chain sequence proof and deterministic findings.
   - Click **"AAR (MD)"**: Downloads the complete Markdown After-Action Report document ready for command staff review.

---

### Technical Highlights to Emphasize to Judges

1. **Zero Polling & Zero Sleep Loops**: All interlocks and verification pipelines run deterministically in-band.
2. **True Backward Compatibility**: Clean operational framing with zero breaking changes to existing APIs (`issue_refund`, `POL-REFUND-01`).
3. **Defense-in-Depth**:
   - Pre-execution gateway prevents unsafe side-effects before they happen.
   - Two-Person Integrity prevents single-operator rogue actions.
   - Rolling cumulative caps prevent temporal evasion.
   - SHA-256 hash chains guarantee post-execution immutability and auditability.
4. **Complete Offline Capability**: Runs 100% locally with zero external network or paid API dependency in demo mode.
