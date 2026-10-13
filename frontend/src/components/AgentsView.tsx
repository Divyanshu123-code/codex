import React, { useState, useEffect } from 'react';
import type { Agent, Tab } from '../types';

interface AgentsViewProps {
  agents: Agent[];
  onPauseAgent: (agentId: string, reason: string) => Promise<void>;
  onResumeAgent: (agentId: string, reason: string) => Promise<void>;
  selectedAgentId?: string | null;
  onNavigateTab?: (tab: Tab) => void;
  onSelectApproval?: (approvalId: string) => void;
}

const HOST_SITE_AGENT_IDS = [
  'procurement-agent-01',
  'maint-planner-01',
  'cyber-monitor-01',
  'records-agent-01'
];

export const AgentsView: React.FC<AgentsViewProps> = ({
  agents,
  onPauseAgent,
  onResumeAgent,
  selectedAgentId,
  onNavigateTab,
  onSelectApproval
}) => {
  // Mode: Default to live website fleet
  const [fleetMode, setFleetMode] = useState<'live' | 'all'>('live');

  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(() => {
    if (selectedAgentId) {
      return agents.find(a => a.id === selectedAgentId) || null;
    }
    return agents.find(a => a.id === 'procurement-agent-01') || agents[0] || null;
  });

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

  // Sync selected agent when agents prop changes
  useEffect(() => {
    if (selectedAgentId) {
      const found = agents.find(a => a.id === selectedAgentId);
      if (found) setSelectedAgent(found);
    } else if (selectedAgent) {
      const updated = agents.find(a => a.id === selectedAgent.id);
      if (updated) setSelectedAgent(updated);
    } else if (agents.length > 0) {
      const defaultAgent = agents.find(a => a.id === 'procurement-agent-01') || agents[0];
      setSelectedAgent(defaultAgent);
    }
  }, [agents, selectedAgentId]);

  // When switching fleet modes, maintain a valid selected agent
  const handleFleetModeChange = (mode: 'live' | 'all') => {
    setFleetMode(mode);
    if (mode === 'live') {
      const isCurrentInLive = selectedAgent && HOST_SITE_AGENT_IDS.includes(selectedAgent.id);
      if (!isCurrentInLive) {
        const firstLive = agents.find(a => HOST_SITE_AGENT_IDS.includes(a.id));
        if (firstLive) setSelectedAgent(firstLive);
      }
    }
  };

  // Filter logic
  const displayedAgents = agents.filter(a => {
    if (fleetMode === 'live' && !HOST_SITE_AGENT_IDS.includes(a.id)) {
      return false;
    }

    const matchesSearch = 
      a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (a.purpose && a.purpose.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesCat = categoryFilter === 'all' || a.agent_category === categoryFilter;
    const matchesStatus = statusFilter === 'all' || a.status === statusFilter;
    const matchesRisk = riskFilter === 'all' || (a.risk_level === riskFilter || a.risk_category === riskFilter);

    return matchesSearch && matchesCat && matchesStatus && matchesRisk;
  }).sort((a, b) => {
    if (fleetMode === 'live') {
      const idxA = HOST_SITE_AGENT_IDS.indexOf(a.id);
      const idxB = HOST_SITE_AGENT_IDS.indexOf(b.id);
      return (idxA >= 0 ? idxA : 99) - (idxB >= 0 ? idxB : 99);
    }
    return 0;
  });

  // Telemetry Aggregates
  const liveFleetAgents = agents.filter(a => HOST_SITE_AGENT_IDS.includes(a.id));
  const totalQueueDepth = liveFleetAgents.reduce((acc, a) => acc + (a.telemetry?.pendingQueueSize || 0), 0);
  const totalLiveSpend = liveFleetAgents.find(a => a.id === 'procurement-agent-01')?.telemetry?.cumulativeSpendToday || 0;
  const activeCount = displayedAgents.filter(a => a.status === 'active').length;
  const restrictedCount = displayedAgents.filter(a => a.status === 'restricted').length;
  const pausedCount = displayedAgents.filter(a => a.status === 'paused').length;

  const formatRelativeTime = (ts?: number | null) => {
    if (!ts) return 'Never';
    const diffSec = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (diffSec < 5) return 'Just now';
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.round(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    return `${Math.round(diffMin / 60)}h ago`;
  };

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
          <div className="flex items-center gap-2 mb-1">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Autonomous Agent Fleet
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[0.625rem] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
              AegisOS Controlled
            </span>
          </div>
          <p className="text-xs text-slate-500 max-w-3xl">
            Live telemetry, queue depth, runtime execution boundaries, and dual-custody governance for Defence Logistics agents.
          </p>
        </div>

        {/* Fleet Mode Selector Tabs */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
          <button
            onClick={() => handleFleetModeChange('live')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
              fleetMode === 'live'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            Defence Operations Fleet (Website)
            <span className="px-1.5 py-0.2 rounded text-[0.625rem] font-mono bg-indigo-50 text-indigo-700">4</span>
          </button>

          <button
            onClick={() => handleFleetModeChange('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-2 ${
              fleetMode === 'all'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Registered Agents
            <span className="px-1.5 py-0.2 rounded text-[0.625rem] font-mono bg-slate-200 text-slate-700">
              {agents.length}
            </span>
          </button>
        </div>
      </div>

      {/* Summary Metrics Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {fleetMode === 'live' ? (
          <>
            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 font-medium">Live Website Agents</span>
                <span className="px-1.5 py-0.5 rounded text-[0.625rem] font-mono bg-emerald-50 text-emerald-700 border border-emerald-200">
                  port 4100
                </span>
              </div>
              <div className="text-2xl font-bold text-slate-900 mt-2">4 Active</div>
              <span className="text-[0.6875rem] text-slate-500 mt-1 block">Procurement, Maint, Cyber, Records</span>
            </div>

            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs text-indigo-700 font-medium">Work Queue Depth</span>
                <span className="material-symbols-outlined text-indigo-600 text-[1.125rem]">pending_actions</span>
              </div>
              <div className="text-2xl font-bold text-indigo-700 mt-2">{totalQueueDepth} Items</div>
              <span className="text-[0.6875rem] text-slate-500 mt-1 block">Queued across live workers</span>
            </div>

            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs text-amber-800 font-medium">Autonomous Spend (Today)</span>
                <span className="material-symbols-outlined text-amber-700 text-[1.125rem]">payments</span>
              </div>
              <div className="text-2xl font-bold text-amber-800 mt-2">
                ${totalLiveSpend.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <span className="text-[0.6875rem] text-slate-500 mt-1 block">Policy Threshold: $8,000 / PO</span>
            </div>

            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="text-xs text-emerald-700 font-medium">Operational Health</span>
                <span className="material-symbols-outlined text-emerald-600 text-[1.125rem]">verified</span>
              </div>
              <div className="text-2xl font-bold text-emerald-600 mt-2">{activeCount} / 4 Online</div>
              <span className="text-[0.6875rem] text-slate-500 mt-1 block">Heartbeat synced &lt;10s</span>
            </div>
          </>
        ) : (
          <>
            <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
              <span className="text-xs text-slate-500 font-medium">Total Registered</span>
              <div className="text-2xl font-bold text-slate-900 mt-2">{agents.length}</div>
              <span className="text-[0.6875rem] text-slate-500 mt-1 block">Monitored system catalog</span>
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
          </>
        )}
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
              placeholder={fleetMode === 'live' ? "Search website agents..." : "Search agent by name, ID, or purpose..."}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 pl-10 pr-3 py-1.5 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {fleetMode === 'all' && (
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
          )}

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
                  {fleetMode === 'live' ? (
                    <>
                      <th className="py-3 px-3">Live Queue</th>
                      <th className="py-3 px-3">Active Task</th>
                      <th className="py-3 px-3">Live Telemetry</th>
                      <th className="py-3 px-3">Heartbeat</th>
                      <th className="py-3 px-3">Status</th>
                    </>
                  ) : (
                    <>
                      <th className="py-3 px-3">Category</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-3">Risk Tier</th>
                      <th className="py-3 px-3">Owner Team</th>
                    </>
                  )}
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {displayedAgents.map((agent) => {
                  const isSelected = selectedAgent?.id === agent.id;
                  const isHost = HOST_SITE_AGENT_IDS.includes(agent.id);
                  const tel = agent.telemetry;

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
                          <div className="relative">
                            <span className={`material-symbols-outlined text-[1.375rem] ${
                              agent.status === 'paused' 
                                ? 'text-rose-500' 
                                : agent.status === 'restricted'
                                ? 'text-amber-500'
                                : 'text-indigo-600'
                            }`}>
                              smart_toy
                            </span>
                            {isHost && (
                              <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-white"></span>
                            )}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 flex items-center gap-1.5">
                              {agent.name}
                              {isHost && (
                                <span className="px-1.5 py-0.2 rounded text-[0.5625rem] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                                  SITE
                                </span>
                              )}
                            </div>
                            <div className="font-mono text-[0.6875rem] text-slate-400">{agent.id}</div>
                          </div>
                        </div>
                      </td>

                      {fleetMode === 'live' ? (
                        <>
                          {/* Live Queue Depth */}
                          <td className="py-3 px-3">
                            <span className={`px-2 py-0.5 rounded text-[0.625rem] font-mono font-semibold ${
                              (tel?.pendingQueueSize || 0) > 0 
                                ? 'bg-amber-100 text-amber-800 border border-amber-200' 
                                : 'bg-slate-100 text-slate-600'
                            }`}>
                              {tel?.pendingQueueSize || 0} pending
                            </span>
                          </td>

                          {/* Active Task / Current Item */}
                          <td className="py-3 px-3">
                            {tel?.currentWorkItem ? (
                              <div className="max-w-[150px]">
                                <span className="font-mono font-bold text-indigo-700 text-[0.6875rem] block truncate">
                                  {tel.currentWorkItem.id}
                                </span>
                                <span className="text-[0.625rem] text-slate-500 uppercase">
                                  {tel.currentWorkItem.status}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400 font-mono text-[0.625rem]">Idle / Polling</span>
                            )}
                          </td>

                          {/* Live Domain Telemetry */}
                          <td className="py-3 px-3">
                            {agent.id === 'procurement-agent-01' && (
                              <div>
                                <span className="font-mono font-bold text-slate-800 text-[0.6875rem]">
                                  ${(tel?.cumulativeSpendToday || 0).toLocaleString()}
                                </span>
                                <span className="text-[0.625rem] text-slate-500 block">Cap: $8,000 / PO</span>
                              </div>
                            )}
                            {agent.id === 'maint-planner-01' && (
                              <div>
                                <span className="font-mono font-bold text-slate-800 text-[0.6875rem]">
                                  {tel?.activeMaintenanceCount || 0} Work Orders
                                </span>
                                <span className="text-[0.625rem] text-slate-500 block">Active Assets</span>
                              </div>
                            )}
                            {agent.id === 'cyber-monitor-01' && (
                              <div>
                                <span className="font-mono font-bold text-slate-800 text-[0.6875rem]">
                                  {tel?.hostsCount || 3} Monitored
                                </span>
                                <span className="text-[0.625rem] text-slate-500 block">Perimeter Nodes</span>
                              </div>
                            )}
                            {agent.id === 'records-agent-01' && (
                              <div>
                                <span className="font-mono font-bold text-slate-800 text-[0.6875rem]">
                                  {tel?.recordsCount || 8} Logs
                                </span>
                                <span className="text-[0.625rem] text-slate-500 block">SHA-256 Archival</span>
                              </div>
                            )}
                          </td>

                          {/* Heartbeat Poll */}
                          <td className="py-3 px-3 text-slate-500 font-mono text-[0.6875rem]">
                            {formatRelativeTime(tel?.lastControlPoll)}
                          </td>

                          {/* Status */}
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
                        </>
                      ) : (
                        <>
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
                        </>
                      )}

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
                    {selectedAgent.agent_category || 'defence_operations'}
                  </span>
                  {HOST_SITE_AGENT_IDS.includes(selectedAgent.id) && (
                    <span className="px-1.5 py-0.2 rounded text-[0.5625rem] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      LIVE WEBSITE FLEET
                    </span>
                  )}
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
              
              {/* LIVE HOST-SITE TELEMETRY CARD */}
              {selectedAgent.telemetry && (
                <div className="p-3.5 bg-slate-900 text-slate-100 rounded-xl shadow-sm space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                      </span>
                      <span className="font-mono text-[0.6875rem] font-bold tracking-wide uppercase text-slate-200">
                        Host Telemetry (Port 4100)
                      </span>
                    </div>
                    <span className="font-mono text-[0.625rem] text-slate-400">
                      Heartbeat: {formatRelativeTime(selectedAgent.telemetry.lastControlPoll)}
                    </span>
                  </div>

                  {/* Telemetry Stats Grid */}
                  <div className="grid grid-cols-2 gap-2 text-[0.6875rem]">
                    <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700/60">
                      <span className="text-slate-400 block text-[0.625rem]">Work Queue</span>
                      <span className="font-mono font-bold text-emerald-400 text-sm">
                        {selectedAgent.telemetry.pendingQueueSize} items
                      </span>
                    </div>
                    <div className="bg-slate-800/80 p-2 rounded-lg border border-slate-700/60">
                      <span className="text-slate-400 block text-[0.625rem]">Config Version</span>
                      <span className="font-mono font-bold text-slate-200 text-sm">
                        {selectedAgent.telemetry.configVersion || 'v1.0.0'}
                      </span>
                    </div>
                  </div>

                  {/* Domain Specific Metric */}
                  {selectedAgent.id === 'procurement-agent-01' && (
                    <div className="p-2.5 bg-amber-950/40 border border-amber-800/50 rounded-lg">
                      <div className="flex items-center justify-between">
                        <span className="text-amber-300 font-semibold text-[0.6875rem]">Cumulative Spend Today:</span>
                        <span className="font-mono font-bold text-amber-200">
                          ${(selectedAgent.telemetry.cumulativeSpendToday || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <p className="text-[0.625rem] text-amber-400/80 mt-1 leading-relaxed">
                        Single order policy cap is $8,000. Orders exceeding this threshold require dual-custody human signoff in AegisOS.
                      </p>
                    </div>
                  )}

                  {/* Active Work Item */}
                  {selectedAgent.telemetry.currentWorkItem && (
                    <div className="p-2.5 bg-slate-800/90 border border-slate-700 rounded-lg space-y-1">
                      <div className="flex items-center justify-between text-[0.625rem]">
                        <span className="text-slate-400">Current Task:</span>
                        <span className="font-mono px-1.5 py-0.2 rounded bg-indigo-900/60 text-indigo-300 border border-indigo-700/50">
                          {selectedAgent.telemetry.currentWorkItem.status}
                        </span>
                      </div>
                      <div className="font-mono text-xs font-bold text-slate-200 truncate">
                        {selectedAgent.telemetry.currentWorkItem.id} ({selectedAgent.telemetry.currentWorkItem.type})
                      </div>
                    </div>
                  )}

                  {/* Most Recent Mutating Action */}
                  {selectedAgent.telemetry.lastAction && (
                    <div className="p-2.5 bg-slate-800/90 border border-slate-700 rounded-lg space-y-1.5">
                      <div className="flex items-center justify-between text-[0.625rem]">
                        <span className="text-slate-400">Latest Dispatched Action:</span>
                        <span className={`font-mono font-bold px-1.5 py-0.2 rounded ${
                          selectedAgent.telemetry.lastAction.decision === 'ALLOW'
                            ? 'bg-emerald-900/60 text-emerald-300'
                            : 'bg-amber-900/60 text-amber-300'
                        }`}>
                          {selectedAgent.telemetry.lastAction.decision}
                        </span>
                      </div>
                      <div className="font-mono text-[0.6875rem] text-slate-200 flex items-center justify-between">
                        <span className="text-indigo-300">{selectedAgent.telemetry.lastAction.tool}</span>
                        <span className="text-slate-400 text-[0.5625rem]">{formatRelativeTime(selectedAgent.telemetry.lastAction.ts)}</span>
                      </div>
                      {selectedAgent.telemetry.lastAction.aegis_request_id && (
                        <div className="pt-1 border-t border-slate-700/50 flex items-center justify-between text-[0.625rem]">
                          <span className="text-slate-400">Aegis Ref:</span>
                          {onNavigateTab && onSelectApproval ? (
                            <button
                              onClick={() => {
                                onSelectApproval(selectedAgent.telemetry!.lastAction!.aegis_request_id!);
                                onNavigateTab('approvals');
                              }}
                              className="font-mono text-indigo-300 hover:text-indigo-200 underline truncate max-w-[180px]"
                            >
                              {selectedAgent.telemetry.lastAction.aegis_request_id}
                            </button>
                          ) : (
                            <span className="font-mono text-indigo-300 truncate max-w-[180px]">
                              {selectedAgent.telemetry.lastAction.aegis_request_id}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

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

              {/* Workflow Pipeline or Execution Spec */}
              {selectedAgent.workflow_config && (
                Array.isArray(selectedAgent.workflow_config) ? (
                  selectedAgent.workflow_config.length > 0 && (
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
                  )
                ) : (
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
                    <span className="font-mono text-[0.625rem] font-bold uppercase tracking-wider text-slate-400 block">
                      Autonomous Agent Execution Spec
                    </span>
                    {selectedAgent.workflow_config.step_budget && (
                      <div className="flex items-center justify-between text-[0.6875rem]">
                        <span className="text-slate-500">Max Step Budget:</span>
                        <span className="font-mono font-bold text-slate-800">{selectedAgent.workflow_config.step_budget} steps</span>
                      </div>
                    )}
                    {Array.isArray(selectedAgent.workflow_config.tools) && (
                      <div>
                        <span className="text-slate-500 text-[0.6875rem] block mb-1">Authorized Host Tools:</span>
                        <div className="flex flex-wrap gap-1">
                          {selectedAgent.workflow_config.tools.map((t: string) => (
                            <span key={t} className="px-1.5 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-indigo-700 font-mono text-[0.625rem]">
                              {t}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {selectedAgent.workflow_config.system_prompt && (
                      <div className="pt-2 border-t border-slate-200">
                        <span className="text-slate-500 text-[0.6875rem] block mb-1">System Demarcation Prompt:</span>
                        <p className="text-[0.625rem] font-mono text-slate-600 bg-white p-2 rounded border border-slate-200 leading-relaxed whitespace-pre-wrap">
                          {selectedAgent.workflow_config.system_prompt}
                        </p>
                      </div>
                    )}
                  </div>
                )
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
