import { createApp } from '../src/app.js';
import { seedDatabase } from '../src/db/seed.js';
import { resetSyntheticStorage, getSyntheticStorageState } from '../src/tools/protectedTools.js';
import { getDatabase } from '../src/db/connection.js';
import { createDynamicAuthedRequest } from './helpers/authHelper.js';

const request = (appInstance: any) => createDynamicAuthedRequest(appInstance);

describe('AegisOS Policy Threshold, Backup & Wrong Human Call Reinstatement (Claims C1-C4, Sections 6b/6c)', () => {
  const app = createApp();

  beforeEach(() => {
    process.env.DEMO_MODE = 'true';
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

  it('2. Elevates refund exceeding threshold ($6,000 > $5,000) to REQUIRE_APPROVAL and creates immutable scenario backup with amount, limit, actor, and audit trail', async () => {
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

    // Verify scenario backup record was created with amount, limit, policy metadata, actor, snapshot hash
    const backupsRes = await request(app).get('/api/backups?agentId=agent-finance-refund-04');
    expect(backupsRes.status).toBe(200);
    expect(backupsRes.body.length).toBeGreaterThanOrEqual(1);

    const latest = backupsRes.body[0];
    expect(latest.operation).toBe('issue_refund');
    expect(latest.amount).toBe(6000);
    expect(latest.policy_limit).toBe(5000);
    expect(latest.policy_id).toBeDefined();
    expect(latest.policy_version).toBeDefined();
    expect(latest.policy_hash).toBeDefined();
    expect(latest.evidence_checks).toBeDefined();
    expect(latest.decision).toBe('REQUIRE_APPROVAL');
    expect(latest.reason_code).toBe('THRESHOLD_EXCEEDED_REQUIRES_APPROVAL');
    expect(latest.actor).toBe('agent-finance-refund-04');
    expect(latest.snapshot_hash).toBeDefined();
    expect(latest.correction_status).toBe('NONE');
    expect(latest.parameters_snapshot.order_id).toBe('ord-6022');

    // Verify snapshot hash and metadata also written to the audit log
    const auditRes = await request(app).get('/api/audit');
    const reqAudit = auditRes.body.find((e: any) => e.request_id === res.body.requestId && e.event_type === 'APPROVAL_REQUESTED');
    expect(reqAudit).toBeDefined();
    const details = typeof reqAudit.safe_details === 'string' ? JSON.parse(reqAudit.safe_details) : reqAudit.safe_details;
    expect(details.amount).toBe(6000);
    expect(details.limit).toBe(5000);
    expect(details.snapshotHash).toBe(latest.snapshot_hash);
    expect(details.actor).toBe('agent-finance-refund-04');
  });

  it('2b. Creates immutable scenario backup and audit log for BLOCK events with amount, limit, actor, and hash', async () => {
    const res = await request(app)
      .post('/api/actions/route')
      .send({
        agentId: 'agent-cyber-monitor-02',
        tool: 'credential_manager',
        operation: 'wipe_credentials',
        resource: 'synthetic://enclaves/perimeter_firewall',
        parameters: { reason: 'Unauthorized wipe attempt', amount: 0 }
      });

    expect(res.status).toBe(200);
    expect(res.body.gateDecision).toBe('BLOCK');

    const backupsRes = await request(app).get('/api/backups?agentId=agent-cyber-monitor-02');
    expect(backupsRes.body.length).toBeGreaterThanOrEqual(1);
    const blockBackup = backupsRes.body[0];
    expect(blockBackup.decision).toBe('BLOCK');
    expect(blockBackup.operation).toBe('wipe_credentials');
    expect(blockBackup.actor).toBe('agent-cyber-monitor-02');
    expect(blockBackup.snapshot_hash).toBeDefined();

    // Verify audit log has VIOLATION_CONTAINED with backup details
    const auditRes = await request(app).get('/api/audit');
    const blockAudit = auditRes.body.find((e: any) => e.request_id === res.body.requestId && e.event_type === 'VIOLATION_CONTAINED');
    expect(blockAudit).toBeDefined();
    const details = typeof blockAudit.safe_details === 'string' ? JSON.parse(blockAudit.safe_details) : blockAudit.safe_details;
    expect(details.snapshotHash).toBe(blockBackup.snapshot_hash);
    expect(details.actor).toBe('agent-cyber-monitor-02');
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

  it('5. Reopen rule: written reason is required (empty reason rejected)', async () => {
    const routeRes = await request(app)
      .post('/api/actions/route')
      .send({
        agentId: 'agent-finance-refund-04',
        tool: 'refund_engine',
        operation: 'issue_refund',
        resource: 'synthetic://orders/ord-reason-test',
        parameters: { order_id: 'ord-reason-test', amount: 6000 }
      });

    const approvalId = `appr-${routeRes.body.requestId}`;
    await request(app)
      .post(`/api/approvals/${approvalId}/decision`)
      .send({
        decision: 'REJECTED',
        approverId: 'usr-reviewer',
        approverRole: 'reviewer',
        reason: 'Mistaken rejection'
      });

    const backupsRes = await request(app).get('/api/backups?agentId=agent-finance-refund-04');
    const backupId = backupsRes.body[0].id;

    const noReasonRes = await request(app)
      .post(`/api/backups/${backupId}/reopen`)
      .send({
        reason: '',
        actor: { id: 'usr-admin', role: 'admin' }
      });

    expect(noReasonRes.status).toBe(400);
    expect(noReasonRes.body.error).toContain('Invalid reopen payload');
  });

  it('6. Reopen rule: only allowed within configurable window (REOPEN_WINDOW_MS)', async () => {
    const db = getDatabase();
    const routeRes = await request(app)
      .post('/api/actions/route')
      .send({
        agentId: 'agent-finance-refund-04',
        tool: 'refund_engine',
        operation: 'issue_refund',
        resource: 'synthetic://orders/ord-window-test',
        parameters: { order_id: 'ord-window-test', amount: 6000 }
      });

    const approvalId = `appr-${routeRes.body.requestId}`;
    await request(app)
      .post(`/api/approvals/${approvalId}/decision`)
      .send({
        decision: 'REJECTED',
        approverId: 'usr-reviewer',
        approverRole: 'reviewer',
        reason: 'Initial rejection'
      });

    const backupsRes = await request(app).get('/api/backups?agentId=agent-finance-refund-04');
    const backupId = backupsRes.body[0].id;

    // Set short window: 500ms
    process.env.REOPEN_WINDOW_MS = '500';
    try {
      // Artificially backdate created_at by 1000ms
      db.prepare('UPDATE scenario_backups SET created_at = ? WHERE id = ?').run(Date.now() - 1000, backupId);

      const expiredRes = await request(app)
        .post(`/api/backups/${backupId}/reopen`)
        .send({
          reason: 'Attempting reopen after window expiration',
          actor: { id: 'usr-admin', role: 'admin' }
        });

      expect(expiredRes.status).toBe(400);
      expect(expiredRes.body.error).toContain('EXPIRED_REOPEN_WINDOW');
    } finally {
      delete process.env.REOPEN_WINDOW_MS;
    }
  });

  it('7. Reopen rule: re-evaluation against agent status blocks reopen if agent is paused', async () => {
    const db = getDatabase();
    const routeRes = await request(app)
      .post('/api/actions/route')
      .send({
        agentId: 'agent-finance-refund-04',
        tool: 'refund_engine',
        operation: 'issue_refund',
        resource: 'synthetic://orders/ord-paused-test',
        parameters: { order_id: 'ord-paused-test', amount: 6000 }
      });

    const approvalId = `appr-${routeRes.body.requestId}`;
    await request(app)
      .post(`/api/approvals/${approvalId}/decision`)
      .send({
        decision: 'REJECTED',
        approverId: 'usr-reviewer',
        approverRole: 'reviewer',
        reason: 'Initial rejection'
      });

    const backupsRes = await request(app).get('/api/backups?agentId=agent-finance-refund-04');
    const backupId = backupsRes.body[0].id;

    // Pause agent
    db.prepare("UPDATE agents SET status = 'paused' WHERE id = 'agent-finance-refund-04'").run();

    const pausedReopenRes = await request(app)
      .post(`/api/backups/${backupId}/reopen`)
      .send({
        reason: 'Attempting reopen on paused agent',
        actor: { id: 'usr-admin', role: 'admin' }
      });

    expect(pausedReopenRes.status).toBe(400);
    expect(pausedReopenRes.body.error).toContain('AGENT_PAUSED');
  });

  it('8. Reopen rule: only for REJECTED approvals; reopening non-rejected approval is prohibited', async () => {
    // Route 6000 refund -> held
    const routeRes = await request(app)
      .post('/api/actions/route')
      .send({
        agentId: 'agent-finance-refund-04',
        tool: 'refund_engine',
        operation: 'issue_refund',
        resource: 'synthetic://orders/ord-non-reject-test',
        parameters: { order_id: 'ord-non-reject-test', amount: 6000 }
      });

    const approvalId = `appr-${routeRes.body.requestId}`;

    // Approve it
    await request(app)
      .post(`/api/approvals/${approvalId}/decision`)
      .send({
        decision: 'APPROVED',
        approverId: 'usr-reviewer',
        approverRole: 'reviewer',
        reason: 'Authorized approval'
      });

    const backupsRes = await request(app).get('/api/backups?agentId=agent-finance-refund-04');
    const backupId = backupsRes.body[0].id;

    // Attempting to reopen an APPROVED decision fails
    const reopenApprovedRes = await request(app)
      .post(`/api/backups/${backupId}/reopen`)
      .send({
        reason: 'Attempting to reopen an already approved request',
        actor: { id: 'usr-admin', role: 'admin' }
      });

    expect(reopenApprovedRes.status).toBe(400);
    expect(reopenApprovedRes.body.error).toContain('CANNOT_REOPEN_NON_REJECTED');
  });

  it('9. Policy prohibitions cannot be reopened or overridden (Invariant G1/G2 preserved)', async () => {
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

  it('10. DECISION_OVERTURNED audit event links old rejection to reopen; original rejection row is never modified', async () => {
    const db = getDatabase();
    const routeRes = await request(app)
      .post('/api/actions/route')
      .send({
        agentId: 'agent-finance-refund-04',
        tool: 'refund_engine',
        operation: 'issue_refund',
        resource: 'synthetic://orders/ord-link-test',
        parameters: { order_id: 'ord-link-test', amount: 6000 }
      });

    const approvalId = `appr-${routeRes.body.requestId}`;

    // Reviewer-1 rejects
    await request(app)
      .post(`/api/approvals/${approvalId}/decision`)
      .send({
        decision: 'REJECTED',
        approverId: 'usr-reviewer',
        approverRole: 'reviewer',
        reason: 'Mistaken initial rejection'
      });

    // Check original approval row before reopen
    const origBefore = db.prepare('SELECT * FROM approvals WHERE id = ?').get(approvalId) as any;
    expect(origBefore.status).toBe('REJECTED');
    expect(origBefore.approver_id).toBe('usr-reviewer');

    const backupsRes = await request(app).get('/api/backups?agentId=agent-finance-refund-04');
    const backupId = backupsRes.body[0].id;

    // Second admin reopens
    const reopenRes = await request(app)
      .post(`/api/backups/${backupId}/reopen`)
      .send({
        reason: 'Administrative correction after verified documentation',
        actor: { id: 'usr-admin', role: 'admin' }
      });

    expect(reopenRes.status).toBe(200);
    const newApprovalId = reopenRes.body.newApprovalId;
    expect(newApprovalId).toBeDefined();

    // INVARIANT: Original rejection row must NEVER be modified
    const origAfter = db.prepare('SELECT * FROM approvals WHERE id = ?').get(approvalId) as any;
    expect(origAfter.status).toBe('REJECTED');
    expect(origAfter.approver_id).toBe('usr-reviewer');
    expect(origAfter.reason).toBe('Mistaken initial rejection');

    // New approval row created with link to old rejection
    const newApproval = db.prepare('SELECT * FROM approvals WHERE id = ?').get(newApprovalId) as any;
    expect(newApproval.status).toBe('PENDING');
    expect(newApproval.reopened_from_id).toBe(approvalId);

    // Verify DECISION_OVERTURNED audit event links old rejection to new approval
    const auditRes = await request(app).get('/api/audit');
    const overturn = auditRes.body.find((e: any) => e.event_type === 'DECISION_OVERTURNED' && e.request_id === routeRes.body.requestId);
    expect(overturn).toBeDefined();
    const details = typeof overturn.safe_details === 'string' ? JSON.parse(overturn.safe_details) : overturn.safe_details;
    expect(details.originalApprovalId).toBe(approvalId);
    expect(details.newApprovalId).toBe(newApprovalId);
    expect(details.snapshotHash).toBe(backupsRes.body[0].snapshot_hash);

    // Reopen allowed only ONCE per request
    const secondReopen = await request(app)
      .post(`/api/backups/${backupId}/reopen`)
      .send({
        reason: 'Duplicate reopen attempt',
        actor: { id: 'usr-admin', role: 'admin' }
      });
    expect(secondReopen.status).toBe(400);
    expect(secondReopen.body.error).toContain('ALREADY_REOPENED');
  });

  it('11. UI Wrong-call prevention logs REJECTION_CONFIRMED_DESPITE_PASSED_CHECKS to audit trail when confirmed', async () => {
    const routeRes = await request(app)
      .post('/api/actions/route')
      .send({
        agentId: 'agent-finance-refund-04',
        tool: 'refund_engine',
        operation: 'issue_refund',
        resource: 'synthetic://orders/ord-wrongcall-test',
        parameters: { order_id: 'ord-wrongcall-test', amount: 6000 }
      });

    const approvalId = `appr-${routeRes.body.requestId}`;

    // Admin confirms rejection despite passed checks
    const rejectRes = await request(app)
      .post(`/api/approvals/${approvalId}/decision`)
      .send({
        decision: 'REJECTED',
        approverId: 'usr-reviewer',
        approverRole: 'reviewer',
        reason: 'Confirmed administrative rejection despite passed checks due to customer dispute',
        wrongCallConfirmed: true
      });

    expect(rejectRes.status).toBe(200);

    // Verify audit log has REJECTION_CONFIRMED_DESPITE_PASSED_CHECKS
    const auditRes = await request(app).get('/api/audit');
    const wrongCallAudit = auditRes.body.find((e: any) => e.event_type === 'REJECTION_CONFIRMED_DESPITE_PASSED_CHECKS');
    expect(wrongCallAudit).toBeDefined();
    const details = typeof wrongCallAudit.safe_details === 'string' ? JSON.parse(wrongCallAudit.safe_details) : wrongCallAudit.safe_details;
    expect(details.amount).toBe(6000);
    expect(details.warningAcknowledged).toBe(true);
    expect(details.passedChecks).toBeDefined();
  });

  it('12. ACCEPTANCE STORY: 4,000 allowed, 6,000 held, wrong reject, second admin reopens & approves, refund executes exactly once', async () => {
    const db = getDatabase();

    // STEP 1: 4,000 allowed -> executed immediately without hold
    const res4000 = await request(app)
      .post('/api/actions/route')
      .send({
        agentId: 'agent-finance-refund-04',
        tool: 'refund_engine',
        operation: 'issue_refund',
        resource: 'synthetic://orders/ord-story-4000',
        parameters: { order_id: 'ord-story-4000', amount: 4000, idempotency_key: 'idem-story-4000' }
      });

    expect(res4000.status).toBe(200);
    expect(res4000.body.gateDecision).toBe('ALLOW');
    expect(res4000.body.executionStatus).toBe('SUCCEEDED');
    expect(res4000.body.result.amount).toBe(4000);

    const storageAfter4000 = getSyntheticStorageState();
    expect(Object.keys(storageAfter4000.refunds).length).toBe(1);
    expect((storageAfter4000.refunds['idem-story-4000'] as any).amount).toBe(4000);

    // STEP 2: 6,000 held -> REQUIRE_APPROVAL, zero side effects
    const res6000 = await request(app)
      .post('/api/actions/route')
      .send({
        agentId: 'agent-finance-refund-04',
        tool: 'refund_engine',
        operation: 'issue_refund',
        resource: 'synthetic://orders/ord-story-6000',
        parameters: { order_id: 'ord-story-6000', amount: 6000, idempotency_key: 'idem-story-6000' }
      });

    expect(res6000.status).toBe(200);
    expect(res6000.body.gateDecision).toBe('REQUIRE_APPROVAL');
    expect(res6000.body.approvalStatus).toBe('PENDING');
    expect(res6000.body.executionStatus).toBe('NOT_EXECUTED');

    // Storage still has only the 4,000 refund (zero mutations for 6,000)
    const storageAfter6000 = getSyntheticStorageState();
    expect(Object.keys(storageAfter6000.refunds).length).toBe(1);

    const origApprovalId = `appr-${res6000.body.requestId}`;

    // STEP 3: Reviewer wrongly rejects the 6,000 request
    const wrongRejectRes = await request(app)
      .post(`/api/approvals/${origApprovalId}/decision`)
      .send({
        decision: 'REJECTED',
        approverId: 'usr-reviewer',
        approverRole: 'reviewer',
        reason: 'Misidentified transaction velocity pattern as fraudulent',
        wrongCallConfirmed: true
      });

    expect(wrongRejectRes.status).toBe(200);
    expect(wrongRejectRes.body.approvalStatus).toBe('REJECTED');
    expect(wrongRejectRes.body.executionStatus).toBe('NOT_EXECUTED');

    // Storage still only has 4,000
    expect(Object.keys(getSyntheticStorageState().refunds).length).toBe(1);

    // STEP 4: Second admin (usr-admin) reopens
    const backupsRes = await request(app).get('/api/backups?agentId=agent-finance-refund-04');
    const backup6000 = backupsRes.body.find((b: any) => b.request_id === res6000.body.requestId);
    expect(backup6000).toBeDefined();

    const reopenRes = await request(app)
      .post(`/api/backups/${backup6000.id}/reopen`)
      .send({
        reason: 'Reopened following executive audit: customer return document verified legitimate.',
        actor: { id: 'usr-admin', role: 'admin' }
      });

    expect(reopenRes.status).toBe(200);
    expect(reopenRes.body.status).toBe('REOPENED');
    const newApprovalId = reopenRes.body.newApprovalId;
    expect(newApprovalId).toBeDefined();

    // Verify original rejection row was never modified
    const origRow = db.prepare('SELECT * FROM approvals WHERE id = ?').get(origApprovalId) as any;
    expect(origRow.status).toBe('REJECTED');
    expect(origRow.approver_id).toBe('usr-reviewer');

    // STEP 5: Second admin (usr-admin) approves the reopened request
    const approveRes = await request(app)
      .post(`/api/approvals/${newApprovalId}/decision`)
      .send({
        decision: 'APPROVED',
        approverId: 'usr-admin',
        approverRole: 'admin',
        reason: 'Authorized disbursement after administrative re-review'
      });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.approvalStatus).toBe('APPROVED');
    expect(approveRes.body.executionStatus).toBe('SUCCEEDED');
    expect(approveRes.body.result.status).toBe('REFUND_EXECUTED');
    expect(approveRes.body.result.amount).toBe(6000);

    // STEP 6: Refund executed exactly once in synthetic storage ledger
    const storageFinal = getSyntheticStorageState();
    expect(Object.keys(storageFinal.refunds).length).toBe(2);
    expect((storageFinal.refunds['idem-story-4000'] as any).amount).toBe(4000);
    expect((storageFinal.refunds['idem-story-6000'] as any).amount).toBe(6000);

    // Idempotency: Simultaneous approval attempts on same reopened approval evaluate atomically
    const [dup1, dup2] = await Promise.all([
      request(app)
        .post(`/api/approvals/${newApprovalId}/decision`)
        .send({
          decision: 'APPROVED',
          approverId: 'usr-admin',
          approverRole: 'admin',
          reason: 'Concurrent approval attempt A'
        }),
      request(app)
        .post(`/api/approvals/${newApprovalId}/decision`)
        .send({
          decision: 'APPROVED',
          approverId: 'usr-admin-2',
          approverRole: 'admin',
          reason: 'Concurrent approval attempt B'
        })
    ]);

    // Both fail with 409 APPROVAL_ALREADY_DECIDED because it was already approved in step 5
    expect(dup1.status).toBe(409);
    expect(dup2.status).toBe(409);
    expect(dup1.body.error).toContain('APPROVAL_ALREADY_DECIDED');
    expect(dup2.body.error).toContain('APPROVAL_ALREADY_DECIDED');

    // Ledger still exactly 2 refunds (no double disbursement)
    expect(Object.keys(getSyntheticStorageState().refunds).length).toBe(2);
  });

  it('13. Leadership Dashboard reflects human intervention overturn metrics', async () => {
    // 1. Submit action requiring approval
    const res = await request(app)
      .post('/api/actions/route')
      .send({
        agentId: 'agent-finance-refund-04',
        tool: 'refund_engine',
        operation: 'issue_refund',
        resource: 'synthetic://orders/ord-dash-6000',
        parameters: { order_id: 'ord-dash-6000', amount: 6000 }
      });
    expect(res.body.gateDecision).toBe('REQUIRE_APPROVAL');

    const origApprovalId = `appr-${res.body.requestId}`;

    // 2. Reject it with wrong call confirmation
    await request(app)
      .post(`/api/approvals/${origApprovalId}/decision`)
      .send({
        decision: 'REJECTED',
        approverId: 'usr-reviewer',
        approverRole: 'reviewer',
        reason: 'Misidentified velocity',
        wrongCallConfirmed: true
      });

    // 3. Reopen via backup
    const backupsRes = await request(app).get('/api/backups?agentId=agent-finance-refund-04');
    const backupItem = backupsRes.body.find((b: any) => b.request_id === res.body.requestId);
    expect(backupItem).toBeDefined();

    const reopenRes = await request(app)
      .post(`/api/backups/${backupItem.id}/reopen`)
      .send({
        reason: 'Authorized reopen',
        actor: { id: 'usr-admin', role: 'admin' }
      });
    expect(reopenRes.status).toBe(200);

    // 4. Check dashboard metrics reflect overturned decisions & reopen requests
    const dashRes = await request(app).get('/api/dashboard/overview');
    expect(dashRes.status).toBe(200);
    expect(dashRes.body.humanIntervention).toBeDefined();
    expect(dashRes.body.humanIntervention.humanDecisionsOverturned).toBeGreaterThanOrEqual(1);
    expect(dashRes.body.humanIntervention.reopenRequests).toBeGreaterThanOrEqual(1);
  });
});
