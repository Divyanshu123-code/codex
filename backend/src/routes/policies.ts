import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getDatabase } from '../db/connection.js';

export const policiesRouter = Router();

// GET /api/policies
policiesRouter.get('/', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM policies ORDER BY created_at DESC').all();
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const createPolicySchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  name: z.string().min(1),
  applicableAgentId: z.string().nullable().optional(),
  operation: z.string().min(1),
  resourcePattern: z.string().min(1),
  decision: z.enum(['allow', 'require_approval', 'block']),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  pauseOnViolation: z.boolean().default(false),
  openIncident: z.boolean().default(false)
});

// POST /api/policies (Immutable: creates a new version)
policiesRouter.post('/', (req: Request, res: Response) => {
  try {
    const parsed = createPolicySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid policy payload', details: parsed.error.format() });
    }

    const {
      id,
      version,
      name,
      applicableAgentId,
      operation,
      resourcePattern,
      decision,
      severity,
      pauseOnViolation,
      openIncident
    } = parsed.data;

    const db = getDatabase();
    const insert = db.prepare(`
      INSERT INTO policies (id, version, name, applicable_agent_id, operation, resource_pattern, decision, severity, pause_on_violation, open_incident, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run(
      id,
      version,
      name,
      applicableAgentId || null,
      operation,
      resourcePattern,
      decision,
      severity,
      pauseOnViolation ? 1 : 0,
      openIncident ? 1 : 0,
      Date.now()
    );

    res.status(201).json({
      message: 'Policy created successfully',
      policyId: id,
      version
    });
  } catch (err: any) {
    if (err.message && err.message.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'A policy with this ID and version already exists. Policies are immutable.' });
    }
    res.status(500).json({ error: err.message });
  }
});
