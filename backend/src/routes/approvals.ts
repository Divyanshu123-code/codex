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
        r.agent_category,
        r.tool,
        r.operation,
        r.resource,
        r.parameters,
        r.gate_decision,
        r.gate_reason_code,
        r.evidence_checks,
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
  decision: z.enum(['APPROVED', 'REJECTED']).optional(),
  status: z.enum(['APPROVED', 'REJECTED']).optional(),
  approverId: z.string().optional(),
  userId: z.string().optional(),
  approverRole: z.string().optional(),
  role: z.string().optional(),
  reason: z.string().min(1, 'Reason is mandatory')
});

function handleDecision(req: Request, res: Response) {
  try {
    const parsed = decisionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid decision payload', details: parsed.error.format() });
    }

    const decision = (parsed.data.decision || parsed.data.status) as 'APPROVED' | 'REJECTED';
    if (!decision) {
      return res.status(400).json({ error: 'Missing mandatory decision or status field (APPROVED | REJECTED)' });
    }

    const approverId = parsed.data.approverId || parsed.data.userId || 'usr-reviewer';
    const approverRole = parsed.data.approverRole || parsed.data.role || (approverId.includes('admin') ? 'admin' : 'reviewer');
    const reason = parsed.data.reason;

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
}

// Support both /:id/decision and /:id/decide for API resilience
approvalsRouter.post('/:id/decision', handleDecision);
approvalsRouter.post('/:id/decide', handleDecision);
