import { describe, it, expect, beforeEach } from 'vitest';
import { getDatabase } from '../src/db/connection.js';
import { seedDatabase } from '../src/db/seed.js';
import { routeAction } from '../src/engine/gateway.js';
import {
  getSyntheticStorageState,
  executeProtectedTool
} from '../src/tools/protectedTools.js';

describe('Phase 3: Gateway Enforcement & Protected Tool Boundary', () => {
  let db: any;

  beforeEach(() => {
    db = getDatabase(':memory:');
    seedDatabase(db);
  });

  it('Scenario A: Permitted action executes and records audit trail', () => {
    const result = routeAction(
      {
        agent_id: 'doc-agent-01',
        tool: 'file_reader',
        operation: 'read_file',
        resource: 'synthetic://documents/defense_intel_brief_2026.txt'
      },
      { type: 'agent', id: 'doc-agent-01' },
      db
    );

    expect(result.gateDecision).toBe('ALLOW');
    expect(result.executionStatus).toBe('SUCCEEDED');
    expect(result.result).toBeDefined();
    expect(result.result.content).toContain('CONFIDENTIAL SYNTHETIC INTEL');

    // Verify executions table
    const execRow = db.prepare('SELECT * FROM executions WHERE request_id = ?').get(result.requestId) as any;
    expect(execRow.status).toBe('SUCCEEDED');

    // Verify audit events
    const events = db.prepare('SELECT * FROM audit_events WHERE request_id = ?').all(result.requestId) as any[];
    const eventTypes = events.map((e) => e.event_type);
    expect(eventTypes).toContain('GATE_DECIDED');
    expect(eventTypes).toContain('EXECUTION_STARTED');
    expect(eventTypes).toContain('EXECUTION_SUCCEEDED');
  });

  it('Scenario B: High-impact action is held in queue with NO execution side effects', () => {
    const result = routeAction(
      {
        agent_id: 'doc-agent-01',
        tool: 'dataset_exporter',
        operation: 'export_dataset',
        resource: 'synthetic://documents/defense_intel_brief_2026.txt'
      },
      { type: 'agent', id: 'doc-agent-01' },
      db
    );

    expect(result.gateDecision).toBe('REQUIRE_APPROVAL');
    expect(result.approvalStatus).toBe('PENDING');
    expect(result.executionStatus).toBe('NOT_EXECUTED');
    expect(result.nonExecutionReason).toBe('APPROVAL_PENDING');

    // Verify approval record
    const approvalRow = db.prepare('SELECT * FROM approvals WHERE request_id = ?').get(result.requestId) as any;
    expect(approvalRow.status).toBe('PENDING');

    // Verify execution record
    const execRow = db.prepare('SELECT * FROM executions WHERE request_id = ?').get(result.requestId) as any;
    expect(execRow.status).toBe('NOT_EXECUTED');
    expect(execRow.non_execution_reason).toBe('APPROVAL_PENDING');
  });

  it('Scenario C: Prohibited action is blocked, agent paused, incident opened, state untouched', () => {
    const stateBefore = getSyntheticStorageState();

    const result = routeAction(
      {
        agent_id: 'doc-agent-01',
        tool: 'file_purger',
        operation: 'delete_file',
        resource: 'synthetic://documents/defense_intel_brief_2026.txt'
      },
      { type: 'agent', id: 'doc-agent-01' },
      db
    );

    expect(result.gateDecision).toBe('BLOCK');
    expect(result.executionStatus).toBe('NOT_EXECUTED');
    expect(result.nonExecutionReason).toBe('BLOCKED_BY_POLICY');

    // STATE ASSERTION: Synthetic file must still exist and be completely untouched
    const stateAfter = getSyntheticStorageState();
    expect(stateAfter.documents['synthetic://documents/defense_intel_brief_2026.txt']).toBe(
      stateBefore.documents['synthetic://documents/defense_intel_brief_2026.txt']
    );

    // Agent status must be transitioned to paused
    const agentRow = db.prepare('SELECT status FROM agents WHERE id = ?').get('doc-agent-01') as any;
    expect(agentRow.status).toBe('paused');

    // Incident must be opened
    const incidentRow = db.prepare('SELECT * FROM incidents WHERE agent_id = ?').get('doc-agent-01') as any;
    expect(incidentRow).toBeDefined();
    expect(incidentRow.status).toBe('OPEN');
    expect(incidentRow.severity).toBe('high');

    // Audit event must record containment
    const events = db.prepare('SELECT * FROM audit_events WHERE request_id = ?').all(result.requestId) as any[];
    const eventTypes = events.map((e) => e.event_type);
    expect(eventTypes).toContain('GATE_DECIDED');
    expect(eventTypes).toContain('VIOLATION_CONTAINED');
  });

  it('NO-BYPASS INVARIANT: Direct call to protected tool with invalid token is rejected', () => {
    expect(() => {
      executeProtectedTool(
        'bogus-invalid-token',
        'req-fake-999',
        'delete_file',
        'synthetic://documents/defense_intel_brief_2026.txt',
        {},
        'correct-secret'
      );
    }).toThrow('UNAUTHORIZED_TOOL_INVOCATION');
  });
});
