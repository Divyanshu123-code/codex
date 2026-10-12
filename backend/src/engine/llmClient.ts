import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { getDatabase } from '../db/connection.js';
import { writeAuditEvent } from './gateway.js';

interface LLMCallOptions {
  model?: string;
  maxTokens?: number;
  systemPrompt?: string;
  prompt: string;
  purpose: 'L1_PATCH_PROPOSAL' | 'L2_PLAIN_LANGUAGE_EXPLANATION' | 'L3_INCIDENT_NARRATIVE';
  agentId?: string;
  requestId?: string;
  incidentId?: string;
  requestDetails?: any;
}

interface LLMCallResult {
  text: string;
  source: 'anthropic_api' | 'deterministic_fallback';
  modelUsed: string;
  promptHash: string;
  responseHash: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
}

export interface AnthropicToolMessage {
  role: 'user' | 'assistant';
  content: string | any[];
}

export interface AnthropicToolTurnResult {
  textBlocks: string[];
  toolUses: Array<{
    id: string;
    name: string;
    input: Record<string, any>;
  }>;
  stopReason?: string;
  rawResponse?: any;
}

/**
 * Execute Anthropic tool-use turn reusing the established fetch/timeout/retry pattern.
 * Model defaults to claude-sonnet-5-5 (configurable via LLM_MODEL_LIVE_AGENT or LLM_MODEL_PATCH).
 */
export async function executeAnthropicToolTurn(
  messages: AnthropicToolMessage[],
  tools: ToolDefinition[],
  options?: {
    model?: string;
    maxTokens?: number;
    systemPrompt?: string;
  }
): Promise<AnthropicToolTurnResult | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return null;
  }

  const model = options?.model || process.env.LLM_MODEL_LIVE_AGENT || process.env.LLM_MODEL_PATCH || 'claude-sonnet-5-5';
  const body = {
    model,
    max_tokens: options?.maxTokens || 1024,
    system: options?.systemPrompt || 'You are an autonomous agent under the AegisOS governance perimeter. Use provided tools to execute actions.',
    messages,
    tools
  };

  // Reusable fetch/timeout/retry pattern (10s timeout, 1 retry)
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(body)
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = (await response.json()) as any;
        const textBlocks: string[] = [];
        const toolUses: Array<{ id: string; name: string; input: Record<string, any> }> = [];

        if (Array.isArray(data.content)) {
          for (const block of data.content) {
            if (block.type === 'text' && typeof block.text === 'string') {
              textBlocks.push(block.text);
            } else if (block.type === 'tool_use') {
              toolUses.push({
                id: block.id,
                name: block.name,
                input: block.input || {}
              });
            }
          }
        }

        return {
          textBlocks,
          toolUses,
          stopReason: data.stop_reason,
          rawResponse: data
        };
      }
    } catch {
      clearTimeout(timeoutId);
      // Retry once on failure
    }
  }

  return null;
}

/**
 * Resilient LLM client wrapper for AegisOS (Spec 6e)
 * Enforces:
 * 1. Zero LLM in critical enforcement path (deterministic evaluator only).
 * 2. Backend-only execution with 10s timeout and 1 retry.
 * 3. 100% deterministic fallback for offline / disconnected demo execution.
 * 4. Audit logging of prompt and response SHA-256 hashes.
 */
export async function executeLLMCall(
  options: LLMCallOptions,
  db?: DatabaseSync
): Promise<LLMCallResult> {
  const targetDb = db || getDatabase();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const promptHash = crypto.createHash('sha256').update(options.prompt).digest('hex');
  const defaultModel = options.purpose === 'L1_PATCH_PROPOSAL'
    ? (process.env.LLM_MODEL_PATCH || 'claude-sonnet-5-5')
    : (process.env.LLM_MODEL_EXPLAIN || 'claude-haiku-5-5');
  const model = options.model || defaultModel;

  let outputText = '';
  let source: 'anthropic_api' | 'deterministic_fallback' = 'deterministic_fallback';

  if (apiKey) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model,
          max_tokens: options.maxTokens || 1024,
          system: options.systemPrompt || 'You are an institutional AI governance assistant for AegisOS. Output concise, strictly formatted responses.',
          messages: [{ role: 'user', content: options.prompt }]
        })
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = (await response.json()) as any;
        if (data.content && data.content[0] && data.content[0].text) {
          outputText = data.content[0].text;
          source = 'anthropic_api';
        }
      }
    } catch {
      // Graceful fallback to deterministic generator
    }
  }

  if (!outputText) {
    source = 'deterministic_fallback';
    outputText = generateDeterministicFallback(options);
  }

  const responseHash = crypto.createHash('sha256').update(outputText).digest('hex');

  // Record audit trail event for advisory LLM proposal/explanation
  try {
    writeAuditEvent({
      eventType: 'LLM_ADVISORY_GENERATED',
      actorType: 'system',
      actorId: `llm-client-${source}`,
      agentId: options.agentId || null,
      agentOwner: null,
      policyId: null,
      policyVersion: null,
      resourceReference: null,
      decision: null,
      outcome: options.purpose,
      requestId: options.requestId || null,
      incidentId: options.incidentId || null,
      correctionId: null,
      safeDetails: {
        purpose: options.purpose,
        source,
        modelUsed: model,
        promptHash,
        responseHash
      }
    }, targetDb);
  } catch {
    // Non-blocking
  }

  return {
    text: outputText,
    source,
    modelUsed: model,
    promptHash,
    responseHash
  };
}

function generateDeterministicFallback(options: LLMCallOptions): string {
  switch (options.purpose) {
    case 'L1_PATCH_PROPOSAL':
      return JSON.stringify({
        summary: 'Constrained workflow correction replacing unauthorized step',
        patch: {
          action: 'replace_step_operation',
          target_step_id: 'step_3',
          new_operation: 'archive_file',
          new_resource: 'synthetic://archive/cleared_briefs.txt',
          description: 'Replaces prohibited operation with policy-compliant archival'
        },
        rationale: 'Replaces prohibited deletion or destructive operation with policy-compliant archival in accordance with closed signature catalog.'
      });

    case 'L2_PLAIN_LANGUAGE_EXPLANATION': {
      const rd = options.requestDetails || {};
      const params = typeof rd.parameters === 'string'
        ? (() => { try { return JSON.parse(rd.parameters); } catch { return {}; } })()
        : (rd.parameters || {});

      const op = rd.operation || '';
      const resource = rd.resource || '';
      const policy = rd.policy_id || 'POL-GOV-01';
      const reasonCode = (rd.gate_reason_code || '').toUpperCase();
      const rawExplanation = rd.explanation || '';
      const decision = rd.gate_decision || 'REQUIRE_APPROVAL';

      // 1. Conflicting Sensor / Reconnaissance Intelligence
      if (
        reasonCode.includes('CONFLICT') ||
        op === 'propose_tactical_recommendation' ||
        rawExplanation.toLowerCase().includes('conflict') ||
        Boolean(params.multi_source_reports)
      ) {
        return 'Admiralty Contradiction Interlock: Multi-source intelligence feeds (e.g. UAV aerial observation vs Satellite synthetic aperture pass) produced contradictory assessments of equal Admiralty grade (A1 vs A1) for target coordinates. In accordance with US DoD Directive 3000.09 and UK MOD JSP 936 doctrine, autonomous agents are barred from resolving conflicting intelligence autonomously. Protected execution has been withheld until human command staff adjudicates the tactical divergence.';
      }

      // 2. Stale Telemetry / Degraded Comms / Communication Latency
      if (
        reasonCode.includes('STALE') ||
        reasonCode.includes('DEGRADED') ||
        rawExplanation.toLowerCase().includes('stale') ||
        rawExplanation.toLowerCase().includes('degraded') ||
        rawExplanation.toLowerCase().includes('link-loss') ||
        rawExplanation.toLowerCase().includes('age')
      ) {
        const eqId = params?.telemetry?.equipment_id || params?.equipment_id || 'turbine_unit_4';
        return `Telemetry Freshness Precondition Held: Equipment telemetry for '${eqId}' exceeds the allowable latency threshold (>300s). Under NATO STANAG and JSP 936 standards, autonomous maintenance ticketing and actuation cannot execute on stale or link-loss sensor feeds. Protected execution has been held in a fail-safe state until an authorized Duty Officer reviews fresh diagnostic logs and confirms equipment integrity.`;
      }

      // 3. Data Integrity / Missing Mandatory Telemetry / Out-of-Bounds Sensor Values
      if (
        reasonCode.includes('MISSING') ||
        reasonCode.includes('OUT_OF_BOUNDS') ||
        rawExplanation.toLowerCase().includes('mandatory') ||
        rawExplanation.toLowerCase().includes('out of bounds') ||
        rawExplanation.toLowerCase().includes('rms')
      ) {
        return `Sensor Envelope Anomaly: Telemetry payload for '${op}' breached deterministic safety envelopes (omitting mandatory sensor parameters or reporting sensor values outside physical operating tolerances). The AegisOS gate withheld execution to prevent anomalous automated maintenance scheduling without supervisory review.`;
      }

      // 4. Cumulative Velocity Cap Exceeded (Smurfing / Split Requisitions)
      if (
        reasonCode.includes('CUMULATIVE') ||
        reasonCode.includes('VELOCITY') ||
        rawExplanation.toLowerCase().includes('cumulative') ||
        rawExplanation.toLowerCase().includes('smurf') ||
        rawExplanation.toLowerCase().includes('rolling')
      ) {
        return 'Operational Velocity Limit Exceeded: The agent submitted sequential transactions exceeding the configured rolling 24-hour cumulative ceiling ($8,000.00). In accordance with fiscal anti-tamper controls and JSP 936 rules, execution has been held to prevent split-transaction evasion ("smurfing") and enforce macroscopic spending oversight. Duty Officer or Commander authorization is required.';
      }

      // 5. Adversarial Payload / Prompt Injection
      if (
        reasonCode.includes('INJECTION') ||
        rawExplanation.toLowerCase().includes('injection') ||
        rawExplanation.toLowerCase().includes('adversarial')
      ) {
        return 'Adversarial Prompt Injection Intercept: Boundary input sanitization detected an untrusted prompt injection signature embedded in the task payload attempting to override governance constraints and authorize unauthorized disbursements. Protected execution was immediately withheld at the gateway boundary, containing the threat prior to tool execution.';
      }

      // 6. Destructive / Cyber Containment Operations (wipe_credentials, isolate_host, delete_file)
      if (
        op === 'wipe_credentials' ||
        op === 'isolate_host' ||
        op === 'delete_file' ||
        reasonCode.includes('PROHIBITED') ||
        decision === 'BLOCK'
      ) {
        return `Containment Barrier Enforced: Autonomous agent attempted high-consequence containment action '${op}' targeting '${resource}'. This operation is classified as destructive Tier 2 and is strictly prohibited from autonomous initiation under policy ${policy}. The request was blocked, and the agent has been paused pending administrative investigation.`;
      }

      // 7. Monetary / Threshold Exceeded (Refunds or Parts Requisitions)
      if (params?.amount != null || op === 'issue_refund' || op.includes('requisition')) {
        const amt = Number(params?.amount || 6000);
        const formattedAmt = `$${amt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        const threshold = amt > 5000 && amt <= 15000 ? '$5,000.00' : '$15,000.00';
        const policyName = policy || (op === 'issue_refund' ? 'POL-REFUND-01' : 'POL-REQUISITION-01');

        return `The requested operation requires human dual-custody review. The requested monetary amount (${formattedAmt}) exceeds the configured autonomous threshold limit (${threshold}) established by policy ${policyName}. Protected execution has been withheld until an authorized administrator verifies order details and provides written justification.`;
      }

      // 8. Dynamic fallback from rawExplanation
      if (rawExplanation) {
        return `Governance Interlock Decision: The requested operation '${op}' on resource '${resource}' was held under policy ${policy}. Pre-execution finding: ${rawExplanation}. Supervisory authorization is required before protected execution can proceed.`;
      }

      return 'The requested operation requires human dual-custody review. The requested monetary amount ($6,000.00) exceeds the configured autonomous threshold limit ($5,000.00) established by policy POL-REFUND-01. Protected execution has been withheld until an authorized administrator verifies order details and provides written justification.';
    }

    case 'L3_INCIDENT_NARRATIVE':
      return 'Security Incident Containment Report: Autonomous agent triggered an unpermitted operation breach against protected perimeter resources. The AegisOS gate intercepted the action prior to simulated tool execution, transition status to paused, and logged immutable diagnostic evidence into the audit ledger.';

    default:
      return 'Deterministic governance advisory generated by AegisOS control plane.';
  }
}

/**
 * L1: Debug Agent Patch Proposer
 */
export async function proposeCorrectionPatch(
  incidentId: string,
  signatureId: string,
  workflowConfig: any[],
  db?: DatabaseSync
): Promise<{ patch: any; rationale: string; source: string; snapshotHash: string }> {
  const prompt = `Incident ${incidentId} diagnosed with closed signature ${signatureId}. Current workflow: ${JSON.stringify(workflowConfig)}. Propose a minimal JSON patch that remedies the violation without widening permissions.`;
  const result = await executeLLMCall({
    prompt,
    purpose: 'L1_PATCH_PROPOSAL',
    incidentId,
    systemPrompt: 'Return only valid JSON object with keys: patch (array of RFC 6902 operations), rationale (string).'
  }, db);

  let parsed: any;
  try {
    parsed = JSON.parse(result.text);
  } catch {
    parsed = JSON.parse(generateDeterministicFallback({ prompt: '', purpose: 'L1_PATCH_PROPOSAL' }));
  }

  return {
    patch: parsed.patch,
    rationale: parsed.rationale || parsed.summary,
    source: result.source,
    snapshotHash: result.responseHash
  };
}

/**
 * L2: Plain-Language Request Review Explainer
 */
export async function explainGateDecision(
  requestId: string,
  requestDetails: any,
  db?: DatabaseSync
): Promise<{ explanation: string; source: string; hash: string }> {
  const prompt = `Explain why action request ${requestId} for operation '${requestDetails.operation}' on '${requestDetails.resource}' was held or blocked: ${requestDetails.explanation}`;
  const result = await executeLLMCall({
    prompt,
    purpose: 'L2_PLAIN_LANGUAGE_EXPLANATION',
    requestId,
    agentId: requestDetails.agent_id,
    requestDetails
  }, db);

  return {
    explanation: result.text,
    source: result.source,
    hash: result.responseHash
  };
}
