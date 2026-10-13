import { DatabaseSync } from 'node:sqlite';

export function initializeSchema(db: DatabaseSync): void {
  db.exec(`
    -- Users table for human authorization (Admin, Reviewer, Auditor)
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'reviewer', 'auditor')),
      created_at INTEGER NOT NULL
    );

    -- Operations catalog (Section 3.6 metadata)
    CREATE TABLE IF NOT EXISTS operations_catalog (
      operation TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      mutating INTEGER NOT NULL DEFAULT 0,
      sensitive INTEGER NOT NULL DEFAULT 0,
      simulated_cost REAL NOT NULL DEFAULT 0.0
    );

    -- Task types (Workstream A & Section 3.6 metadata)
    CREATE TABLE IF NOT EXISTS task_types (
      task_type TEXT PRIMARY KEY,
      id TEXT,
      name TEXT NOT NULL,
      description TEXT NOT NULL,
      default_handler TEXT NOT NULL CHECK(default_handler IN ('agent', 'human', 'approval_required')),
      risk_category TEXT NOT NULL CHECK(risk_category IN ('low', 'medium', 'high', 'critical')),
      required_capabilities TEXT NOT NULL, -- JSON array
      approval_required INTEGER NOT NULL DEFAULT 0,
      escalation_role TEXT NOT NULL,
      human_minutes_estimate REAL NOT NULL DEFAULT 0.0,
      human_cost_estimate REAL NOT NULL DEFAULT 0.0
    );

    -- Tasks queue & allocation (Workstream A)
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      task_type TEXT NOT NULL,
      description TEXT NOT NULL,
      payload TEXT NOT NULL,                -- JSON
      handler TEXT NOT NULL CHECK(handler IN ('agent', 'human', 'escalated', 'blocked')),
      handler_reason TEXT NOT NULL,
      assigned_agent_id TEXT,
      risk_category TEXT NOT NULL CHECK(risk_category IN ('low', 'medium', 'high', 'critical')),
      status TEXT NOT NULL CHECK(status IN ('QUEUED', 'IN_PROGRESS', 'COMPLETED', 'ESCALATED', 'BLOCKED')),
      escalation_target_role TEXT,
      escalated_at INTEGER,
      escalation_reason TEXT,
      correlation_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      completed_at INTEGER
    );

    -- Agents table (FR-1, Section 3.4 & Defence Domain Adaptation)
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      agent_category TEXT NOT NULL DEFAULT 'document_analysis',
      api_key TEXT UNIQUE NOT NULL,
      owner_user_id TEXT NOT NULL,
      team TEXT NOT NULL,
      owner_team TEXT,
      purpose TEXT NOT NULL,
      risk_category TEXT NOT NULL CHECK(risk_category IN ('low', 'medium', 'high', 'critical')),
      risk_level TEXT,
      allowed_operations TEXT NOT NULL, -- JSON array
      allowed_resources TEXT NOT NULL,  -- JSON array
      permitted_data_scopes TEXT DEFAULT '["UNCLASSIFIED//EXERCISE", "RESTRICTED//EXERCISE"]', -- JSON array
      status TEXT NOT NULL CHECK(status IN ('active', 'restricted', 'paused')),
      policy_version TEXT NOT NULL,
      workflow_config TEXT NOT NULL,     -- JSON array of workflow steps
      input_requirements TEXT NOT NULL DEFAULT '{}', -- JSON validation profile
      uncertainty_rule TEXT NOT NULL DEFAULT '{}',   -- JSON uncertainty rule
      demo_data_only INTEGER NOT NULL DEFAULT 1,      -- 1 for synthetic demo data
      cost_per_operation REAL NOT NULL DEFAULT 0.0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    -- Versioned Policies table (FR-2)
    CREATE TABLE IF NOT EXISTS policies (
      id TEXT NOT NULL,
      version TEXT NOT NULL,
      name TEXT NOT NULL,
      applicable_agent_id TEXT, -- NULL means applicable to all
      operation TEXT NOT NULL,
      resource_pattern TEXT NOT NULL,
      decision TEXT NOT NULL CHECK(decision IN ('allow', 'require_approval', 'block')),
      severity TEXT NOT NULL CHECK(severity IN ('low', 'medium', 'high', 'critical')),
      pause_on_violation INTEGER NOT NULL DEFAULT 0,
      open_incident INTEGER NOT NULL DEFAULT 0,
      max_auto_amount REAL,
      daily_cap REAL,
      window_minutes INTEGER,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (id, version)
    );

    -- Action Requests table (FR-3, FR-5, Section 3.2, 3.6 & Defence Quality Evidence)
    CREATE TABLE IF NOT EXISTS action_requests (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      agent_category TEXT,
      tool TEXT NOT NULL,
      operation TEXT NOT NULL,
      resource TEXT NOT NULL,
      parameters TEXT NOT NULL,           -- JSON
      evidence_checks TEXT,               -- JSON quality/uncertainty/conflict evidence
      task_type TEXT,
      handler TEXT CHECK(handler IN ('agent', 'human', 'escalated', 'blocked')),
      handler_reason TEXT,
      resource_sensitivity TEXT,
      correlation_id TEXT NOT NULL,
      gate_decision TEXT NOT NULL CHECK(gate_decision IN ('ALLOW', 'REQUIRE_APPROVAL', 'BLOCK')),
      gate_reason_code TEXT NOT NULL,
      policy_id TEXT,
      policy_version TEXT,
      explanation TEXT NOT NULL,
      received_at INTEGER NOT NULL,
      gated_at INTEGER NOT NULL,
      approval_requested_at INTEGER,
      approval_decided_at INTEGER,
      execution_started_at INTEGER,
      execution_finished_at INTEGER,
      escalated_at INTEGER,
      escalation_target_role TEXT
    );

    -- Human Approvals table (FR-9, Section 3.2 & Two-Person Integrity)
    CREATE TABLE IF NOT EXISTS approvals (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      approver_id TEXT,
      approver_role TEXT,
      first_approver_id TEXT,
      requires_two_person_integrity INTEGER NOT NULL DEFAULT 0,
      reopened_from_id TEXT,
      status TEXT NOT NULL CHECK(status IN ('PENDING', 'PENDING_SECOND_APPROVAL', 'APPROVED', 'REJECTED', 'EXPIRED')),
      reason TEXT,
      requested_at INTEGER NOT NULL,
      opened_at INTEGER,
      decided_at INTEGER,
      sla_deadline INTEGER
    );

    -- Tool Executions table (FR-5 & Section 3.2)
    CREATE TABLE IF NOT EXISTS executions (
      id TEXT PRIMARY KEY,
      request_id TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('NOT_STARTED', 'EXECUTING', 'SUCCEEDED', 'FAILED', 'NOT_EXECUTED')),
      non_execution_reason TEXT,
      duration_ms INTEGER,
      simulated_cost REAL DEFAULT 0.0,
      result_reference TEXT,              -- JSON safe summary
      created_at INTEGER NOT NULL,
      executed_at INTEGER
    );

    -- Incidents table (FR-6, Section 3.5, 3.6 & Defence Evidence)
    CREATE TABLE IF NOT EXISTS incidents (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      agent_category TEXT,
      triggering_request_id TEXT NOT NULL,
      severity TEXT NOT NULL CHECK(severity IN ('low', 'medium', 'high', 'critical')),
      policy_id TEXT NOT NULL,
      policy_version TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('OPEN', 'DIAGNOSED', 'RESOLVED')),
      pre_incident_status TEXT NOT NULL,
      evidence_summary TEXT NOT NULL,
      evidence_checks TEXT,               -- JSON
      signature_id TEXT,
      diagnostic_result TEXT,             -- JSON
      opened_at INTEGER NOT NULL,
      diagnosed_at INTEGER,
      correction_proposed_at INTEGER,
      correction_approved_at INTEGER,
      applied_at INTEGER,
      resumed_at INTEGER,
      agent_owner_at_time TEXT NOT NULL
    );

    -- Corrections table (FR-8 & Section 3.3)
    CREATE TABLE IF NOT EXISTS corrections (
      id TEXT PRIMARY KEY,
      incident_id TEXT NOT NULL,
      proposer_type TEXT NOT NULL CHECK(proposer_type IN ('system', 'human')),
      proposer_id TEXT NOT NULL,
      description TEXT NOT NULL,
      patch TEXT NOT NULL,                -- JSON patch
      patch_hash TEXT NOT NULL,
      policy_hash TEXT NOT NULL,
      structural_checks TEXT,             -- JSON results of S1-S6
      behavioural_checks TEXT,            -- JSON results of B1-B6
      verdict TEXT NOT NULL CHECK(verdict IN ('PASS', 'FAIL', 'INCONCLUSIVE')),
      approval_status TEXT NOT NULL CHECK(approval_status IN ('PENDING', 'APPROVED', 'REJECTED')),
      application_status TEXT NOT NULL CHECK(application_status IN ('NOT_APPLIED', 'APPLYING', 'APPLIED', 'FAILED')),
      approver_id TEXT,
      approval_reason TEXT,
      created_at INTEGER NOT NULL,
      applied_at INTEGER
    );

    -- Append-only Audit Trail table (FR-10 & Section 3.6)
    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      sequence INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      actor_type TEXT NOT NULL CHECK(actor_type IN ('system', 'human', 'agent')),
      actor_id TEXT NOT NULL,
      agent_id TEXT,
      agent_owner_at_time TEXT,
      policy_id TEXT,
      policy_version TEXT,
      resource_reference TEXT,
      decision TEXT,
      outcome TEXT,
      request_id TEXT,
      incident_id TEXT,
      correction_id TEXT,
      safe_details TEXT,                  -- JSON safe summary (never raw secrets)
      prev_hash TEXT,
      hash TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );

    -- Scenario Backups table (Policy-threat snapshots & admin error recovery, Section 6b/6c)
    CREATE TABLE IF NOT EXISTS scenario_backups (
      id TEXT PRIMARY KEY,
      correlation_id TEXT NOT NULL,
      request_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      agent_category TEXT,
      policy_id TEXT,
      policy_version TEXT,
      policy_hash TEXT,
      operation TEXT NOT NULL,
      amount REAL,
      policy_limit REAL,
      actor TEXT,
      parameters_snapshot TEXT NOT NULL,  -- JSON
      evidence_checks TEXT,               -- JSON
      decision TEXT NOT NULL,
      reason_code TEXT NOT NULL,
      approval_id TEXT,
      human_decision TEXT,                -- JSON once decided (actor, role, reason, decided_at)
      execution_status TEXT NOT NULL DEFAULT 'NOT_EXECUTED',
      snapshot_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      restored_at INTEGER,
      reopens_approval_id TEXT,
      correction_status TEXT NOT NULL DEFAULT 'NONE' CHECK(correction_status IN ('NONE', 'REOPENED', 'CORRECTED'))
    );

    -- Agent Snapshots table (State-change snapshots before terminate/pause, Section 6b)
    CREATE TABLE IF NOT EXISTS backups (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      trigger_event TEXT NOT NULL,
      actor TEXT NOT NULL,                -- JSON { id, role }
      reason TEXT NOT NULL,
      snapshot_json TEXT NOT NULL,        -- JSON full agent config & policies
      snapshot_hash TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      restored_at INTEGER
    );

    -- Closed-Loop Debug Agent Runs table (Debug Agent v2)
    CREATE TABLE IF NOT EXISTS debug_runs (
      id TEXT PRIMARY KEY,
      incident_id TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('VERIFIED_READY_FOR_APPROVAL', 'ESCALATED_TO_HUMAN', 'RUNNING')),
      signature_id TEXT,
      attempts_count INTEGER NOT NULL DEFAULT 0,
      attempts_json TEXT NOT NULL,        -- JSON array of attempts
      final_correction_id TEXT,
      escalation_reason TEXT,
      proposal_summary TEXT,
      created_at INTEGER NOT NULL,
      completed_at INTEGER
    );

    -- Single-use governance authorization tokens for host runtime execution
    CREATE TABLE IF NOT EXISTS governance_tokens (
      request_id TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      nonce TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    -- Ed25519 single-use integration tokens
    CREATE TABLE IF NOT EXISTS integration_tokens (
      request_id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      token TEXT NOT NULL,
      nonce TEXT UNIQUE NOT NULL,
      params_hash TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      is_used INTEGER NOT NULL DEFAULT 0,
      used_at INTEGER,
      created_at INTEGER NOT NULL
    );

    -- Indexes for performance & quick timeline querying
    CREATE INDEX IF NOT EXISTS idx_audit_agent ON audit_events(agent_id);
    CREATE INDEX IF NOT EXISTS idx_audit_request ON audit_events(request_id);
    CREATE INDEX IF NOT EXISTS idx_audit_incident ON audit_events(incident_id);
    CREATE INDEX IF NOT EXISTS idx_action_agent ON action_requests(agent_id);
    CREATE INDEX IF NOT EXISTS idx_incidents_agent ON incidents(agent_id);
    CREATE INDEX IF NOT EXISTS idx_approvals_status ON approvals(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_handler ON tasks(handler);
    CREATE INDEX IF NOT EXISTS idx_scenario_backups_agent ON scenario_backups(agent_id);
    CREATE INDEX IF NOT EXISTS idx_scenario_backups_req ON scenario_backups(request_id);
    CREATE INDEX IF NOT EXISTS idx_backups_agent ON backups(agent_id);
    CREATE INDEX IF NOT EXISTS idx_debug_runs_incident ON debug_runs(incident_id);
  `);

  // Safe incremental migration for existing databases on disk
  const migrations = [
    `CREATE TABLE IF NOT EXISTS governance_tokens (
      request_id TEXT PRIMARY KEY,
      token TEXT NOT NULL,
      nonce TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )`,
    `ALTER TABLE agents ADD COLUMN agent_category TEXT NOT NULL DEFAULT 'document_analysis'`,
    `ALTER TABLE agents ADD COLUMN owner_team TEXT`,
    `ALTER TABLE agents ADD COLUMN risk_level TEXT`,
    `ALTER TABLE agents ADD COLUMN input_requirements TEXT NOT NULL DEFAULT '{}'`,
    `ALTER TABLE agents ADD COLUMN uncertainty_rule TEXT NOT NULL DEFAULT '{}'`,
    `ALTER TABLE agents ADD COLUMN demo_data_only INTEGER NOT NULL DEFAULT 1`,
    `ALTER TABLE task_types ADD COLUMN id TEXT`,
    `ALTER TABLE task_types ADD COLUMN name TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE task_types ADD COLUMN risk_category TEXT NOT NULL DEFAULT 'low'`,
    `ALTER TABLE task_types ADD COLUMN required_capabilities TEXT NOT NULL DEFAULT '[]'`,
    `ALTER TABLE task_types ADD COLUMN approval_required INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE action_requests ADD COLUMN agent_category TEXT`,
    `ALTER TABLE action_requests ADD COLUMN evidence_checks TEXT`,
    `ALTER TABLE incidents ADD COLUMN agent_category TEXT`,
    `ALTER TABLE incidents ADD COLUMN evidence_checks TEXT`,
    `ALTER TABLE policies ADD COLUMN max_auto_amount REAL`,
    `ALTER TABLE policies ADD COLUMN daily_cap REAL`,
    `ALTER TABLE policies ADD COLUMN window_minutes INTEGER`,
    `ALTER TABLE approvals ADD COLUMN reopened_from_id TEXT`,
    `ALTER TABLE scenario_backups ADD COLUMN policy_limit REAL`,
    `ALTER TABLE scenario_backups ADD COLUMN actor TEXT`
  ];

  for (const sql of migrations) {
    try {
      db.exec(sql);
    } catch {
      // Column already exists - ignore
    }
  }
}
