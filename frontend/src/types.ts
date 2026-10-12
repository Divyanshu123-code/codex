export type Tab = 
  | 'overview' 
  | 'agents' 
  | 'policies' 
  | 'approvals' 
  | 'incidents' 
  | 'corrections' 
  | 'tasks' 
  | 'audit'
  | 'backups';

export interface ScenarioBackup {
  id: string;
  correlation_id: string;
  request_id: string;
  agent_id: string;
  agent_category?: string;
  policy_id: string;
  policy_version?: string;
  policy_hash?: string;
  operation: string;
  amount?: number | null;
  policy_limit?: number | null;
  actor?: string | null;
  parameters_snapshot: Record<string, any>;
  evidence_checks?: Record<string, any> | null;
  decision: 'ALLOW' | 'REQUIRE_APPROVAL' | 'BLOCK';
  reason_code: string;
  approval_id?: string | null;
  human_decision?: {
    approverId?: string;
    decision?: string;
    reason?: string;
    decidedAt?: number;
  } | null;
  execution_status?: string | null;
  snapshot_hash: string;
  correction_status: 'NONE' | 'REOPENED' | 'CORRECTED';
  reopens_approval_id?: string | null;
  created_at: number;
  restored_at?: number | null;
}

export interface AgentBackup {
  id: string;
  agent_id: string;
  trigger_event: string;
  actor: {
    id: string;
    role: string;
  };
  reason: string;
  snapshot_json: Record<string, any>;
  snapshot_hash: string;
  created_at: number;
  restored_at?: number | null;
}


export interface Agent {
  id: string;
  name: string;
  agent_category?: string;
  api_key?: string;
  owner_user_id?: string;
  team?: string;
  owner_team?: string;
  purpose?: string;
  risk_category?: string;
  risk_level?: string;
  allowed_operations: string[];
  allowed_resources: string[];
  status: 'active' | 'restricted' | 'paused';
  policy_version?: string;
  input_requirements?: Record<string, any>;
  uncertainty_rule?: Record<string, any>;
  workflow_config?: Array<{
    step_id: string;
    operation: string;
    resource: string;
    params?: Record<string, any>;
  }>;
  demo_data_only?: number | boolean;
}

export interface Policy {
  id: string;
  version: string;
  name: string;
  applicable_agent_id?: string;
  operation: string;
  resource_pattern: string;
  decision: 'allow' | 'require_approval' | 'block';
  severity: 'low' | 'medium' | 'high' | 'critical';
  pause_on_violation: number | boolean;
  open_incident: number | boolean;
  created_at: number;
}

export interface Approval {
  id: string;
  request_id: string;
  approver_id?: string | null;
  approver_role?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reason?: string | null;
  requested_at: number;
  decided_at?: number | null;
  sla_deadline?: number | null;
  agent_id: string;
  agent_category?: string;
  tool: string;
  operation: string;
  resource: string;
  parameters: string | Record<string, any>;
  gate_decision: 'ALLOW' | 'REQUIRE_APPROVAL' | 'BLOCK';
  gate_reason_code?: string;
  evidence_checks?: string | Record<string, any>;
  request_explanation?: string;
  execution_status?: string;
  non_execution_reason?: string;
  reopened_from_id?: string | null;
}

export interface Incident {
  id: string;
  agent_id: string;
  policy_id: string;
  action_attempted: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'OPEN' | 'CONTAINED' | 'RESOLVED' | 'CLOSED';
  containment_action: string;
  occurred_at: number;
  resolved_at?: number | null;
  agent_category?: string;
  evidence_checks?: string | Record<string, any>;
}

export interface Correction {
  id: string;
  incident_id: string;
  agent_id: string;
  proposed_patch: string | Record<string, any>;
  status: 'PENDING' | 'SANDBOX_VERIFIED' | 'APPROVED' | 'APPLIED' | 'REJECTED';
  created_at: number;
  reviewed_at?: number | null;
  reviewer_id?: string | null;
  verification_results?: string | Record<string, any>;
}

export interface DebugAttempt {
  attemptNumber?: number;
  attempt_number?: number;
  source: 'anthropic_api' | 'deterministic_fallback' | 'catalog_deterministic' | 'catalog_template' | 'llm_generation' | string;
  promptHash?: string;
  responseHash?: string;
  prompt_hash?: string;
  response_hash?: string;
  patchProposal?: any;
  proposed_patch?: any;
  rationale?: string;
  remediation_summary?: string;
  verdict?: 'PASS' | 'FAIL' | 'INCONCLUSIVE';
  validator_verdict?: 'PASS' | 'FAIL';
  structuralChecks?: any[];
  structural_checks?: any[];
  behaviouralChecks?: any[];
  behavioural_checks?: any[];
  diffGuardPassed?: boolean;
  diff_guard_passed?: boolean;
  failureReasons?: string[];
  failure_reasons?: string[];
  durationMs?: number;
  created_at?: number;
}

export interface DebugRunResult {
  runId?: string;
  run_id?: string;
  incidentId?: string;
  incident_id?: string;
  status: 'VERIFIED_READY_FOR_APPROVAL' | 'ESCALATED_TO_HUMAN';
  signatureId?: string;
  signature_id?: string;
  attemptsCount?: number;
  attempts_count?: number;
  attempts: DebugAttempt[];
  finalCorrectionId?: string | null;
  final_correction_id?: string | null;
  escalationReason?: string | null;
  escalation_reason?: string | null;
  proposalSummary?: string | null;
  proposal_summary?: string | null;
  createdAt?: number;
  completedAt?: number;
  created_at?: number;
  completed_at?: number;
}

export interface Task {
  id: string;
  type_id: string;
  title: string;
  description?: string;
  assigned_agent_id?: string;
  status: 'SUBMITTED' | 'QUEUED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'ESCALATED' | 'BLOCKED';
  priority?: 'P1' | 'P2' | 'P3' | 'P4';
  created_at: number;
  updated_at?: number;
  result?: string | Record<string, any>;
}

export interface AuditEvent {
  id: string;
  sequence: number;
  timestamp: number;
  event_type: string;
  actor_id: string;
  actor_role: string;
  action: string;
  resource: string;
  decision?: string;
  reason?: string;
  previous_hash: string;
  event_hash: string;
  metadata?: string | Record<string, any>;
}

export interface DashboardData {
  timeWindow: {
    from: string;
    to: string;
  };
  risk: {
    totalAgents: number;
    activeAgents: number;
    restrictedAgents: number;
    pausedAgents: number;
    agentsByCategory?: Record<string, number>;
    totalViolations: number;
    openIncidents: {
      total: number;
      bySeverity: {
        critical: number;
        high: number;
        medium: number;
        low: number;
      };
    };
    meanTimeToContainMs: number;
    meanTimeToRecoverMs: number;
  };
  usage: {
    tasksReceived: number;
    tasksByHandler: Record<string, number>;
    requestsByOperation: Record<string, number>;
    requestsByCategory?: Record<string, number>;
    executionOutcomes: {
      succeeded: number;
      failed: number;
      notExecuted: number;
    };
  };
  humanIntervention: {
    approvals: {
      pending: number;
      approved: number;
      rejected: number;
    };
    escalatedTasksCount: number;
    pauseEventsCount: number;
    recoveryAttemptsCount: number;
    humanDecisionsOverturned?: number;
    reopenRequests?: number;
    reinstatements?: number;
    cumulativeLimitBreaches?: number;
  };
  costAndValueEstimates?: {
    disclaimer: string;
    assumptions: Record<string, any>;
    estimatedOperatingCostUsd: number;
    estimatedLaborValueCreatedUsd: number;
    netSyntheticValueUsd: number;
  };
}
