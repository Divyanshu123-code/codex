import { Router, Request, Response } from 'express';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { getDatabase, logDatabaseErrorIfBusyOrLocked } from '../db/connection.js';
import {
  evaluatePolicy,
  AgentRecord,
  PolicyRecord,
  OperationCatalogRecord,
  ActionInput
} from '../engine/evaluator.js';
import {
  writeAuditEvent,
  transitionAgentStatus,
  recordScenarioBackup
} from '../engine/gateway.js';
import {
  computeParamsHash,
  signEd25519Token,
  recordIntegrationToken,
  consumeIntegrationToken,
  getPublicKeyPem,
  IntegrationTokenClaims
} from '../engine/ed25519Tokens.js';

export const integrationRouter = Router();

/**
 * 1. POST /api/integration/authorize
 * Header: x-agent-key
 * Body: { operation, resource, params, work_item_ref, task_type, reason }
 * Evaluates action against policies, creates action_request, approvals, executions, audit events.
 * Does NOT execute internal simulated tools.
 */
integrationRouter.post('/authorize', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const agentKey = req.headers['x-agent-key'] as string | undefined;

    if (!agentKey || typeof agentKey !== 'string') {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Header x-agent-key is required.'
      });
    }

    // Lookup agent by API key
    const agentRow = db.prepare('SELECT * FROM agents WHERE api_key = ?').get(agentKey) as any;
    if (!agentRow) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Unknown agent API key.'
      });
    }

    const {
      operation,
      resource = 'default',
      params = req.body.parameters || {},
      work_item_ref,
      task_type = 'document_analysis',
      reason = 'External agent task invocation'
    } = req.body;

    if (!operation || typeof operation !== 'string') {
      return res.status(400).json({
        error: 'INVALID_REQUEST',
        message: 'Field "operation" is required.'
      });
    }

    const requestId = `req-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const now = Date.now();

    // Map AgentRecord
    const agent: AgentRecord = {
      id: agentRow.id,
      name: agentRow.name,
      agent_category: agentRow.agent_category || 'document_analysis',
      status: agentRow.status,
      allowed_operations: JSON.parse(agentRow.allowed_operations || '[]'),
      allowed_resources: JSON.parse(agentRow.allowed_resources || '[]'),
      permitted_data_scopes: agentRow.permitted_data_scopes ? JSON.parse(agentRow.permitted_data_scopes) : undefined,
      policy_version: agentRow.policy_version,
      input_requirements: agentRow.input_requirements ? JSON.parse(agentRow.input_requirements) : {},
      uncertainty_rule: agentRow.uncertainty_rule ? JSON.parse(agentRow.uncertainty_rule) : {}
    };

    const action: ActionInput = {
      agent_id: agentRow.id,
      tool: operation,
      operation,
      resource,
      parameters: params
    };

    // Fetch Policies
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
      max_auto_amount: p.max_auto_amount != null ? Number(p.max_auto_amount) : null,
      daily_cap: p.daily_cap != null ? Number(p.daily_cap) : null,
      window_minutes: p.window_minutes != null ? Number(p.window_minutes) : null
    }));

    // Fetch Operations Catalog
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

    // Compute Rolling-Window Cumulative Usage for Agent (executions.status = 'SUCCEEDED')
    let cumulativeAmount = 0;
    const relevantPolicy = policies.find(p =>
      (p.applicable_agent_id === null || p.applicable_agent_id === action.agent_id) &&
      (p.operation === '*' || p.operation === action.operation) &&
      p.daily_cap != null
    );

    if (relevantPolicy && relevantPolicy.daily_cap != null) {
      const windowMinutes = relevantPolicy.window_minutes || 1440;
      const windowStart = now - (windowMinutes * 60 * 1000);

      const pastExecutedRows = db.prepare(`
        SELECT ar.parameters
        FROM action_requests ar
        JOIN executions e ON ar.id = e.request_id
        WHERE ar.agent_id = ?
          AND ar.operation = ?
          AND e.status = 'SUCCEEDED'
          AND e.created_at >= ?
      `).all(action.agent_id, action.operation, windowStart) as any[];

      for (const row of pastExecutedRows) {
        try {
          const parsed = typeof row.parameters === 'string' ? JSON.parse(row.parameters) : row.parameters;
          if (parsed && typeof parsed.amount === 'number' && !isNaN(parsed.amount)) {
            cumulativeAmount += parsed.amount;
          }
        } catch {
          // ignore unparseable
        }
      }
    }

    // Run deterministic evaluation
    const evaluation = evaluatePolicy(agent, action, policies, catalog, {
      cumulativeAmount
    });

    const policyHash = crypto.createHash('sha256').update(JSON.stringify(policies)).digest('hex');
    const reqAmount = typeof params?.amount === 'number' ? params.amount : null;

    // Insert into action_requests table
    db.prepare(`
      INSERT INTO action_requests (
        id, agent_id, agent_category, tool, operation, resource, parameters, evidence_checks,
        task_type, handler, handler_reason, resource_sensitivity, correlation_id,
        gate_decision, gate_reason_code, policy_id, policy_version, explanation,
        received_at, gated_at, approval_requested_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      requestId,
      agent.id,
      agent.agent_category || 'document_analysis',
      operation,
      operation,
      resource,
      JSON.stringify(params),
      evaluation.evidenceChecks ? JSON.stringify(evaluation.evidenceChecks) : null,
      task_type,
      evaluation.decision === 'ALLOW' ? 'agent' : evaluation.decision === 'REQUIRE_APPROVAL' ? 'human' : 'blocked',
      evaluation.reasonCode,
      evaluation.severity === 'high' ? 'confidential' : 'unclassified',
      work_item_ref || requestId,
      evaluation.decision,
      evaluation.reasonCode,
      evaluation.policyId || null,
      evaluation.policyVersion || null,
      evaluation.explanation,
      now,
      now,
      evaluation.decision === 'REQUIRE_APPROVAL' ? now : null
    );

    // Write GATE_DECIDED Audit Event
    writeAuditEvent({
      eventType: 'GATE_DECIDED',
      actorType: 'agent',
      actorId: agent.id,
      agentId: agent.id,
      agentOwner: agentRow.owner_user_id,
      policyId: evaluation.policyId || null,
      policyVersion: evaluation.policyVersion || null,
      resourceReference: resource,
      decision: evaluation.decision,
      outcome: evaluation.reasonCode,
      requestId,
      incidentId: null,
      correctionId: null,
      safeDetails: {
        operation,
        resource,
        reason,
        explanation: evaluation.explanation,
        workItemRef: work_item_ref
      }
    }, db);

    // Decision Branching
    if (evaluation.decision === 'ALLOW') {
      const execId = `exec-${requestId}`;
      db.prepare(`
        INSERT INTO executions (id, request_id, status, created_at)
        VALUES (?, ?, 'EXECUTING', ?)
      `).run(execId, requestId, now);

      writeAuditEvent({
        eventType: 'EXECUTION_STARTED',
        actorType: 'agent',
        actorId: agent.id,
        agentId: agent.id,
        agentOwner: agentRow.owner_user_id,
        policyId: evaluation.policyId || null,
        policyVersion: evaluation.policyVersion || null,
        resourceReference: resource,
        decision: 'ALLOW',
        outcome: 'IN_PROGRESS',
        requestId,
        incidentId: null,
        correctionId: null,
        safeDetails: { operation, workItemRef: work_item_ref }
      }, db);

      // Issue single-use Ed25519 Token valid for 60 seconds
      const nonce = `nonce-${crypto.randomBytes(8).toString('hex')}`;
      const exp = Math.floor(now / 1000) + 60; // 60s
      const claims: IntegrationTokenClaims = {
        request_id: requestId,
        agent_id: agent.id,
        operation,
        resource,
        params_hash: computeParamsHash(params),
        nonce,
        exp
      };
      const token = signEd25519Token(claims);
      recordIntegrationToken(db, claims, token);

      return res.json({
        decision: 'ALLOW',
        request_id: requestId,
        requestId,
        token
      });
    }

    if (evaluation.decision === 'REQUIRE_APPROVAL') {
      const approvalId = `appr-${requestId}`;
      db.prepare(`
        INSERT INTO approvals (id, request_id, status, requested_at)
        VALUES (?, ?, 'PENDING', ?)
      `).run(approvalId, requestId, now);

      const execId = `exec-${requestId}`;
      db.prepare(`
        INSERT INTO executions (id, request_id, status, non_execution_reason, created_at)
        VALUES (?, ?, 'NOT_EXECUTED', 'APPROVAL_PENDING', ?)
      `).run(execId, requestId, now);

      const backup = recordScenarioBackup(db, {
        requestId,
        correlationId: work_item_ref || requestId,
        agentId: agent.id,
        agentCategory: agent.agent_category || 'document_analysis',
        actor: agent.id,
        policyId: evaluation.policyId || null,
        policyVersion: evaluation.policyVersion || null,
        policyHash,
        operation,
        amount: reqAmount,
        limit: evaluation.policyLimit ?? null,
        parameters: params,
        evidenceChecks: evaluation.evidenceChecks,
        decision: 'REQUIRE_APPROVAL',
        reasonCode: evaluation.reasonCode,
        approvalId
      });

      writeAuditEvent({
        eventType: 'APPROVAL_REQUESTED',
        actorType: 'system',
        actorId: 'governance-gateway',
        agentId: agent.id,
        agentOwner: agentRow.owner_user_id,
        policyId: evaluation.policyId || null,
        policyVersion: evaluation.policyVersion || null,
        resourceReference: resource,
        decision: 'REQUIRE_APPROVAL',
        outcome: 'HELD_IN_QUEUE',
        requestId,
        incidentId: null,
        correctionId: null,
        safeDetails: {
          approvalId,
          status: 'PENDING',
          backupId: backup.backupId,
          snapshotHash: backup.snapshotHash,
          amount: reqAmount,
          limit: evaluation.policyLimit ?? null,
          workItemRef: work_item_ref
        }
      }, db);

      return res.json({
        decision: 'REQUIRE_APPROVAL',
        request_id: requestId,
        requestId,
        status: 'PENDING'
      });
    }

    // Decision BLOCK
    const execId = `exec-${requestId}`;
    db.prepare(`
      INSERT INTO executions (id, request_id, status, non_execution_reason, created_at)
      VALUES (?, ?, 'NOT_EXECUTED', 'BLOCKED_BY_POLICY', ?)
    `).run(execId, requestId, now);

    let incidentId: string | null = null;
    if (evaluation.openIncident) {
      incidentId = `inc-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      db.prepare(`
        INSERT INTO incidents (
          id, agent_id, agent_category, triggering_request_id, severity, policy_id, policy_version,
          status, pre_incident_status, evidence_summary, evidence_checks, opened_at, agent_owner_at_time
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?, ?, ?)
      `).run(
        incidentId,
        agent.id,
        agent.agent_category || 'document_analysis',
        requestId,
        evaluation.severity,
        evaluation.policyId || 'UNKNOWN_POLICY',
        evaluation.policyVersion || 'v1.0',
        agent.status,
        `Prohibited operation attempt '${operation}' on '${resource}': ${evaluation.explanation}`,
        evaluation.evidenceChecks ? JSON.stringify(evaluation.evidenceChecks) : null,
        now,
        agentRow.owner_user_id
      );
    }

    recordScenarioBackup(db, {
      requestId,
      correlationId: work_item_ref || requestId,
      agentId: agent.id,
      agentCategory: agent.agent_category || 'document_analysis',
      actor: agent.id,
      policyId: evaluation.policyId || null,
      policyVersion: evaluation.policyVersion || null,
      policyHash,
      operation,
      amount: reqAmount,
      limit: evaluation.policyLimit ?? null,
      parameters: params,
      evidenceChecks: evaluation.evidenceChecks,
      decision: 'BLOCK',
      reasonCode: evaluation.reasonCode,
      approvalId: null
    });

    if (evaluation.pauseOnViolation) {
      transitionAgentStatus(
        agent.id,
        'paused',
        { type: 'system', id: 'policy-enforcer' },
        `High severity violation on policy ${evaluation.policyId || evaluation.reasonCode}`,
        db
      );
    }

    writeAuditEvent({
      eventType: 'VIOLATION_CONTAINED',
      actorType: 'system',
      actorId: 'governance-gateway',
      agentId: agent.id,
      agentOwner: agentRow.owner_user_id,
      policyId: evaluation.policyId || null,
      policyVersion: evaluation.policyVersion || null,
      resourceReference: resource,
      decision: 'BLOCK',
      outcome: 'BLOCKED_NO_SIDE_EFFECTS',
      requestId,
      incidentId,
      correctionId: null,
      safeDetails: {
        reasonCode: evaluation.reasonCode,
        incidentOpened: !!incidentId,
        agentPaused: evaluation.pauseOnViolation,
        workItemRef: work_item_ref
      }
    }, db);

    return res.json({
      decision: 'BLOCK',
      request_id: requestId,
      requestId,
      reason_code: evaluation.reasonCode,
      reasonCode: evaluation.reasonCode
    });
  } catch (err: any) {
    logDatabaseErrorIfBusyOrLocked(err, 'POST /api/integration/authorize');
    console.error('Error in /api/integration/authorize:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

/**
 * 2. GET /api/integration/requests/:id
 * Returns: gate decision, approval status, execution status.
 * If approval is APPROVED and no token issued yet, revalidates agent status and policy version,
 * then issues the Ed25519 token once.
 */
integrationRouter.get('/requests/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const requestId = req.params.id;

    const reqRow = db.prepare('SELECT * FROM action_requests WHERE id = ?').get(requestId) as any;
    if (!reqRow) {
      return res.status(404).json({
        error: 'REQUEST_NOT_FOUND',
        message: `Action request ${requestId} not found.`
      });
    }

    const apprRow = db.prepare('SELECT * FROM approvals WHERE request_id = ? ORDER BY requested_at DESC LIMIT 1').get(requestId) as any;
    const execRow = db.prepare('SELECT * FROM executions WHERE request_id = ?').get(requestId) as any;
    let tokenRow = db.prepare('SELECT * FROM integration_tokens WHERE request_id = ?').get(requestId) as any;

    let token = tokenRow ? tokenRow.token : null;

    // If approval is APPROVED and no token issued yet, revalidate and issue
    if (apprRow && apprRow.status === 'APPROVED' && !token) {
      const agentRow = db.prepare('SELECT * FROM agents WHERE id = ?').get(reqRow.agent_id) as any;

      // Revalidate agent status and policy version
      const agentActive = agentRow && agentRow.status === 'active';
      const currentPolicy = reqRow.policy_id
        ? db.prepare('SELECT version FROM policies WHERE id = ?').get(reqRow.policy_id) as any
        : null;
      const policyVersionValid = !currentPolicy || currentPolicy.version === reqRow.policy_version;
      const agentPolicyValid = !agentRow || !reqRow.policy_version || !agentRow.policy_version ||
        agentRow.policy_version === reqRow.policy_version ||
        agentRow.policy_version.startsWith(reqRow.policy_version) ||
        reqRow.policy_version.startsWith(agentRow.policy_version);

      if (!agentActive || !policyVersionValid || !agentPolicyValid) {
        db.prepare(`
          UPDATE executions
          SET status = 'NOT_EXECUTED', non_execution_reason = 'REVALIDATION_FAILED', executed_at = ?
          WHERE request_id = ?
        `).run(Date.now(), requestId);

        writeAuditEvent({
          eventType: 'NOT_EXECUTED',
          actorType: 'system',
          actorId: 'approval-engine',
          agentId: reqRow.agent_id,
          agentOwner: agentRow ? agentRow.owner_user_id : null,
          policyId: reqRow.policy_id,
          policyVersion: reqRow.policy_version,
          resourceReference: reqRow.resource,
          decision: 'REQUIRE_APPROVAL',
          outcome: 'REVALIDATION_FAILED',
          requestId,
          incidentId: null,
          correctionId: null,
          safeDetails: {
            reason: !agentActive
              ? `Agent is ${agentRow?.status || 'missing'}, expected active`
              : `Policy version mismatch: ${agentRow?.policy_version} vs ${reqRow.policy_version}`
          }
        }, db);
      } else {
        // Revalidation passed: Issue Ed25519 token once
        const now = Date.now();
        const parsedParams = typeof reqRow.parameters === 'string'
          ? JSON.parse(reqRow.parameters)
          : (reqRow.parameters || {});

        const nonce = `nonce-${crypto.randomBytes(8).toString('hex')}`;
        const exp = Math.floor(now / 1000) + 60; // 60s
        const claims: IntegrationTokenClaims = {
          request_id: requestId,
          agent_id: reqRow.agent_id,
          operation: reqRow.operation,
          resource: reqRow.resource || 'default',
          params_hash: computeParamsHash(parsedParams),
          nonce,
          exp
        };

        token = signEd25519Token(claims);
        recordIntegrationToken(db, claims, token);

        db.prepare(`
          UPDATE executions
          SET status = 'EXECUTING', executed_at = ?
          WHERE request_id = ? AND status = 'NOT_EXECUTED'
        `).run(now, requestId);

        writeAuditEvent({
          eventType: 'EXECUTION_STARTED',
          actorType: 'system',
          actorId: 'approval-executor',
          agentId: reqRow.agent_id,
          agentOwner: agentRow.owner_user_id,
          policyId: reqRow.policy_id,
          policyVersion: reqRow.policy_version,
          resourceReference: reqRow.resource,
          decision: 'ALLOW',
          outcome: 'POST_APPROVAL_TOKEN_ISSUED',
          requestId,
          incidentId: null,
          correctionId: null,
          safeDetails: { approverId: apprRow.approver_id, revalidation: 'PASSED' }
        }, db);
      }
    }

    const updatedExec = db.prepare('SELECT status FROM executions WHERE request_id = ?').get(requestId) as any;
    const finalExecStatus = updatedExec ? updatedExec.status : (execRow ? execRow.status : 'NOT_STARTED');

    return res.json({
      request_id: reqRow.id,
      requestId: reqRow.id,
      gate_decision: reqRow.gate_decision,
      gateDecision: reqRow.gate_decision,
      approval_status: apprRow ? apprRow.status : null,
      approvalStatus: apprRow ? apprRow.status : null,
      execution_status: finalExecStatus,
      executionStatus: finalExecStatus,
      token: token || null
    });
  } catch (err: any) {
    logDatabaseErrorIfBusyOrLocked(err, 'GET /api/integration/requests/:id');
    console.error('Error in /api/integration/requests/:id:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

/**
 * 3. POST /api/integration/requests/:id/result
 * Body: { outcome, details }
 * Sets execution status and writes audit event.
 */
integrationRouter.post('/requests/:id/result', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const requestId = req.params.id;
    const { outcome = 'SUCCESS', details = {} } = req.body;

    const reqRow = db.prepare('SELECT * FROM action_requests WHERE id = ?').get(requestId) as any;
    if (!reqRow) {
      return res.status(404).json({
        error: 'REQUEST_NOT_FOUND',
        message: `Action request ${requestId} not found.`
      });
    }

    const isSuccess = outcome.toString().toUpperCase().startsWith('SUCC');
    const execStatus = isSuccess ? 'SUCCEEDED' : 'FAILED';
    const now = Date.now();

    db.prepare(`
      UPDATE executions
      SET status = ?, result_reference = ?, executed_at = ?, non_execution_reason = ?
      WHERE request_id = ?
    `).run(
      execStatus,
      JSON.stringify(details || {}),
      now,
      !isSuccess ? (typeof details === 'string' ? details : (details?.error || details?.reason || outcome)) : null,
      requestId
    );

    // Mark token as consumed/used
    consumeIntegrationToken(db, requestId);

    writeAuditEvent({
      eventType: isSuccess ? 'EXECUTION_SUCCEEDED' : 'EXECUTION_FAILED',
      actorType: 'agent',
      actorId: reqRow.agent_id,
      agentId: reqRow.agent_id,
      agentOwner: null,
      policyId: reqRow.policy_id,
      policyVersion: reqRow.policy_version,
      resourceReference: reqRow.resource,
      decision: reqRow.gate_decision,
      outcome: outcome || execStatus,
      requestId,
      incidentId: null,
      correctionId: null,
      safeDetails: typeof details === 'object' ? details : { details }
    }, db);

    return res.json({
      success: true,
      request_id: requestId,
      requestId,
      execution_status: execStatus,
      executionStatus: execStatus
    });
  } catch (err: any) {
    logDatabaseErrorIfBusyOrLocked(err, 'POST /api/integration/requests/:id/result');
    console.error('Error in /api/integration/requests/:id/result:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

/**
 * 4. GET /api/integration/agents/:id/control
 * Returns: { status, paused_reason, config_version, config: { system_prompt, tools, step_budget } }
 */
integrationRouter.get('/agents/:id/control', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const agentId = req.params.id;

    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as any;
    if (!agent) {
      return res.status(404).json({
        error: 'AGENT_NOT_FOUND',
        message: `Agent ${agentId} not found.`
      });
    }

    let paused_reason: string | null = null;
    if (agent.status === 'paused') {
      const openIncident = db.prepare(`
        SELECT evidence_summary FROM incidents
        WHERE agent_id = ? AND status = 'OPEN'
        ORDER BY opened_at DESC LIMIT 1
      `).get(agentId) as any;

      if (openIncident) {
        paused_reason = openIncident.evidence_summary;
      } else {
        const lastTransition = db.prepare(`
          SELECT safe_details FROM audit_events
          WHERE agent_id = ? AND event_type = 'AGENT_STATUS_TRANSITIONED'
          ORDER BY sequence DESC LIMIT 1
        `).get(agentId) as any;

        if (lastTransition && lastTransition.safe_details) {
          try {
            const parsed = JSON.parse(lastTransition.safe_details);
            paused_reason = parsed.reason || 'Paused by system policy.';
          } catch {
            paused_reason = 'Paused by governance administrator.';
          }
        } else {
          paused_reason = 'Policy enforcement containment.';
        }
      }
    }

    let configObj: any = {};
    try {
      configObj = JSON.parse(agent.workflow_config || '{}');
    } catch {
      configObj = {};
    }

    let tools: string[] = [];
    try {
      tools = JSON.parse(agent.allowed_operations || '[]');
    } catch {
      tools = [];
    }

    return res.json({
      status: agent.status,
      paused_reason,
      config_version: agent.policy_version,
      config: {
        system_prompt: configObj.system_prompt || agent.purpose,
        tools: configObj.tools || tools,
        step_budget: configObj.step_budget ?? 20
      }
    });
  } catch (err: any) {
    logDatabaseErrorIfBusyOrLocked(err, 'GET /api/integration/agents/:id/control');
    console.error('Error in /api/integration/agents/:id/control:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

/**
 * 5. POST /api/integration/agents/:id/heartbeat
 */
integrationRouter.post('/agents/:id/heartbeat', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const agentId = req.params.id;

    const agent = db.prepare('SELECT id, status FROM agents WHERE id = ?').get(agentId) as any;
    if (!agent) {
      return res.status(404).json({
        error: 'AGENT_NOT_FOUND',
        message: `Agent ${agentId} not found.`
      });
    }

    const now = Date.now();
    db.prepare('UPDATE agents SET updated_at = ? WHERE id = ?').run(now, agentId);

    return res.json({
      status: 'ok',
      agent_id: agentId,
      agent_status: agent.status,
      timestamp: new Date().toISOString()
    });
  } catch (err: any) {
    logDatabaseErrorIfBusyOrLocked(err, 'POST /api/integration/agents/:id/heartbeat');
    console.error('Error in /api/integration/agents/:id/heartbeat:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});

/**
 * 6. GET /api/integration/public-key
 * Returns the Ed25519 SPKI PEM public key.
 */
integrationRouter.get('/public-key', (req: Request, res: Response) => {
  try {
    const publicKeyPem = getPublicKeyPem();

    if (req.headers.accept && req.headers.accept.includes('text/plain')) {
      res.setHeader('Content-Type', 'text/plain');
      return res.send(publicKeyPem);
    }

    return res.json({
      algorithm: 'Ed25519',
      publicKey: publicKeyPem,
      public_key: publicKeyPem
    });
  } catch (err: any) {
    console.error('Error in /api/integration/public-key:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
});
