import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getDatabase } from '../db/connection.js';
import { decideApproval } from '../engine/approval.js';

export const approvalsRouter = Router();

// GET /api/approvals
approvalsRouter.get('/', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const rows = db.prepare(`
      SELECT 
        a.*,
        r.agent_id,
        r.tool,
        r.operation,
        r.resource,
        r.parameters,
        r.explanation as request_explanation,
        e.status as execution_status,
        e.non_execution_reason
      FROM approvals a
      JOIN action_requests r ON a.request_id = r.id
      LEFT JOIN executions e ON a.request_id = e.request_id
      ORDER BY a.requested_at DESC
    `).all();
    res.json(rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const decisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  approverId: z.string().min(1),
  approverRole: z.string().min(1),
  reason: z.string().min(1, 'Reason is mandatory')
});

// POST /api/approvals/:id/decision
approvalsRouter.post('/:id/decision', (req: Request, res: Response) => {
  try {
    const parsed = decisionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid decision payload', details: parsed.error.format() });
    }

    const { decision, approverId, approverRole, reason } = parsed.data;
    const result = decideApproval(
      req.params.id,
      decision,
      { id: approverId, role: approverRole },
      reason
    );

    res.json(result);
  } catch (err: any) {
    if (err.message && err.message.includes('UNAUTHORIZED_REVIEWER_ROLE')) {
      return res.status(403).json({ error: err.message });
    }
    if (err.message && err.message.includes('APPROVAL_ALREADY_DECIDED')) {
      return res.status(409).json({ error: err.message });
    }
    res.status(400).json({ error: err.message });
  }
});
