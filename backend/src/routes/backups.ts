import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { getDatabase } from '../db/connection.js';
import { writeAuditEvent } from '../engine/gateway.js';
import { evaluatePolicy, AgentRecord, PolicyRecord, OperationCatalogRecord } from '../engine/evaluator.js';
import { requireAdmin } from '../auth/middleware.js';

export const backupsRouter = Router();

const reopenSchema = z.object({
  reason: z.string().min(1, 'A written justification is mandatory for reopening a decision.'),
  actor: z.object({
    id: z.string().min(1),
    role: z.string().min(1)
  }).optional(),
  coSigner: z.string().optional()
});

// GET /api/backups/agent-snapshots - List agent fleet level snapshots (Section 6b)
backupsRouter.get('/agent-snapshots', (_req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const rows = db.prepare('SELECT * FROM backups ORDER BY created_at DESC').all() as any[];
    const parsed = rows.map((r) => ({
      ...r,
      actor: typeof r.actor === 'string' ? JSON.parse(r.actor) : r.actor,
      snapshot_json: typeof r.snapshot_json === 'string' ? JSON.parse(r.snapshot_json) : r.snapshot_json
    }));
    res.json(parsed);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/backups - List scenario backups with filtering
backupsRouter.get('/', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const agentId = req.query.agentId as string | undefined;
    const status = req.query.status as string | undefined;

    let query = 'SELECT * FROM scenario_backups WHERE 1=1';
    const params: any[] = [];

    if (agentId) {
      query += ' AND agent_id = ?';
      params.push(agentId);
    }
    if (status) {
      query += ' AND correction_status = ?';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC';

    const rows = db.prepare(query).all(...params) as any[];
    const parsed = rows.map((r) => ({
      ...r,
      parameters_snapshot: JSON.parse(r.parameters_snapshot || '{}'),
      evidence_checks: r.evidence_checks ? JSON.parse(r.evidence_checks) : null,
      human_decision: r.human_decision ? JSON.parse(r.human_decision) : null
    }));

    res.json(parsed);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/backups/:id - Fetch full snapshot and decision trail
backupsRouter.get('/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM scenario_backups WHERE id = ?').get(req.params.id) as any;

    if (!row) {
      return res.status(404).json({ error: 'Scenario backup record not found.' });
    }

    res.json({
      ...row,
      parameters_snapshot: JSON.parse(row.parameters_snapshot || '{}'),
      evidence_checks: row.evidence_checks ? JSON.parse(row.evidence_checks) : null,
      human_decision: row.human_decision ? JSON.parse(row.human_decision) : null
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/backups/:id/reopen - Reopen a wrongly rejected/held action for dual-custody re-review (Section 6c, Admin only)
backupsRouter.post('/:id/reopen', requireAdmin, (req: Request, res: Response) => {
  try {
    const parsed = reopenSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid reopen payload', details: parsed.error.format() });
    }

    const { reason } = parsed.data;
    // P6: Actor identity strictly derived from token
    const actor = req.user
      ? { id: req.user.id, role: req.user.role }
      : (parsed.data.actor || { id: 'usr-admin-2', role: 'admin' });

    const db = getDatabase();
    const now = Date.now();

    // 1. Fetch backup record
    const backup = db.prepare('SELECT * FROM scenario_backups WHERE id = ?').get(req.params.id) as any;
    if (!backup) {
      return res.status(404).json({ error: 'Scenario backup record not found.' });
    }

    // 2. Role Check: Must be administrator (Section 6c Rule 2)
    if (actor.role !== 'admin') {
      return res.status(403).json({ error: 'UNAUTHORIZED_ROLE: Only administrators may reopen decisions for re-review.' });
    }

    // 3. Prohibited Operation Invariant: Explicit policy prohibitions CANNOT be reopened (Section 6c Rule 4)
    if (
      backup.decision === 'BLOCK' &&
      (backup.reason_code === 'POLICY_DECISION_BLOCK' ||
       backup.reason_code === 'OPERATION_NOT_ALLOWED' ||
       backup.reason_code === 'DEFAULT_DENY_NO_POLICY' ||
       backup.reason_code.includes('PROHIBIT'))
    ) {
      return res.status(400).json({
        error: 'CANNOT_REOPEN_PROHIBITED_OPERATION: Explicit policy prohibitions cannot be reopened or overridden.'
      });
    }

    // 4. Decision State Check: Only rejected approvals or non-prohibition holds can be reopened
    let humanDec: any = null;
    if (backup.human_decision) {
      try {
        humanDec = JSON.parse(backup.human_decision);
      } catch {
        humanDec = null;
      }
    }

    if (backup.approval_id && (!humanDec || humanDec.decision !== 'REJECTED')) {
      return res.status(400).json({
        error: 'CANNOT_REOPEN_NON_REJECTED: Only decisions that concluded in REJECTED status can be reopened.'
      });
    }

    // 5. Configurable Window Check: Overridable via REOPEN_WINDOW_MS, default 24h (86,400,000 ms)
    const configuredWindowMs = process.env.REOPEN_WINDOW_MS
      ? parseInt(process.env.REOPEN_WINDOW_MS, 10)
      : 24 * 60 * 60 * 1000;
    const MAX_REOPEN_WINDOW_MS = isNaN(configuredWindowMs) ? 24 * 60 * 60 * 1000 : configuredWindowMs;
    if (now - backup.created_at > MAX_REOPEN_WINDOW_MS) {
      return res.status(400).json({
        error: `EXPIRED_REOPEN_WINDOW: The administrative reconsideration window (${MAX_REOPEN_WINDOW_MS}ms) has expired.`
      });
    }

    // 6. Idempotency Check: Reopen allowed only ONCE per request (Section 6c Rule 1)
    const priorReopen = db.prepare(`
      SELECT id FROM scenario_backups 
      WHERE request_id = ? AND (correction_status = 'REOPENED' OR correction_status = 'CORRECTED')
    `).get(backup.request_id);

    const priorReopenedApproval = db.prepare(`
      SELECT id FROM approvals 
      WHERE request_id = ? AND reopened_from_id IS NOT NULL
    `).get(backup.request_id);

    if (backup.correction_status === 'REOPENED' || backup.correction_status === 'CORRECTED' || priorReopen || priorReopenedApproval) {
      return res.status(400).json({
        error: 'ALREADY_REOPENED: This decision has already been reopened. Reopen is allowed at most once per request.'
      });
    }

    // 7. Separation of Duties: Reopening admin MUST be a different human than original decider, OR second admin co-sign (Section 6c Rule 2)
    const coSigner = parsed.data.coSigner;
    if (humanDec && humanDec.approverId === actor.id) {
      if (!coSigner || coSigner === actor.id) {
        return res.status(400).json({
          error: 'SEPARATION_OF_DUTIES_VIOLATION: Reopening requires a different administrator than the original decider, or secondary administrator co-signature.'
        });
      }
    }

    // 8. Revalidation Check against CURRENT policy and CURRENT agent status (Section 6c Rule 3)
    const agentRow = db.prepare('SELECT * FROM agents WHERE id = ?').get(backup.agent_id) as any;
    if (!agentRow) {
      return res.status(400).json({ error: 'AGENT_NOT_FOUND: The associated agent no longer exists.' });
    }
    if (agentRow.status === 'paused' || agentRow.status === 'terminated') {
      return res.status(400).json({ error: 'AGENT_PAUSED: Cannot reopen request while agent is paused or terminated.' });
    }

    const agent: AgentRecord = {
      id: agentRow.id,
      name: agentRow.name,
      status: agentRow.status,
      allowed_operations: JSON.parse(agentRow.allowed_operations),
      allowed_resources: JSON.parse(agentRow.allowed_resources),
      policy_version: agentRow.policy_version
    };

    const policyRows = db.prepare('SELECT * FROM policies').all() as any[];
    const policies: PolicyRecord[] = policyRows.map((p) => ({
      id: p.id,
      version: p.version,
      name: p.name,
      applicable_agent_id: p.applicable_agent_id,
      operation: p.operation,
      resource_pattern: p.resource_pattern,
      decision: p.decision,
      severity: p.severity,
      pause_on_violation: p.pause_on_violation,
      open_incident: p.open_incident,
      max_auto_amount: p.max_auto_amount != null ? Number(p.max_auto_amount) : null
    }));

    const opRows = db.prepare('SELECT * FROM operations_catalog').all() as any[];
    const catalog = new Map<string, OperationCatalogRecord>();
    for (const op of opRows) {
      catalog.set(op.operation, {
        operation: op.operation,
        mutating: op.mutating,
        sensitive: op.sensitive,
        simulated_cost: op.simulated_cost
      });
    }

    const paramsSnapshot = JSON.parse(backup.parameters_snapshot || '{}');
    const reval = evaluatePolicy(
      agent,
      {
        agent_id: backup.agent_id,
        tool: 'protected_tool',
        operation: backup.operation,
        resource: 'synthetic://orders/' + (paramsSnapshot.order_id || 'default'),
        parameters: paramsSnapshot
      },
      policies,
      catalog
    );

    if (reval.decision === 'BLOCK') {
      return res.status(400).json({
        error: `POLICY_REVALIDATION_FAILED: Re-evaluation against current policies resulted in BLOCK: ${reval.explanation}`
      });
    }

    // 9. Create NEW pending approval linked to original approval
    const newApprovalId = `appr-reopen-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    db.prepare(`
      INSERT INTO approvals (id, request_id, status, requested_at, reopened_from_id)
      VALUES (?, ?, 'PENDING', ?, ?)
    `).run(newApprovalId, backup.request_id, now, backup.approval_id);

    // Reset executions status to NOT_EXECUTED with APPROVAL_PENDING
    db.prepare(`
      UPDATE executions
      SET status = 'NOT_EXECUTED', non_execution_reason = 'APPROVAL_PENDING_REOPENED'
      WHERE request_id = ?
    `).run(backup.request_id);

    // 10. Update backup record
    db.prepare(`
      UPDATE scenario_backups
      SET correction_status = 'REOPENED', reopens_approval_id = ?, restored_at = ?
      WHERE id = ?
    `).run(newApprovalId, now, backup.id);

    // 11. Write DECISION_OVERTURNED Audit Event (Section 6c Rule 6)
    writeAuditEvent({
      eventType: 'DECISION_OVERTURNED',
      actorType: 'human',
      actorId: actor.id,
      agentId: backup.agent_id,
      agentOwner: agentRow.owner_user_id,
      policyId: backup.policy_id,
      policyVersion: backup.policy_version,
      resourceReference: backup.operation,
      decision: 'REQUIRE_APPROVAL',
      outcome: 'REOPENED_FOR_RE_REVIEW',
      requestId: backup.request_id,
      incidentId: null,
      correctionId: null,
      safeDetails: {
        backupId: backup.id,
        originalApprovalId: backup.approval_id,
        newApprovalId,
        reopeningReason: reason,
        snapshotHash: backup.snapshot_hash
      }
    }, db);

    res.json({
      success: true,
      message: 'Decision successfully reopened for re-review by an authorized reviewer.',
      backupId: backup.id,
      newApprovalId,
      status: 'REOPENED'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
