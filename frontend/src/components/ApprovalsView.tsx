import React, { useState } from 'react';
import type { Approval } from '../types';
import { parseJsonSafe } from '../utils';

interface ApprovalsViewProps {
  approvals: Approval[];
  onDecideApproval: (approvalId: string, status: 'APPROVED' | 'REJECTED', reason: string, userId: string) => Promise<any>;
  selectedApprovalId?: string | null;
}

export const ApprovalsView: React.FC<ApprovalsViewProps> = ({
  approvals,
  onDecideApproval,
  selectedApprovalId
}) => {
  const [selectedApproval, setSelectedApproval] = useState<Approval | null>(
    selectedApprovalId 
      ? approvals.find(a => a.id === selectedApprovalId || a.request_id === selectedApprovalId) || approvals[0] || null
      : approvals[0] || null
  );

  const [statusFilter, setStatusFilter] = useState<'all' | 'PENDING' | 'APPROVED' | 'REJECTED'>('all');
  const [writtenReason, setWrittenReason] = useState('Authorized by lead reviewer for mission brief');
  const [reviewerUser, setReviewerUser] = useState<'usr-reviewer' | 'usr-admin'>('usr-reviewer');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [decisionResult, setDecisionResult] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showRawPayload, setShowRawPayload] = useState(false);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);

  const handleFetchAiExplanation = async () => {
    if (!selectedApproval) return;
    setIsExplaining(true);
    try {
      const res = await fetch(`/api/actions/explain/${selectedApproval.request_id}`, {
        method: 'POST'
      });
      if (res.ok) {
        const data = await parseJsonSafe(res);
        if (data?.explanation) {
          setAiExplanation(data.explanation);
        }
      }
    } catch (err) {
      console.error('Failed to get AI explanation:', err);
    } finally {
      setIsExplaining(false);
    }
  };

  const pendingCount = approvals.filter(a => a.status === 'PENDING').length;
  const approvedCount = approvals.filter(a => a.status === 'APPROVED').length;
  const rejectedCount = approvals.filter(a => a.status === 'REJECTED').length;

  const filteredApprovals = approvals.filter(a => {
    if (statusFilter === 'all') return true;
    return a.status === statusFilter;
  });

  const handleAction = async (decision: 'APPROVED' | 'REJECTED') => {
    if (!selectedApproval) return;
    if (!writtenReason.trim()) {
      setErrorMessage('A written justification is mandatory for audit accountability.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    setDecisionResult(null);

    try {
      const res = await onDecideApproval(
        selectedApproval.id,
        decision,
        writtenReason,
        reviewerUser
      );
      setDecisionResult(res);
      // update local status
      setSelectedApproval(prev => prev ? {
        ...prev,
        status: decision,
        reason: writtenReason,
        approver_id: reviewerUser,
        execution_status: decision === 'APPROVED' ? 'EXECUTED' : 'NOT_EXECUTED'
      } : null);
    } catch (err: any) {
      setErrorMessage(err.message || 'Approval decision failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Safe parse helper
  const parsedParams = selectedApproval ? (
    typeof selectedApproval.parameters === 'string'
      ? (() => { try { return JSON.parse(selectedApproval.parameters); } catch { return selectedApproval.parameters; } })()
      : selectedApproval.parameters
  ) : null;

  const parsedEvidence = selectedApproval?.evidence_checks ? (
    typeof selectedApproval.evidence_checks === 'string'
      ? (() => { try { return JSON.parse(selectedApproval.evidence_checks as string); } catch { return null; } })()
      : selectedApproval.evidence_checks
  ) : null;

  return (
    <div className="flex flex-col w-full space-y-6">
      
      {/* Page Title & Status */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Human-in-the-Loop Approval Inbox
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-3xl">
            Dual-custody review queue. Autonomous agent actions held by policy or domain quality preconditions require authorized human clearance.
          </p>
        </div>
      </div>

      {/* Summary Metric Strip (4 Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={`p-4 rounded-xl bg-white shadow-sm flex flex-col justify-between ${
          pendingCount > 0 ? 'border-2 border-amber-400 bg-amber-50/20' : 'border border-slate-200'
        }`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-amber-800">Pending Review</span>
            <span className={`w-2 h-2 rounded-full bg-amber-500 ${pendingCount > 0 ? 'animate-pulse' : ''}`}></span>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold text-amber-700">{pendingCount}</div>
            <span className="text-[0.6875rem] text-slate-500 mt-0.5 block">Held for clearance</span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-emerald-800">Approved & Executed</span>
            <span className="material-symbols-outlined text-emerald-600 text-[1.25rem]">check_circle</span>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold text-emerald-700">{approvedCount}</div>
            <span className="text-[0.6875rem] text-slate-500 mt-0.5 block">HMAC token issued</span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-rose-800">Rejected & Halted</span>
            <span className="material-symbols-outlined text-rose-600 text-[1.25rem]">cancel</span>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold text-rose-700">{rejectedCount}</div>
            <span className="text-[0.6875rem] text-slate-500 mt-0.5 block">Zero side effects</span>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500 font-medium">Total Inbound Holds</span>
            <span className="material-symbols-outlined text-slate-400 text-[1.25rem]">fact_check</span>
          </div>
          <div className="mt-2">
            <div className="text-2xl font-bold text-slate-900">{approvals.length}</div>
            <span className="text-[0.6875rem] text-slate-500 mt-0.5 block">Deterministic gating</span>
          </div>
        </div>
      </div>

      {/* Main Two-Column Split Pane */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: Approval Queue (~58% / 7 cols) */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
          
          {/* Queue Filter Toolbar */}
          <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap">
            <span className="font-mono text-xs font-bold text-slate-700 uppercase tracking-wide">
              Queue Items ({filteredApprovals.length})
            </span>
            <div className="flex items-center gap-1">
              {(['all', 'PENDING', 'APPROVED', 'REJECTED'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setStatusFilter(filter)}
                  className={`px-2.5 py-1 rounded text-[0.6875rem] font-semibold transition-all ${
                    statusFilter === filter
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {filter === 'all' ? 'All' : filter}
                </button>
              ))}
            </div>
          </div>

          {/* Queue Cards List */}
          <div className="divide-y divide-slate-100 max-h-[calc(100vh-16rem)] overflow-y-auto">
            {filteredApprovals.map((item) => {
              const isSelected = selectedApproval?.id === item.id;
              return (
                <div
                  key={item.id}
                  onClick={() => setSelectedApproval(item)}
                  className={`p-4 cursor-pointer transition-all ${
                    isSelected 
                      ? 'bg-indigo-50/60 border-l-4 border-indigo-600' 
                      : 'hover:bg-slate-50/70 border-l-4 border-transparent'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-900">{item.request_id}</span>
                      <span className="text-slate-300">•</span>
                      <span className="font-mono text-[0.6875rem] text-slate-500">{item.agent_id}</span>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[0.625rem] font-mono font-bold uppercase ${
                      item.status === 'PENDING'
                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                        : item.status === 'APPROVED'
                        ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                        : 'bg-rose-100 text-rose-800 border border-rose-300'
                    }`}>
                      {item.status}
                    </span>
                  </div>

                  <div className="text-xs font-bold text-slate-900 mb-1 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[1rem] text-indigo-600">bolt</span>
                    <span>Operation: <code className="font-mono text-indigo-700">{item.operation}</code></span>
                  </div>

                  <p className="text-[0.6875rem] text-slate-600 line-clamp-1 mb-2">
                    Target: <code className="font-mono text-slate-500">{item.resource}</code>
                  </p>

                  <div className="flex items-center justify-between text-[0.625rem] font-mono text-slate-400 pt-1 border-t border-slate-100">
                    <span className="text-amber-700 font-semibold truncate max-w-[220px]">
                      {item.gate_reason_code || 'REQUIRE_APPROVAL'}
                    </span>
                    <span>{new Date(item.requested_at).toLocaleTimeString()}</span>
                  </div>
                </div>
              );
            })}

            {filteredApprovals.length === 0 && (
              <div className="p-8 text-center text-slate-400 text-xs">
                No approval records match the current filter.
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Selected Request Inspector (~42% / 5 cols) */}
        {selectedApproval ? (
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
            
            {/* Header Identity */}
            <div className="pb-3 border-b border-slate-200 flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[0.6875rem] text-slate-400">RECORD:</span>
                  <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                    {selectedApproval.request_id}
                  </span>
                </div>
                <span className={`px-2 py-0.5 rounded text-[0.625rem] font-mono font-bold uppercase ${
                  selectedApproval.status === 'PENDING'
                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                    : selectedApproval.status === 'APPROVED'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-rose-100 text-rose-800 border border-rose-300'
                }`}>
                  Status: {selectedApproval.status}
                </span>
              </div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                Authorize {selectedApproval.operation}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {selectedApproval.request_explanation || 'Action requires dual-custody approval before execution.'}
              </p>

              {/* TRI-STATE GOVERNANCE SEPARATION */}
              <div className="grid grid-cols-3 gap-2 pt-2">
                <div className="flex flex-col p-2 rounded-lg bg-amber-50 border border-amber-200">
                  <span className="font-mono text-[0.5625rem] text-amber-800 font-bold uppercase tracking-wider">
                    Policy Decision
                  </span>
                  <span className="text-xs font-bold text-amber-900 mt-0.5">
                    {selectedApproval.gate_decision || 'REQUIRE_APPROVAL'}
                  </span>
                </div>
                <div className="flex flex-col p-2 rounded-lg bg-amber-50 border border-amber-200">
                  <span className="font-mono text-[0.5625rem] text-amber-800 font-bold uppercase tracking-wider">
                    Approval Status
                  </span>
                  <span className="text-xs font-bold text-amber-900 mt-0.5 capitalize">
                    {selectedApproval.status}
                  </span>
                </div>
                <div className="flex flex-col p-2 rounded-lg bg-slate-100 border border-slate-200">
                  <span className="font-mono text-[0.5625rem] text-slate-600 font-bold uppercase tracking-wider">
                    Execution Status
                  </span>
                  <span className="text-xs font-bold text-slate-800 mt-0.5">
                    {selectedApproval.execution_status || 'NOT_EXECUTED'}
                  </span>
                </div>
              </div>
            </div>

            {/* SECTION A · REQUEST IDENTITY & CONTEXT */}
            <div>
              <span className="text-[0.625rem] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                SECTION A · REQUEST IDENTITY & CONTEXT
              </span>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Agent Dispatcher:</span>
                  <span className="font-mono font-bold text-indigo-700">{selectedApproval.agent_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Category:</span>
                  <span className="font-mono text-slate-800">{selectedApproval.agent_category || 'predictive_maintenance'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Operation:</span>
                  <span className="font-mono font-bold text-slate-900">{selectedApproval.operation}</span>
                </div>
                <div>
                  <span className="text-slate-500 block mb-0.5">Resource:</span>
                  <code className="font-mono text-[0.6875rem] text-slate-700 bg-white border border-slate-200 px-2 py-0.5 rounded block truncate">
                    {selectedApproval.resource}
                  </code>
                </div>
              </div>
            </div>

            {/* SECTION B · REASON CODE & EXPLANATION */}
            <div className="space-y-2">
              <span className="text-[0.625rem] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                SECTION B · GATE EVALUATION & REASON CODE
              </span>
              <div className="p-3 rounded-lg bg-amber-50/60 border border-amber-200 space-y-1 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-amber-700 text-[1rem]">info</span>
                  <span className="font-mono font-bold text-amber-900">
                    {selectedApproval.gate_reason_code || 'STALE_TELEMETRY_HELD_FOR_HUMAN'}
                  </span>
                </div>
                <p className="text-[0.6875rem] text-amber-800/90 leading-relaxed">
                  {selectedApproval.request_explanation || 'Telemetry quality preconditions require human evaluation.'}
                </p>
              </div>

              {/* L2 AI Plain-Language Review */}
              <div className="p-3 rounded-lg bg-indigo-50/60 border border-indigo-200 space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-indigo-900 font-bold text-[0.6875rem]">
                    <span className="material-symbols-outlined text-indigo-600 text-[1rem]">psychology</span>
                    <span>AI Governance Advisor (Plain-Language L2)</span>
                  </div>
                  <button
                    onClick={handleFetchAiExplanation}
                    disabled={isExplaining}
                    className="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-mono text-[0.625rem] transition-colors flex items-center gap-1"
                  >
                    <span className={`material-symbols-outlined text-[0.875rem] ${isExplaining ? 'animate-spin' : ''}`}>auto_awesome</span>
                    {isExplaining ? 'Synthesizing...' : aiExplanation ? 'Re-analyze' : 'Analyze Request'}
                  </button>
                </div>
                {aiExplanation ? (
                  <p className="text-[0.6875rem] text-indigo-950/90 leading-relaxed bg-white/70 p-2 rounded border border-indigo-100">
                    {aiExplanation}
                  </p>
                ) : (
                  <p className="text-[0.625rem] text-indigo-700/80 italic">
                    Click "Analyze Request" to generate an untrusted plain-language governance brief explaining policy limits and telemetry nuances.
                  </p>
                )}
              </div>
            </div>

            {/* SECTION C · DETERMINISTIC EVIDENCE CHECKS */}
            {parsedEvidence && parsedEvidence.checks && (
              <div>
                <span className="text-[0.625rem] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  SECTION C · EVIDENCE & PRECONDITIONS EVALUATION
                </span>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-2 text-xs">
                  {parsedEvidence.checks.map((chk: any, idx: number) => (
                    <div key={idx} className="flex items-start justify-between gap-2 text-[0.6875rem]">
                      <div className="flex items-center gap-1.5">
                        <span className={`material-symbols-outlined text-[1rem] ${chk.passed ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {chk.passed ? 'check_circle' : 'warning'}
                        </span>
                        <span className="font-mono font-semibold text-slate-800">{chk.name}</span>
                      </div>
                      <span className={`font-mono text-[0.625rem] px-1.5 py-0.2 rounded font-bold ${
                        chk.passed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {chk.passed ? 'PASSED' : 'HOLD'}
                      </span>
                    </div>
                  ))}
                  {parsedEvidence.freshnessResult && !parsedEvidence.freshnessResult.isFresh && (
                    <div className="p-2 bg-amber-100/50 rounded border border-amber-200 text-[0.625rem] font-mono text-amber-900">
                      Age: {parsedEvidence.freshnessResult.ageSeconds}s (Configured max: {parsedEvidence.freshnessResult.maxAgeSeconds}s)
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* SECTION D · ACTION PARAMETERS / PAYLOAD */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[0.625rem] font-bold uppercase tracking-wider text-slate-400">
                  SECTION D · ACTION PARAMETERS
                </span>
                <button
                  onClick={() => setShowRawPayload(!showRawPayload)}
                  className="font-mono text-[0.625rem] text-indigo-600 hover:underline"
                >
                  {showRawPayload ? 'Hide JSON' : 'View Payload JSON'}
                </button>
              </div>
              {showRawPayload && (
                <pre className="p-2.5 bg-slate-900 text-emerald-400 rounded-lg font-mono text-[0.625rem] overflow-x-auto max-h-40">
                  {JSON.stringify(parsedParams, null, 2)}
                </pre>
              )}
            </div>

            {/* SECTION E · HUMAN CLEARANCE DECISION CONTROLS */}
            {selectedApproval.status === 'PENDING' ? (
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                <span className="text-[0.625rem] font-bold uppercase tracking-wider text-slate-500 block">
                  SECTION E · HUMAN CLEARANCE CONTROLS
                </span>

                <div>
                  <label className="text-[0.6875rem] font-semibold text-slate-700 block mb-1">
                    Reviewer Identity & Clearance Role:
                  </label>
                  <select 
                    value={reviewerUser}
                    onChange={(e: any) => setReviewerUser(e.target.value)}
                    className="w-full text-xs p-1.5 rounded-lg bg-white border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
                  >
                    <option value="usr-reviewer">usr-reviewer (Delegated Governance Reviewer)</option>
                    <option value="usr-admin">usr-admin (Mission Director & System Administrator)</option>
                  </select>
                </div>

                <div>
                  <label className="text-[0.6875rem] font-semibold text-slate-700 block mb-1">
                    Written Decision Justification (Mandatory):
                  </label>
                  <textarea 
                    rows={2}
                    value={writtenReason}
                    onChange={(e) => setWrittenReason(e.target.value)}
                    placeholder="Enter explicit operational justification for this clearance decision..."
                    className="w-full text-xs p-2 rounded-lg bg-white border border-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-900"
                  />
                </div>

                {errorMessage && (
                  <div className="p-2 rounded bg-rose-50 border border-rose-200 text-rose-700 text-xs font-mono">
                    {errorMessage}
                  </div>
                )}

                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => handleAction('APPROVED')}
                    disabled={isSubmitting}
                    className="flex-1 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <span className="material-symbols-outlined text-[1rem]">verified</span>
                    {isSubmitting ? 'Processing...' : 'Approve & Execute'}
                  </button>
                  <button
                    onClick={() => handleAction('REJECTED')}
                    disabled={isSubmitting}
                    className="px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                  >
                    <span className="material-symbols-outlined text-[1rem]">cancel</span>
                    {isSubmitting ? 'Processing...' : 'Reject Request'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
                <div className="flex items-center justify-between font-mono text-[0.6875rem]">
                  <span className="text-slate-500">Decided By:</span>
                  <span className="font-bold text-slate-800">{selectedApproval.approver_id || 'usr-reviewer'}</span>
                </div>
                <div className="flex items-center justify-between font-mono text-[0.6875rem]">
                  <span className="text-slate-500">Verdict:</span>
                  <span className={`font-bold ${selectedApproval.status === 'APPROVED' ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {selectedApproval.status}
                  </span>
                </div>
                <p className="text-[0.6875rem] text-slate-600 pt-1 border-t border-slate-200">
                  Justification: "{selectedApproval.reason || 'Verified by human clearance authority'}"
                </p>
              </div>
            )}

            {/* Decision Outcome Banner */}
            {decisionResult && (
              <div className={`p-3 rounded-lg border text-xs font-mono ${
                decisionResult.approvalStatus === 'APPROVED' 
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                  : 'bg-rose-50 border-rose-200 text-rose-800'
              }`}>
                <div className="font-bold mb-1">Clearance Verdict Recorded</div>
                <div>Execution Status: {decisionResult.executionStatus}</div>
                {decisionResult.executionToken && (
                  <div className="truncate text-[0.625rem] mt-1 text-slate-600">
                    HMAC Token: {decisionResult.executionToken}
                  </div>
                )}
              </div>
            )}

          </div>
        ) : (
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400 text-xs">
            Select a request from the queue to view details and execute clearance.
          </div>
        )}

      </div>

    </div>
  );
};
