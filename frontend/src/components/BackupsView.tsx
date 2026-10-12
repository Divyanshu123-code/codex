import React, { useState, useEffect } from 'react';
import type { ScenarioBackup, AgentBackup } from '../types';

interface BackupsViewProps {
  onRefresh: () => void;
}

export const BackupsView: React.FC<BackupsViewProps> = ({ onRefresh }) => {
  const [scenarioBackups, setScenarioBackups] = useState<ScenarioBackup[]>([]);
  const [agentBackups, setAgentBackups] = useState<AgentBackup[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'scenarios' | 'agents'>('scenarios');
  
  // Selected backup for detailed drawer or inspection
  const [selectedScenario, setSelectedScenario] = useState<ScenarioBackup | null>(null);
  
  // Reopen Modal State
  const [reopenTarget, setReopenTarget] = useState<ScenarioBackup | null>(null);
  const [reopenAdmin, setReopenAdmin] = useState<'usr-admin' | 'usr-admin-2'>('usr-admin');
  const [reopenReason, setReopenReason] = useState('Reopening following administrative audit review: verified legitimate operational request.');
  const [isSubmittingReopen, setIsSubmittingReopen] = useState(false);
  const [reopenError, setReopenError] = useState<string | null>(null);
  const [reopenSuccess, setReopenSuccess] = useState<string | null>(null);

  // Reinstate Modal State
  const [reinstateTarget, setReinstateTarget] = useState<AgentBackup | null>(null);
  const [reinstateAdmin, setReinstateAdmin] = useState<'usr-admin-2' | 'usr-admin'>('usr-admin-2');
  const [reinstateReason, setReinstateReason] = useState('Reinstating following governance review. Policy hash confirmed intact.');
  const [isSubmittingReinstate, setIsSubmittingReinstate] = useState(false);
  const [reinstateError, setReinstateError] = useState<string | null>(null);
  const [reinstateSuccess, setReinstateSuccess] = useState<string | null>(null);

  const fetchBackups = async () => {
    setIsLoading(true);
    try {
      const [scenariosRes, agentsRes] = await Promise.all([
        fetch('/api/backups'),
        fetch('/api/backups/agent-snapshots')
      ]);
      if (scenariosRes.ok) {
        const data = await scenariosRes.json();
        setScenarioBackups(data);
        if (data.length > 0 && !selectedScenario) {
          setSelectedScenario(data[0]);
        }
      }
      if (agentsRes.ok) {
        setAgentBackups(await agentsRes.json());
      }
    } catch (err) {
      console.error('Failed to fetch backup records:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchBackups();
  }, []);

  const handleReopen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reopenTarget) return;
    setIsSubmittingReopen(true);
    setReopenError(null);
    setReopenSuccess(null);

    try {
      const res = await fetch(`/api/backups/${reopenTarget.id}/reopen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: reopenReason,
          actor: { id: reopenAdmin, role: 'admin' }
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to reopen decision');
      }

      setReopenSuccess(`Decision successfully reopened! New Approval Queue ID: ${data.newApprovalId}`);
      await fetchBackups();
      onRefresh();
      setTimeout(() => {
        setReopenTarget(null);
        setReopenSuccess(null);
      }, 2000);
    } catch (err: any) {
      setReopenError(err.message);
    } finally {
      setIsSubmittingReopen(false);
    }
  };

  const handleReinstate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reinstateTarget) return;
    setIsSubmittingReinstate(true);
    setReinstateError(null);
    setReinstateSuccess(null);

    try {
      const res = await fetch(`/api/agents/${reinstateTarget.agent_id}/reinstate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actorRole: 'admin',
          actorId: reinstateAdmin,
          reason: reinstateReason
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to reinstate agent');
      }

      setReinstateSuccess(`Agent successfully reinstated to RESTRICTED status!`);
      await fetchBackups();
      onRefresh();
      setTimeout(() => {
        setReinstateTarget(null);
        setReinstateSuccess(null);
      }, 2000);
    } catch (err: any) {
      setReinstateError(err.message);
    } finally {
      setIsSubmittingReinstate(false);
    }
  };

  const totalBackups = scenarioBackups.length + agentBackups.length;
  const overturnedCount = scenarioBackups.filter(s => s.correction_status === 'CORRECTED').length;
  const reopenedPendingCount = scenarioBackups.filter(s => s.correction_status === 'REOPENED').length;

  return (
    <div className="flex flex-col w-full space-y-6">
      
      {/* Title & Description */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-indigo-600 text-[1.75rem]">settings_backup_restore</span>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Backups & Administrative Reinstatement
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-3xl">
            Immutable, SHA-256 cryptographically bound snapshots of policy-threat scenarios and human decisions. 
            Safely overturn erroneous human rejections or reinstate soft-terminated agents under strict dual-custody Separation of Duties.
          </p>
        </div>
        <button
          onClick={fetchBackups}
          disabled={isLoading}
          className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 shadow-sm self-start"
        >
          <span className={`material-symbols-outlined text-[1rem] ${isLoading ? 'animate-spin' : ''}`}>sync</span>
          Refresh Backups
        </button>
      </div>

      {/* Metrics Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
            <span className="material-symbols-outlined">inventory_2</span>
          </div>
          <div>
            <div className="text-[0.625rem] font-bold uppercase tracking-wider text-slate-400">Total Snapshots</div>
            <div className="text-xl font-bold text-slate-900">{totalBackups}</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
            <span className="material-symbols-outlined">pending_actions</span>
          </div>
          <div>
            <div className="text-[0.625rem] font-bold uppercase tracking-wider text-slate-400">Reopened Pending</div>
            <div className="text-xl font-bold text-amber-600">{reopenedPendingCount}</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
            <span className="material-symbols-outlined">published_with_changes</span>
          </div>
          <div>
            <div className="text-[0.625rem] font-bold uppercase tracking-wider text-slate-400">Decisions Overturned</div>
            <div className="text-xl font-bold text-emerald-600">{overturnedCount}</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-600">
            <span className="material-symbols-outlined">fingerprint</span>
          </div>
          <div>
            <div className="text-[0.625rem] font-bold uppercase tracking-wider text-slate-400">Audit Chain Binding</div>
            <div className="text-xs font-mono font-bold text-slate-800">SHA-256 Immutable</div>
          </div>
        </div>
      </div>

      {/* Subtabs: Scenario Backups vs Agent Fleet Snapshots */}
      <div className="flex border-b border-slate-200 gap-6 text-xs font-semibold">
        <button
          onClick={() => setActiveSubTab('scenarios')}
          className={`pb-3 border-b-2 flex items-center gap-2 transition-colors ${
            activeSubTab === 'scenarios'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span className="material-symbols-outlined text-[1.125rem]">assignment_late</span>
          Policy-Threat Scenario Backups ({scenarioBackups.length})
        </button>
        <button
          onClick={() => setActiveSubTab('agents')}
          className={`pb-3 border-b-2 flex items-center gap-2 transition-colors ${
            activeSubTab === 'agents'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <span className="material-symbols-outlined text-[1.125rem]">security</span>
          Agent Soft-Termination Snapshots ({agentBackups.length})
        </button>
      </div>

      {/* Subtab 1: Scenario Backups Table */}
      {activeSubTab === 'scenarios' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700">Captured Policy-Threat Events & Human Decisions</span>
              <span className="font-mono text-[0.6875rem] text-slate-500">{scenarioBackups.length} recorded</span>
            </div>
            
            {scenarioBackups.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs">
                No policy-threat scenario backups recorded yet. Launch Scenario 7 (Refund $6,000) from the Scenario Launcher to generate a snapshot.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/70 text-slate-500 font-mono text-[0.6875rem] border-b border-slate-200 uppercase">
                    <tr>
                      <th className="py-2.5 px-3">Request / Correlation</th>
                      <th className="py-2.5 px-3">Agent & Operation</th>
                      <th className="py-2.5 px-3">Gate Decision</th>
                      <th className="py-2.5 px-3">Human Call</th>
                      <th className="py-2.5 px-3">Correction</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {scenarioBackups.map((sb) => {
                      const isSelected = selectedScenario?.id === sb.id;
                      const humanDec = sb.human_decision;
                      const canReopen = humanDec?.decision === 'REJECTED' && sb.correction_status === 'NONE';

                      return (
                        <tr 
                          key={sb.id}
                          onClick={() => setSelectedScenario(sb)}
                          className={`hover:bg-slate-50/80 cursor-pointer transition-colors ${
                            isSelected ? 'bg-indigo-50/40' : ''
                          }`}
                        >
                          <td className="py-3 px-3">
                            <span className="font-mono font-bold text-slate-900 block">{sb.request_id}</span>
                            <span className="font-mono text-[0.625rem] text-slate-400">Corr: {sb.correlation_id?.substring(0, 16)}...</span>
                          </td>
                          <td className="py-3 px-3">
                            <span className="font-mono text-slate-800 font-semibold block">{sb.agent_id}</span>
                            <span className="font-mono text-[0.6875rem] text-indigo-700">{sb.operation}</span>
                          </td>
                          <td className="py-3 px-3">
                            <span className={`px-2 py-0.5 rounded text-[0.625rem] font-mono font-bold ${
                              sb.decision === 'REQUIRE_APPROVAL' ? 'bg-amber-100 text-amber-800' :
                              sb.decision === 'BLOCK' ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {sb.decision}
                            </span>
                            <span className="block font-mono text-[0.625rem] text-slate-500 mt-0.5 truncate max-w-[120px]" title={sb.reason_code}>
                              {sb.reason_code}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            {humanDec ? (
                              <div>
                                <span className={`px-1.5 py-0.5 rounded text-[0.625rem] font-mono font-bold ${
                                  humanDec.decision === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                                }`}>
                                  {humanDec.decision}
                                </span>
                                <span className="block text-[0.625rem] text-slate-500 font-mono mt-0.5">
                                  by {humanDec.approverId}
                                </span>
                              </div>
                            ) : (
                              <span className="font-mono text-[0.6875rem] text-slate-400">PENDING_CALL</span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <span className={`px-2 py-0.5 rounded text-[0.625rem] font-mono font-bold ${
                              sb.correction_status === 'CORRECTED' ? 'bg-emerald-100 text-emerald-800' :
                              sb.correction_status === 'REOPENED' ? 'bg-indigo-100 text-indigo-800' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                              {sb.correction_status}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-right">
                            {canReopen ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setReopenTarget(sb);
                                  setReopenError(null);
                                  setReopenSuccess(null);
                                }}
                                className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[0.6875rem] transition-colors shadow-sm"
                              >
                                Reopen for Re-review
                              </button>
                            ) : sb.correction_status === 'REOPENED' ? (
                              <span className="text-[0.6875rem] text-indigo-600 font-mono font-semibold">In Review Queue</span>
                            ) : sb.correction_status === 'CORRECTED' ? (
                              <span className="text-[0.6875rem] text-emerald-600 font-mono font-semibold">Overturned</span>
                            ) : (
                              <span className="text-[0.6875rem] text-slate-400 font-mono">No Action</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Details & Snapshot Hash Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-xs font-bold text-slate-800">Snapshot Integrity & Payload</span>
              <span className="material-symbols-outlined text-slate-400 text-[1.125rem]">fingerprint</span>
            </div>

            {selectedScenario ? (
              <div className="space-y-3 text-xs">
                <div>
                  <span className="text-[0.625rem] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                    Immutable Snapshot SHA-256 Hash
                  </span>
                  <div className="p-2 rounded bg-slate-900 text-emerald-400 font-mono text-[0.625rem] break-all border border-slate-800 select-all">
                    {selectedScenario.snapshot_hash}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[0.6875rem]">
                  <div>
                    <span className="text-slate-500 block">Policy ID:</span>
                    <span className="font-mono font-bold text-slate-800">{selectedScenario.policy_id}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Policy Version:</span>
                    <span className="font-mono text-slate-800">{selectedScenario.policy_version || '1.0.0'}</span>
                  </div>
                </div>

                <div>
                  <span className="text-[0.625rem] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                    Parameters Snapshot
                  </span>
                  <pre className="p-2 bg-slate-50 border border-slate-200 rounded font-mono text-[0.625rem] text-slate-800 max-h-36 overflow-auto">
                    {JSON.stringify(selectedScenario.parameters_snapshot, null, 2)}
                  </pre>
                </div>

                {selectedScenario.human_decision && (
                  <div className="p-2.5 bg-rose-50/70 border border-rose-200 rounded text-xs space-y-1">
                    <span className="text-[0.625rem] font-bold uppercase tracking-wider text-rose-800 block">
                      Human Rejection Record
                    </span>
                    <p className="text-[0.6875rem] text-rose-900">
                      <strong>Approver:</strong> {selectedScenario.human_decision.approverId}
                    </p>
                    <p className="text-[0.6875rem] text-rose-900">
                      <strong>Reason:</strong> {selectedScenario.human_decision.reason}
                    </p>
                  </div>
                )}

                {selectedScenario.correction_status === 'REOPENED' && selectedScenario.reopens_approval_id && (
                  <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded text-xs space-y-1">
                    <span className="text-[0.625rem] font-bold uppercase tracking-wider text-indigo-800 block">
                      Reopened Decision Trail
                    </span>
                    <p className="text-[0.6875rem] text-indigo-900 font-mono">
                      Active Approval: {selectedScenario.reopens_approval_id}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-10 text-slate-400 text-xs">
                Select a scenario backup record on the left to inspect its cryptographic snapshot.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Subtab 2: Agent Fleet Snapshots */}
      {activeSubTab === 'agents' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">Soft-Terminated Agent Fleet Snapshots</span>
            <span className="font-mono text-[0.6875rem] text-slate-500">{agentBackups.length} recorded</span>
          </div>

          {agentBackups.length === 0 ? (
            <div className="p-8 text-center text-slate-500 text-xs">
              No agent termination snapshots found. Terminated agents retain all policies and state, allowing safe administrative reinstatement.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50/70 text-slate-500 font-mono text-[0.6875rem] border-b border-slate-200 uppercase">
                  <tr>
                    <th className="py-2.5 px-3">Snapshot ID</th>
                    <th className="py-2.5 px-3">Agent ID</th>
                    <th className="py-2.5 px-3">Trigger Event</th>
                    <th className="py-2.5 px-3">Terminating Actor</th>
                    <th className="py-2.5 px-3">Reason</th>
                    <th className="py-2.5 px-3">Restored At</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {agentBackups.map((ab) => {
                    const isRestored = ab.restored_at !== null;
                    return (
                      <tr key={ab.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-3 font-mono font-bold text-slate-900">{ab.id}</td>
                        <td className="py-3 px-3 font-mono text-indigo-700 font-semibold">{ab.agent_id}</td>
                        <td className="py-3 px-3 font-mono text-slate-700">{ab.trigger_event}</td>
                        <td className="py-3 px-3 font-mono text-slate-800">{ab.actor?.id || 'usr-admin'}</td>
                        <td className="py-3 px-3 text-slate-600 max-w-xs truncate" title={ab.reason}>{ab.reason}</td>
                        <td className="py-3 px-3">
                          {isRestored ? (
                            <span className="px-2 py-0.5 rounded text-[0.625rem] font-mono font-bold bg-emerald-100 text-emerald-800">
                              RESTORED
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded text-[0.625rem] font-mono font-bold bg-amber-100 text-amber-800">
                              TERMINATED
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          {!isRestored ? (
                            <button
                              onClick={() => {
                                setReinstateTarget(ab);
                                setReinstateError(null);
                                setReinstateSuccess(null);
                              }}
                              className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[0.6875rem] transition-colors shadow-sm"
                            >
                              Reinstate Agent
                            </button>
                          ) : (
                            <span className="text-[0.6875rem] text-slate-400 font-mono">Restored</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal: Reopen Decision */}
      {reopenTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-indigo-600 text-[1.5rem]">restore_page</span>
                <h3 className="text-base font-bold text-slate-900">Reopen Decision for Dual-Custody Review</h3>
              </div>
              <button 
                onClick={() => setReopenTarget(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              You are overturning the erroneous rejection for request <strong>{reopenTarget.request_id}</strong>. 
              Under governance rule <strong>Section 6c (Separation of Duties)</strong>, the reviewer must be a different administrator than the original decider.
            </p>

            <form onSubmit={handleReopen} className="space-y-3">
              <div>
                <label className="text-[0.6875rem] font-semibold text-slate-700 block mb-1">
                  Reopening Administrator Identity (Must differ from {reopenTarget.human_decision?.approverId || 'original rejector'}):
                </label>
                <select
                  value={reopenAdmin}
                  onChange={(e: any) => setReopenAdmin(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg bg-slate-50 border border-slate-200 font-mono focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="usr-admin">usr-admin (System Administrator)</option>
                  <option value="usr-admin-2">usr-admin-2 (Secondary Governance Director)</option>
                </select>
              </div>

              <div>
                <label className="text-[0.6875rem] font-semibold text-slate-700 block mb-1">
                  Written Justification for Overturn (Mandatory for Audit Trail):
                </label>
                <textarea
                  rows={3}
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 focus:ring-1 focus:ring-indigo-500"
                  placeholder="Explain why the initial rejection was in error..."
                  required
                />
              </div>

              {reopenError && (
                <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-700 text-xs font-mono">
                  {reopenError}
                </div>
              )}

              {reopenSuccess && (
                <div className="p-2.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-mono">
                  {reopenSuccess}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setReopenTarget(null)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReopen}
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[1rem]">replay</span>
                  {isSubmittingReopen ? 'Reopening...' : 'Confirm Reopen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Reinstate Agent */}
      {reinstateTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-600 text-[1.5rem]">shield_person</span>
                <h3 className="text-base font-bold text-slate-900">Reinstate Soft-Terminated Agent</h3>
              </div>
              <button 
                onClick={() => setReinstateTarget(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Reinstating agent <strong>{reinstateTarget.agent_id}</strong> will restore it to <strong>RESTRICTED</strong> status 
              after cryptographically verifying policy hashes. Full resumption requires the central resume gate.
            </p>

            <form onSubmit={handleReinstate} className="space-y-3">
              <div>
                <label className="text-[0.6875rem] font-semibold text-slate-700 block mb-1">
                  Reinstating Administrator Identity (Must differ from {reinstateTarget.actor?.id || 'terminating admin'}):
                </label>
                <select
                  value={reinstateAdmin}
                  onChange={(e: any) => setReinstateAdmin(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg bg-slate-50 border border-slate-200 font-mono focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="usr-admin-2">usr-admin-2 (Secondary Governance Director)</option>
                  <option value="usr-admin">usr-admin (System Administrator)</option>
                </select>
              </div>

              <div>
                <label className="text-[0.6875rem] font-semibold text-slate-700 block mb-1">
                  Written Justification for Reinstatement:
                </label>
                <textarea
                  rows={3}
                  value={reinstateReason}
                  onChange={(e) => setReinstateReason(e.target.value)}
                  className="w-full text-xs p-2 rounded-lg bg-slate-50 border border-slate-200 text-slate-900 focus:ring-1 focus:ring-indigo-500"
                  placeholder="Explain why the agent should be restored..."
                  required
                />
              </div>

              {reinstateError && (
                <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-700 text-xs font-mono">
                  {reinstateError}
                </div>
              )}

              {reinstateSuccess && (
                <div className="p-2.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-mono">
                  {reinstateSuccess}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setReinstateTarget(null)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReinstate}
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[1rem]">check_circle</span>
                  {isSubmittingReinstate ? 'Reinstating...' : 'Confirm Reinstatement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
