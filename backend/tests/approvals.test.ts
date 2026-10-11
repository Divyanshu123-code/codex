import { describe, it, expect, beforeEach } from 'vitest';
import { getDatabase } from '../src/db/connection.js';
import { seedDatabase } from '../src/db/seed.js';
import { routeAction, transitionAgentStatus } from '../src/engine/gateway.js';
import { decideApproval } from '../src/engine/approval.js';

describe('Phase 4 & 5: Human Authorization, Idempotency, and Revalidation', () => {
  let db: any;

  beforeEach(() => {
    db = getDatabase(':memory:');
    seedDatabase(db);
  });

  it('Pending approval can be APPROVED by authorized reviewer and executes', () => {
    // 1. Submit action requiring approval
    const routeRes = routeAction(
      {
        agent_id: 'doc-agent-01',
        tool: 'dataset_exporter',
        operation: 'export_dataset',
        resource: 'synthetic://documents/defense_intel_brief_2026.txt'
      },
      { type: 'agent', id: 'doc-agent-01' },
      db
    );

    expect(routeRes.gateDecision).toBe('REQUIRE_APPROVAL');

    const approvalRow = db.prepare('SELECT * FROM approvals WHERE request_id = ?').get(routeRes.requestId) as any;
    expect(approvalRow.status).toBe('PENDING');

    // 2. Decide APPROVE
    const approvalRes = decideApproval(
      approvalRow.id,
      'APPROVED',
      { id: 'usr-reviewer', role: 'reviewer' },
      'Authorized by Lead Analyst Vance for inter-agency brief',
      db
    );

    expect(approvalRes.approvalStatus).toBe('APPROVED');
    expect(approvalRes.executionStatus).toBe('SUCCEEDED');
    expect(approvalRes.result).toBeDefined();

    // Verify executions table
    const execRow = db.prepare('SELECT * FROM executions WHERE request_id = ?').get(routeRes.requestId) as any;
    expect(execRow.status).toBe('SUCCEEDED');
  });

  it('Rejection never executes action and records audit event', () => {
    const routeRes = routeAction(
      {
        agent_id: 'doc-agent-01',
        tool: 'dataset_exporter',
        operation: 'export_dataset',
        resource: 'synthetic://documents/defense_intel_brief_2026.txt'
      },
      { type: 'agent', id: 'doc-agent-01' },
      db
    );

    const approvalRow = db.prepare('SELECT * FROM approvals WHERE request_id = ?').get(routeRes.requestId) as any;

    const approvalRes = decideApproval(
      approvalRow.id,
      'REJECTED',
      { id: 'usr-reviewer', role: 'reviewer' },
      'Denied: export destination unverified',
      db
    );

    expect(approvalRes.approvalStatus).toBe('REJECTED');
    expect(approvalRes.executionStatus).toBe('NOT_EXECUTED');
    expect(approvalRes.nonExecutionReason).toBe('APPROVAL_REJECTED');

    // Tool execution must remain NOT_EXECUTED forever
    const execRow = db.prepare('SELECT * FROM executions WHERE request_id = ?').get(routeRes.requestId) as any;
    expect(execRow.status).toBe('NOT_EXECUTED');
    expect(execRow.non_execution_reason).toBe('APPROVAL_REJECTED');
  });

  it('Unauthorized reviewer role (e.g. auditor) is rejected', () => {
    const routeRes = routeAction(
      {
        agent_id: 'doc-agent-01',
        tool: 'dataset_exporter',
        operation: 'export_dataset',
        resource: 'synthetic://documents/defense_intel_brief_2026.txt'
      },
      { type: 'agent', id: 'doc-agent-01' },
      db
    );

    const approvalRow = db.prepare('SELECT * FROM approvals WHERE request_id = ?').get(routeRes.requestId) as any;

    expect(() => {
      decideApproval(
        approvalRow.id,
        'APPROVED',
        { id: 'usr-auditor', role: 'auditor' }, // auditor role is read-only
        'Auditor attempted approval',
        db
      );
    }).toThrow('UNAUTHORIZED_REVIEWER_ROLE');
  });

  it('Missing reason is rejected', () => {
    const routeRes = routeAction(
      {
        agent_id: 'doc-agent-01',
        tool: 'dataset_exporter',
        operation: 'export_dataset',
        resource: 'synthetic://documents/defense_intel_brief_2026.txt'
      },
      { type: 'agent', id: 'doc-agent-01' },
      db
    );

    const approvalRow = db.prepare('SELECT * FROM approvals WHERE request_id = ?').get(routeRes.requestId) as any;

    expect(() => {
      decideApproval(
        approvalRow.id,
        'APPROVED',
        { id: 'usr-reviewer', role: 'reviewer' },
        '   ', // blank reason
        db
      );
    }).toThrow('REASON_REQUIRED');
  });

  it('Duplicate approval attempt is rejected (Idempotency)', () => {
    const routeRes = routeAction(
      {
        agent_id: 'doc-agent-01',
        tool: 'dataset_exporter',
        operation: 'export_dataset',
        resource: 'synthetic://documents/defense_intel_brief_2026.txt'
      },
      { type: 'agent', id: 'doc-agent-01' },
      db
    );

    const approvalRow = db.prepare('SELECT * FROM approvals WHERE request_id = ?').get(routeRes.requestId) as any;

    decideApproval(
      approvalRow.id,
      'APPROVED',
      { id: 'usr-reviewer', role: 'reviewer' },
      'First valid approval',
      db
    );

    // Second attempt on already decided approval
    expect(() => {
      decideApproval(
        approvalRow.id,
        'APPROVED',
        { id: 'usr-reviewer', role: 'reviewer' },
        'Duplicate approval attempt',
        db
      );
    }).toThrow('APPROVAL_ALREADY_DECIDED');
  });

  it('Revalidation Failure: If agent is paused while approval pending, execution is NOT_EXECUTED (REVALIDATION_FAILED) with approval still APPROVED', () => {
    const routeRes = routeAction(
      {
        agent_id: 'doc-agent-01',
        tool: 'dataset_exporter',
        operation: 'export_dataset',
        resource: 'synthetic://documents/defense_intel_brief_2026.txt'
      },
      { type: 'agent', id: 'doc-agent-01' },
      db
    );

    const approvalRow = db.prepare('SELECT * FROM approvals WHERE request_id = ?').get(routeRes.requestId) as any;

    // Admin pauses the agent while request was in approval queue
    transitionAgentStatus('doc-agent-01', 'paused', { type: 'human', id: 'usr-admin' }, 'Precautionary security pause', db);

    // Reviewer approves unaware
    const approvalRes = decideApproval(
      approvalRow.id,
      'APPROVED',
      { id: 'usr-reviewer', role: 'reviewer' },
      'Approved request',
      db
    );

    // Invariant: Approval status is APPROVED, but execution failed revalidation
    expect(approvalRes.approvalStatus).toBe('APPROVED');
    expect(approvalRes.executionStatus).toBe('NOT_EXECUTED');
    expect(approvalRes.nonExecutionReason).toBe('REVALIDATION_FAILED');

    const execRow = db.prepare('SELECT * FROM executions WHERE request_id = ?').get(routeRes.requestId) as any;
    expect(execRow.status).toBe('NOT_EXECUTED');
    expect(execRow.non_execution_reason).toBe('REVALIDATION_FAILED');
  });
});
