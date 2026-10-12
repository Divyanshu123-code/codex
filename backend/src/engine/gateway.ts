import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../db/connection.js';
import {
  evaluatePolicy,
  AgentRecord,
  PolicyRecord,
  OperationCatalogRecord,
  ActionInput
} from './evaluator.js';
import {
  executeProtectedTool,
  generateExecutionToken
} from '../tools/protectedTools.js';

export interface RouteActionResult {
  requestId: string;
  gateDecision: 'ALLOW' | 'REQUIRE_APPROVAL' | 'BLOCK';
  gateReasonCode: string;
  explanation: string;
  approvalStatus?: 'PENDING' | 'APPROVED' | 'REJECTED';
  executionStatus: 'NOT_STARTED' | 'EXECUTING' | 'SUCCEEDED' | 'FAILED' | 'NOT_EXECUTED';
  nonExecutionReason?: string;
  incidentId?: string;
  evidenceChecks?: any;
  result?: any;
}

const GATEWAY_SECRET = process.env.AGENT_GATEWAY_SECRET || 'codex_gateway_hmac_secret_2026';

/**
 * Single function authorized to transition an agent's status (Section 3.4)
 */
export function transitionAgentStatus(
  agentId: string,
  toStatus: 'active' | 'restricted' | 'paused',
  actor: { type: 'system' | 'human'; id: string },
  reason: string,
  db?: DatabaseSync
): void {
  const targetDb = db || getDatabase();
  const agentRow = targetDb.prepare('SELECT status, owner_user_id, policy_version FROM agents WHERE id = ?').get(agentId) as any;
  if (!agentRow) {
    throw new Error(`Cannot transition status: agent ${agentId} not found.`);
  }

  const fromStatus = agentRow.status;
  if (fromStatus === toStatus) {
    return; // idempotent
  }

  const now = Date.now();
  targetDb.prepare(`
    UPDATE agents
    SET status = ?, updated_at = ?
    WHERE id = ?
  `).run(toStatus, now, agentId);

  // Write audit event
  writeAuditEvent({
    eventType: 'AGENT_STATUS_TRANSITIONED',
    actorType: actor.type,
    actorId: actor.id,
    agentId,
    agentOwner: agentRow.owner_user_id,
    policyId: null,
    policyVersion: agentRow.policy_version,
    resourceReference: null,
    decision: 'ALLOW',
    outcome: 'STATUS_CHANGED',
    requestId: null,
    incidentId: null,
    correctionId: null,
    safeDetails: { fromStatus, toStatus, reason }
  }, targetDb);
}

/**
 * Append-only audit log writer with SHA-256 hash chaining (Section 3.6, FR-10)
 */
export function writeAuditEvent(
  event: {
    eventType: string;
    actorType: 'system' | 'human' | 'agent';
    actorId: string;
    agentId: string | null;
    agentOwner: string | null;
    policyId: string | null;
    policyVersion: string | null;
    resourceReference: string | null;
    decision: string | null;
    outcome: string | null;
    requestId: string | null;
    incidentId: string | null;
    correctionId: string | null;
    safeDetails: any;
  },
  db?: DatabaseSync
): string {
  const targetDb = db || getDatabase();
  const lastEvent = targetDb.prepare('SELECT sequence, hash FROM audit_events ORDER BY sequence DESC LIMIT 1').get() as any;

  const sequence = lastEvent ? lastEvent.sequence + 1 : 1;
  const prevHash = lastEvent ? lastEvent.hash : null;
  const eventId = `evt-${Date.now()}-${sequence}`;
  const now = Date.now();

  const hashPayload = JSON.stringify({
    eventId,
    sequence,
    eventType: event.eventType,
    actorType: event.actorType,
    actorId: event.actorId,
    agentId: event.agentId,
    prevHash,
    timestamp: now
  });

  const hash = crypto.createHash('sha256').update(hashPayload).digest('hex');

  targetDb.prepare(`
    INSERT INTO audit_events (
      id, sequence, event_type, actor_type, actor_id, agent_id, agent_owner_at_time,
      policy_id, policy_version, resource_reference, decision, outcome,
      request_id, incident_id, correction_id, safe_details, prev_hash, hash, timestamp
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    eventId,
    sequence,
    event.eventType,
    event.actorType,
    event.actorId,
    event.agentId,
    event.agentOwner,
    event.policyId,
    event.policyVersion,
    event.resourceReference,
    event.decision,
    event.outcome,
    event.requestId,
    event.incidentId,
    event.correctionId,
    JSON.stringify(event.safeDetails),
    prevHash,
    hash,
    now
  );

  return eventId;
}

/**
 * Core Gateway router: processes proposed actions through the decision gate
 * and protected tool boundary (FR-3, FR-5, Section 3.2).
 */
export function routeAction(
  action: ActionInput,
  actor: { type: 'agent' | 'human'; id: string },
  db?: DatabaseSync
): RouteActionResult {
  const targetDb = db || getDatabase();
  const requestId = `req-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const now = Date.now();

  // 1. Fetch Agent
  const agentRow = targetDb.prepare('SELECT * FROM agents WHERE id = ?').get(action.agent_id) as any;
  const agent: AgentRecord | null = agentRow ? {
    id: agentRow.id,
    name: agentRow.name,
    agent_category: agentRow.agent_category || 'document_analysis',
    status: agentRow.status,
    allowed_operations: JSON.parse(agentRow.allowed_operations),
    allowed_resources: JSON.parse(agentRow.allowed_resources),
    policy_version: agentRow.policy_version,
    input_requirements: agentRow.input_requirements ? JSON.parse(agentRow.input_requirements) : {},
    uncertainty_rule: agentRow.uncertainty_rule ? JSON.parse(agentRow.uncertainty_rule) : {}
  } : null;

  // 2. Fetch Policies
  const policyRows = targetDb.prepare('SELECT * FROM policies').all() as any[];
  const policies: PolicyRecord[] = policyRows.map((p) => ({
    id: p.id,
    version: p.version,
    name: p.name,
    applicable_agent_id: p.applicable_agent_id,
    operation: p.operation,
    resource_pattern: p.resource_pattern,
    decision: p.decision,
    severity: p.severity,
    pause_on_violation: p.pause_on_violation,
    open_incident: p.open_incident
  }));

  // 3. Fetch Operations Catalog
  const opRows = targetDb.prepare('SELECT * FROM operations_catalog').all() as any[];
  const catalog = new Map<string, OperationCatalogRecord>();
  for (const op of opRows) {
    catalog.set(op.operation, {
      operation: op.operation,
      mutating: op.mutating,
      sensitive: op.sensitive,
      simulated_cost: op.simulated_cost
    });
  }

  // 4. Run pure evaluation
  const evaluation = evaluatePolicy(agent, action, policies, catalog);

  // 5. Insert action_requests row (State: PROPOSED -> Evaluated)
  targetDb.prepare(`
    INSERT INTO action_requests (
      id, agent_id, agent_category, tool, operation, resource, parameters, evidence_checks,
      task_type, handler, handler_reason, resource_sensitivity, correlation_id,
      gate_decision, gate_reason_code, policy_id, policy_version, explanation,
      received_at, gated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    requestId,
    action.agent_id,
    agent ? agent.agent_category || 'document_analysis' : 'unknown',
    action.tool,
    action.operation,
    action.resource,
    JSON.stringify(action.parameters || {}),
    evaluation.evidenceChecks ? JSON.stringify(evaluation.evidenceChecks) : null,
    'document_analysis',
    evaluation.decision === 'ALLOW' ? 'agent' : evaluation.decision === 'REQUIRE_APPROVAL' ? 'human' : 'blocked',
    evaluation.reasonCode,
    evaluation.severity === 'high' ? 'confidential' : 'unclassified',
    requestId,
    evaluation.decision,
    evaluation.reasonCode,
    evaluation.policyId || null,
    evaluation.policyVersion || null,
    evaluation.explanation,
    now,
    now
  );

  // 6. Write GATE_DECIDED Audit Event
  writeAuditEvent({
    eventType: 'GATE_DECIDED',
    actorType: actor.type,
    actorId: actor.id,
    agentId: action.agent_id,
    agentOwner: agentRow ? agentRow.owner_user_id : null,
    policyId: evaluation.policyId || null,
    policyVersion: evaluation.policyVersion || null,
    resourceReference: action.resource,
    decision: evaluation.decision,
    outcome: evaluation.reasonCode,
    requestId,
    incidentId: null,
    correctionId: null,
    safeDetails: { tool: action.tool, operation: action.operation, explanation: evaluation.explanation }
  }, targetDb);

  // 7. Branch on Decision
  if (evaluation.decision === 'ALLOW') {
    // Generate signed execution token
    const token = generateExecutionToken(requestId, action.operation, action.resource, GATEWAY_SECRET);

    // Record execution started
    const execId = `exec-${requestId}`;
    targetDb.prepare(`
      INSERT INTO executions (id, request_id, status, created_at)
      VALUES (?, ?, 'EXECUTING', ?)
    `).run(execId, requestId, now);

    writeAuditEvent({
      eventType: 'EXECUTION_STARTED',
      actorType: 'system',
      actorId: 'gateway-executor',
      agentId: action.agent_id,
      agentOwner: agentRow ? agentRow.owner_user_id : null,
      policyId: evaluation.policyId || null,
      policyVersion: evaluation.policyVersion || null,
      resourceReference: action.resource,
      decision: 'ALLOW',
      outcome: 'IN_PROGRESS',
      requestId,
      incidentId: null,
      correctionId: null,
      safeDetails: { operation: action.operation }
    }, targetDb);

    // Call protected tool executor
    try {
      const toolOutput = executeProtectedTool(
        token,
        requestId,
        action.operation,
        action.resource,
        action.parameters || {},
        GATEWAY_SECRET
      );

      targetDb.prepare(`
        UPDATE executions
        SET status = 'SUCCEEDED', duration_ms = ?, result_reference = ?, executed_at = ?
        WHERE id = ?
      `).run(toolOutput.durationMs, JSON.stringify(toolOutput.result), Date.now(), execId);

      writeAuditEvent({
        eventType: 'EXECUTION_SUCCEEDED',
        actorType: 'system',
        actorId: 'gateway-executor',
        agentId: action.agent_id,
        agentOwner: agentRow ? agentRow.owner_user_id : null,
        policyId: evaluation.policyId || null,
        policyVersion: evaluation.policyVersion || null,
        resourceReference: action.resource,
        decision: 'ALLOW',
        outcome: 'SUCCESS',
        requestId,
        incidentId: null,
        correctionId: null,
        safeDetails: { resultSummary: 'Operation completed successfully' }
      }, targetDb);

      return {
        requestId,
        gateDecision: 'ALLOW',
        gateReasonCode: evaluation.reasonCode,
        explanation: evaluation.explanation,
        executionStatus: 'SUCCEEDED',
        evidenceChecks: evaluation.evidenceChecks,
        result: toolOutput.result
      };
    } catch (toolErr: any) {
      targetDb.prepare(`
        UPDATE executions
        SET status = 'FAILED', non_execution_reason = ?, executed_at = ?
        WHERE id = ?
      `).run(toolErr.message, Date.now(), execId);

      writeAuditEvent({
        eventType: 'EXECUTION_FAILED',
        actorType: 'system',
        actorId: 'gateway-executor',
        agentId: action.agent_id,
        agentOwner: agentRow ? agentRow.owner_user_id : null,
        policyId: evaluation.policyId || null,
        policyVersion: evaluation.policyVersion || null,
        resourceReference: action.resource,
        decision: 'ALLOW',
        outcome: 'FAILED',
        requestId,
        incidentId: null,
        correctionId: null,
        safeDetails: { error: toolErr.message }
      }, targetDb);

      return {
        requestId,
        gateDecision: 'ALLOW',
        gateReasonCode: evaluation.reasonCode,
        explanation: evaluation.explanation,
        executionStatus: 'FAILED',
        evidenceChecks: evaluation.evidenceChecks,
        nonExecutionReason: toolErr.message
      };
    }
  }

  if (evaluation.decision === 'REQUIRE_APPROVAL') {
    // Record pending approval
    const approvalId = `appr-${requestId}`;
    targetDb.prepare(`
      INSERT INTO approvals (id, request_id, status, requested_at)
      VALUES (?, ?, 'PENDING', ?)
    `).run(approvalId, requestId, now);

    // Record execution NOT_EXECUTED (APPROVAL_PENDING)
    const execId = `exec-${requestId}`;
    targetDb.prepare(`
      INSERT INTO executions (id, request_id, status, non_execution_reason, created_at)
      VALUES (?, ?, 'NOT_EXECUTED', 'APPROVAL_PENDING', ?)
    `).run(execId, requestId, now);

    targetDb.prepare(`
      UPDATE action_requests
      SET approval_requested_at = ?
      WHERE id = ?
    `).run(now, requestId);

    writeAuditEvent({
      eventType: 'APPROVAL_REQUESTED',
      actorType: 'system',
      actorId: 'governance-gateway',
      agentId: action.agent_id,
      agentOwner: agentRow ? agentRow.owner_user_id : null,
      policyId: evaluation.policyId || null,
      policyVersion: evaluation.policyVersion || null,
      resourceReference: action.resource,
      decision: 'REQUIRE_APPROVAL',
      outcome: 'HELD_IN_QUEUE',
      requestId,
      incidentId: null,
      correctionId: null,
      safeDetails: { approvalId, status: 'PENDING' }
    }, targetDb);

    return {
      requestId,
      gateDecision: 'REQUIRE_APPROVAL',
      gateReasonCode: evaluation.reasonCode,
      explanation: evaluation.explanation,
      approvalStatus: 'PENDING',
      executionStatus: 'NOT_EXECUTED',
      evidenceChecks: evaluation.evidenceChecks,
      nonExecutionReason: 'APPROVAL_PENDING'
    };
  }

  // BLOCK
  const execId = `exec-${requestId}`;
  targetDb.prepare(`
    INSERT INTO executions (id, request_id, status, non_execution_reason, created_at)
    VALUES (?, ?, 'NOT_EXECUTED', 'BLOCKED_BY_POLICY', ?)
  `).run(execId, requestId, now);

  let incidentId: string | null = null;
  if (evaluation.openIncident && agent) {
    incidentId = `inc-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    targetDb.prepare(`
      INSERT INTO incidents (
        id, agent_id, agent_category, triggering_request_id, severity, policy_id, policy_version,
        status, pre_incident_status, evidence_summary, evidence_checks, opened_at, agent_owner_at_time
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?, ?)
    `).run(
      incidentId,
      agent.id,
      agent.agent_category || 'document_analysis',
      requestId,
      evaluation.severity,
      evaluation.policyId || 'UNKNOWN_POLICY',
      evaluation.policyVersion || 'v1.0',
      agent.status,
      `Violation occurred during attempt to execute operation '${action.operation}' on '${action.resource}': ${evaluation.explanation}`,
      evaluation.evidenceChecks ? JSON.stringify(evaluation.evidenceChecks) : null,
      now,
      agentRow ? agentRow.owner_user_id : 'unknown'
    );
  }

  // If policy dictates pause_on_violation
  if (evaluation.pauseOnViolation && agent) {
    transitionAgentStatus(agent.id, 'paused', { type: 'system', id: 'policy-enforcer' }, `High severity violation on policy ${evaluation.policyId}`, targetDb);
  }

  writeAuditEvent({
    eventType: 'VIOLATION_CONTAINED',
    actorType: 'system',
    actorId: 'governance-gateway',
    agentId: action.agent_id,
    agentOwner: agentRow ? agentRow.owner_user_id : null,
    policyId: evaluation.policyId || null,
    policyVersion: evaluation.policyVersion || null,
    resourceReference: action.resource,
    decision: 'BLOCK',
    outcome: 'BLOCKED_NO_SIDE_EFFECTS',
    requestId,
    incidentId,
    correctionId: null,
    safeDetails: { reasonCode: evaluation.reasonCode, incidentOpened: !!incidentId, agentPaused: evaluation.pauseOnViolation }
  }, targetDb);

  return {
    requestId,
    gateDecision: 'BLOCK',
    gateReasonCode: evaluation.reasonCode,
    explanation: evaluation.explanation,
    executionStatus: 'NOT_EXECUTED',
    nonExecutionReason: 'BLOCKED_BY_POLICY',
    evidenceChecks: evaluation.evidenceChecks,
    incidentId: incidentId || undefined
  };
}
