import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getDatabase } from '../db/connection.js';
import { transitionAgentStatus } from '../engine/gateway.js';

export const agentsRouter = Router();

// GET /api/agents
agentsRouter.get('/', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM agents ORDER BY created_at DESC').all();
    const agents = rows.map((r: any) => ({
      ...r,
      allowed_operations: JSON.parse(r.allowed_operations),
      allowed_resources: JSON.parse(r.allowed_resources),
      workflow_config: JSON.parse(r.workflow_config)
    }));
    res.json(agents);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/agents/:id
agentsRouter.get('/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id) as any;
    if (!row) {
      return res.status(404).json({ error: 'Agent not found' });
    }
    res.json({
      ...row,
      allowed_operations: JSON.parse(row.allowed_operations),
      allowed_resources: JSON.parse(row.allowed_resources),
      workflow_config: JSON.parse(row.workflow_config)
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const createAgentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  apiKey: z.string().min(1),
  ownerUserId: z.string().min(1),
  team: z.string().min(1),
  purpose: z.string().min(1),
  riskCategory: z.enum(['low', 'medium', 'high', 'critical']),
  allowedOperations: z.array(z.string()),
  allowedResources: z.array(z.string()),
  policyVersion: z.string().min(1),
  workflowConfig: z.array(z.any()).default([]),
  costPerOperation: z.number().default(0.0)
});

// POST /api/agents
agentsRouter.post('/', (req: Request, res: Response) => {
  try {
    const parsed = createAgentSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid agent payload', details: parsed.error.format() });
    }

    const {
      id,
      name,
      apiKey,
      ownerUserId,
      team,
      purpose,
      riskCategory,
      allowedOperations,
      allowedResources,
      policyVersion,
      workflowConfig,
      costPerOperation
    } = parsed.data;

    const db = getDatabase();
    const now = Date.now();

    const insert = db.prepare(`
      INSERT INTO agents (id, name, api_key, owner_user_id, team, purpose, risk_category, allowed_operations, allowed_resources, status, policy_version, workflow_config, cost_per_operation, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)
    `);

    insert.run(
      id,
      name,
      apiKey,
      ownerUserId,
      team,
      purpose,
      riskCategory,
      JSON.stringify(allowedOperations),
      JSON.stringify(allowedResources),
      policyVersion,
      JSON.stringify(workflowConfig),
      costPerOperation,
      now,
      now
    );

    res.status(201).json({
      message: 'Agent registered successfully',
      agentId: id
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/agents/:id/pause (Administrator containment control, FR-6)
agentsRouter.post('/:id/pause', (req: Request, res: Response) => {
  try {
    const reason = req.body.reason || 'Manual administrator pause';
    const actorId = req.body.actorId || 'usr-admin';
    transitionAgentStatus(req.params.id, 'paused', { type: 'human', id: actorId }, reason);
    res.json({ success: true, message: `Agent ${req.params.id} has been paused.` });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/agents/:id/restrict (Administrator restriction control, FR-6)
agentsRouter.post('/:id/restrict', (req: Request, res: Response) => {
  try {
    const reason = req.body.reason || 'Manual administrator restriction';
    const actorId = req.body.actorId || 'usr-admin';
    transitionAgentStatus(req.params.id, 'restricted', { type: 'human', id: actorId }, reason);
    res.json({ success: true, message: `Agent ${req.params.id} is now restricted.` });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
