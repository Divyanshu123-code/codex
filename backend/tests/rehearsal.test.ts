import { describe, it, expect, beforeEach } from 'vitest';
import { getDatabase } from '../src/db/connection.js';
import { seedDatabase } from '../src/db/seed.js';
import { routeAction } from '../src/engine/gateway.js';
import { decideApproval } from '../src/engine/approval.js';
import { diagnoseIncident } from '../src/engine/diagnostics.js';
import { testCorrection } from '../src/engine/sandbox.js';
import { approveCorrection, applyCorrection, resumeAgent } from '../src/engine/resumeGate.js';
import { getSyntheticStorageState } from '../src/tools/protectedTools.js';

describe('Phase 9: Comprehensive End-to-End Rehearsal & Verification (Gate G4)', () => {
  let db: any;

  beforeEach(() => {
    db = getDatabase(':memory:');
    seedDatabase(db);
  });

  it('End-to-End Demo Workflow: Demonstrates the full lifecycle offline from clean reset', () => {
    // Step 1: Scenario A - Permitted Read Action
    const resA = routeAction(
      {
        agent_id: 'doc-agent-01',
        tool: 'file_reader',
        operation: 'read_file',
        resource: 'synthetic://documents/defense_intel_brief_2026.txt'
      },
      { type: 'agent', id: 'doc-agent-01' },
      db
    );
    expect(resA.gateDecision).toBe('ALLOW');
    expect(resA.executionStatus).toBe('SUCCEEDED');
    expect(resA.result.content).toContain('CONFIDENTIAL SYNTHETIC INTEL');

    // Step 2: Scenario B - Sensitive Export Action Requiring Approval
    const resB = routeAction(
      {
        agent_id: 'doc-agent-01',
        tool: 'exporter',
        operation: 'export_dataset',
        resource: 'synthetic://documents/defense_intel_brief_2026.txt'
      },
      { type: 'agent', id: 'doc-agent-01' },
      db
    );
    expect(resB.gateDecision).toBe('REQUIRE_APPROVAL');
    expect(resB.executionStatus).toBe('NOT_EXECUTED');
    expect(resB.nonExecutionReason).toBe('APPROVAL_PENDING');

    // Step 3: Approve Scenario B and verify execution
    const appB = db.prepare('SELECT * FROM approvals WHERE request_id = ?').get(resB.requestId) as any;
    const decB = decideApproval(
      appB.id,
      'APPROVED',
      { id: 'usr-reviewer', role: 'reviewer' },
      'Authorized export for joint mission analysis',
      db
    );
    expect(decB.approvalStatus).toBe('APPROVED');
    expect(decB.executionStatus).toBe('SUCCEEDED');

    // Step 4: Scenario C - Prohibited Action (Delete File)
    const stateBeforeDelete = getSyntheticStorageState();
    const resC = routeAction(
      {
        agent_id: 'doc-agent-01',
        tool: 'file_purger',
        operation: 'delete_file',
        resource: 'synthetic://documents/defense_intel_brief_2026.txt'
      },
      { type: 'agent', id: 'doc-agent-01' },
      db
    );
    expect(resC.gateDecision).toBe('BLOCK');
    expect(resC.executionStatus).toBe('NOT_EXECUTED');

    // Invariant: Target document is untouched
    const stateAfterDelete = getSyntheticStorageState();
    expect(stateAfterDelete.documents['synthetic://documents/defense_intel_brief_2026.txt']).toBe(
      stateBeforeDelete.documents['synthetic://documents/defense_intel_brief_2026.txt']
    );

    // Invariant: Agent is paused and incident is opened
    const agentPaused = db.prepare('SELECT status FROM agents WHERE id = ?').get('doc-agent-01') as any;
    expect(agentPaused.status).toBe('paused');

    const incident = db.prepare('SELECT * FROM incidents WHERE agent_id = ?').get('doc-agent-01') as any;
    expect(incident.status).toBe('OPEN');

    // Step 5: Bounded Diagnostics
    const diag = diagnoseIncident(incident.id, db);
    expect(diag.status).toBe('DIAGNOSED');
    expect(diag.signatureId).toBe('SIG-DISALLOWED-OP');

    // Step 6: Test Malicious Patch in Sandbox (Must FAIL S2 / S3)
    const badPatch = {
      action: 'grant_permission',
      allowed_operations: ['delete_file'],
      description: 'Attempt to silently lower permissions'
    };
    const badTest = testCorrection(incident.id, badPatch, { type: 'human', id: 'usr-admin' }, db);
    expect(badTest.verdict).toBe('FAIL');

    // Premature resume while paused must fail
    const prematureResume = resumeAgent('doc-agent-01', { role: 'admin', id: 'usr-admin' }, 'Premature resume', db);
    expect(prematureResume.success).toBe(false);

    // Step 7: Test Safe Sanitized Patch in Sandbox (Must PASS S1-S6 and B1-B6)
    const safePatch = diag.proposedCorrection;
    const safeTest = testCorrection(incident.id, safePatch, { type: 'system', id: 'diagnostics-engine' }, db);
    expect(safeTest.verdict).toBe('PASS');

    // Step 8: Separation of Duties Approval
    approveCorrection(safeTest.correctionId, { id: 'usr-reviewer', role: 'reviewer' }, 'Approved sanitized workflow step', db);

    // Step 9: Apply correction
    applyCorrection(safeTest.correctionId, db);

    // Step 10: Centralized Resume Gate Revalidation & Resume
    const resumeRes = resumeAgent('doc-agent-01', { role: 'admin', id: 'usr-admin' }, 'Incident resolved with verified patch', db);
    expect(resumeRes.success).toBe(true);
    expect(resumeRes.status).toBe('active');

    // Step 11: Agent resumes normal work cleanly
    const postRecoveryAction = routeAction(
      {
        agent_id: 'doc-agent-01',
        tool: 'file_reader',
        operation: 'read_file',
        resource: 'synthetic://documents/defense_intel_brief_2026.txt'
      },
      { type: 'agent', id: 'doc-agent-01' },
      db
    );
    expect(postRecoveryAction.gateDecision).toBe('ALLOW');
    expect(postRecoveryAction.executionStatus).toBe('SUCCEEDED');
  });
});
