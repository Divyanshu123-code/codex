import React, { useState } from 'react';
import type { Agent } from '../types';

interface AgentsViewProps {
  agents: Agent[];
  onPauseAgent: (agentId: string, reason: string) => Promise<void>;
  onResumeAgent: (agentId: string, reason: string) => Promise<void>;
  selectedAgentId?: string | null;
}

export const AgentsView: React.FC<AgentsViewProps> = ({
  agents,
  onPauseAgent,
  onResumeAgent,
  selectedAgentId
}) => {
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(
    selectedAgentId ? agents.find(a => a.id === selectedAgentId) || agents[0] || null : agents[0] || null
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [riskFilter, setRiskFilter] = useState<string>('all');

  // Pause Modal State
  const [isPauseModalOpen, setIsPauseModalOpen] = useState(false);
  const [pauseTargetAgent, setPauseTargetAgent] = useState<Agent | null>(null);
  const [pauseReason, setPauseReason] = useState('Manual containment by lead reviewer');
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Resume Modal State
  const [isResumeModalOpen, setIsResumeModalOpen] = useState(false);
  const [resumeTargetAgent, setResumeTargetAgent] = useState<Agent | null>(null);
  const [resumeReason, setResumeReason] = useState('Preconditions verified; mission readiness clear');

  const filteredAgents = agents.filter(a => {
    const matchesSearch = 
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (a.purpose && a.purpose.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesCat = categoryFilter === 'all' || a.agent_category === categoryFilter;
    const matchesStatus = statusFilter === 'all' || a.status === statusFilter;
    const matchesRisk = riskFilter === 'all' || (a.risk_level === riskFilter || a.risk_category === riskFilter);

    return matchesSearch && matchesCat && matchesStatus && matchesRisk;
  });

  const totalCount = agents.length;
  const activeCount = agents.filter(a => a.status === 'active').length;
  const restrictedCount = agents.filter(a => a.status === 'restricted').length;
  const pausedCount = agents.filter(a => a.status === 'paused').length;

  const handleOpenPauseModal = (agent: Agent) => {
    setPauseTargetAgent(agent);
    setActionError(null);
    setIsPauseModalOpen(true);
  };

  const handleConfirmPause = async () => {
    if (!pauseTargetAgent) return;
    setIsActionLoading(true);
    setActionError(null);
    try {
      await onPauseAgent(pauseTargetAgent.id, pauseReason);
      setIsPauseModalOpen(false);
      // update local selection if active
      if (selectedAgent?.id === pauseTargetAgent.id) {
        setSelectedAgent(prev => prev ? { ...prev, status: 'paused' } : null);
      }
    } catch (err: any) {
      setActionError(err.message || 'Failed to pause agent');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleOpenResumeModal = (agent: Agent) => {
    setResumeTargetAgent(agent);
    setActionError(null);
    setIsResumeModalOpen(true);
  };

  const handleConfirmResume = async () => {
    if (!resumeTargetAgent) return;
    setIsActionLoading(true);
    setActionError(null);
    try {
      await onResumeAgent(resumeTargetAgent.id, resumeReason);
      setIsResumeModalOpen(false);
      if (selectedAgent?.id === resumeTargetAgent.id) {
        setSelectedAgent(prev => prev ? { ...prev, status: 'active' } : null);
      }
    } catch (err: any) {
      setActionError(err.message || 'Failed to resume agent: Central gate preconditions unmet');
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <div className="flex flex-col w-full space-y-6">
      
      {/* Page Title & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Autonomous Agents Fleet
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-3xl">
            Autonomous defence agent registry, policy assignments, runtime statuses, and operational preconditions.
          </p>
        </div>
      </div>

      {/* Summary Metrics Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-500 font-medium">Total Registered</span>
          <div className="text-2xl font-bold text-slate-900 mt-2">{totalCount}</div>
          <span className="text-[0.6875rem] text-slate-500 mt-1 block">Monitored fleet</span>
        </div>
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
          <span className="text-xs text-emerald-700 font-medium">Active Fleet</span>
          <div className="text-2xl font-bold text-emerald-600 mt-2">{activeCount}</div>
          <span className="text-[0.6875rem] text-slate-500 mt-1 block">Operating within boundaries</span>
        </div>
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
          <span className="text-xs text-amber-800 font-medium">Restricted</span>
          <div className="text-2xl font-bold text-amber-700 mt-2">{restrictedCount}</div>
          <span className="text-[0.6875rem] text-slate-500 mt-1 block">Mandatory approval escalation</span>
        </div>
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
          <span className="text-xs text-rose-700 font-medium">Contained / Paused</span>
          <div className="text-2xl font-bold text-rose-600 mt-2">{pausedCount}</div>
          <span className="text-[0.6875rem] text-slate-500 mt-1 block">Zero execution authority</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex-1 min-w-[240px]">
          <div className="relative flex items-center">
            <span className="material-symbols-outlined absolute left-3 text-slate-400 pointer-events-none text-[1.125rem]">
              search
            </span>
            <input 
              type="text"
              placeholder="Search agent by name, ID, or purpose..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 pl-10 pr-3 py-1.5 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select 
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="all">All Categories</option>
            <option value="predictive_maintenance">Predictive Maintenance</option>
            <option value="cybersecurity_monitoring">Cybersecurity Monitoring</option>
            <option value="decision_support">Decision Support</option>
            <option value="document_analysis">Document Analysis</option>
          </select>

          <select 
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="restricted">Restricted</option>
            <option value="paused">Paused</option>
          </select>

          <select 
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="all">All Risk Tiers</option>
            <option value="low">Low Risk</option>
            <option value="moderate">Moderate Risk</option>
            <option value="high">High Risk</option>
            <option value="critical">Critical Risk</option>
          </select>
        </div>
      </div>

      {/* Main Dual Work Area: Table on Left + Inspector Drawer on Right */}
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        
        {/* Left: Agent Registry Table */}
        <div className="flex-1 w-full bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[0.625rem] font-bold">
                  <th className="py-3 px-4">Agent Identification</th>
                  <th className="py-3 px-3">Category</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Risk Tier</th>
                  <th className="py-3 px-3">Owner Team</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAgents.map((agent) => {
                  const isSelected = selectedAgent?.id === agent.id;
                  return (
                    <tr 
                      key={agent.id}
                      onClick={() => setSelectedAgent(agent)}
                      className={`hover:bg-slate-50/70 cursor-pointer transition-colors ${
                        isSelected ? 'bg-indigo-50/50' : ''
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <span className={`material-symbols-outlined text-[1.25rem] ${
                            agent.status === 'paused' 
                              ? 'text-rose-500' 
                              : agent.status === 'restricted'
                              ? 'text-amber-500'
                              : 'text-indigo-600'
                          }`}>
                            smart_toy
                          </span>
                          <div>
                            <div className="font-bold text-slate-900">{agent.name}</div>
                            <div className="font-mono text-[0.6875rem] text-slate-400">{agent.id}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-3">
                        <span className="font-mono text-[0.6875rem] text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
                          {agent.agent_category || 'general'}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[0.625rem] font-mono font-bold uppercase ${
                          agent.status === 'active' 
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : agent.status === 'restricted'
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : 'bg-rose-100 text-rose-800 border border-rose-300'
                        }`}>
                          {agent.status}
                        </span>
                      </td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 rounded text-[0.625rem] font-semibold bg-slate-100 text-slate-700">
                          {agent.risk_level || agent.risk_category || 'low'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-slate-600 font-mono text-[0.6875rem]">
                        {agent.owner_team || agent.team || 'Defence Ops'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setSelectedAgent(agent)}
                            className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-[0.6875rem] transition-colors"
                          >
                            Inspect Spec
                          </button>
                          {agent.status === 'paused' ? (
                            <button
                              onClick={() => handleOpenResumeModal(agent)}
                              className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-[0.6875rem] transition-colors flex items-center gap-1 shadow-sm"
                            >
                              <span className="material-symbols-outlined text-[0.875rem]">play_circle</span>
                              Resume
                            </button>
                          ) : (
                            <button
                              onClick={() => handleOpenPauseModal(agent)}
                              className="px-2.5 py-1 rounded bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-medium text-[0.6875rem] transition-colors flex items-center gap-1"
                            >
                              <span className="material-symbols-outlined text-[0.875rem]">pause_circle</span>
                              Pause
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Slide-out Agent Details Inspection Drawer / Panel */}
        {selectedAgent && (
          <div className="w-full lg:w-[480px] xl:w-[520px] bg-white border border-slate-200 rounded-xl shadow-sm flex flex-col shrink-0">
            
            {/* Drawer Header */}
            <div className="p-4 bg-slate-50/80 rounded-t-xl border-b border-slate-200 flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="px-2 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-700 font-mono text-[0.6875rem] font-bold">
                    {selectedAgent.id}
                  </span>
                  <span className="text-slate-300">•</span>
                  <span className="font-mono text-[0.6875rem] text-slate-500 uppercase">
                    {selectedAgent.agent_category || 'defence_support'}
                  </span>
                </div>
                <h2 className="text-base font-bold text-slate-900 leading-tight">
                  {selectedAgent.name}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Custodian: {selectedAgent.owner_team || selectedAgent.team || 'Defence Systems Ops'}
                </p>
              </div>
            </div>

            {/* Drawer Body Content */}
            <div className="p-4 space-y-4 max-h-[calc(100vh-14rem)] overflow-y-auto text-xs">
              
              {/* Governance Execution Boundary Notice */}
              <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-lg">
                <div className="flex items-start gap-2.5">
                  <span className="material-symbols-outlined text-[1.125rem] text-indigo-700 shrink-0 mt-0.5">
                    verified_user
                  </span>
                  <div>
                    <span className="font-mono text-[0.625rem] font-bold uppercase tracking-wider text-slate-700 block mb-0.5">
                      Deterministic Governance Boundary
                    </span>
                    <p className="text-[0.6875rem] text-slate-600 leading-relaxed">
                      Agent status <strong className="text-indigo-700">{selectedAgent.status.toUpperCase()}</strong> does NOT grant unrestricted execution. All actions are intercepted by deterministic policy gates, freshness checks, and HMAC tool boundaries.
                    </p>
                  </div>
                </div>
              </div>

              {/* Status and Action Trigger */}
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-between">
                <div>
                  <span className="font-mono text-[0.625rem] text-slate-400 uppercase tracking-wider block">
                    Operational Status
                  </span>
                  <div className="mt-1 flex items-center gap-1.5">
                    <span className={`px-2.5 py-0.5 rounded text-[0.6875rem] font-mono font-bold uppercase ${
                      selectedAgent.status === 'active' 
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : selectedAgent.status === 'restricted'
                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                        : 'bg-rose-100 text-rose-800 border border-rose-300'
                    }`}>
                      {selectedAgent.status}
                    </span>
                  </div>
                </div>
                {selectedAgent.status === 'paused' ? (
                  <button 
                    onClick={() => handleOpenResumeModal(selectedAgent)}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold text-xs transition-all shadow-sm flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[1rem]">play_circle</span>
                    Resume Agent
                  </button>
                ) : (
                  <button 
                    onClick={() => handleOpenPauseModal(selectedAgent)}
                    className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-semibold text-xs transition-all shadow-sm flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[1rem]">pause_circle</span>
                    Pause Agent
                  </button>
                )}
              </div>

              {/* Operational Purpose */}
              <div>
                <span className="font-mono text-[0.625rem] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Operational Purpose & Demarcation
                </span>
                <p className="text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-200 leading-relaxed">
                  {selectedAgent.purpose || 'Autonomous processing and support within designated synthetic domain.'}
                </p>
              </div>

              {/* Permitted Operations */}
              <div>
                <span className="font-mono text-[0.625rem] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Permitted Operations ({selectedAgent.allowed_operations?.length || 0})
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {selectedAgent.allowed_operations?.map((op, idx) => (
                    <span key={idx} className="font-mono text-[0.6875rem] bg-indigo-50 border border-indigo-200 text-indigo-700 px-2 py-0.5 rounded">
                      {op}
                    </span>
                  ))}
                </div>
              </div>

              {/* Resource Perimeters */}
              <div>
                <span className="font-mono text-[0.625rem] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Authorized Resource Perimeters
                </span>
                <div className="flex flex-col gap-1">
                  {selectedAgent.allowed_resources?.map((res, idx) => (
                    <code key={idx} className="font-mono text-[0.6875rem] text-slate-700 bg-slate-100 px-2 py-1 rounded block truncate">
                      {res}
                    </code>
                  ))}
                </div>
              </div>

              {/* Input Preconditions & Freshness Window */}
              {selectedAgent.input_requirements && Object.keys(selectedAgent.input_requirements).length > 0 && (
                <div>
                  <span className="font-mono text-[0.625rem] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                    Input Quality Preconditions & Range Bounds
                  </span>
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5">
                    {selectedAgent.input_requirements.max_age_seconds && (
                      <div className="flex items-center justify-between text-[0.6875rem]">
                        <span className="text-slate-500">Freshness Window:</span>
                        <span className="font-mono font-bold text-indigo-700">
                          ≤ {selectedAgent.input_requirements.max_age_seconds} seconds
                        </span>
                      </div>
                    )}
                    {selectedAgent.input_requirements.required_fields && (
                      <div className="text-[0.6875rem]">
                        <span className="text-slate-500 block mb-0.5">Required Fields:</span>
                        <span className="font-mono text-slate-700">
                          {selectedAgent.input_requirements.required_fields.join(', ')}
                        </span>
                      </div>
                    )}
                    {selectedAgent.input_requirements.ranges && (
                      <div className="pt-1 border-t border-slate-200 text-[0.6875rem]">
                        <span className="text-slate-500 block mb-1">Valid Range Boundaries:</span>
                        {Object.entries(selectedAgent.input_requirements.ranges).map(([k, v]: [string, any]) => (
                          <div key={k} className="flex justify-between text-[0.625rem] font-mono text-slate-600">
                            <span>{k}:</span>
                            <span className="font-bold text-slate-800">[{v.min} .. {v.max}]</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Uncertainty Rule */}
              {selectedAgent.uncertainty_rule && Object.keys(selectedAgent.uncertainty_rule).length > 0 && (
                <div>
                  <span className="font-mono text-[0.625rem] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                    Uncertainty Policy (Never Fabricates Confidence)
                  </span>
                  <div className="p-2.5 bg-amber-50/50 border border-amber-200 rounded-lg text-[0.6875rem]">
                    <div className="flex justify-between">
                      <span className="text-amber-800">Minimum Confidence:</span>
                      <span className="font-mono font-bold text-amber-900">
                        ≥ {selectedAgent.uncertainty_rule.min_confidence || selectedAgent.uncertainty_rule.threshold || 0.85}
                      </span>
                    </div>
                    <p className="text-amber-800/80 mt-1 text-[0.625rem]">
                      Rule: {selectedAgent.uncertainty_rule.action_on_uncertain || 'HOLD_FOR_HUMAN'} — Halts autonomous execution if model uncertainty is high or metadata is missing.
                    </p>
                  </div>
                </div>
              )}

              {/* Workflow Steps */}
              {selectedAgent.workflow_config && selectedAgent.workflow_config.length > 0 && (
                <div>
                  <span className="font-mono text-[0.625rem] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                    Configured Workflow Pipeline Steps ({selectedAgent.workflow_config.length})
                  </span>
                  <div className="space-y-1.5">
                    {selectedAgent.workflow_config.map((step, idx) => (
                      <div key={idx} className="p-2 bg-slate-50 border border-slate-200 rounded flex items-center justify-between text-[0.6875rem]">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-[0.625rem] text-slate-400">#{idx + 1}</span>
                          <span className="font-mono font-semibold text-indigo-700">{step.operation}</span>
                        </div>
                        <span className="font-mono text-[0.625rem] text-slate-500 truncate max-w-[200px]">
                          {step.resource}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

      </div>

      {/* Interactive Modal: Confirm Agent Pause Dialog */}
      {isPauseModalOpen && pauseTargetAgent && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[1.5rem]">pause_circle</span>
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Confirm Agent Containment Pause</h3>
                <p className="font-mono text-xs text-slate-500">Target: {pauseTargetAgent.id}</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Pausing <strong className="text-slate-900">{pauseTargetAgent.name}</strong> will deterministically block all subsequent action dispatches across all tools and trigger an audit containment event.
            </p>

            <div>
              <label className="font-mono text-[0.625rem] text-slate-500 uppercase tracking-wider block mb-1 font-semibold">
                Reason for Containment Pause (Mandatory)
              </label>
              <textarea 
                rows={2}
                value={pauseReason}
                onChange={(e) => setPauseReason(e.target.value)}
                className="w-full text-xs p-2 rounded-lg bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-rose-500 text-slate-900"
              />
            </div>

            {actionError && (
              <div className="p-2 rounded bg-rose-50 border border-rose-200 text-rose-700 text-xs font-mono">
                {actionError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button 
                onClick={() => setIsPauseModalOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleConfirmPause}
                disabled={isActionLoading || !pauseReason.trim()}
                className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-colors flex items-center gap-1.5 shadow-sm"
              >
                {isActionLoading ? 'Pausing...' : 'Confirm Containment Pause'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Interactive Modal: Confirm Agent Resume Dialog */}
      {isResumeModalOpen && resumeTargetAgent && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[1.5rem]">play_circle</span>
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Central Resume Gate Verification</h3>
                <p className="font-mono text-xs text-slate-500">Target: {resumeTargetAgent.id}</p>
              </div>
            </div>

            <div className="p-2.5 bg-indigo-50 border border-indigo-100 rounded-lg text-xs text-slate-700">
              <span className="font-mono text-[0.625rem] font-bold uppercase text-indigo-700 block mb-0.5">
                Central Resume Preconditions (R1–R9)
              </span>
              Resuming requires that any open incidents have verified closed signatures and approved sandbox corrections.
            </div>

            <div>
              <label className="font-mono text-[0.625rem] text-slate-500 uppercase tracking-wider block mb-1 font-semibold">
                Reason for Resumption (Mandatory)
              </label>
              <textarea 
                rows={2}
                value={resumeReason}
                onChange={(e) => setResumeReason(e.target.value)}
                className="w-full text-xs p-2 rounded-lg bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 text-slate-900"
              />
            </div>

            {actionError && (
              <div className="p-2.5 rounded bg-rose-50 border border-rose-200 text-rose-700 text-xs font-mono">
                {actionError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button 
                onClick={() => setIsResumeModalOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleConfirmResume}
                disabled={isActionLoading || !resumeReason.trim()}
                className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center gap-1.5 shadow-sm"
              >
                {isActionLoading ? 'Evaluating Gate...' : 'Verify Gate & Resume Agent'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
