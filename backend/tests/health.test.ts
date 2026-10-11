import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { getDatabase } from '../src/db/connection.js';
import { seedDatabase } from '../src/db/seed.js';

describe('Phase 1: Runnable Skeleton & Health Checks', () => {
  beforeEach(() => {
    const db = getDatabase(':memory:');
    seedDatabase(db);
  });

  it('GET /api/health returns 200 OK with connected database', async () => {
    const app = createApp();
    const response = await request(app).get('/api/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
    expect(response.body.service).toBe('ai-governance-control-plane');
    expect(response.body.database.connected).toBe(true);
    expect(response.body.database.users).toBeGreaterThan(0);
    expect(response.body.database.agents).toBeGreaterThan(0);
  });

  it('POST /api/demo/reset resets synthetic environment', async () => {
    const app = createApp();
    const response = await request(app).post('/api/demo/reset');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toContain('reset');
  });
});
