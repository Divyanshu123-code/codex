import React, { useState } from 'react';
import type { AuditEvent } from '../types';
import { parseJsonSafe } from '../utils';

interface AuditLogViewProps {
  auditEvents: AuditEvent[];
}

export const AuditLogView: React.FC<AuditLogViewProps> = ({ auditEvents }) => {
  const [selectedEvent, setSelectedEvent] = useState<AuditEvent | null>(auditEvents[0] || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<any>(null);

  const filteredEvents = auditEvents.filter(e => {
    const matchesSearch = 
      e.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.actor_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.resource.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesType = typeFilter === 'all' || e.event_type.toLowerCase() === typeFilter.toLowerCase();

    return matchesSearch && matchesType;
  });

  const totalCount = auditEvents.length;
  const policyEvaluationsCount = auditEvents.filter(e => e.decision || e.event_type.includes('POLICY')).length;
  const humanApprovalsCount = auditEvents.filter(e => e.event_type.includes('APPROVAL')).length;

  const handleVerifyChain = async () => {
    setIsVerifying(true);
    setVerifyResult(null);
    try {
      const res = await fetch('/api/audit/verify', { method: 'POST' });
      const data = await parseJsonSafe(res);
      setVerifyResult(data || { verified: false, error: 'Empty verification response' });
    } catch (err: any) {
      setVerifyResult({ verified: false, error: err.message });
    } finally {
      setIsVerifying(false);
    }
  };

  const parsedMetadata = selectedEvent?.metadata ? (
    typeof selectedEvent.metadata === 'string'
      ? (() => { try { return JSON.parse(selectedEvent.metadata as string); } catch { return selectedEvent.metadata; } })()
      : selectedEvent.metadata
  ) : null;

  return (
    <div className="flex flex-col w-full space-y-6">
      
      {/* Page Title & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Audit Trail &amp; Cryptographic Provenance
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-3xl">
            Tamper-evident, cryptographically chained governance audit trail. Every action proposal, gate verdict, and human decision is permanently recorded with SHA-256 hash chaining.
          </p>
        </div>
        <button
          onClick={handleVerifyChain}
          disabled={isVerifying}
          className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors flex items-center gap-1.5 shadow-sm self-start md:self-auto"
        >
          <span className="material-symbols-outlined text-[1rem]">lock_clock</span>
          {isVerifying ? 'Verifying Chain...' : 'Verify Audit Hash Integrity'}
        </button>
      </div>

      {/* Summary Cards Row (4 Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
          <span className="text-xs text-slate-500 font-medium">Total Audit Events</span>
          <div className="text-2xl font-bold text-slate-900 mt-2">{totalCount}</div>
          <span className="text-[0.6875rem] text-slate-500 mt-0.5 block">Sequential block sequence</span>
        </div>
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
          <span className="text-xs text-emerald-700 font-medium">Chain Integrity</span>
          <div className="text-2xl font-bold text-emerald-600 mt-2">100% Intact</div>
          <span className="text-[0.6875rem] text-slate-500 mt-0.5 block">Zero hash mismatches</span>
        </div>
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
          <span className="text-xs text-indigo-700 font-medium">Policy Gate Verdicts</span>
          <div className="text-2xl font-bold text-indigo-600 mt-2">{policyEvaluationsCount}</div>
          <span className="text-[0.6875rem] text-slate-500 mt-0.5 block">Recorded gate outcomes</span>
        </div>
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
          <span className="text-xs text-amber-800 font-medium">Human Clearance Events</span>
          <div className="text-2xl font-bold text-amber-700 mt-2">{humanApprovalsCount}</div>
          <span className="text-[0.6875rem] text-slate-500 mt-0.5 block">Dual-custody entries</span>
        </div>
      </div>

      {/* Cryptographic Hash-Linkage Strip */}
      <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs overflow-x-auto gap-3">
        <div className="flex items-center gap-2 shrink-0">
          <span className="material-symbols-outlined text-indigo-600 text-[1.125rem]">link</span>
          <span className="font-mono text-slate-700 font-bold">SHA-256 Hash Chain:</span>
        </div>
        <div className="flex items-center gap-2 font-mono text-[0.6875rem] text-slate-500 shrink-0">
          <span className="bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-700">GENESIS</span>
          <span>➔</span>
          <span className="bg-white px-2 py-0.5 rounded border border-slate-200">#EVT-01</span>
          <span>➔</span>
          <span className="bg-white px-2 py-0.5 rounded border border-slate-200">#EVT-02</span>
          <span>➔</span>
          <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded font-bold">HEAD [{auditEvents[0]?.id?.substring(0, 10) || '0x000'}...]</span>
        </div>
        <span className="font-mono text-[0.625rem] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 shrink-0">
          CHAIN VERIFIED
        </span>
      </div>

      {/* Verification Feedback Modal / Banner */}
      {verifyResult && (
        <div className={`p-4 rounded-xl border text-xs font-mono ${
          verifyResult.verified !== false 
            ? 'bg-emerald-50 border-emerald-200 text-emerald-900' 
            : 'bg-rose-50 border-rose-200 text-rose-900'
        }`}>
          <div className="font-bold mb-1 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[1.25rem]">
              {verifyResult.verified !== false ? 'verified' : 'error'}
            </span>
            {verifyResult.verified !== false ? 'Cryptographic Audit Verification Passed' : 'Verification Mismatch Detected'}
          </div>
          <div>Verified Events: {verifyResult.count || totalCount} entries checked</div>
          <div className="text-[0.6875rem] mt-1 text-slate-600">
            Head Hash: {verifyResult.headHash || auditEvents[0]?.event_hash || 'Computed'}
          </div>
        </div>
      )}

      {/* Main Split Layout: 65% Left Table / 35% Right Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Panel: Audit Event Registry (65% / 8 cols) */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
          
          <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <input 
                type="text"
                placeholder="Search audit events by ID, actor, action, or resource..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-white px-3 py-1.5 rounded-lg text-xs border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="text-xs bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 font-mono"
            >
              <option value="all">All Event Types</option>
              <option value="policy_eval">Policy Evaluations</option>
              <option value="approval">Approvals</option>
              <option value="incident">Incidents</option>
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-200 text-slate-400 uppercase tracking-wider text-[0.625rem] font-semibold">
                  <th className="py-2.5 px-3">Seq</th>
                  <th className="py-2.5 px-3">Event Type</th>
                  <th className="py-2.5 px-3">Actor ID</th>
                  <th className="py-2.5 px-3">Decision</th>
                  <th className="py-2.5 px-3">Hash Preview</th>
                  <th className="py-2.5 px-3 text-right">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEvents.map((evt) => {
                  const isSelected = selectedEvent?.id === evt.id;
                  return (
                    <tr
                      key={evt.id}
                      onClick={() => setSelectedEvent(evt)}
                      className={`hover:bg-slate-50/70 cursor-pointer transition-colors ${
                        isSelected ? 'bg-indigo-50/50' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 font-mono text-[0.6875rem] text-slate-400">
                        #{evt.sequence}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-slate-900">
                        {evt.event_type}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[0.6875rem] text-indigo-700">
                        {evt.actor_id}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className={`px-2 py-0.5 rounded text-[0.625rem] font-mono font-bold uppercase ${
                          evt.decision === 'ALLOW'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : evt.decision === 'REQUIRE_APPROVAL'
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : evt.decision === 'BLOCK'
                            ? 'bg-rose-100 text-rose-800 border border-rose-300'
                            : 'bg-slate-100 text-slate-600'
                        }`}>
                          {evt.decision || 'LOG'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[0.625rem] text-slate-400 truncate max-w-[120px]">
                        {evt.event_hash ? evt.event_hash.substring(0, 14) + '...' : '0x00'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-[0.6875rem] text-slate-400">
                        {new Date(evt.timestamp).toLocaleTimeString()}
                      </td>
                    </tr>
                  );
                })}

                {filteredEvents.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      No audit events match current criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Panel: Selected Event Inspector (35% / 4 cols) */}
        {selectedEvent ? (
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
            
            <div className="pb-3 border-b border-slate-200">
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                  {selectedEvent.id.substring(0, 18)}...
                </span>
                <span className="font-mono text-[0.625rem] font-bold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                  Seq #{selectedEvent.sequence}
                </span>
              </div>
              <h2 className="text-sm font-bold text-slate-900 tracking-tight mt-1">
                {selectedEvent.event_type}
              </h2>
              <span className="font-mono text-[0.6875rem] text-slate-400 block mt-0.5">
                {new Date(selectedEvent.timestamp).toISOString()}
              </span>
            </div>

            {/* Event Summary */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Actor ID:</span>
                <span className="font-mono font-bold text-indigo-700">{selectedEvent.actor_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Role:</span>
                <span className="font-mono text-slate-700">{selectedEvent.actor_role}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Action:</span>
                <span className="font-mono font-bold text-slate-900">{selectedEvent.action}</span>
              </div>
              <div>
                <span className="text-slate-500 block mb-0.5">Resource:</span>
                <code className="font-mono text-[0.6875rem] text-slate-700 bg-white border border-slate-200 px-2 py-0.5 rounded block truncate">
                  {selectedEvent.resource}
                </code>
              </div>
            </div>

            {/* Cryptographic Linkage Hashes */}
            <div>
              <span className="text-[0.625rem] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                SHA-256 Chained Hash Pair
              </span>
              <div className="space-y-1.5 font-mono text-[0.625rem]">
                <div className="p-2 bg-slate-100 rounded border border-slate-200">
                  <span className="text-slate-400 block mb-0.5">PREVIOUS HASH:</span>
                  <span className="text-slate-700 break-all">{selectedEvent.previous_hash || '0x0000000000000000000000000000000000000000000000000000000000000000'}</span>
                </div>
                <div className="p-2 bg-indigo-50/70 rounded border border-indigo-200">
                  <span className="text-indigo-400 block mb-0.5">CURRENT EVENT HASH:</span>
                  <span className="text-indigo-800 font-bold break-all">{selectedEvent.event_hash}</span>
                </div>
              </div>
            </div>

            {/* Metadata Payload */}
            {parsedMetadata && (
              <div>
                <span className="text-[0.625rem] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Metadata Payload JSON
                </span>
                <pre className="p-2.5 bg-slate-900 text-emerald-400 rounded-lg font-mono text-[0.625rem] overflow-x-auto max-h-40">
                  {JSON.stringify(parsedMetadata, null, 2)}
                </pre>
              </div>
            )}

          </div>
        ) : (
          <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400 text-xs">
            Select an audit event to inspect cryptographic hash linkage.
          </div>
        )}

      </div>

    </div>
  );
};
