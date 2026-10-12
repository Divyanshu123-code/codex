import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { getDatabase } from '../db/connection.js';
import { transitionAgentStatus, writeAuditEvent } from '../engine/gateway.js';
import { resumeAgent } from '../engine/resumeGate.js';

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
      workflow_config: JSON.parse(r.workflow_config),
      input_requirements: r.input_requirements ? JSON.parse(r.input_requirements) : {},
      uncertainty_rule: r.uncertainty_rule ? JSON.parse(r.uncertainty_rule) : {}
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
      workflow_config: JSON.parse(row.workflow_config),
      input_requirements: row.input_requirements ? JSON.parse(row.input_requirements) : {},
      uncertainty_rule: row.uncertainty_rule ? JSON.parse(row.uncertainty_rule) : {}
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

const resumeSchema = z.object({
  actorRole: z.string().default('admin'),
  actorId: z.string().default('usr-admin'),
  reason: z.string().min(1, 'Reason is mandatory for resumption')
});

// POST /api/agents/:id/resume (Centralized resume gate, Section 3.5)
agentsRouter.post('/:id/resume', (req: Request, res: Response) => {
  try {
    const parsed = resumeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid resume payload', details: parsed.error.format() });
    }

    const { actorRole, actorId, reason } = parsed.data;
    const result = resumeAgent(req.params.id, { role: actorRole, id: actorId }, reason);

    if (!result.success) {
      return res.status(412).json({
        error: 'Preconditions not met for resumption.',
        unmet: result.unmet,
        status: result.status
      });
    }

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const terminateSchema = z.object({
  actorRole: z.string().default('admin'),
  actorId: z.string().default('usr-admin'),
  reason: z.string().min(1, 'Reason is mandatory for termination')
});

// POST /api/agents/:id/terminate (Soft-termination with immutable snapshot, Section 6b)
agentsRouter.post('/:id/terminate', (req: Request, res: Response) => {
  try {
    const parsed = terminateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid termination payload', details: parsed.error.format() });
    }

    const { actorRole, actorId, reason } = parsed.data;
    if (actorRole !== 'admin') {
      return res.status(403).json({ error: 'UNAUTHORIZED_ROLE: Only administrators can terminate an agent.' });
    }

    const db = getDatabase();
    const agentRow = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id) as any;
    if (!agentRow) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const policies = db.prepare('SELECT * FROM policies WHERE applicable_agent_id = ? OR applicable_agent_id IS NULL').all(req.params.id);
    const policyHash = crypto.createHash('sha256').update(JSON.stringify(policies)).digest('hex');

    const now = Date.now();
    const snapshotObj = {
      agent: agentRow,
      policies,
      policyHash,
      terminatedAt: now,
      terminatedBy: { id: actorId, role: actorRole }
    };
    const snapshotJson = JSON.stringify(snapshotObj);
    const snapshotHash = crypto.createHash('sha256').update(snapshotJson).digest('hex');
    const backupId = `bkp-term-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;

    // Store immutable snapshot
    db.prepare(`
      INSERT INTO backups (id, agent_id, trigger_event, actor, reason, snapshot_json, snapshot_hash, created_at)
      VALUES (?, ?, 'AGENT_TERMINATED', ?, ?, ?, ?, ?)
    `).run(
      backupId,
      req.params.id,
      JSON.stringify({ id: actorId, role: actorRole }),
      reason,
      snapshotJson,
      snapshotHash,
      now
    );

    // Soft-terminate: transition status to paused
    transitionAgentStatus(req.params.id, 'paused', { type: 'human', id: actorId }, `Terminated: ${reason}`);

    res.json({
      success: true,
      message: `Agent ${req.params.id} has been soft-terminated with snapshot stored.`,
      backupId,
      snapshotHash,
      status: 'paused'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const reinstateSchema = z.object({
  actorRole: z.string().default('admin'),
  actorId: z.string().default('usr-admin-2'),
  reason: z.string().min(1, 'Reason is mandatory for reinstatement')
});

// POST /api/agents/:id/reinstate (Reinstatement with separation of duties, Section 6b)
agentsRouter.post('/:id/reinstate', (req: Request, res: Response) => {
  try {
    const parsed = reinstateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid reinstate payload', details: parsed.error.format() });
    }

    const { actorRole, actorId, reason } = parsed.data;
    if (actorRole !== 'admin') {
      return res.status(403).json({ error: 'UNAUTHORIZED_ROLE: Only administrators can reinstate an agent.' });
    }

    const db = getDatabase();
    const agentRow = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id) as any;
    if (!agentRow) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    // Find latest termination snapshot
    const latestSnapshot = db.prepare(`
      SELECT * FROM backups 
      WHERE agent_id = ? AND trigger_event = 'AGENT_TERMINATED' AND restored_at IS NULL
      ORDER BY created_at DESC LIMIT 1
    `).get(req.params.id) as any;

    if (!latestSnapshot) {
      return res.status(400).json({
        error: 'NO_UNRESTORED_TERMINATION_SNAPSHOT: No unrestored termination snapshot found for this agent.'
      });
    }

    // Separation of Duties: Reinstating admin must be different from terminating admin
    const terminatingActor = JSON.parse(latestSnapshot.actor);
    if (terminatingActor.id === actorId) {
      return res.status(400).json({
        error: 'SEPARATION_OF_DUTIES_VIOLATION: Reinstatement requires a different administrator than the one who terminated the agent.'
      });
    }

    // Revalidation: Policies hash match check
    const currentPolicies = db.prepare('SELECT * FROM policies WHERE applicable_agent_id = ? OR applicable_agent_id IS NULL').all(req.params.id);
    const currentPolicyHash = crypto.createHash('sha256').update(JSON.stringify(currentPolicies)).digest('hex');
    const snapshotData = JSON.parse(latestSnapshot.snapshot_json);

    if (snapshotData.policyHash !== currentPolicyHash) {
      return res.status(400).json({
        error: 'POLICY_HASH_MISMATCH: Policies have been altered since termination. Review policies before restoring.'
      });
    }

    const now = Date.now();

    // Mark snapshot restored
    db.prepare(`UPDATE backups SET restored_at = ? WHERE id = ?`).run(now, latestSnapshot.id);

    // Reinstate agent to RESTRICTED status (Section 6b Rule 3)
    transitionAgentStatus(
      req.params.id,
      'restricted',
      { type: 'human', id: actorId },
      `Reinstated by ${actorId}: ${reason}`
    );

    // Emit DECISION_OVERTURNED & AGENT_REINSTATED audit events
    writeAuditEvent({
      eventType: 'DECISION_OVERTURNED',
      actorType: 'human',
      actorId,
      agentId: req.params.id,
      agentOwner: agentRow.owner_user_id,
      policyId: null,
      policyVersion: agentRow.policy_version,
      resourceReference: null,
      decision: 'ALLOW',
      outcome: 'TERMINATION_OVERTURNED',
      requestId: null,
      incidentId: null,
      correctionId: null,
      safeDetails: {
        snapshotId: latestSnapshot.id,
        terminatingAdmin: terminatingActor.id,
        reinstatingAdmin: actorId,
        reason
      }
    }, db);

    writeAuditEvent({
      eventType: 'AGENT_REINSTATED',
      actorType: 'human',
      actorId,
      agentId: req.params.id,
      agentOwner: agentRow.owner_user_id,
      policyId: null,
      policyVersion: agentRow.policy_version,
      resourceReference: null,
      decision: 'ALLOW',
      outcome: 'RESTRICTED',
      requestId: null,
      incidentId: null,
      correctionId: null,
      safeDetails: { snapshotHash: latestSnapshot.snapshot_hash, newStatus: 'restricted' }
    }, db);

    res.json({
      success: true,
      message: `Agent ${req.params.id} has been safely reinstated to RESTRICTED status. Full activation requires central resume gate.`,
      agentId: req.params.id,
      status: 'restricted'
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

