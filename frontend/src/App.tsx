import { useState, useEffect } from 'react';

type Tab = 'simulator' | 'approvals' | 'incidents' | 'recovery' | 'agents' | 'audit';

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>('simulator');
  const [health, setHealth] = useState<any>(null);
  const [agents, setAgents] = useState<any[]>([]);
  const [policies, setPolicies] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [corrections, setCorrections] = useState<any[]>([]);
  const [auditEvents, setAuditEvents] = useState<any[]>([]);

  const [simResult, setSimResult] = useState<any>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [approvalReason, setApprovalReason] = useState('Authorized by lead reviewer for mission brief');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const [selectedIncident, setSelectedIncident] = useState<any>(null);
  const [diagnosisResult, setDiagnosisResult] = useState<any>(null);
  const [sandboxResult, setSandboxResult] = useState<any>(null);

  const refreshData = async () => {
    try {
      const [hRes, agRes, polRes, appRes, incRes, corrRes, audRes] = await Promise.all([
        fetch('/api/health'),
        fetch('/api/agents'),
        fetch('/api/policies'),
        fetch('/api/approvals'),
        fetch('/api/incidents'),
        fetch('/api/corrections'),
        fetch('/api/audit')
      ]);

      if (hRes.ok) setHealth(await hRes.json());
      if (agRes.ok) setAgents(await agRes.json());
      if (polRes.ok) setPolicies(await polRes.json());
      if (appRes.ok) setApprovals(await appRes.json());
      if (incRes.ok) setIncidents(await incRes.json());
      if (corrRes.ok) setCorrections(await corrRes.json());
      if (audRes.ok) setAuditEvents(await audRes.json());
    } catch (err) {
      console.error('Error fetching dashboard telemetry', err);
    }
  };

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 2500); // 2.5s polling as specified
    return () => clearInterval(interval);
  }, []);

  const handleReset = async () => {
    try {
      const res = await fetch('/api/demo/reset', { method: 'POST' });
      if (res.ok) {
        setStatusMessage('Demo environment reset cleanly to initial baseline state.');
        setSimResult(null);
        setDiagnosisResult(null);
        setSandboxResult(null);
        refreshData();
      }
    } catch (err: any) {
      setStatusMessage(`Reset error: ${err.message}`);
    }
  };

  const runSimulation = async (scenario: 'A' | 'B' | 'C') => {
    setSimLoading(true);
    setSimResult(null);
    let payload = {};

    if (scenario === 'A') {
      payload = {
        agentId: 'doc-agent-01',
        tool: 'file_reader',
        operation: 'read_file',
        resource: 'synthetic://documents/defense_intel_brief_2026.txt'
      };
    } else if (scenario === 'B') {
      payload = {
        agentId: 'doc-agent-01',
        tool: 'dataset_exporter',
        operation: 'export_dataset',
        resource: 'synthetic://documents/defense_intel_brief_2026.txt'
      };
    } else if (scenario === 'C') {
      payload = {
        agentId: 'doc-agent-01',
        tool: 'file_purger',
        operation: 'delete_file',
        resource: 'synthetic://documents/defense_intel_brief_2026.txt'
      };
    }

    try {
      const res = await fetch('/api/actions/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      setSimResult(data);
      refreshData();
    } catch (err: any) {
      setStatusMessage(`Simulation failure: ${err.message}`);
    } finally {
      setSimLoading(false);
    }
  };

  const handleDecideApproval = async (approvalId: string, decision: 'APPROVED' | 'REJECTED') => {
    try {
      const res = await fetch(`/api/approvals/${approvalId}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision,
          approverId: 'usr-reviewer',
          approverRole: 'reviewer',
          reason: approvalReason
        })
      });
      const data = await res.json();
      if (res.ok) {
        setStatusMessage(`Approval ${approvalId} marked ${decision}. Post-approval revalidation: ${data.executionStatus}.`);
        refreshData();
      } else {
        setStatusMessage(`Decision error: ${data.error}`);
      }
    } catch (err: any) {
      setStatusMessage(`Error: ${err.message}`);
    }
  };

  const handleDiagnose = async (incidentId: string) => {
    try {
      const res = await fetch(`/api/incidents/${incidentId}/diagnose`, { method: 'POST' });
      const data = await res.json();
      setDiagnosisResult(data);
      refreshData();
    } catch (err: any) {
      setStatusMessage(`Diagnostics error: ${err.message}`);
    }
  };

  const handleTestCorrection = async (incidentId: string, isBadPatch: boolean) => {
    try {
      let patch;
      if (isBadPatch) {
        patch = {
          action: 'grant_permission',
          allowed_operations: ['delete_file'],
          description: 'Malicious / Faulty patch attempting to grant delete_file permission'
        };
      } else {
        patch = diagnosisResult?.proposedCorrection || {
          action: 'replace_step_operation',
          target_step_id: 'step_3',
          new_operation: 'archive_file',
          new_resource: 'synthetic://archive/defense_intel_brief_2026.txt',
          description: 'Sanitized patch replacing delete_file with archive_file'
        };
      }

      const res = await fetch('/api/corrections/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          incidentId,
          patch,
          proposerId: isBadPatch ? 'usr-admin' : 'diagnostics-engine',
          proposerType: isBadPatch ? 'human' : 'system'
        })
      });
      const data = await res.json();
      setSandboxResult(data);
      refreshData();
    } catch (err: any) {
      setStatusMessage(`Sandbox error: ${err.message}`);
    }
  };

  const handleApproveCorrection = async (corrId: string) => {
    try {
      const res = await fetch(`/api/corrections/${corrId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approverId: 'usr-reviewer',
          approverRole: 'reviewer',
          reason: 'Reviewed in sandbox and verified safe'
        })
      });
      const data = await res.json();
      if (res.ok) {
        setStatusMessage(`Correction ${corrId} approved.`);
        refreshData();
      } else {
        setStatusMessage(`Approval rejected: ${data.error}`);
      }
    } catch (err: any) {
      setStatusMessage(`Error: ${err.message}`);
    }
  };

  const handleApplyCorrection = async (corrId: string) => {
    try {
      const res = await fetch(`/api/corrections/${corrId}/apply`, { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setStatusMessage(`Correction ${corrId} applied to live agent workflow.`);
        refreshData();
      } else {
        setStatusMessage(`Application error: ${data.error}`);
      }
    } catch (err: any) {
      setStatusMessage(`Error: ${err.message}`);
    }
  };

  const handleResume = async (agentId: string) => {
    try {
      const res = await fetch(`/api/agents/${agentId}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actorRole: 'admin',
          actorId: 'usr-admin',
          reason: 'Incident verified, patch applied, regression revalidated'
        })
      });
      const data = await res.json();
      if (res.ok) {
        setStatusMessage(`Agent ${agentId} successfully resumed to ACTIVE.`);
        refreshData();
      } else {
        setStatusMessage(`Resume refused: ${data.unmet?.join('; ') || data.error}`);
      }
    } catch (err: any) {
      setStatusMessage(`Error: ${err.message}`);
    }
  };

  const primaryAgent = agents.find((a) => a.id === 'doc-agent-01') || agents[0];

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', maxWidth: '1200px', margin: '0 auto', padding: '1.5rem', color: '#0f172a' }}>
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #e2e8f0', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>🛡️</span> AI Governance & Control Plane
          </h1>
          <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>
            CODEX 3.0 PS5 — Deterministic Policy Gate • Bounded Diagnostics • Verified Recovery
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Service: <strong>{health?.status === 'ok' ? 'HEALTHY' : 'CONNECTING...'}</strong> | Agent: <strong>{primaryAgent?.name || 'doc-agent-01'}</strong>
            </div>
            <div style={{ fontSize: '0.85rem' }}>
              Status:{' '}
              <span style={{
                padding: '2px 8px',
                borderRadius: '4px',
                fontWeight: 700,
                backgroundColor: primaryAgent?.status === 'active' ? '#dcfce7' : primaryAgent?.status === 'restricted' ? '#fef9c3' : '#fee2e2',
                color: primaryAgent?.status === 'active' ? '#15803d' : primaryAgent?.status === 'restricted' ? '#a16207' : '#b91c1c'
              }}>
                {primaryAgent?.status?.toUpperCase() || 'UNKNOWN'}
              </span>
            </div>
          </div>
          <button
            onClick={handleReset}
            style={{
              backgroundColor: '#ef4444',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              padding: '0.5rem 1rem',
              fontWeight: 600,
              cursor: 'pointer'
            }}
          >
            🔄 Demo Reset
          </button>
        </div>
      </header>

      {/* Global Status Message */}
      {statusMessage && (
        <div style={{ padding: '0.75rem 1rem', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', color: '#166534', marginBottom: '1.25rem', display: 'flex', justifyContent: 'space-between' }}>
          <span>{statusMessage}</span>
          <button onClick={() => setStatusMessage(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>✕</button>
        </div>
      )}

      {/* Navigation Tabs */}
      <nav style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid #cbd5e1', marginBottom: '1.5rem' }}>
        {[
          { id: 'simulator', label: '1. Action Launcher' },
          { id: 'approvals', label: `2. Approvals (${approvals.filter((a) => a.status === 'PENDING').length})` },
          { id: 'incidents', label: `3. Incidents (${incidents.filter((i) => i.status === 'OPEN').length})` },
          { id: 'recovery', label: `4. Sandbox & Recovery (${corrections.length})` },
          { id: 'agents', label: '5. Registry & Policies' },
          { id: 'audit', label: `6. Audit Trail (${auditEvents.length})` }
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id as Tab)}
            style={{
              padding: '0.6rem 1.1rem',
              border: 'none',
              borderBottom: activeTab === t.id ? '3px solid #2563eb' : '3px solid transparent',
              backgroundColor: 'transparent',
              fontWeight: activeTab === t.id ? 700 : 500,
              color: activeTab === t.id ? '#2563eb' : '#64748b',
              cursor: 'pointer',
              fontSize: '0.92rem'
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* TAB 1: ACTION LAUNCHER / SIMULATOR */}
      {activeTab === 'simulator' && (
        <div>
          <div style={{ backgroundColor: '#f8fafc', padding: '1.5rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 0.5rem' }}>Scenario Quick Launcher (Judge Controls)</h2>
            <p style={{ margin: '0 0 1.25rem', color: '#64748b', fontSize: '0.9rem' }}>
              Submit synthetic proposed actions to test the real backend gateway and protected tool boundaries.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
              <div style={{ backgroundColor: '#fff', padding: '1rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontWeight: 700, color: '#16a34a', marginBottom: '0.25rem' }}>Scenario A: Permitted Action</div>
                <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '0.75rem' }}>Operation: <code>read_file</code> on <code>synthetic://documents/...</code></div>
                <button
                  onClick={() => runSimulation('A')}
                  disabled={simLoading || primaryAgent?.status === 'paused'}
                  style={{ width: '100%', padding: '0.5rem', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 600, cursor: 'pointer' }}
                >
                  {simLoading ? 'Evaluating...' : 'Run Scenario A (Expect ALLOW)'}
                </button>
              </div>

              <div style={{ backgroundColor: '#fff', padding: '1rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontWeight: 700, color: '#ca8a04', marginBottom: '0.25rem' }}>Scenario B: Sensitive Action</div>
                <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '0.75rem' }}>Operation: <code>export_dataset</code> (Requires Human Approval)</div>
                <button
                  onClick={() => runSimulation('B')}
                  disabled={simLoading || primaryAgent?.status === 'paused'}
                  style={{ width: '100%', padding: '0.5rem', backgroundColor: '#ca8a04', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 600, cursor: 'pointer' }}
                >
                  {simLoading ? 'Evaluating...' : 'Run Scenario B (Expect REQUIRE_APPROVAL)'}
                </button>
              </div>

              <div style={{ backgroundColor: '#fff', padding: '1rem', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                <div style={{ fontWeight: 700, color: '#dc2626', marginBottom: '0.25rem' }}>Scenario C: Prohibited Action</div>
                <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '0.75rem' }}>Operation: <code>delete_file</code> (Trigger Violation & Pause)</div>
                <button
                  onClick={() => runSimulation('C')}
                  disabled={simLoading}
                  style={{ width: '100%', padding: '0.5rem', backgroundColor: '#dc2626', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 600, cursor: 'pointer' }}
                >
                  {simLoading ? 'Evaluating...' : 'Run Scenario C (Expect BLOCK & Pause)'}
                </button>
              </div>
            </div>
          </div>

          {/* Decision & Execution Results */}
          {simResult && (
            <div style={{ backgroundColor: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '1.25rem' }}>
              <h3 style={{ margin: '0 0 1rem', fontSize: '1.05rem', fontWeight: 700 }}>Telemetry Evaluation Result</h3>
              
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
                <div style={{ flex: 1, padding: '0.75rem', backgroundColor: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>GATE DECISION BADGE</div>
                  <div style={{
                    fontSize: '1.25rem',
                    fontWeight: 800,
                    color: simResult.gateDecision === 'ALLOW' ? '#16a34a' : simResult.gateDecision === 'REQUIRE_APPROVAL' ? '#ca8a04' : '#dc2626'
                  }}>
                    {simResult.gateDecision}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '0.25rem' }}>Code: {simResult.gateReasonCode}</div>
                </div>

                <div style={{ flex: 1, padding: '0.75rem', backgroundColor: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>EXECUTION OUTCOME BADGE</div>
                  <div style={{
                    fontSize: '1.25rem',
                    fontWeight: 800,
                    color: simResult.executionStatus === 'SUCCEEDED' ? '#16a34a' : simResult.executionStatus === 'NOT_EXECUTED' ? '#64748b' : '#dc2626'
                  }}>
                    {simResult.executionStatus}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '0.25rem' }}>
                    Reason: {simResult.nonExecutionReason || 'Completed successfully'}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: '0.85rem', color: '#334155', backgroundColor: '#f1f5f9', padding: '0.75rem', borderRadius: '6px' }}>
                <strong>Explanation:</strong> {simResult.explanation}
              </div>

              {simResult.result && (
                <div style={{ marginTop: '1rem' }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748b', marginBottom: '0.25rem' }}>SIMULATED PROTECTED OUTPUT:</div>
                  <pre style={{ margin: 0, padding: '0.75rem', backgroundColor: '#0f172a', color: '#38bdf8', borderRadius: '6px', fontSize: '0.8rem', overflowX: 'auto' }}>
                    {JSON.stringify(simResult.result, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: APPROVALS INBOX */}
      {activeTab === 'approvals' && (
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 1rem' }}>Human Authorization Inbox</h2>
          {approvals.length === 0 ? (
            <p style={{ color: '#64748b' }}>No pending approval requests.</p>
          ) : (
            <div style={{ display: 'grid', gap: '1rem' }}>
              {approvals.map((app) => (
                <div key={app.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.25rem', backgroundColor: app.status === 'PENDING' ? '#fffbeb' : '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <div>
                      <strong>Approval ID:</strong> <code>{app.id}</code> | <strong>Request ID:</strong> <code>{app.request_id}</code>
                    </div>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      backgroundColor: app.status === 'APPROVED' ? '#dcfce7' : app.status === 'REJECTED' ? '#fee2e2' : '#fef3c7',
                      color: app.status === 'APPROVED' ? '#15803d' : app.status === 'REJECTED' ? '#b91c1c' : '#b45309'
                    }}>
                      {app.status}
                    </span>
                  </div>

                  <div style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '0.5rem' }}>
                    Target: <code>{app.operation}</code> on <code>{app.resource}</code> | Agent: <code>{app.agent_id}</code>
                  </div>

                  {app.status === 'PENDING' && (
                    <div style={{ marginTop: '1rem', borderTop: '1px solid #fde68a', paddingTop: '0.75rem' }}>
                      <div style={{ marginBottom: '0.5rem' }}>
                        <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>Mandatory Justification / Reason:</label>
                        <input
                          type="text"
                          value={approvalReason}
                          onChange={(e) => setApprovalReason(e.target.value)}
                          style={{ width: '100%', padding: '0.4rem', border: '1px solid #cbd5e1', borderRadius: '4px', marginTop: '0.25rem' }}
                        />
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        <button
                          onClick={() => handleDecideApproval(app.id, 'APPROVED')}
                          style={{ padding: '0.4rem 1rem', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 600, cursor: 'pointer' }}
                        >
                          ✓ Approve & Execute
                        </button>
                        <button
                          onClick={() => handleDecideApproval(app.id, 'REJECTED')}
                          style={{ padding: '0.4rem 1rem', backgroundColor: '#dc2626', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 600, cursor: 'pointer' }}
                        >
                          ✕ Reject (No Side Effects)
                        </button>
                      </div>
                    </div>
                  )}

                  {app.reason && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#64748b' }}>
                      <strong>Reviewer Reason:</strong> {app.reason} (by {app.approver_id})
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: INCIDENTS & DIAGNOSTICS */}
      {activeTab === 'incidents' && (
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 1rem' }}>Active Containment & Incident Registry</h2>
          {incidents.length === 0 ? (
            <p style={{ color: '#64748b' }}>No incidents recorded. System operating securely.</p>
          ) : (
            <div style={{ display: 'grid', gap: '1rem' }}>
              {incidents.map((inc) => (
                <div key={inc.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.25rem', backgroundColor: inc.status === 'OPEN' ? '#fef2f2' : '#fff' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                    <div style={{ fontWeight: 700 }}>
                      Incident: <code>{inc.id}</code> | Agent: <code>{inc.agent_id}</code>
                    </div>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontWeight: 700,
                      fontSize: '0.8rem',
                      backgroundColor: inc.status === 'OPEN' ? '#fee2e2' : '#dcfce7',
                      color: inc.status === 'OPEN' ? '#b91c1c' : '#15803d'
                    }}>
                      {inc.status} (Severity: {inc.severity.toUpperCase()})
                    </span>
                  </div>

                  <p style={{ margin: '0.25rem 0 0.75rem', fontSize: '0.85rem', color: '#475569' }}>
                    {inc.evidence_summary}
                  </p>

                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
                    <button
                      onClick={() => { setSelectedIncident(inc); handleDiagnose(inc.id); }}
                      style={{ padding: '0.4rem 0.8rem', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}
                    >
                      🔍 Run Signature Diagnostics
                    </button>
                    {inc.signature_id && (
                      <span style={{ fontSize: '0.82rem', color: '#2563eb', fontWeight: 600 }}>
                        Matched Signature: <code>{inc.signature_id}</code>
                      </span>
                    )}
                  </div>

                  {diagnosisResult && selectedIncident?.id === inc.id && (
                    <div style={{ marginTop: '1rem', padding: '0.75rem', backgroundColor: '#eff6ff', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1e40af' }}>Diagnostic Triage Findings:</div>
                      <div style={{ fontSize: '0.85rem', color: '#1e3a8a', marginTop: '0.25rem' }}>
                        {diagnosisResult.explanation}
                      </div>
                      <div style={{ marginTop: '0.5rem' }}>
                        <button
                          onClick={() => setActiveTab('recovery')}
                          style={{ padding: '0.3rem 0.7rem', backgroundColor: '#1d4ed8', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer' }}
                        >
                          → Proceed to Sandbox & Recovery
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: SANDBOX & VERIFIED RECOVERY */}
      {activeTab === 'recovery' && (
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 1rem' }}>Sandbox Testing & Verified Recovery (Gate G3)</h2>
          
          <div style={{ backgroundColor: '#f8fafc', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1.5rem' }}>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 700 }}>Sandbox Verification Controls</h3>
            <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: '#64748b' }}>
              Run structural (S1-S6) and behavioural (B1-B6) checks against cloned synthetic state to prove no silent policy weakening.
            </p>

            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={() => {
                  const targetInc = incidents.find((i) => i.status === 'OPEN') || incidents[0];
                  if (targetInc) handleTestCorrection(targetInc.id, false);
                  else setStatusMessage('No open incident to test against.');
                }}
                style={{ padding: '0.5rem 1rem', backgroundColor: '#16a34a', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 600, cursor: 'pointer' }}
              >
                ✓ Test Safe Correction (Expect PASS)
              </button>
              <button
                onClick={() => {
                  const targetInc = incidents.find((i) => i.status === 'OPEN') || incidents[0];
                  if (targetInc) handleTestCorrection(targetInc.id, true);
                  else setStatusMessage('No open incident to test against.');
                }}
                style={{ padding: '0.5rem 1rem', backgroundColor: '#dc2626', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 600, cursor: 'pointer' }}
              >
                ✕ Test Faulty/Attacking Patch (Expect FAIL)
              </button>
            </div>
          </div>

          {/* Sandbox Results Breakdown */}
          {sandboxResult && (
            <div style={{ backgroundColor: '#fff', border: '1px solid #cbd5e1', borderRadius: '8px', padding: '1.25rem', marginBottom: '1.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>Sandbox Verification Report</h3>
                <span style={{
                  padding: '4px 12px',
                  borderRadius: '4px',
                  fontWeight: 800,
                  fontSize: '0.9rem',
                  backgroundColor: sandboxResult.verdict === 'PASS' ? '#dcfce7' : '#fee2e2',
                  color: sandboxResult.verdict === 'PASS' ? '#15803d' : '#b91c1c'
                }}>
                  VERDICT: {sandboxResult.verdict}
                </span>
              </div>

              {/* Structural Checks S1-S6 */}
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#475569', marginBottom: '0.5rem' }}>STRUCTURAL CHECKS (S1 - S6):</div>
                <div style={{ display: 'grid', gap: '0.4rem' }}>
                  {sandboxResult.structuralChecks?.map((c: any) => (
                    <div key={c.checkId} style={{ display: 'flex', gap: '0.5rem', fontSize: '0.82rem', padding: '0.4rem 0.6rem', backgroundColor: c.passed ? '#f0fdf4' : '#fef2f2', borderRadius: '4px' }}>
                      <span style={{ fontWeight: 700, color: c.passed ? '#16a34a' : '#dc2626' }}>{c.passed ? '✓' : '✕'} {c.checkId}</span>
                      <span style={{ color: '#334155' }}><strong>{c.name}:</strong> {c.message}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Behavioural Checks B1-B6 */}
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#475569', marginBottom: '0.5rem' }}>BEHAVIOURAL REPLAY CHECKS (B1 - B6):</div>
                <div style={{ display: 'grid', gap: '0.4rem' }}>
                  {sandboxResult.behaviouralChecks?.map((c: any) => (
                    <div key={c.checkId} style={{ display: 'flex', gap: '0.5rem', fontSize: '0.82rem', padding: '0.4rem 0.6rem', backgroundColor: c.passed ? '#f0fdf4' : '#fef2f2', borderRadius: '4px' }}>
                      <span style={{ fontWeight: 700, color: c.passed ? '#16a34a' : '#dc2626' }}>{c.passed ? '✓' : '✕'} {c.checkId}</span>
                      <span style={{ color: '#334155' }}><strong>{c.name}:</strong> {c.message}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recovery Action Gate */}
              {sandboxResult.verdict === 'PASS' && (
                <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '0.75rem' }}>
                  <button
                    onClick={() => handleApproveCorrection(sandboxResult.correctionId)}
                    style={{ padding: '0.4rem 0.9rem', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}
                  >
                    1. Approve Correction (Reviewer Role)
                  </button>
                  <button
                    onClick={() => handleApplyCorrection(sandboxResult.correctionId)}
                    style={{ padding: '0.4rem 0.9rem', backgroundColor: '#7c3aed', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}
                  >
                    2. Apply Patch to Agent
                  </button>
                  <button
                    onClick={() => handleResume('doc-agent-01')}
                    style={{ padding: '0.4rem 0.9rem', backgroundColor: '#059669', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}
                  >
                    3. Resume Agent (Central Gate R1-R9)
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: REGISTRY & POLICIES */}
      {activeTab === 'agents' && (
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 1rem' }}>Registered Agents & Versioned Policies</h2>
          
          <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.25rem', backgroundColor: '#fff', marginBottom: '1.5rem' }}>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 700 }}>{primaryAgent?.name} (<code>{primaryAgent?.id}</code>)</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.75rem', fontSize: '0.85rem', color: '#475569' }}>
              <div><strong>Status:</strong> {primaryAgent?.status}</div>
              <div><strong>Team:</strong> {primaryAgent?.team}</div>
              <div><strong>Policy Version:</strong> {primaryAgent?.policy_version}</div>
              <div><strong>Risk Category:</strong> {primaryAgent?.risk_category}</div>
            </div>
            <div style={{ marginTop: '0.75rem', fontSize: '0.82rem', color: '#64748b' }}>
              <strong>Allowed Operations:</strong> {primaryAgent?.allowed_operations?.join(', ')}
            </div>
          </div>

          <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: '0 0 0.75rem' }}>Active Versioned Policies</h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                  <th style={{ padding: '0.5rem' }}>Policy ID</th>
                  <th style={{ padding: '0.5rem' }}>Version</th>
                  <th style={{ padding: '0.5rem' }}>Operation</th>
                  <th style={{ padding: '0.5rem' }}>Resource Pattern</th>
                  <th style={{ padding: '0.5rem' }}>Decision</th>
                  <th style={{ padding: '0.5rem' }}>Severity</th>
                </tr>
              </thead>
              <tbody>
                {policies.map((p) => (
                  <tr key={`${p.id}-${p.version}`} style={{ borderBottom: '1px solid #e2e8f0' }}>
                    <td style={{ padding: '0.5rem' }}><code>{p.id}</code></td>
                    <td style={{ padding: '0.5rem' }}>{p.version}</td>
                    <td style={{ padding: '0.5rem' }}><code>{p.operation}</code></td>
                    <td style={{ padding: '0.5rem' }}><code>{p.resource_pattern}</code></td>
                    <td style={{ padding: '0.5rem', fontWeight: 700, color: p.decision === 'allow' ? '#16a34a' : p.decision === 'require_approval' ? '#ca8a04' : '#dc2626' }}>
                      {p.decision.toUpperCase()}
                    </td>
                    <td style={{ padding: '0.5rem' }}>{p.severity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 6: AUDIT TRAIL */}
      {activeTab === 'audit' && (
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 1rem' }}>Append-Only Tamper-Evident Audit Trail</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                  <th style={{ padding: '0.4rem' }}>Seq</th>
                  <th style={{ padding: '0.4rem' }}>Event Type</th>
                  <th style={{ padding: '0.4rem' }}>Actor</th>
                  <th style={{ padding: '0.4rem' }}>Decision</th>
                  <th style={{ padding: '0.4rem' }}>Outcome</th>
                  <th style={{ padding: '0.4rem' }}>SHA-256 Hash</th>
                </tr>
              </thead>
              <tbody>
                {auditEvents.map((evt) => (
                  <tr key={evt.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '0.4rem' }}>#{evt.sequence}</td>
                    <td style={{ padding: '0.4rem' }}><strong>{evt.event_type}</strong></td>
                    <td style={{ padding: '0.4rem' }}>{evt.actor_type}:{evt.actor_id}</td>
                    <td style={{ padding: '0.4rem', fontWeight: 700 }}>{evt.decision || '-'}</td>
                    <td style={{ padding: '0.4rem' }}>{evt.outcome || '-'}</td>
                    <td style={{ padding: '0.4rem', fontFamily: 'monospace', color: '#64748b' }}>
                      {evt.hash?.substring(0, 16)}...
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
