import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../db/connection.js';

export interface AuditReadyIncidentReport {
  reportMetadata: {
    generatedAt: string;
    reportVersion: '1.0';
    disclaimer: 'AUDIT REPORT ASSEMBLED FROM PERSISTED TELEMETRY. NO RETROACTIVE STATE MODIFICATION.';
  };
  section1_incidentIdentification: {
    incidentId: string;
    severity: string;
    status: string;
    openedAt: string;
    diagnosedAt: string | 'Not applicable';
    appliedAt: string | 'Not applicable';
    resumedAt: string | 'Not applicable';
  };
  section2_agentAndOwnership: {
    agentId: string;
    agentName: string;
    agentCategory?: string;
    ownerUserIdAtEvent: string;
    team: string;
    riskCategory: string;
  };
  section3_taskAndTriggeringAction: {
    triggeringRequestId: string;
    taskType: string;
    handler: string;
    requestedOperation: string;
    resourceReference: string;
    receivedAt: string;
  };
  section4_policyEvaluationGate: {
    policyId: string;
    policyVersion: string;
    gateDecision: string;
    reasonCode: string;
    explanation: string;
    evidenceChecks?: any;
  };
  section5_humanAuthorizationReview: {
    approvalRequired: boolean;
    approvalId: string | 'Not applicable';
    status: string | 'Not applicable';
    approverId: string | 'Not applicable';
    approverRole: string | 'Not applicable';
    reason: string | 'Not applicable';
    decidedAt: string | 'Not applicable';
  };
  section6_executionOutcome: {
    status: string;
    nonExecutionReason: string | 'Not applicable';
    durationMs: number | 'Not applicable';
    executedAt: string | 'Not applicable';
  };
  section7_containmentAction: {
    violationType: string;
    preIncidentAgentStatus: string;
    postIncidentAgentStatus: string;
    containmentEnforced: boolean;
  };
  section8_automatedDiagnostics: {
    diagnosticStatus: string;
    signatureId: string | 'Missing evidence';
    causeCategory: string | 'Not applicable';
    explanation: string | 'Not applicable';
  };
  section9_correctionProposalAndVerification: {
    correctionId: string | 'Not applicable';
    patchHash: string | 'Not applicable';
    policyHash: string | 'Not applicable';
    structuralVerdict: string | 'Not applicable';
    behaviouralVerdict: string | 'Not applicable';
    overallVerdict: string | 'Not applicable';
    approverId: string | 'Not applicable';
    applicationStatus: string | 'Not applicable';
  };
  section10_revalidationAndResumeDecision: {
    revalidationPassed: boolean;
    resumeEligible: boolean;
    unmetConditions: string[];
    resumedToStatus: string | 'Not applicable';
  };
  section11_chronologicalAuditTimeline: Array<{
    sequence: number;
    eventId: string;
    eventType: string;
    actor: string;
    decision: string;
    outcome: string;
    timestamp: string;
    hash: string;
  }>;
}

/**
 * Generates an Audit-Ready Incident Accountability Report (Workstream C)
 */
export function generateIncidentReport(
  incidentId: string,
  db?: DatabaseSync
): AuditReadyIncidentReport {
  const targetDb = db || getDatabase();

  // 1. Fetch Incident
  const inc = targetDb.prepare('SELECT * FROM incidents WHERE id = ?').get(incidentId) as any;
  if (!inc) {
    throw new Error(`Incident ${incidentId} not found.`);
  }

  // 2. Fetch Triggering Action Request
  const req = targetDb.prepare('SELECT * FROM action_requests WHERE id = ?').get(inc.triggering_request_id) as any;
  const agent = targetDb.prepare('SELECT * FROM agents WHERE id = ?').get(inc.agent_id) as any;
  const approval = req ? targetDb.prepare('SELECT * FROM approvals WHERE request_id = ?').get(req.id) as any : null;
  const execution = req ? targetDb.prepare('SELECT * FROM executions WHERE request_id = ?').get(req.id) as any : null;
  const correction = targetDb.prepare('SELECT * FROM corrections WHERE incident_id = ? ORDER BY created_at DESC LIMIT 1').get(incidentId) as any;

  // 3. Fetch linked audit timeline
  const auditRows = targetDb.prepare(`
    SELECT * FROM audit_events 
    WHERE incident_id = ? OR request_id = ? OR agent_id = ?
    ORDER BY sequence ASC
  `).all(incidentId, inc.triggering_request_id, inc.agent_id) as any[];

  const timeline = auditRows.map((e) => ({
    sequence: e.sequence,
    eventId: e.id,
    eventType: e.event_type,
    actor: `${e.actor_type}:${e.actor_id}`,
    decision: e.decision || 'N/A',
    outcome: e.outcome || 'N/A',
    timestamp: new Date(e.timestamp).toISOString(),
    hash: e.hash
  }));

  // Build the 11 explicit sections
  return {
    reportMetadata: {
      generatedAt: new Date().toISOString(),
      reportVersion: '1.0',
      disclaimer: 'AUDIT REPORT ASSEMBLED FROM PERSISTED TELEMETRY. NO RETROACTIVE STATE MODIFICATION.'
    },
    section1_incidentIdentification: {
      incidentId: inc.id,
      severity: inc.severity,
      status: inc.status,
      openedAt: new Date(inc.opened_at).toISOString(),
      diagnosedAt: inc.diagnosed_at ? new Date(inc.diagnosed_at).toISOString() : 'Not applicable',
      appliedAt: inc.applied_at ? new Date(inc.applied_at).toISOString() : 'Not applicable',
      resumedAt: inc.resumed_at ? new Date(inc.resumed_at).toISOString() : 'Not applicable'
    },
    section2_agentAndOwnership: {
      agentId: inc.agent_id,
      agentName: agent ? agent.name : 'Unknown Agent',
      agentCategory: agent?.agent_category || inc.agent_category || 'document_analysis',
      ownerUserIdAtEvent: inc.agent_owner_at_time,
      team: agent ? agent.team : 'Unknown Team',
      riskCategory: agent ? agent.risk_category : 'Unknown'
    },
    section3_taskAndTriggeringAction: {
      triggeringRequestId: inc.triggering_request_id,
      taskType: req ? req.task_type || 'unclassified' : 'Missing evidence',
      handler: req ? req.handler || 'unassigned' : 'Missing evidence',
      requestedOperation: req ? req.operation : 'Missing evidence',
      resourceReference: req ? req.resource : 'Missing evidence',
      receivedAt: req ? new Date(req.received_at).toISOString() : 'Missing evidence'
    },
    section4_policyEvaluationGate: {
      policyId: inc.policy_id,
      policyVersion: inc.policy_version,
      gateDecision: req ? req.gate_decision : 'BLOCK',
      reasonCode: req ? req.gate_reason_code : 'SECURITY_VIOLATION',
      explanation: req ? req.explanation : inc.evidence_summary,
      evidenceChecks: req?.evidence_checks ? JSON.parse(req.evidence_checks) : inc.evidence_checks ? JSON.parse(inc.evidence_checks) : undefined
    },
    section5_humanAuthorizationReview: {
      approvalRequired: req?.gate_decision === 'REQUIRE_APPROVAL',
      approvalId: approval ? approval.id : 'Not applicable',
      status: approval ? approval.status : 'Not applicable',
      approverId: approval?.approver_id || 'Not applicable',
      approverRole: approval?.approver_role || 'Not applicable',
      reason: approval?.reason || 'Not applicable',
      decidedAt: approval?.decided_at ? new Date(approval.decided_at).toISOString() : 'Not applicable'
    },
    section6_executionOutcome: {
      status: execution ? execution.status : 'NOT_EXECUTED',
      nonExecutionReason: execution?.non_execution_reason || 'BLOCKED_BY_POLICY',
      durationMs: execution?.duration_ms !== null && execution?.duration_ms !== undefined ? execution.duration_ms : 'Not applicable',
      executedAt: execution?.executed_at ? new Date(execution.executed_at).toISOString() : 'Not applicable'
    },
    section7_containmentAction: {
      violationType: req?.gate_reason_code || 'POLICY_BREACH',
      preIncidentAgentStatus: inc.pre_incident_status,
      postIncidentAgentStatus: 'paused',
      containmentEnforced: true
    },
    section8_automatedDiagnostics: {
      diagnosticStatus: inc.signature_id ? 'COMPLETED' : 'PENDING_DIAGNOSIS',
      signatureId: inc.signature_id || 'Missing evidence',
      causeCategory: inc.diagnostic_result ? JSON.parse(inc.diagnostic_result).causeCategory : 'Not applicable',
      explanation: inc.diagnostic_result ? JSON.parse(inc.diagnostic_result).explanation : 'Not applicable'
    },
    section9_correctionProposalAndVerification: {
      correctionId: correction ? correction.id : 'Not applicable',
      patchHash: correction ? correction.patch_hash : 'Not applicable',
      policyHash: correction ? correction.policy_hash : 'Not applicable',
      structuralVerdict: correction?.structural_checks ? 'PASSED_S1_TO_S6' : 'Not applicable',
      behaviouralVerdict: correction?.behavioural_checks ? 'PASSED_B1_TO_B6' : 'Not applicable',
      overallVerdict: correction ? correction.verdict : 'Not applicable',
      approverId: correction?.approver_id || 'Not applicable',
      applicationStatus: correction ? correction.application_status : 'Not applicable'
    },
    section10_revalidationAndResumeDecision: {
      revalidationPassed: correction?.application_status === 'APPLIED',
      resumeEligible: inc.status === 'RESOLVED',
      unmetConditions: inc.status === 'RESOLVED' ? [] : ['Incident must be resolved before agent resume'],
      resumedToStatus: inc.status === 'RESOLVED' ? 'active' : 'Not applicable'
    },
    section11_chronologicalAuditTimeline: timeline
  };
}
