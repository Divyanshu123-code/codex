import { Router, Request, Response } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { getDatabase } from '../db/connection.js';
import { decideApproval } from '../engine/approval.js';
import { writeAuditEvent } from '../engine/gateway.js';

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

// POST /api/approvals/:id/reopen - Direct administrative re-evaluation of mistakenly rejected approval
approvalsRouter.post('/:id/reopen', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const now = Date.now();
    const approvalId = req.params.id;

    // 1. Fetch target approval
    const approval = db.prepare('SELECT * FROM approvals WHERE id = ?').get(approvalId) as any;
    if (!approval) {
      return res.status(404).json({ error: 'Approval record not found.' });
    }

    if (approval.status !== 'REJECTED') {
      return res.status(400).json({ error: 'CANNOT_REOPEN_NON_REJECTED: Only rejected approvals can be reopened for re-evaluation.' });
    }

    const actorId = req.body.userId || req.body.approverId || req.body.actorId || 'usr-admin-2';
    const reason = req.body.reason || 'Reopened following administrative review for re-evaluation of mistaken rejection.';

    // 2. Fetch or create backup snapshot in scenario_backups
    let backup = db.prepare('SELECT * FROM scenario_backups WHERE request_id = ?').get(approval.request_id) as any;
    const reqRow = db.prepare('SELECT * FROM action_requests WHERE id = ?').get(approval.request_id) as any;
    if (!backup && reqRow) {
      const backupId = `sbkp-${now}-${Math.random().toString(36).substring(2, 7)}`;
      const snapshotPayload = JSON.stringify({
        backupId,
        requestId: reqRow.id,
        agentId: reqRow.agent_id,
        operation: reqRow.operation,
        parameters: reqRow.parameters,
        decision: 'REJECTED',
        reason: approval.reason || 'Initial rejection',
        timestamp: now
      });
      const snapshotHash = crypto.createHash('sha256').update(snapshotPayload).digest('hex');
      db.prepare(`
        INSERT INTO scenario_backups (
          id, correlation_id, request_id, agent_id, agent_category, policy_id, policy_version,
          policy_hash, operation, amount, parameters_snapshot, evidence_checks, decision,
          reason_code, approval_id, human_decision, execution_status, snapshot_hash, created_at, correction_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NOT_EXECUTED', ?, ?, 'NONE')
      `).run(
        backupId, reqRow.id, reqRow.id, reqRow.agent_id, reqRow.agent_category || 'unknown',
        reqRow.policy_id, reqRow.policy_version, null, reqRow.operation, null,
        reqRow.parameters, reqRow.evidence_checks, reqRow.gate_decision || 'REQUIRE_APPROVAL',
        reqRow.gate_reason_code || 'APPROVAL_REJECTED', approval.id,
        JSON.stringify({ approverId: approval.approver_id, reason: approval.reason, decidedAt: approval.decided_at }),
        snapshotHash, now
      );
      backup = db.prepare('SELECT * FROM scenario_backups WHERE id = ?').get(backupId) as any;
    }

    // 3. Reset this approval directly to PENDING so it is immediately active and re-evaluatable
    db.prepare(`
      UPDATE approvals
      SET status = 'PENDING',
          approver_id = NULL,
          approver_role = NULL,
          reason = NULL,
          decided_at = NULL,
          reopened_from_id = COALESCE(reopened_from_id, id)
      WHERE id = ?
    `).run(approvalId);

    // Reset executions status
    db.prepare(`
      UPDATE executions
      SET status = 'NOT_EXECUTED', non_execution_reason = 'APPROVAL_PENDING_REOPENED'
      WHERE request_id = ?
    `).run(approval.request_id);

    // Update backup record
    if (backup) {
      db.prepare(`
        UPDATE scenario_backups
        SET correction_status = 'REOPENED', reopens_approval_id = ?, restored_at = ?
        WHERE id = ?
      `).run(approvalId, now, backup.id);
    }

    // 4. Log DECISION_OVERTURNED audit event
    writeAuditEvent({
      eventType: 'DECISION_OVERTURNED',
      actorType: 'human',
      actorId,
      agentId: reqRow ? reqRow.agent_id : 'unknown',
      agentOwner: null,
      policyId: reqRow ? reqRow.policy_id : 'default',
      policyVersion: '1.0.0',
      resourceReference: reqRow ? reqRow.operation : 'reopened',
      decision: 'REQUIRE_APPROVAL',
      outcome: 'REOPENED_FOR_RE_REVIEW',
      requestId: approval.request_id,
      incidentId: null,
      correctionId: null,
      safeDetails: {
        approvalId,
        reopeningReason: reason
      }
    }, db);

    res.json({
      success: true,
      message: 'Approval case reopened for re-evaluation.',
      approvalId,
      status: 'PENDING'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
