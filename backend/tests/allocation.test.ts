import { describe, it, expect, beforeEach } from 'vitest';
import { getDatabase } from '../src/db/connection.js';
import { seedDatabase } from '../src/db/seed.js';
import { allocateTask, escalateTask } from '../src/engine/allocation.js';
import { transitionAgentStatus } from '../src/engine/gateway.js';

describe('Workstream A: Deterministic Human-vs-Agent Allocation & Escalation', () => {
  let db: any;

  beforeEach(() => {
    db = getDatabase(':memory:');
    seedDatabase(db);
  });

  it('Agent-eligible task is allocated to an agent', () => {
    const res = allocateTask(
      {
        title: 'Summarize quarterly synthetic intel',
        task_type: 'document_summary',
        description: 'Generate synthetic document summary',
        payload: { resource: 'synthetic://docs/q3_report.txt' },
        target_agent_id: 'doc-agent-01'
      },
      { type: 'human', id: 'operator-1' },
      db
    );

    expect(res.handler).toBe('agent');
    expect(res.assignedAgentId).toBe('doc-agent-01');
    expect(res.status).toBe('QUEUED');
    expect(res.riskCategory).toBe('low');

    // Verify task stored in database
    const taskRow = db.prepare('SELECT * FROM tasks WHERE id = ?').get(res.taskId) as any;
    expect(taskRow).toBeDefined();
    expect(taskRow.handler).toBe('agent');
    expect(taskRow.assigned_agent_id).toBe('doc-agent-01');

    // Verify audit event
    const auditRow = db.prepare('SELECT * FROM audit_events WHERE event_type = ? AND outcome = ?').get('TASK_ALLOCATED', 'AGENT') as any;
    expect(auditRow).toBeDefined();
    expect(auditRow.decision).toBe('ALLOW');
  });

  it('Human-only task enters the human queue', () => {
    const res = allocateTask(
      {
        title: 'Approve vendor clearance',
        task_type: 'vendor_audit',
        description: 'Human-in-the-loop manual compliance audit',
        payload: { vendorId: 'v-998' }
      },
      { type: 'human', id: 'operator-1' },
      db
    );

    expect(res.handler).toBe('human');
    expect(res.assignedAgentId).toBeNull();
    expect(res.status).toBe('QUEUED');
    expect(res.riskCategory).toBe('medium');

    const taskRow = db.prepare('SELECT * FROM tasks WHERE id = ?').get(res.taskId) as any;
    expect(taskRow.handler).toBe('human');
    expect(taskRow.assigned_agent_id).toBeNull();

    const auditRow = db.prepare('SELECT * FROM audit_events WHERE event_type = ? AND outcome = ?').get('TASK_ALLOCATED', 'HUMAN') as any;
    expect(auditRow).toBeDefined();
  });

  it('Sensitive task requiring approval is flagged for human authorization gate', () => {
    const res = allocateTask(
      {
        title: 'Export sensitive synthetic payload',
        task_type: 'dataset_export',
        description: 'Export requiring dual-custody approval',
        payload: { destination: 'external-archive' },
        target_agent_id: 'doc-agent-01'
      },
      { type: 'human', id: 'operator-1' },
      db
    );

    expect(res.handler).toBe('agent');
    expect(res.assignedAgentId).toBe('doc-agent-01');
    expect(res.handlerReason).toContain('human approval gate');
  });

  it('Prohibited task is blocked and never dispatched', () => {
    const res = allocateTask(
      {
        title: 'Delete sensitive dataset',
        task_type: 'file_purge',
        description: 'Attempted purge of file storage',
        requested_operation: 'delete_file',
        target_agent_id: 'doc-agent-01'
      },
      { type: 'human', id: 'operator-1' },
      db
    );

    expect(res.handler).toBe('blocked');
    expect(res.status).toBe('BLOCKED');
    expect(res.assignedAgentId).toBeNull();
    expect(res.handlerReason).toContain('violates baseline system safety constraints');

    const taskRow = db.prepare('SELECT * FROM tasks WHERE id = ?').get(res.taskId) as any;
    expect(taskRow.status).toBe('BLOCKED');

    const auditRow = db.prepare('SELECT * FROM audit_events WHERE event_type = ? AND decision = ?').get('TASK_ALLOCATED', 'BLOCK') as any;
    expect(auditRow).toBeDefined();
  });

  it('Task targeting a paused agent is blocked from dispatch', () => {
    transitionAgentStatus('doc-agent-01', 'paused', { type: 'human', id: 'admin' }, 'Security pause', db);

    const res = allocateTask(
      {
        title: 'Read document summary',
        task_type: 'document_summary',
        description: 'Read file doc',
        target_agent_id: 'doc-agent-01'
      },
      { type: 'human', id: 'operator-1' },
      db
    );

    expect(res.handler).toBe('blocked');
    expect(res.status).toBe('BLOCKED');
    expect(res.handlerReason).toContain('paused due to violation containment');
  });

  it('Task escalation records reason, target role, and audit event', () => {
    const alloc = allocateTask(
      {
        title: 'Summarize document',
        task_type: 'document_summary',
        description: 'Initial document summary',
        target_agent_id: 'doc-agent-01'
      },
      { type: 'human', id: 'operator-1' },
      db
    );

    escalateTask(
      alloc.taskId,
      'Document classified higher than anticipated clearance',
      'lead_analyst',
      { type: 'human', id: 'operator-1' },
      db
    );

    const taskRow = db.prepare('SELECT * FROM tasks WHERE id = ?').get(alloc.taskId) as any;
    expect(taskRow.handler).toBe('escalated');
    expect(taskRow.status).toBe('ESCALATED');
    expect(taskRow.escalation_target_role).toBe('lead_analyst');
    expect(taskRow.escalation_reason).toBe('Document classified higher than anticipated clearance');
    expect(taskRow.escalated_at).toBeGreaterThan(0);

    const auditRow = db.prepare('SELECT * FROM audit_events WHERE event_type = ?').get('TASK_ESCALATED') as any;
    expect(auditRow).toBeDefined();
    expect(auditRow.outcome).toBe('ESCALATED');
  });

  it('Unknown task type is rejected with UNKNOWN_TASK_TYPE', () => {
    expect(() => {
      allocateTask(
        {
          title: 'Unknown task',
          task_type: 'non_existent_type',
          description: 'Invalid'
        },
        { type: 'human', id: 'operator-1' },
        db
      );
    }).toThrow('UNKNOWN_TASK_TYPE');
  });
});
