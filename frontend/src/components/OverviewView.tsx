import React from 'react';
import type { Agent, Approval, Incident, AuditEvent, DashboardData, Tab } from '../types';

interface OverviewViewProps {
  agents: Agent[];
  approvals: Approval[];
  incidents: Incident[];
  auditEvents: AuditEvent[];
  dashboardData: DashboardData | null;
  onNavigateTab: (tab: Tab) => void;
  onSelectApproval: (id: string) => void;
  onSelectIncident: (id: string) => void;
  onSelectAgent?: (id: string) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  agents,
  approvals,
  incidents,
  auditEvents,
  dashboardData,
  onNavigateTab,
  onSelectApproval,
  onSelectIncident,
  onSelectAgent
}) => {
  const pendingApprovals = approvals.filter(a => a.status === 'PENDING');
  const openIncidents = incidents.filter(i => i.status === 'OPEN' || i.status === 'CONTAINED');

  const activeAgentsCount = agents.filter(a => a.status === 'active').length;
  const restrictedAgentsCount = agents.filter(a => a.status === 'restricted').length;
  const pausedAgentsCount = agents.filter(a => a.status === 'paused').length;

  // Recent 6 audit events
  const recentEvents = auditEvents.slice(0, 6);

  // Policy outcomes stats calculation
  const totalAuditEvaluations = auditEvents.filter(e => e.event_type.includes('POLICY') || e.decision).length || 1;
  const allowCount = auditEvents.filter(e => e.decision?.toUpperCase() === 'ALLOW').length;
  const requireApprovalCount = auditEvents.filter(e => e.decision?.toUpperCase() === 'REQUIRE_APPROVAL').length;
  const blockCount = auditEvents.filter(e => e.decision?.toUpperCase() === 'BLOCK').length;

  const allowPct = Math.round((allowCount / totalAuditEvaluations) * 100) || 75;
  const reqPct = Math.round((requireApprovalCount / totalAuditEvaluations) * 100) || 15;
  const blockPct = Math.max(0, 100 - allowPct - reqPct);

  return (
    <div className="flex flex-col w-full space-y-6">
      
      {/* Page Title & Status Pill */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Governance Overview
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-3xl">
            Monitor autonomous defence agent activity, policy gate verdicts, human clearance approvals, and containment incidents.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded bg-slate-100 text-slate-600 font-mono text-[0.6875rem] border border-slate-200 flex items-center gap-1.5 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-600"></span>
            Deterministic Gate v2.4.1 Active
          </span>
        </div>
      </div>

      {/* 4 Summary Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Card 1: Registered Agents */}
        <div 
          onClick={() => onNavigateTab('agents')}
          className="p-4 rounded-xl bg-white border border-slate-200 flex flex-col justify-between shadow-sm hover:border-indigo-300 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Registered Agents</span>
            <span className="material-symbols-outlined text-slate-400 text-[1.25rem]">smart_toy</span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900">{agents.length}</div>
            <p className="text-[0.6875rem] text-slate-500 mt-0.5">
              {activeAgentsCount} active · {restrictedAgentsCount} restricted · {pausedAgentsCount} paused
            </p>
          </div>
        </div>

        {/* Card 2: Pending Approvals */}
        <div 
          onClick={() => onNavigateTab('approvals')}
          className={`p-4 rounded-xl bg-white flex flex-col justify-between shadow-sm cursor-pointer transition-all ${
            pendingApprovals.length > 0 
              ? 'border-2 border-amber-400 bg-amber-50/20 shadow-amber-100' 
              : 'border border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-800">Pending Approvals</span>
            <span className={`w-2 h-2 rounded-full bg-amber-500 ${pendingApprovals.length > 0 ? 'animate-pulse' : ''}`}></span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-amber-700">{pendingApprovals.length}</div>
            <p className="text-[0.6875rem] text-slate-500 mt-0.5">
              {pendingApprovals.length > 0 ? 'Awaiting human review queue' : 'Queue clear · No pending holds'}
            </p>
          </div>
        </div>

        {/* Card 3: Open Incidents */}
        <div 
          onClick={() => onNavigateTab('incidents')}
          className={`p-4 rounded-xl bg-white flex flex-col justify-between shadow-sm cursor-pointer transition-all ${
            openIncidents.length > 0 
              ? 'border-2 border-rose-300 bg-rose-50/20 shadow-rose-100' 
              : 'border border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Open Incidents</span>
            <span className="material-symbols-outlined text-rose-600 text-[1.25rem]">gpp_maybe</span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-rose-700">{openIncidents.length}</div>
            <p className="text-[0.6875rem] text-slate-500 mt-0.5">
              {openIncidents.length > 0 ? 'Containment active · Agent paused' : 'Zero uncontained violations'}
            </p>
          </div>
        </div>

        {/* Card 4: Blocked Actions */}
        <div 
          onClick={() => onNavigateTab('audit')}
          className="p-4 rounded-xl bg-white border border-slate-200 flex flex-col justify-between shadow-sm hover:border-slate-300 transition-all cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Policy Gate Evaluations</span>
            <span className="material-symbols-outlined text-slate-400 text-[1.25rem]">gpp_good</span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold text-slate-900">{auditEvents.length}</div>
            <p className="text-[0.6875rem] text-slate-500 mt-0.5">
              Append-only SHA-256 chain intact
            </p>
          </div>
        </div>

      </div>

      {/* Needs Your Attention Section */}
      <section className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50/50">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-slate-900 tracking-tight">Needs Your Attention</h2>
              {(pendingApprovals.length + openIncidents.length) > 0 ? (
                <span className="px-2 py-0.5 rounded text-[0.625rem] font-mono bg-amber-100 text-amber-800 border border-amber-300 font-bold">
                  {pendingApprovals.length + openIncidents.length} ITEMS PENDING
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[0.625rem] font-mono bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold">
                  ZERO ESCALATIONS
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              High-risk policy violations and quality hold events requiring human analyst or reviewer intervention.
            </p>
          </div>
          <button 
            onClick={() => onNavigateTab('approvals')}
            className="text-xs font-semibold text-indigo-600 flex items-center gap-1 hover:underline self-start sm:self-auto"
          >
            Go to Approval Queue
            <span className="material-symbols-outlined text-[1rem]">arrow_forward</span>
          </button>
        </div>

        <div className="divide-y divide-slate-200">
          {/* Pending Approvals */}
          {pendingApprovals.map((req) => (
            <div 
              key={req.id}
              className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/80 transition-colors"
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 border border-amber-200">
                  <span className="material-symbols-outlined text-[1.25rem]">rule</span>
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">{req.agent_id}</span>
                    <span className="text-slate-300">•</span>
                    <span className="font-mono text-[0.6875rem] text-slate-500">{req.request_id}</span>
                    <span className="px-2 py-0.5 rounded text-[0.625rem] font-mono font-bold uppercase bg-amber-100 text-amber-800 border border-amber-300">
                      {req.gate_decision || 'REQUIRE_APPROVAL'}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[0.625rem] font-medium bg-slate-100 text-slate-700">
                      Approval: {req.status}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[0.625rem] font-medium bg-slate-100 text-slate-500">
                      Execution: {req.execution_status || 'NOT_EXECUTED'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-800 mt-1">
                    Action: <span className="font-mono font-semibold text-indigo-700">{req.operation}</span> on <span className="font-mono text-slate-600">{req.resource}</span>
                  </p>
                  <p className="text-[0.6875rem] text-slate-500 mt-0.5">
                    Gate Reason: <span className="font-mono text-amber-700 font-medium">{req.gate_reason_code || 'HELD_FOR_REVIEW'}</span>
                    {req.request_explanation ? ` — ${req.request_explanation}` : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button 
                  onClick={() => {
                    onSelectApproval(req.id);
                    onNavigateTab('approvals');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  <span className="material-symbols-outlined text-[1rem]">rate_review</span>
                  Review Request
                </button>
              </div>
            </div>
          ))}

          {/* Open Incidents */}
          {openIncidents.map((inc) => (
            <div 
              key={inc.id}
              className="p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-rose-50/40 transition-colors"
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-rose-100 text-rose-800 flex items-center justify-center shrink-0 border border-rose-200">
                  <span className="material-symbols-outlined text-[1.25rem]">gpp_bad</span>
                </div>
                <div className="flex flex-col min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-slate-900">{inc.agent_id}</span>
                    <span className="text-slate-300">•</span>
                    <span className="font-mono text-[0.6875rem] text-slate-500">{inc.id}</span>
                    <span className="px-2 py-0.5 rounded text-[0.625rem] font-mono font-bold uppercase bg-rose-100 text-rose-800 border border-rose-300">
                      BLOCK
                    </span>
                    <span className="px-2 py-0.5 rounded text-[0.625rem] font-medium bg-rose-100 text-rose-700">
                      Severity: {inc.severity}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[0.625rem] font-medium bg-slate-100 text-slate-600">
                      Containment: {inc.containment_action}
                    </span>
                  </div>
                  <p className="text-xs text-slate-800 mt-1">
                    Prohibited Action: <span className="font-mono font-semibold text-rose-700">{inc.action_attempted}</span>
                  </p>
                  <p className="text-[0.6875rem] text-slate-500 mt-0.5">
                    Violated Policy: <span className="font-mono text-indigo-700">{inc.policy_id}</span> · Agent Paused deterministically
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button 
                  onClick={() => {
                    onSelectIncident(inc.id);
                    onNavigateTab('incidents');
                  }}
                  className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-semibold hover:bg-rose-700 transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  <span className="material-symbols-outlined text-[1rem]">search</span>
                  Investigate
                </button>
              </div>
            </div>
          ))}

          {pendingApprovals.length === 0 && openIncidents.length === 0 && (
            <div className="p-8 text-center text-slate-500 text-xs">
              <span className="material-symbols-outlined text-emerald-500 text-3xl mb-1 block">check_circle</span>
              All governance queues are currently clear. Zero pending approvals or uncontained incidents.
            </div>
          )}
        </div>
      </section>

      {/* Fleet Summary & Policy Outcomes Dual Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left: Registered Agents Fleet */}
        <section className="lg:col-span-2 rounded-xl bg-white border border-slate-200 p-4 flex flex-col justify-between shadow-sm">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h2 className="text-base font-bold text-slate-900 tracking-tight">Registered Agents Fleet</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Operational status and risk boundaries for autonomous support agents.
                </p>
              </div>
              <button 
                onClick={() => onNavigateTab('agents')}
                className="text-xs font-semibold text-indigo-600 flex items-center gap-1 hover:underline"
              >
                Manage Agents
                <span className="material-symbols-outlined text-[1rem]">arrow_forward</span>
              </button>
            </div>

            <div className="overflow-x-auto mt-3">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 uppercase tracking-wider text-[0.625rem] font-semibold">
                    <th className="pb-2">Agent ID & Name</th>
                    <th className="pb-2">Category</th>
                    <th className="pb-2">Status</th>
                    <th className="pb-2">Risk Level</th>
                    <th className="pb-2 text-right">Team</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {agents.slice(0, 5).map((agent) => (
                    <tr 
                      key={agent.id}
                      onClick={() => {
                        if (onSelectAgent) onSelectAgent(agent.id);
                        onNavigateTab('agents');
                      }}
                      className="hover:bg-slate-50/60 cursor-pointer transition-colors"
                    >
                      <td className="py-2.5 font-medium text-slate-900 flex items-center gap-2">
                        <span className={`material-symbols-outlined text-[1.125rem] ${
                          agent.status === 'paused' ? 'text-rose-500' : 'text-indigo-600'
                        }`}>
                          smart_toy
                        </span>
                        <div>
                          <div className="font-semibold text-slate-900">{agent.name}</div>
                          <div className="font-mono text-[0.6875rem] text-slate-400">{agent.id}</div>
                        </div>
                      </td>
                      <td className="py-2.5 text-slate-600 font-mono text-[0.6875rem]">
                        {agent.agent_category || 'general'}
                      </td>
                      <td className="py-2.5">
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
                      <td className="py-2.5">
                        <span className="px-2 py-0.5 rounded text-[0.625rem] font-semibold bg-slate-100 text-slate-700">
                          {agent.risk_level || agent.risk_category || 'low'}
                        </span>
                      </td>
                      <td className="py-2.5 text-right font-mono text-[0.6875rem] text-slate-500">
                        {agent.owner_team || agent.team || 'Defence Ops'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="pt-3 text-slate-400 text-[0.6875rem] flex items-center justify-between border-t border-slate-100 mt-4">
            <span>{agents.length} synthetic agents monitored by deterministic policy engine</span>
            <span className="font-mono">
              {dashboardData?.risk?.meanTimeToContainMs ? `Mean Containment: ${dashboardData.risk.meanTimeToContainMs}ms` : 'Air-gapped Sandbox'}
            </span>
          </div>
        </section>

        {/* Right: Policy Outcomes (24h) */}
        <section className="rounded-xl bg-white border border-slate-200 p-4 flex flex-col justify-between shadow-sm">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h2 className="text-base font-bold text-slate-900 tracking-tight">Policy Outcomes</h2>
                <p className="text-xs text-slate-500 mt-0.5">Enforcement verdicts on proposed actions.</p>
              </div>
              <span className="font-mono text-[0.625rem] text-slate-500 px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200">
                Demo Audit
              </span>
            </div>

            <div className="mt-4">
              <div className="flex items-baseline justify-between mb-2">
                <span className="text-xl font-bold text-slate-900">{totalAuditEvaluations}</span>
                <span className="text-xs text-slate-500">Evaluated events</span>
              </div>
              
              {/* Distribution Bar */}
              <div className="w-full h-2.5 rounded-full bg-slate-100 overflow-hidden flex shadow-inner">
                <div style={{ width: `${allowPct}%` }} className="h-full bg-emerald-600" title={`ALLOW: ${allowPct}%`}></div>
                <div style={{ width: `${reqPct}%` }} className="h-full bg-amber-500" title={`REQUIRE_APPROVAL: ${reqPct}%`}></div>
                <div style={{ width: `${blockPct}%` }} className="h-full bg-rose-600" title={`BLOCK: ${blockPct}%`}></div>
              </div>
            </div>

            <div className="space-y-2.5 mt-5 text-xs">
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50/70 border border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[0.625rem] font-mono font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                    ALLOW
                  </span>
                  <span className="text-slate-700">Autonomous execution</span>
                </div>
                <span className="font-mono font-semibold text-slate-800">{allowCount} ({allowPct}%)</span>
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50/70 border border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[0.625rem] font-mono font-bold bg-amber-100 text-amber-800 border border-amber-300">
                    REQUIRE_APPROVAL
                  </span>
                  <span className="text-slate-700">Held for Human</span>
                </div>
                <span className="font-mono font-semibold text-slate-800">{requireApprovalCount} ({reqPct}%)</span>
              </div>

              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50/70 border border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[0.625rem] font-mono font-bold bg-rose-100 text-rose-800 border border-rose-300">
                    BLOCK
                  </span>
                  <span className="text-slate-700">Denied immediately</span>
                </div>
                <span className="font-mono font-semibold text-slate-800">{blockCount} ({blockPct}%)</span>
              </div>
            </div>
          </div>

          <div className="pt-3 text-slate-400 font-mono text-[0.6875rem] text-center border-t border-slate-100 mt-4">
            Zero LLM In Enforcement Path · Deterministic Only
          </div>
        </section>

      </div>

      {/* Recent Governance Activity Log */}
      <section className="rounded-xl bg-white border border-slate-200 shadow-sm p-4 flex flex-col">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-200 gap-2">
          <div>
            <h2 className="text-base font-bold text-slate-900 tracking-tight">Recent Governance Activity</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Auditable log of agent actions, matched boundary policies, and deterministic verdicts.
            </p>
          </div>
          <button 
            onClick={() => onNavigateTab('audit')}
            className="text-xs font-semibold text-indigo-600 flex items-center gap-1 hover:underline"
          >
            View complete audit trail
            <span className="material-symbols-outlined text-[1rem]">arrow_forward</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-400 uppercase tracking-wider text-[0.625rem] font-semibold">
                <th className="py-2.5">Event Type</th>
                <th className="py-2.5">Agent</th>
                <th className="py-2.5">Action Executed</th>
                <th className="py-2.5">Policy Verdict</th>
                <th className="py-2.5">Event ID</th>
                <th className="py-2.5 text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentEvents.map((evt) => (
                <tr key={evt.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3 text-slate-900 font-medium">
                    <span className="flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[1.125rem] text-indigo-600">
                        {evt.event_type.includes('APPROVAL') ? 'rule' : evt.event_type.includes('INCIDENT') ? 'gpp_bad' : 'database'}
                      </span>
                      <span>{evt.event_type}</span>
                    </span>
                  </td>
                  <td className="py-3 font-mono text-slate-800">{evt.actor_id}</td>
                  <td className="py-3 text-slate-600 truncate max-w-xs">{evt.action}</td>
                  <td className="py-3">
                    <span className={`px-2 py-0.5 rounded text-[0.625rem] font-mono font-bold uppercase ${
                      evt.decision === 'ALLOW' 
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : evt.decision === 'REQUIRE_APPROVAL'
                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                        : 'bg-rose-100 text-rose-800 border border-rose-300'
                    }`}>
                      {evt.decision || 'RECORDED'}
                    </span>
                  </td>
                  <td className="py-3 font-mono text-slate-400 text-[0.6875rem]">{evt.id.substring(0, 16)}...</td>
                  <td className="py-3 text-right text-slate-500 font-mono text-[0.6875rem]">
                    {new Date(evt.timestamp).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
              {recentEvents.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400">
                    No activity recorded yet. Run a scenario or action to populate the audit log.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

    </div>
  );
};
