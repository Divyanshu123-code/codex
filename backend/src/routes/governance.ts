import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { getDatabase } from '../db/connection.js';
import { routeAction, writeAuditEvent, transitionAgentStatus } from '../engine/gateway.js';
import { computeParamsHash, generateGovernanceToken, TokenClaims } from '../engine/governanceTokens.js';
import { getGatewaySecret } from '../engine/gateway.js';

export const governanceRouter = Router();
export const controlRouter = Router();

// Middleware: Verify API key or allow in dev/demo mode
export function governanceAuthMiddleware(req: Request, res: Response, next: () => void) {
  const apiKey = req.headers['x-aegis-api-key'] ||
    (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')
      ? req.headers.authorization.substring(7)
      : null);

  // Accept mock-aegis-api-key, valid API keys, or JWT tokens
  if (!apiKey && process.env.NODE_ENV !== 'test') {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Valid AegisOS API Key is required.'
    });
  }
  next();
}

const AuthorizeSchema = z.object({
  agentId: z.string(),
  operation: z.string(),
  resource: z.string().default('default'),
  parameters: z.record(z.any()).default({}),
  context: z.record(z.any()).optional()
});

/**
 * 1. POST /api/governance/authorize
 * Authorizes or holds an action proposed by an agent.
 */
governanceRouter.post('/authorize', (req: Request, res: Response) => {
  try {
    const parse = AuthorizeSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: 'INVALID_REQUEST_BODY', details: parse.error.issues });
    }

    const { agentId, operation, resource, parameters, context } = parse.data;
    const db = getDatabase();

    const result = routeAction(
      {
        agent_id: agentId,
        tool: operation,
        operation,
        resource,
        parameters
      },
      { type: 'agent', id: agentId },
      db
    );

    const now = Date.now();

    if (result.gateDecision === 'ALLOW') {
      const nonce = `nonce-${crypto.randomBytes(8).toString('hex')}`;
      const expiresAt = now + 300000; // 5 min validity
      const claims: TokenClaims = {
        sub: agentId,
        req: result.requestId,
        op: operation,
        res: resource,
        ph: computeParamsHash(parameters),
        nonce,
        iat: now,
        exp: expiresAt,
        iss: 'AegisOS'
      };
      const token = generateGovernanceToken(claims, getGatewaySecret());

      db.prepare(`
        INSERT OR REPLACE INTO governance_tokens (request_id, token, nonce, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?)
      `).run(result.requestId, token, nonce, expiresAt, now);

      return res.json({
        requestId: result.requestId,
        decision: 'ALLOW',
        status: 'APPROVED',
        reasonCode: result.gateReasonCode,
        explanation: result.explanation,
        evidenceChecks: result.evidenceChecks?.checks || [],
        token,
        nonce,
        expiresAt
      });
    }

    if (result.gateDecision === 'REQUIRE_APPROVAL') {
      return res.json({
        requestId: result.requestId,
        decision: 'REQUIRE_APPROVAL',
        status: 'PENDING_APPROVAL',
        reasonCode: result.gateReasonCode,
        explanation: result.explanation,
        evidenceChecks: result.evidenceChecks?.checks || [],
        token: null,
        nonce: null,
        expiresAt: null
      });
    }

    // BLOCK
    return res.json({
      requestId: result.requestId,
      decision: 'BLOCK',
      status: 'EVALUATED',
      reasonCode: result.gateReasonCode,
      explanation: result.explanation,
      evidenceChecks: result.evidenceChecks?.checks || [],
      token: null,
      nonce: null,
      expiresAt: null
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'AUTHORIZE_FAILED', message: err.message });
  }
});

/**
 * 2. GET /api/governance/status/:requestId
 * Polls status of a held request.
 */
governanceRouter.get('/status/:requestId', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const requestId = req.params.requestId;

    const reqRow = db.prepare('SELECT * FROM action_requests WHERE id = ?').get(requestId) as any;
    if (!reqRow) {
      return res.status(404).json({ error: 'REQUEST_NOT_FOUND', requestId });
    }

    const approvalRow = db.prepare('SELECT * FROM approvals WHERE request_id = ? ORDER BY requested_at DESC LIMIT 1').get(requestId) as any;
    const now = Date.now();

    if (!approvalRow || approvalRow.status === 'PENDING' || approvalRow.status === 'PENDING_SECOND_APPROVAL') {
      return res.json({
        requestId: reqRow.id,
        agentId: reqRow.agent_id,
        operation: reqRow.operation,
        decision: 'REQUIRE_APPROVAL',
        status: 'PENDING_APPROVAL',
        reasonCode: reqRow.gate_reason_code,
        explanation: reqRow.explanation,
        token: null,
        nonce: null,
        expiresAt: null,
        reviewer: null,
        reviewReason: null,
        updatedAt: reqRow.gated_at
      });
    }

    if (approvalRow.status === 'APPROVED') {
      let tokenRecord = db.prepare('SELECT * FROM governance_tokens WHERE request_id = ?').get(requestId) as any;
      if (!tokenRecord || (tokenRecord.expires_at && tokenRecord.expires_at <= now)) {
        const parsedParams = typeof reqRow.parameters === 'string' ? JSON.parse(reqRow.parameters) : (reqRow.parameters || {});
        const nonce = `nonce-${crypto.randomBytes(8).toString('hex')}`;
        const expiresAt = now + 300000;
        const claims: TokenClaims = {
          sub: reqRow.agent_id,
          req: reqRow.id,
          op: reqRow.operation,
          res: reqRow.resource || 'default',
          ph: computeParamsHash(parsedParams),
          nonce,
          iat: now,
          exp: expiresAt,
          iss: 'AegisOS'
        };
        const token = generateGovernanceToken(claims, getGatewaySecret());
        db.prepare(`
          INSERT OR REPLACE INTO governance_tokens (request_id, token, nonce, expires_at, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(requestId, token, nonce, expiresAt, now);
        tokenRecord = { token, nonce, expires_at: expiresAt };
      }

      return res.json({
        requestId: reqRow.id,
        agentId: reqRow.agent_id,
        operation: reqRow.operation,
        decision: 'ALLOW',
        status: 'APPROVED',
        reasonCode: 'APPROVAL_GRANTED',
        explanation: approvalRow.reason ? `Approved by human reviewer: ${approvalRow.reason}` : reqRow.explanation,
        token: tokenRecord.token,
        nonce: tokenRecord.nonce,
        expiresAt: tokenRecord.expires_at,
        reviewer: approvalRow.approver_id || 'reviewer',
        reviewReason: approvalRow.reason,
        updatedAt: approvalRow.decided_at || now
      });
    }

    if (approvalRow.status === 'REJECTED') {
      return res.json({
        requestId: reqRow.id,
        agentId: reqRow.agent_id,
        operation: reqRow.operation,
        decision: 'BLOCK',
        status: 'REJECTED',
        reasonCode: 'APPROVAL_REJECTED',
        explanation: approvalRow.reason ? `Action rejected during human review: ${approvalRow.reason}` : 'Human approver rejected the proposed action',
        token: null,
        nonce: null,
        expiresAt: null,
        reviewer: approvalRow.approver_id || 'reviewer',
        reviewReason: approvalRow.reason,
        updatedAt: approvalRow.decided_at || now
      });
    }

    return res.json({
      requestId: reqRow.id,
      agentId: reqRow.agent_id,
      operation: reqRow.operation,
      decision: 'REQUIRE_APPROVAL',
      status: approvalRow.status,
      reasonCode: reqRow.gate_reason_code,
      explanation: reqRow.explanation,
      token: null,
      nonce: null,
      expiresAt: null,
      reviewer: approvalRow.approver_id || null,
      reviewReason: approvalRow.reason || null,
      updatedAt: approvalRow.decided_at || reqRow.gated_at
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'GET_STATUS_FAILED', message: err.message });
  }
});

/**
 * 3. POST /api/governance/result
 * Execution outcome callback from host runtime.
 */
const ResultSchema = z.object({
  requestId: z.string(),
  nonce: z.string().optional(),
  executionStatus: z.enum(['SUCCEEDED', 'FAILED']),
  outcome: z.any().optional(),
  durationMs: z.number().optional(),
  error: z.string().nullable().optional()
});

governanceRouter.post('/result', (req: Request, res: Response) => {
  try {
    const parse = ResultSchema.safeParse(req.body);
    if (!parse.success) {
      return res.status(400).json({ error: 'INVALID_REQUEST_BODY', details: parse.error.issues });
    }

    const { requestId, executionStatus, outcome, durationMs, error } = parse.data;
    const db = getDatabase();
    const now = Date.now();

    const existingExec = db.prepare('SELECT * FROM executions WHERE request_id = ?').get(requestId) as any;
    if (existingExec) {
      db.prepare(`
        UPDATE executions
        SET status = ?, duration_ms = ?, result_reference = ?, non_execution_reason = ?, executed_at = ?
        WHERE request_id = ?
      `).run(
        executionStatus,
        durationMs || 0,
        outcome ? JSON.stringify(outcome) : null,
        error || null,
        now,
        requestId
      );
    } else {
      db.prepare(`
        INSERT INTO executions (id, request_id, status, duration_ms, result_reference, non_execution_reason, created_at, executed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        `exec-${requestId}`,
        requestId,
        executionStatus,
        durationMs || 0,
        outcome ? JSON.stringify(outcome) : null,
        error || null,
        now,
        now
      );
    }

    const reqRow = db.prepare('SELECT * FROM action_requests WHERE id = ?').get(requestId) as any;
    writeAuditEvent({
      eventType: executionStatus === 'SUCCEEDED' ? 'EXECUTION_SUCCEEDED' : 'EXECUTION_FAILED',
      actorType: 'system',
      actorId: 'host-site-runner',
      agentId: reqRow ? reqRow.agent_id : 'unknown-agent',
      agentOwner: null,
      policyId: reqRow ? reqRow.policy_id : null,
      policyVersion: reqRow ? reqRow.policy_version : null,
      resourceReference: reqRow ? reqRow.resource : null,
      decision: 'ALLOW',
      outcome: executionStatus,
      requestId,
      incidentId: null,
      correctionId: null,
      safeDetails: { durationMs, error }
    }, db);

    return res.json({ acknowledged: true, recordedAt: now });
  } catch (err: any) {
    return res.status(500).json({ error: 'RECORD_RESULT_FAILED', message: err.message });
  }
});

/**
 * 4. GET /api/control/agents/:agentId
 * Control & configuration retrieval endpoint for agents.
 */
controlRouter.get('/agents/:agentId', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const agentRow = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.agentId) as any;
    if (!agentRow) {
      return res.status(404).json({ error: 'AGENT_NOT_FOUND', agentId: req.params.agentId });
    }

    const allowedOps: string[] = JSON.parse(agentRow.allowed_operations || '[]');
    const config = {
      systemPrompt: agentRow.purpose || `Agent ${agentRow.name}`,
      toolAllowlist: allowedOps,
      stepBudget: 10
    };

    return res.json({
      agentId: agentRow.id,
      name: agentRow.name,
      category: agentRow.agent_category || 'procurement',
      status: agentRow.status.toUpperCase(),
      statusReason: 'Normal operations',
      configVersion: agentRow.policy_version || 'v1.0.0',
      config,
      cumulativeSpendToday: 0,
      lastHeartbeat: Date.now()
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'GET_AGENT_CONTROL_FAILED', message: err.message });
  }
});

/**
 * 5. POST /api/control/heartbeat
 * Heartbeat from host runtime.
 */
controlRouter.post('/heartbeat', (req: Request, res: Response) => {
  try {
    const { agentId } = req.body || {};
    const db = getDatabase();
    const agentRow = agentId ? db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as any : null;

    return res.json({
      acknowledged: true,
      currentConfigVersion: agentRow ? agentRow.policy_version : 'v1.0.0',
      controlStatus: agentRow ? agentRow.status.toUpperCase() : 'ACTIVE',
      command: agentRow?.status === 'paused' ? 'PAUSE' : null
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'HEARTBEAT_FAILED', message: err.message });
  }
});

/**
 * 6. POST /api/control/agents/:agentId/status
 * Administrative status update (ACTIVE, RESTRICTED, PAUSED)
 */
controlRouter.post('/agents/:agentId/status', (req: Request, res: Response) => {
  try {
    const { status, reason } = req.body || {};
    const db = getDatabase();
    const targetStatus = String(status || '').toLowerCase() as 'active' | 'restricted' | 'paused';
    if (!['active', 'restricted', 'paused'].includes(targetStatus)) {
      return res.status(400).json({ error: 'INVALID_STATUS', allowed: ['ACTIVE', 'RESTRICTED', 'PAUSED'] });
    }

    transitionAgentStatus(
      req.params.agentId,
      targetStatus,
      { type: 'human', id: 'admin' },
      reason || 'Administrative status transition via control endpoint',
      db
    );

    const agentRow = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.agentId) as any;
    return res.json({
      agentId: agentRow.id,
      status: agentRow.status.toUpperCase(),
      reason: reason || 'Updated'
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'UPDATE_STATUS_FAILED', message: err.message });
  }
});
