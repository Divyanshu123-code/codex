import { useState, useEffect, useCallback } from 'react';
import type { Tab, Agent, Policy, Approval, Incident, Correction, Task, AuditEvent, DashboardData, AuthUser } from './types';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { LoginView } from './components/LoginView';
import { OverviewView } from './components/OverviewView';
import { AgentsView } from './components/AgentsView';
import { PoliciesView } from './components/PoliciesView';
import { ApprovalsView } from './components/ApprovalsView';
import { IncidentsView } from './components/IncidentsView';
import { CorrectionsView } from './components/CorrectionsView';
import { TasksView } from './components/TasksView';
import { AuditLogView } from './components/AuditLogView';
import { BackupsView } from './components/BackupsView';
import { LiveAgentConsoleView } from './components/LiveAgentConsoleView';
import { ScenarioLauncherModal } from './components/ScenarioLauncherModal';
import { getStoredToken, getStoredUser, setStoredSession, clearStoredSession, setupFetchInterceptor } from './auth';
import { parseJsonSafe } from './utils';

export function App() {
  // Auth Session State
  const [authToken, setAuthToken] = useState<string | null>(getStoredToken);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(getStoredUser);

  const [activeTab, setActiveTab] = useState<Tab>('overview');
  
  // Data States
  const [agents, setAgents] = useState<Agent[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [corrections, setCorrections] = useState<Correction[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);

  // UI Interactive States
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isScenarioModalOpen, setIsScenarioModalOpen] = useState(false);
  const [selectedApprovalId, setSelectedApprovalId] = useState<string | null>(null);
  const [selectedIncidentId, setSelectedIncidentId] = useState<string | null>(null);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Setup Fetch Interceptor for Token Injection and 401 Expiration
  useEffect(() => {
    setupFetchInterceptor(() => {
      setAuthToken(null);
      setCurrentUser(null);
    });

    const handleAuthExpired = () => {
      setAuthToken(null);
      setCurrentUser(null);
    };

    window.addEventListener('aegis:auth_expired', handleAuthExpired);
    return () => window.removeEventListener('aegis:auth_expired', handleAuthExpired);
  }, []);

  // Data Fetching
  const refreshData = useCallback(async () => {
    if (!getStoredToken()) return;
    setIsRefreshing(true);
    try {
      const [
        agentsRes,
        policiesRes,
        approvalsRes,
        incidentsRes,
        correctionsRes,
        tasksRes,
        auditRes,
        dashboardRes
      ] = await Promise.all([
        fetch('/api/agents'),
        fetch('/api/policies'),
        fetch('/api/approvals'),
        fetch('/api/incidents'),
        fetch('/api/corrections'),
        fetch('/api/tasks'),
        fetch('/api/audit'),
        fetch('/api/dashboard/overview')
      ]);

      if (agentsRes.ok) {
        const data = await parseJsonSafe(agentsRes);
        if (data) setAgents(data);
      }
      if (policiesRes.ok) {
        const data = await parseJsonSafe(policiesRes);
        if (data) setPolicies(data);
      }
      if (approvalsRes.ok) {
        const data = await parseJsonSafe(approvalsRes);
        if (data) setApprovals(data);
      }
      if (incidentsRes.ok) {
        const data = await parseJsonSafe(incidentsRes);
        if (data) setIncidents(data);
      }
      if (correctionsRes.ok) {
        const data = await parseJsonSafe(correctionsRes);
        if (data) setCorrections(data);
      }
      if (tasksRes.ok) {
        const data = await parseJsonSafe(tasksRes);
        if (data) setTasks(data);
      }
      if (auditRes.ok) {
        const data = await parseJsonSafe(auditRes);
        if (data) setAuditEvents(data);
      }
      if (dashboardRes.ok) {
        const data = await parseJsonSafe(dashboardRes);
        if (data) setDashboardData(data);
      }
    } catch (err) {
      console.error('Failed to poll control plane backend:', err);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (authToken) {
      refreshData();
      const interval = setInterval(refreshData, 2500);
      return () => clearInterval(interval);
    }
  }, [authToken, refreshData]);

  // Auth Action Handlers
  const handleLoginSuccess = (user: AuthUser, token: string) => {
    setStoredSession(token, user);
    setCurrentUser(user);
    setAuthToken(token);
  };

  const handleLogout = () => {
    clearStoredSession();
    setCurrentUser(null);
    setAuthToken(null);
  };

  const handleSwitchPersona = (user: AuthUser, token: string) => {
    setStoredSession(token, user);
    setCurrentUser(user);
    setAuthToken(token);
    refreshData();
  };

  // Global Action Handlers (Actor is derived strictly from Token in backend)
  const handlePauseAgent = async (agentId: string, reason: string) => {
    const res = await fetch(`/api/agents/${agentId}/pause`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    if (!res.ok) {
      const err = await parseJsonSafe(res);
      throw new Error(err?.error || `Failed to pause agent (${res.status} ${res.statusText})`);
    }
    await refreshData();
  };

  const handleResumeAgent = async (agentId: string, reason: string) => {
    const res = await fetch(`/api/agents/${agentId}/resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason })
    });
    if (!res.ok) {
      const err = await parseJsonSafe(res);
      throw new Error(err?.error || `Failed to resume agent (${res.status} ${res.statusText})`);
    }
    await refreshData();
  };

  const handleDecideApproval = async (
    approvalId: string,
    status: 'APPROVED' | 'REJECTED',
    reason: string,
    options?: { wrongCallConfirmed?: boolean }
  ) => {
    const res = await fetch(`/api/approvals/${approvalId}/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decision: status,
        status,
        reason,
        wrongCallConfirmed: options?.wrongCallConfirmed,
        overridePassedChecks: options?.wrongCallConfirmed
      })
    });
    if (!res.ok) {
      const err = await parseJsonSafe(res);
      throw new Error(err?.error || `Decision failed (${res.status} ${res.statusText})`);
    }
    const data = await parseJsonSafe(res);
    await refreshData();
    return data;
  };

  const handleSelectApproval = (id: string) => {
    setSelectedApprovalId(id);
    setActiveTab('approvals');
  };

  const handleSelectIncident = (id: string) => {
    setSelectedIncidentId(id);
    setActiveTab('incidents');
  };

  const handleSelectAgent = (id: string) => {
    setSelectedAgentId(id);
    setActiveTab('agents');
  };

  // If unauthenticated, show AegisOS Login View
  if (!authToken || !currentUser) {
    return <LoginView onLoginSuccess={handleLoginSuccess} />;
  }

  // Calculate live badge counters
  const pendingApprovalsCount = approvals.filter(a => a.status === 'PENDING').length;
  const openIncidentsCount = incidents.filter(i => i.status === 'OPEN').length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans antialiased">
      {/* 1. Global Navigation Bar */}
      <Header
        currentUser={currentUser}
        onLogout={handleLogout}
        onSwitchPersona={handleSwitchPersona}
        onOpenScenarioModal={() => setIsScenarioModalOpen(true)}
        pendingCount={pendingApprovalsCount}
        incidentCount={openIncidentsCount}
        onRefresh={refreshData}
        isRefreshing={isRefreshing}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
      />

      {/* 2. Left Navigation Rail */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        pendingApprovalsCount={pendingApprovalsCount}
        openIncidentsCount={openIncidentsCount}
        currentUser={currentUser}
      />

      {/* 3. Main Workspace Container */}
      <div className="pl-64">
        <main 
          className="relative min-h-screen w-full px-6 py-6"
          style={{ paddingTop: '4.5rem' }}
        >
          {activeTab === 'overview' && (
            <OverviewView
              agents={agents}
              approvals={approvals}
              incidents={incidents}
              auditEvents={auditEvents}
              dashboardData={dashboardData}
              onNavigateTab={setActiveTab}
              onSelectApproval={handleSelectApproval}
              onSelectIncident={handleSelectIncident}
              onSelectAgent={handleSelectAgent}
            />
          )}

          {activeTab === 'live-agent' && (
            <LiveAgentConsoleView
              onNavigateTab={setActiveTab}
              onSelectApproval={handleSelectApproval}
            />
          )}

          {activeTab === 'agents' && (
            <AgentsView
              agents={agents}
              onPauseAgent={handlePauseAgent}
              onResumeAgent={handleResumeAgent}
              selectedAgentId={selectedAgentId}
              onNavigateTab={setActiveTab}
              onSelectApproval={handleSelectApproval}
            />
          )}

          {activeTab === 'policies' && (
            <PoliciesView
              policies={policies}
            />
          )}

          {activeTab === 'approvals' && (
            <ApprovalsView
              approvals={approvals}
              onDecideApproval={handleDecideApproval}
              selectedApprovalId={selectedApprovalId}
              currentUser={currentUser}
              onRefresh={refreshData}
              onSwitchPersona={handleSwitchPersona}
            />
          )}

          {activeTab === 'incidents' && (
            <IncidentsView
              incidents={incidents}
              onNavigateTab={setActiveTab}
              selectedIncidentId={selectedIncidentId}
            />
          )}

          {activeTab === 'corrections' && (
            <CorrectionsView
              corrections={corrections}
              onNavigateTab={setActiveTab}
              onRefresh={refreshData}
            />
          )}

          {activeTab === 'tasks' && (
            <TasksView
              tasks={tasks}
              agents={agents}
              onRefresh={refreshData}
            />
          )}

          {activeTab === 'audit' && (
            <AuditLogView
              auditEvents={auditEvents}
            />
          )}

          {activeTab === 'backups' && (
            <BackupsView
              onRefresh={refreshData}
              onNavigateTab={setActiveTab}
              onSelectApproval={handleSelectApproval}
            />
          )}
        </main>
      </div>

      {/* 4. Interactive Scenario Launcher Modal */}
      <ScenarioLauncherModal
        isOpen={isScenarioModalOpen}
        onClose={() => setIsScenarioModalOpen(false)}
        onRefresh={refreshData}
        onNavigateTab={setActiveTab}
        onSelectApproval={handleSelectApproval}
        onSelectIncident={handleSelectIncident}
      />

    </div>
  );
}

export default App;
