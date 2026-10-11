import { describe, it, expect, beforeEach } from 'vitest';
import { getDatabase } from '../src/db/connection.js';
import { seedDatabase } from '../src/db/seed.js';
import { generateIncidentReport } from '../src/engine/incidentReport.js';
import { routeAction } from '../src/engine/gateway.js';
import { diagnoseIncident } from '../src/engine/diagnostics.js';

describe('Workstream C: Audit-Ready Incident Accountability Report', () => {
  let db: any;

  beforeEach(() => {
    db = getDatabase(':memory:');
    seedDatabase(db);
  });

  it('Generates complete 11-section report for an existing incident', () => {
    // There is a seeded incident in baseline DB: 'inc-demo-001'
    const report = generateIncidentReport('inc-demo-001', db);

    // Report Metadata
    expect(report.reportMetadata.reportVersion).toBe('1.0');
    expect(report.reportMetadata.disclaimer).toContain('NO RETROACTIVE STATE MODIFICATION');

    // Section 1: Incident Identification
    expect(report.section1_incidentIdentification.incidentId).toBe('inc-demo-001');
    expect(report.section1_incidentIdentification.severity).toBe('critical');

    // Section 2: Agent & Ownership
    expect(report.section2_agentAndOwnership.agentId).toBe('data-exporter-99');
    expect(report.section2_agentAndOwnership.ownerUserIdAtEvent).toBe('usr-researcher');

    // Section 3: Task & Triggering Action
    expect(report.section3_taskAndTriggeringAction.triggeringRequestId).toBe('req-demo-violation-01');
    expect(report.section3_taskAndTriggeringAction.requestedOperation).toBe('delete_file');

    // Section 4: Policy Gate
    expect(report.section4_policyEvaluationGate.gateDecision).toBe('BLOCK');
    expect(report.section4_policyEvaluationGate.reasonCode).toBe('POLICY_RULE_VIOLATION');

    // Section 5: Human Review (none was required for hard block)
    expect(report.section5_humanAuthorizationReview.approvalRequired).toBe(false);

    // Section 6: Execution Outcome (Blocked = NOT_EXECUTED)
    expect(report.section6_executionOutcome.status).toBe('NOT_EXECUTED');
    expect(report.section6_executionOutcome.nonExecutionReason).toBe('BLOCKED_BY_POLICY');

    // Section 7: Containment Action
    expect(report.section7_containmentAction.containmentEnforced).toBe(true);
    expect(report.section7_containmentAction.postIncidentAgentStatus).toBe('paused');

    // Section 8: Automated Diagnostics
    expect(report.section8_automatedDiagnostics.signatureId).toBe('SIG-001');

    // Section 9: Correction Proposal
    expect(report.section9_correctionProposalAndVerification).toBeDefined();

    // Section 10: Revalidation and Resume Decision
    expect(report.section10_revalidationAndResumeDecision).toBeDefined();
    expect(Array.isArray(report.section10_revalidationAndResumeDecision.unmetConditions)).toBe(true);

    // Section 11: Chronological Audit Timeline
    expect(Array.isArray(report.section11_chronologicalAuditTimeline)).toBe(true);
    expect(report.section11_chronologicalAuditTimeline.length).toBeGreaterThanOrEqual(1);
    // Verify sequence ordering
    for (let i = 0; i < report.section11_chronologicalAuditTimeline.length - 1; i++) {
      expect(report.section11_chronologicalAuditTimeline[i].sequence).toBeLessThanOrEqual(
        report.section11_chronologicalAuditTimeline[i + 1].sequence
      );
    }
  });

  it('Report generation is read-only and does not mutate database records', () => {
    const preCount = db.prepare('SELECT COUNT(*) as count FROM audit_events').get().count;
    generateIncidentReport('inc-demo-001', db);
    const postCount = db.prepare('SELECT COUNT(*) as count FROM audit_events').get().count;
    expect(preCount).toBe(postCount);
  });

  it('Throws error when incident is not found', () => {
    expect(() => {
      generateIncidentReport('inc-non-existent-999', db);
    }).toThrow('not found');
  });

  it('Dynamic incident creation through gate breach produces auditable report', () => {
    // Trigger breach on active doc-agent-01
    const routeRes = routeAction(
      {
        agent_id: 'doc-agent-01',
        tool: 'file_reader',
        operation: 'delete_file',
        resource: 'synthetic://documents/classified_intel.txt'
      },
      { type: 'agent', id: 'doc-agent-01' },
      db
    );

    expect(routeRes.gateDecision).toBe('BLOCK');
    expect(routeRes.incidentId).toBeDefined();

    // Diagnose incident
    diagnoseIncident(routeRes.incidentId!, db);

    // Generate report
    const report = generateIncidentReport(routeRes.incidentId!, db);
    expect(report.section1_incidentIdentification.incidentId).toBe(routeRes.incidentId);
    expect(report.section2_agentAndOwnership.agentId).toBe('doc-agent-01');
    expect(report.section4_policyEvaluationGate.gateDecision).toBe('BLOCK');
    expect(report.section6_executionOutcome.status).toBe('NOT_EXECUTED');
    expect(report.section8_automatedDiagnostics.diagnosticStatus).toBe('COMPLETED');
  });
});
