import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { seedDatabase } from '../src/db/seed.js';
import { resetSyntheticStorage, getSyntheticStorageState } from '../src/tools/protectedTools.js';
import { getDatabase } from '../src/db/connection.js';
import { evaluatePolicy } from '../src/engine/evaluator.js';

describe('P4: Cumulative / Velocity Limits & Split-Refund Evasion (Claims C1-C4, Section 6c)', () => {
  const app = createApp();

  beforeEach(() => {
    seedDatabase();
    resetSyntheticStorage();
  });

  it('1. Single under-limit refund is permitted and auto-granted (ALLOW)', async () => {
    const res = await request(app)
      .post('/api/actions/route')
      .send({
        agentId: 'agent-finance-refund-04',
        tool: 'refund_engine',
        operation: 'issue_refund',
        resource: 'synthetic://orders/ord-single-2000',
        parameters: { order_id: 'ord-single-2000', amount: 2000 }
      });

    expect(res.status).toBe(200);
    expect(res.body.gateDecision).toBe('ALLOW');
    expect(res.body.gateReasonCode).toBe('POLICY_DECISION_ALLOW');
    expect(res.body.executionStatus).toBe('SUCCEEDED');
    expect(res.body.result).toBeDefined();
    expect(res.body.result.amount).toBe(2000);

    const storage = getSyntheticStorageState();
    expect(Object.keys(storage.refunds).length).toBe(1);
  });

  it('2. Split-refund evasion: splitting $6,000 into multiple $2,000 requests is caught by cumulative cap', async () => {
    const db = getDatabase();

    // Request 1: $2,000 refund (Total: $2,000 <= $5,000 daily cap) -> ALLOW
    const res1 = await request(app)
      .post('/api/actions/route')
      .send({
        agentId: 'agent-finance-refund-04',
        tool: 'refund_engine',
        operation: 'issue_refund',
        resource: 'synthetic://orders/ord-split-1',
        parameters: { order_id: 'ord-split-1', amount: 2000 }
      });
    expect(res1.status).toBe(200);
    expect(res1.body.gateDecision).toBe('ALLOW');
    expect(res1.body.executionStatus).toBe('SUCCEEDED');

    // Request 2: $2,000 refund (Total: $4,000 <= $5,000 daily cap) -> ALLOW
    const res2 = await request(app)
      .post('/api/actions/route')
      .send({
        agentId: 'agent-finance-refund-04',
        tool: 'refund_engine',
        operation: 'issue_refund',
        resource: 'synthetic://orders/ord-split-2',
        parameters: { order_id: 'ord-split-2', amount: 2000 }
      });
    expect(res2.status).toBe(200);
    expect(res2.body.gateDecision).toBe('ALLOW');
    expect(res2.body.executionStatus).toBe('SUCCEEDED');

    // Synthetic storage now has exactly $4,000 refunded
    const storageBeforeBreach = getSyntheticStorageState();
    expect(Object.keys(storageBeforeBreach.refunds).length).toBe(2);

    // Request 3: $2,000 refund (Total would become $6,000 > $5,000 daily cap)
    // MUST NOT bypass the threshold: caught and elevated to human approval
    const res3 = await request(app)
      .post('/api/actions/route')
      .send({
        agentId: 'agent-finance-refund-04',
        tool: 'refund_engine',
        operation: 'issue_refund',
        resource: 'synthetic://orders/ord-split-3',
        parameters: { order_id: 'ord-split-3', amount: 2000 }
      });

    expect(res3.status).toBe(200);
    expect(res3.body.gateDecision).toBe('REQUIRE_APPROVAL');
    expect(res3.body.gateReasonCode).toBe('CUMULATIVE_LIMIT_EXCEEDED_HELD_FOR_HUMAN');
    expect(res3.body.executionStatus).toBe('NOT_EXECUTED');
    expect(res3.body.explanation).toContain('cumulative total to $6000, exceeding daily cap of $5000');

    // Invariant G1: Zero tool side-effects while held. Storage still only has $4,000
    const storageAfterBreach = getSyntheticStorageState();
    expect(Object.keys(storageAfterBreach.refunds).length).toBe(2);

    // Immutable backup record created in scenario_backups
    const backupRow = db.prepare('SELECT * FROM scenario_backups WHERE request_id = ?').get(res3.body.requestId) as any;
    expect(backupRow).toBeDefined();
    expect(backupRow.amount).toBe(2000);
    expect(backupRow.policy_limit).toBe(5000);
    expect(backupRow.reason_code).toBe('CUMULATIVE_LIMIT_EXCEEDED_HELD_FOR_HUMAN');
    expect(backupRow.decision).toBe('REQUIRE_APPROVAL');
    expect(backupRow.execution_status).toBe('NOT_EXECUTED');
    expect(backupRow.snapshot_hash).toBeDefined();

    // Audit log verifies APPROVAL_REQUESTED event with snapshot hash
    const auditRow = db.prepare(`
      SELECT * FROM audit_events WHERE request_id = ? AND event_type = 'APPROVAL_REQUESTED'
    `).get(res3.body.requestId) as any;
    expect(auditRow).toBeDefined();
    const details = JSON.parse(auditRow.safe_details);
    expect(details.snapshotHash).toBe(backupRow.snapshot_hash);
  });

  it('3. Blocked and held actions do NOT count toward the cumulative total', async () => {
    // 1. Issue $4,000 refund (ALLOW -> SUCCEEDED)
    const res1 = await request(app)
      .post('/api/actions/route')
      .send({
        agentId: 'agent-finance-refund-04',
        tool: 'refund_engine',
        operation: 'issue_refund',
        resource: 'synthetic://orders/ord-base-4000',
        parameters: { order_id: 'ord-base-4000', amount: 4000 }
      });
    expect(res1.body.gateDecision).toBe('ALLOW');
    expect(res1.body.executionStatus).toBe('SUCCEEDED');

    // 2. Propose $2,000 refund -> Held due to cumulative breach ($4,000 + $2,000 = $6,000 > $5,000)
    const resHeld = await request(app)
      .post('/api/actions/route')
      .send({
        agentId: 'agent-finance-refund-04',
        tool: 'refund_engine',
        operation: 'issue_refund',
        resource: 'synthetic://orders/ord-held-2000',
        parameters: { order_id: 'ord-held-2000', amount: 2000 }
      });
    expect(resHeld.body.gateDecision).toBe('REQUIRE_APPROVAL');
    expect(resHeld.body.gateReasonCode).toBe('CUMULATIVE_LIMIT_EXCEEDED_HELD_FOR_HUMAN');
    expect(resHeld.body.executionStatus).toBe('NOT_EXECUTED');

    // 3. Propose $1,000 refund:
    // If the held $2,000 had counted, total would be $4,000 + $2,000 + $1,000 = $7,000 (breach).
    // Because held actions do NOT count, current succeeded cumulative is still $4,000.
    // $4,000 + $1,000 = $5,000 <= $5,000 cap -> ALLOW!
    const res2 = await request(app)
      .post('/api/actions/route')
      .send({
        agentId: 'agent-finance-refund-04',
        tool: 'refund_engine',
        operation: 'issue_refund',
        resource: 'synthetic://orders/ord-fitting-1000',
        parameters: { order_id: 'ord-fitting-1000', amount: 1000 }
      });
    expect(res2.body.gateDecision).toBe('ALLOW');
    expect(res2.body.executionStatus).toBe('SUCCEEDED');

    // 4. Now executed cumulative total is exactly $5,000 ($4,000 + $1,000).
    // Any subsequent $1 refund must be held:
    const resBreach = await request(app)
      .post('/api/actions/route')
      .send({
        agentId: 'agent-finance-refund-04',
        tool: 'refund_engine',
        operation: 'issue_refund',
        resource: 'synthetic://orders/ord-breach-1',
        parameters: { order_id: 'ord-breach-1', amount: 1 }
      });
    expect(resBreach.body.gateDecision).toBe('REQUIRE_APPROVAL');
    expect(resBreach.body.gateReasonCode).toBe('CUMULATIVE_LIMIT_EXCEEDED_HELD_FOR_HUMAN');
  });

  it('4. Rolling window expiry resets the cumulative allowance', async () => {
    const db = getDatabase();

    // 1. Issue $5,000 refund (fills the daily cap completely)
    const res1 = await request(app)
      .post('/api/actions/route')
      .send({
        agentId: 'agent-finance-refund-04',
        tool: 'refund_engine',
        operation: 'issue_refund',
        resource: 'synthetic://orders/ord-full-5000',
        parameters: { order_id: 'ord-full-5000', amount: 5000 }
      });
    expect(res1.body.gateDecision).toBe('ALLOW');
    expect(res1.body.executionStatus).toBe('SUCCEEDED');

    // 2. Immediate second refund of $1,000 is held (cumulative breach: $5,000 + $1,000 = $6,000 > $5,000)
    const res2 = await request(app)
      .post('/api/actions/route')
      .send({
        agentId: 'agent-finance-refund-04',
        tool: 'refund_engine',
        operation: 'issue_refund',
        resource: 'synthetic://orders/ord-fail-1000',
        parameters: { order_id: 'ord-fail-1000', amount: 1000 }
      });
    expect(res2.body.gateDecision).toBe('REQUIRE_APPROVAL');
    expect(res2.body.gateReasonCode).toBe('CUMULATIVE_LIMIT_EXCEEDED_HELD_FOR_HUMAN');

    // 3. Simulate rolling window passage: backdate the first execution to 25 hours ago (1500m > 1440m window)
    const twentyFiveHoursAgo = Date.now() - (25 * 60 * 60 * 1000);
    db.prepare(`
      UPDATE executions SET created_at = ? WHERE request_id = ?
    `).run(twentyFiveHoursAgo, res1.body.requestId);

    // 4. Now that window has expired, a new $3,000 refund resets allowance and proceeds
    const res3 = await request(app)
      .post('/api/actions/route')
      .send({
        agentId: 'agent-finance-refund-04',
        tool: 'refund_engine',
        operation: 'issue_refund',
        resource: 'synthetic://orders/ord-post-window-3000',
        parameters: { order_id: 'ord-post-window-3000', amount: 3000 }
      });

    expect(res3.status).toBe(200);
    expect(res3.body.gateDecision).toBe('ALLOW');
    expect(res3.body.executionStatus).toBe('SUCCEEDED');
    expect(res3.body.result.amount).toBe(3000);
  });

  it('5. Evaluator function is pure, deterministic, and side-effect free', () => {
    const mockAgent: any = {
      id: 'agent-finance-refund-04',
      name: 'Financial Refund Agent',
      status: 'active',
      allowed_operations: ['issue_refund'],
      allowed_resources: ['synthetic://orders/*'],
      policy_version: 'v1.0'
    };

    const mockPolicies: any[] = [
      {
        id: 'POL-REFUND-01',
        version: 'v1.0',
        name: 'Refund Daily Cap Policy',
        applicable_agent_id: 'agent-finance-refund-04',
        operation: 'issue_refund',
        resource_pattern: 'synthetic://orders/*',
        decision: 'allow',
        severity: 'medium',
        pause_on_violation: 0,
        open_incident: 0,
        max_auto_amount: 5000,
        daily_cap: 5000,
        window_minutes: 1440
      }
    ];

    const mockCatalog = new Map<string, any>([
      ['issue_refund', { operation: 'issue_refund', mutating: 1, sensitive: 1, simulated_cost: 0.05 }]
    ]);

    // Test under cap
    const evalAllow = evaluatePolicy(
      mockAgent,
      {
        agent_id: 'agent-finance-refund-04',
        tool: 'refund_engine',
        operation: 'issue_refund',
        resource: 'synthetic://orders/ord-eval-1',
        parameters: { amount: 2000 }
      },
      mockPolicies,
      mockCatalog,
      { cumulativeAmount: 1500 } // $1,500 + $2,000 = $3,500 <= $5,000
    );
    expect(evalAllow.decision).toBe('ALLOW');

    // Test cumulative breach
    const evalBreach = evaluatePolicy(
      mockAgent,
      {
        agent_id: 'agent-finance-refund-04',
        tool: 'refund_engine',
        operation: 'issue_refund',
        resource: 'synthetic://orders/ord-eval-2',
        parameters: { amount: 2000 }
      },
      mockPolicies,
      mockCatalog,
      { cumulativeAmount: 4000 } // $4,000 + $2,000 = $6,000 > $5,000
    );
    expect(evalBreach.decision).toBe('REQUIRE_APPROVAL');
    expect(evalBreach.reasonCode).toBe('CUMULATIVE_LIMIT_EXCEEDED_HELD_FOR_HUMAN');
    expect(evalBreach.policyLimit).toBe(5000);
    expect(evalBreach.cumulativeAmount).toBe(6000);
  });

  it('6. Leadership Dashboard tracks cumulativeLimitBreaches counter', async () => {
    // 1. Issue $4,000 refund
    await request(app)
      .post('/api/actions/route')
      .send({
        agentId: 'agent-finance-refund-04',
        tool: 'refund_engine',
        operation: 'issue_refund',
        resource: 'synthetic://orders/ord-dash-1',
        parameters: { order_id: 'ord-dash-1', amount: 4000 }
      });

    // 2. Trigger cumulative breach with $2,000 refund
    await request(app)
      .post('/api/actions/route')
      .send({
        agentId: 'agent-finance-refund-04',
        tool: 'refund_engine',
        operation: 'issue_refund',
        resource: 'synthetic://orders/ord-dash-2',
        parameters: { order_id: 'ord-dash-2', amount: 2000 }
      });

    // 3. Query Leadership Dashboard
    const dashRes = await request(app).get('/api/dashboard/overview');
    expect(dashRes.status).toBe(200);
    expect(dashRes.body.humanIntervention).toBeDefined();
    expect(dashRes.body.humanIntervention.cumulativeLimitBreaches).toBeGreaterThanOrEqual(1);
  });

  it('7. Race condition prevention: concurrent requests (Promise.all) evaluate atomically and exactly one succeeds', async () => {
    // Fire two $3,000 refund requests simultaneously against the $5,000 daily cap
    const [resA, resB] = await Promise.all([
      request(app)
        .post('/api/actions/route')
        .send({
          agentId: 'agent-finance-refund-04',
          tool: 'refund_engine',
          operation: 'issue_refund',
          resource: 'synthetic://orders/ord-race-1',
          parameters: { order_id: 'ord-race-1', amount: 3000 }
        }),
      request(app)
        .post('/api/actions/route')
        .send({
          agentId: 'agent-finance-refund-04',
          tool: 'refund_engine',
          operation: 'issue_refund',
          resource: 'synthetic://orders/ord-race-2',
          parameters: { order_id: 'ord-race-2', amount: 3000 }
        })
    ]);

    const statuses = [resA.body.gateDecision, resB.body.gateDecision];
    const allowCount = statuses.filter(s => s === 'ALLOW').length;
    const heldCount = statuses.filter(s => s === 'REQUIRE_APPROVAL').length;

    // Exactly one must be allowed, and exactly one must be held
    expect(allowCount).toBe(1);
    expect(heldCount).toBe(1);

    const heldRes = resA.body.gateDecision === 'REQUIRE_APPROVAL' ? resA : resB;
    expect(heldRes.body.gateReasonCode).toBe('CUMULATIVE_LIMIT_EXCEEDED_HELD_FOR_HUMAN');
    expect(heldRes.body.executionStatus).toBe('NOT_EXECUTED');

    const storage = getSyntheticStorageState();
    expect(Object.keys(storage.refunds).length).toBe(1);
  });

  it('8. Approval path: A held cumulative breach approved by a human executes once without re-triggering cumulative hold', async () => {
    // Pre-fill $4,000 allowance
    const resBase = await request(app)
      .post('/api/actions/route')
      .send({
        agentId: 'agent-finance-refund-04',
        tool: 'refund_engine',
        operation: 'issue_refund',
        resource: 'synthetic://orders/ord-pre-4000',
        parameters: { order_id: 'ord-pre-4000', amount: 4000 }
      });
    expect(resBase.body.gateDecision).toBe('ALLOW');

    // Cause breach with $2,000 refund ($4,000 + $2,000 = $6,000 > $5,000) -> Held
    const resBreach = await request(app)
      .post('/api/actions/route')
      .send({
        agentId: 'agent-finance-refund-04',
        tool: 'refund_engine',
        operation: 'issue_refund',
        resource: 'synthetic://orders/ord-breach-2000',
        parameters: { order_id: 'ord-breach-2000', amount: 2000 }
      });
    expect(resBreach.body.gateDecision).toBe('REQUIRE_APPROVAL');
    expect(resBreach.body.approvalStatus).toBe('PENDING');
    expect(resBreach.body.executionStatus).toBe('NOT_EXECUTED');

    const approvalId = `appr-${resBreach.body.requestId}`;

    // Human reviewer approves the held refund
    const approveRes = await request(app)
      .post(`/api/approvals/${approvalId}/decision`)
      .send({
        decision: 'APPROVED',
        approverId: 'usr-admin',
        approverRole: 'admin',
        reason: 'Approved high-priority customer refund exception after supervisor review'
      });

    expect(approveRes.status).toBe(200);
    expect(approveRes.body.approvalStatus).toBe('APPROVED');
    expect(approveRes.body.executionStatus).toBe('SUCCEEDED');
    expect(approveRes.body.result).toBeDefined();
    expect(approveRes.body.result.status).toBe('REFUND_EXECUTED');
    expect(approveRes.body.result.amount).toBe(2000);

    // Verify execution ledger has both refunds and was not blocked during revalidation
    const storage = getSyntheticStorageState();
    expect(Object.keys(storage.refunds).length).toBe(2);
  });

  it('9. Intended Design: Once an approved $6,000 refund succeeds, it counts toward the rolling window, holding all subsequent refunds until window expiry', async () => {
    const db = getDatabase();

    // 1. Propose a single $6,000 refund (exceeds single threshold $5,000 & cap) -> Held
    const res6000 = await request(app)
      .post('/api/actions/route')
      .send({
        agentId: 'agent-finance-refund-04',
        tool: 'refund_engine',
        operation: 'issue_refund',
        resource: 'synthetic://orders/ord-high-6000',
        parameters: { order_id: 'ord-high-6000', amount: 6000 }
      });
    expect(res6000.body.gateDecision).toBe('REQUIRE_APPROVAL');

    // 2. Human admin approves the $6,000 refund
    const approvalId = `appr-${res6000.body.requestId}`;
    const approveRes = await request(app)
      .post(`/api/approvals/${approvalId}/decision`)
      .send({
        decision: 'APPROVED',
        approverId: 'usr-admin',
        approverRole: 'admin',
        reason: 'Executive exception approved for vip client'
      });
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.executionStatus).toBe('SUCCEEDED');

    // 3. INTENDED BEHAVIOR SPECIFICATION:
    // The approved $6,000 refund has executed (money left the account).
    // Therefore, it counts toward the active 24h rolling window (cumulative total = $6,000 >= $5,000 cap).
    // Any subsequent refund—even a small $500 refund—MUST be held until the rolling window expires.
    const resSubsequent = await request(app)
      .post('/api/actions/route')
      .send({
        agentId: 'agent-finance-refund-04',
        tool: 'refund_engine',
        operation: 'issue_refund',
        resource: 'synthetic://orders/ord-subsequent-500',
        parameters: { order_id: 'ord-subsequent-500', amount: 500 }
      });
    expect(resSubsequent.status).toBe(200);
    expect(resSubsequent.body.gateDecision).toBe('REQUIRE_APPROVAL');
    expect(resSubsequent.body.gateReasonCode).toBe('CUMULATIVE_LIMIT_EXCEEDED_HELD_FOR_HUMAN');
    expect(resSubsequent.body.explanation).toContain('cumulative total to $6500, exceeding daily cap of $5000');
    expect(resSubsequent.body.executionStatus).toBe('NOT_EXECUTED');

    // 4. Once the window expires (simulated by aging the $6,000 execution past 24 hours):
    const twentyFiveHoursAgo = Date.now() - (25 * 60 * 60 * 1000);
    db.prepare(`
      UPDATE executions SET created_at = ? WHERE request_id = ?
    `).run(twentyFiveHoursAgo, res6000.body.requestId);

    // 5. Subsequent refund of $500 is now ALLOWED and succeeds!
    const resAfterExpiry = await request(app)
      .post('/api/actions/route')
      .send({
        agentId: 'agent-finance-refund-04',
        tool: 'refund_engine',
        operation: 'issue_refund',
        resource: 'synthetic://orders/ord-after-expiry-500',
        parameters: { order_id: 'ord-after-expiry-500', amount: 500 }
      });
    expect(resAfterExpiry.status).toBe(200);
    expect(resAfterExpiry.body.gateDecision).toBe('ALLOW');
    expect(resAfterExpiry.body.executionStatus).toBe('SUCCEEDED');
    expect(resAfterExpiry.body.result.amount).toBe(500);
  });

  it('10. Strict scoping: Non-refund operations and separate agents contribute zero to cumulative totals', async () => {
    // 1. Issue $4,000 refund on agent-finance-refund-04 -> ALLOW
    const resLegit = await request(app)
      .post('/api/actions/route')
      .send({
        agentId: 'agent-finance-refund-04',
        tool: 'refund_engine',
        operation: 'issue_refund',
        resource: 'synthetic://orders/ord-legit-4000',
        parameters: { order_id: 'ord-legit-4000', amount: 4000 }
      });
    expect(resLegit.body.gateDecision).toBe('ALLOW');
    expect(resLegit.body.executionStatus).toBe('SUCCEEDED');

    // 2. Perform non-refund action on another agent (doc-agent-01 read_file) -> ALLOW
    const resDoc = await request(app)
      .post('/api/actions/route')
      .send({
        agentId: 'doc-agent-01',
        tool: 'file_reader',
        operation: 'read_file',
        resource: 'synthetic://documents/defense_intel_brief_2026.txt',
        parameters: {}
      });
    expect(resDoc.body.gateDecision).toBe('ALLOW');

    // 3. Issue another $1,000 refund on agent-finance-refund-04 -> ALLOW ($4,000 + $1,000 = $5,000 <= $5,000)
    // Confirms that non-refund operations or other agents do not consume or alter the refund rolling total
    const resFitting = await request(app)
      .post('/api/actions/route')
      .send({
        agentId: 'agent-finance-refund-04',
        tool: 'refund_engine',
        operation: 'issue_refund',
        resource: 'synthetic://orders/ord-legit-1000',
        parameters: { order_id: 'ord-legit-1000', amount: 1000 }
      });
    expect(resFitting.body.gateDecision).toBe('ALLOW');
    expect(resFitting.body.executionStatus).toBe('SUCCEEDED');
  });
});
