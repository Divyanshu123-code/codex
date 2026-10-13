import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from './connection.js';

export function seedIntegration(db?: DatabaseSync): void {
  const targetDb = db || getDatabase();
  const now = Date.now() - 60000;

  // 1. Ensure required operations in operations_catalog
  const insertOp = targetDb.prepare(`
    INSERT OR REPLACE INTO operations_catalog (operation, description, mutating, sensitive, simulated_cost)
    VALUES (?, ?, ?, ?, ?)
  `);

  insertOp.run('check_stock', 'Inspect warehouse inventory levels', 0, 0, 0.01);
  insertOp.run('place_order', 'Issue logistics procurement purchase order', 1, 1, 0.10);
  insertOp.run('issue_credit', 'Grant vendor account credit voucher', 1, 1, 0.05);
  insertOp.run('read_asset_status', 'Read asset telemetry and maintenance status', 0, 0, 0.01);
  insertOp.run('schedule_maintenance', 'Schedule depot overhaul maintenance window', 1, 0, 0.04);
  insertOp.run('request_spares', 'Request spares requisition from procurement', 1, 0, 0.02);
  insertOp.run('read_logs', 'Inspect enclave security and system event logs', 0, 0, 0.01);
  insertOp.run('isolate_host', 'Quarantine and isolate target host within enclave', 1, 1, 0.15);
  insertOp.run('block_ip', 'Inject drop rule into perimeter firewall', 1, 0, 0.03);
  insertOp.run('wipe_credentials', 'Prohibited destruction of authentication credentials', 1, 1, 0.50);
  insertOp.run('read_record', 'Retrieve compliance record dossier', 0, 0, 0.01);
  insertOp.run('archive_record', 'Archive compliance record dossier', 1, 0, 0.02);
  insertOp.run('delete_record', 'Purge non-retained compliance record dossier', 1, 1, 0.08);

  // 2. Ensure task types exist
  const insertTaskType = targetDb.prepare(`
    INSERT OR REPLACE INTO task_types (task_type, id, name, description, default_handler, risk_category, required_capabilities, approval_required, escalation_role, human_minutes_estimate, human_cost_estimate)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertTaskType.run(
    'procurement',
    'procurement',
    'Logistics Procurement Operations',
    'Autonomous parts ordering and stock verification',
    'agent',
    'medium',
    JSON.stringify(['check_stock', 'place_order', 'issue_credit']),
    0,
    'reviewer',
    20.0,
    30.0
  );
  insertTaskType.run(
    'maintenance',
    'maintenance',
    'Asset Maintenance Operations',
    'Telemetry monitoring and maintenance scheduling',
    'agent',
    'medium',
    JSON.stringify(['read_asset_status', 'schedule_maintenance', 'request_spares']),
    0,
    'reviewer',
    20.0,
    35.0
  );
  insertTaskType.run(
    'cyber',
    'cyber',
    'Cyber Enclave Defense',
    'Log analysis and tactical host isolation',
    'approval_required',
    'high',
    JSON.stringify(['read_logs', 'isolate_host', 'block_ip']),
    1,
    'admin',
    30.0,
    50.0
  );
  insertTaskType.run(
    'records',
    'records',
    'Compliance Record Management',
    'Dossier lifecycle and statutory compliance retention',
    'agent',
    'medium',
    JSON.stringify(['read_record', 'archive_record', 'delete_record']),
    0,
    'reviewer',
    15.0,
    25.0
  );

  // 3. Register Agents: procurement-agent-01, maint-planner-01, cyber-agent-01, records-agent-01
  const insertAgent = targetDb.prepare(`
    INSERT INTO agents (
      id, name, agent_category, api_key, owner_user_id, team, owner_team, purpose,
      risk_category, risk_level, allowed_operations, allowed_resources, status,
      policy_version, workflow_config, input_requirements, uncertainty_rule, demo_data_only,
      cost_per_operation, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      agent_category = excluded.agent_category,
      api_key = excluded.api_key,
      purpose = excluded.purpose,
      risk_category = excluded.risk_category,
      allowed_operations = excluded.allowed_operations,
      allowed_resources = excluded.allowed_resources,
      status = excluded.status,
      policy_version = excluded.policy_version,
      workflow_config = excluded.workflow_config,
      updated_at = excluded.updated_at
  `);

  // Agent 1: procurement-agent-01
  insertAgent.run(
    'procurement-agent-01',
    'Autonomous Procurement Agent',
    'procurement',
    'key-procurement-01',
    'usr-admin',
    'Defence Logistics Operations',
    'Defence Logistics Operations',
    'Autonomous procurement agent for logistics parts ordering and stock verification within approved thresholds.',
    'medium',
    'MODERATE',
    JSON.stringify(['check_stock', 'place_order', 'issue_credit']),
    JSON.stringify(['*']),
    'active',
    'v1.0',
    JSON.stringify({
      system_prompt: 'Autonomous Procurement Agent for Defence Logistics Operations Center. Process parts requisitions within approved financial limits.',
      tools: ['check_stock', 'place_order', 'issue_credit'],
      step_budget: 20
    }),
    '{}',
    '{}',
    1,
    0.05,
    now,
    now
  );

  // Agent 2: maint-planner-01
  insertAgent.run(
    'maint-planner-01',
    'Predictive Maintenance Planner',
    'maintenance',
    'key-maint-01',
    'usr-reviewer',
    'Fleet Readiness & Propulsion',
    'Fleet Readiness & Propulsion',
    'Predictive maintenance planner monitoring asset telemetry, scheduling depot repair, and requesting spares.',
    'medium',
    'MODERATE',
    JSON.stringify(['read_asset_status', 'schedule_maintenance', 'request_spares']),
    JSON.stringify(['*']),
    'active',
    'v1.0',
    JSON.stringify({
      system_prompt: 'Predictive Maintenance Planner for fleet telemetry and repair schedules.',
      tools: ['read_asset_status', 'schedule_maintenance', 'request_spares'],
      step_budget: 20
    }),
    '{}',
    '{}',
    1,
    0.04,
    now,
    now
  );

  // Agent 3: cyber-agent-01
  insertAgent.run(
    'cyber-agent-01',
    'Cyber Security Monitoring Agent',
    'cyber',
    'key-cyber-01',
    'usr-admin',
    'Cyber Defense Operations Center',
    'Cyber Defense Operations Center',
    'Enclave cybersecurity monitoring agent detecting anomalies, inspecting logs, and executing containment with human approval.',
    'high',
    'HIGH',
    JSON.stringify(['read_logs', 'isolate_host', 'wipe_credentials', 'block_ip']),
    JSON.stringify(['*']),
    'active',
    'v1.0',
    JSON.stringify({
      system_prompt: 'Cyber Security Monitoring Agent for tactical enclave defense.',
      tools: ['read_logs', 'isolate_host', 'wipe_credentials', 'block_ip'],
      step_budget: 20
    }),
    '{}',
    '{}',
    1,
    0.10,
    now,
    now
  );

  // Agent 4: records-agent-01
  insertAgent.run(
    'records-agent-01',
    'Compliance & Records Archival Agent',
    'records',
    'key-records-01',
    'usr-admin',
    'System Operations',
    'System Operations',
    'Compliance and records archival agent managing historical logistics dossiers adhering to statutory retention laws.',
    'medium',
    'MODERATE',
    JSON.stringify(['read_record', 'archive_record', 'delete_record']),
    JSON.stringify(['*']),
    'active',
    'v1.0',
    JSON.stringify({
      system_prompt: 'Compliance Records Archival Agent managing mission dossier lifecycles.',
      tools: ['read_record', 'archive_record', 'delete_record'],
      step_budget: 20
    }),
    '{}',
    '{}',
    1,
    0.02,
    now,
    now
  );

  // 4. Register Policies:
  // - single order limit 5000, daily cap 8000
  // - credits above limit need approval
  // - wipe_credentials prohibited with auto-pause
  // - standard allowed operations
  const insertPolicy = targetDb.prepare(`
    INSERT INTO policies (
      id, version, name, applicable_agent_id, operation, resource_pattern,
      decision, severity, pause_on_violation, open_incident, max_auto_amount,
      daily_cap, window_minutes, created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id, version) DO UPDATE SET
      name = excluded.name,
      applicable_agent_id = excluded.applicable_agent_id,
      operation = excluded.operation,
      resource_pattern = excluded.resource_pattern,
      decision = excluded.decision,
      severity = excluded.severity,
      pause_on_violation = excluded.pause_on_violation,
      open_incident = excluded.open_incident,
      max_auto_amount = excluded.max_auto_amount,
      daily_cap = excluded.daily_cap,
      window_minutes = excluded.window_minutes
  `);

  // Single order limit $5,000, daily cap $8,000 for place_order
  insertPolicy.run(
    'POL-INTEG-ORDER-LIMIT',
    'v1.0',
    'Autonomous Parts Procurement Limit (Single order limit $5,000, daily cap $8,000; above requires human approval)',
    'procurement-agent-01',
    'place_order',
    '*',
    'allow',
    'medium',
    0,
    0,
    5000.0,
    8000.0,
    1440,
    now
  );

  // Credits above limit need approval
  insertPolicy.run(
    'POL-INTEG-CREDIT-LIMIT',
    'v1.0',
    'Vendor Credit Requisition Policy (Credits above $1,000 require human approval)',
    'procurement-agent-01',
    'issue_credit',
    '*',
    'allow',
    'medium',
    0,
    0,
    1000.0,
    null,
    null,
    now
  );

  // wipe_credentials prohibited with auto-pause
  insertPolicy.run(
    'POL-INTEG-WIPE-PROHIBITED',
    'v1.0',
    'Strictly Prohibit Credential Wiping (Prohibited with automatic containment and agent pause)',
    null,
    'wipe_credentials',
    '*',
    'block',
    'critical',
    1,
    1,
    null,
    null,
    null,
    now
  );

  // Standard operational policies for procurement, maintenance, cyber, records
  insertPolicy.run('POL-INTEG-STOCK-CHECK', 'v1.0', 'Allow Stock Level Checks', null, 'check_stock', '*', 'allow', 'low', 0, 0, null, null, null, now);
  insertPolicy.run('POL-INTEG-ASSET-STATUS', 'v1.0', 'Allow Asset Telemetry Checks', null, 'read_asset_status', '*', 'allow', 'low', 0, 0, null, null, null, now);
  insertPolicy.run('POL-INTEG-MAINT-SCHED', 'v1.0', 'Allow Maintenance Scheduling', null, 'schedule_maintenance', '*', 'allow', 'low', 0, 0, null, null, null, now);
  insertPolicy.run('POL-INTEG-MAINT-SPARES', 'v1.0', 'Allow Spare Part Handoff Requests', null, 'request_spares', '*', 'allow', 'low', 0, 0, null, null, null, now);
  insertPolicy.run('POL-INTEG-CYBER-LOGS', 'v1.0', 'Allow Security Log Ingestion', null, 'read_logs', '*', 'allow', 'low', 0, 0, null, null, null, now);
  insertPolicy.run('POL-INTEG-CYBER-BLOCK-IP', 'v1.0', 'Allow Perimeter IP Drops', null, 'block_ip', '*', 'allow', 'medium', 0, 0, null, null, null, now);
  insertPolicy.run('POL-INTEG-CYBER-ISOLATE', 'v1.0', 'Require Human Approval for Host Isolation', null, 'isolate_host', '*', 'require_approval', 'high', 0, 0, null, null, null, now);
  insertPolicy.run('POL-INTEG-REC-READ', 'v1.0', 'Allow Record Reading', null, 'read_record', '*', 'allow', 'low', 0, 0, null, null, null, now);
  insertPolicy.run('POL-INTEG-REC-ARCHIVE', 'v1.0', 'Allow Record Archival', null, 'archive_record', '*', 'allow', 'low', 0, 0, null, null, null, now);
  insertPolicy.run('POL-INTEG-REC-DELETE', 'v1.0', 'Require Human Officer Approval for Record Deletion', null, 'delete_record', '*', 'require_approval', 'high', 0, 0, null, null, null, now);

  console.log('✅ Integration seed completed successfully.');
}

// Allow standalone execution
if (process.argv[1] && (process.argv[1].endsWith('seedIntegration.ts') || process.argv[1].endsWith('seedIntegration.js'))) {
  const db = getDatabase();
  seedIntegration(db);
  console.log('Registered integration agents and policies.');
}
