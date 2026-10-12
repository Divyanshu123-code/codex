import React, { useState } from 'react';
import type { Incident, Tab } from '../types';
import { parseJsonSafe } from '../utils';

interface IncidentsViewProps {
  incidents: Incident[];
  onNavigateTab: (tab: Tab) => void;
  selectedIncidentId?: string | null;
}

export const IncidentsView: React.FC<IncidentsViewProps> = ({
  incidents,
  onNavigateTab,
  selectedIncidentId
}) => {
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(
    selectedIncidentId 
      ? incidents.find(i => i.id === selectedIncidentId) || incidents[0] || null
      : incidents[0] || null
  );

  const [statusFilter, setStatusFilter] = useState<'all' | 'OPEN' | 'CONTAINED' | 'RESOLVED'>('all');
  const [reportData, setReportData] = useState<any>(null);
  const [isReportLoading, setIsReportLoading] = useState(false);
  const [triageData, setTriageData] = useState<any>(null);
  const [isTriageLoading, setIsTriageLoading] = useState(false);

  const filteredIncidents = incidents.filter(i => {
    if (statusFilter === 'all') return true;
    return i.status === statusFilter;
  });

  const totalIncidents = incidents.length;
  const criticalCount = incidents.filter(i => i.severity === 'critical' || i.severity === 'high').length;
  const openCount = incidents.filter(i => i.status === 'OPEN' || i.status === 'CONTAINED').length;

  const handleFetchReport = async (incidentId: string) => {
    setIsReportLoading(true);
    try {
      const res = await fetch(`/api/incidents/${incidentId}/report`);
      const data = await parseJsonSafe(res);
      setReportData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsReportLoading(false);
    }
  };

  const handleRunTriage = async (incidentId: string) => {
    setIsTriageLoading(true);
    try {
      const res = await fetch(`/api/incidents/${incidentId}/triage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'usr-admin' })
      });
      const data = await parseJsonSafe(res);
      setTriageData(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsTriageLoading(false);
    }
  };

  return (
    <div className="flex flex-col w-full space-y-6">
      
      {/* Page Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Security Incidents & Containment Console
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-3xl">
            Policy breach audit, automatic agent containment, diagnostic signature triage, and 11-section accountability reporting.
          </p>
        </div>
      </div>

      {/* Summary Metrics Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
          <span className="text-xs text-slate-500 font-medium">Total Incidents</span>
          <div className="text-2xl font-bold text-slate-900 mt-2">{totalIncidents}</div>
          <span className="text-[0.6875rem] text-slate-500 mt-0.5 block">Recorded breaches</span>
        </div>
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
          <span className="text-xs text-rose-700 font-medium">Critical Severity</span>
          <div className="text-2xl font-bold text-rose-600 mt-2">{criticalCount}</div>
          <span className="text-[0.6875rem] text-slate-500 mt-0.5 block">High blast radius</span>
        </div>
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
          <span className="text-xs text-amber-800 font-medium">Contained / Open</span>
          <div className="text-2xl font-bold text-amber-700 mt-2">{openCount}</div>
          <span className="text-[0.6875rem] text-slate-500 mt-0.5 block">Interlock engaged</span>
        </div>
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
          <span className="text-xs text-indigo-700 font-medium">Protected State</span>
          <div className="text-2xl font-bold text-indigo-600 mt-2">100%</div>
          <span className="text-[0.6875rem] text-slate-500 mt-0.5 block">Zero tool side effects</span>
        </div>
      </div>

      {/* Main Split-Pane Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: Incident List (~40% / 5 cols) */}
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
          
          {/* List Toolbar */}
          <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap">
            <span className="font-mono text-xs font-bold text-slate-700 uppercase tracking-wide">
              Incident Records ({filteredIncidents.length})
            </span>
            <div className="flex items-center gap-1">
              {(['all', 'OPEN', 'CONTAINED', 'RESOLVED'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setStatusFilter(filter)}
                  className={`px-2.5 py-1 rounded text-[0.6875rem] font-semibold transition-all ${
                    statusFilter === filter
                      ? 'bg-rose-600 text-white shadow-sm'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {filter === 'all' ? 'All' : filter}
                </button>
              ))}
            </div>
          </div>

          {/* List Cards */}
          <div className="divide-y divide-slate-100 max-h-[calc(100vh-16rem)] overflow-y-auto">
            {filteredIncidents.map((inc) => {
              const isSelected = selectedIncident?.id === inc.id;
              return (
                <div
                  key={inc.id}
                  onClick={() => {
                    setSelectedIncident(inc);
                    setReportData(null);
                    setTriageData(null);
                  }}
                  className={`p-4 cursor-pointer transition-all ${
                    isSelected 
                      ? 'bg-rose-50/60 border-l-4 border-rose-600' 
                      : 'hover:bg-slate-50/70 border-l-4 border-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-900">{inc.id}</span>
                      <span className="text-slate-300">•</span>
                      <span className="font-mono text-[0.6875rem] text-slate-500">{inc.agent_id}</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[0.625rem] font-mono font-bold uppercase ${
                      inc.severity === 'critical'
                        ? 'bg-rose-100 text-rose-800 border border-rose-300'
                        : 'bg-amber-100 text-amber-800 border border-amber-300'
                    }`}>
                      {inc.severity}
                    </span>
                  </div>

                  <div className="text-xs font-bold text-slate-900 mb-1 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[1rem] text-rose-600">gpp_bad</span>
                    <span>Prohibited: <code className="font-mono text-rose-700">{inc.action_attempted}</code></span>
                  </div>

                  <p className="text-[0.6875rem] text-slate-600 line-clamp-1 mb-2">
                    Containment: {inc.containment_action}
                  </p>

                  <div className="flex items-center justify-between text-[0.625rem] font-mono text-slate-400 pt-1 border-t border-slate-100">
                    <span className="text-indigo-700 font-semibold">{inc.policy_id}</span>
                    <span>{new Date(inc.occurred_at).toLocaleTimeString()}</span>
                  </div>
                </div>
              );
            })}

            {filteredIncidents.length === 0 && (
              <div className="p-8 text-center text-slate-400 text-xs">
                Zero security incident violations found.
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Selected Incident Investigation Detail (~60% / 7 cols) */}
        {selectedIncident ? (
          <div className="lg:col-span-7 space-y-4">
            
            {/* Red High-Alert Safety Banner */}
            <div className="bg-rose-50 border border-rose-200 text-rose-900 rounded-xl p-4 flex items-start gap-3 shadow-sm">
              <span className="material-symbols-outlined text-[1.5rem] text-rose-600 shrink-0 mt-0.5">
                shield_with_heart
              </span>
              <div className="flex flex-col">
                <span className="font-mono text-xs font-bold tracking-wide uppercase text-rose-900">
                  POLICY VIOLATION — ACTION BLOCKED & AGENT PAUSED [SYNTHETIC DEMO]
                </span>
                <span className="text-xs text-rose-800 mt-1 leading-relaxed">
                  The deterministic governance safety interlock intervened. Prohibited simulated actions were halted before tool execution. Protected enclave resources remained completely uncompromised.
                </span>
              </div>
            </div>

            {/* Incident Header & Investigation Console */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
              
              <div className="flex items-center justify-between pb-3 border-b border-slate-200 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                    RECORD ID: {selectedIncident.id}
                  </span>
                  <span className={`px-2 py-0.5 rounded text-[0.625rem] font-mono font-bold uppercase ${
                    selectedIncident.severity === 'critical'
                      ? 'bg-rose-100 text-rose-800 border border-rose-300'
                      : 'bg-amber-100 text-amber-800 border border-amber-300'
                  }`}>
                    SEVERITY: {selectedIncident.severity.toUpperCase()}
                  </span>
                </div>
                <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-600 animate-pulse"></span>
                  STATUS: {selectedIncident.status}
                </span>
              </div>

              <div>
                <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                  Prohibited {selectedIncident.action_attempted} Dispatch
                </h2>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Agent <strong className="font-mono text-indigo-700">{selectedIncident.agent_id}</strong> attempted operation <code className="font-mono text-rose-700 font-bold bg-slate-100 px-1 py-0.5 rounded">{selectedIncident.action_attempted}</code>. Deterministic policy <strong className="font-mono text-indigo-700">{selectedIncident.policy_id}</strong> intervened and permanently blocked execution before protected tools fired.
                </p>
              </div>

              {/* Triage & Report Trigger Buttons */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-100 flex-wrap">
                <button
                  onClick={() => handleRunTriage(selectedIncident.id)}
                  disabled={isTriageLoading}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-sm"
                >
                  <span className="material-symbols-outlined text-[1rem]">troubleshoot</span>
                  {isTriageLoading ? 'Triaging...' : 'Run Signature Triage'}
                </button>

                <button
                  onClick={() => handleFetchReport(selectedIncident.id)}
                  disabled={isReportLoading}
                  className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs border border-slate-300 transition-colors flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[1rem]">description</span>
                  {isReportLoading ? 'Generating...' : 'View 11-Section Incident Report'}
                </button>

                <button
                  onClick={() => onNavigateTab('corrections')}
                  className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-semibold text-xs transition-colors flex items-center gap-1.5 ml-auto"
                >
                  <span className="material-symbols-outlined text-[1rem]">build_circle</span>
                  Sandbox Recovery Gate
                </button>
              </div>

              {/* Diagnostic Signature Triage Panel */}
              {triageData && (
                <div className="p-3.5 bg-indigo-50/60 border border-indigo-200 rounded-lg space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-indigo-900">
                      Closed Signature Triage Result
                    </span>
                    <span className="font-mono text-[0.6875rem] px-2 py-0.5 rounded bg-indigo-200/80 text-indigo-900 font-bold">
                      {triageData.signature_id || 'SIG-CYBER-CONTAINMENT-01'}
                    </span>
                  </div>
                  <div className="text-[0.6875rem] text-slate-700">
                    <strong className="text-slate-900">Root Cause:</strong> {triageData.root_cause || 'Autonomous agent exceeded configured operations catalog perimeter.'}
                  </div>
                  <div className="text-[0.6875rem] text-slate-700">
                    <strong className="text-slate-900">Remediation:</strong> {triageData.recommended_action || 'Submit patch confining execution scope and verify in sandbox.'}
                  </div>
                </div>
              )}

              {/* 11-Section Accountability Incident Report View */}
              {reportData && (
                <div className="mt-4 pt-4 border-t border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
                      Formal 11-Section Accountability Incident Report
                    </h3>
                    <span className="font-mono text-[0.625rem] text-slate-400">
                      SHA-256 Hash Chained
                    </span>
                  </div>

                  <div className="space-y-2 max-h-96 overflow-y-auto text-xs pr-1">
                    {/* Section 1 */}
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                      <div className="font-bold text-slate-800 text-[0.6875rem] mb-0.5">1. Incident Metadata</div>
                      <div className="text-slate-600 font-mono text-[0.625rem]">
                        ID: {reportData.incident?.id || selectedIncident.id} · Timestamp: {new Date(reportData.incident?.occurred_at || selectedIncident.occurred_at).toISOString()}
                      </div>
                    </div>

                    {/* Section 2 */}
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                      <div className="font-bold text-slate-800 text-[0.6875rem] mb-0.5">2. Agent Identification & Category</div>
                      <div className="text-slate-600 font-mono text-[0.625rem]">
                        Agent: {reportData.agent?.id || selectedIncident.agent_id} · Category: {reportData.agent?.agent_category || selectedIncident.agent_category || 'cybersecurity_monitoring'}
                      </div>
                    </div>

                    {/* Section 3 */}
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                      <div className="font-bold text-slate-800 text-[0.6875rem] mb-0.5">3. Action Proposal & Boundary Policy</div>
                      <div className="text-slate-600 font-mono text-[0.625rem]">
                        Attempted: {reportData.incident?.action_attempted || selectedIncident.action_attempted} · Policy: {reportData.policy?.id || selectedIncident.policy_id}
                      </div>
                    </div>

                    {/* Section 4 */}
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                      <div className="font-bold text-slate-800 text-[0.6875rem] mb-0.5">4. Domain Preconditions & Evidence Checks</div>
                      <div className="text-slate-600 font-mono text-[0.625rem]">
                        Evidence: {JSON.stringify(reportData.evidenceChecks || reportData.incident?.evidence_checks || 'Checked')}
                      </div>
                    </div>

                    {/* Section 5 */}
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                      <div className="font-bold text-slate-800 text-[0.6875rem] mb-0.5">5. Gate Violation Details & Containment</div>
                      <div className="text-slate-600 font-mono text-[0.625rem]">
                        Verdict: BLOCK · Interlock: Agent paused deterministically · Side Effects: ZERO
                      </div>
                    </div>

                    {/* Section 6 */}
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                      <div className="font-bold text-slate-800 text-[0.6875rem] mb-0.5">6. Diagnostic Signature & Triage</div>
                      <div className="text-slate-600 font-mono text-[0.625rem]">
                        Signature: {reportData.diagnosis?.signature_id || 'SIG-CYBER-CONTAINMENT-01'} · Triage Status: CLOSED
                      </div>
                    </div>

                    {/* Section 7 */}
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                      <div className="font-bold text-slate-800 text-[0.6875rem] mb-0.5">7. Proposed Patch & Sandbox Evaluation</div>
                      <div className="text-slate-600 font-mono text-[0.625rem]">
                        Structural S1–S6: PASS · Behavioural B1–B6: PASS · Diff Guard: Privileges Unchanged
                      </div>
                    </div>

                    {/* Section 8 */}
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                      <div className="font-bold text-slate-800 text-[0.6875rem] mb-0.5">8. Central Resume Gate Checklist (R1–R9)</div>
                      <div className="text-slate-600 font-mono text-[0.625rem]">
                        Preconditions R1–R9 evaluated prior to agent resumption clearance.
                      </div>
                    </div>

                    {/* Section 9 */}
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                      <div className="font-bold text-slate-800 text-[0.6875rem] mb-0.5">9. Human Reviewer Authorizations</div>
                      <div className="text-slate-600 font-mono text-[0.625rem]">
                        Reviewer: Elena Vance (usr-reviewer) · Dual Custody: ENFORCED
                      </div>
                    </div>

                    {/* Section 10 */}
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                      <div className="font-bold text-slate-800 text-[0.6875rem] mb-0.5">10. Cryptographic Audit Event Chain</div>
                      <div className="text-slate-600 font-mono text-[0.625rem] truncate">
                        Hash Chaining Verified · Head: {reportData.auditHeadHash || 'e3b0c44298fc1c149afbf4c8996fb924...'}
                      </div>
                    </div>

                    {/* Section 11 */}
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded">
                      <div className="font-bold text-slate-800 text-[0.6875rem] mb-0.5">11. Concluding Governance Determination</div>
                      <div className="text-slate-600 font-mono text-[0.625rem]">
                        Contained without escalation. Synthetic defence boundary integrity preserved.
                      </div>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </div>
        ) : (
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400 text-xs">
            Select an incident from the queue to inspect containment and diagnostic reports.
          </div>
        )}

      </div>

    </div>
  );
};
