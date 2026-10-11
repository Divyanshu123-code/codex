# AI Governance and Control Plane

## Final Requirements — CODEX 3.0 PS5 Prototype

**Status:** Implementation baseline for the hackathon  
**Product direction:** AI Governance and Control Plane  
**Long-term vision:** Expand toward Autonomous Systems Governance Infrastructure  
**Initial examples:** Defence-oriented organizational workflows using synthetic data  
**Scope rule:** Build the governance, enforcement, diagnostics, and verified-recovery core first. Human-versus-agent allocation, leadership analytics, and expanded accountability reporting remain a parallel research track until the teammate's findings are reviewed.

## 1. Product Summary

The product is an independent governance layer for AI agents. It records what each agent is permitted to do, observes agent responses and proposed tool actions, evaluates them against explicit policies, and enforces a decision before a protected action executes.

When a violation or unexpected behaviour is detected, the system blocks or pauses the relevant action, captures evidence, diagnoses the likely cause, and may propose a correction. A correction must not silently weaken the original policy or expand agent permissions. It must be tested against the original requirements and regression checks, and receive human approval when required. An agent may resume only after required validation and authorization succeed.

The prototype must demonstrate real backend enforcement using a simulator and simulated tools. It must not connect to real defence systems, classified information, or production infrastructure.

## 2. Problem and Core Promise

AI agents produce responses and invoke tools or external systems. Organizations need to know whether those actions remain within assigned capabilities, permissions, and policies. Monitoring alone is insufficient: unauthorized actions must be blocked before execution, decisions must be auditable, and recovery must not weaken the original safety rules.

**Core promise:** Prevent prohibited actions, explain policy decisions, and support safe, verifiable recovery without silently weakening the rules.

This is not a chatbot and not merely a dashboard. The backend decision gate and protected tool-execution boundary are the core of the product.

## 3. Prototype Roles

- **Administrator:** Manage agents and policies; pause/restrict agents; inspect incidents and audit records.
- **Reviewer/Approver:** Review assigned requests and proposed corrections; approve or reject with a reason.
- **Auditor/read-only viewer:** Inspect activity, policy versions, incidents, and reports without changing state.
- **Simulated agent:** Submit proposed actions through the governance API. It has no direct credentials for protected simulated tools.

Roles must be enforced by the server, not only by the UI.

## 4. In-Scope Functional Requirements

### FR-1: Agent Registry
Each agent has a unique ID, name, owner/team, purpose, allowed tasks/tools/operations, resource/data scope, restrictions, risk category, status (`active`, `restricted`, `paused`), associated policy version, and timestamps.

### FR-2: Versioned Policies
Policies have stable IDs and versions and define the applicable agent/group, action/tool/resource, conditions or limits, decision (`allow`, `require_approval`, `block`), severity, and response behavior. Decisions must be explainable by reference to the rule. An LLM must not be the sole enforcement mechanism.

### FR-3: Execution Monitoring
Record agent requests, proposed actions, tool/operation, resource reference, policy decision and explanation, execution result or non-execution reason, correlation/request ID, and timestamps. Monitor outputs where practical; tool-action enforcement is mandatory.

### FR-4: Policy and Limitation Validator
Before execution, validate agent identity and status, registration, tool/operation permission, resource scope, required parameters, configured limits, and approval requirements. If policy data is missing or a high-risk decision is inconclusive, fail safely by blocking or pausing the action.

### FR-5: Decision Gate and Protected Tool Execution
Every protected simulated action must pass through the backend gateway:
- **ALLOW:** Execute the permitted simulated action and record the result.
- **REQUIRE_APPROVAL:** Hold the action; do not execute until authorized approval.
- **BLOCK:** Do not execute; record the decision and violation where applicable.

The agent must not directly invoke protected tools. Backend enforcement is required; UI-only checks are insufficient.

### FR-6: Violation Containment
Block a violating action before execution, record evidence, apply the configured response, pause/restrict the agent for configured high-severity violations, and open an incident when required. Administrators can pause agents. Resumption must respect recovery conditions.

### FR-7: Automated Diagnostics
A diagnostic component uses recorded evidence to identify the failed rule and classify a likely cause. Deterministic diagnostics are acceptable and preferred for the first version. A diagnostic result includes incident/request reference, failed rule and policy version, evidence, likely cause/category, proposed correction, and explicit description of what would change.

Diagnostics propose corrections; they do not apply them automatically.

### FR-8: Controlled Correction and Verified Recovery
A correction must be recorded as a proposal, tested in an isolated simulator/sandbox, checked against original policy requirements and regression tests, approved by a human when required, applied only after checks pass, and followed by revalidation before resumption. The debugger must not silently disable rules, lower limits, grant permissions, or modify the original policy to make a failing test pass. If checks fail or recovery is inconclusive, the agent remains paused/restricted.

### FR-9: Human Authorization
Support approval/rejection of selected high-impact actions and proposed corrections. Record request/proposal ID, reviewer identity/role, decision, reason/comment, timestamp, policy version, and relevant evidence. Rejection never executes an action. Approval does not bypass unrelated policy checks.

### FR-10: Audit Trail
Record an append-only logical history of agent registration/status changes, policy versions, proposed actions and decisions, approvals/rejections, execution outcomes, violations/pauses, diagnostics/correction proposals, sandbox/regression results, and recovery/resumption/termination. Correlate events so an auditor can follow a request from proposal to outcome and recovery. If hash chaining is implemented, describe it as tamper-evident, not tamper-proof.

### FR-11: Minimal Operator Console
Provide screens for agent registry/status, policies and versions, action simulation, decision results, pending approvals, violations/incidents, diagnostic findings, correction proposals/test results, recovery status, pause/restrict controls, and audit history. Show clearly whether an action is pending, blocked, executed, or never executed.

### FR-12: Demo Simulator and Reset
Use synthetic agents, policies, resources, and actions so judges can repeat the demo. A reset may restore the demo database to a known state but must be clearly labelled as demo-only.

## 5. Required Demo Scenarios

Use generic synthetic organizational data. Defence examples must be non-operational and unclassified.

### Scenario A — Permitted action
A read-only document agent reads an authorized synthetic file and generates a summary. Expected: `ALLOW`, simulated execution, and an audit record.

### Scenario B — High-impact action requiring approval
An agent proposes a configured sensitive operation. Expected: `REQUIRE_APPROVAL`, with no execution while pending. On approval, revalidate and execute once; on rejection, never execute. Record the decision and result.

### Scenario C — Prohibited action and containment
A read-only agent attempts to delete a file. Expected: `BLOCK` before execution, evidence recorded, and—if configured high severity—agent paused/restricted and incident opened.

### Scenario D — Diagnosis and recovery
Diagnostics identify the failed rule and record a likely cause. A correction is proposed without granting delete permission or weakening the policy. Run sandbox/regression checks against the original rules. If checks fail, keep the agent paused. If checks pass, obtain required human approval and resume only after revalidation. A safe correction may fix the workflow to use an allowed operation; if no safe correction exists, keep the agent paused.

### Scenario E — Fail-safe behavior
Simulate missing policy data or validator failure. Expected: the protected high-risk action is blocked or paused, and the failure is logged.

## 6. Non-Functional and Safety Requirements

- **Independent enforcement:** Policy engine and gateway are separate from the monitored agent.
- **Least privilege:** Each agent receives only permissions needed for its tasks.
- **Fail-safe defaults:** Missing/inconclusive validation must not permit high-risk actions.
- **No self-authorization:** An agent cannot approve its own action or correction.
- **No silent policy weakening:** Diagnostics cannot make tests pass by weakening policy.
- **Idempotency:** Retries must not execute a sensitive simulated action more than once.
- **Traceability:** Use request/correlation IDs across events.
- **Server-side authorization:** Enforce roles and approval permissions in the backend.
- **Synthetic data only:** No classified, sensitive, or production data.
- **Honest claims:** Distinguish implemented, simulated, and future capabilities.

## 7. Explicitly Deferred Scope

These areas are deferred while a teammate researches the PS5 gaps:
- Full human-versus-agent task allocation and workforce scheduling.
- Comprehensive leadership risk/cost/usage/value analytics.
- Production-grade multi-tenant SaaS hardening.
- Real integrations with defence or enterprise systems.
- Autonomous modification of agent source code.
- Unconstrained self-modification or automatic policy changes.
- Support for every agent framework or autonomous software category.
- Claims of certification, regulatory compliance, or production readiness.

Basic counts derived from actual prototype records are acceptable, but must not be presented as the full leadership dashboard required by PS5.

## 8. Acceptance Criteria

The core prototype is ready when:
1. A registered agent performs a permitted simulated action.
2. A prohibited action is blocked before the simulated tool changes state.
3. A high-impact action remains unexecuted until an authorized human approves it.
4. Rejection never executes the action.
5. A configured violation can pause/restrict the agent and open an incident.
6. Decisions and state changes are correlated in the audit history.
7. Diagnostics identify the failed rule and cite evidence.
8. Corrections are tested against the original policy and regression tests.
9. Failed or inconclusive validation keeps the agent restricted.
10. Successful recovery requires configured checks and approvals.
11. Debugging cannot silently grant permissions or weaken policies.
12. Missing policy data or validator failure blocks a high-risk action.
13. All scenarios can be repeated using synthetic data and a documented demo reset.

## 9. Alignment with PS5

This core build addresses the agent registry, policy/permission enforcement, human approval, activity trail, agent pause/restriction, and auditability requirements. Automated diagnostics and verified recovery are the proposed technical differentiator.

The teammate's parallel research should cover the remaining explicit PS5 requirements: human-versus-agent work allocation and escalation, leadership risk/cost/usage/value dashboard, and complete audit-ready accountability reports. Integrate those features after the research is reviewed and scope is agreed.
