import { describe, it, expect, beforeEach } from 'vitest';
import { getDatabase } from '../src/db/connection.js';
import { seedDatabase } from '../src/db/seed.js';
import { routeAction } from '../src/engine/gateway.js';
import { decideApproval } from '../src/engine/approval.js';
import { generateIncidentReport } from '../src/engine/incidentReport.js';
import { getSyntheticStorageState } from '../src/tools/protectedTools.js';
import { diagnoseIncident } from '../src/engine/diagnostics.js';
import { testCorrection } from '../src/engine/sandbox.js';
import { approveCorrection, applyCorrection, resumeAgent, evaluateResumeEligibility } from '../src/engine/resumeGate.js';

describe('AegisOS Defence Adaptation: Domain Scenarios & Verification', () => {
  let db: any;

  beforeEach(() => {
    db = getDatabase(':memory:');
    seedDatabase(db);
  });

  it('Scenario 1: Permitted maintenance recommendation with valid, current telemetry executes cleanly', () => {
    const validTelemetry = {
      equipment_id: 'turbine_unit_4',
      timestamp: Date.now(),
      vibration_rms: 4.2,
      bearing_temp_c: 72.5,
      model_confidence: 0.94
    };

    const res = routeAction(
      {
        agent_id: 'agent-pred-maint-01',
        tool: 'maintenance_scheduler',
        operation: 'create_maintenance_ticket',
        resource: 'synthetic://maintenance/scheduled_tickets',
        parameters: {
          equipment_id: 'turbine_unit_4',
          urgency: 'SCHEDULED_ROUTINE',
          recommendation: 'Inspect bearing lubrication and vibration dampener',
          telemetry: validTelemetry,
          model_confidence: 0.94
        }
      },
      { type: 'agent', id: 'agent-pred-maint-01' },
      db
    );

    expect(res.gateDecision).toBe('ALLOW');
    expect(res.gateReasonCode).toBe('POLICY_DECISION_ALLOW');
    expect(res.executionStatus).toBe('SUCCEEDED');
    expect(res.result.status).toBe('TICKET_CREATED_IN_SYNTHETIC_LOG');
    expect(res.evidenceChecks.valid).toBe(true);
    expect(res.evidenceChecks.freshnessResult.isFresh).toBe(true);

    // Verify audit event written with checks
    const auditEvent = db.prepare("SELECT * FROM audit_events WHERE request_id = ? AND event_type = 'GATE_DECIDED'").get(res.requestId) as any;
    expect(auditEvent).toBeDefined();
    expect(auditEvent.decision).toBe('ALLOW');
  });

  it('Scenario 2A: Missing required telemetry fields blocks request before tool invocation', () => {
    const incompleteTelemetry = {
      equipment_id: 'turbine_unit_4',
      timestamp: Date.now(),
      vibration_rms: 4.2
      // bearing_temp_c is missing
    };

    const stateBefore = getSyntheticStorageState();

    const res = routeAction(
      {
        agent_id: 'agent-pred-maint-01',
        tool: 'maintenance_scheduler',
        operation: 'create_maintenance_ticket',
        resource: 'synthetic://maintenance/scheduled_tickets',
        parameters: {
          equipment_id: 'turbine_unit_4',
          telemetry: incompleteTelemetry
        }
      },
      { type: 'agent', id: 'agent-pred-maint-01' },
      db
    );

    expect(res.gateDecision).toBe('BLOCK');
    expect(res.gateReasonCode).toBe('MISSING_REQUIRED_INPUT_FIELDS');
    expect(res.executionStatus).toBe('NOT_EXECUTED');
    expect(res.evidenceChecks.missingFields).toContain('bearing_temp_c');

    // Zero side effects invariant
    const stateAfter = getSyntheticStorageState();
    expect(Object.keys(stateAfter.maintenanceTickets).length).toBe(Object.keys(stateBefore.maintenanceTickets).length);
  });

  it('Scenario 2B: Stale equipment telemetry holds recommendation in approval queue for human review', () => {
    const staleTimestamp = Date.now() - 400000; // 400s old (configured max is 300s)
    const staleTelemetry = {
      equipment_id: 'turbine_unit_4',
      timestamp: staleTimestamp,
      vibration_rms: 4.2,
      bearing_temp_c: 72.5,
      model_confidence: 0.92
    };

    const res = routeAction(
      {
        agent_id: 'agent-pred-maint-01',
        tool: 'maintenance_scheduler',
        operation: 'create_maintenance_ticket',
        resource: 'synthetic://maintenance/scheduled_tickets',
        parameters: {
          equipment_id: 'turbine_unit_4',
          telemetry: staleTelemetry,
          model_confidence: 0.92
        }
      },
      { type: 'agent', id: 'agent-pred-maint-01' },
      db
    );

    expect(res.gateDecision).toBe('REQUIRE_APPROVAL');
    expect(res.gateReasonCode).toBe('STALE_TELEMETRY_HELD_FOR_HUMAN');
    expect(res.executionStatus).toBe('NOT_EXECUTED');
    expect(res.approvalStatus).toBe('PENDING');
    expect(res.evidenceChecks.freshnessResult.isFresh).toBe(false);

    // Verify approval row created with pending status
    const appr = db.prepare('SELECT * FROM approvals WHERE request_id = ?').get(res.requestId) as any;
    expect(appr).toBeDefined();
    expect(appr.status).toBe('PENDING');
  });

  it('Scenario 2C: Out-of-bounds telemetry values fail range validation and are blocked', () => {
    const outOfBoundsTelemetry = {
      equipment_id: 'turbine_unit_4',
      timestamp: Date.now(),
      vibration_rms: 28.5, // Permitted max is 15
      bearing_temp_c: 72.5,
      model_confidence: 0.90
    };

    const res = routeAction(
      {
        agent_id: 'agent-pred-maint-01',
        tool: 'maintenance_scheduler',
        operation: 'create_maintenance_ticket',
        resource: 'synthetic://maintenance/scheduled_tickets',
        parameters: {
          equipment_id: 'turbine_unit_4',
          telemetry: outOfBoundsTelemetry,
          model_confidence: 0.90
        }
      },
      { type: 'agent', id: 'agent-pred-maint-01' },
      db
    );

    expect(res.gateDecision).toBe('BLOCK');
    expect(res.gateReasonCode).toBe('INPUT_VALUES_OUT_OF_RANGE');
    expect(res.executionStatus).toBe('NOT_EXECUTED');
    expect(res.evidenceChecks.rangeViolations.length).toBeGreaterThan(0);
    expect(res.evidenceChecks.rangeViolations[0].field).toBe('vibration_rms');
  });

  it('Scenario 3: Prohibited cybersecurity action (wipe_credentials) is strictly blocked, agent paused, incident opened', () => {
    const stateBefore = getSyntheticStorageState();

    const res = routeAction(
      {
        agent_id: 'agent-cyber-monitor-02',
        tool: 'firewall_purger',
        operation: 'wipe_credentials',
        resource: 'synthetic://enclaves/perimeter_firewall',
        parameters: { target: 'all_admin_keys' }
      },
      { type: 'agent', id: 'agent-cyber-monitor-02' },
      db
    );

    expect(res.gateDecision).toBe('BLOCK');
    expect(['OPERATION_NOT_ALLOWED', 'POLICY_DECISION_BLOCK']).toContain(res.gateReasonCode);
    expect(res.executionStatus).toBe('NOT_EXECUTED');

    // Invariant: Target resource untouched
    const stateAfter = getSyntheticStorageState();
    expect(stateAfter.enclaves).toEqual(stateBefore.enclaves);

    // Invariant: Agent paused and incident opened
    const agentRow = db.prepare('SELECT status FROM agents WHERE id = ?').get('agent-cyber-monitor-02') as any;
    expect(agentRow.status).toBe('paused');

    const incident = db.prepare('SELECT * FROM incidents WHERE agent_id = ?').get('agent-cyber-monitor-02') as any;
    expect(incident).toBeDefined();
    expect(incident.status).toBe('OPEN');
    expect(['high', 'critical']).toContain(incident.severity);

    // Subsequent actions blocked while agent is paused
    const subsequentRes = routeAction(
      {
        agent_id: 'agent-cyber-monitor-02',
        tool: 'network_logger',
        operation: 'read_security_logs',
        resource: 'synthetic://network-logs/enclave_perimeter'
      },
      { type: 'agent', id: 'agent-cyber-monitor-02' },
      db
    );
    expect(subsequentRes.gateDecision).toBe('BLOCK');
    expect(subsequentRes.gateReasonCode).toBe('AGENT_PAUSED');
  });

  it('Scenario 4: Conflicting reconnaissance reports detected and held for human commander resolution', () => {
    const conflictingSources = [
      {
        source_id: 'UAV-SURV-1',
        report_id: 'REP-ALPHA-01',
        timestamp: Date.now() - 300000,
        coordinates: '34.2N, 45.1E',
        observation: 'Target Alpha Bridge intact; primary transit open'
      },
      {
        source_id: 'SAT-PASS-2',
        report_id: 'REP-BRAVO-02',
        timestamp: Date.now() - 200000,
        coordinates: '34.2N, 45.1E',
        observation: 'Target Alpha Bridge destroyed; impassable'
      }
    ];

    const res = routeAction(
      {
        agent_id: 'agent-decision-support-03',
        tool: 'tactical_briefing',
        operation: 'propose_tactical_recommendation',
        resource: 'synthetic://briefings/tactical_update_01',
        parameters: {
          multi_source_reports: conflictingSources,
          provenance_reliability: 0.88,
          recommendation: 'Proceed across Target Alpha Bridge'
        }
      },
      { type: 'agent', id: 'agent-decision-support-03' },
      db
    );

    expect(res.gateDecision).toBe('REQUIRE_APPROVAL');
    expect(res.gateReasonCode).toBe('CONFLICTING_EVIDENCE_HELD_FOR_HUMAN');
    expect(res.executionStatus).toBe('NOT_EXECUTED');
    expect(res.approvalStatus).toBe('PENDING');
    expect(res.evidenceChecks.conflictsDetected.length).toBeGreaterThan(0);

    // Human commander reviews and makes decision
    const appr = db.prepare('SELECT * FROM approvals WHERE request_id = ?').get(res.requestId) as any;
    const dec = decideApproval(
      appr.id,
      'REJECTED',
      { id: 'usr-reviewer', role: 'reviewer' },
      'Rejected: contradictory reconnaissance evidence requires ground verification before transit authorization',
      db
    );
    expect(dec.approvalStatus).toBe('REJECTED');
    expect(dec.executionStatus).toBe('NOT_EXECUTED');
  });

  it('Uncertainty evaluation: Missing uncertainty metadata is NOT fabricated and triggers hold', () => {
    const res = routeAction(
      {
        agent_id: 'agent-cyber-monitor-02',
        tool: 'firewall_manager',
        operation: 'block_ip',
        resource: 'synthetic://enclaves/perimeter_firewall',
        parameters: {
          event_id: 'EVT-CYBER-99',
          timestamp: Date.now(),
          source_ip: '198.51.100.99',
          threat_signature: 'PORT_SCAN'
          // threat_confidence omitted
        }
      },
      { type: 'agent', id: 'agent-cyber-monitor-02' },
      db
    );

    expect(res.gateDecision).toBe('REQUIRE_APPROVAL');
    expect(res.gateReasonCode).toBe('MISSING_MANDATORY_UNCERTAINTY_METADATA');
    expect(res.evidenceChecks.uncertaintyResult.passed).toBe(false);
    expect(res.evidenceChecks.uncertaintyResult.details).toContain('refused to fabricate');
  });

  it('Uncertainty evaluation: Low confidence score triggers human analyst hold', () => {
    const res = routeAction(
      {
        agent_id: 'agent-cyber-monitor-02',
        tool: 'firewall_manager',
        operation: 'block_ip',
        resource: 'synthetic://enclaves/perimeter_firewall',
        parameters: {
          event_id: 'EVT-CYBER-101',
          timestamp: Date.now(),
          source_ip: '198.51.100.101',
          threat_signature: 'SUSPICIOUS_HEURISTIC',
          threat_confidence: 0.74 // Below configured threshold 0.90
        }
      },
      { type: 'agent', id: 'agent-cyber-monitor-02' },
      db
    );

    expect(res.gateDecision).toBe('REQUIRE_APPROVAL');
    expect(res.gateReasonCode).toBe('CYBER_THREAT_CONFIDENCE_BORDERLINE_REQUIRES_ANALYST');
    expect(res.evidenceChecks.uncertaintyResult.passed).toBe(false);
    expect(res.evidenceChecks.uncertaintyResult.suppliedValue).toBe(0.74);
  });

  it('Policy Prohibition Invariant: Approval can NEVER override an explicit policy block', () => {
    // Prohibited operation delete_file
    const res = routeAction(
      {
        agent_id: 'agent-pred-maint-01',
        tool: 'purger',
        operation: 'delete_file',
        resource: 'synthetic://maintenance/records'
      },
      { type: 'agent', id: 'agent-pred-maint-01' },
      db
    );

    expect(res.gateDecision).toBe('BLOCK');
    // Verify NO approval row was created
    const appr = db.prepare('SELECT * FROM approvals WHERE request_id = ?').get(res.requestId);
    expect(appr).toBeUndefined();
  });

  it('Incident Report generates Section 2 agentCategory and Section 4 evidenceChecks', () => {
    // Trigger violation on cyber agent
    const res = routeAction(
      {
        agent_id: 'agent-cyber-monitor-02',
        tool: 'firewall_purger',
        operation: 'wipe_credentials',
        resource: 'synthetic://enclaves/perimeter_firewall'
      },
      { type: 'agent', id: 'agent-cyber-monitor-02' },
      db
    );

    const incident = db.prepare('SELECT id FROM incidents WHERE triggering_request_id = ?').get(res.requestId) as any;
    expect(incident).toBeDefined();

    const report = generateIncidentReport(incident.id, db);
    expect(report.section1_incidentIdentification.incidentId).toBe(incident.id);
    expect(report.section2_agentAndOwnership.agentCategory).toBe('cybersecurity_monitoring');
    expect(report.section2_agentAndOwnership.agentName).toContain('Cybersecurity Monitoring');
    expect(report.section4_policyEvaluationGate.gateDecision).toBe('BLOCK');
  });

  it('Scenario 4 (Human Review Approval): Written justification authorizes held recommendation and completes execution', () => {
    // Submit conflicting recon reports that get held for review
    const res = routeAction(
      {
        agent_id: 'agent-decision-support-03',
        tool: 'tactical_briefing',
        operation: 'propose_tactical_recommendation',
        resource: 'synthetic://briefings/tactical_update_01',
        parameters: {
          multi_source_reports: [
            { source_id: 'UAV-SURV-1', report_id: 'REP-ALPHA-01', timestamp: Date.now() - 300000, coordinates: '34.2N, 45.1E', observation: 'Target Alpha Bridge intact; primary transit open' },
            { source_id: 'SAT-PASS-2', report_id: 'REP-BRAVO-02', timestamp: Date.now() - 200000, coordinates: '34.2N, 45.1E', observation: 'Target Alpha Bridge destroyed; impassable' }
          ],
          provenance_reliability: 0.88,
          recommendation: 'Proceed across Target Alpha Bridge'
        }
      },
      { type: 'agent', id: 'agent-decision-support-03' },
      db
    );

    expect(res.gateDecision).toBe('REQUIRE_APPROVAL');
    expect(res.executionStatus).toBe('NOT_EXECUTED');

    // Fetch the pending approval
    const appr = db.prepare('SELECT * FROM approvals WHERE request_id = ?').get(res.requestId) as any;
    expect(appr).toBeDefined();
    expect(appr.status).toBe('PENDING');

    // Lead intelligence officer decides APPROVED with mandatory justification
    const decisionRes = decideApproval(
      appr.id,
      'APPROVED',
      { id: 'usr-reviewer', role: 'reviewer' },
      'Authorized reconnaissance patrol specifically to resolve contradiction between radar and visual feeds',
      db
    );

    expect(decisionRes.approvalStatus).toBe('APPROVED');
    expect(decisionRes.executionStatus).toBe('SUCCEEDED');
    expect(decisionRes.result.status).toBe('RECOMMENDATION_PUBLISHED');

    // Verify approval record updated in DB
    const apprDb = db.prepare('SELECT * FROM approvals WHERE id = ?').get(appr.id) as any;
    expect(apprDb.status).toBe('APPROVED');
    expect(apprDb.approver_id).toBe('usr-reviewer');
    expect(apprDb.reason).toContain('Authorized reconnaissance patrol');

    // Verify audit log has APPROVAL_DECIDED event
    const auditEvt = db.prepare("SELECT * FROM audit_events WHERE request_id = ? AND event_type = 'APPROVAL_DECIDED'").get(res.requestId) as any;
    expect(auditEvt).toBeDefined();
    expect(auditEvt.decision).toBe('APPROVED');
  });

  it('Scenario 5: Full recovery lifecycle for paused defence agent via Bounded Diagnostics, Sandbox, and Central Resume Gate', () => {
    // 1. Prohibited action causes violation on cyber agent
    const routeRes = routeAction(
      {
        agent_id: 'agent-cyber-monitor-02',
        tool: 'firewall_purger',
        operation: 'wipe_credentials',
        resource: 'synthetic://enclaves/perimeter_firewall'
      },
      { type: 'agent', id: 'agent-cyber-monitor-02' },
      db
    );

    expect(routeRes.gateDecision).toBe('BLOCK');

    // Verify agent is paused and incident is OPEN
    const agentBefore = db.prepare('SELECT status FROM agents WHERE id = ?').get('agent-cyber-monitor-02') as any;
    expect(agentBefore.status).toBe('paused');

    const incident = db.prepare("SELECT * FROM incidents WHERE agent_id = ? AND status = 'OPEN'").get('agent-cyber-monitor-02') as any;
    expect(incident).toBeDefined();

    // 2. Automated diagnostics identifies disallowed operation signature
    const diag = diagnoseIncident(incident.id, db);
    expect(diag.status).toBe('DIAGNOSED');
    expect(diag.signatureId).toBe('SIG-DISALLOWED-OP');

    // 3. Diff Guard catches an unsafe patch trying to add wipe_credentials to permitted operations
    const unsafePatch = {
      action: 'grant_permission',
      allowed_operations: ['read_security_logs', 'isolate_host', 'block_ip', 'wipe_credentials'],
      description: 'Attempt to bypass boundary by granting wipe_credentials'
    };
    const badRes = testCorrection(incident.id, unsafePatch, { type: 'human', id: 'usr-admin' }, db);
    expect(badRes.verdict).toBe('FAIL');

    // Attempting to resume while failing correction exists must fail
    const prematureResume = resumeAgent('agent-cyber-monitor-02', { role: 'admin', id: 'usr-admin' }, 'Premature resume', db);
    expect(prematureResume.success).toBe(false);

    // 4. Safe workflow sanitization patch replacing wipe_credentials with allowed isolate_host
    const safePatch = diag.proposedCorrection || {
      action: 'replace_step_operation',
      target_step_id: 'step_1',
      new_operation: 'isolate_host',
      new_resource: 'synthetic://defense/enclave/dmz/host-primary',
      description: 'Sanitized patch replacing prohibited wipe with bounded network isolation'
    };
    const safeRes = testCorrection(incident.id, safePatch, { type: 'system', id: 'diagnostics-engine' }, db);
    expect(safeRes.verdict).toBe('PASS');
    expect(safeRes.structuralChecks.every((c) => c.passed)).toBe(true);
    expect(safeRes.behaviouralChecks.every((c) => c.passed)).toBe(true);

    // 5. Reviewer approves safe correction
    approveCorrection(safeRes.correctionId, { id: 'usr-reviewer', role: 'reviewer' }, 'Verified in sandbox with zero policy widening', db);

    // 6. Apply patch
    applyCorrection(safeRes.correctionId, db);

    // 7. Central Resume Gate validates R1-R9 and resumes agent
    const eligibility = evaluateResumeEligibility('agent-cyber-monitor-02', { role: 'admin', id: 'usr-admin' }, 'Incident resolved with verified sandbox patch', db);
    expect(eligibility.eligible).toBe(true);

    const resumeRes = resumeAgent('agent-cyber-monitor-02', { role: 'admin', id: 'usr-admin' }, 'Incident resolved with verified sandbox patch', db);
    expect(resumeRes.success).toBe(true);
    expect(resumeRes.status).toBe('active');

    // 8. Agent is ACTIVE and subsequent permitted operation succeeds
    const agentAfter = db.prepare('SELECT status FROM agents WHERE id = ?').get('agent-cyber-monitor-02') as any;
    expect(agentAfter.status).toBe('active');

    const nextAction = routeAction(
      {
        agent_id: 'agent-cyber-monitor-02',
        tool: 'security_inspector',
        operation: 'read_security_logs',
        resource: 'synthetic://network-logs/enclave_perimeter',
        parameters: {
          event_id: 'EVT-9021',
          timestamp: Date.now(),
          source_ip: '198.51.100.42',
          threat_signature: 'SYN_FLOOD_ANOMALY',
          threat_confidence: 0.95
        }
      },
      { type: 'agent', id: 'agent-cyber-monitor-02' },
      db
    );
    expect(nextAction.gateDecision).toBe('ALLOW');
    expect(nextAction.executionStatus).toBe('SUCCEEDED');
  });
});
