import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { seedDatabase } from '../src/db/seed.js';
import { getDatabase } from '../src/db/connection.js';
import { signAuthToken } from '../src/auth/jwt.js';
import { verifyAuditChain, computeAuditEventHash } from '../src/engine/auditLedger.js';

describe('P7: Tamper-evidence, Cryptographic Hash Chain, and Exports', () => {
  let app: any;
  let adminToken: string;
  let auditorToken: string;
  const originalDemoMode = process.env.DEMO_MODE;

  beforeEach(() => {
    seedDatabase();
    app = createApp();
    adminToken = signAuthToken({ id: 'usr-admin', role: 'admin' });
    auditorToken = signAuthToken({ id: 'usr-auditor', role: 'auditor' });
    process.env.DEMO_MODE = 'true';
  });

  afterEach(() => {
    process.env.DEMO_MODE = originalDemoMode;
  });

  describe('Cryptographic Hash Chain Verification Engine', () => {
    it('chain verifies clean on fresh seeded ledger', () => {
      const result = verifyAuditChain();
      expect(result.valid).toBe(true);
      expect(result.totalEvents).toBeGreaterThanOrEqual(3);
      expect(result.message).toContain('verified intact');
    });

    it('verify detects a single modified event payload', () => {
      const db = getDatabase();
      // Corrupt event 2's event_type without recalculating its hash
      db.prepare("UPDATE audit_events SET event_type = 'UNAUTHORIZED_MUTATION' WHERE sequence = 2").run();

      const result = verifyAuditChain();
      expect(result.valid).toBe(false);
      expect(result.brokenIndex).toBe(1); // 0-indexed: index 1 is sequence 2
      expect(result.brokenEventId).toBe('evt-inc-demo-001');
      expect(result.error).toContain('Cryptographic payload hash mismatch');
    });

    it('verify detects an artificially modified stored hash', () => {
      const db = getDatabase();
      db.prepare("UPDATE audit_events SET hash = '0xBADHASH99999' WHERE sequence = 2").run();

      const result = verifyAuditChain();
      expect(result.valid).toBe(false);
      expect(result.brokenIndex).toBe(1);
      expect(result.brokenEventId).toBe('evt-inc-demo-001');
      expect(result.error).toContain('tampering detected');
    });

    it('verify detects a reordered event (sequence discontinuity)', () => {
      const db = getDatabase();
      // Swap sequence 2 and 3
      db.prepare('UPDATE audit_events SET sequence = 99 WHERE sequence = 2').run();

      const result = verifyAuditChain();
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Sequence discontinuity');
    });

    it('verify detects an inserted event with broken linkage', () => {
      const db = getDatabase();
      const lastEvent = db.prepare('SELECT * FROM audit_events ORDER BY sequence DESC LIMIT 1').get() as any;
      const fakeTimestamp = Date.now();
      const fakeHash = computeAuditEventHash({
        id: 'evt-injected-rogue-01',
        sequence: lastEvent.sequence + 1,
        event_type: 'ROGUE_INJECTION',
        actor_type: 'agent',
        actor_id: 'unknown',
        agent_id: null,
        prev_hash: 'FORGED_PREV_HASH_DOES_NOT_MATCH',
        timestamp: fakeTimestamp
      });

      db.prepare(`
        INSERT INTO audit_events (id, sequence, event_type, actor_type, actor_id, agent_id, prev_hash, hash, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('evt-injected-rogue-01', lastEvent.sequence + 1, 'ROGUE_INJECTION', 'agent', 'unknown', null, 'FORGED_PREV_HASH_DOES_NOT_MATCH', fakeHash, fakeTimestamp);

      const result = verifyAuditChain();
      expect(result.valid).toBe(false);
      expect(result.brokenEventId).toBe('evt-injected-rogue-01');
      expect(result.error).toContain('Broken hash link');
    });
  });

  describe('API: GET /api/audit/verify', () => {
    it('returns 200 with valid: true for untampered ledger', async () => {
      const res = await request(app)
        .get('/api/audit/verify')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.totalEvents).toBeGreaterThanOrEqual(3);
    });

    it('returns 200 with valid: false and broken event details when tampered', async () => {
      const db = getDatabase();
      db.prepare("UPDATE audit_events SET hash = 'CORRUPTED_HASH' WHERE sequence = 3").run();

      const res = await request(app)
        .get('/api/audit/verify')
        .set('Authorization', `Bearer ${auditorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(false);
      expect(res.body.brokenIndex).toBe(2);
      expect(res.body.brokenEventId).toBe('evt-overturn-demo-001');
    });
  });

  describe('API: POST /api/audit/corrupt-demo', () => {
    it('strictly requires DEMO_MODE=true and rejects with 403 when disabled', async () => {
      process.env.DEMO_MODE = 'false';

      const res = await request(app)
        .post('/api/audit/corrupt-demo')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('DEMO_MODE_REQUIRED');
    });

    it('successfully injects corruption when DEMO_MODE=true and causes verify to turn red', async () => {
      process.env.DEMO_MODE = 'true';

      const corruptRes = await request(app)
        .post('/api/audit/corrupt-demo')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(corruptRes.status).toBe(200);
      expect(corruptRes.body.success).toBe(true);
      expect(corruptRes.body.corruptedEventId).toBeDefined();

      // Immediately verify that GET /api/audit/verify catches the corruption
      const verifyRes = await request(app)
        .get('/api/audit/verify')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.valid).toBe(false);
      expect(verifyRes.body.brokenEventId).toBe(corruptRes.body.corruptedEventId);
    });
  });

  describe('API: Audit Log Exports (JSON & CSV)', () => {
    it('exports audit ledger as JSON format', async () => {
      const res = await request(app)
        .get('/api/audit/export?format=json')
        .set('Authorization', `Bearer ${auditorToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/json');
      expect(res.headers['content-disposition']).toContain('attachment; filename="aegis_audit_ledger_');
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(3);
      expect(res.body[0]).toHaveProperty('hash');
      expect(res.body[0]).toHaveProperty('sequence');
    });

    it('exports audit ledger as CSV format', async () => {
      const res = await request(app)
        .get('/api/audit/export?format=csv')
        .set('Authorization', `Bearer ${auditorToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toContain('.csv');
      const text = res.text;
      expect(text.startsWith('sequence,id,timestamp_iso,event_type')).toBe(true);
      expect(text).toContain('evt-genesis-0001');
      expect(text).toContain('SYSTEM_INITIALIZED');
    });
  });

  describe('API: Incident After-Action Report (AAR) Exports', () => {
    it('exports AAR report as JSON format', async () => {
      const res = await request(app)
        .get('/api/incidents/inc-demo-001/export?format=json')
        .set('Authorization', `Bearer ${auditorToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/json');
      expect(res.headers['content-disposition']).toContain('attachment; filename="AAR-inc-demo-001.json"');
      expect(res.body).toHaveProperty('reportMetadata');
      expect(res.body).toHaveProperty('section1_incidentIdentification');
      expect(res.body).toHaveProperty('section12_lessonsIdentified');
    });

    it('exports AAR report as Markdown format', async () => {
      const res = await request(app)
        .get('/api/incidents/inc-demo-001/export?format=markdown')
        .set('Authorization', `Bearer ${auditorToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/markdown');
      expect(res.headers['content-disposition']).toContain('attachment; filename="AAR-inc-demo-001.md"');
      const md = res.text;
      expect(md).toContain('# AFTER-ACTION REPORT (AAR) & INCIDENT ACCOUNTABILITY RECORD');
      expect(md).toContain('## 1. Incident Identification');
      expect(md).toContain('## 12. Lessons Identified & Doctrinal Recommendations');
      expect(md).toContain('inc-demo-001');
    });

    it('returns 404 when exporting non-existent incident', async () => {
      const res = await request(app)
        .get('/api/incidents/inc-non-existent/export?format=markdown')
        .set('Authorization', `Bearer ${auditorToken}`);

      expect(res.status).toBe(404);
    });
  });
});
