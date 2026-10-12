import React, { useState, useEffect } from 'react';
import type { Approval, AuthUser } from '../types';
import { parseJsonSafe, formatSafeTime } from '../utils';

interface ApprovalsViewProps {
  approvals: Approval[];
  onDecideApproval: (
    approvalId: string,
    status: 'APPROVED' | 'REJECTED',
    reason: string,
    options?: { wrongCallConfirmed?: boolean }
  ) => Promise<any>;
  selectedApprovalId?: string | null;
  currentUser?: AuthUser;
}

export const ApprovalsView: React.FC<ApprovalsViewProps> = ({
  approvals,
  onDecideApproval,
  selectedApprovalId,
  currentUser
}) => {
  const [selectedApproval, setSelectedApproval] = useState<Approval | null>(
    selectedApprovalId 
      ? approvals.find(a => a.id === selectedApprovalId || a.request_id === selectedApprovalId) || approvals[0] || null
      : approvals[0] || null
  );

  const [statusFilter, setStatusFilter] = useState<'all' | 'PENDING' | 'APPROVED' | 'REJECTED'>('all');
  const [writtenReason, setWrittenReason] = useState('Authorized by lead reviewer for mission brief');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [decisionResult, setDecisionResult] = useState<any>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showRawPayload, setShowRawPayload] = useState(false);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);
  const [isReopening, setIsReopening] = useState(false);
  const [reopenError, setReopenError] = useState<string | null>(null);

  // Wrong-Call Prevention Modal State
  const [isWrongCallModalOpen, setIsWrongCallModalOpen] = useState(false);
  const [wrongCallModalReason, setWrongCallModalReason] = useState('');
  const [wrongCallModalError, setWrongCallModalError] = useState<string | null>(null);

  // Sync selectedApproval with selectedApprovalId and fresh approvals array
  useEffect(() => {
    if (selectedApprovalId) {
      const match = approvals.find(a => a.id === selectedApprovalId || a.request_id === selectedApprovalId);
      if (match) {
        setSelectedApproval(match);
        return;
      }
    }
    if (selectedApproval) {
      const fresh = approvals.find(a => a.id === selectedApproval.id);
      if (fresh) {
        setSelectedApproval(fresh);
        return;
      }
    }
    if (approvals.length > 0 && !selectedApproval) {
      setSelectedApproval(approvals[0]);
    }
  }, [selectedApprovalId, approvals]);

  const handleReopenDirect = async () => {
    if (!selectedApproval) return;
    setIsReopening(true);
    setReopenError(null);
    try {
      const res = await fetch(`/api/approvals/${selectedApproval.id}/reopen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: 'Reopened following administrative review for re-evaluation of mistaken rejection.'
        })
      });
      const data = await parseJsonSafe(res);
      if (!res.ok) {
        throw new Error(data?.error || `Failed to reopen approval (${res.status})`);
      }
      setSelectedApproval(prev => prev ? {
        ...prev,
        status: 'PENDING',
        reopened_from_id: prev.id,
        reason: null,
        approver_id: null,
        execution_status: 'NOT_EXECUTED'
      } : null);
      setWrittenReason('Re-evaluation clearance confirmed following administrative audit review.');
    } catch (err: any) {
      setReopenError(err.message || 'Failed to reopen case');
    } finally {
      setIsReopening(false);
    }
  };

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

  const allChecksPassed = Boolean(
    parsedEvidence &&
    Array.isArray(parsedEvidence.checks) &&
    parsedEvidence.checks.length > 0 &&
    parsedEvidence.checks.every((c: any) => c.passed === true)
  );

  const requestAmount = parsedParams?.amount != null ? Number(parsedParams.amount) : null;
  const extractedLimitMatch = selectedApproval?.request_explanation?.match(/threshold of \$?([0-9,]+)/i);
  const policyLimit = (selectedApproval as any)?.policy_limit != null
    ? (selectedApproval as any).policy_limit
    : (extractedLimitMatch ? Number(extractedLimitMatch[1].replace(/,/g, '')) : (selectedApproval?.operation === 'issue_refund' ? 5000 : null));

  const executeDecision = async (
    decision: 'APPROVED' | 'REJECTED',
    reasonText: string,
    options?: { wrongCallConfirmed?: boolean }
  ) => {
    if (!selectedApproval) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    setDecisionResult(null);

    try {
      const res = await onDecideApproval(
        selectedApproval.id,
        decision,
        reasonText,
        options
      );
      setDecisionResult(res);
      // update local status
      setSelectedApproval(prev => prev ? {
        ...prev,
        status: decision,
        reason: reasonText,
        approver_id: currentUser?.username || 'authorized-reviewer',
        execution_status: decision === 'APPROVED' ? 'EXECUTED' : 'NOT_EXECUTED'
      } : null);
      setIsWrongCallModalOpen(false);
    } catch (err: any) {
      setErrorMessage(err.message || 'Approval decision failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAction = async (decision: 'APPROVED' | 'REJECTED') => {
    if (!selectedApproval) return;
    if (!writtenReason.trim()) {
      setErrorMessage('A written justification is mandatory for audit accountability.');
      return;
    }

    // Wrong-Call Prevention: If all automated evidence checks passed, require explicit confirmation modal
    if (decision === 'REJECTED' && allChecksPassed) {
      setWrongCallModalReason(writtenReason);
      setWrongCallModalError(null);
      setIsWrongCallModalOpen(true);
      return;
    }

    await executeDecision(decision, writtenReason);
  };

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
                    <div className="flex items-center gap-1.5">
                      <span className={`px-2 py-0.5 rounded text-[0.625rem] font-mono font-bold uppercase ${
                        item.status === 'PENDING'
                          ? 'bg-amber-100 text-amber-800 border border-amber-300'
                          : item.status === 'APPROVED'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-rose-100 text-rose-800 border border-rose-300'
                      }`}>
                        {item.status}
                      </span>
                      {item.reopened_from_id && (
                        <span className="px-1.5 py-0.5 rounded text-[0.5625rem] font-mono font-bold bg-indigo-100 text-indigo-800 border border-indigo-200" title="Recovered from earlier rejection">
                          REOPENED
                        </span>
                      )}
                    </div>
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
                    <div className="flex items-center gap-2">
                      {item.status === 'REJECTED' && (
                        <span className="text-[0.625rem] text-indigo-600 font-sans font-semibold underline">
                          Re-evaluate
                        </span>
                      )}
                      <span>{formatSafeTime(item.requested_at)}</span>
                    </div>
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

                {selectedApproval.reopened_from_id && (
                  <div className="p-2.5 rounded-lg bg-indigo-50 border border-indigo-200 text-xs text-indigo-900 flex items-start gap-2">
                    <span className="material-symbols-outlined text-indigo-600 text-[1.125rem]">settings_backup_restore</span>
                    <div>
                      <strong className="block text-[0.6875rem] font-bold text-indigo-950 uppercase tracking-wider">
                        Reopened Case (Overturned Rejection)
                      </strong>
                      <span className="text-[0.6875rem] text-indigo-800 leading-relaxed block mt-0.5">
                        This request was recovered from an initial rejection ({selectedApproval.reopened_from_id}). Review the evidence above to either <strong>Approve & Execute</strong> or <strong>Reject</strong>.
                      </span>
                    </div>
                  </div>
                )}

                <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                  <div className="flex items-center justify-between">
                    <span className="text-[0.6875rem] font-semibold text-slate-600">Reviewer Identity (JWT Token-Bound):</span>
                    <span className="text-xs font-mono font-bold text-slate-800 flex items-center gap-1">
                      <span className="material-symbols-outlined text-xs text-indigo-600">verified_user</span>
                      @{currentUser?.username || 'reviewer'} (L{currentUser?.authority_level ?? 1})
                    </span>
                  </div>
                  {currentUser?.role === 'auditor' && (
                    <div className="mt-1.5 text-[0.6875rem] text-rose-700 bg-rose-50 border border-rose-200 p-1.5 rounded">
                      Auditor role is read-only. Reviewer or Admin clearance required to approve/reject requests.
                    </div>
                  )}
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
                    disabled={isSubmitting || currentUser?.role === 'auditor'}
                    className={`flex-1 px-3 py-2 rounded-lg text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm ${
                      currentUser?.role === 'auditor' ? 'bg-slate-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[1rem]">verified</span>
                    {isSubmitting ? 'Processing...' : 'Approve & Execute'}
                  </button>
                  <button
                    onClick={() => handleAction('REJECTED')}
                    disabled={isSubmitting || currentUser?.role === 'auditor'}
                    className={`px-3.5 py-2 rounded-lg text-white font-bold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm ${
                      currentUser?.role === 'auditor' ? 'bg-slate-400 cursor-not-allowed' : 'bg-rose-600 hover:bg-rose-700'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[1rem]">cancel</span>
                    {isSubmitting ? 'Processing...' : 'Reject Request'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
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

                {selectedApproval.status === 'REJECTED' && (
                  <div className="p-3.5 bg-gradient-to-r from-amber-50 to-indigo-50/60 border border-amber-200/80 rounded-lg space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 text-amber-950 font-bold text-xs">
                        <span className="material-symbols-outlined text-[1.125rem] text-amber-600">settings_backup_restore</span>
                        <span>Mistaken Rejection? Re-evaluate Request</span>
                      </div>
                      <span className="text-[0.625rem] font-mono font-bold bg-amber-200/80 text-amber-900 px-1.5 py-0.5 rounded">
                        RECOVERABLE
                      </span>
                    </div>
                    <p className="text-[0.6875rem] text-slate-700 leading-relaxed">
                      If this case was rejected by mistake, you can recover it directly from Backup &amp; Recovery and reopen it for re-evaluation. Reopening will return this request to active <strong>PENDING</strong> review so you can either approve or reject it.
                    </p>
                    <button
                      onClick={handleReopenDirect}
                      disabled={isReopening}
                      className="w-full py-2 px-3 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <span className="material-symbols-outlined text-[1rem]">replay</span>
                      {isReopening ? 'Restoring for Re-evaluation...' : 'Reopen for Re-evaluation (Approve / Reject)'}
                    </button>
                    {reopenError && (
                      <div className="p-2 rounded bg-rose-50 border border-rose-200 text-rose-700 text-xs font-mono">
                        {reopenError}
                      </div>
                    )}
                  </div>
                )}
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

      {/* Wrong-Call Prevention Confirmation Modal */}
      {isWrongCallModalOpen && selectedApproval && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl border border-rose-200 shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-rose-600 text-[1.5rem]">warning</span>
                <h3 className="text-base font-bold text-slate-900">Confirm Rejection: Evidence Checks Passed</h3>
              </div>
              <button 
                onClick={() => setIsWrongCallModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 leading-relaxed">
              <strong>Caution (Wrong-Call Prevention):</strong> All automated evidence and telemetry quality checks have <strong>PASSED</strong> for this request. Rejecting this action overrides verified system preconditions and will be logged in the permanent audit trail.
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[0.625rem] font-bold uppercase tracking-wider text-slate-500 block">Requested Amount</span>
                <span className="text-base font-mono font-bold text-slate-900">
                  {requestAmount != null ? `$${requestAmount.toLocaleString('en-US')}` : 'N/A'}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <span className="text-[0.625rem] font-bold uppercase tracking-wider text-slate-500 block">Policy Auto Limit</span>
                <span className="text-base font-mono font-bold text-indigo-700">
                  {policyLimit != null ? `$${policyLimit.toLocaleString('en-US')}` : 'N/A'}
                </span>
              </div>
            </div>

            <div>
              <span className="text-[0.625rem] font-bold uppercase tracking-wider text-slate-500 block mb-1">
                Passed Automated Evidence Checks ({parsedEvidence?.checks?.length || 0})
              </span>
              <div className="p-2.5 rounded-lg bg-emerald-50/60 border border-emerald-200 space-y-1.5 max-h-36 overflow-y-auto">
                {parsedEvidence?.checks?.map((chk: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 text-emerald-950 font-medium text-[0.6875rem]">
                      <span className="material-symbols-outlined text-emerald-600 text-[1rem]">check_circle</span>
                      <span>{chk.name}</span>
                    </div>
                    <span className="px-1.5 py-0.2 rounded font-mono text-[0.625rem] font-bold bg-emerald-200 text-emerald-900">
                      PASSED
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[0.6875rem] font-semibold text-slate-700 block mb-1">
                Mandatory Rejection Justification (Logged to Audit Trail):
              </label>
              <textarea
                rows={2}
                value={wrongCallModalReason}
                onChange={(e) => setWrongCallModalReason(e.target.value)}
                placeholder="Explain the explicit operational reason for rejecting this verified request..."
                className="w-full text-xs p-2.5 rounded-lg bg-slate-50 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-rose-500 text-slate-900"
              />
              {wrongCallModalError && (
                <span className="text-xs text-rose-600 mt-1 block">{wrongCallModalError}</span>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsWrongCallModalOpen(false)}
                className="px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
              >
                Cancel (Keep in Queue)
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={async () => {
                  if (!wrongCallModalReason.trim()) {
                    setWrongCallModalError('A written reason is required to confirm rejection of a verified request.');
                    return;
                  }
                  await executeDecision('REJECTED', wrongCallModalReason, { wrongCallConfirmed: true });
                }}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-colors shadow-sm flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[1rem]">gpp_bad</span>
                {isSubmitting ? 'Confirming...' : 'Confirm Rejection (Log to Audit)'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
