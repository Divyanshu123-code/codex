import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getDatabase } from '../db/connection.js';
import { evaluatePolicy, AgentRecord, PolicyRecord, OperationCatalogRecord } from '../engine/evaluator.js';
import { routeAction } from '../engine/gateway.js';

export const actionsRouter = Router();

const actionSchema = z.object({
  agentId: z.string().min(1),
  tool: z.string().min(1),
  operation: z.string().min(1),
  resource: z.string().min(1),
  parameters: z.record(z.any()).optional().default({})
});

// POST /api/actions/evaluate (Evaluation without execution)
actionsRouter.post('/evaluate', (req: Request, res: Response) => {
  try {
    const parsed = actionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid action payload', details: parsed.error.format() });
    }

    const { agentId, tool, operation, resource, parameters } = parsed.data;
    const db = getDatabase();

    // 1. Fetch Agent
    const agentRow = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as any;
    const agent: AgentRecord | null = agentRow ? {
      id: agentRow.id,
      name: agentRow.name,
      agent_category: agentRow.agent_category || 'document_analysis',
      status: agentRow.status,
      allowed_operations: JSON.parse(agentRow.allowed_operations),
      allowed_resources: JSON.parse(agentRow.allowed_resources),
      policy_version: agentRow.policy_version,
      input_requirements: agentRow.input_requirements ? JSON.parse(agentRow.input_requirements) : {},
      uncertainty_rule: agentRow.uncertainty_rule ? JSON.parse(agentRow.uncertainty_rule) : {}
    } : null;

    // 2. Fetch Policies
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
      open_incident: p.open_incident
    }));

    // 3. Fetch Operations Catalog
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

    // 4. Run pure evaluation
    const evaluation = evaluatePolicy(
      agent,
      { agent_id: agentId, tool, operation, resource, parameters },
      policies,
      catalog
    );

    res.json({
      agentId,
      tool,
      operation,
      resource,
      evaluation
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/actions/route (Full enforcement gateway execution)
actionsRouter.post('/route', (req: Request, res: Response) => {
  try {
    const parsed = actionSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid action payload', details: parsed.error.format() });
    }

    const { agentId, tool, operation, resource, parameters } = parsed.data;
    const result = routeAction(
      { agent_id: agentId, tool, operation, resource, parameters },
      { type: 'agent', id: agentId }
    );

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
