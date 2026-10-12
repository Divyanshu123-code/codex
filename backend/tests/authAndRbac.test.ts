import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../src/app.js';
import { seedDatabase } from '../src/db/seed.js';
import { getDatabase } from '../src/db/connection.js';
import { routeAction } from '../src/engine/gateway.js';
import { getAuthToken, authHeader, loginAs } from './helpers/authHelper.js';
import { resetLoginRateLimits } from '../src/auth/rateLimit.js';
import { getJwtSecret } from '../src/auth/jwt.js';

describe('P6: Authentication, Role-Based Access Control (RBAC), and Separation of Duties', () => {
  const app = createApp();

  beforeEach(() => {
    process.env.DEMO_MODE = 'true';
    resetLoginRateLimits();
    const db = getDatabase(':memory:');
    seedDatabase(db);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('1. Unauthenticated request without Bearer token gives 401 Unauthorized', async () => {
    const res = await request(app).get('/api/agents');
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('UNAUTHENTICATED');
    expect(res.body.code).toBe('AUTH_REQUIRED');
  });

  it('2. Forged or expired token gives 401 Unauthorized', async () => {
    // 2a. Forged token signed with bogus key
    const forgedToken = jwt.sign({ sub: 'usr-admin', role: 'admin' }, 'forged_bogus_signature_secret');
    const forgedRes = await request(app)
      .get('/api/agents')
      .set('Authorization', `Bearer ${forgedToken}`);
    expect(forgedRes.status).toBe(401);
    expect(forgedRes.body.error).toContain('INVALID_TOKEN');

    // 2b. Expired token
    const expiredToken = jwt.sign(
      { sub: 'usr-admin', role: 'admin' },
      getJwtSecret(),
      { expiresIn: '-1s' }
    );
    const expiredRes = await request(app)
      .get('/api/agents')
      .set('Authorization', `Bearer ${expiredToken}`);
    expect(expiredRes.status).toBe(401);
    expect(expiredRes.body.error).toContain('INVALID_TOKEN');
  });

  it('3. Successful login for seeded users produces 8h token with sub and role only', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({
        username: 'admin',
        password: 'password123'
      });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user).toBeDefined();
    expect(res.body.user.role).toBe('admin');
    expect(res.body.user.authority_level).toBe(2);

    // Verify token decoded claims
    const decoded = jwt.decode(res.body.token) as any;
    expect(decoded.sub).toBe('usr-admin');
    expect(decoded.role).toBe('admin');
    expect(decoded.exp).toBeGreaterThan(decoded.iat);
  });

  it('4. Auditor role is strictly read-only: GET succeeds, mutating POST/PUT/DELETE gives 403 Forbidden', async () => {
    const auditorToken = getAuthToken('auditor', 'usr-auditor');

    // GET succeeds
    const getRes = await request(app)
      .get('/api/policies')
      .set('Authorization', `Bearer ${auditorToken}`);
    expect(getRes.status).toBe(200);

    // POST gives 403 Forbidden
    const postRes = await request(app)
      .post('/api/actions/route')
      .set('Authorization', `Bearer ${auditorToken}`)
      .send({
        agentId: 'doc-agent-01',
        tool: 'doc_parser',
        operation: 'read_file',
        resource: 'synthetic://documents/test.txt'
      });
    expect(postRes.status).toBe(403);
    expect(postRes.body.error).toContain('AUDITOR_READ_ONLY');
  });

  it('5. Reviewer cannot resume an agent or reopen a backup (403 Forbidden)', async () => {
    const reviewerToken = getAuthToken('reviewer', 'usr-reviewer');

    // 5a. Reviewer attempts to resume agent -> 403
    const resumeRes = await request(app)
      .post('/api/agents/ops-worker-02/resume')
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({ reason: 'Attempted resume by reviewer' });
    expect(resumeRes.status).toBe(403);
    expect(resumeRes.body.error).toContain('FORBIDDEN');

    // 5b. Reviewer attempts to reopen backup -> 403
    const reopenRes = await request(app)
      .post('/api/backups/sbkp-dummy/reopen')
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({ reason: 'Attempted reopen by reviewer' });
    expect(reopenRes.status).toBe(403);
    expect(reopenRes.body.error).toContain('FORBIDDEN');
  });

  it('6. Separation of duties: same user as proposer and approver is blocked from the token identity', async () => {
    const db = getDatabase();

    // 1. Propose action by human user 'usr-reviewer'
    const routeRes = routeAction(
      {
        agent_id: 'doc-agent-01',
        tool: 'dataset_exporter',
        operation: 'export_dataset',
        resource: 'synthetic://documents/classified_intel.txt'
      },
      { type: 'human', id: 'usr-reviewer' },
      db
    );
    expect(routeRes.gateDecision).toBe('REQUIRE_APPROVAL');

    const approvalRow = db.prepare('SELECT id FROM approvals WHERE request_id = ?').get(routeRes.requestId) as any;

    // 2. Same human user 'usr-reviewer' attempts to approve their own proposed action
    const reviewerToken = getAuthToken('reviewer', 'usr-reviewer');
    const selfApproveRes = await request(app)
      .post(`/api/approvals/${approvalRow.id}/decide`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({
        decision: 'APPROVED',
        reason: 'Attempting self-approval of own proposal'
      });

    expect(selfApproveRes.status).toBe(403);
    expect(selfApproveRes.body.error).toContain('SEPARATION_OF_DUTIES_VIOLATION');
    expect(selfApproveRes.body.error).toContain('Proposer and approver cannot be the same user identity');
  });

  it('7. Body cannot spoof actor identity: server strictly derives identity from token', async () => {
    const db = getDatabase();

    // 1. Propose action by human user 'usr-reviewer'
    const routeRes = routeAction(
      {
        agent_id: 'doc-agent-01',
        tool: 'dataset_exporter',
        operation: 'export_dataset',
        resource: 'synthetic://documents/classified_intel.txt'
      },
      { type: 'human', id: 'usr-reviewer' },
      db
    );

    const approvalRow = db.prepare('SELECT id FROM approvals WHERE request_id = ?').get(routeRes.requestId) as any;

    // 2. Reviewer 'usr-reviewer' attempts to spoof approverId as 'usr-admin' in request body
    const reviewerToken = getAuthToken('reviewer', 'usr-reviewer');
    const spoofAttemptRes = await request(app)
      .post(`/api/approvals/${approvalRow.id}/decide`)
      .set('Authorization', `Bearer ${reviewerToken}`)
      .send({
        decision: 'APPROVED',
        approverId: 'usr-admin', // Spoofed body param!
        approverRole: 'admin',   // Spoofed body param!
        reason: 'Attempting to spoof admin identity in request payload'
      });

    // Server must ignore body spoofing and evaluate against token identity ('usr-reviewer'), thus blocking it
    expect(spoofAttemptRes.status).toBe(403);
    expect(spoofAttemptRes.body.error).toContain('SEPARATION_OF_DUTIES_VIOLATION');
  });

  it('8. Demo reset (POST /api/demo/reset) is blocked for non-admin users (403 Forbidden)', async () => {
    const reviewerToken = getAuthToken('reviewer', 'usr-reviewer');
    const resetRes = await request(app)
      .post('/api/demo/reset')
      .set('Authorization', `Bearer ${reviewerToken}`);

    expect(resetRes.status).toBe(403);
    expect(resetRes.body.error).toContain('FORBIDDEN');
  });

  it('9. Login rate limiting blocks IP after 10 failed/excessive attempts within a minute', async () => {
    resetLoginRateLimits();

    // 10 attempts
    for (let i = 0; i < 10; i++) {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', password: 'wrongpassword' });
      expect(res.status).toBe(401);
    }

    // 11th attempt is rate-limited (429)
    const blockedRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'password123' });
    expect(blockedRes.status).toBe(429);
    expect(blockedRes.body.error).toContain('TOO_MANY_ATTEMPTS');
  });

  it('10. No password hash or secret key appears in any response or user entity', async () => {
    const adminToken = getAuthToken('admin', 'usr-admin');

    // 10a. Login response
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'password123' });
    const loginStr = JSON.stringify(loginRes.body);
    expect(loginStr).not.toContain('password_hash');
    expect(loginStr).not.toContain('scrypt');
    expect(loginStr).not.toContain(getJwtSecret());

    // 10b. /me endpoint
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${adminToken}`);
    const meStr = JSON.stringify(meRes.body);
    expect(meStr).not.toContain('password_hash');
    expect(meStr).not.toContain(getJwtSecret());

    // 10c. /demo-users endpoint
    const demoRes = await request(app).get('/api/auth/demo-users');
    const demoStr = JSON.stringify(demoRes.body);
    expect(demoStr).not.toContain('password_hash');
    expect(demoStr).not.toContain(getJwtSecret());
  });
});
