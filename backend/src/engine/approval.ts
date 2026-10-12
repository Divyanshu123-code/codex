import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { writeAuditEvent, getGatewaySecret } from './gateway.js';
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
  db?: DatabaseSync,
  options?: { wrongCallConfirmed?: boolean }
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

  const requestId = approvalRow.request_id;

  // 4. Fetch Action Request
  const requestRow = targetDb.prepare('SELECT * FROM action_requests WHERE id = ?').get(requestId) as any;
  if (!requestRow) {
    throw new Error(`Action request ${requestId} not found.`);
  }

  const parsedParams = typeof requestRow.parameters === 'string'
    ? JSON.parse(requestRow.parameters)
    : (requestRow.parameters || {});
  const reqAmount = typeof parsedParams.amount === 'number' ? parsedParams.amount : null;

  // Separation of duties: Same user as proposer and approver is blocked (P6: Requirement 4 & 8)
  const proposalEvent = targetDb.prepare(`
    SELECT actor_id, actor_type FROM audit_events WHERE request_id = ? AND event_type = 'GATE_DECIDED'
  `).get(requestId) as any;

  if (proposalEvent && proposalEvent.actor_type === 'human' && proposalEvent.actor_id === approver.id) {
    throw new Error('SEPARATION_OF_DUTIES_VIOLATION: Proposer and approver cannot be the same user identity. An independent reviewer is required.');
  }

  // Separation of duties on reopened approvals (Section 6c): original rejector cannot approve
  if (decision === 'APPROVED' && approvalRow.reopened_from_id) {
    const origAppr = targetDb.prepare('SELECT approver_id FROM approvals WHERE id = ?').get(approvalRow.reopened_from_id) as any;
    if (origAppr && origAppr.approver_id === approver.id) {
      throw new Error('SEPARATION_OF_DUTIES_VIOLATION: Cannot approve a reopened request that you previously rejected. Secondary administrator (e.g. usr-admin-2) clearance is required to approve.');
    }
  }

  // Delegation of Authority Matrix (P5c):
  // Level 1 Duty Officer (reviewer) can only approve Tier 1 requests (up to $15,000).
  // Level 2 Commander (admin) is required above $15,000 or for Tier 2 operations.
  if (decision === 'APPROVED') {
    if (approver.role === 'reviewer' && reqAmount !== null && reqAmount > 15000) {
      throw new Error(`INSUFFICIENT_AUTHORITY_LEVEL: Requisition amount ($${reqAmount}) exceeds Level 1 Duty Officer threshold ($15,000). Level 2 Commander approval required.`);
    }
    if (approver.role === 'reviewer' && (parsedParams.required_authority_level === 2 || parsedParams.tier === 2)) {
      throw new Error('INSUFFICIENT_AUTHORITY_LEVEL: Operation requires Level 2 Commander authority.');
    }
  }

  // Two-Person Integrity (P5c):
  // Critical operations require two distinct human clearances before execution.
  const CRITICAL_TWO_PERSON_OPERATIONS = ['wipe_credentials', 'isolate_host', 'purge_security_logs', 'delete_file', 'credential_wipe', 'mass_isolation'];
  const requiresTwoPerson = approvalRow.requires_two_person_integrity === 1 ||
    parsedParams.requires_two_person_integrity === true ||
    CRITICAL_TWO_PERSON_OPERATIONS.includes(requestRow.operation);

  if (decision === 'APPROVED' && requiresTwoPerson) {
    if (approvalRow.status === 'PENDING' && !approvalRow.first_approver_id) {
      // First clearance recorded -> move to PENDING_SECOND_APPROVAL
      targetDb.prepare(`
        UPDATE approvals
        SET status = 'PENDING_SECOND_APPROVAL', first_approver_id = ?, reason = ?
        WHERE id = ? AND status = 'PENDING'
      `).run(approver.id, reason, approvalId);

      writeAuditEvent({
        eventType: 'APPROVAL_PARTIAL_CLEARANCE',
        actorType: 'human',
        actorId: approver.id,
        agentId: requestRow.agent_id,
        agentOwner: null,
        policyId: requestRow.policy_id,
        policyVersion: requestRow.policy_version,
        resourceReference: requestRow.resource,
        decision: 'REQUIRE_APPROVAL',
        outcome: 'PENDING_SECOND_APPROVAL',
        requestId,
        incidentId: null,
        correctionId: null,
        safeDetails: { firstApprover: approver.id, requiresTwoPersonIntegrity: true }
      }, targetDb);

      return {
        approvalId,
        requestId,
        approvalStatus: 'PENDING_SECOND_APPROVAL' as any,
        executionStatus: 'NOT_EXECUTED',
        nonExecutionReason: 'TWO_PERSON_INTEGRITY_REQUIRED: First clearance recorded. Requires second independent human authority to execute.'
      };
    }

    if (approvalRow.first_approver_id) {
      if (approver.id === approvalRow.first_approver_id) {
        throw new Error('TWO_PERSON_INTEGRITY_VIOLATION: Operation requires two distinct human authorities. Same operator cannot provide dual clearance.');
      }
    }
  }

  const now = Date.now();

  // 5. Atomic compare-and-set: approval must be PENDING or PENDING_SECOND_APPROVAL
  const approvalUpdate = targetDb.prepare(`
    UPDATE approvals
    SET status = ?, approver_id = ?, approver_role = ?, reason = ?, decided_at = ?
    WHERE id = ? AND (status = 'PENDING' OR status = 'PENDING_SECOND_APPROVAL')
  `).run(decision, approver.id, approver.role, reason, now, approvalId);

  if (approvalUpdate.changes === 0) {
    throw new Error(`APPROVAL_ALREADY_DECIDED: Request ${requestId} has already been processed.`);
  }

  // 6. Fetch Agent
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

    // Check if evidence checks on this request all passed (Wrong-Call Prevention Audit Trail)
    let checksAllPassed = false;
    let passedCheckNames: string[] = [];
    if (requestRow.evidence_checks) {
      try {
        const ev = typeof requestRow.evidence_checks === 'string'
          ? JSON.parse(requestRow.evidence_checks)
          : requestRow.evidence_checks;
        if (ev && Array.isArray(ev.checks) && ev.checks.length > 0 && ev.checks.every((c: any) => c.passed === true)) {
          checksAllPassed = true;
          passedCheckNames = ev.checks.map((c: any) => c.name);
        }
      } catch {}
    }

    if (checksAllPassed || options?.wrongCallConfirmed) {
      let reqAmount: number | null = null;
      try {
        const p = JSON.parse(requestRow.parameters || '{}');
        if (typeof p.amount === 'number') reqAmount = p.amount;
      } catch {}

      writeAuditEvent({
        eventType: 'REJECTION_CONFIRMED_DESPITE_PASSED_CHECKS',
        actorType: 'human',
        actorId: approver.id,
        agentId: requestRow.agent_id,
        agentOwner: agentRow ? agentRow.owner_user_id : null,
        policyId: requestRow.policy_id,
        policyVersion: requestRow.policy_version,
        resourceReference: requestRow.resource,
        decision: 'REJECTED',
        outcome: 'CONFIRMED_REJECTION_DESPITE_PASSED_CHECKS',
        requestId,
        incidentId: null,
        correctionId: null,
        safeDetails: {
          approvalId,
          approverRole: approver.role,
          amount: reqAmount,
          passedChecks: passedCheckNames,
          rejectionReason: reason,
          warningAcknowledged: true
        }
      }, targetDb);
    }

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
          actor: approver.id,
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
            policy_hash, operation, amount, policy_limit, actor, parameters_snapshot, evidence_checks, decision,
            reason_code, approval_id, human_decision, execution_status, snapshot_hash, created_at, correction_status
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NOT_EXECUTED', ?, ?, 'NONE')
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
          null,
          approver.id,
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
  const token = generateExecutionToken(requestId, requestRow.operation, requestRow.resource, getGatewaySecret());
  const toolResult = executeProtectedTool(
    token,
    requestId,
    requestRow.operation,
    requestRow.resource,
    JSON.parse(requestRow.parameters),
    getGatewaySecret()
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
