import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { getDatabase } from '../src/db/connection.js';
import { seedDatabase } from '../src/db/seed.js';

describe('Phase 2 API Endpoints: Agents, Policies, and Action Evaluation', () => {
  beforeEach(() => {
    const db = getDatabase(':memory:');
    seedDatabase(db);
  });

  it('GET /api/agents returns seeded synthetic agents', async () => {
    const app = createApp();
    const res = await request(app).get('/api/agents');

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0].id).toBe('doc-agent-01');
    expect(res.body[0].allowed_operations).toContain('read_file');
  });

  it('GET /api/agents/:id returns agent detail', async () => {
    const app = createApp();
    const res = await request(app).get('/api/agents/doc-agent-01');

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('doc-agent-01');
    expect(res.body.status).toBe('active');
  });

  it('GET /api/policies returns seeded policies with versions', async () => {
    const app = createApp();
    const res = await request(app).get('/api/policies');

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(4);
    const deletePolicy = res.body.find((p: any) => p.operation === 'delete_file');
    expect(deletePolicy.decision).toBe('block');
  });

  it('POST /api/actions/evaluate evaluates permitted action as ALLOW', async () => {
    const app = createApp();
    const res = await request(app).post('/api/actions/evaluate').send({
      agentId: 'doc-agent-01',
      tool: 'file_reader',
      operation: 'read_file',
      resource: 'synthetic://documents/defense_intel_brief_2026.txt'
    });

    expect(res.status).toBe(200);
    expect(res.body.evaluation.decision).toBe('ALLOW');
    expect(res.body.evaluation.policyId).toBe('POL-DOC-READ');
  });

  it('POST /api/actions/evaluate evaluates deletion as BLOCK with openIncident', async () => {
    const app = createApp();
    const res = await request(app).post('/api/actions/evaluate').send({
      agentId: 'doc-agent-01',
      tool: 'file_purger',
      operation: 'delete_file',
      resource: 'synthetic://documents/defense_intel_brief_2026.txt'
    });

    expect(res.status).toBe(200);
    expect(res.body.evaluation.decision).toBe('BLOCK');
    expect(res.body.evaluation.openIncident).toBe(true);
  });
});
