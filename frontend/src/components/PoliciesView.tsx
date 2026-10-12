import React, { useState } from 'react';
import type { Policy } from '../types';
import { formatSafeDateTime } from '../utils';

interface PoliciesViewProps {
  policies: Policy[];
}

export const PoliciesView: React.FC<PoliciesViewProps> = ({ policies }) => {
  const [selectedPolicy, setSelectedPolicy] = useState<Policy | null>(policies[0] || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [effectFilter, setEffectFilter] = useState<string>('all');
  const [severityFilter, setSeverityFilter] = useState<string>('all');

  const filteredPolicies = policies.filter(p => {
    const matchesSearch = 
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.operation.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.resource_pattern.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesEffect = effectFilter === 'all' || p.decision.toLowerCase() === effectFilter.toLowerCase();
    const matchesSev = severityFilter === 'all' || p.severity.toLowerCase() === severityFilter.toLowerCase();

    return matchesSearch && matchesEffect && matchesSev;
  });

  const totalCount = policies.length;
  const allowCount = policies.filter(p => p.decision === 'allow').length;
  const reqApprovalCount = policies.filter(p => p.decision === 'require_approval').length;
  const blockCount = policies.filter(p => p.decision === 'block').length;

  return (
    <div className="flex flex-col w-full space-y-6">
      
      {/* Page Title & Status */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Governance Policy Engine
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-3xl">
            Immutable policy rules, deterministic decision gates (ALLOW / REQUIRE_APPROVAL / BLOCK), and boundary conditions.
          </p>
        </div>
      </div>

      {/* Summary Metrics Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
          <span className="text-xs text-slate-500 font-medium">Active Policies</span>
          <div className="text-2xl font-bold text-slate-900 mt-2">{totalCount}</div>
          <span className="text-[0.6875rem] text-slate-500 mt-1 block">In evaluation catalog</span>
        </div>
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
          <span className="text-xs text-emerald-700 font-medium">Allow Rules</span>
          <div className="text-2xl font-bold text-emerald-600 mt-2">{allowCount}</div>
          <span className="text-[0.6875rem] text-slate-500 mt-1 block">Permitted in scope</span>
        </div>
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
          <span className="text-xs text-amber-800 font-medium">Approval Gates</span>
          <div className="text-2xl font-bold text-amber-700 mt-2">{reqApprovalCount}</div>
          <span className="text-[0.6875rem] text-slate-500 mt-1 block">Dual-custody holds</span>
        </div>
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm">
          <span className="text-xs text-rose-700 font-medium">Block Denials</span>
          <div className="text-2xl font-bold text-rose-600 mt-2">{blockCount}</div>
          <span className="text-[0.6875rem] text-slate-500 mt-1 block">Irrevocable boundaries</span>
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
              placeholder="Search policies by name, ID, operation, or resource pattern..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 pl-10 pr-3 py-1.5 rounded-lg text-xs text-slate-900 placeholder:text-slate-400 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:bg-white"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <select 
            value={effectFilter}
            onChange={(e) => setEffectFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
          >
            <option value="all">All Gate Effects</option>
            <option value="allow">ALLOW</option>
            <option value="require_approval">REQUIRE_APPROVAL</option>
            <option value="block">BLOCK</option>
          </select>

          <select 
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value)}
            className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="all">All Severities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
      </div>

      {/* Main Dual-Pane Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: Policy List Cards (5 cols) */}
        <div className="lg:col-span-5 space-y-2.5 max-h-[calc(100vh-14rem)] overflow-y-auto pr-1">
          {filteredPolicies.map((p) => {
            const isSelected = selectedPolicy?.id === p.id;
            return (
              <div
                key={p.id}
                onClick={() => setSelectedPolicy(p)}
                className={`p-3.5 rounded-xl border bg-white shadow-sm cursor-pointer transition-all ${
                  isSelected 
                    ? 'border-indigo-500 ring-2 ring-indigo-500/10 bg-indigo-50/20' 
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono text-xs font-bold text-slate-900">{p.id}</span>
                    <span className="text-slate-300">•</span>
                    <span className="font-mono text-[0.625rem] text-slate-500">{p.version}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[0.625rem] font-mono font-bold uppercase ${
                    p.decision === 'allow'
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : p.decision === 'require_approval'
                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                      : 'bg-rose-100 text-rose-800 border border-rose-300'
                  }`}>
                    {p.decision}
                  </span>
                </div>

                <div className="text-xs font-semibold text-slate-800 mb-1">
                  {p.name}
                </div>

                <div className="flex items-center justify-between text-[0.6875rem] font-mono text-slate-500 pt-1 border-t border-slate-100">
                  <span className="truncate max-w-[180px]">op: {p.operation}</span>
                  <span className="text-slate-400">sev: {p.severity}</span>
                </div>
              </div>
            );
          })}

          {filteredPolicies.length === 0 && (
            <div className="p-8 text-center text-slate-400 bg-white rounded-xl border border-slate-200 text-xs">
              No policies matched the selected filters.
            </div>
          )}
        </div>

        {/* Right Column: Selected Policy Details Inspector (7 cols) */}
        {selectedPolicy ? (
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
            
            {/* Header Identity */}
            <div className="pb-3 border-b border-slate-200 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                    {selectedPolicy.id}
                  </span>
                  <span className="font-mono text-[0.6875rem] text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                    Version: {selectedPolicy.version}
                  </span>
                </div>
                <span className={`px-2.5 py-1 rounded text-xs font-mono font-bold uppercase ${
                  selectedPolicy.decision === 'allow'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : selectedPolicy.decision === 'require_approval'
                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                    : 'bg-rose-100 text-rose-800 border border-rose-300'
                }`}>
                  Gate Decision: {selectedPolicy.decision.toUpperCase()}
                </span>
              </div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                {selectedPolicy.name}
              </h2>
            </div>

            {/* Scope & Boundaries */}
            <div>
              <span className="font-mono text-[0.625rem] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Target Boundaries & Trigger Scope
              </span>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Applicable Agent:</span>
                  <span className="font-mono font-bold text-indigo-700">
                    {selectedPolicy.applicable_agent_id || 'Global (All Agents)'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Target Operation:</span>
                  <span className="font-mono font-bold text-slate-800">
                    {selectedPolicy.operation}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block mb-0.5">Resource Pattern:</span>
                  <code className="font-mono text-xs text-slate-900 bg-white border border-slate-200 px-2 py-1 rounded block truncate">
                    {selectedPolicy.resource_pattern}
                  </code>
                </div>
              </div>
            </div>

            {/* Enforcement Attributes */}
            <div>
              <span className="font-mono text-[0.625rem] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Safety & Containment Directives
              </span>
              <div className="grid grid-cols-3 gap-2">
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-center">
                  <span className="text-[0.625rem] font-mono text-slate-400 uppercase block">Severity Tier</span>
                  <span className="text-xs font-bold text-slate-800 capitalize mt-0.5 block">
                    {selectedPolicy.severity}
                  </span>
                </div>
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-center">
                  <span className="text-[0.625rem] font-mono text-slate-400 uppercase block">Pause on Violation</span>
                  <span className={`text-xs font-bold mt-0.5 block ${selectedPolicy.pause_on_violation ? 'text-rose-600' : 'text-slate-600'}`}>
                    {selectedPolicy.pause_on_violation ? 'Yes (Immediate)' : 'No'}
                  </span>
                </div>
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-center">
                  <span className="text-[0.625rem] font-mono text-slate-400 uppercase block">Open Incident</span>
                  <span className={`text-xs font-bold mt-0.5 block ${selectedPolicy.open_incident ? 'text-rose-600' : 'text-slate-600'}`}>
                    {selectedPolicy.open_incident ? 'Yes (Mandatory)' : 'No'}
                  </span>
                </div>
              </div>
            </div>

            {/* Deterministic Evaluation Explanation */}
            <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-lg text-xs">
              <span className="font-mono text-[0.625rem] font-bold uppercase tracking-wider text-indigo-800 block mb-1">
                Enforcement Invariant (Deterministic Pure TypeScript)
              </span>
              <p className="text-[0.6875rem] text-slate-600 leading-relaxed">
                When an agent attempts operation <code className="font-mono text-indigo-700 bg-white px-1 py-0.5 rounded">{selectedPolicy.operation}</code> matching pattern <code className="font-mono text-slate-700 bg-white px-1 py-0.5 rounded">{selectedPolicy.resource_pattern}</code>, the policy engine emits verdict <strong className="font-mono text-slate-900">{selectedPolicy.decision.toUpperCase()}</strong>. Zero LLMs participate in this authorization decision.
              </p>
            </div>

            {/* Audit Metadata */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[0.6875rem] text-slate-400 font-mono">
              <span>Created: {formatSafeDateTime(selectedPolicy.created_at)}</span>
              <span>Audit Chain Linked</span>
            </div>

          </div>
        ) : (
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400 text-xs">
            Select a policy to view its rule specification.
          </div>
        )}

      </div>

    </div>
  );
};
