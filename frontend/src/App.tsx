import { useState, useEffect } from 'react';

type Tab = 'dashboard' | 'allocation' | 'simulator' | 'approvals' | 'incidents' | 'recovery' | 'agents' | 'audit';

export function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [health, setHealth] = useState<any>(null);
  const [agents, setAgents] = useState<any[]>([]);
  const [policies, setPolicies] = useState<any[]>([]);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [corrections, setCorrections] = useState<any[]>([]);
  const [auditEvents, setAuditEvents] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [taskTypes, setTaskTypes] = useState<any[]>([]);
  const [dashboardData, setDashboardData] = useState<any>(null);

  // Simulator State
  const [simResult, setSimResult] = useState<any>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [approvalReason, setApprovalReason] = useState('Authorized by lead reviewer for mission brief');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Diagnostics & Recovery State
  const [selectedIncident, setSelectedIncident] = useState<any>(null);
  const [diagnosisResult, setDiagnosisResult] = useState<any>(null);
  const [sandboxResult, setSandboxResult] = useState<any>(null);

  // Incident Report State
  const [incidentReport, setIncidentReport] = useState<any>(null);
  const [reportLoading, setReportLoading] = useState(false);

  // Task Intake State
  const [newTaskTitle, setNewTaskTitle] = useState('Summarize synthetic intelligence update');
  const [newTaskType, setNewTaskType] = useState('document_analysis');
  const [newTaskDesc, setNewTaskDesc] = useState('Automated processing of satellite telemetry report');
  const [newTaskAgent, setNewTaskAgent] = useState('doc-agent-01');
  const [newTaskOp, setNewTaskOp] = useState('');

  // Task Escalation State
  const [escalatingTaskId, setEscalatingTaskId] = useState<string | null>(null);
  const [escalationReason, setEscalationReason] = useState('Clearance level required exceeds agent threshold');
  const [escalationRole, setEscalationRole] = useState('lead_analyst');

  const refreshData = async () => {
    try {
      const [hRes, agRes, polRes, appRes, incRes, corrRes, audRes, taskRes, ttRes, dashRes] = await Promise.all([
        fetch('/api/health'),
        fetch('/api/agents'),
        fetch('/api/policies'),
        fetch('/api/approvals'),
        fetch('/api/incidents'),
        fetch('/api/corrections'),
        fetch('/api/audit'),
        fetch('/api/tasks'),
        fetch('/api/task-types'),
        fetch('/api/dashboard/overview')
      ]);

      if (hRes.ok) setHealth(await hRes.json());
      if (agRes.ok) setAgents(await agRes.json());
      if (polRes.ok) setPolicies(await polRes.json());
      if (appRes.ok) setApprovals(await appRes.json());
      if (incRes.ok) setIncidents(await incRes.json());
      if (corrRes.ok) setCorrections(await corrRes.json());
      if (audRes.ok) setAuditEvents(await audRes.json());
      if (taskRes.ok) setTasks(await taskRes.json());
      if (ttRes.ok) setTaskTypes(await ttRes.json());
      if (dashRes.ok) setDashboardData(await dashRes.json());
    } catch (err) {
      console.error('Error fetching dashboard telemetry', err);
    }
  };

  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 2500);
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
        setIncidentReport(null);
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

  const handleFetchReport = async (incidentId: string) => {
    setReportLoading(true);
    setIncidentReport(null);
    try {
      const res = await fetch(`/api/incidents/${incidentId}/report`);
      const data = await res.json();
      if (res.ok) {
        setIncidentReport(data);
      } else {
        setStatusMessage(`Report error: ${data.error}`);
      }
    } catch (err: any) {
      setStatusMessage(`Error fetching report: ${err.message}`);
    } finally {
      setReportLoading(false);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTaskTitle,
          task_type: newTaskType,
          description: newTaskDesc,
          target_agent_id: newTaskAgent,
          requested_operation: newTaskOp || undefined,
          payload: { resource: 'synthetic://documents/sample.txt' }
        })
      });
      const data = await res.json();
      if (res.ok) {
        setStatusMessage(`Task allocated: ${data.taskId} -> Handler: ${data.handler.toUpperCase()} (${data.handlerReason})`);
        refreshData();
      } else {
        setStatusMessage(`Task allocation error: ${data.error}`);
      }
    } catch (err: any) {
      setStatusMessage(`Task error: ${err.message}`);
    }
  };

  const handleEscalateTask = async (taskId: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/escalate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: escalationReason,
          target_role: escalationRole
        })
      });
      const data = await res.json();
      if (res.ok) {
        setStatusMessage(`Task ${taskId} escalated to ${escalationRole}.`);
        setEscalatingTaskId(null);
        refreshData();
      } else {
        setStatusMessage(`Escalation error: ${data.error}`);
      }
    } catch (err: any) {
      setStatusMessage(`Error: ${err.message}`);
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
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', maxWidth: '1280px', margin: '0 auto', padding: '1.5rem', color: '#0f172a' }}>
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #e2e8f0', paddingBottom: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>🛡️</span> AI Governance & Control Plane
          </h1>
          <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>
            CODEX 3.0 PS5 — Deterministic Policy Gate • Human-vs-Agent Allocation • Leadership Dashboard • Audit Reports
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
              Service: <strong>{health?.status === 'ok' ? 'HEALTHY' : 'CONNECTING...'}</strong> | Agents: <strong>{agents.length}</strong>
            </div>
            <div style={{ fontSize: '0.85rem' }}>
              Primary Agent ({primaryAgent?.id || 'doc-agent-01'}):{' '}
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
      <nav style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid #cbd5e1', marginBottom: '1.5rem', overflowX: 'auto' }}>
        {[
          { id: 'dashboard', label: '📊 Leadership Dashboard' },
          { id: 'allocation', label: `👥 Work Allocation (${tasks.length})` },
          { id: 'simulator', label: '⚡ Action Launcher' },
          { id: 'approvals', label: `✋ Approvals (${approvals.filter((a) => a.status === 'PENDING').length})` },
          { id: 'incidents', label: `🚨 Incidents (${incidents.filter((i) => i.status === 'OPEN').length})` },
          { id: 'recovery', label: `🧪 Sandbox & Recovery (${corrections.length})` },
          { id: 'agents', label: '📑 Agents & Policies' },
          { id: 'audit', label: `📜 Audit Trail (${auditEvents.length})` }
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
              fontSize: '0.92rem',
              whiteSpace: 'nowrap'
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* TAB 1: LEADERSHIP DASHBOARD (WORKSTREAM B) */}
      {activeTab === 'dashboard' && dashboardData && (
        <div>
          {/* Prominent Simulated Estimate Banner */}
          <div style={{
            backgroundColor: '#fef3c7',
            border: '2px solid #f59e0b',
            padding: '1rem',
            borderRadius: '8px',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ fontWeight: 800, color: '#92400e', fontSize: '1rem', letterSpacing: '0.05em' }}>
                ⚠️ {dashboardData.costAndValueEstimates.disclaimer}
              </div>
              <div style={{ fontSize: '0.85rem', color: '#78350f', marginTop: '0.25rem' }}>
                Assumptions: {dashboardData.costAndValueEstimates.assumptions.laborValueBasis} (${dashboardData.costAndValueEstimates.assumptions.humanHourlyRateUsd}/hr). Not verified cash savings.
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '0.8rem', color: '#92400e', fontWeight: 600 }}>Time Window:</span>
              <div style={{ fontSize: '0.75rem', color: '#78350f' }}>Active Session Telemetry</div>
            </div>
          </div>

          {/* Section 1: Risk Overview */}
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 0.75rem', color: '#0f172a' }}>1. Risk & Agent Containment Posture</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem' }}>
              <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>REGISTERED AGENTS</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a' }}>{dashboardData.risk.totalAgents}</div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.25rem' }}>
                <span style={{ color: '#16a34a', fontWeight: 700 }}>{dashboardData.risk.activeAgents} active</span> • <span style={{ color: '#ca8a04', fontWeight: 700 }}>{dashboardData.risk.restrictedAgents} restricted</span> • <span style={{ color: '#dc2626', fontWeight: 700 }}>{dashboardData.risk.pausedAgents} paused</span>
              </div>
            </div>

            <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem' }}>
              <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>OPEN INCIDENTS</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: dashboardData.risk.openIncidents.total > 0 ? '#dc2626' : '#16a34a' }}>
                {dashboardData.risk.openIncidents.total}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                Critical: {dashboardData.risk.openIncidents.bySeverity.critical} • High: {dashboardData.risk.openIncidents.bySeverity.high} • Med: {dashboardData.risk.openIncidents.bySeverity.medium}
              </div>
            </div>

            <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem' }}>
              <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>BLOCKED VIOLATIONS</div>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#7c3aed' }}>{dashboardData.risk.totalViolations}</div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.25rem' }}>Pre-execution boundary blocks</div>
            </div>

            <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem' }}>
              <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600 }}>CONTAINMENT & RECOVERY</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', marginTop: '0.4rem' }}>
                ~{dashboardData.risk.meanTimeToContainMs}ms contain
              </div>
              <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.25rem' }}>
                Verification: ~{(dashboardData.risk.meanTimeToRecoverMs / 1000).toFixed(1)}s
              </div>
            </div>
          </div>

          {/* Section 2: Usage & Work Distribution */}
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 0.75rem', color: '#0f172a' }}>2. Work Distribution & Tool Operations</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem' }}>
              <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, marginBottom: '0.5rem' }}>TASKS BY HANDLER ({dashboardData.usage.tasksReceived} total)</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', backgroundColor: '#f0fdf4', borderRadius: '4px' }}>
                  <span>🤖 Agent Handled</span>
                  <strong>{dashboardData.usage.tasksByHandler.agent}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', backgroundColor: '#eff6ff', borderRadius: '4px' }}>
                  <span>👤 Human Queue</span>
                  <strong>{dashboardData.usage.tasksByHandler.human}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', backgroundColor: '#fef3c7', borderRadius: '4px' }}>
                  <span>↗️ Escalated</span>
                  <strong>{dashboardData.usage.tasksByHandler.escalated}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', backgroundColor: '#fee2e2', borderRadius: '4px' }}>
                  <span>🛑 Blocked</span>
                  <strong>{dashboardData.usage.tasksByHandler.blocked}</strong>
                </div>
              </div>
            </div>

            <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem' }}>
              <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, marginBottom: '0.5rem' }}>PROTECTED EXECUTIONS</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', backgroundColor: '#f0fdf4', borderRadius: '4px' }}>
                  <span>✓ Succeeded (Signed HMAC)</span>
                  <strong style={{ color: '#16a34a' }}>{dashboardData.usage.executionOutcomes.succeeded}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', backgroundColor: '#fee2e2', borderRadius: '4px' }}>
                  <span>✕ Failed Execution</span>
                  <strong style={{ color: '#dc2626' }}>{dashboardData.usage.executionOutcomes.failed}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', backgroundColor: '#f8fafc', borderRadius: '4px' }}>
                  <span>⏸️ Held / Not Executed</span>
                  <strong style={{ color: '#64748b' }}>{dashboardData.usage.executionOutcomes.notExecuted}</strong>
                </div>
              </div>
            </div>

            <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem' }}>
              <div style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 600, marginBottom: '0.5rem' }}>HUMAN OVERSIGHT & GATES</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Pending Authorizations</span>
                  <strong style={{ color: '#ca8a04' }}>{dashboardData.humanIntervention.approvals.pending}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Decided Approvals</span>
                  <strong style={{ color: '#16a34a' }}>{dashboardData.humanIntervention.approvals.approved}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Containment Pauses</span>
                  <strong style={{ color: '#dc2626' }}>{dashboardData.humanIntervention.pauseEventsCount}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Recovery Attempts</span>
                  <strong style={{ color: '#2563eb' }}>{dashboardData.humanIntervention.recoveryAttemptsCount}</strong>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Cost and Value Matrix */}
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 0.75rem', color: '#0f172a' }}>3. Synthetic Value & Operating Cost Model</h2>
          <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.25rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
              <div style={{ padding: '0.75rem', backgroundColor: '#f8fafc', borderRadius: '6px' }}>
                <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>ESTIMATED OPERATING COST</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#dc2626', marginTop: '0.25rem' }}>
                  ${dashboardData.costAndValueEstimates.estimatedOperatingCostUsd.toFixed(2)}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                  Formula: sum(execution × simulated_cost)
                </div>
              </div>

              <div style={{ padding: '0.75rem', backgroundColor: '#f8fafc', borderRadius: '6px' }}>
                <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700 }}>ESTIMATED LABOR VALUE REPLACED</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#16a34a', marginTop: '0.25rem' }}>
                  ${dashboardData.costAndValueEstimates.estimatedLaborValueCreatedUsd.toFixed(2)}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                  Formula: sum(tasks × human_minutes × $1.67/min)
                </div>
              </div>

              <div style={{ padding: '0.75rem', backgroundColor: '#f0fdf4', borderRadius: '6px', border: '1px solid #bbf7d0' }}>
                <div style={{ fontSize: '0.75rem', color: '#166534', fontWeight: 700 }}>NET SYNTHETIC VALUE CREATED</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#15803d', marginTop: '0.25rem' }}>
                  ${dashboardData.costAndValueEstimates.netSyntheticValueUsd.toFixed(2)}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#166534', marginTop: '0.25rem' }}>
                  Net = Labor Value - Operating Cost
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: WORK ALLOCATION (WORKSTREAM A) */}
      {activeTab === 'allocation' && (
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1.5rem' }}>
            {/* Task Intake Form */}
            <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.25rem', height: 'fit-content' }}>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 0.5rem' }}>Deterministic Task Intake</h2>
              <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: '#64748b' }}>
                Submit tasks to test human-vs-agent routing, approval requirements, and safety blocks.
              </p>

              <form onSubmit={handleCreateTask}>
                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>Task Title:</label>
                  <input
                    type="text"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    required
                    style={{ width: '100%', padding: '0.45rem', border: '1px solid #cbd5e1', borderRadius: '4px', marginTop: '0.2rem' }}
                  />
                </div>

                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>Task Type (Policy Governed):</label>
                  <select
                    value={newTaskType}
                    onChange={(e) => setNewTaskType(e.target.value)}
                    style={{ width: '100%', padding: '0.45rem', border: '1px solid #cbd5e1', borderRadius: '4px', marginTop: '0.2rem' }}
                  >
                    {taskTypes.map((tt) => (
                      <option key={tt.task_type} value={tt.task_type}>
                        {tt.name} ({tt.default_handler.toUpperCase()})
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>Target Agent:</label>
                  <select
                    value={newTaskAgent}
                    onChange={(e) => setNewTaskAgent(e.target.value)}
                    style={{ width: '100%', padding: '0.45rem', border: '1px solid #cbd5e1', borderRadius: '4px', marginTop: '0.2rem' }}
                  >
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.status})
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ marginBottom: '0.75rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>Simulate Requested Operation (Optional):</label>
                  <input
                    type="text"
                    value={newTaskOp}
                    placeholder="e.g. read_file, export_dataset, delete_file"
                    onChange={(e) => setNewTaskOp(e.target.value)}
                    style={{ width: '100%', padding: '0.45rem', border: '1px solid #cbd5e1', borderRadius: '4px', marginTop: '0.2rem' }}
                  />
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Enter <code>delete_file</code> to trigger safety block</span>
                </div>

                <div style={{ marginBottom: '1rem' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#475569' }}>Task Description:</label>
                  <textarea
                    value={newTaskDesc}
                    onChange={(e) => setNewTaskDesc(e.target.value)}
                    rows={2}
                    style={{ width: '100%', padding: '0.45rem', border: '1px solid #cbd5e1', borderRadius: '4px', marginTop: '0.2rem' }}
                  />
                </div>

                <button
                  type="submit"
                  style={{ width: '100%', padding: '0.55rem', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 700, cursor: 'pointer' }}
                >
                  ⚡ Intake & Allocate Task
                </button>
              </form>
            </div>

            {/* Task Queue Table */}
            <div>
              <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 1rem' }}>Governance Task Queue ({tasks.length})</h2>
              {tasks.length === 0 ? (
                <p style={{ color: '#64748b' }}>No tasks in queue.</p>
              ) : (
                <div style={{ display: 'grid', gap: '0.75rem' }}>
                  {tasks.map((t) => (
                    <div key={t.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem', backgroundColor: '#fff' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                        <div>
                          <strong>{t.title}</strong>{' '}
                          <code style={{ fontSize: '0.75rem', color: '#64748b' }}>({t.id})</code>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontWeight: 700,
                            fontSize: '0.75rem',
                            backgroundColor: t.handler === 'agent' ? '#dcfce7' : t.handler === 'human' ? '#eff6ff' : t.handler === 'escalated' ? '#fef3c7' : '#fee2e2',
                            color: t.handler === 'agent' ? '#15803d' : t.handler === 'human' ? '#1d4ed8' : t.handler === 'escalated' ? '#b45309' : '#b91c1c'
                          }}>
                            HANDLER: {t.handler.toUpperCase()}
                          </span>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '4px',
                            fontWeight: 600,
                            fontSize: '0.75rem',
                            backgroundColor: '#f1f5f9',
                            color: '#475569'
                          }}>
                            STATUS: {t.status}
                          </span>
                        </div>
                      </div>

                      <div style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '0.4rem' }}>
                        Type: <strong>{t.task_type}</strong> | Risk: <strong>{t.risk_category}</strong> | Agent: <code>{t.assigned_agent_id || 'UNASSIGNED (HUMAN)'}</code>
                      </div>

                      <div style={{ fontSize: '0.8rem', color: '#334155', backgroundColor: '#f8fafc', padding: '0.5rem', borderRadius: '4px' }}>
                        <strong>Allocation Rationale:</strong> {t.handler_reason}
                      </div>

                      {t.handler !== 'escalated' && t.handler !== 'blocked' && (
                        <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                          {escalatingTaskId === t.id ? (
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', width: '100%', marginTop: '0.25rem' }}>
                              <input
                                type="text"
                                value={escalationReason}
                                onChange={(e) => setEscalationReason(e.target.value)}
                                placeholder="Escalation reason"
                                style={{ flex: 1, padding: '0.3rem', fontSize: '0.8rem', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                              />
                              <select
                                value={escalationRole}
                                onChange={(e) => setEscalationRole(e.target.value)}
                                style={{ padding: '0.3rem', fontSize: '0.8rem', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                              >
                                <option value="lead_analyst">lead_analyst</option>
                                <option value="security_reviewer">security_reviewer</option>
                                <option value="admin">admin</option>
                              </select>
                              <button
                                onClick={() => handleEscalateTask(t.id)}
                                style={{ padding: '0.3rem 0.6rem', backgroundColor: '#ca8a04', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer' }}
                              >
                                Confirm
                              </button>
                              <button
                                onClick={() => setEscalatingTaskId(null)}
                                style={{ padding: '0.3rem 0.6rem', backgroundColor: '#94a3b8', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '0.8rem', cursor: 'pointer' }}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setEscalatingTaskId(t.id)}
                              style={{ padding: '0.25rem 0.6rem', backgroundColor: '#fef3c7', color: '#b45309', border: '1px solid #fde68a', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer' }}
                            >
                              ↗️ Escalate to Human Role
                            </button>
                          )}
                        </div>
                      )}

                      {t.escalation_reason && (
                        <div style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: '#b45309', backgroundColor: '#fffbeb', padding: '0.4rem', borderRadius: '4px' }}>
                          <strong>Escalation Target:</strong> {t.escalation_target_role} — Reason: {t.escalation_reason}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: ACTION LAUNCHER / SIMULATOR */}
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

      {/* TAB 4: APPROVALS INBOX */}
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

      {/* TAB 5: INCIDENTS & AUDIT REPORT (WORKSTREAM C) */}
      {activeTab === 'incidents' && (
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 1rem' }}>Active Containment & Incident Registry</h2>
          {incidents.length === 0 ? (
            <p style={{ color: '#64748b' }}>No incidents recorded. System operating securely.</p>
          ) : (
            <div style={{ display: 'grid', gap: '1rem', marginBottom: '1.5rem' }}>
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

                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => { setSelectedIncident(inc); handleDiagnose(inc.id); }}
                      style={{ padding: '0.4rem 0.8rem', backgroundColor: '#2563eb', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}
                    >
                      🔍 Run Signature Diagnostics
                    </button>
                    <button
                      onClick={() => handleFetchReport(inc.id)}
                      style={{ padding: '0.4rem 0.8rem', backgroundColor: '#0f172a', color: '#fff', border: 'none', borderRadius: '4px', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem' }}
                    >
                      📄 View Audit Accountability Report
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

          {/* AUDIT-READY INCIDENT ACCOUNTABILITY REPORT (WORKSTREAM C) */}
          {reportLoading && <div style={{ color: '#2563eb', fontWeight: 600 }}>Loading Audit Report...</div>}
          {incidentReport && (
            <div style={{ backgroundColor: '#fff', border: '2px solid #0f172a', borderRadius: '8px', padding: '1.5rem', marginTop: '1.5rem', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #0f172a', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0f172a' }}>
                    OFFICIAL INCIDENT ACCOUNTABILITY REPORT (11-SECTION CHAIN)
                  </h3>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.2rem' }}>
                    Generated: {incidentReport.reportMetadata.generatedAt} • Version: {incidentReport.reportMetadata.reportVersion}
                  </div>
                </div>
                <button
                  onClick={() => setIncidentReport(null)}
                  style={{ background: 'none', border: '1px solid #cbd5e1', borderRadius: '4px', padding: '0.2rem 0.6rem', cursor: 'pointer', fontWeight: 700 }}
                >
                  ✕ Close
                </button>
              </div>

              <div style={{ backgroundColor: '#f1f5f9', padding: '0.6rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700, color: '#334155', marginBottom: '1rem' }}>
                {incidentReport.reportMetadata.disclaimer}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1rem', fontSize: '0.83rem' }}>
                {/* Section 1 */}
                <div style={{ border: '1px solid #e2e8f0', padding: '0.75rem', borderRadius: '6px' }}>
                  <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '0.3rem' }}>1. Incident Identification</div>
                  <div>ID: <code>{incidentReport.section1_incidentIdentification.incidentId}</code></div>
                  <div>Severity: <strong>{incidentReport.section1_incidentIdentification.severity}</strong></div>
                  <div>Status: <strong>{incidentReport.section1_incidentIdentification.status}</strong></div>
                  <div>Opened: {incidentReport.section1_incidentIdentification.openedAt}</div>
                  <div>Diagnosed: {incidentReport.section1_incidentIdentification.diagnosedAt}</div>
                  <div>Applied: {incidentReport.section1_incidentIdentification.appliedAt}</div>
                  <div>Resumed: {incidentReport.section1_incidentIdentification.resumedAt}</div>
                </div>

                {/* Section 2 */}
                <div style={{ border: '1px solid #e2e8f0', padding: '0.75rem', borderRadius: '6px' }}>
                  <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '0.3rem' }}>2. Agent & Ownership at Event</div>
                  <div>Agent ID: <code>{incidentReport.section2_agentAndOwnership.agentId}</code></div>
                  <div>Name: {incidentReport.section2_agentAndOwnership.agentName}</div>
                  <div>Owner: <strong>{incidentReport.section2_agentAndOwnership.ownerUserIdAtEvent}</strong></div>
                  <div>Team: {incidentReport.section2_agentAndOwnership.team}</div>
                  <div>Risk: {incidentReport.section2_agentAndOwnership.riskCategory}</div>
                </div>

                {/* Section 3 */}
                <div style={{ border: '1px solid #e2e8f0', padding: '0.75rem', borderRadius: '6px' }}>
                  <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '0.3rem' }}>3. Task & Triggering Action</div>
                  <div>Request ID: <code>{incidentReport.section3_taskAndTriggeringAction.triggeringRequestId}</code></div>
                  <div>Operation: <code>{incidentReport.section3_taskAndTriggeringAction.requestedOperation}</code></div>
                  <div>Resource: <code>{incidentReport.section3_taskAndTriggeringAction.resourceReference}</code></div>
                  <div>Task Type: {incidentReport.section3_taskAndTriggeringAction.taskType}</div>
                  <div>Handler: {incidentReport.section3_taskAndTriggeringAction.handler}</div>
                </div>

                {/* Section 4 */}
                <div style={{ border: '1px solid #e2e8f0', padding: '0.75rem', borderRadius: '6px' }}>
                  <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '0.3rem' }}>4. Policy Evaluation Gate</div>
                  <div>Policy: <code>{incidentReport.section4_policyEvaluationGate.policyId}</code> ({incidentReport.section4_policyEvaluationGate.policyVersion})</div>
                  <div>Decision: <strong style={{ color: '#dc2626' }}>{incidentReport.section4_policyEvaluationGate.gateDecision}</strong></div>
                  <div>Reason Code: {incidentReport.section4_policyEvaluationGate.reasonCode}</div>
                  <div>Explanation: {incidentReport.section4_policyEvaluationGate.explanation}</div>
                </div>

                {/* Section 5 */}
                <div style={{ border: '1px solid #e2e8f0', padding: '0.75rem', borderRadius: '6px' }}>
                  <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '0.3rem' }}>5. Human Authorization Review</div>
                  <div>Required: {incidentReport.section5_humanAuthorizationReview.approvalRequired ? 'Yes' : 'No'}</div>
                  <div>Status: {incidentReport.section5_humanAuthorizationReview.status}</div>
                  <div>Approver: {incidentReport.section5_humanAuthorizationReview.approverId} ({incidentReport.section5_humanAuthorizationReview.approverRole})</div>
                  <div>Reason: {incidentReport.section5_humanAuthorizationReview.reason}</div>
                  <div>Decided: {incidentReport.section5_humanAuthorizationReview.decidedAt}</div>
                </div>

                {/* Section 6 */}
                <div style={{ border: '1px solid #e2e8f0', padding: '0.75rem', borderRadius: '6px' }}>
                  <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '0.3rem' }}>6. Execution Outcome</div>
                  <div>Execution Status: <strong>{incidentReport.section6_executionOutcome.status}</strong></div>
                  <div>Non-Execution Reason: <strong>{incidentReport.section6_executionOutcome.nonExecutionReason}</strong></div>
                  <div>Duration: {incidentReport.section6_executionOutcome.durationMs}</div>
                  <div>Executed At: {incidentReport.section6_executionOutcome.executedAt}</div>
                </div>

                {/* Section 7 */}
                <div style={{ border: '1px solid #e2e8f0', padding: '0.75rem', borderRadius: '6px' }}>
                  <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '0.3rem' }}>7. Containment Action</div>
                  <div>Violation Type: {incidentReport.section7_containmentAction.violationType}</div>
                  <div>Pre-Incident Status: {incidentReport.section7_containmentAction.preIncidentAgentStatus}</div>
                  <div>Post-Incident Status: <strong>{incidentReport.section7_containmentAction.postIncidentAgentStatus}</strong></div>
                  <div>Containment Enforced: {incidentReport.section7_containmentAction.containmentEnforced ? 'True (Automated sub-second)' : 'False'}</div>
                </div>

                {/* Section 8 */}
                <div style={{ border: '1px solid #e2e8f0', padding: '0.75rem', borderRadius: '6px' }}>
                  <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '0.3rem' }}>8. Automated Diagnostics</div>
                  <div>Status: {incidentReport.section8_automatedDiagnostics.diagnosticStatus}</div>
                  <div>Signature ID: <code>{incidentReport.section8_automatedDiagnostics.signatureId}</code></div>
                  <div>Cause: {incidentReport.section8_automatedDiagnostics.causeCategory}</div>
                  <div>Explanation: {incidentReport.section8_automatedDiagnostics.explanation}</div>
                </div>

                {/* Section 9 */}
                <div style={{ border: '1px solid #e2e8f0', padding: '0.75rem', borderRadius: '6px' }}>
                  <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '0.3rem' }}>9. Correction & Sandbox Checks</div>
                  <div>Correction ID: <code>{incidentReport.section9_correctionProposalAndVerification.correctionId}</code></div>
                  <div>Structural Checks: {incidentReport.section9_correctionProposalAndVerification.structuralVerdict}</div>
                  <div>Behavioural Checks: {incidentReport.section9_correctionProposalAndVerification.behaviouralVerdict}</div>
                  <div>Overall Verdict: <strong>{incidentReport.section9_correctionProposalAndVerification.overallVerdict}</strong></div>
                  <div>Application Status: {incidentReport.section9_correctionProposalAndVerification.applicationStatus}</div>
                </div>

                {/* Section 10 */}
                <div style={{ border: '1px solid #e2e8f0', padding: '0.75rem', borderRadius: '6px' }}>
                  <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '0.3rem' }}>10. Revalidation & Central Resume Gate</div>
                  <div>Revalidation: {incidentReport.section10_revalidationAndResumeDecision.revalidationPassed ? 'PASSED' : 'PENDING'}</div>
                  <div>Resume Eligible: {incidentReport.section10_revalidationAndResumeDecision.resumeEligible ? 'YES' : 'NO'}</div>
                  <div>Resumed Status: {incidentReport.section10_revalidationAndResumeDecision.resumedToStatus}</div>
                  {incidentReport.section10_revalidationAndResumeDecision.unmetConditions.length > 0 && (
                    <div style={{ color: '#dc2626', marginTop: '0.2rem' }}>
                      Unmet: {incidentReport.section10_revalidationAndResumeDecision.unmetConditions.join(', ')}
                    </div>
                  )}
                </div>
              </div>

              {/* Section 11: Chronological Audit Timeline */}
              <div style={{ marginTop: '1.25rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                <div style={{ fontWeight: 700, color: '#0f172a', marginBottom: '0.5rem' }}>11. Chronological Audit Timeline (Hash Chained)</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                    <thead>
                      <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', textAlign: 'left' }}>
                        <th style={{ padding: '0.3rem' }}>Seq</th>
                        <th style={{ padding: '0.3rem' }}>Event Type</th>
                        <th style={{ padding: '0.3rem' }}>Actor</th>
                        <th style={{ padding: '0.3rem' }}>Decision</th>
                        <th style={{ padding: '0.3rem' }}>Outcome</th>
                        <th style={{ padding: '0.3rem' }}>Timestamp</th>
                        <th style={{ padding: '0.3rem' }}>Hash</th>
                      </tr>
                    </thead>
                    <tbody>
                      {incidentReport.section11_chronologicalAuditTimeline.map((item: any) => (
                        <tr key={item.eventId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '0.3rem' }}>#{item.sequence}</td>
                          <td style={{ padding: '0.3rem' }}><strong>{item.eventType}</strong></td>
                          <td style={{ padding: '0.3rem' }}>{item.actor}</td>
                          <td style={{ padding: '0.3rem' }}>{item.decision}</td>
                          <td style={{ padding: '0.3rem' }}>{item.outcome}</td>
                          <td style={{ padding: '0.3rem' }}>{new Date(item.timestamp).toLocaleTimeString()}</td>
                          <td style={{ padding: '0.3rem', fontFamily: 'monospace', color: '#64748b' }}>{item.hash?.substring(0, 12)}...</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 6: SANDBOX & VERIFIED RECOVERY */}
      {activeTab === 'recovery' && (
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 1rem' }}>Sandbox Testing & Verified Recovery (Gate G3)</h2>
          
          <div style={{ backgroundColor: '#f8fafc', padding: '1.25rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1.5rem' }}>
            <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 700 }}>Sandbox Verification Controls</h3>
            <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: '#64748b' }}>
              Run structural (S1-S6) and behavioural (B1-B6) checks against cloned synthetic state to prove no silent policy weakening.
            </p>

            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
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
                <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
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

      {/* TAB 7: REGISTRY & POLICIES */}
      {activeTab === 'agents' && (
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 1rem' }}>Registered Agents & Versioned Policies</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            {agents.map((ag) => (
              <div key={ag.id} style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1rem', backgroundColor: '#fff' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <strong>{ag.name}</strong>
                  <span style={{
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    backgroundColor: ag.status === 'active' ? '#dcfce7' : ag.status === 'restricted' ? '#fef9c3' : '#fee2e2',
                    color: ag.status === 'active' ? '#15803d' : ag.status === 'restricted' ? '#a16207' : '#b91c1c'
                  }}>
                    {ag.status.toUpperCase()}
                  </span>
                </div>
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.25rem' }}>ID: <code>{ag.id}</code> | Team: {ag.team}</div>
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.5rem' }}>Policy: {ag.policy_version} | Risk: {ag.risk_category}</div>
                <div style={{ fontSize: '0.78rem', color: '#334155', backgroundColor: '#f8fafc', padding: '0.4rem', borderRadius: '4px' }}>
                  <strong>Allowed Operations:</strong> {ag.allowed_operations?.join(', ')}
                </div>
              </div>
            ))}
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

      {/* TAB 8: AUDIT TRAIL */}
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
