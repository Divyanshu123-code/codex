import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getDatabase } from '../db/connection.js';
import { testCorrection } from '../engine/sandbox.js';
import { approveCorrection, applyCorrection } from '../engine/resumeGate.js';

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
  approverId: z.string().min(1),
  approverRole: z.string().min(1),
  reason: z.string().min(1)
});

// POST /api/corrections/:id/approve
correctionsRouter.post('/:id/approve', (req: Request, res: Response) => {
  try {
    const parsed = approveCorrectionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid approval payload', details: parsed.error.format() });
    }

    const { approverId, approverRole, reason } = parsed.data;
    approveCorrection(req.params.id, { id: approverId, role: approverRole }, reason);
    res.json({ success: true, message: `Correction ${req.params.id} approved.` });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/corrections/:id/apply
correctionsRouter.post('/:id/apply', (req: Request, res: Response) => {
  try {
    applyCorrection(req.params.id);
    res.json({ success: true, message: `Correction ${req.params.id} applied to live agent configuration.` });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});
