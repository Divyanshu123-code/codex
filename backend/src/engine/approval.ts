import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { writeAuditEvent } from './gateway.js';
import {
  evaluatePolicy,
  AgentRecord,
  PolicyRecord,
  OperationCatalogRecord
} from './evaluator.js';
import {
  executeProtectedTool,
  generateExecutionToken
} from '../tools/protectedTools.js';

const GATEWAY_SECRET = process.env.AGENT_GATEWAY_SECRET || 'codex_gateway_hmac_secret_2026';

export interface ApprovalDecisionResult {
  approvalId: string;
  requestId: string;
  approvalStatus: 'APPROVED' | 'REJECTED';
  executionStatus: 'SUCCEEDED' | 'FAILED' | 'NOT_EXECUTED';
  nonExecutionReason?: string;
  result?: any;
}

/**
 * Server-side human approval decision processor (FR-9, Section 3.2, Phase 4)
 */
export function decideApproval(
  approvalId: string,
  decision: 'APPROVED' | 'REJECTED',
  approver: { id: string; role: string },
  reason: string,
  db?: DatabaseSync
): ApprovalDecisionResult {
  const targetDb = db || getDatabase();

  // 1. Role enforcement: reviewer or admin required
  if (approver.role !== 'reviewer' && approver.role !== 'admin') {
    throw new Error('UNAUTHORIZED_REVIEWER_ROLE: Only reviewers or administrators can approve requests.');
  }

  // 2. Reason required
  if (!reason || reason.trim().length === 0) {
    throw new Error('REASON_REQUIRED: A written justification is mandatory for all approval decisions.');
  }

  // 3. Fetch approval record
  const approvalRow = targetDb.prepare('SELECT * FROM approvals WHERE id = ?').get(approvalId) as any;
  if (!approvalRow) {
    throw new Error(`Approval record ${approvalId} not found.`);
  }

  // Separation of duties on reopened approvals (Section 6c): original rejector cannot approve
  if (decision === 'APPROVED' && approvalRow.reopened_from_id) {
    const origAppr = targetDb.prepare('SELECT approver_id FROM approvals WHERE id = ?').get(approvalRow.reopened_from_id) as any;
    if (origAppr && origAppr.approver_id === approver.id) {
      throw new Error('SEPARATION_OF_DUTIES_VIOLATION: Cannot approve a reopened request that you previously rejected. Secondary administrator (e.g. usr-admin-2) clearance is required to approve.');
    }
  }

  const requestId = approvalRow.request_id;
  const now = Date.now();

  // 4. Atomic compare-and-set: approval must be PENDING (Idempotency / No duplicate approval)
  const approvalUpdate = targetDb.prepare(`
    UPDATE approvals
    SET status = ?, approver_id = ?, approver_role = ?, reason = ?, decided_at = ?
    WHERE id = ? AND status = 'PENDING'
  `).run(decision, approver.id, approver.role, reason, now, approvalId);

  if (approvalUpdate.changes === 0) {
    throw new Error(`APPROVAL_ALREADY_DECIDED: Request ${requestId} has already been processed.`);
  }

  // 5. Fetch Action Request & Agent
  const requestRow = targetDb.prepare('SELECT * FROM action_requests WHERE id = ?').get(requestId) as any;
  const agentRow = targetDb.prepare('SELECT * FROM agents WHERE id = ?').get(requestRow.agent_id) as any;

  // 6. Write APPROVAL_DECIDED Audit Event
  writeAuditEvent({
    eventType: 'APPROVAL_DECIDED',
    actorType: 'human',
    actorId: approver.id,
    agentId: requestRow.agent_id,
    agentOwner: agentRow ? agentRow.owner_user_id : null,
    policyId: requestRow.policy_id,
    policyVersion: requestRow.policy_version,
    resourceReference: requestRow.resource,
    decision,
    outcome: decision === 'APPROVED' ? 'AUTHORIZED' : 'REJECTED',
    requestId,
    incidentId: null,
    correctionId: null,
    safeDetails: { approverRole: approver.role, reason }
  }, targetDb);

  // 7. Case REJECTED: Terminal state, never execute
  if (decision === 'REJECTED') {
    targetDb.prepare(`
      UPDATE executions
      SET status = 'NOT_EXECUTED', non_execution_reason = 'APPROVAL_REJECTED', executed_at = ?
      WHERE request_id = ?
    `).run(now, requestId);

    try {
      const decisionDetails = JSON.stringify({
        approverId: approver.id,
        approverRole: approver.role,
        decision,
        reason,
        decidedAt: now
      });

      const updateResult = targetDb.prepare(`
        UPDATE scenario_backups
        SET human_decision = ?, execution_status = 'NOT_EXECUTED'
        WHERE request_id = ?
      `).run(decisionDetails, requestId);

      if (updateResult.changes === 0) {
        // Automatically create the backup snapshot so this rejected case is guaranteed in Backup & Recovery!
        const backupId = `sbkp-${now}-${Math.random().toString(36).substring(2, 7)}`;
        const snapshotPayload = JSON.stringify({
          backupId,
          requestId,
          agentId: requestRow.agent_id,
          operation: requestRow.operation,
          parameters: requestRow.parameters,
          decision: 'REJECTED',
          reason,
          timestamp: now
        });
        const snapshotHash = crypto.createHash('sha256').update(snapshotPayload).digest('hex');

        targetDb.prepare(`
          INSERT INTO scenario_backups (
            id, correlation_id, request_id, agent_id, agent_category, policy_id, policy_version,
            policy_hash, operation, amount, parameters_snapshot, evidence_checks, decision,
            reason_code, approval_id, human_decision, execution_status, snapshot_hash, created_at, correction_status
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NOT_EXECUTED', ?, ?, 'NONE')
        `).run(
          backupId,
          requestId,
          requestId,
          requestRow.agent_id,
          requestRow.agent_category || 'unknown',
          requestRow.policy_id,
          requestRow.policy_version,
          null,
          requestRow.operation,
          null,
          typeof requestRow.parameters === 'string' ? requestRow.parameters : JSON.stringify(requestRow.parameters || {}),
          typeof requestRow.evidence_checks === 'string' ? requestRow.evidence_checks : (requestRow.evidence_checks ? JSON.stringify(requestRow.evidence_checks) : null),
          requestRow.gate_decision || 'REQUIRE_APPROVAL',
          requestRow.gate_reason_code || 'APPROVAL_REJECTED',
          approvalId,
          decisionDetails,
          snapshotHash,
          now
        );
      }
    } catch (e) {
      console.error('Failed to create/update scenario backup on rejection:', e);
    }

    writeAuditEvent({
      eventType: 'NOT_EXECUTED',
      actorType: 'system',
      actorId: 'approval-engine',
      agentId: requestRow.agent_id,
      agentOwner: agentRow ? agentRow.owner_user_id : null,
      policyId: requestRow.policy_id,
      policyVersion: requestRow.policy_version,
      resourceReference: requestRow.resource,
      decision: 'BLOCK',
      outcome: 'APPROVAL_REJECTED',
      requestId,
      incidentId: null,
      correctionId: null,
      safeDetails: { reason: 'Human approver rejected the proposed action' }
    }, targetDb);

    return {
      approvalId,
      requestId,
      approvalStatus: 'REJECTED',
      executionStatus: 'NOT_EXECUTED',
      nonExecutionReason: 'APPROVAL_REJECTED'
    };
  }

  // 8. Case APPROVED: Mandatory REVALIDATION against CURRENT policy and CURRENT agent status
  const agent: AgentRecord | null = agentRow ? {
    id: agentRow.id,
    name: agentRow.name,
    status: agentRow.status,
    allowed_operations: JSON.parse(agentRow.allowed_operations),
    allowed_resources: JSON.parse(agentRow.allowed_resources),
    policy_version: agentRow.policy_version
  } : null;

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
    open_incident: p.open_incident,
    max_auto_amount: p.max_auto_amount != null ? Number(p.max_auto_amount) : null
  }));

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

  const revalidation = evaluatePolicy(
    agent,
    {
      agent_id: requestRow.agent_id,
      tool: requestRow.tool,
      operation: requestRow.operation,
      resource: requestRow.resource,
      parameters: JSON.parse(requestRow.parameters)
    },
    policies,
    catalog
  );

  // If agent is now paused or revalidation failed:
  // "A failed revalidation ends as NOT_EXECUTED (REVALIDATION_FAILED) with approval still APPROVED." (Section 3.2 Invariant 2)
  if (revalidation.decision === 'BLOCK' || (agent && agent.status === 'paused')) {
    targetDb.prepare(`
      UPDATE executions
      SET status = 'NOT_EXECUTED', non_execution_reason = 'REVALIDATION_FAILED', executed_at = ?
      WHERE request_id = ?
    `).run(now, requestId);

    writeAuditEvent({
      eventType: 'NOT_EXECUTED',
      actorType: 'system',
      actorId: 'approval-engine',
      agentId: requestRow.agent_id,
      agentOwner: agentRow ? agentRow.owner_user_id : null,
      policyId: requestRow.policy_id,
      policyVersion: requestRow.policy_version,
      resourceReference: requestRow.resource,
      decision: 'REQUIRE_APPROVAL',
      outcome: 'REVALIDATION_FAILED',
      requestId,
      incidentId: null,
      correctionId: null,
      safeDetails: { explanation: 'Agent paused or policy invalid at time of post-approval execution' }
    }, targetDb);

    return {
      approvalId,
      requestId,
      approvalStatus: 'APPROVED',
      executionStatus: 'NOT_EXECUTED',
      nonExecutionReason: 'REVALIDATION_FAILED'
    };
  }

  // 9. Atomic transition on execution: exactly one execution allowed (Idempotency)
  const execTransition = targetDb.prepare(`
    UPDATE executions
    SET status = 'EXECUTING', executed_at = ?
    WHERE request_id = ? AND status = 'NOT_EXECUTED'
  `).run(now, requestId);

  if (execTransition.changes === 0) {
    throw new Error(`DUPLICATE_EXECUTION_ATTEMPT: Action ${requestId} is already executing or completed.`);
  }

  writeAuditEvent({
    eventType: 'EXECUTION_STARTED',
    actorType: 'system',
    actorId: 'approval-executor',
    agentId: requestRow.agent_id,
    agentOwner: agentRow ? agentRow.owner_user_id : null,
    policyId: requestRow.policy_id,
    policyVersion: requestRow.policy_version,
    resourceReference: requestRow.resource,
    decision: 'ALLOW',
    outcome: 'POST_APPROVAL_EXECUTION',
    requestId,
    incidentId: null,
    correctionId: null,
    safeDetails: { approverId: approver.id }
  }, targetDb);

  // 10. Execute Protected Tool with Signed Token
  const token = generateExecutionToken(requestId, requestRow.operation, requestRow.resource, GATEWAY_SECRET);
  const toolResult = executeProtectedTool(
    token,
    requestId,
    requestRow.operation,
    requestRow.resource,
    JSON.parse(requestRow.parameters),
    GATEWAY_SECRET
  );

  targetDb.prepare(`
    UPDATE executions
    SET status = 'SUCCEEDED', duration_ms = ?, result_reference = ?, executed_at = ?
    WHERE request_id = ?
  `).run(toolResult.durationMs, JSON.stringify(toolResult.result), Date.now(), requestId);

  try {
    const decisionDetails = JSON.stringify({
      approverId: approver.id,
      approverRole: approver.role,
      decision,
      reason,
      decidedAt: now
    });
    targetDb.prepare(`
      UPDATE scenario_backups
      SET human_decision = ?, execution_status = 'SUCCEEDED',
          correction_status = CASE WHEN correction_status = 'REOPENED' THEN 'CORRECTED' ELSE correction_status END
      WHERE request_id = ?
    `).run(decisionDetails, requestId);
  } catch {
    // Ignore if table missing or row absent
  }

  writeAuditEvent({
    eventType: 'EXECUTION_SUCCEEDED',
    actorType: 'system',
    actorId: 'approval-executor',
    agentId: requestRow.agent_id,
    agentOwner: agentRow ? agentRow.owner_user_id : null,
    policyId: requestRow.policy_id,
    policyVersion: requestRow.policy_version,
    resourceReference: requestRow.resource,
    decision: 'ALLOW',
    outcome: 'SUCCESS',
    requestId,
    incidentId: null,
    correctionId: null,
    safeDetails: { resultSummary: 'Approved action executed cleanly' }
  }, targetDb);

  return {
    approvalId,
    requestId,
    approvalStatus: 'APPROVED',
    executionStatus: 'SUCCEEDED',
    result: toolResult.result
  };
}
