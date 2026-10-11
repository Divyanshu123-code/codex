import { describe, it, expect, beforeEach } from 'vitest';
import { getDatabase } from '../src/db/connection.js';
import { seedDatabase } from '../src/db/seed.js';
import { routeAction } from '../src/engine/gateway.js';
import { diagnoseIncident } from '../src/engine/diagnostics.js';
import { testCorrection } from '../src/engine/sandbox.js';
import { approveCorrection, applyCorrection, resumeAgent, evaluateResumeEligibility } from '../src/engine/resumeGate.js';

describe('Phase 6 & 7: Bounded Diagnostics, Sandbox Checks, and Verified Recovery (Gate G3)', () => {
  let db: any;

  beforeEach(() => {
    db = getDatabase(':memory:');
    seedDatabase(db);
  });

  it('Gate G3 Full Recovery Path: Violation -> Diagnosis -> Bad correction fails -> Safe correction passes -> Approval -> Revalidation -> Resume', () => {
    // 1. Trigger violation (Scenario C)
    const routeRes = routeAction(
      {
        agent_id: 'doc-agent-01',
        tool: 'file_purger',
        operation: 'delete_file',
        resource: 'synthetic://documents/defense_intel_brief_2026.txt'
      },
      { type: 'agent', id: 'doc-agent-01' },
      db
    );

    expect(routeRes.gateDecision).toBe('BLOCK');

    // Verify agent is paused and incident opened
    const agentBefore = db.prepare('SELECT status FROM agents WHERE id = ?').get('doc-agent-01') as any;
    expect(agentBefore.status).toBe('paused');

    const incident = db.prepare('SELECT * FROM incidents WHERE agent_id = ?').get('doc-agent-01') as any;
    expect(incident).toBeDefined();
    expect(incident.status).toBe('OPEN');

    // 2. Run diagnostics (Bounded triage over closed catalog)
    const diagRes = diagnoseIncident(incident.id, db);
    expect(diagRes.status).toBe('DIAGNOSED');
    expect(diagRes.signatureId).toBe('SIG-DISALLOWED-OP');
    expect(diagRes.proposedCorrection).toBeDefined();

    // 3. BAD CORRECTION TEST: Attacker or buggy debugger tries to silently weaken policy by granting delete_file
    const badPatch = {
      action: 'grant_permission',
      allowed_operations: ['read_file', 'write_summary', 'archive_file', 'delete_file'],
      description: 'Silently grant delete_file permission to make error go away'
    };

    const badTestRes = testCorrection(incident.id, badPatch, { type: 'human', id: 'usr-admin' }, db);
    expect(badTestRes.verdict).toBe('FAIL');
    // Verify structural checks S1/S2/S3 caught the violation
    const s2 = badTestRes.structuralChecks.find((c) => c.checkId === 'S2');
    expect(s2?.passed).toBe(false);

    // Attempting to approve bad correction must fail
    expect(() => {
      approveCorrection(badTestRes.correctionId, { id: 'usr-reviewer', role: 'reviewer' }, 'Try to approve bad patch', db);
    }).toThrow('CANNOT_APPROVE_FAILING_CORRECTION');

    // Attempting premature resume must fail (R6 unmet)
    const prematureResume = resumeAgent('doc-agent-01', { role: 'admin', id: 'usr-admin' }, 'Premature resume attempt', db);
    expect(prematureResume.success).toBe(false);
    expect(prematureResume.status).toBe('paused');

    // 4. SAFE CORRECTION TEST: Replace delete_file with allowed archive_file
    const safePatch = diagRes.proposedCorrection;
    const safeTestRes = testCorrection(incident.id, safePatch, { type: 'system', id: 'diagnostics-engine' }, db);

    expect(safeTestRes.verdict).toBe('PASS');
    expect(safeTestRes.structuralChecks.every((c) => c.passed)).toBe(true);
    expect(safeTestRes.behaviouralChecks.every((c) => c.passed)).toBe(true);

    // 5. Approve safe correction (Enforce separation of duties: reviewer approving system proposal)
    approveCorrection(safeTestRes.correctionId, { id: 'usr-reviewer', role: 'reviewer' }, 'Approved sanitized workflow step', db);

    const corrAfterApproval = db.prepare('SELECT approval_status FROM corrections WHERE id = ?').get(safeTestRes.correctionId) as any;
    expect(corrAfterApproval.approval_status).toBe('APPROVED');

    // 6. Apply correction to live configuration
    applyCorrection(safeTestRes.correctionId, db);

    const corrAfterApply = db.prepare('SELECT application_status FROM corrections WHERE id = ?').get(safeTestRes.correctionId) as any;
    expect(corrAfterApply.application_status).toBe('APPLIED');

    // Incident is now RESOLVED
    const incidentAfter = db.prepare('SELECT status FROM incidents WHERE id = ?').get(incident.id) as any;
    expect(incidentAfter.status).toBe('RESOLVED');

    // 7. Evaluate resume eligibility & Resume
    const eligibility = evaluateResumeEligibility('doc-agent-01', { role: 'admin', id: 'usr-admin' }, 'Incident resolved with verified patch', db);
    expect(eligibility.eligible).toBe(true);
    expect(eligibility.unmet.length).toBe(0);

    const resumeRes = resumeAgent('doc-agent-01', { role: 'admin', id: 'usr-admin' }, 'Incident resolved with verified patch', db);
    expect(resumeRes.success).toBe(true);
    expect(resumeRes.status).toBe('active');

    // Agent is now ACTIVE
    const agentAfter = db.prepare('SELECT status FROM agents WHERE id = ?').get('doc-agent-01') as any;
    expect(agentAfter.status).toBe('active');
  });

  it('Separation of duties: Proposer cannot approve their own correction', () => {
    // Open an incident
    const routeRes = routeAction(
      { agent_id: 'doc-agent-01', tool: 'purger', operation: 'delete_file', resource: 'synthetic://documents/test.txt' },
      { type: 'agent', id: 'doc-agent-01' },
      db
    );
    const incident = db.prepare('SELECT * FROM incidents WHERE agent_id = ?').get('doc-agent-01') as any;
    const diag = diagnoseIncident(incident.id, db);

    // Human analyst submits correction
    const testRes = testCorrection(incident.id, diag.proposedCorrection, { type: 'human', id: 'usr-reviewer-1' }, db);

    // Same human analyst tries to approve it -> MUST FAIL
    expect(() => {
      approveCorrection(testRes.correctionId, { id: 'usr-reviewer-1', role: 'reviewer' }, 'Self-approval attempt', db);
    }).toThrow('SEPARATION_OF_DUTIES');
  });
});
