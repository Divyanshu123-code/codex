import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../db/connection.js';
import { transitionAgentStatus, writeAuditEvent } from './gateway.js';
import {
  evaluatePolicy,
  AgentRecord,
  PolicyRecord,
  OperationCatalogRecord
} from './evaluator.js';

export interface ResumeEligibilityResult {
  eligible: boolean;
  unmet: string[];
}

/**
 * Centralized resume eligibility gate (FR-6, FR-8, Section 3.5)
 */
export function evaluateResumeEligibility(
  agentId: string,
  actor: { role: string; id: string },
  reason: string,
  db?: DatabaseSync
): ResumeEligibilityResult {
  const targetDb = db || getDatabase();
  const unmet: string[] = [];

  // R1: Caller is human with administrator role
  if (actor.role !== 'admin') {
    unmet.push('R1: Only administrators may resume a paused agent.');
  }

  // R2: Written reason is supplied
  if (!reason || reason.trim().length === 0) {
    unmet.push('R2: A written reason is mandatory for resumption.');
  }

  // R3: Agent exists, not terminated, policy version exists
  const agentRow = targetDb.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as any;
  if (!agentRow) {
    unmet.push('R3: Agent does not exist.');
    return { eligible: false, unmet };
  }

  const policyRow = targetDb.prepare('SELECT * FROM policies WHERE version = ? LIMIT 1').get(agentRow.policy_version);
  if (!policyRow) {
    unmet.push(`R3: Policy version ${agentRow.policy_version} does not exist.`);
  }

  // R4: Check open incidents
  const openIncidents = targetDb.prepare("SELECT * FROM incidents WHERE agent_id = ? AND status != 'RESOLVED'").all(agentId) as any[];

  if (openIncidents.length === 0) {
    // R9: For manual pause with no open incident, R1-R3 suffice
    return {
      eligible: unmet.length === 0,
      unmet
    };
  }

  // If open incidents exist, evaluate R5 through R8 for each
  for (const inc of openIncidents) {
    // R5: Diagnosis recorded
    if (!inc.signature_id || inc.signature_id === 'UNKNOWN_HUMAN_INVESTIGATION_REQUIRED' || inc.signature_id === 'AMBIGUOUS_HUMAN_INVESTIGATION_REQUIRED') {
      unmet.push(`R5: Incident ${inc.id} has no valid signature diagnosis (${inc.signature_id || 'undiagnosed'}).`);
    }

    // R6: Applied correction exists with PASS, APPROVED, APPLIED
    const appliedCorr = targetDb.prepare(`
      SELECT * FROM corrections
      WHERE incident_id = ? AND verdict = 'PASS' AND approval_status = 'APPROVED' AND application_status = 'APPLIED'
    `).get(inc.id) as any;

    if (!appliedCorr) {
      unmet.push(`R6: Incident ${inc.id} does not have a verified, approved, and applied correction.`);
      continue;
    }

    // R7: Separation of duties (approver is human reviewer who is neither proposer nor agent)
    if (!appliedCorr.approver_id || appliedCorr.approver_id === appliedCorr.proposer_id || appliedCorr.approver_id === agentId) {
      unmet.push(`R7: Correction approver for incident ${inc.id} violates separation of duties.`);
    }

    // R8: Live revalidation against current policies
    const policies = (targetDb.prepare('SELECT * FROM policies').all() as any[]).map((p) => ({
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

    const currentPolicyHash = crypto.createHash('sha256').update(JSON.stringify(policies)).digest('hex');
    if (appliedCorr.policy_hash !== currentPolicyHash) {
      unmet.push(`R8: Policy hash changed since correction testing. Correction is stale and must be re-verified.`);
    }
  }

  return {
    eligible: unmet.length === 0,
    unmet
  };
}

/**
 * Approve a verified correction proposal
 */
export function approveCorrection(
  correctionId: string,
  approver: { id: string; role: string },
  reason: string,
  db?: DatabaseSync
): void {
  const targetDb = db || getDatabase();

  if (approver.role !== 'reviewer' && approver.role !== 'admin') {
    throw new Error('UNAUTHORIZED_REVIEWER_ROLE: Only reviewers or administrators can approve corrections.');
  }

  if (!reason || reason.trim().length === 0) {
    throw new Error('REASON_REQUIRED: A written justification is mandatory.');
  }

  const corrRow = targetDb.prepare('SELECT * FROM corrections WHERE id = ?').get(correctionId) as any;
  if (!corrRow) {
    throw new Error(`Correction ${correctionId} not found.`);
  }

  if (corrRow.verdict !== 'PASS') {
    throw new Error(`CANNOT_APPROVE_FAILING_CORRECTION: Only corrections with verdict PASS may be approved.`);
  }

  if (corrRow.proposer_id === approver.id) {
    throw new Error('SEPARATION_OF_DUTIES: Proposer cannot approve their own correction proposal.');
  }

  targetDb.prepare(`
    UPDATE corrections
    SET approval_status = 'APPROVED', approver_id = ?, approval_reason = ?
    WHERE id = ? AND approval_status = 'PENDING'
  `).run(approver.id, reason, correctionId);

  writeAuditEvent({
    eventType: 'CORRECTION_APPROVED',
    actorType: 'human',
    actorId: approver.id,
    agentId: null,
    agentOwner: null,
    policyId: null,
    policyVersion: null,
    resourceReference: null,
    decision: 'ALLOW',
    outcome: 'APPROVED',
    requestId: null,
    incidentId: corrRow.incident_id,
    correctionId,
    safeDetails: { approverId: approver.id, reason }
  }, targetDb);
}

/**
 * Apply an approved and tested correction to the live agent configuration
 */
export function applyCorrection(correctionId: string, db?: DatabaseSync): void {
  const targetDb = db || getDatabase();

  const corrRow = targetDb.prepare('SELECT * FROM corrections WHERE id = ?').get(correctionId) as any;
  if (!corrRow) {
    throw new Error(`Correction ${correctionId} not found.`);
  }

  if (corrRow.verdict !== 'PASS' || corrRow.approval_status !== 'APPROVED') {
    throw new Error('CORRECTION_NOT_ELIGIBLE_FOR_APPLICATION: Must have verdict PASS and approval APPROVED.');
  }

  const incidentRow = targetDb.prepare('SELECT * FROM incidents WHERE id = ?').get(corrRow.incident_id) as any;
  const agentRow = targetDb.prepare('SELECT * FROM agents WHERE id = ?').get(incidentRow.agent_id) as any;

  // Apply patch to workflow configuration
  const patch = JSON.parse(corrRow.patch);
  const workflow: any[] = JSON.parse(agentRow.workflow_config);
  let patchedWorkflow = [...workflow];

  if (patch.action === 'replace_step_operation') {
    patchedWorkflow = patchedWorkflow.map((step) =>
      step.step_id === patch.target_step_id
        ? { ...step, operation: patch.new_operation, resource: patch.new_resource || step.resource }
        : step
    );
  } else if (patch.action === 'remove_step') {
    patchedWorkflow = patchedWorkflow.filter((step) => step.step_id !== patch.target_step_id);
  }

  const now = Date.now();
  targetDb.prepare(`
    UPDATE agents
    SET workflow_config = ?, updated_at = ?
    WHERE id = ?
  `).run(JSON.stringify(patchedWorkflow), now, agentRow.id);

  targetDb.prepare(`
    UPDATE corrections
    SET application_status = 'APPLIED', applied_at = ?
    WHERE id = ?
  `).run(now, correctionId);

  targetDb.prepare(`
    UPDATE incidents
    SET status = 'RESOLVED'
    WHERE id = ?
  `).run(corrRow.incident_id);

  writeAuditEvent({
    eventType: 'CORRECTION_APPLIED',
    actorType: 'system',
    actorId: 'recovery-engine',
    agentId: agentRow.id,
    agentOwner: agentRow.owner_user_id,
    policyId: null,
    policyVersion: agentRow.policy_version,
    resourceReference: null,
    decision: 'ALLOW',
    outcome: 'APPLIED',
    requestId: null,
    incidentId: corrRow.incident_id,
    correctionId,
    safeDetails: { description: corrRow.description }
  }, targetDb);
}

/**
 * Resume agent through the centralized resume gate (Section 3.5)
 */
export function resumeAgent(
  agentId: string,
  actor: { role: string; id: string },
  reason: string,
  db?: DatabaseSync
): { success: boolean; status: string; unmet?: string[] } {
  const targetDb = db || getDatabase();

  const eligibility = evaluateResumeEligibility(agentId, actor, reason, targetDb);
  if (!eligibility.eligible) {
    writeAuditEvent({
      eventType: 'RESUME_ATTEMPTED',
      actorType: 'human',
      actorId: actor.id,
      agentId,
      agentOwner: null,
      policyId: null,
      policyVersion: null,
      resourceReference: null,
      decision: 'BLOCK',
      outcome: 'RESUME_REJECTED',
      requestId: null,
      incidentId: null,
      correctionId: null,
      safeDetails: { unmet: eligibility.unmet, reason }
    }, targetDb);

    return { success: false, status: 'paused', unmet: eligibility.unmet };
  }

  // Resumption allowed: transition agent to active
  transitionAgentStatus(agentId, 'active', { type: 'human', id: actor.id }, reason, targetDb);

  writeAuditEvent({
    eventType: 'RESUMED',
    actorType: 'human',
    actorId: actor.id,
    agentId,
    agentOwner: null,
    policyId: null,
    policyVersion: null,
    resourceReference: null,
    decision: 'ALLOW',
    outcome: 'RESUME_SUCCEEDED',
    requestId: null,
    incidentId: null,
    correctionId: null,
    safeDetails: { reason, targetStatus: 'active' }
  }, targetDb);

  return { success: true, status: 'active' };
}
