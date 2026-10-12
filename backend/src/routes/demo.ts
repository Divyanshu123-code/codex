import { Router, Request, Response } from 'express';
import { seedDatabase } from '../db/seed.js';
import { resetSyntheticStorage } from '../tools/protectedTools.js';
import { routeAction } from '../engine/gateway.js';
import { decideApproval } from '../engine/approval.js';
import { getDatabase } from '../db/connection.js';

export const demoRouter = Router();

// POST /api/demo/reset - Clean environment reset & baseline seeding (Claim C4 / Section 6d)
demoRouter.post('/reset', (req: Request, res: Response) => {
  try {
    seedDatabase();
    resetSyntheticStorage();
    res.json({
      success: true,
      message: 'Demo environment successfully reset and re-seeded with synthetic unclassified baselines.',
      timestamp: Date.now()
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/demo/scenario/:name - Execute interactive demonstration scenario
demoRouter.post('/scenario/:name', (req: Request, res: Response) => {
  try {
    const scenario = req.params.name;
    const db = getDatabase();

    if (scenario === 'refund-threshold') {
      // 6000 refund exceeds 5000 limit -> REQUIRE_APPROVAL
      const result = routeAction({
        agent_id: 'agent-finance-refund-04',
        tool: 'refund_engine',
        operation: 'issue_refund',
        resource: 'synthetic://orders/ord-9021',
        parameters: { order_id: 'ord-9021', amount: 6000 }
      }, { type: 'agent', id: 'agent-finance-refund-04' }, db);

      return res.json({
        scenario: 'refund-threshold',
        expectedDecision: 'REQUIRE_APPROVAL',
        result
      });
    }

    if (scenario === 'refund-allow') {
      // 4000 refund <= 5000 limit -> ALLOW
      const result = routeAction({
        agent_id: 'agent-finance-refund-04',
        tool: 'refund_engine',
        operation: 'issue_refund',
        resource: 'synthetic://orders/ord-4011',
        parameters: { order_id: 'ord-4011', amount: 4000 }
      }, { type: 'agent', id: 'agent-finance-refund-04' }, db);

      return res.json({
        scenario: 'refund-allow',
        expectedDecision: 'ALLOW',
        result
      });
    }

    if (scenario === 'scenario-1') {
      const result = routeAction({
        agent_id: 'agent-pred-maint-01',
        tool: 'maintenance_scheduler',
        operation: 'create_maintenance_ticket',
        resource: 'synthetic://maintenance/turbine_unit_4',
        parameters: {
          equipment_id: 'turbine_unit_4',
          timestamp: Date.now(),
          vibration_rms: 4.2,
          bearing_temp_c: 72.5,
          urgency: 'SCHEDULED_ROUTINE'
        }
      }, { type: 'agent', id: 'agent-pred-maint-01' }, db);

      return res.json({ scenario: 'scenario-1', expectedDecision: 'ALLOW', result });
    }

    if (scenario === 'scenario-2') {
      const result = routeAction({
        agent_id: 'agent-pred-maint-01',
        tool: 'maintenance_scheduler',
        operation: 'create_maintenance_ticket',
        resource: 'synthetic://maintenance/turbine_unit_4',
        parameters: {
          equipment_id: 'turbine_unit_4',
          timestamp: Date.now() - 7200000, // 2 hours stale (>3600s)
          vibration_rms: 4.2,
          bearing_temp_c: 72.5
        }
      }, { type: 'agent', id: 'agent-pred-maint-01' }, db);

      return res.json({ scenario: 'scenario-2', expectedDecision: 'REQUIRE_APPROVAL', result });
    }

    if (scenario === 'scenario-3') {
      const result = routeAction({
        agent_id: 'agent-cyber-monitor-02',
        tool: 'credential_manager',
        operation: 'wipe_credentials',
        resource: 'synthetic://enclaves/perimeter_firewall',
        parameters: { reason: 'Unauthorized credential wipe attempt' }
      }, { type: 'agent', id: 'agent-cyber-monitor-02' }, db);

      return res.json({ scenario: 'scenario-3', expectedDecision: 'BLOCK', result });
    }

    if (scenario === 'scenario-4') {
      const result = routeAction({
        agent_id: 'agent-decision-support-03',
        tool: 'tactical_briefing_tool',
        operation: 'propose_tactical_recommendation',
        resource: 'synthetic://briefings/recon_synthesis_alpha',
        parameters: {
          report_id: 'REP-MULTI-SYNTH',
          source_id: 'COMBINED-FEED',
          timestamp: Date.now(),
          coordinates: '34.2N, 45.1E',
          observation: 'Multi-source intelligence reconnaissance vector',
          conflict_detected: true,
          conflicting_sources: ['UAV-SURV-1', 'SAT-PASS-2']
        }
      }, { type: 'agent', id: 'agent-decision-support-03' }, db);

      return res.json({ scenario: 'scenario-4', expectedDecision: 'REQUIRE_APPROVAL', result });
    }

    res.status(404).json({ error: `Unknown demo scenario: ${scenario}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
