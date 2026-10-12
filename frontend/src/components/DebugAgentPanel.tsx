import React, { useState, useEffect } from 'react';
import type { DebugRunResult, Tab } from '../types';
import { parseJsonSafe } from '../utils';

interface DebugAgentPanelProps {
  incidentId: string;
  onNavigateTab?: (tab: Tab) => void;
  onRefresh?: () => void;
}

export const DebugAgentPanel: React.FC<DebugAgentPanelProps> = ({
  incidentId,
  onNavigateTab,
  onRefresh
}) => {
  const [debugRun, setDebugRun] = useState<DebugRunResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isHistoryLoading, setIsHistoryLoading] = useState(false);
  const [forceLLM, setForceLLM] = useState(false);
  const [approvalStatus, setApprovalStatus] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch debug history for this incident
  useEffect(() => {
    let isMounted = true;
    const fetchHistory = async () => {
      setIsHistoryLoading(true);
      setErrorMessage(null);
      try {
        const res = await fetch(`/api/debug/${incidentId}`);
        if (res.ok) {
          const history = await parseJsonSafe(res);
          if (isMounted && Array.isArray(history) && history.length > 0) {
            setDebugRun(history[0]); // Most recent run
          } else if (isMounted) {
            setDebugRun(null);
          }
        }
      } catch (err: any) {
        console.error('Failed to fetch debug history:', err);
      } finally {
        if (isMounted) setIsHistoryLoading(false);
      }
    };

    fetchHistory();
    return () => {
      isMounted = false;
    };
  }, [incidentId]);

  const handleRunDebugAgent = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setApprovalStatus(null);
    try {
      const res = await fetch(`/api/debug/${incidentId}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'usr-admin',
          forceLLM
        })
      });
      const data = await parseJsonSafe(res);
      if (!res.ok) {
        throw new Error(data?.error || `Debug run failed with status ${res.status}`);
      }
      setDebugRun(data);
      if (onRefresh) onRefresh();
    } catch (err: any) {
      setErrorMessage(err.message || 'Debug Agent loop failed to execute.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendToApproval = () => {
    const finalCorrectionId = debugRun?.finalCorrectionId || debugRun?.final_correction_id;
    if (!finalCorrectionId) return;
    setApprovalStatus(`Proposal ${finalCorrectionId} queued for Human Review (Proposer: debug-agent, Status: PENDING). A human administrator must evaluate and approve via the Corrections console to satisfy separation-of-duties (R7).`);
    if (onRefresh) onRefresh();
  };

  return (
    <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-slate-100 rounded-xl p-5 shadow-lg border border-indigo-800/40 space-y-4">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-indigo-800/40">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600/30 border border-indigo-400/40 flex items-center justify-center text-indigo-400">
            <span className="material-symbols-outlined text-[1.25rem]">smart_toy</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold tracking-tight text-white">
                Debugging Agent v2
              </h3>
              <span className="px-2 py-0.5 rounded text-[0.625rem] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30">
                CLOSED-LOOP REPAIR
              </span>
            </div>
            <p className="text-[0.6875rem] text-slate-400 mt-0.5">
              Deterministic diagnostics → bounded LLM patch proposal → Diff Guard + S1–S6/B1–B6 sandbox feedback loop (max 3 tries)
            </p>
          </div>
        </div>

        {/* Trigger controls */}
        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-1.5 text-[0.6875rem] text-slate-300 cursor-pointer bg-slate-800/60 px-2 py-1 rounded border border-slate-700 select-none">
            <input
              type="checkbox"
              checked={forceLLM}
              onChange={(e) => setForceLLM(e.target.checked)}
              className="rounded bg-slate-900 border-slate-600 text-indigo-600 focus:ring-0 w-3 h-3"
            />
            <span>Force LLM (Unknown Sig)</span>
          </label>

          <button
            onClick={handleRunDebugAgent}
            disabled={isLoading}
            className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="material-symbols-outlined text-[1rem]">
              {isLoading ? 'progress_activity' : 'play_arrow'}
            </span>
            {isLoading ? 'Evaluating Loop (1–3)...' : 'Run Debug Agent'}
          </button>
        </div>
      </div>

      {/* Error alert */}
      {errorMessage && (
        <div className="p-3 bg-rose-950/80 border border-rose-700/60 text-rose-200 rounded-lg text-xs flex items-center gap-2">
          <span className="material-symbols-outlined text-rose-400 text-[1.125rem]">error</span>
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main run display */}
      {isHistoryLoading && !debugRun && (
        <div className="p-6 text-center text-xs text-slate-400">
          Loading debug history...
        </div>
      )}

      {!isHistoryLoading && !debugRun && !isLoading && (
        <div className="p-6 text-center text-xs text-slate-400 bg-slate-800/30 rounded-lg border border-slate-800">
          No Debug Agent runs recorded for this incident yet. Click <strong className="text-indigo-300">Run Debug Agent</strong> to initiate deterministic diagnostics and closed-loop sandbox verification.
        </div>
      )}

      {debugRun && (
        <div className="space-y-4">
          {/* Status Badge & Summary Strip */}
          <div className="p-3.5 bg-slate-800/60 border border-slate-700/60 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-slate-400">Final Outcome:</span>
                {debugRun.status === 'VERIFIED_READY_FOR_APPROVAL' ? (
                  <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-600/60 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                    VERIFIED — READY FOR APPROVAL
                  </span>
                ) : (
                  <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-rose-950 text-rose-300 border border-rose-600/60 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-rose-400 animate-pulse"></span>
                    ESCALATED TO HUMAN REVIEW
                  </span>
                )}
                <span className="font-mono text-[0.6875rem] text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                  {debugRun.signatureId || debugRun.signature_id}
                </span>
              </div>
              <div className="text-xs text-slate-300 leading-relaxed">
                {debugRun.proposalSummary || debugRun.proposal_summary || debugRun.escalationReason || debugRun.escalation_reason || 'Autonomous closed-loop iteration complete.'}
              </div>
            </div>

            <div className="flex items-center gap-3 shrink-0 text-right">
              <div className="flex flex-col">
                <span className="text-[0.625rem] text-slate-400 uppercase font-mono">Iterations</span>
                <span className="text-sm font-bold text-white font-mono">{(debugRun.attemptsCount ?? debugRun.attempts_count ?? debugRun.attempts?.length) || 1} of 3</span>
              </div>
              {(debugRun.finalCorrectionId || debugRun.final_correction_id) && (
                <div className="flex flex-col">
                  <span className="text-[0.625rem] text-slate-400 uppercase font-mono">Correction ID</span>
                  <span className="text-xs font-bold text-indigo-300 font-mono">{debugRun.finalCorrectionId || debugRun.final_correction_id}</span>
                </div>
              )}
            </div>
          </div>

          {/* Attempts Timeline */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-300 font-bold uppercase tracking-wider font-mono">
              <span>Closed-Loop Attempts Timeline ({debugRun.attempts?.length || 0})</span>
              <span className="text-[0.625rem] text-slate-400 font-normal">Diff Guard S2/S3 &amp; Air-Gapped Sandbox S1–S6 / B1–B6</span>
            </div>

            <div className="space-y-2.5">
              {debugRun.attempts?.map((attempt, idx) => {
                const attemptNum = attempt.attemptNumber ?? attempt.attempt_number ?? (idx + 1);
                const verdict = attempt.verdict ?? attempt.validator_verdict ?? 'FAIL';
                const isPass = verdict === 'PASS';
                const failureReasons = attempt.failureReasons ?? attempt.failure_reasons ?? [];
                const patch = attempt.patchProposal ?? attempt.proposed_patch;
                const rationale = attempt.rationale ?? attempt.remediation_summary;
                const source = attempt.source;
                const sourceLabel = source === 'catalog_deterministic' || source === 'catalog_template'
                  ? 'Deterministic Diagnostic Catalog'
                  : source === 'anthropic_api'
                  ? 'LLM Synthesis (Claude)'
                  : 'Deterministic Offline Fallback';

                return (
                  <div
                    key={attemptNum}
                    className={`p-3.5 rounded-lg border transition-all ${
                      isPass
                        ? 'bg-emerald-950/20 border-emerald-800/40 text-slate-200'
                        : 'bg-rose-950/20 border-rose-900/40 text-slate-200'
                    }`}
                  >
                    {/* Attempt header */}
                    <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center font-mono text-[0.6875rem] font-bold ${
                          isPass ? 'bg-emerald-600 text-white' : 'bg-rose-700 text-white'
                        }`}>
                          {attemptNum}
                        </span>
                        <span className="font-bold text-xs text-white">
                          Attempt #{attemptNum}
                        </span>
                        <span className="text-slate-500">•</span>
                        <span className="font-mono text-[0.6875rem] text-slate-400">
                          {sourceLabel}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <span className={`px-2 py-0.5 rounded text-[0.625rem] font-mono font-bold uppercase ${
                          isPass
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                        }`}>
                          {verdict}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[0.625rem] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                          Diff Guard: {isPass || (attempt.diffGuardPassed ?? attempt.diff_guard_passed ?? true) ? 'PASS' : 'BLOCKED'}
                        </span>
                      </div>
                    </div>

                    {/* Rationale / Summary */}
                    {rationale && (
                      <p className="text-xs text-slate-300 mb-2 leading-relaxed">
                        <strong className="text-white">Strategy:</strong> {rationale}
                      </p>
                    )}

                    {/* Failure reasons if rejected */}
                    {!isPass && failureReasons.length > 0 && (
                      <div className="mt-2 p-2.5 bg-rose-950/40 border border-rose-900/60 rounded text-xs space-y-1">
                        <div className="font-bold text-rose-300 text-[0.6875rem] flex items-center gap-1">
                          <span className="material-symbols-outlined text-[0.875rem]">feedback</span>
                          Validation Failure Reasons (Fed back to LLM for Next Attempt):
                        </div>
                        <ul className="list-disc list-inside space-y-0.5 text-[0.6875rem] text-rose-200/90 font-mono">
                          {failureReasons.map((reason, rIdx) => (
                            <li key={rIdx} className="break-words">{reason}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Proposed patch preview */}
                    {patch && (
                      <div className="mt-2">
                        <div className="text-[0.625rem] font-mono text-slate-400 mb-1 uppercase tracking-wider">
                          Proposed Patch Actions (Remove/Restrict Only)
                        </div>
                        <div className="bg-slate-950/80 p-2.5 rounded font-mono text-[0.6875rem] text-slate-300 overflow-x-auto border border-slate-800">
                          <pre>{JSON.stringify(patch, null, 2)}</pre>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Action Footer: Send Proposal to Approval */}
          {debugRun.status === 'VERIFIED_READY_FOR_APPROVAL' && (debugRun.finalCorrectionId || debugRun.final_correction_id) && (
            <div className="p-3 bg-emerald-950/30 border border-emerald-800/50 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[1rem]">verified_user</span>
                  Sandbox S1–S6 / B1–B6 &amp; Diff Guard Verified
                </div>
                <p className="text-[0.6875rem] text-slate-300 mt-0.5">
                  Proposal complies with all capability constraints and causes zero side effects until human approval.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleSendToApproval}
                  disabled={!!approvalStatus}
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-md disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[1rem]">how_to_reg</span>
                  {approvalStatus ? 'Queued in Human Review' : 'Send Proposal to Approval'}
                </button>

                {onNavigateTab && (
                  <button
                    onClick={() => onNavigateTab('corrections')}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs transition-colors flex items-center gap-1"
                  >
                    View in Corrections
                    <span className="material-symbols-outlined text-[0.875rem]">arrow_forward</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Approval feedback alert */}
          {approvalStatus && (
            <div className="p-3 bg-emerald-950/80 border border-emerald-600/60 text-emerald-200 rounded-lg text-xs flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-emerald-400 text-[1.125rem]">check_circle</span>
                <span>{approvalStatus}</span>
              </div>
              {onNavigateTab && (
                <button
                  onClick={() => onNavigateTab('corrections')}
                  className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[0.6875rem] shrink-0"
                >
                  Go to Corrections
                </button>
              )}
            </div>
          )}

          {/* Escalation alert */}
          {debugRun.status === 'ESCALATED_TO_HUMAN' && (
            <div className="p-3 bg-rose-950/30 border border-rose-800/50 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[1rem]">person_alert</span>
                  Human Escalation Protocol Required
                </div>
                <p className="text-[0.6875rem] text-rose-200/80 mt-0.5">
                  {debugRun.escalation_reason || 'Autonomous agent was unable to synthesize a safe patch within 3 attempts.'}
                </p>
              </div>
              {onNavigateTab && (
                <button
                  onClick={() => onNavigateTab('corrections')}
                  className="px-3.5 py-1.5 rounded-lg bg-rose-800 hover:bg-rose-700 text-white font-semibold text-xs transition-colors shrink-0"
                >
                  Manual Repair Console
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
