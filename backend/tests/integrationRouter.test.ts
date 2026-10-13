import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { getDatabase } from '../src/db/connection.js';
import { seedDatabase } from '../src/db/seed.js';
import { signAuthToken } from '../src/auth/jwt.js';
import {
  verifyEd25519Token,
  computeParamsHash,
  getPublicKeyPem
} from '../src/engine/ed25519Tokens.js';

describe('Additive Router: /api/integration', () => {
  let app: any;
  let db: any;
  let reviewerToken: string;

  beforeEach(() => {
    db = getDatabase();
    seedDatabase(db);
    app = createApp();
    reviewerToken = signAuthToken({ id: 'usr-reviewer', role: 'reviewer' });
  });

  it('1. GET /api/integration/public-key returns Ed25519 public key', async () => {
    const res = await request(app).get('/api/integration/public-key');

    expect(res.status).toBe(200);
    expect(res.body.algorithm).toBe('Ed25519');
    expect(res.body.publicKey).toContain('BEGIN PUBLIC KEY');
    expect(res.body.public_key).toBe(res.body.publicKey);

    // Text/plain accept header
    const textRes = await request(app)
      .get('/api/integration/public-key')
      .set('Accept', 'text/plain');
    expect(textRes.status).toBe(200);
    expect(textRes.text).toContain('BEGIN PUBLIC KEY');
  });

  it('2. ALLOW returns a verifiable token with Ed25519 signature and required claims', async () => {
    const orderParams = { part_id: 'SPARE-001', qty: 2, amount: 2500 };
    const res = await request(app)
      .post('/api/integration/authorize')
      .set('x-agent-key', 'key-procurement-01')
      .send({
        operation: 'place_order',
        resource: 'logistics://orders/101',
        params: orderParams,
        work_item_ref: 'item-proc-101',
        task_type: 'procurement',
        reason: 'Restocking critical propulsion filters'
      });

    expect(res.status).toBe(200);
    expect(res.body.decision).toBe('ALLOW');
    expect(res.body.request_id).toMatch(/^req-/);
    expect(typeof res.body.token).toBe('string');

    const token = res.body.token;

    // Verify token cryptographically using public key
    const verification = verifyEd25519Token(token, {
      expectedParams: orderParams,
      expectedOperation: 'place_order',
      expectedResource: 'logistics://orders/101',
      expectedAgentId: 'procurement-agent-01',
      db
    });

    expect(verification.valid).toBe(true);
    expect(verification.claims).toBeDefined();
    expect(verification.claims?.request_id).toBe(res.body.request_id);
    expect(verification.claims?.agent_id).toBe('procurement-agent-01');
    expect(verification.claims?.operation).toBe('place_order');
    expect(verification.claims?.resource).toBe('logistics://orders/101');
    expect(verification.claims?.params_hash).toBe(computeParamsHash(orderParams));
    expect(verification.claims?.nonce).toMatch(/^nonce-/);
    expect(typeof verification.claims?.exp).toBe('number');

    // Token expires within ~60 seconds
    const nowSec = Math.floor(Date.now() / 1000);
    expect(verification.claims!.exp - nowSec).toBeGreaterThanOrEqual(50);
    expect(verification.claims!.exp - nowSec).toBeLessThanOrEqual(65);

    // Verify row was created in executions table and audit_events
    const execRow = db.prepare('SELECT * FROM executions WHERE request_id = ?').get(res.body.request_id) as any;
    expect(execRow).toBeDefined();
    expect(execRow.status).toBe('EXECUTING');

    const auditRow = db.prepare("SELECT * FROM audit_events WHERE request_id = ? AND event_type = 'GATE_DECIDED'").get(res.body.request_id) as any;
    expect(auditRow).toBeDefined();
  });

  it('3. REQUIRE_APPROVAL creates a visible pending approval in the normal Approvals tab', async () => {
    // Single order limit is 5,000. Amount 7,500 exceeds threshold -> REQUIRE_APPROVAL
    const res = await request(app)
      .post('/api/integration/authorize')
      .set('x-agent-key', 'key-procurement-01')
      .send({
        operation: 'place_order',
        resource: 'logistics://orders/102',
        params: { part_id: 'PRT-ENG-TURBINE', qty: 1, amount: 7500 },
        work_item_ref: 'item-proc-102',
        task_type: 'procurement',
        reason: 'Large turbine replacement requisition'
      });

    expect(res.status).toBe(200);
    expect(res.body.decision).toBe('REQUIRE_APPROVAL');
    expect(res.body.status).toBe('PENDING');
    expect(res.body.request_id).toMatch(/^req-/);

    const requestId = res.body.request_id;

    // Verify the approval exists in the database
    const apprRow = db.prepare('SELECT * FROM approvals WHERE request_id = ?').get(requestId) as any;
    expect(apprRow).toBeDefined();
    expect(apprRow.status).toBe('PENDING');

    // Verify it is visible in the standard AegisOS Approvals tab via GET /api/approvals
    const approvalsRes = await request(app)
      .get('/api/approvals')
      .set('Authorization', `Bearer ${reviewerToken}`);

    expect(approvalsRes.status).toBe(200);
    const visibleApproval = approvalsRes.body.find((a: any) => a.request_id === requestId || a.id === `appr-${requestId}`);
    expect(visibleApproval).toBeDefined();
    expect(visibleApproval.status).toBe('PENDING');
    expect(visibleApproval.operation).toBe('place_order');

    // Executions table has status NOT_EXECUTED with APPROVAL_PENDING
    const execRow = db.prepare('SELECT * FROM executions WHERE request_id = ?').get(requestId) as any;
    expect(execRow).toBeDefined();
    expect(execRow.status).toBe('NOT_EXECUTED');
    expect(execRow.non_execution_reason).toBe('APPROVAL_PENDING');
  });

  it('4. BLOCK returns reason code when policy is violated', async () => {
    // wipe_credentials is strictly prohibited with auto-pause
    const res = await request(app)
      .post('/api/integration/authorize')
      .set('x-agent-key', 'key-cyber-01')
      .send({
        operation: 'wipe_credentials',
        resource: 'enclave://credentials/vault',
        params: { target: 'all' },
        work_item_ref: 'item-cyber-99',
        task_type: 'cyber',
        reason: 'Malicious or rogue command attempt'
      });

    expect(res.status).toBe(200);
    expect(res.body.decision).toBe('BLOCK');
    expect(res.body.request_id).toMatch(/^req-/);
    expect(res.body.reason_code).toBeDefined();

    // Verify agent status transitioned to paused
    const agent = db.prepare("SELECT status FROM agents WHERE id = 'cyber-agent-01'").get() as any;
    expect(agent.status).toBe('paused');

    // Verify incident was opened
    const incident = db.prepare("SELECT * FROM incidents WHERE agent_id = 'cyber-agent-01' AND triggering_request_id = ?").get(res.body.request_id) as any;
    expect(incident).toBeDefined();
    expect(incident.status).toBe('OPEN');

    // Verify execution row
    const execRow = db.prepare('SELECT * FROM executions WHERE request_id = ?').get(res.body.request_id) as any;
    expect(execRow.status).toBe('NOT_EXECUTED');
    expect(execRow.non_execution_reason).toBe('BLOCKED_BY_POLICY');
  });

  it('5. Replayed or altered token fails verification', async () => {
    // Generate valid token
    const res = await request(app)
      .post('/api/integration/authorize')
      .set('x-agent-key', 'key-procurement-01')
      .send({
        operation: 'place_order',
        resource: 'logistics://orders/201',
        params: { amount: 1000 },
        task_type: 'procurement'
      });

    expect(res.status).toBe(200);
    const token = res.body.token;

    // 1. First verification with consume: true should succeed
    const firstCheck = verifyEd25519Token(token, { db, consume: true });
    expect(firstCheck.valid).toBe(true);

    // 2. Replay attack: Second verification of the consumed single-use token MUST fail
    const replayCheck = verifyEd25519Token(token, { db, consume: true });
    expect(replayCheck.valid).toBe(false);
    expect(replayCheck.error).toBe('TOKEN_ALREADY_USED');

    // 3. Altered token: Tampered payload
    const [payloadB64, sigB64] = token.split('.');
    const claims = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
    claims.operation = 'unauthorized_action';
    const tamperedPayloadB64 = Buffer.from(JSON.stringify(claims), 'utf8').toString('base64url');
    const tamperedToken = `${tamperedPayloadB64}.${sigB64}`;

    const tamperedCheck = verifyEd25519Token(tamperedToken);
    expect(tamperedCheck.valid).toBe(false);
    expect(tamperedCheck.error).toBe('INVALID_SIGNATURE');

    // 4. Altered token: Tampered signature
    const badSigB64 = sigB64.slice(0, -4) + 'AAAA';
    const badSigToken = `${payloadB64}.${badSigB64}`;
    const badSigCheck = verifyEd25519Token(badSigToken);
    expect(badSigCheck.valid).toBe(false);
    expect(badSigCheck.error).toBe('INVALID_SIGNATURE');
  });

  it('6. Paused agent is blocked with AGENT_PAUSED reason code', async () => {
    // Manually pause procurement-agent-01
    db.prepare("UPDATE agents SET status = 'paused' WHERE id = 'procurement-agent-01'").run();

    const res = await request(app)
      .post('/api/integration/authorize')
      .set('x-agent-key', 'key-procurement-01')
      .send({
        operation: 'place_order',
        resource: 'logistics://orders/301',
        params: { amount: 500 },
        task_type: 'procurement'
      });

    expect(res.status).toBe(200);
    expect(res.body.decision).toBe('BLOCK');
    expect(res.body.reason_code).toBe('AGENT_PAUSED');
  });

  it('7. GET /api/integration/requests/:id revalidates and issues token once after human approval', async () => {
    // 1. Submit action requiring approval
    const authRes = await request(app)
      .post('/api/integration/authorize')
      .set('x-agent-key', 'key-procurement-01')
      .send({
        operation: 'place_order',
        resource: 'logistics://orders/401',
        params: { amount: 6000 },
        task_type: 'procurement'
      });

    const requestId = authRes.body.request_id;
    expect(authRes.body.decision).toBe('REQUIRE_APPROVAL');

    // 2. Poll requests/:id while PENDING -> no token issued yet
    const pendingPoll = await request(app).get(`/api/integration/requests/${requestId}`);
    expect(pendingPoll.status).toBe(200);
    expect(pendingPoll.body.approval_status).toBe('PENDING');
    expect(pendingPoll.body.token).toBeNull();

    // 3. Human reviewer approves the request in the AegisOS console
    const approvalRow = db.prepare('SELECT id FROM approvals WHERE request_id = ?').get(requestId) as any;
    const decideRes = await request(app)
      .post(`/api/approvals/${approvalRow.id}/decide`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({
        decision: 'APPROVED',
        reason: 'Authorized emergency spare purchase by Duty Officer'
      });

    expect(decideRes.status).toBe(200);

    // 4. Poll requests/:id post-approval -> revalidates and issues Ed25519 token
    const approvedPoll = await request(app).get(`/api/integration/requests/${requestId}`);
    expect(approvedPoll.status).toBe(200);
    expect(approvedPoll.body.approval_status).toBe('APPROVED');
    expect(typeof approvedPoll.body.token).toBe('string');

    const issuedToken = approvedPoll.body.token;

    // Verify token validity
    const tokenCheck = verifyEd25519Token(issuedToken, {
      expectedOperation: 'place_order',
      expectedAgentId: 'procurement-agent-01'
    });
    expect(tokenCheck.valid).toBe(true);

    // 5. Subsequent poll returns the SAME token without re-issuing
    const repeatPoll = await request(app).get(`/api/integration/requests/${requestId}`);
    expect(repeatPoll.status).toBe(200);
    expect(repeatPoll.body.token).toBe(issuedToken);
  });

  it('8. POST /api/integration/requests/:id/result records execution outcome and audit event', async () => {
    const authRes = await request(app)
      .post('/api/integration/authorize')
      .set('x-agent-key', 'key-procurement-01')
      .send({
        operation: 'place_order',
        resource: 'logistics://orders/501',
        params: { amount: 1200 },
        task_type: 'procurement'
      });

    const requestId = authRes.body.request_id;

    const resultRes = await request(app)
      .post(`/api/integration/requests/${requestId}/result`)
      .send({
        outcome: 'SUCCESS',
        details: { vendor_order_id: 'VEND-9921', tracking_ref: 'TRK-441' }
      });

    expect(resultRes.status).toBe(200);
    expect(resultRes.body.success).toBe(true);
    expect(resultRes.body.execution_status).toBe('SUCCEEDED');

    // Check execution status in DB
    const execRow = db.prepare('SELECT status, result_reference FROM executions WHERE request_id = ?').get(requestId) as any;
    expect(execRow.status).toBe('SUCCEEDED');
    expect(execRow.result_reference).toContain('VEND-9921');

    // Check audit event
    const auditRow = db.prepare("SELECT * FROM audit_events WHERE request_id = ? AND event_type = 'EXECUTION_SUCCEEDED'").get(requestId) as any;
    expect(auditRow).toBeDefined();
  });

  it('9. GET /api/integration/agents/:id/control and POST heartbeat', async () => {
    const controlRes = await request(app).get('/api/integration/agents/procurement-agent-01/control');
    expect(controlRes.status).toBe(200);
    expect(controlRes.body.status).toBe('active');
    expect(controlRes.body.config_version).toBe('v1.0');
    expect(controlRes.body.config.system_prompt).toBeDefined();
    expect(Array.isArray(controlRes.body.config.tools)).toBe(true);
    expect(controlRes.body.config.step_budget).toBe(20);

    const hbRes = await request(app).post('/api/integration/agents/procurement-agent-01/heartbeat');
    expect(hbRes.status).toBe(200);
    expect(hbRes.body.status).toBe('ok');
    expect(hbRes.body.agent_id).toBe('procurement-agent-01');
  });
});
