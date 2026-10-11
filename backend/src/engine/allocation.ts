import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../db/connection.js';
import { writeAuditEvent } from './gateway.js';

export interface TaskInput {
  title: string;
  task_type: string;
  description: string;
  payload?: any;
  target_agent_id?: string;
  requested_operation?: string;
}

export interface TaskAllocationResult {
  taskId: string;
  taskType: string;
  handler: 'agent' | 'human' | 'escalated' | 'blocked';
  handlerReason: string;
  assignedAgentId: string | null;
  riskCategory: 'low' | 'medium' | 'high' | 'critical';
  status: 'QUEUED' | 'IN_PROGRESS' | 'COMPLETED' | 'ESCALATED' | 'BLOCKED';
  correlationId: string;
}

/**
 * Deterministic Task Intake & Work Allocation (Workstream A)
 */
export function allocateTask(
  input: TaskInput,
  actor: { type: 'system' | 'human' | 'agent'; id: string },
  db?: DatabaseSync
): TaskAllocationResult {
  const targetDb = db || getDatabase();
  const taskId = `task-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const correlationId = `corr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const now = Date.now();

  // 1. Fetch Task Type
  const taskTypeRow = targetDb.prepare('SELECT * FROM task_types WHERE task_type = ?').get(input.task_type) as any;
  if (!taskTypeRow) {
    throw new Error(`UNKNOWN_TASK_TYPE: Task type '${input.task_type}' does not exist in governance registry.`);
  }

  const agentId = input.target_agent_id || 'doc-agent-01';
  const agentRow = targetDb.prepare('SELECT * FROM agents WHERE id = ?').get(agentId) as any;

  let handler: 'agent' | 'human' | 'escalated' | 'blocked' = 'agent';
  let handlerReason = '';
  let status: 'QUEUED' | 'IN_PROGRESS' | 'COMPLETED' | 'ESCALATED' | 'BLOCKED' = 'QUEUED';
  let assignedAgentId: string | null = agentId;

  // 2. Rule 1: Prohibited Capability Request
  if (input.requested_operation === 'delete_file' || input.task_type === 'file_purge') {
    handler = 'blocked';
    handlerReason = 'Requested operation violates baseline system safety constraints. Blocked from dispatch.';
    assignedAgentId = null;
    status = 'BLOCKED';
  }
  // 3. Rule 2: Target Agent Paused or Inactive
  else if (agentRow && agentRow.status === 'paused') {
    handler = 'blocked';
    handlerReason = `Target agent '${agentId}' is paused due to violation containment. Cannot receive work.`;
    assignedAgentId = agentId;
    status = 'BLOCKED';
  }
  // 4. Rule 3: Human-Only Tasks
  else if (taskTypeRow.default_handler === 'human') {
    handler = 'human';
    handlerReason = 'Task type policy mandates direct human execution (no agent autonomy).';
    assignedAgentId = null;
    status = 'QUEUED';
  }
  // 5. Rule 4: Sensitive Task Requiring Human Approval
  else if (taskTypeRow.default_handler === 'approval_required' || taskTypeRow.approval_required === 1) {
    handler = 'agent';
    handlerReason = 'Task dispatched to agent; requires human approval gate before execution.';
    assignedAgentId = agentId;
    status = 'QUEUED';
  }
  // 6. Rule 5: Standard Agent-Eligible Task
  else {
    handler = 'agent';
    handlerReason = `Task matches authorized capabilities for agent '${agentId}'.`;
    assignedAgentId = agentId;
    status = 'QUEUED';
  }

  targetDb.prepare(`
    INSERT INTO tasks (
      id, title, task_type, description, payload,
      handler, handler_reason, assigned_agent_id, risk_category, status,
      correlation_id, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    taskId,
    input.title,
    input.task_type,
    input.description,
    JSON.stringify(input.payload || {}),
    handler,
    handlerReason,
    assignedAgentId,
    taskTypeRow.risk_category,
    status,
    correlationId,
    now
  );

  // Write audit event
  writeAuditEvent({
    eventType: 'TASK_ALLOCATED',
    actorType: actor.type,
    actorId: actor.id,
    agentId: assignedAgentId,
    agentOwner: agentRow ? agentRow.owner_user_id : null,
    policyId: null,
    policyVersion: agentRow ? agentRow.policy_version : null,
    resourceReference: input.payload?.resource || null,
    decision: handler === 'blocked' ? 'BLOCK' : 'ALLOW',
    outcome: handler.toUpperCase(),
    requestId: null,
    incidentId: null,
    correctionId: null,
    safeDetails: { taskId, taskType: input.task_type, handler, handlerReason }
  }, targetDb);

  return {
    taskId,
    taskType: input.task_type,
    handler,
    handlerReason,
    assignedAgentId,
    riskCategory: taskTypeRow.risk_category,
    status,
    correlationId
  };
}

/**
 * Task Escalation (Workstream A)
 */
export function escalateTask(
  taskId: string,
  escalationReason: string,
  targetRole: string = 'reviewer',
  actor: { type: 'system' | 'human' | 'agent'; id: string },
  db?: DatabaseSync
): void {
  const targetDb = db || getDatabase();
  const taskRow = targetDb.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId) as any;
  if (!taskRow) {
    throw new Error(`Task ${taskId} not found.`);
  }

  const now = Date.now();
  targetDb.prepare(`
    UPDATE tasks
    SET handler = 'escalated', status = 'ESCALATED',
        escalation_target_role = ?, escalated_at = ?, escalation_reason = ?
    WHERE id = ?
  `).run(targetRole, now, escalationReason, taskId);

  writeAuditEvent({
    eventType: 'TASK_ESCALATED',
    actorType: actor.type,
    actorId: actor.id,
    agentId: taskRow.assigned_agent_id,
    agentOwner: null,
    policyId: null,
    policyVersion: null,
    resourceReference: null,
    decision: 'REQUIRE_APPROVAL',
    outcome: 'ESCALATED',
    requestId: null,
    incidentId: null,
    correctionId: null,
    safeDetails: { taskId, targetRole, escalationReason }
  }, targetDb);
}
