import { describe, it, expect } from 'vitest';
import {
  evaluatePolicy,
  AgentRecord,
  ActionInput,
  PolicyRecord,
  OperationCatalogRecord
} from '../src/engine/evaluator.js';

describe('Phase 2: Deterministic Policy Evaluator & Status Invariants', () => {
  const baseAgent: AgentRecord = {
    id: 'doc-agent-01',
    name: 'Defense Document Agent',
    status: 'active',
    allowed_operations: ['read_file', 'write_summary', 'export_dataset'],
    allowed_resources: ['synthetic://documents/*', 'synthetic://reports/*'],
    policy_version: 'v1.0'
  };

  const policies: PolicyRecord[] = [
    {
      id: 'POL-READ',
      version: 'v1.0',
      name: 'Allow Read Documents',
      applicable_agent_id: 'doc-agent-01',
      operation: 'read_file',
      resource_pattern: 'synthetic://documents/*',
      decision: 'allow',
      severity: 'low',
      pause_on_violation: 0,
      open_incident: 0
    },
    {
      id: 'POL-WRITE',
      version: 'v1.0',
      name: 'Allow Write Summary',
      applicable_agent_id: 'doc-agent-01',
      operation: 'write_summary',
      resource_pattern: 'synthetic://reports/*',
      decision: 'allow',
      severity: 'low',
      pause_on_violation: 0,
      open_incident: 0
    },
    {
      id: 'POL-EXPORT',
      version: 'v1.0',
      name: 'Require Approval for Export',
      applicable_agent_id: 'doc-agent-01',
      operation: 'export_dataset',
      resource_pattern: 'synthetic://documents/*',
      decision: 'require_approval',
      severity: 'medium',
      pause_on_violation: 0,
      open_incident: 0
    },
    {
      id: 'POL-DELETE',
      version: 'v1.0',
      name: 'Block File Deletion',
      applicable_agent_id: null,
      operation: 'delete_file',
      resource_pattern: '*',
      decision: 'block',
      severity: 'high',
      pause_on_violation: 1,
      open_incident: 1
    }
  ];

  const catalog = new Map<string, OperationCatalogRecord>([
    ['read_file', { operation: 'read_file', mutating: 0, sensitive: 0, simulated_cost: 0.01 }],
    ['write_summary', { operation: 'write_summary', mutating: 1, sensitive: 0, simulated_cost: 0.05 }],
    ['export_dataset', { operation: 'export_dataset', mutating: 0, sensitive: 1, simulated_cost: 0.20 }],
    ['delete_file', { operation: 'delete_file', mutating: 1, sensitive: 1, simulated_cost: 0.10 }]
  ]);

  it('ALLOW: Permitted read action succeeds with policy reference', () => {
    const action: ActionInput = {
      agent_id: 'doc-agent-01',
      tool: 'file_reader',
      operation: 'read_file',
      resource: 'synthetic://documents/brief_2026.txt'
    };

    const result = evaluatePolicy(baseAgent, action, policies, catalog);
    expect(result.decision).toBe('ALLOW');
    expect(result.policyId).toBe('POL-READ');
    expect(result.severity).toBe('low');
  });

  it('REQUIRE_APPROVAL: Sensitive export action requires approval', () => {
    const action: ActionInput = {
      agent_id: 'doc-agent-01',
      tool: 'exporter',
      operation: 'export_dataset',
      resource: 'synthetic://documents/brief_2026.txt'
    };

    const result = evaluatePolicy(baseAgent, action, policies, catalog);
    expect(result.decision).toBe('REQUIRE_APPROVAL');
    expect(result.policyId).toBe('POL-EXPORT');
  });

  it('BLOCK: Operation not in agent allowed_operations is blocked', () => {
    const action: ActionInput = {
      agent_id: 'doc-agent-01',
      tool: 'file_remover',
      operation: 'delete_file',
      resource: 'synthetic://documents/brief_2026.txt'
    };

    const result = evaluatePolicy(baseAgent, action, policies, catalog);
    expect(result.decision).toBe('BLOCK');
    expect(result.reasonCode).toBe('OPERATION_NOT_ALLOWED');
    expect(result.pauseOnViolation).toBe(true);
    expect(result.openIncident).toBe(true);
  });

  it('BLOCK: Out-of-scope resource is blocked with explanation', () => {
    const action: ActionInput = {
      agent_id: 'doc-agent-01',
      tool: 'file_reader',
      operation: 'read_file',
      resource: 'synthetic://classified/top_secret.txt'
    };

    const result = evaluatePolicy(baseAgent, action, policies, catalog);
    expect(result.decision).toBe('BLOCK');
    expect(result.reasonCode).toBe('RESOURCE_OUT_OF_SCOPE');
    expect(result.pauseOnViolation).toBe(true);
  });

  it('BLOCK: Paused agent has all actions blocked immediately', () => {
    const pausedAgent = { ...baseAgent, status: 'paused' as const };
    const action: ActionInput = {
      agent_id: 'doc-agent-01',
      tool: 'file_reader',
      operation: 'read_file',
      resource: 'synthetic://documents/brief_2026.txt'
    };

    const result = evaluatePolicy(pausedAgent, action, policies, catalog);
    expect(result.decision).toBe('BLOCK');
    expect(result.reasonCode).toBe('AGENT_PAUSED');
  });

  it('BLOCK: Unknown or unregistered agent is blocked', () => {
    const action: ActionInput = {
      agent_id: 'rogue-agent-99',
      tool: 'file_reader',
      operation: 'read_file',
      resource: 'synthetic://documents/brief_2026.txt'
    };

    const result = evaluatePolicy(null, action, policies, catalog);
    expect(result.decision).toBe('BLOCK');
    expect(result.reasonCode).toBe('UNKNOWN_AGENT');
  });

  it('RESTRICTED STATUS: Elevates ALLOW on mutating operation to REQUIRE_APPROVAL', () => {
    const restrictedAgent = { ...baseAgent, status: 'restricted' as const };
    const action: ActionInput = {
      agent_id: 'doc-agent-01',
      tool: 'summary_writer',
      operation: 'write_summary',
      resource: 'synthetic://reports/summary.txt'
    };

    const result = evaluatePolicy(restrictedAgent, action, policies, catalog);
    expect(result.decision).toBe('REQUIRE_APPROVAL');
    expect(result.reasonCode).toBe('RESTRICTED_AGENT_MUTATING_ELEVATION');
  });

  it('RESTRICTED STATUS: Non-mutating read operation remains ALLOW', () => {
    const restrictedAgent = { ...baseAgent, status: 'restricted' as const };
    const action: ActionInput = {
      agent_id: 'doc-agent-01',
      tool: 'file_reader',
      operation: 'read_file',
      resource: 'synthetic://documents/brief_2026.txt'
    };

    const result = evaluatePolicy(restrictedAgent, action, policies, catalog);
    expect(result.decision).toBe('ALLOW');
  });

  it('FAIL-SAFE DEFAULT: Missing policy returns BLOCK (Default-Deny)', () => {
    const action: ActionInput = {
      agent_id: 'doc-agent-01',
      tool: 'file_reader',
      operation: 'read_file',
      resource: 'synthetic://documents/brief_2026.txt'
    };

    // Pass empty policies array
    const result = evaluatePolicy(baseAgent, action, [], catalog);
    expect(result.decision).toBe('BLOCK');
    expect(result.reasonCode).toBe('DEFAULT_DENY_NO_POLICY');
  });

  it('SCENARIO E: Validator exception fails safely to BLOCK', () => {
    const malformedAgent: any = {
      id: 'doc-agent-01',
      allowed_operations: null // will cause an exception if not guarded
    };

    const action: ActionInput = {
      agent_id: 'doc-agent-01',
      tool: 'file_reader',
      operation: 'read_file',
      resource: 'synthetic://documents/brief_2026.txt'
    };

    const result = evaluatePolicy(malformedAgent, action, policies, catalog);
    expect(result.decision).toBe('BLOCK');
    expect(result.reasonCode).toBe('VALIDATOR_FAILURE');
  });
});
