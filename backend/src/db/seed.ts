import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { getDatabase } from './connection.js';
import { initializeSchema } from './schema.js';

export function seedDatabase(db?: DatabaseSync): void {
  const targetDb = db || getDatabase();
  
  // Cleanly drop tables if they exist to apply latest constraints and types
  targetDb.exec(`
    DROP TABLE IF EXISTS audit_events;
    DROP TABLE IF EXISTS corrections;
    DROP TABLE IF EXISTS incidents;
    DROP TABLE IF EXISTS executions;
    DROP TABLE IF EXISTS approvals;
    DROP TABLE IF EXISTS action_requests;
    DROP TABLE IF EXISTS policies;
    DROP TABLE IF EXISTS agents;
    DROP TABLE IF EXISTS tasks;
    DROP TABLE IF EXISTS task_types;
    DROP TABLE IF EXISTS operations_catalog;
    DROP TABLE IF EXISTS users;
  `);

  initializeSchema(targetDb);

  const passwordHash = bcrypt.hashSync('password123', 8);
  const now = Date.now();

  // 1. Seed Users
  const insertUser = targetDb.prepare(`
    INSERT INTO users (id, username, password_hash, role, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  insertUser.run('usr-admin', 'admin', passwordHash, 'admin', now);
  insertUser.run('usr-reviewer', 'reviewer', passwordHash, 'reviewer', now);
  insertUser.run('usr-auditor', 'auditor', passwordHash, 'auditor', now);
  insertUser.run('usr-researcher', 'researcher', passwordHash, 'auditor', now);

  // 2. Seed Operations Catalog
  const insertOp = targetDb.prepare(`
    INSERT INTO operations_catalog (operation, description, mutating, sensitive, simulated_cost)
    VALUES (?, ?, ?, ?, ?)
  `);
  insertOp.run('read_file', 'Read content of a simulated synthetic document', 0, 0, 0.01);
  insertOp.run('write_summary', 'Write a derived summary artifact', 1, 0, 0.05);
  insertOp.run('archive_file', 'Move document to long-term synthetic archive storage', 1, 0, 0.02);
  insertOp.run('export_dataset', 'Export processed synthetic documents to external share', 0, 1, 0.20);
  insertOp.run('delete_file', 'Permanently purge a synthetic document', 1, 1, 0.10);
  insertOp.run('read_telemetry', 'Read equipment sensor readings (vibration, temperature, pressure)', 0, 0, 0.01);
  insertOp.run('create_maintenance_ticket', 'Generate scheduled maintenance ticket for equipment', 1, 0, 0.04);
  insertOp.run('read_security_logs', 'Read boundary enclave network flow and anomaly logs', 0, 0, 0.01);
  insertOp.run('isolate_host', 'Quarantine and isolate target host within enclave', 1, 1, 0.15);
  insertOp.run('block_ip', 'Inject drop rule into perimeter firewall', 1, 0, 0.03);
  insertOp.run('read_recon_report', 'Read reconnaissance intelligence reports', 0, 0, 0.01);
  insertOp.run('propose_tactical_recommendation', 'Formulate tactical recommendation for human commander review', 0, 1, 0.08);
  insertOp.run('wipe_credentials', 'Prohibited destruction of authentication credentials', 1, 1, 0.50);
  insertOp.run('purge_security_logs', 'Prohibited deletion of boundary security event logs', 1, 1, 0.50);

  // 3. Seed Task Types
  const insertTaskType = targetDb.prepare(`
    INSERT INTO task_types (task_type, id, name, description, default_handler, risk_category, required_capabilities, approval_required, escalation_role, human_minutes_estimate, human_cost_estimate)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertTaskType.run(
    'document_analysis',
    'document_analysis',
    'Automated Document Ingestion & Summary',
    'Automated scanning and key-point extraction of synthetic intelligence briefs',
    'agent',
    'low',
    JSON.stringify(['read_file', 'write_summary']),
    0,
    'reviewer',
    15.0,
    25.0
  );
  insertTaskType.run(
    'document_summary',
    'document_summary',
    'Synthetic Document Summarization',
    'Agent synthesis of documents with markdown briefs',
    'agent',
    'low',
    JSON.stringify(['read_file', 'write_summary']),
    0,
    'reviewer',
    30.0,
    50.0
  );
  insertTaskType.run(
    'export_request',
    'export_request',
    'Bulk Intelligence Dataset Export',
    'Transmission of processed intelligence to external partner networks',
    'approval_required',
    'medium',
    JSON.stringify(['read_file', 'export_dataset']),
    1,
    'reviewer',
    30.0,
    50.0
  );
  insertTaskType.run(
    'dataset_export',
    'dataset_export',
    'Sensitive Dataset Export',
    'Export requiring dual-custody approval before execution',
    'approval_required',
    'medium',
    JSON.stringify(['read_file', 'export_dataset']),
    1,
    'reviewer',
    30.0,
    50.0
  );
  insertTaskType.run(
    'manual_security_audit',
    'manual_security_audit',
    'Human-Only Classified Audit Review',
    'Mandatory manual scrutiny of access logs and credential posture',
    'human',
    'high',
    JSON.stringify([]),
    1,
    'admin',
    45.0,
    75.0
  );
  insertTaskType.run(
    'vendor_audit',
    'vendor_audit',
    'Vendor Compliance Clearance',
    'Human-in-the-loop manual compliance audit and vendor verification',
    'human',
    'medium',
    JSON.stringify([]),
    1,
    'reviewer',
    30.0,
    50.0
  );
  insertTaskType.run(
    'file_purge',
    'file_purge',
    'Document Deletion & Purging',
    'Permanent destruction of synthetic files',
    'human',
    'critical',
    JSON.stringify(['delete_file']),
    1,
    'admin',
    20.0,
    35.0
  );
  insertTaskType.run(
    'predictive_maintenance',
    'predictive_maintenance',
    'Predictive Equipment Telemetry Monitoring',
    'Ingestion and health assessment of synthetic turbine and power unit telemetry',
    'agent',
    'medium',
    JSON.stringify(['read_telemetry', 'create_maintenance_ticket']),
    0,
    'reviewer',
    20.0,
    35.0
  );
  insertTaskType.run(
    'cybersecurity_containment',
    'cybersecurity_containment',
    'Boundary Enclave Intrusion Containment',
    'Analysis of boundary network anomalies and isolation of compromised assets',
    'approval_required',
    'high',
    JSON.stringify(['read_security_logs', 'isolate_host', 'block_ip']),
    1,
    'admin',
    35.0,
    60.0
  );
  insertTaskType.run(
    'tactical_decision_support',
    'tactical_decision_support',
    'Multi-Source Reconnaissance Synthesis',
    'Correlation of multi-sensor reconnaissance data for human commander recommendation',
    'approval_required',
    'high',
    JSON.stringify(['read_recon_report', 'propose_tactical_recommendation']),
    1,
    'reviewer',
    40.0,
    70.0
  );

  // 4. Seed Policies
  const insertPolicy = targetDb.prepare(`
    INSERT INTO policies (id, version, name, applicable_agent_id, operation, resource_pattern, decision, severity, pause_on_violation, open_incident, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertPolicy.run('POL-DOC-READ', 'v1.0', 'Allow Document Reads in Scope', 'doc-agent-01', 'read_file', 'synthetic://documents/*', 'allow', 'low', 0, 0, now);
  insertPolicy.run('POL-DOC-WRITE', 'v1.0', 'Allow Summary Creation', 'doc-agent-01', 'write_summary', 'synthetic://reports/*', 'allow', 'low', 0, 0, now);
  insertPolicy.run('POL-DOC-ARCHIVE', 'v1.0', 'Allow Document Archival', 'doc-agent-01', 'archive_file', 'synthetic://archive/*', 'allow', 'low', 0, 0, now);
  insertPolicy.run('POL-DOC-EXPORT', 'v1.0', 'Require Approval for External Export', 'doc-agent-01', 'export_dataset', 'synthetic://documents/*', 'require_approval', 'medium', 0, 0, now);
  insertPolicy.run('POL-DOC-DELETE', 'v1.0', 'Strictly Prohibit File Deletion', null, 'delete_file', '*', 'block', 'high', 1, 1, now);
  
  // Defence Domain Policies
  insertPolicy.run('POL-MAINT-READ', 'v1.0', 'Allow Telemetry Reading', 'agent-pred-maint-01', 'read_telemetry', 'synthetic://telemetry/*', 'allow', 'low', 0, 0, now);
  insertPolicy.run('POL-MAINT-TICKET', 'v1.0', 'Allow Scheduled Maintenance Advisories', 'agent-pred-maint-01', 'create_maintenance_ticket', 'synthetic://maintenance/*', 'allow', 'medium', 0, 0, now);
  insertPolicy.run('POL-CYBER-READ', 'v1.0', 'Allow Network Log Ingestion', 'agent-cyber-monitor-02', 'read_security_logs', 'synthetic://network-logs/*', 'allow', 'low', 0, 0, now);
  insertPolicy.run('POL-CYBER-REPORT', 'v1.0', 'Allow Incident Summary Writing', 'agent-cyber-monitor-02', 'write_summary', 'synthetic://reports/*', 'allow', 'low', 0, 0, now);
  insertPolicy.run('POL-CYBER-ISOLATE', 'v1.0', 'Require Human Approval for Host Isolation', 'agent-cyber-monitor-02', 'isolate_host', 'synthetic://enclaves/*', 'require_approval', 'high', 0, 0, now);
  insertPolicy.run('POL-CYBER-BLOCK-IP', 'v1.0', 'Allow Bounded Perimeter Firewall IP Drops', 'agent-cyber-monitor-02', 'block_ip', 'synthetic://enclaves/*', 'allow', 'medium', 0, 0, now);
  insertPolicy.run('POL-CYBER-PROHIBIT-WIPE', 'v1.0', 'Strictly Prohibit Credential Destruction', null, 'wipe_credentials', '*', 'block', 'critical', 1, 1, now);
  insertPolicy.run('POL-CYBER-PROHIBIT-PURGE', 'v1.0', 'Strictly Prohibit Security Log Purge', null, 'purge_security_logs', '*', 'block', 'critical', 1, 1, now);
  insertPolicy.run('POL-RECON-READ', 'v1.0', 'Allow Reconnaissance Report Reads', 'agent-decision-support-03', 'read_recon_report', 'synthetic://recon/*', 'allow', 'low', 0, 0, now);
  insertPolicy.run('POL-RECON-RECOMMEND', 'v1.0', 'Require Commander Approval for Tactical Recommendations', 'agent-decision-support-03', 'propose_tactical_recommendation', 'synthetic://briefings/*', 'require_approval', 'high', 0, 0, now);

  // 5. Seed Agents
  const faultyWorkflow = [
    { step_id: 'step_1', operation: 'read_file', resource: 'synthetic://documents/defense_intel_brief_2026.txt', params: {} },
    { step_id: 'step_2', operation: 'write_summary', resource: 'synthetic://reports/summary_intel_2026.txt', params: { format: 'markdown' } },
    { step_id: 'step_3', operation: 'delete_file', resource: 'synthetic://documents/defense_intel_brief_2026.txt', params: {} }
  ];

  const cyberWorkflow = [
    { step_id: 'step_1', operation: 'read_security_logs', resource: 'synthetic://network-logs/enclave_perimeter', params: {} },
    { step_id: 'step_2', operation: 'write_summary', resource: 'synthetic://reports/incident_containment_summary.txt', params: {} },
    { step_id: 'step_3', operation: 'wipe_credentials', resource: 'synthetic://enclaves/perimeter_firewall', params: {} }
  ];

  const insertAgent = targetDb.prepare(`
    INSERT INTO agents (
      id, name, agent_category, api_key, owner_user_id, team, owner_team, purpose,
      risk_category, risk_level, allowed_operations, allowed_resources, status,
      policy_version, workflow_config, input_requirements, uncertainty_rule, demo_data_only,
      cost_per_operation, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Baseline Demo Agent (Maintained for backward compatibility and rehearsal)
  insertAgent.run(
    'doc-agent-01',
    'Defense Intel Document Parser',
    'document_analysis',
    'agnt_live_doc_agent_key_01',
    'usr-admin',
    'Intel Governance Taskforce',
    'Intel Governance Taskforce',
    'Autonomous ingestion, analysis, and briefing preparation of synthetic intelligence documents',
    'low',
    'low',
    JSON.stringify(['read_file', 'write_summary', 'archive_file', 'export_dataset']),
    JSON.stringify(['synthetic://documents/*', 'synthetic://reports/*', 'synthetic://archive/*']),
    'active',
    'v1.0',
    JSON.stringify(faultyWorkflow),
    '{}',
    '{}',
    1,
    0.05,
    now,
    now
  );

  insertAgent.run(
    'data-exporter-99',
    'Bulk Intelligence Exporter',
    'document_analysis',
    'agnt_live_exporter_key_99',
    'usr-researcher',
    'Joint Analysis Division',
    'Joint Analysis Division',
    'Packaging and transmission of cleared intelligence briefs',
    'medium',
    'medium',
    JSON.stringify(['read_file', 'export_dataset']),
    JSON.stringify(['synthetic://documents/*']),
    'restricted',
    'v1.0',
    JSON.stringify([]),
    '{}',
    '{}',
    1,
    0.20,
    now - 7200000,
    now
  );

  insertAgent.run(
    'ops-worker-02',
    'Synthetic Archive Janitor',
    'document_analysis',
    'agnt_live_ops_worker_key_02',
    'usr-admin',
    'System Operations',
    'System Operations',
    'Lifecycle management and simulated cache pruning',
    'high',
    'high',
    JSON.stringify(['read_file', 'archive_file']),
    JSON.stringify(['synthetic://archive/*']),
    'paused',
    'v1.0',
    JSON.stringify([]),
    '{}',
    '{}',
    1,
    0.02,
    now - 14400000,
    now - 3600000
  );

  // Defence Agent A: Predictive Maintenance Agent
  insertAgent.run(
    'agent-pred-maint-01',
    'Predictive Maintenance Agent (Turbine Propulsion)',
    'predictive_maintenance',
    'agnt_live_pred_maint_01',
    'usr-reviewer',
    'Fleet Readiness & Propulsion',
    'Fleet Readiness & Propulsion',
    'Reviews synthetic propulsion equipment telemetry to predict mechanical degradation and issue scheduled maintenance advisories.',
    'medium',
    'medium',
    JSON.stringify(['read_telemetry', 'create_maintenance_ticket', 'archive_file']),
    JSON.stringify(['synthetic://telemetry/*', 'synthetic://maintenance/*', 'synthetic://archive/*']),
    'active',
    'v1.0',
    JSON.stringify([]),
    JSON.stringify({
      required_fields: ['equipment_id', 'timestamp', 'vibration_rms', 'bearing_temp_c'],
      freshness_max_age_seconds: 300,
      ranges: {
        vibration_rms: { min: 0, max: 15 },
        bearing_temp_c: { min: -20, max: 180 }
      }
    }),
    JSON.stringify({
      metric: 'model_confidence',
      minimum_threshold: 0.85,
      on_below_threshold: 'REQUIRE_APPROVAL',
      reason: 'CONFIDENCE_BELOW_THRESHOLD_REQUIRES_HUMAN'
    }),
    1,
    0.04,
    now,
    now
  );

  // Defence Agent B: Cybersecurity Monitoring Agent
  insertAgent.run(
    'agent-cyber-monitor-02',
    'Cybersecurity Monitoring Agent (Enclave Defense)',
    'cybersecurity_monitoring',
    'agnt_live_cyber_monitor_02',
    'usr-admin',
    'Cyber Defense Operations Center',
    'Cyber Defense Operations Center',
    'Analyzes synthetic boundary network flow logs, detects unauthorized protocol anomalies, and executes bounded containment.',
    'high',
    'high',
    JSON.stringify(['read_security_logs', 'isolate_host', 'block_ip', 'write_summary']),
    JSON.stringify(['synthetic://network-logs/*', 'synthetic://enclaves/*', 'synthetic://reports/*']),
    'active',
    'v1.0',
    JSON.stringify(cyberWorkflow),
    JSON.stringify({
      required_fields: ['event_id', 'timestamp', 'source_ip', 'threat_signature'],
      freshness_max_age_seconds: 600
    }),
    JSON.stringify({
      metric: 'threat_confidence',
      minimum_threshold: 0.90,
      on_below_threshold: 'REQUIRE_APPROVAL',
      reason: 'CYBER_THREAT_CONFIDENCE_BORDERLINE_REQUIRES_ANALYST'
    }),
    1,
    0.10,
    now,
    now
  );

  // Defence Agent C: Decision Support Agent
  insertAgent.run(
    'agent-decision-support-03',
    'Tactical Reconnaissance Decision Support Agent',
    'decision_support',
    'agnt_live_decision_support_03',
    'usr-researcher',
    'Joint Tactical Operations',
    'Joint Tactical Operations',
    'Synthesizes multi-source synthetic reconnaissance reports, correlates geospatial observations, and prepares briefing recommendations for human commanders.',
    'high',
    'high',
    JSON.stringify(['read_recon_report', 'propose_tactical_recommendation', 'write_summary']),
    JSON.stringify(['synthetic://recon/*', 'synthetic://briefings/*', 'synthetic://reports/*']),
    'active',
    'v1.0',
    JSON.stringify([]),
    JSON.stringify({
      required_fields: ['report_id', 'source_id', 'timestamp', 'coordinates', 'observation'],
      freshness_max_age_seconds: 1800,
      conflict_detection: true
    }),
    JSON.stringify({
      metric: 'provenance_reliability',
      minimum_threshold: 0.80,
      on_below_threshold: 'REQUIRE_APPROVAL',
      reason: 'SOURCE_RELIABILITY_LOW_REQUIRES_COMMANDER_REVIEW'
    }),
    1,
    0.08,
    now,
    now
  );

  // 6. Seed Baseline Incident inc-demo-001 (Workstream C & Demo)
  targetDb.prepare(`
    INSERT INTO action_requests (
      id, agent_id, tool, operation, resource, parameters,
      task_type, handler, handler_reason, resource_sensitivity, correlation_id,
      gate_decision, gate_reason_code, policy_id, policy_version, explanation,
      received_at, gated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'req-demo-violation-01',
    'data-exporter-99',
    'file_purger',
    'delete_file',
    'synthetic://documents/defense_intel_brief_2026.txt',
    '{}',
    'file_purge',
    'blocked',
    'Operation delete_file is strictly blocked by POL-DOC-DELETE',
    'top_secret',
    'corr-demo-inc-01',
    'BLOCK',
    'POLICY_RULE_VIOLATION',
    'POL-DOC-DELETE',
    'v1.0',
    'Prohibited destructive operation on protected synthetic intelligence document',
    now - 7200000,
    now - 7200000
  );

  targetDb.prepare(`
    INSERT INTO executions (id, request_id, status, non_execution_reason, created_at)
    VALUES (?, ?, 'NOT_EXECUTED', 'BLOCKED_BY_POLICY', ?)
  `).run('exec-demo-01', 'req-demo-violation-01', now - 7200000);

  targetDb.prepare(`
    INSERT INTO incidents (
      id, agent_id, triggering_request_id, severity, policy_id, policy_version,
      status, pre_incident_status, evidence_summary, signature_id, diagnostic_result, opened_at, agent_owner_at_time
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    'inc-demo-001',
    'data-exporter-99',
    'req-demo-violation-01',
    'critical',
    'POL-DOC-DELETE',
    'v1.0',
    'OPEN',
    'active',
    'Prohibited delete_file attempted on protected synthetic intelligence document.',
    'SIG-001',
    JSON.stringify({
      causeCategory: 'WORKFLOW_MISCONFIGURATION',
      explanation: 'Workflow step requested unauthorized delete_file tool operation',
      recommendedAction: 'Sanitize workflow steps to remove file deletion'
    }),
    now - 7200000,
    'usr-researcher'
  );

  // 7. Seed Sample Initial Tasks (Workstream A)
  const insertTask = targetDb.prepare(`
    INSERT INTO tasks (id, title, task_type, description, payload, handler, handler_reason, assigned_agent_id, risk_category, status, correlation_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertTask.run(
    'task-sample-01',
    'Ingest Weekly Regional Satellite Report',
    'document_analysis',
    'Process synthetic document briefing for Eastern command',
    JSON.stringify({ resource: 'synthetic://documents/defense_intel_brief_2026.txt' }),
    'agent',
    'Task matches allowed document_analysis capabilities for doc-agent-01',
    'doc-agent-01',
    'low',
    'QUEUED',
    'corr-sample-01',
    now - 3600000
  );
  insertTask.run(
    'task-sample-02',
    'Manual Cryptographic Access Review',
    'manual_security_audit',
    'Quarterly human review of credential posture',
    JSON.stringify({ auditScope: 'Level 4 Security Matrix' }),
    'human',
    'High-risk task restricted to human queue by task type policy',
    null,
    'high',
    'QUEUED',
    'corr-sample-02',
    now - 1800000
  );
  insertTask.run(
    'task-sample-03',
    'Cross-Agency Strategic Threat Assessment',
    'document_summary',
    'Escalated synthetic assessment requiring intelligence lead signoff',
    JSON.stringify({ classification: 'Inter-Agency' }),
    'escalated',
    'Escalated to lead analyst due to inter-agency security protocols',
    'doc-agent-01',
    'high',
    'ESCALATED',
    'corr-sample-03',
    now - 900000
  );

  // 8. Seed Genesis Audit Event
  const genesisHash = crypto.createHash('sha256').update('GENESIS_EVENT_' + now).digest('hex');
  const insertAudit = targetDb.prepare(`
    INSERT INTO audit_events (id, sequence, event_type, actor_type, actor_id, agent_id, agent_owner_at_time, policy_id, policy_version, resource_reference, decision, outcome, request_id, incident_id, correction_id, safe_details, prev_hash, hash, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertAudit.run(
    'evt-genesis-0001',
    1,
    'SYSTEM_INITIALIZED',
    'system',
    'system',
    'doc-agent-01',
    'usr-admin',
    null,
    'v1.0',
    'system://environment',
    'ALLOW',
    'SUCCESS',
    null,
    null,
    null,
    JSON.stringify({ status: 'clean_seed_applied', agents_count: 3, policies_count: 5 }),
    null,
    genesisHash,
    now - 7300000
  );

  const incidentEventHash = crypto.createHash('sha256').update(genesisHash + 'VIOLATION_CONTAINED' + now).digest('hex');
  insertAudit.run(
    'evt-inc-demo-001',
    2,
    'VIOLATION_CONTAINED',
    'system',
    'governance-gateway',
    'data-exporter-99',
    'usr-researcher',
    'POL-DOC-DELETE',
    'v1.0',
    'synthetic://documents/defense_intel_brief_2026.txt',
    'BLOCK',
    'BLOCKED_NO_SIDE_EFFECTS',
    'req-demo-violation-01',
    'inc-demo-001',
    null,
    JSON.stringify({ reasonCode: 'POLICY_RULE_VIOLATION', incidentOpened: true }),
    genesisHash,
    incidentEventHash,
    now - 7200000
  );
}

if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  seedDatabase();
}
