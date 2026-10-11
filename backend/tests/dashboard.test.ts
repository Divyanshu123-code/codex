import { describe, it, expect, beforeEach } from 'vitest';
import { getDatabase } from '../src/db/connection.js';
import { seedDatabase } from '../src/db/seed.js';
import { getLeadershipDashboard } from '../src/engine/dashboard.js';
import { routeAction } from '../src/engine/gateway.js';
import { decideApproval } from '../src/engine/approval.js';
import { allocateTask } from '../src/engine/allocation.js';

describe('Workstream B: Leadership Risk, Usage, and Cost/Value Dashboard', () => {
  let db: any;

  beforeEach(() => {
    db = getDatabase(':memory:');
    seedDatabase(db);
  });

  it('Dashboard metrics match database records from baseline seed', () => {
    const data = getLeadershipDashboard(undefined, undefined, db);

    expect(data.risk.totalAgents).toBeGreaterThanOrEqual(3);
    expect(data.risk.activeAgents).toBeGreaterThanOrEqual(1);
    expect(data.risk.pausedAgents).toBeGreaterThanOrEqual(1);
    expect(data.risk.openIncidents.total).toBeGreaterThanOrEqual(1);

    expect(data.usage.tasksReceived).toBeGreaterThanOrEqual(3);
    expect(data.usage.tasksByHandler.agent).toBeGreaterThanOrEqual(1);
    expect(data.usage.tasksByHandler.human).toBeGreaterThanOrEqual(1);

    // Verify estimates section
    expect(data.costAndValueEstimates.disclaimer).toBe('SIMULATED ESTIMATE --- NOT VERIFIED SAVINGS');
    expect(data.costAndValueEstimates.assumptions.humanHourlyRateUsd).toBe(100.0);
    expect(typeof data.costAndValueEstimates.estimatedOperatingCostUsd).toBe('number');
    expect(typeof data.costAndValueEstimates.estimatedLaborValueCreatedUsd).toBe('number');
    expect(typeof data.costAndValueEstimates.netSyntheticValueUsd).toBe('number');
  });

  it('Approval metrics strictly differ from execution metrics', () => {
    // 1. Submit action requiring approval
    const routeRes = routeAction(
      {
        agent_id: 'doc-agent-01',
        tool: 'dataset_exporter',
        operation: 'export_dataset',
        resource: 'synthetic://documents/sample.txt'
      },
      { type: 'agent', id: 'doc-agent-01' },
      db
    );

    const approvalRow = db.prepare('SELECT * FROM approvals WHERE request_id = ?').get(routeRes.requestId) as any;

    // Before approval
    const preDashboard = getLeadershipDashboard(undefined, undefined, db);
    expect(preDashboard.humanIntervention.approvals.pending).toBeGreaterThanOrEqual(1);
    const preSucceeded = preDashboard.usage.executionOutcomes.succeeded;

    // Approve the request
    decideApproval(
      approvalRow.id,
      'APPROVED',
      { id: 'usr-reviewer', role: 'reviewer' },
      'Approved for test verification',
      db
    );

    const postDashboard = getLeadershipDashboard(undefined, undefined, db);
    expect(postDashboard.humanIntervention.approvals.approved).toBeGreaterThanOrEqual(1);
    expect(postDashboard.usage.executionOutcomes.succeeded).toBe(preSucceeded + 1);
  });

  it('Date filtering restricts metrics to selected window', () => {
    const now = Date.now();
    // Window in the far future has zero tasks created
    const futureData = getLeadershipDashboard(now + 10000000, now + 20000000, db);
    expect(futureData.usage.tasksReceived).toBe(0);
    expect(futureData.usage.tasksByHandler.agent).toBe(0);
    expect(futureData.humanIntervention.approvals.pending).toBe(0);
  });

  it('Cost and labor value calculations are deterministic and follow formulas', () => {
    // Allocate an agent document summary task
    allocateTask(
      {
        title: 'Batch Doc Summary',
        task_type: 'document_summary',
        description: 'Auto summary task',
        target_agent_id: 'doc-agent-01'
      },
      { type: 'human', id: 'op-1' },
      db
    );

    const data = getLeadershipDashboard(undefined, undefined, db);
    // document_summary has human_minutes_estimate = 30. At $100/hr, each task adds $50.00
    expect(data.costAndValueEstimates.estimatedLaborValueCreatedUsd).toBeGreaterThanOrEqual(50.0);
    expect(data.costAndValueEstimates.netSyntheticValueUsd).toBe(
      parseFloat((data.costAndValueEstimates.estimatedLaborValueCreatedUsd - data.costAndValueEstimates.estimatedOperatingCostUsd).toFixed(2))
    );
  });
});
