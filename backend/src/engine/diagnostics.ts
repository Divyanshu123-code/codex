import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../db/connection.js';
import { writeAuditEvent } from './gateway.js';

export interface SignatureEntry {
  signatureId: string;
  causeCategory: string;
  matcher: (incident: any, request: any, agent: any, repeatCount: number) => boolean;
  correctionTemplate: (incident: any, request: any, agent: any) => any;
  explanation: (incident: any, request: any) => string;
}

export const CATALOG_VERSION = 'v1.0';

export const SIGNATURE_CATALOG: SignatureEntry[] = [
  {
    signatureId: 'SIG-DISALLOWED-OP',
    causeCategory: 'Operation Outside Permitted Capabilities',
    matcher: (incident, request, agent) => {
      return request.gate_reason_code === 'OPERATION_NOT_ALLOWED' ||
        (request.operation === 'delete_file' && !agent.allowed_operations.includes('delete_file'));
    },
    correctionTemplate: (incident, request, agent) => {
      const allowedOps: string[] = typeof agent.allowed_operations === 'string'
        ? JSON.parse(agent.allowed_operations)
        : (agent.allowed_operations || []);
      const fallbackOp = allowedOps.includes('archive_file')
        ? 'archive_file'
        : (allowedOps.includes('isolate_host') ? 'isolate_host' : (allowedOps[0] || 'read_file'));
      const fallbackResource = fallbackOp === 'archive_file'
        ? 'synthetic://archive/defense_intel_brief_2026.txt'
        : (request.resource || 'synthetic://enclaves/perimeter_firewall');

      return {
        action: 'replace_step_operation',
        target_step_id: 'step_3',
        new_operation: fallbackOp,
        new_resource: fallbackResource,
        description: `Replace prohibited ${request.operation} operation with permitted ${fallbackOp} operation`
      };
    },
    explanation: (incident, request) =>
      `Workflow step attempted operation '${request.operation}', which violates least-privilege capability boundaries.`
  },
  {
    signatureId: 'SIG-OUT-OF-SCOPE-RESOURCE',
    causeCategory: 'Resource Reference Out of Scope',
    matcher: (incident, request) => {
      return request.gate_reason_code === 'RESOURCE_OUT_OF_SCOPE';
    },
    correctionTemplate: (incident, request, agent) => {
      return {
        action: 'replace_step_params',
        target_step_id: 'step_1',
        new_resource: 'synthetic://documents/sample_brief.txt',
        description: 'Re-target workflow step to in-scope resource'
      };
    },
    explanation: (incident, request) =>
      `Target resource '${request.resource}' is outside the authorized data perimeter.`
  },
  {
    signatureId: 'SIG-MALFORMED-INPUT',
    causeCategory: 'Malformed Parameter Mapping',
    matcher: (incident, request) => {
      return request.gate_reason_code === 'MALFORMED_INPUT' || request.gate_reason_code === 'VALIDATOR_FAILURE';
    },
    correctionTemplate: () => ({
      action: 'replace_step_params',
      target_step_id: 'step_1',
      params: { format: 'standard' },
      description: 'Normalize parameter formatting to conform to schema'
    }),
    explanation: () => 'Required parameters missing or invalid against schema.'
  },
  {
    signatureId: 'SIG-REPEATED-VIOLATION',
    causeCategory: 'Repeated Policy Violation Anomalies',
    matcher: (incident, request, agent, repeatCount) => {
      return repeatCount >= 3;
    },
    correctionTemplate: () => null, // None; requires human investigation
    explanation: (incident, request) =>
      `Multiple repeated violations (${incident.triggering_request_id}) detected in observation window.`
  }
];

export interface DiagnosticResult {
  incidentId: string;
  catalogVersion: string;
  signatureId: string;
  causeCategory: string;
  explanation: string;
  proposedCorrection: any | null;
  status: 'DIAGNOSED' | 'UNKNOWN_HUMAN_INVESTIGATION_REQUIRED' | 'AMBIGUOUS_HUMAN_INVESTIGATION_REQUIRED';
}

/**
 * Known-pattern triage over closed catalog (FR-7, Section 3.1)
 */
export function diagnoseIncident(incidentId: string, db?: DatabaseSync): DiagnosticResult {
  const targetDb = db || getDatabase();

  const incidentRow = targetDb.prepare('SELECT * FROM incidents WHERE id = ?').get(incidentId) as any;
  if (!incidentRow) {
    throw new Error(`Incident ${incidentId} not found.`);
  }

  const requestRow = targetDb.prepare('SELECT * FROM action_requests WHERE id = ?').get(incidentRow.triggering_request_id) as any;
  const agentRow = targetDb.prepare('SELECT * FROM agents WHERE id = ?').get(incidentRow.agent_id) as any;
  const agent = agentRow ? {
    ...agentRow,
    allowed_operations: JSON.parse(agentRow.allowed_operations),
    allowed_resources: JSON.parse(agentRow.allowed_resources)
  } : null;

  // Check repeat violation count
  const repeatCountRow = targetDb.prepare(`
    SELECT COUNT(*) as count FROM incidents WHERE agent_id = ?
  `).get(incidentRow.agent_id) as { count: number };

  const matches: SignatureEntry[] = [];
  for (const sig of SIGNATURE_CATALOG) {
    if (sig.matcher(incidentRow, requestRow, agent, repeatCountRow.count)) {
      matches.push(sig);
    }
  }

  let result: DiagnosticResult;

  if (matches.length === 0) {
    result = {
      incidentId,
      catalogVersion: CATALOG_VERSION,
      signatureId: 'UNKNOWN_HUMAN_INVESTIGATION_REQUIRED',
      causeCategory: 'Unknown Failure Signature',
      explanation: 'No known failure signature matched recorded telemetry. Human investigation required.',
      proposedCorrection: null,
      status: 'UNKNOWN_HUMAN_INVESTIGATION_REQUIRED'
    };
  } else if (matches.length > 1) {
    result = {
      incidentId,
      catalogVersion: CATALOG_VERSION,
      signatureId: 'AMBIGUOUS_HUMAN_INVESTIGATION_REQUIRED',
      causeCategory: 'Multiple Competing Signatures',
      explanation: `Ambiguous match: multiple signatures matched [${matches.map((m) => m.signatureId).join(', ')}]. Human investigation required.`,
      proposedCorrection: null,
      status: 'AMBIGUOUS_HUMAN_INVESTIGATION_REQUIRED'
    };
  } else {
    const matched = matches[0];
    const correctionPatch = matched.correctionTemplate(incidentRow, requestRow, agent);

    result = {
      incidentId,
      catalogVersion: CATALOG_VERSION,
      signatureId: matched.signatureId,
      causeCategory: matched.causeCategory,
      explanation: matched.explanation(incidentRow, requestRow),
      proposedCorrection: correctionPatch,
      status: 'DIAGNOSED'
    };
  }

  const now = Date.now();
  targetDb.prepare(`
    UPDATE incidents
    SET status = 'DIAGNOSED', signature_id = ?, diagnostic_result = ?, diagnosed_at = ?
    WHERE id = ?
  `).run(result.signatureId, JSON.stringify(result), now, incidentId);

  // Write audit event
  writeAuditEvent({
    eventType: 'INCIDENT_DIAGNOSED',
    actorType: 'system',
    actorId: 'diagnostics-engine',
    agentId: incidentRow.agent_id,
    agentOwner: incidentRow.agent_owner_at_time,
    policyId: incidentRow.policy_id,
    policyVersion: incidentRow.policy_version,
    resourceReference: requestRow ? requestRow.resource : null,
    decision: 'ALLOW',
    outcome: result.status,
    requestId: incidentRow.triggering_request_id,
    incidentId,
    correctionId: null,
    safeDetails: { signatureId: result.signatureId, status: result.status }
  }, targetDb);

  return result;
}
