import { DatabaseSync } from 'node:sqlite';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import { getDatabase } from './connection.js';
import { initializeSchema } from './schema.js';

export function seedDatabase(db?: DatabaseSync): void {
  const targetDb = db || getDatabase();
  initializeSchema(targetDb);

  // Clear existing data for clean demo reset
  targetDb.exec(`
    DELETE FROM audit_events;
    DELETE FROM corrections;
    DELETE FROM incidents;
    DELETE FROM executions;
    DELETE FROM approvals;
    DELETE FROM action_requests;
    DELETE FROM policies;
    DELETE FROM agents;
    DELETE FROM task_types;
    DELETE FROM operations_catalog;
    DELETE FROM users;
  `);

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

  // 2. Seed Operations Catalog (Section 3.6 metadata)
  const insertOp = targetDb.prepare(`
    INSERT INTO operations_catalog (operation, description, mutating, sensitive, simulated_cost)
    VALUES (?, ?, ?, ?, ?)
  `);
  insertOp.run('read_file', 'Read content of a simulated synthetic document', 0, 0, 0.01);
  insertOp.run('write_summary', 'Write a derived summary artifact', 1, 0, 0.05);
  insertOp.run('archive_file', 'Move document to long-term synthetic archive storage', 1, 0, 0.02);
  insertOp.run('export_dataset', 'Export processed synthetic documents to external share', 0, 1, 0.20);
  insertOp.run('delete_file', 'Permanently purge a synthetic document', 1, 1, 0.10);

  // 3. Seed Task Types (Section 3.6 metadata)
  const insertTask = targetDb.prepare(`
    INSERT INTO task_types (task_type, description, default_handler, escalation_role, human_minutes_estimate, human_cost_estimate)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertTask.run('document_analysis', 'Automated scanning and key-point extraction', 'agent', 'reviewer', 15.0, 25.0);
  insertTask.run('export_request', 'Bulk transmission of sensitive datasets', 'human', 'admin', 30.0, 50.0);
  insertTask.run('cleanup_routine', 'Post-processing artifact cleanup and hygiene', 'agent', 'reviewer', 10.0, 15.0);

  // 4. Seed Policies (Versioned, FR-2)
  const insertPolicy = targetDb.prepare(`
    INSERT INTO policies (id, version, name, applicable_agent_id, operation, resource_pattern, decision, severity, pause_on_violation, open_incident, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertPolicy.run('POL-DOC-READ', 'v1.0', 'Allow Document Reads in Scope', 'doc-agent-01', 'read_file', 'synthetic://documents/*', 'allow', 'low', 0, 0, now);
  insertPolicy.run('POL-DOC-WRITE', 'v1.0', 'Allow Summary Creation', 'doc-agent-01', 'write_summary', 'synthetic://reports/*', 'allow', 'low', 0, 0, now);
  insertPolicy.run('POL-DOC-ARCHIVE', 'v1.0', 'Allow Document Archival', 'doc-agent-01', 'archive_file', 'synthetic://archive/*', 'allow', 'low', 0, 0, now);
  insertPolicy.run('POL-DOC-EXPORT', 'v1.0', 'Require Approval for External Export', 'doc-agent-01', 'export_dataset', 'synthetic://*', 'require_approval', 'medium', 0, 0, now);
  insertPolicy.run('POL-DOC-DELETE', 'v1.0', 'Strictly Prohibit File Deletion', null, 'delete_file', '*', 'block', 'high', 1, 1, now);

  // 5. Seed Agent (FR-1, Section 3.4 status model & Section 4.4 faulty workflow)
  const faultyWorkflow = [
    { step_id: 'step_1', operation: 'read_file', resource: 'synthetic://documents/defense_intel_brief_2026.txt', params: {} },
    { step_id: 'step_2', operation: 'write_summary', resource: 'synthetic://reports/summary_intel_2026.txt', params: { format: 'markdown' } },
    { step_id: 'step_3', operation: 'delete_file', resource: 'synthetic://documents/defense_intel_brief_2026.txt', params: {} } // Prohibited step causing violation
  ];

  const insertAgent = targetDb.prepare(`
    INSERT INTO agents (id, name, api_key, owner_user_id, team, purpose, risk_category, allowed_operations, allowed_resources, status, policy_version, workflow_config, cost_per_operation, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertAgent.run(
    'doc-agent-01',
    'Defense Intel Document Parser',
    'agnt_live_doc_agent_key_01',
    'usr-admin',
    'Intel Governance Taskforce',
    'Autonomous ingestion, analysis, and briefing preparation of synthetic intelligence documents',
    'low',
    JSON.stringify(['read_file', 'write_summary', 'archive_file']),
    JSON.stringify(['synthetic://documents/*', 'synthetic://reports/*', 'synthetic://archive/*']),
    'active',
    'v1.0',
    JSON.stringify(faultyWorkflow),
    0.05,
    now,
    now
  );

  // 6. Seed Genesis Audit Event
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
    JSON.stringify({ status: 'clean_seed_applied', agents_count: 1, policies_count: 5 }),
    null,
    genesisHash,
    now
  );

  console.log('✅ Seed completed successfully with synthetic defense agent, policies, and users.');
}

if (process.argv[1] && process.argv[1].endsWith('seed.ts')) {
  seedDatabase();
}
