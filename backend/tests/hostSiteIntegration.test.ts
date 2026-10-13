import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { getDatabase } from '../src/db/connection.js';
import { seedDatabase } from '../src/db/seed.js';
import { parseAndVerifyGovernanceToken, computeParamsHash } from '../src/engine/governanceTokens.js';
import { getGatewaySecret } from '../src/engine/gateway.js';
import { signAuthToken } from '../src/auth/jwt.js';

describe('Host-Site & AegisOS Governance Integration Tests', () => {
  let app: any;
  let db: any;
  let reviewerToken: string;
  let adminToken: string;

  beforeEach(() => {
    db = getDatabase();
    seedDatabase(db);
    app = createApp();

    reviewerToken = signAuthToken({ id: 'usr-reviewer', role: 'reviewer' });
    adminToken = signAuthToken({ id: 'usr-admin', role: 'admin' });
  });

  it('1. Verifies existing work item req-1791842831714-f38b7ac6 is visible in approvals tab', async () => {
    const res = await request(app)
      .get('/api/approvals')
      .set('Authorization', `Bearer ${reviewerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const match = res.body.find((a: any) => a.request_id === 'req-1791842831714-f38b7ac6' || a.id === 'appr-req-1791842831714-f38b7ac6');
    expect(match).toBeDefined();
    expect(match.status).toBe('PENDING');
    expect(match.agent_id).toBe('procurement-agent-01');
    expect(match.operation).toBe('place_order');

    const params = typeof match.parameters === 'string' ? JSON.parse(match.parameters) : match.parameters;
    expect(params.amount).toBe(6200);
  });

  it('2. Authorize creates approval row when order exceeds policy threshold', async () => {
    const res = await request(app)
      .post('/api/governance/authorize')
      .set('x-aegis-api-key', 'mock-aegis-api-key')
      .send({
        agentId: 'procurement-agent-01',
        operation: 'place_order',
        resource: 'default',
        parameters: { part_id: 'PRT-ENG-99', qty: 2, amount: 7500 }
      });

    expect(res.status).toBe(200);
    expect(res.body.decision).toBe('REQUIRE_APPROVAL');
    expect(res.body.status).toBe('PENDING_APPROVAL');
    expect(res.body.requestId).toMatch(/^req-/);
    expect(res.body.token).toBeNull();

    // Verify row exists in action_requests and approvals
    const reqRow = db.prepare('SELECT * FROM action_requests WHERE id = ?').get(res.body.requestId) as any;
    expect(reqRow).toBeDefined();
    expect(reqRow.operation).toBe('place_order');

    const apprRow = db.prepare('SELECT * FROM approvals WHERE request_id = ?').get(res.body.requestId) as any;
    expect(apprRow).toBeDefined();
    expect(apprRow.status).toBe('PENDING');

    // Appears in console approvals endpoint
    const listRes = await request(app)
      .get('/api/approvals')
      .set('Authorization', `Bearer ${reviewerToken}`);
    const found = listRes.body.find((a: any) => a.request_id === res.body.requestId);
    expect(found).toBeDefined();
  });

  it('3. Full Approve Flow: Reviewer approves in console -> site poll gets APPROVED with token -> single-use token verifies', async () => {
    // Propose an order requiring approval
    const authRes = await request(app)
      .post('/api/governance/authorize')
      .set('x-aegis-api-key', 'mock-aegis-api-key')
      .send({
        agentId: 'procurement-agent-01',
        operation: 'place_order',
        resource: 'default',
        parameters: { part_id: 'PRT-HYD-04', qty: 1, amount: 6400 }
      });

    const requestId = authRes.body.requestId;
    const approvalId = `appr-${requestId}`;

    // Host-site polls status before decision -> PENDING_APPROVAL
    const pollPending = await request(app)
      .get(`/api/governance/status/${requestId}`)
      .set('x-aegis-api-key', 'mock-aegis-api-key');

    expect(pollPending.status).toBe(200);
    expect(pollPending.body.status).toBe('PENDING_APPROVAL');
    expect(pollPending.body.token).toBeNull();

    // AegisOS reviewer approves with written justification in console
    const decisionRes = await request(app)
      .post(`/api/approvals/${approvalId}/decision`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({
        decision: 'APPROVED',
        reason: 'Authorized emergency replacement for critical hydraulic pump by Duty Officer'
      });

    expect(decisionRes.status).toBe(200);
    expect(decisionRes.body.approvalStatus).toBe('APPROVED');

    // Host-site polls status on its next cycle -> APPROVED with single-use token
    const pollApproved = await request(app)
      .get(`/api/governance/status/${requestId}`)
      .set('x-aegis-api-key', 'mock-aegis-api-key');

    expect(pollApproved.status).toBe(200);
    expect(pollApproved.body.status).toBe('APPROVED');
    expect(pollApproved.body.decision).toBe('ALLOW');
    expect(pollApproved.body.reviewer).toBe('usr-reviewer');
    expect(pollApproved.body.reviewReason).toContain('Duty Officer');
    expect(typeof pollApproved.body.token).toBe('string');
    expect(typeof pollApproved.body.nonce).toBe('string');

    // Verify token cryptographic signature and parameters binding
    const verification = parseAndVerifyGovernanceToken(pollApproved.body.token, getGatewaySecret());
    expect(verification.valid).toBe(true);
    expect(verification.claims).toBeDefined();
    expect(verification.claims?.req).toBe(requestId);
    expect(verification.claims?.op).toBe('place_order');
    expect(verification.claims?.ph).toBe(computeParamsHash({ part_id: 'PRT-HYD-04', qty: 1, amount: 6400 }));

    // Host site reports result
    const resultRes = await request(app)
      .post('/api/governance/result')
      .set('x-aegis-api-key', 'mock-aegis-api-key')
      .send({
        requestId,
        nonce: pollApproved.body.nonce,
        executionStatus: 'SUCCEEDED',
        outcome: { orderId: 'ORD-101', status: 'PLACED' },
        durationMs: 45
      });

    expect(resultRes.status).toBe(200);
    expect(resultRes.body.acknowledged).toBe(true);

    const execRow = db.prepare('SELECT * FROM executions WHERE request_id = ?').get(requestId) as any;
    expect(execRow.status).toBe('SUCCEEDED');
  });

  it('4. Full Reject Flow: Reviewer rejects in console -> site poll gets REJECTED with reason', async () => {
    // Propose an order requiring approval
    const authRes = await request(app)
      .post('/api/governance/authorize')
      .set('x-aegis-api-key', 'mock-aegis-api-key')
      .send({
        agentId: 'procurement-agent-01',
        operation: 'place_order',
        resource: 'default',
        parameters: { part_id: 'PRT-NON-ESSENTIAL', qty: 10, amount: 9000 }
      });

    const requestId = authRes.body.requestId;
    const approvalId = `appr-${requestId}`;

    // AegisOS reviewer rejects in console
    const decisionRes = await request(app)
      .post(`/api/approvals/${approvalId}/decision`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({
        decision: 'REJECTED',
        reason: 'Budget ceiling exceeded; requisition deferred to Q4 review'
      });

    expect(decisionRes.status).toBe(200);
    expect(decisionRes.body.approvalStatus).toBe('REJECTED');

    // Host-site polls status -> REJECTED with reason and no token
    const pollRejected = await request(app)
      .get(`/api/governance/status/${requestId}`)
      .set('x-aegis-api-key', 'mock-aegis-api-key');

    expect(pollRejected.status).toBe(200);
    expect(pollRejected.body.status).toBe('REJECTED');
    expect(pollRejected.body.decision).toBe('BLOCK');
    expect(pollRejected.body.token).toBeNull();
    expect(pollRejected.body.reviewer).toBe('usr-reviewer');
    expect(pollRejected.body.reviewReason).toContain('Budget ceiling exceeded');
  });

  it('5. Approving the original held request req-1791842831714-f38b7ac6 succeeds and issues token', async () => {
    const approvalId = 'appr-req-1791842831714-f38b7ac6';

    const decisionRes = await request(app)
      .post(`/api/approvals/${approvalId}/decision`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({
        decision: 'APPROVED',
        reason: 'Authorized main propulsion bearing requisition by Duty Officer'
      });

    expect(decisionRes.status).toBe(200);
    expect(decisionRes.body.approvalStatus).toBe('APPROVED');

    const pollRes = await request(app)
      .get('/api/governance/status/req-1791842831714-f38b7ac6')
      .set('x-aegis-api-key', 'mock-aegis-api-key');

    expect(pollRes.status).toBe(200);
    expect(pollRes.body.status).toBe('APPROVED');
    expect(typeof pollRes.body.token).toBe('string');
    expect(pollRes.body.reviewReason).toContain('propulsion bearing');
  });

  it('6. Agent Control & Heartbeat endpoints respond to host runtime', async () => {
    const ctrlRes = await request(app)
      .get('/api/control/agents/procurement-agent-01')
      .set('x-aegis-api-key', 'mock-aegis-api-key');

    expect(ctrlRes.status).toBe(200);
    expect(ctrlRes.body.status).toBe('ACTIVE');
    expect(ctrlRes.body.config.toolAllowlist).toContain('place_order');

    const hbRes = await request(app)
      .post('/api/control/heartbeat')
      .set('x-aegis-api-key', 'mock-aegis-api-key')
      .send({ agentId: 'procurement-agent-01', timestamp: Date.now() });

    expect(hbRes.status).toBe(200);
    expect(hbRes.body.acknowledged).toBe(true);
    expect(hbRes.body.controlStatus).toBe('ACTIVE');
  });
});
