import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { seedDatabase } from '../src/db/seed.js';
import { resetSyntheticStorage, getSyntheticStorageState } from '../src/tools/protectedTools.js';
import { getDatabase } from '../src/db/connection.js';

describe('AegisOS Policy Threshold, Backup & Wrong Human Call Reinstatement (Claims C1-C4, Sections 6b/6c)', () => {
  const app = createApp();

  beforeEach(() => {
    seedDatabase();
    resetSyntheticStorage();
  });

  it('1. Auto-grants refund within delegated threshold ($4,000 <= $5,000)', async () => {
    const res = await request(app)
      .post('/api/actions/route')
      .send({
        agentId: 'agent-finance-refund-04',
        tool: 'refund_engine',
        operation: 'issue_refund',
        resource: 'synthetic://orders/ord-4011',
        parameters: { order_id: 'ord-4011', amount: 4000 }
      });

    expect(res.status).toBe(200);
    expect(res.body.gateDecision).toBe('ALLOW');
    expect(res.body.gateReasonCode).toBe('POLICY_DECISION_ALLOW');
    expect(res.body.executionStatus).toBe('SUCCEEDED');
    expect(res.body.result).toBeDefined();
    expect(res.body.result.status).toBe('REFUND_EXECUTED');
    expect(res.body.result.amount).toBe(4000);

    const storage = getSyntheticStorageState();
    expect(storage.refunds).toBeDefined();
    const refunds = Object.values(storage.refunds);
    expect(refunds.length).toBe(1);
    expect((refunds[0] as any).amount).toBe(4000);
  });

  it('2. Elevates refund exceeding threshold ($6,000 > $5,000) to REQUIRE_APPROVAL and creates immutable scenario backup', async () => {
    const res = await request(app)
      .post('/api/actions/route')
      .send({
        agentId: 'agent-finance-refund-04',
        tool: 'refund_engine',
        operation: 'issue_refund',
        resource: 'synthetic://orders/ord-6022',
        parameters: { order_id: 'ord-6022', amount: 6000 }
      });

    expect(res.status).toBe(200);
    expect(res.body.gateDecision).toBe('REQUIRE_APPROVAL');
    expect(res.body.gateReasonCode).toBe('THRESHOLD_EXCEEDED_REQUIRES_APPROVAL');
    expect(res.body.approvalStatus).toBe('PENDING');
    expect(res.body.executionStatus).toBe('NOT_EXECUTED');

    // Invariant G1: Zero tool side effects while held
    const storage = getSyntheticStorageState();
    expect(Object.keys(storage.refunds).length).toBe(0);

    // Verify scenario backup record was created
    const backupsRes = await request(app).get('/api/backups?agentId=agent-finance-refund-04');
    expect(backupsRes.status).toBe(200);
    expect(backupsRes.body.length).toBeGreaterThanOrEqual(1);

    const latest = backupsRes.body[0];
    expect(latest.operation).toBe('issue_refund');
    expect(latest.amount).toBe(6000);
    expect(latest.decision).toBe('REQUIRE_APPROVAL');
    expect(latest.correction_status).toBe('NONE');
    expect(latest.snapshot_hash).toBeDefined();
    expect(latest.parameters_snapshot.order_id).toBe('ord-6022');
  });

  it('3. Rejection of held request terminates action without execution; backup captures rejection details', async () => {
    // 1. Submit 6000 refund -> held
    const routeRes = await request(app)
      .post('/api/actions/route')
      .send({
        agentId: 'agent-finance-refund-04',
        tool: 'refund_engine',
        operation: 'issue_refund',
        resource: 'synthetic://orders/ord-9033',
        parameters: { order_id: 'ord-9033', amount: 6000 }
      });

    const approvalId = `appr-${routeRes.body.requestId}`;

    // 2. Reviewer rejects by mistake
    const rejectRes = await request(app)
      .post(`/api/approvals/${approvalId}/decision`)
      .send({
        decision: 'REJECTED',
        approverId: 'usr-reviewer',
        approverRole: 'reviewer',
        reason: 'Mistakenly suspected anomaly in customer session'
      });

    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.approvalStatus).toBe('REJECTED');
    expect(rejectRes.body.executionStatus).toBe('NOT_EXECUTED');

    // Zero tool mutation
    const storage = getSyntheticStorageState();
    expect(Object.keys(storage.refunds).length).toBe(0);

    // Check backup record was updated with human decision
    const backupsRes = await request(app).get('/api/backups?agentId=agent-finance-refund-04');
    const backup = backupsRes.body[0];
    expect(backup.human_decision).toBeDefined();
    expect(backup.human_decision.decision).toBe('REJECTED');
    expect(backup.human_decision.approverId).toBe('usr-reviewer');
  });

  it('4. Reopen enforces strict Separation of Duties: original rejecting human cannot reopen/override own rejection', async () => {
    // Route 6000 refund
    const routeRes = await request(app)
      .post('/api/actions/route')
      .send({
        agentId: 'agent-finance-refund-04',
        tool: 'refund_engine',
        operation: 'issue_refund',
        resource: 'synthetic://orders/ord-9044',
        parameters: { order_id: 'ord-9044', amount: 6000 }
      });

    const approvalId = `appr-${routeRes.body.requestId}`;

    // Admin-1 rejects
    await request(app)
      .post(`/api/approvals/${approvalId}/decision`)
      .send({
        decision: 'REJECTED',
        approverId: 'usr-admin',
        approverRole: 'admin',
        reason: 'Initial rejection'
      });

    const backupsRes = await request(app).get('/api/backups?agentId=agent-finance-refund-04');
    const backupId = backupsRes.body[0].id;

    // Same admin attempts to reopen -> REJECTED
    const sameAdminRes = await request(app)
      .post(`/api/backups/${backupId}/reopen`)
      .send({
        reason: 'Trying to self-reopen',
        actor: { id: 'usr-admin', role: 'admin' }
      });

    expect(sameAdminRes.status).toBe(400);
    expect(sameAdminRes.body.error).toContain('SEPARATION_OF_DUTIES_VIOLATION');
  });

  it('5. Second administrator can successfully reopen a wrongly rejected request; logs DECISION_OVERTURNED', async () => {
    // Route 6000 refund
    const routeRes = await request(app)
      .post('/api/actions/route')
      .send({
        agentId: 'agent-finance-refund-04',
        tool: 'refund_engine',
        operation: 'issue_refund',
        resource: 'synthetic://orders/ord-9055',
        parameters: { order_id: 'ord-9055', amount: 6000 }
      });

    const approvalId = `appr-${routeRes.body.requestId}`;

    // Reviewer-1 rejects
    await request(app)
      .post(`/api/approvals/${approvalId}/decision`)
      .send({
        decision: 'REJECTED',
        approverId: 'usr-reviewer',
        approverRole: 'reviewer',
        reason: 'Misclassified transaction as high-risk'
      });

    const backupsRes = await request(app).get('/api/backups?agentId=agent-finance-refund-04');
    const backupId = backupsRes.body[0].id;

    // Admin (different user) reopens
    const reopenRes = await request(app)
      .post(`/api/backups/${backupId}/reopen`)
      .send({
        reason: 'Order session verified against verified customer return receipt; prior rejection was human error.',
        actor: { id: 'usr-admin', role: 'admin' }
      });

    expect(reopenRes.status).toBe(200);
    expect(reopenRes.body.success).toBe(true);
    expect(reopenRes.body.status).toBe('REOPENED');
    expect(reopenRes.body.newApprovalId).toBeDefined();

    // Verify backup updated
    const backupUpdated = (await request(app).get(`/api/backups/${backupId}`)).body;
    expect(backupUpdated.correction_status).toBe('REOPENED');
    expect(backupUpdated.reopens_approval_id).toBe(reopenRes.body.newApprovalId);

    // Verify DECISION_OVERTURNED event in audit trail
    const auditRes = await request(app).get('/api/audit');
    const overturnEvents = auditRes.body.filter((e: any) => e.event_type === 'DECISION_OVERTURNED');
    expect(overturnEvents.length).toBeGreaterThanOrEqual(1);
    expect(overturnEvents[0].actor_id).toBe('usr-admin');

    // Multiple reopenings prohibited (idempotent)
    const doubleReopen = await request(app)
      .post(`/api/backups/${backupId}/reopen`)
      .send({
        reason: 'Attempting duplicate reopen',
        actor: { id: 'usr-admin', role: 'admin' }
      });
    expect(doubleReopen.status).toBe(400);
    expect(doubleReopen.body.error).toContain('ALREADY_REOPENED');
  });

  it('6. Reopened approval can be authorized by authorized reviewer, executing tool exactly once with idempotency', async () => {
    // Route 6000 refund
    const routeRes = await request(app)
      .post('/api/actions/route')
      .send({
        agentId: 'agent-finance-refund-04',
        tool: 'refund_engine',
        operation: 'issue_refund',
        resource: 'synthetic://orders/ord-9066',
        parameters: { order_id: 'ord-9066', amount: 6000, idempotency_key: 'idem-ord-9066' }
      });

    const approvalId = `appr-${routeRes.body.requestId}`;

    // Reviewer-1 rejects
    await request(app)
      .post(`/api/approvals/${approvalId}/decision`)
      .send({
        decision: 'REJECTED',
        approverId: 'usr-reviewer',
        approverRole: 'reviewer',
        reason: 'Accidental click on reject'
      });

    const backupsRes = await request(app).get('/api/backups?agentId=agent-finance-refund-04');
    const backupId = backupsRes.body[0].id;

    // Admin reopens
    const reopenRes = await request(app)
      .post(`/api/backups/${backupId}/reopen`)
      .send({
        reason: 'Verified return document, reopening for re-evaluation',
        actor: { id: 'usr-admin', role: 'admin' }
      });

    const newApprovalId = reopenRes.body.newApprovalId;

    // Reopened approval cannot be approved by original rejector (Separation of duties)
    const sameApproverRes = await request(app)
      .post(`/api/approvals/${newApprovalId}/decision`)
      .send({
        decision: 'APPROVED',
        approverId: 'usr-reviewer',
        approverRole: 'reviewer',
        reason: 'Trying to self-approve after rejection'
      });
    expect(sameApproverRes.status).toBe(400);
    expect(sameApproverRes.body.error).toContain('SEPARATION_OF_DUTIES_VIOLATION');

    // Second approver (usr-admin) approves
    const approvedRes = await request(app)
      .post(`/api/approvals/${newApprovalId}/decision`)
      .send({
        decision: 'APPROVED',
        approverId: 'usr-admin',
        approverRole: 'admin',
        reason: 'Authorized disbursement after administrative re-review'
      });

    expect(approvedRes.status).toBe(200);
    expect(approvedRes.body.approvalStatus).toBe('APPROVED');
    expect(approvedRes.body.executionStatus).toBe('SUCCEEDED');
    expect(approvedRes.body.result.status).toBe('REFUND_EXECUTED');
    expect(approvedRes.body.result.amount).toBe(6000);

    // Verify backup status updated to CORRECTED
    const finalBackup = (await request(app).get(`/api/backups/${backupId}`)).body;
    expect(finalBackup.correction_status).toBe('CORRECTED');
    expect(finalBackup.execution_status).toBe('SUCCEEDED');

    // Invariant: Exactly one execution in storage ledger
    const storage = getSyntheticStorageState();
    const refunds = Object.values(storage.refunds);
    expect(refunds.length).toBe(1);
    expect((refunds[0] as any).order_id).toBe('ord-9066');
  });

  it('7. Policy prohibitions cannot be reopened or overridden (Invariant G1/G2 preserved)', async () => {
    // Attempt prohibited wipe_credentials
    const blockRes = await request(app)
      .post('/api/actions/route')
      .send({
        agentId: 'agent-cyber-monitor-02',
        tool: 'credential_manager',
        operation: 'wipe_credentials',
        resource: 'synthetic://enclaves/perimeter_firewall',
        parameters: { reason: 'Unauthorized wipe attempt' }
      });

    expect(blockRes.status).toBe(200);
    expect(blockRes.body.gateDecision).toBe('BLOCK');

    // Find backup for the blocked prohibited action
    const backupsRes = await request(app).get('/api/backups?agentId=agent-cyber-monitor-02');
    expect(backupsRes.body.length).toBeGreaterThanOrEqual(1);
    const prohibitedBackup = backupsRes.body[0];

    // Attempting to reopen a prohibited operation is strictly blocked
    const reopenRes = await request(app)
      .post(`/api/backups/${prohibitedBackup.id}/reopen`)
      .send({
        reason: 'Attempting to override security prohibition',
        actor: { id: 'usr-admin', role: 'admin' }
      });

    expect(reopenRes.status).toBe(400);
    expect(reopenRes.body.error).toContain('CANNOT_REOPEN_PROHIBITED_OPERATION');
  });

  it('8. Soft-termination takes snapshot and blocks agent; reinstatement requires separation of duties and returns RESTRICTED', async () => {
    const db = getDatabase();

    // 1. Admin-1 soft-terminates agent-pred-maint-01
    const termRes = await request(app)
      .post('/api/agents/agent-pred-maint-01/terminate')
      .send({
        actorId: 'usr-admin',
        actorRole: 'admin',
        reason: 'Suspected anomalous sensor drift reported by field ops'
      });

    expect(termRes.status).toBe(200);
    expect(termRes.body.success).toBe(true);
    expect(termRes.body.status).toBe('paused');
    expect(termRes.body.snapshotHash).toBeDefined();

    // 2. Terminated agent blocks subsequent actions
    const actionRes = await request(app)
      .post('/api/actions/route')
      .send({
        agentId: 'agent-pred-maint-01',
        tool: 'maintenance_scheduler',
        operation: 'create_maintenance_ticket',
        resource: 'synthetic://maintenance/turbine_unit_4',
        parameters: { equipment_id: 'turbine_unit_4', timestamp: Date.now(), vibration_rms: 3.5, bearing_temp_c: 60.0 }
      });

    expect(actionRes.status).toBe(200);
    expect(actionRes.body.gateDecision).toBe('BLOCK');
    expect(actionRes.body.gateReasonCode).toBe('AGENT_PAUSED');

    // 3. Same admin cannot self-reinstate (Separation of duties)
    const selfReinstate = await request(app)
      .post('/api/agents/agent-pred-maint-01/reinstate')
      .send({
        actorId: 'usr-admin',
        actorRole: 'admin',
        reason: 'Attempting self reinstatement'
      });

    expect(selfReinstate.status).toBe(400);
    expect(selfReinstate.body.error).toContain('SEPARATION_OF_DUTIES_VIOLATION');

    // 4. Second admin reinstates with written justification
    const secondReinstate = await request(app)
      .post('/api/agents/agent-pred-maint-01/reinstate')
      .send({
        actorId: 'usr-admin-2',
        actorRole: 'admin',
        reason: 'Field calibration verified sensor telemetry is nominal; restoring agent under restricted supervision.'
      });

    expect(secondReinstate.status).toBe(200);
    expect(secondReinstate.body.success).toBe(true);
    // Returns as RESTRICTED (Section 6b Rule 3)
    expect(secondReinstate.body.status).toBe('restricted');

    // Audit trail has DECISION_OVERTURNED and AGENT_REINSTATED
    const auditRes = await request(app).get('/api/audit');
    const reinstatedEvents = auditRes.body.filter((e: any) => e.event_type === 'AGENT_REINSTATED');
    expect(reinstatedEvents.length).toBeGreaterThanOrEqual(1);
    expect(reinstatedEvents[0].agent_id).toBe('agent-pred-maint-01');

    // 5. Agent in RESTRICTED status can now be resumed to ACTIVE via central resume gate
    const resumeRes = await request(app)
      .post('/api/agents/agent-pred-maint-01/resume')
      .send({
        actorId: 'usr-admin-2',
        actorRole: 'admin',
        reason: 'Final resumption checklist satisfied'
      });

    expect(resumeRes.status).toBe(200);
    expect(resumeRes.body.success).toBe(true);
    expect(resumeRes.body.status).toBe('active');
  });

  it('9. Plain-language explanation endpoint (L2) and patch proposer (L1) operate with deterministic fallback', async () => {
    // 1. Explain held request
    const routeRes = await request(app)
      .post('/api/actions/route')
      .send({
        agentId: 'agent-finance-refund-04',
        tool: 'refund_engine',
        operation: 'issue_refund',
        resource: 'synthetic://orders/ord-explain-1',
        parameters: { order_id: 'ord-explain-1', amount: 6000 }
      });

    const explainRes = await request(app).post(`/api/actions/explain/${routeRes.body.requestId}`);
    expect(explainRes.status).toBe(200);
    expect(explainRes.body.explanation).toBeDefined();
    expect(explainRes.body.hash).toBeDefined();

    // 2. Propose patch for baseline incident
    const proposeRes = await request(app)
      .post('/api/corrections/propose-patch')
      .send({ incidentId: 'inc-demo-001' });

    expect(proposeRes.status).toBe(200);
    expect(proposeRes.body.patch).toBeDefined();
    expect(proposeRes.body.rationale).toBeDefined();
    expect(proposeRes.body.snapshotHash).toBeDefined();
  });

  it('10. Leadership Dashboard reflects human intervention overturn metrics', async () => {
    // Trigger one overturn event
    const routeRes = await request(app)
      .post('/api/actions/route')
      .send({
        agentId: 'agent-finance-refund-04',
        tool: 'refund_engine',
        operation: 'issue_refund',
        resource: 'synthetic://orders/ord-dash-1',
        parameters: { order_id: 'ord-dash-1', amount: 6000 }
      });

    const approvalId = `appr-${routeRes.body.requestId}`;
    await request(app)
      .post(`/api/approvals/${approvalId}/decision`)
      .send({
        decision: 'REJECTED',
        approverId: 'usr-reviewer',
        approverRole: 'reviewer',
        reason: 'Temporary hold'
      });

    const backupsRes = await request(app).get('/api/backups?agentId=agent-finance-refund-04');
    await request(app)
      .post(`/api/backups/${backupsRes.body[0].id}/reopen`)
      .send({
        reason: 'Restoring verified transaction',
        actor: { id: 'usr-admin', role: 'admin' }
      });

    const dashRes = await request(app).get('/api/dashboard/overview');
    expect(dashRes.status).toBe(200);
    expect(dashRes.body.humanIntervention).toBeDefined();
    expect(dashRes.body.humanIntervention.humanDecisionsOverturned).toBeGreaterThanOrEqual(1);
    expect(dashRes.body.humanIntervention.reopenRequests).toBeGreaterThanOrEqual(1);
  });
});
