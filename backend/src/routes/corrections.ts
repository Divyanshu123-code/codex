import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getDatabase } from '../db/connection.js';
import { testCorrection } from '../engine/sandbox.js';
import { approveCorrection, applyCorrection } from '../engine/resumeGate.js';
import { requireAdmin } from '../auth/middleware.js';

export const correctionsRouter = Router();

// GET /api/corrections
correctionsRouter.get('/', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM corrections ORDER BY created_at DESC').all();
    res.json(rows.map((r: any) => ({
      ...r,
      patch: JSON.parse(r.patch),
      structural_checks: r.structural_checks ? JSON.parse(r.structural_checks) : [],
      behavioural_checks: r.behavioural_checks ? JSON.parse(r.behavioural_checks) : []
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const submitCorrectionSchema = z.object({
  incidentId: z.string().min(1),
  patch: z.any(),
  proposerId: z.string().default('diagnostics-engine'),
  proposerType: z.enum(['system', 'human']).default('system')
});

// POST /api/corrections/test (Test correction in sandbox)
correctionsRouter.post('/test', (req: Request, res: Response) => {
  try {
    const parsed = submitCorrectionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid correction payload', details: parsed.error.format() });
    }

    const { incidentId, patch, proposerId, proposerType } = parsed.data;
    const result = testCorrection(incidentId, patch, { type: proposerType, id: proposerId });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const approveCorrectionSchema = z.object({
  approverId: z.string().optional(),
  approverRole: z.string().optional(),
  reason: z.string().min(1)
});

// POST /api/corrections/:id/approve (Admin only)
correctionsRouter.post('/:id/approve', requireAdmin, (req: Request, res: Response) => {
  try {
    const parsed = approveCorrectionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid approval payload', details: parsed.error.format() });
    }

    const approverId = req.user ? req.user.id : (parsed.data.approverId || 'usr-admin');
    const approverRole = req.user ? req.user.role : (parsed.data.approverRole || 'admin');
    const { reason } = parsed.data;
    approveCorrection(req.params.id, { id: approverId, role: approverRole }, reason);
    res.json({ success: true, message: `Correction ${req.params.id} approved.` });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/corrections/:id/apply (Admin only)
correctionsRouter.post('/:id/apply', requireAdmin, (req: Request, res: Response) => {
  try {
    applyCorrection(req.params.id);
    res.json({ success: true, message: `Correction ${req.params.id} applied to live agent configuration.` });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/corrections/propose-patch (L1 Debug Agent Patch Proposer, Spec 6e)
correctionsRouter.post('/propose-patch', async (req: Request, res: Response) => {
  try {
    const { incidentId } = req.body;
    if (!incidentId) {
      return res.status(400).json({ error: 'incidentId is required' });
    }

    const db = getDatabase();
    const inc = db.prepare('SELECT * FROM incidents WHERE id = ?').get(incidentId) as any;
    if (!inc) {
      return res.status(404).json({ error: 'Incident not found' });
    }

    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(inc.agent_id) as any;
    const workflowConfig = agent ? JSON.parse(agent.workflow_config || '[]') : [];

    const { proposeCorrectionPatch } = await import('../engine/llmClient.js');
    const result = await proposeCorrectionPatch(
      incidentId,
      inc.signature_id || 'SIG-DISALLOWED-OP',
      workflowConfig,
      db
    );

    res.json({
      incidentId,
      ...result
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

