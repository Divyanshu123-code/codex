import { evaluateInputQuality, InputQualityEvaluationResult } from './inputQuality.js';

export interface AgentRecord {
  id: string;
  name: string;
  agent_category?: string;
  status: 'active' | 'restricted' | 'paused';
  allowed_operations: string[];
  allowed_resources: string[];
  policy_version: string;
  input_requirements?: Record<string, any>;
  uncertainty_rule?: Record<string, any>;
}

export interface ActionInput {
  agent_id: string;
  tool: string;
  operation: string;
  resource: string;
  parameters?: Record<string, any>;
}

export interface PolicyRecord {
  id: string;
  version: string;
  name: string;
  applicable_agent_id: string | null;
  operation: string;
  resource_pattern: string;
  decision: 'allow' | 'require_approval' | 'block';
  severity: 'low' | 'medium' | 'high' | 'critical';
  pause_on_violation: number;
  open_incident: number;
  max_auto_amount?: number | null;
  daily_cap?: number | null;
  window_minutes?: number | null;
}

export interface OperationCatalogRecord {
  operation: string;
  mutating: number;
  sensitive: number;
  simulated_cost: number;
}

export interface EvaluationContext {
  cumulativeAmount?: number;
  transactionCount?: number;
}

export interface EvaluationResult {
  decision: 'ALLOW' | 'REQUIRE_APPROVAL' | 'BLOCK';
  reasonCode: string;
  explanation: string;
  policyId?: string;
  policyVersion?: string;
  policyLimit?: number | null;
  dailyCap?: number | null;
  windowMinutes?: number | null;
  cumulativeAmount?: number | null;
  severity: 'low' | 'medium' | 'high' | 'critical';
  pauseOnViolation: boolean;
  openIncident: boolean;
  evidenceChecks?: InputQualityEvaluationResult;
}

// Utility for glob / wildcard matching (e.g. synthetic://documents/*)
export function matchResourcePattern(pattern: string, resource: string): boolean {
  if (pattern === '*' || pattern === resource) {
    return true;
  }
  const regexPattern = '^' + pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.') + '$';
  return new RegExp(regexPattern).test(resource);
}

/**
 * Pure deterministic policy evaluation function (FR-4, Section 3.4, Section 3.8)
 */
export function evaluatePolicy(
  agent: AgentRecord | null | undefined,
  action: ActionInput,
  policies: PolicyRecord[],
  catalog: Map<string, OperationCatalogRecord>,
  context?: EvaluationContext
): EvaluationResult {
  try {
    // 1. Identity & Agent Existence Check
    if (!agent) {
      return {
        decision: 'BLOCK',
        reasonCode: 'UNKNOWN_AGENT',
        explanation: `Unknown or unregistered agent ID: ${action.agent_id}`,
        severity: 'high',
        pauseOnViolation: false,
        openIncident: false
      };
    }

    // 2. Status Invariant (Section 3.4)
    if (agent.status === 'paused') {
      return {
        decision: 'BLOCK',
        reasonCode: 'AGENT_PAUSED',
        explanation: `Agent ${agent.id} is paused. No actions are permitted to proceed.`,
        severity: 'high',
        pauseOnViolation: false,
        openIncident: false
      };
    }

    // 3. Permission Scope: Allowed Operations
    if (!agent.allowed_operations.includes(action.operation)) {
      return {
        decision: 'BLOCK',
        reasonCode: 'OPERATION_NOT_ALLOWED',
        explanation: `Operation '${action.operation}' is not in agent's allowed operations list: [${agent.allowed_operations.join(', ')}]`,
        severity: 'high',
        pauseOnViolation: true,
        openIncident: true
      };
    }

    // 4. Permission Scope: Allowed Resources
    const inResourceScope = agent.allowed_resources.some((pattern) =>
      matchResourcePattern(pattern, action.resource)
    );

    if (!inResourceScope) {
      return {
        decision: 'BLOCK',
        reasonCode: 'RESOURCE_OUT_OF_SCOPE',
        explanation: `Target resource '${action.resource}' does not match any allowed resource pattern: [${agent.allowed_resources.join(', ')}]`,
        severity: 'high',
        pauseOnViolation: true,
        openIncident: true
      };
    }

    // 5. Policy Matching (FR-2)
    const matchingPolicies = policies.filter((p) => {
      // Must match applicable agent or be global (null)
      if (p.applicable_agent_id && p.applicable_agent_id !== agent.id) {
        return false;
      }
      // Must match operation or wildcard
      if (p.operation !== '*' && p.operation !== action.operation) {
        return false;
      }
      // Must match resource pattern
      return matchResourcePattern(p.resource_pattern, action.resource);
    });

    if (matchingPolicies.length === 0) {
      // Default-deny if missing policy (Section 3.8 fail-safe by construction)
      return {
        decision: 'BLOCK',
        reasonCode: 'DEFAULT_DENY_NO_POLICY',
        explanation: `No explicit policy permitted operation '${action.operation}' on resource '${action.resource}'. Fail-safe default-deny applied.`,
        severity: 'medium',
        pauseOnViolation: false,
        openIncident: false
      };
    }

    // Prioritize most restrictive decision: block > require_approval > allow
    let selectedPolicy = matchingPolicies[0];
    const decisionPrecedence = { block: 3, require_approval: 2, allow: 1 };

    for (const p of matchingPolicies) {
      if (decisionPrecedence[p.decision] > decisionPrecedence[selectedPolicy.decision]) {
        selectedPolicy = p;
      }
    }

    // Invariant: If policy explicitly blocks, prohibition takes absolute precedence.
    // Approval or input quality can NEVER override an explicit policy prohibition.
    if (selectedPolicy.decision === 'block') {
      return {
        decision: 'BLOCK',
        reasonCode: 'POLICY_DECISION_BLOCK',
        explanation: `Evaluated against policy ${selectedPolicy.id} (v${selectedPolicy.version}): ${selectedPolicy.name}. Operation explicitly prohibited.`,
        policyId: selectedPolicy.id,
        policyVersion: selectedPolicy.version,
        policyLimit: selectedPolicy.max_auto_amount != null ? Number(selectedPolicy.max_auto_amount) : null,
        severity: selectedPolicy.severity,
        pauseOnViolation: selectedPolicy.pause_on_violation === 1,
        openIncident: selectedPolicy.open_incident === 1
      };
    }

    // 6. Deterministic Input Quality, Freshness & Uncertainty Verification (AegisOS Domain Checks)
    const qualityResult = evaluateInputQuality(
      action.parameters,
      agent.input_requirements,
      agent.uncertainty_rule
    );

    if (!qualityResult.valid) {
      if (qualityResult.decisionOverride === 'BLOCK') {
        return {
          decision: 'BLOCK',
          reasonCode: qualityResult.reasonCode || 'INPUT_VALIDATION_FAILED',
          explanation: qualityResult.explanation || 'Input quality verification failed.',
          policyId: selectedPolicy.id,
          policyVersion: selectedPolicy.version,
          policyLimit: selectedPolicy.max_auto_amount != null ? Number(selectedPolicy.max_auto_amount) : null,
          severity: 'high',
          pauseOnViolation: false,
          openIncident: false,
          evidenceChecks: qualityResult
        };
      }

      // decisionOverride is REQUIRE_APPROVAL (e.g. stale telemetry, conflicting evidence, uncertainty)
      return {
        decision: 'REQUIRE_APPROVAL',
        reasonCode: qualityResult.reasonCode || 'INPUT_HELD_FOR_HUMAN_REVIEW',
        explanation: qualityResult.explanation || 'Input conditions require human review before action.',
        policyId: selectedPolicy.id,
        policyVersion: selectedPolicy.version,
        policyLimit: selectedPolicy.max_auto_amount != null ? Number(selectedPolicy.max_auto_amount) : null,
        severity: 'medium',
        pauseOnViolation: false,
        openIncident: false,
        evidenceChecks: qualityResult
      };
    }

    // 6b. Delegated Authority Threshold Check (Monetary / Numerical Bounds, e.g. Refund <= $5000)
    if (selectedPolicy.decision === 'allow' && selectedPolicy.max_auto_amount != null) {
      const reqAmount = typeof action.parameters?.amount === 'number' ? action.parameters.amount : null;
      if (reqAmount !== null && reqAmount > selectedPolicy.max_auto_amount) {
        return {
          decision: 'REQUIRE_APPROVAL',
          reasonCode: 'THRESHOLD_EXCEEDED_REQUIRES_APPROVAL',
          explanation: `Requested amount of $${reqAmount} exceeds delegated auto-approval threshold of $${selectedPolicy.max_auto_amount} under policy ${selectedPolicy.id}. Elevated to human approval.`,
          policyId: selectedPolicy.id,
          policyVersion: selectedPolicy.version,
          policyLimit: selectedPolicy.max_auto_amount,
          dailyCap: selectedPolicy.daily_cap != null ? Number(selectedPolicy.daily_cap) : null,
          windowMinutes: selectedPolicy.window_minutes != null ? Number(selectedPolicy.window_minutes) : null,
          severity: 'medium',
          pauseOnViolation: false,
          openIncident: false,
          evidenceChecks: qualityResult
        };
      }
    }

    // 6c. Rolling-Window Cumulative / Velocity Cap Check (Per-Agent Cumulative Threshold)
    if (selectedPolicy.decision === 'allow' && selectedPolicy.daily_cap != null) {
      const reqAmount = typeof action.parameters?.amount === 'number' ? action.parameters.amount : 0;
      const priorCumulative = typeof context?.cumulativeAmount === 'number' ? context.cumulativeAmount : 0;
      const totalCumulative = priorCumulative + reqAmount;

      if (totalCumulative > selectedPolicy.daily_cap) {
        return {
          decision: 'REQUIRE_APPROVAL',
          reasonCode: 'CUMULATIVE_LIMIT_EXCEEDED_HELD_FOR_HUMAN',
          explanation: `Requested amount of $${reqAmount} brings rolling ${selectedPolicy.window_minutes || 1440}m cumulative total to $${totalCumulative}, exceeding daily cap of $${selectedPolicy.daily_cap} under policy ${selectedPolicy.id}. Elevated to human approval.`,
          policyId: selectedPolicy.id,
          policyVersion: selectedPolicy.version,
          policyLimit: selectedPolicy.daily_cap,
          dailyCap: selectedPolicy.daily_cap,
          windowMinutes: selectedPolicy.window_minutes || 1440,
          cumulativeAmount: totalCumulative,
          severity: 'medium',
          pauseOnViolation: false,
          openIncident: false,
          evidenceChecks: qualityResult
        };
      }
    }

    let finalDecision: 'ALLOW' | 'REQUIRE_APPROVAL' =
      selectedPolicy.decision === 'require_approval' ? 'REQUIRE_APPROVAL' : 'ALLOW';

    let reasonCode = `POLICY_DECISION_${finalDecision}`;
    let explanation = `Evaluated against policy ${selectedPolicy.id} (v${selectedPolicy.version}): ${selectedPolicy.name}`;

    // 7. Section 3.4 Status Elevation for 'restricted' Agent:
    // "elevates any ALLOW on a mutating operation to REQUIRE_APPROVAL (reason RESTRICTED_AGENT)"
    if (agent.status === 'restricted' && finalDecision === 'ALLOW') {
      const opInfo = catalog.get(action.operation);
      const isMutating = opInfo ? opInfo.mutating === 1 : true; // fail-safe assumption

      if (isMutating) {
        finalDecision = 'REQUIRE_APPROVAL';
        reasonCode = 'RESTRICTED_AGENT_MUTATING_ELEVATION';
        explanation = `Agent is RESTRICTED. Mutating operation '${action.operation}' elevated from ALLOW to REQUIRE_APPROVAL.`;
      }
    }

    return {
      decision: finalDecision,
      reasonCode,
      explanation,
      policyId: selectedPolicy.id,
      policyVersion: selectedPolicy.version,
      policyLimit: selectedPolicy.max_auto_amount != null ? Number(selectedPolicy.max_auto_amount) : null,
      dailyCap: selectedPolicy.daily_cap != null ? Number(selectedPolicy.daily_cap) : null,
      windowMinutes: selectedPolicy.window_minutes != null ? Number(selectedPolicy.window_minutes) : null,
      cumulativeAmount: context?.cumulativeAmount,
      severity: selectedPolicy.severity,
      pauseOnViolation: selectedPolicy.pause_on_violation === 1,
      openIncident: selectedPolicy.open_incident === 1,
      evidenceChecks: qualityResult
    };
  } catch (error: any) {
    // Fail-safe default-deny on any unexpected validator failure (Scenario E, Section 3.8)
    return {
      decision: 'BLOCK',
      reasonCode: 'VALIDATOR_FAILURE',
      explanation: `Validator error encountered: ${error.message}. Fail-safe default BLOCK enforced.`,
      severity: 'critical',
      pauseOnViolation: true,
      openIncident: true
    };
  }
}
