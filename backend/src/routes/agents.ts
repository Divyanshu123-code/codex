import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { getDatabase } from '../db/connection.js';
import { transitionAgentStatus, writeAuditEvent } from '../engine/gateway.js';
import { resumeAgent } from '../engine/resumeGate.js';
import { requireAdmin } from '../auth/middleware.js';

export const agentsRouter = Router();

const HOST_SITE_AGENT_IDS = [
  'procurement-agent-01',
  'maint-planner-01',
  'cyber-monitor-01',
  'records-agent-01'
];

export async function getHostSiteTelemetry(): Promise<Record<string, any>> {
  const telemetry: Record<string, any> = {};

  // 1. Try live HTTP endpoint on host-site port 4100
  try {
    const res = await fetch('http://127.0.0.1:4100/api/agents', { signal: AbortSignal.timeout(800) });
    if (res.ok) {
      const data = await res.json() as any;
      if (Array.isArray(data.agents)) {
        for (const a of data.agents) {
          telemetry[a.agentId] = {
            agentId: a.agentId,
            hostStatus: a.status,
            hostStatusReason: a.statusReason,
            configVersion: a.configVersion,
            lastControlPoll: a.lastControlPoll,
            currentWorkItem: a.currentWorkItem,
            pendingQueueSize: a.pendingQueueSize,
            lastAction: a.lastAction,
            connected: true
          };
        }
      }
    }
  } catch {
    // Fallback to direct SQLite read
  }

  // 2. Direct SQLite fallback from host-site database
  try {
    const hostDbPath = '/Users/divanshu/demo website codex/host-site/backend/data/host-site.sqlite';
    if (fs.existsSync(hostDbPath)) {
      const hostDb = new DatabaseSync(hostDbPath);
      const states = hostDb.prepare('SELECT * FROM agent_state').all() as any[];
      for (const s of states) {
        if (!telemetry[s.agent_id]) {
          const pendingCount = (hostDb.prepare("SELECT COUNT(*) as c FROM work_items WHERE assigned_agent = ? AND status = 'PENDING'").get(s.agent_id) as any)?.c || 0;
          const currentItem = hostDb.prepare("SELECT id, type, priority, status FROM work_items WHERE assigned_agent = ? AND status IN ('IN_PROGRESS', 'PENDING_APPROVAL') ORDER BY updated_at DESC LIMIT 1").get(s.agent_id) as any;
          const lastAct = hostDb.prepare("SELECT * FROM agent_actions WHERE agent_id = ? ORDER BY ts DESC LIMIT 1").get(s.agent_id) as any;

          telemetry[s.agent_id] = {
            agentId: s.agent_id,
            hostStatus: s.status,
            hostStatusReason: s.reason,
            configVersion: s.config_version,
            lastControlPoll: s.last_control_poll,
            pendingQueueSize: pendingCount,
            currentWorkItem: currentItem || null,
            lastAction: lastAct || null,
            connected: true
          };
        }
      }

      // Compute domain metrics
      const totalOrdersAmount = (hostDb.prepare("SELECT SUM(amount) as s FROM orders").get() as any)?.s || 0;
      const totalOrdersCount = (hostDb.prepare("SELECT COUNT(*) as c FROM orders").get() as any)?.c || 0;
      const activeMaintenanceCount = (hostDb.prepare("SELECT COUNT(*) as c FROM maintenance_jobs").get() as any)?.c || 0;
      const hostsCount = (hostDb.prepare("SELECT COUNT(*) as c FROM hosts").get() as any)?.c || 0;
      const recordsCount = (hostDb.prepare("SELECT COUNT(*) as c FROM records").get() as any)?.c || 0;

      if (telemetry['procurement-agent-01']) {
        telemetry['procurement-agent-01'].cumulativeSpendToday = totalOrdersAmount;
        telemetry['procurement-agent-01'].totalOrdersCount = totalOrdersCount;
      }
      if (telemetry['maint-planner-01']) {
        telemetry['maint-planner-01'].activeMaintenanceCount = activeMaintenanceCount;
      }
      if (telemetry['cyber-monitor-01']) {
        telemetry['cyber-monitor-01'].hostsCount = hostsCount;
      }
      if (telemetry['records-agent-01']) {
        telemetry['records-agent-01'].recordsCount = recordsCount;
      }
    }
  } catch {
    // Ignore fallback errors
  }

  return telemetry;
}

// GET /api/agents
agentsRouter.get('/', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const fleetParam = (req.query.fleet as string) || '';

    let rows: any[];
    if (fleetParam === 'live' || fleetParam === 'website') {
      rows = db.prepare(`
        SELECT * FROM agents 
        WHERE id IN ('procurement-agent-01', 'maint-planner-01', 'cyber-monitor-01', 'records-agent-01')
        ORDER BY 
          CASE id
            WHEN 'procurement-agent-01' THEN 1
            WHEN 'maint-planner-01' THEN 2
            WHEN 'cyber-monitor-01' THEN 3
            WHEN 'records-agent-01' THEN 4
            ELSE 5
          END ASC
      `).all();
    } else {
      rows = db.prepare('SELECT * FROM agents ORDER BY created_at DESC').all();
    }

    const telemetryMap = await getHostSiteTelemetry();

    const agents = rows.map((r: any) => {
      const isHostAgent = HOST_SITE_AGENT_IDS.includes(r.id);
      const tel = telemetryMap[r.id] || null;

      let allowedOps: string[] = [];
      try { allowedOps = JSON.parse(r.allowed_operations); } catch { allowedOps = []; }

      let allowedRes: string[] = [];
      try { allowedRes = JSON.parse(r.allowed_resources); } catch { allowedRes = []; }

      let workflowCfg: any = [];
      try { workflowCfg = JSON.parse(r.workflow_config); } catch { workflowCfg = []; }

      let inputReqs: any = {};
      try { inputReqs = r.input_requirements ? JSON.parse(r.input_requirements) : {}; } catch { inputReqs = {}; }

      let uncRule: any = {};
      try { uncRule = r.uncertainty_rule ? JSON.parse(r.uncertainty_rule) : {}; } catch { uncRule = {}; }

      return {
        ...r,
        status: tel?.hostStatus ? tel.hostStatus.toLowerCase() : r.status,
        allowed_operations: allowedOps,
        allowed_resources: allowedRes,
        workflow_config: workflowCfg,
        input_requirements: inputReqs,
        uncertainty_rule: uncRule,
        is_host_fleet: isHostAgent,
        telemetry: tel
      };
    });

    res.json(agents);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/agents/:id
agentsRouter.get('/:id', async (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const row = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id) as any;
    if (!row) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    const isHostAgent = HOST_SITE_AGENT_IDS.includes(row.id);
    const telemetryMap = await getHostSiteTelemetry();
    const tel = telemetryMap[row.id] || null;

    let allowedOps: string[] = [];
    try { allowedOps = JSON.parse(row.allowed_operations); } catch { allowedOps = []; }

    let allowedRes: string[] = [];
    try { allowedRes = JSON.parse(row.allowed_resources); } catch { allowedRes = []; }

    let workflowCfg: any = [];
    try { workflowCfg = JSON.parse(row.workflow_config); } catch { workflowCfg = []; }

    let inputReqs: any = {};
    try { inputReqs = row.input_requirements ? JSON.parse(row.input_requirements) : {}; } catch { inputReqs = {}; }

    let uncRule: any = {};
    try { uncRule = row.uncertainty_rule ? JSON.parse(row.uncertainty_rule) : {}; } catch { uncRule = {}; }

    res.json({
      ...row,
      status: tel?.hostStatus ? tel.hostStatus.toLowerCase() : row.status,
      allowed_operations: allowedOps,
      allowed_resources: allowedRes,
      workflow_config: workflowCfg,
      input_requirements: inputReqs,
      uncertainty_rule: uncRule,
      is_host_fleet: isHostAgent,
      telemetry: tel
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
agentsRouter.post('/:id/pause', requireAdmin, (req: Request, res: Response) => {
  try {
    const reason = req.body.reason || 'Manual administrator pause';
    const actorId = req.user ? req.user.id : (req.body.actorId || 'usr-admin');
    transitionAgentStatus(req.params.id, 'paused', { type: 'human', id: actorId }, reason);
    res.json({ success: true, message: `Agent ${req.params.id} has been paused.` });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// POST /api/agents/:id/restrict (Administrator restriction control, FR-6)
agentsRouter.post('/:id/restrict', requireAdmin, (req: Request, res: Response) => {
  try {
    const reason = req.body.reason || 'Manual administrator restriction';
    const actorId = req.user ? req.user.id : (req.body.actorId || 'usr-admin');
    transitionAgentStatus(req.params.id, 'restricted', { type: 'human', id: actorId }, reason);
    res.json({ success: true, message: `Agent ${req.params.id} is now restricted.` });
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

const resumeSchema = z.object({
  actorRole: z.string().optional(),
  actorId: z.string().optional(),
  reason: z.string().min(1, 'Reason is mandatory for resumption')
});

// POST /api/agents/:id/resume (Centralized resume gate, Section 3.5, Admin only)
agentsRouter.post('/:id/resume', requireAdmin, (req: Request, res: Response) => {
  try {
    const parsed = resumeSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid resume payload', details: parsed.error.format() });
    }

    const actorRole = req.user ? req.user.role : (parsed.data.actorRole || 'admin');
    const actorId = req.user ? req.user.id : (parsed.data.actorId || 'usr-admin');
    const { reason } = parsed.data;
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
  actorRole: z.string().optional(),
  actorId: z.string().optional(),
  reason: z.string().min(1, 'Reason is mandatory for termination')
});

// POST /api/agents/:id/terminate (Soft-termination with immutable snapshot, Section 6b, Admin only)
agentsRouter.post('/:id/terminate', requireAdmin, (req: Request, res: Response) => {
  try {
    const parsed = terminateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid termination payload', details: parsed.error.format() });
    }

    const actorRole = req.user ? req.user.role : (parsed.data.actorRole || 'admin');
    const actorId = req.user ? req.user.id : (parsed.data.actorId || 'usr-admin');
    const { reason } = parsed.data;
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
  actorRole: z.string().optional(),
  actorId: z.string().optional(),
  reason: z.string().min(1, 'Reason is mandatory for reinstatement')
});

// POST /api/agents/:id/reinstate (Reinstatement with separation of duties, Section 6b, Admin only)
agentsRouter.post('/:id/reinstate', requireAdmin, (req: Request, res: Response) => {
  try {
    const parsed = reinstateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid reinstate payload', details: parsed.error.format() });
    }

    const actorRole = req.user ? req.user.role : (parsed.data.actorRole || 'admin');
    const actorId = req.user ? req.user.id : (parsed.data.actorId || 'usr-admin-2');
    const { reason } = parsed.data;
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

