import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getDatabase } from '../src/db/connection.js';
import { seedDatabase } from '../src/db/seed.js';
import {
  executeLLMCall,
  proposeCorrectionPatch,
  explainGateDecision
} from '../src/engine/llmClient.js';

describe('Resilient Advisory LLM Client (llmClient.ts)', () => {
  let db: any;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    db = getDatabase(':memory:');
    seedDatabase(db);
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.LLM_MODEL_PATCH;
    delete process.env.LLM_MODEL_EXPLAIN;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('defaults to claude-sonnet-5-5 for L1 patch proposals in offline fallback mode', async () => {
    const result = await executeLLMCall(
      {
        prompt: 'Propose a patch for incident inc-01',
        purpose: 'L1_PATCH_PROPOSAL',
        incidentId: 'inc-01'
      },
      db
    );

    expect(result.source).toBe('deterministic_fallback');
    expect(result.modelUsed).toBe('claude-sonnet-5-5');
    expect(result.promptHash).toHaveLength(64);
    expect(result.responseHash).toHaveLength(64);
    expect(result.text).toContain('Constrained workflow correction');

    // Verify audit event written
    const auditEvent = db
      .prepare("SELECT * FROM audit_events WHERE event_type = 'LLM_ADVISORY_GENERATED' ORDER BY sequence DESC LIMIT 1")
      .get() as any;
    expect(auditEvent).toBeDefined();
    expect(auditEvent.outcome).toBe('L1_PATCH_PROPOSAL');
  });

  it('defaults to claude-haiku-5-5 for explanations and narratives in offline fallback mode', async () => {
    const explainResult = await executeLLMCall(
      {
        prompt: 'Explain why request req-01 was held',
        purpose: 'L2_PLAIN_LANGUAGE_EXPLANATION',
        requestId: 'req-01'
      },
      db
    );

    expect(explainResult.source).toBe('deterministic_fallback');
    expect(explainResult.modelUsed).toBe('claude-haiku-5-5');
    expect(explainResult.text).toContain('requires human dual-custody review');

    const narrativeResult = await executeLLMCall(
      {
        prompt: 'Summarize incident containment',
        purpose: 'L3_INCIDENT_NARRATIVE',
        incidentId: 'inc-02'
      },
      db
    );

    expect(narrativeResult.source).toBe('deterministic_fallback');
    expect(narrativeResult.modelUsed).toBe('claude-haiku-5-5');
    expect(narrativeResult.text).toContain('Security Incident Containment Report');
  });

  it('respects LLM_MODEL_PATCH and LLM_MODEL_EXPLAIN environment overrides', async () => {
    process.env.LLM_MODEL_PATCH = 'custom-patch-model-v1';
    process.env.LLM_MODEL_EXPLAIN = 'custom-explain-model-v2';

    const patchResult = await executeLLMCall(
      {
        prompt: 'Propose repair',
        purpose: 'L1_PATCH_PROPOSAL'
      },
      db
    );
    expect(patchResult.modelUsed).toBe('custom-patch-model-v1');

    const explainResult = await executeLLMCall(
      {
        prompt: 'Explain hold',
        purpose: 'L2_PLAIN_LANGUAGE_EXPLANATION'
      },
      db
    );
    expect(explainResult.modelUsed).toBe('custom-explain-model-v2');
  });

  it('explicit options.model takes precedence over defaults and env vars', async () => {
    process.env.LLM_MODEL_PATCH = 'env-patch-model';

    const result = await executeLLMCall(
      {
        model: 'explicitly-specified-model',
        prompt: 'Propose repair',
        purpose: 'L1_PATCH_PROPOSAL'
      },
      db
    );

    expect(result.modelUsed).toBe('explicitly-specified-model');
  });

  it('proposeCorrectionPatch and explainGateDecision return valid offline responses', async () => {
    const patchOutcome = await proposeCorrectionPatch(
      'inc-demo-01',
      'SIG-UNAUTHORIZED-DELETE',
      [{ step: 1, op: 'delete_file' }],
      db
    );

    expect(patchOutcome.source).toBe('deterministic_fallback');
    expect(typeof patchOutcome.patch).toBe('object');
    expect(patchOutcome.patch.action).toBe('replace_step_operation');
    expect(patchOutcome.rationale).toBeTruthy();

    const decisionOutcome = await explainGateDecision(
      'req-demo-01',
      { operation: 'issue_refund', resource: 'synthetic://refunds', explanation: 'Limit exceeded', agent_id: 'agent-01' },
      db
    );

    expect(decisionOutcome.source).toBe('deterministic_fallback');
    expect(decisionOutcome.explanation).toContain('requires human dual-custody review');
    expect(decisionOutcome.hash).toHaveLength(64);
  });
});
