import React, { useState } from 'react';
import type { Tab } from '../types';
import { parseJsonSafe } from '../utils';

interface ScenarioLauncherModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefresh: () => void;
  onNavigateTab: (tab: Tab) => void;
  onSelectApproval: (id: string) => void;
  onSelectIncident: (id: string) => void;
}

export const ScenarioLauncherModal: React.FC<ScenarioLauncherModalProps> = ({
  isOpen,
  onClose,
  onRefresh,
  onNavigateTab,
  onSelectApproval,
  onSelectIncident
}) => {
  const [isRunning, setIsRunning] = useState(false);
  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [scenarioOutput, setScenarioOutput] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const scenarios = [
    {
      id: 'scenario_1',
      title: 'Scenario 1: Permitted Maintenance Ticket',
      agent: 'agent-pred-maint-01',
      operation: 'create_maintenance_ticket',
      description: 'Synthetic turbine telemetry is fresh (now), vibration (4.5 Hz) and bearing temp (68°C) are within bounds.',
      expected: 'ALLOW',
      color: 'border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50',
      payload: {
        agentId: 'agent-pred-maint-01',
        tool: 'maintenance_scheduler',
        operation: 'create_maintenance_ticket',
        resource: 'synthetic://maintenance/scheduled_tickets',
        parameters: {
          equipment_id: 'turbine_unit_4',
          telemetry: {
            equipment_id: 'turbine_unit_4',
            timestamp: Date.now(),
            vibration_rms: 4.5,
            bearing_temp_c: 68.2,
            hydraulic_pressure_psi: 2100,
            model_confidence: 0.95
          },
          model_confidence: 0.95
        }
      }
    },
    {
      id: 'scenario_2',
      title: 'Scenario 2: Stale Telemetry Hold',
      agent: 'agent-pred-maint-01',
      operation: 'create_maintenance_ticket',
      description: 'Telemetry sensor timestamp is stale (age > 3600s). Quality gate halts action for human review.',
      expected: 'REQUIRE_APPROVAL',
      color: 'border-amber-200 bg-amber-50/50 hover:bg-amber-50',
      payload: {
        agentId: 'agent-pred-maint-01',
        tool: 'maintenance_scheduler',
        operation: 'create_maintenance_ticket',
        resource: 'synthetic://maintenance/scheduled_tickets',
        parameters: {
          equipment_id: 'turbine_unit_4',
          telemetry: {
            equipment_id: 'turbine_unit_4',
            timestamp: Date.now() - 5000000, // Stale
            vibration_rms: 4.5,
            bearing_temp_c: 68.2,
            hydraulic_pressure_psi: 2100,
            model_confidence: 0.92
          },
          model_confidence: 0.92
        }
      }
    },
    {
      id: 'scenario_2a',
      title: 'Scenario 2A: Missing Mandatory Telemetry',
      agent: 'agent-pred-maint-01',
      operation: 'create_maintenance_ticket',
      description: 'Telemetry payload omits mandatory bearing_temp_c and hydraulic_pressure_psi fields.',
      expected: 'BLOCK',
      color: 'border-rose-200 bg-rose-50/50 hover:bg-rose-50',
      payload: {
        agentId: 'agent-pred-maint-01',
        tool: 'maintenance_scheduler',
        operation: 'create_maintenance_ticket',
        resource: 'synthetic://maintenance/scheduled_tickets',
        parameters: {
          equipment_id: 'turbine_unit_4',
          telemetry: {
            equipment_id: 'turbine_unit_4',
            timestamp: Date.now()
            // Missing bearing_temp_c & hydraulic_pressure_psi
          },
          model_confidence: 0.90
        }
      }
    },
    {
      id: 'scenario_2c',
      title: 'Scenario 2C: Out-of-Bounds Sensor Values',
      agent: 'agent-pred-maint-01',
      operation: 'create_maintenance_ticket',
      description: 'Vibration sensor reports 28.5 RMS (permitted max is 15.0). Range check fails and halts proposal.',
      expected: 'BLOCK',
      color: 'border-rose-200 bg-rose-50/50 hover:bg-rose-50',
      payload: {
        agentId: 'agent-pred-maint-01',
        tool: 'maintenance_scheduler',
        operation: 'create_maintenance_ticket',
        resource: 'synthetic://maintenance/scheduled_tickets',
        parameters: {
          equipment_id: 'turbine_unit_4',
          telemetry: {
            equipment_id: 'turbine_unit_4',
            timestamp: Date.now(),
            vibration_rms: 28.5, // Exceeds 15
            bearing_temp_c: 72.5,
            hydraulic_pressure_psi: 2100,
            model_confidence: 0.90
          },
          model_confidence: 0.90
        }
      }
    },
    {
      id: 'scenario_3',
      title: 'Scenario 3: Prohibited Cyber Action',
      agent: 'agent-cyber-monitor-02',
      operation: 'wipe_credentials',
      description: 'Cyber agent attempts high-impact credential purge. Irrevocably blocked, agent paused, incident opened.',
      expected: 'BLOCK',
      color: 'border-rose-200 bg-rose-50/50 hover:bg-rose-50',
      payload: {
        agentId: 'agent-cyber-monitor-02',
        tool: 'firewall_purger',
        operation: 'wipe_credentials',
        resource: 'synthetic://dmz/auth_store',
        parameters: {
          target: 'synthetic-perimeter-vault',
          force: true
        }
      }
    },
    {
      id: 'scenario_4',
      title: 'Scenario 4: Conflicting Reconnaissance Reports',
      agent: 'agent-decision-support-03',
      operation: 'propose_tactical_recommendation',
      description: 'UAV-SURV-1 reports bridge intact; SAT-PASS-2 reports bridge destroyed. Contradiction held for human.',
      expected: 'REQUIRE_APPROVAL',
      color: 'border-amber-200 bg-amber-50/50 hover:bg-amber-50',
      payload: {
        agentId: 'agent-decision-support-03',
        tool: 'tactical_briefing',
        operation: 'propose_tactical_recommendation',
        resource: 'synthetic://briefings/tactical_update_01',
        parameters: {
          multi_source_reports: [
            {
              source_id: 'UAV-SURV-1',
              report_id: 'REP-ALPHA-01',
              timestamp: Date.now() - 300000,
              coordinates: '34.2N, 45.1E',
              observation: 'Target Alpha Bridge intact; primary transit open'
            },
            {
              source_id: 'SAT-PASS-2',
              report_id: 'REP-BRAVO-02',
              timestamp: Date.now() - 200000,
              coordinates: '34.2N, 45.1E',
              observation: 'Target Alpha Bridge destroyed; impassable'
            }
          ],
          provenance_reliability: 0.88,
          recommendation: 'Proceed across Target Alpha Bridge'
        }
      }
    },
    {
      id: 'scenario_6',
      title: 'Scenario 6: Delegated Financial Refund ($4,000 <= $5,000)',
      agent: 'agent-finance-refund-04',
      operation: 'issue_refund',
      description: 'Customer refund of $4,000 is under max_auto_amount ($5,000). Evaluator issues ALLOW and synthetic ledger records payout.',
      expected: 'ALLOW',
      color: 'border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50',
      payload: {
        agentId: 'agent-finance-refund-04',
        tool: 'finance_gateway',
        operation: 'issue_refund',
        resource: 'synthetic://finance/refunds/tx-4000',
        parameters: {
          order_id: 'ord-synth-4000',
          amount: 4000.0,
          idempotency_key: 'idemp-tx-4000-' + Date.now()
        }
      }
    },
    {
      id: 'scenario_7',
      title: 'Scenario 7: Policy Threshold Exceeded ($6,000 > $5,000)',
      agent: 'agent-finance-refund-04',
      operation: 'issue_refund',
      description: 'Refund amount $6,000 breaches autonomous threshold ($5,000). Evaluator requires approval and auto-creates immutable scenario backup.',
      expected: 'REQUIRE_APPROVAL',
      color: 'border-amber-200 bg-amber-50/50 hover:bg-amber-50',
      payload: {
        agentId: 'agent-finance-refund-04',
        tool: 'finance_gateway',
        operation: 'issue_refund',
        resource: 'synthetic://finance/refunds/tx-6000',
        parameters: {
          order_id: 'ord-synth-6000',
          amount: 6000.0,
          idempotency_key: 'idemp-tx-6000-' + Date.now()
        }
      }
    }
  ];

  const runScenario = async (sc: typeof scenarios[0]) => {
    setIsRunning(true);
    setActiveScenarioId(sc.id);
    setScenarioOutput(null);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/actions/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sc.payload)
      });
      const data = await parseJsonSafe(res);
      if (!res.ok) {
        throw new Error(data?.error || `Scenario execution failed (${res.status} ${res.statusText})`);
      }
      setScenarioOutput(data);
      onRefresh();
    } catch (err: any) {
      setErrorMessage(err.message || 'Execution failed');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm">
              <span className="material-symbols-outlined text-[1.5rem]">rocket_launch</span>
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                AegisOS Synthetic Governance Scenario Launcher
              </h2>
              <p className="text-xs text-slate-500">
                Trigger verifiable multi-agent scenarios to test deterministic gating, evidence checks, threshold holds, and human approvals.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={async () => {
                try {
                  setIsRunning(true);
                  const res = await fetch('/api/demo/reset', { method: 'POST' });
                  const data = await parseJsonSafe(res);
                  if (!res.ok) {
                    throw new Error(data?.error || `Failed to reset demo (${res.status})`);
                  }
                  onRefresh();
                  setScenarioOutput({ message: 'Demo environment reset and re-seeded successfully.' });
                } catch (err: any) {
                  setErrorMessage('Failed to reset demo: ' + err.message);
                } finally {
                  setIsRunning(false);
                }
              }}
              disabled={isRunning}
              className="px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1 shadow-sm"
              title="Reset database to clean seed state"
            >
              <span className="material-symbols-outlined text-[1rem] text-slate-500">restart_alt</span>
              Reset Clean State
            </button>
            <button
              onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition-colors"
            >
              <span className="material-symbols-outlined text-[1.25rem]">close</span>
            </button>
          </div>
        </div>

        {/* Modal Body: Scenarios Grid */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {scenarios.map((sc) => (
              <div 
                key={sc.id}
                className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between ${sc.color}`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-mono text-[0.6875rem] font-bold text-slate-600">
                      {sc.agent}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-[0.625rem] font-mono font-bold uppercase ${
                      sc.expected === 'ALLOW'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : sc.expected === 'REQUIRE_APPROVAL'
                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                        : 'bg-rose-100 text-rose-800 border border-rose-300'
                    }`}>
                      Expected: {sc.expected}
                    </span>
                  </div>
                  <h3 className="text-xs font-bold text-slate-900 mb-1">
                    {sc.title}
                  </h3>
                  <p className="text-[0.6875rem] text-slate-600 leading-relaxed mb-3">
                    {sc.description}
                  </p>
                </div>

                <button
                  onClick={() => runScenario(sc)}
                  disabled={isRunning}
                  className="w-full py-1.5 px-3 rounded-lg bg-slate-900 hover:bg-indigo-600 text-white text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 active:scale-98"
                >
                  <span className="material-symbols-outlined text-[1rem]">play_arrow</span>
                  {isRunning && activeScenarioId === sc.id ? 'Evaluating...' : 'Dispatch Action'}
                </button>
              </div>
            ))}
          </div>

          {/* Real-time Scenario Output Console */}
          {scenarioOutput && (
            <div className="p-4 rounded-xl bg-slate-900 text-slate-100 border border-slate-800 space-y-2 mt-4 text-xs font-mono">
              <div className="flex items-center justify-between text-emerald-400 font-bold border-b border-slate-800 pb-2">
                <span className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[1rem]">verified</span>
                  Gate Evaluation Result
                </span>
                <span className={`px-2 py-0.5 rounded text-[0.625rem] font-bold uppercase ${
                  scenarioOutput.gateDecision === 'ALLOW'
                    ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                    : scenarioOutput.gateDecision === 'REQUIRE_APPROVAL'
                    ? 'bg-amber-950 text-amber-400 border border-amber-800'
                    : 'bg-rose-950 text-rose-400 border border-rose-800'
                }`}>
                  Verdict: {scenarioOutput.gateDecision}
                </span>
              </div>

              <div className="text-[0.6875rem] text-slate-300 space-y-1">
                <div>Request ID: <span className="text-indigo-300">{scenarioOutput.requestId}</span></div>
                <div>Reason Code: <span className="text-amber-300">{scenarioOutput.gateReasonCode}</span></div>
                <div>Explanation: {scenarioOutput.explanation}</div>
                <div>Execution Status: {scenarioOutput.executionStatus}</div>
              </div>

              {scenarioOutput.gateDecision === 'REQUIRE_APPROVAL' && (
                <div className="pt-2 flex justify-end">
                  <button
                    onClick={() => {
                      onClose();
                      onSelectApproval(scenarioOutput.requestId);
                      onNavigateTab('approvals');
                    }}
                    className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded text-xs transition-colors"
                  >
                    Jump to Approval Review
                  </button>
                </div>
              )}

              {scenarioOutput.gateDecision === 'BLOCK' && scenarioOutput.gateReasonCode === 'POLICY_DECISION_BLOCK' && (
                <div className="pt-2 flex justify-end">
                  <button
                    onClick={() => {
                      onClose();
                      if (scenarioOutput.requestId) onSelectIncident(scenarioOutput.requestId);
                      onNavigateTab('incidents');
                    }}
                    className="px-3 py-1 bg-rose-500 hover:bg-rose-600 text-white font-bold rounded text-xs transition-colors"
                  >
                    Jump to Incident Containment
                  </button>
                </div>
              )}
            </div>
          )}

          {errorMessage && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-mono">
              {errorMessage}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span>Non-operational synthetic demonstration telemetry</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold transition-colors"
          >
            Close Launcher
          </button>
        </div>

      </div>
    </div>
  );
};
