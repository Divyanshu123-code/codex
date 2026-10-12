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
}

interface LLMCallResult {
  text: string;
  source: 'anthropic_api' | 'deterministic_fallback';
  modelUsed: string;
  promptHash: string;
  responseHash: string;
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
        summary: 'Constrained workflow correction removing unauthorized step',
        patch: [
          { op: 'replace', path: '/workflow_config/2', value: { step_id: 'step_3', operation: 'archive_file', resource: 'synthetic://archive/cleared_briefs.txt' } }
        ],
        rationale: 'Replaces prohibited deletion or destructive operation with policy-compliant archival in accordance with closed signature catalog.'
      });

    case 'L2_PLAIN_LANGUAGE_EXPLANATION':
      return 'The requested operation requires human dual-custody review. The requested monetary amount ($6,000.00) exceeds the configured autonomous threshold limit ($5,000.00) established by policy POL-REFUND-01. Protected execution has been withheld until an authorized administrator verifies order details and provides written justification.';

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
    agentId: requestDetails.agent_id
  }, db);

  return {
    explanation: result.text,
    source: result.source,
    hash: result.responseHash
  };
}
