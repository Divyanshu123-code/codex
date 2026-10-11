import { useState, useEffect } from 'react';

interface HealthData {
  status: string;
  service: string;
  timestamp: string;
  database: {
    connected: boolean;
    users: number;
    agents: number;
  };
}

export function App() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  const fetchHealth = async () => {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        setHealth(data);
      }
    } catch (err) {
      console.error('Failed to fetch health status', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleReset = async () => {
    setResetting(true);
    setResetMessage(null);
    try {
      const res = await fetch('/api/demo/reset', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setResetMessage('Demo environment reset successfully to clean synthetic state.');
        fetchHealth();
      }
    } catch (err: any) {
      setResetMessage(`Reset failed: ${err.message}`);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div style={{ fontFamily: 'system-ui, -apple-system, sans-serif', padding: '2rem', maxWidth: '1100px', margin: '0 auto', color: '#1e293b' }}>
      <header style={{ borderBottom: '2px solid #e2e8f0', paddingBottom: '1rem', marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 700, color: '#0f172a' }}>
            🛡️ AI Governance & Control Plane
          </h1>
          <p style={{ margin: '0.25rem 0 0', color: '#64748b', fontSize: '0.9rem' }}>
            CODEX 3.0 PS5 Core Build — Synthetic Agent Enforcement Boundary
          </p>
        </div>
        <button
          onClick={handleReset}
          disabled={resetting}
          style={{
            backgroundColor: '#ef4444',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            padding: '0.5rem 1rem',
            fontWeight: 600,
            cursor: resetting ? 'not-allowed' : 'pointer',
            opacity: resetting ? 0.7 : 1
          }}
        >
          {resetting ? 'Resetting...' : '🔄 Demo Reset'}
        </button>
      </header>

      {resetMessage && (
        <div style={{ padding: '0.75rem 1rem', backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', color: '#166534', marginBottom: '1.5rem' }}>
          {resetMessage}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
        <div style={{ padding: '1.25rem', border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: '#f8fafc' }}>
          <div style={{ fontSize: '0.85rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Backend Service</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: health?.status === 'ok' ? '#16a34a' : '#dc2626', marginTop: '0.25rem' }}>
            {loading ? 'Connecting...' : health?.status === 'ok' ? 'HEALTHY' : 'OFFLINE'}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.5rem' }}>
            {health?.service || 'Governance Gateway API'}
          </div>
        </div>

        <div style={{ padding: '1.25rem', border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: '#f8fafc' }}>
          <div style={{ fontSize: '0.85rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Registered Agents</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#0f172a', marginTop: '0.25rem' }}>
            {health?.database.agents ?? 0}
          </div>
          <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.5rem' }}>
            doc-agent-01 (Active)
          </div>
        </div>

        <div style={{ padding: '1.25rem', border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: '#f8fafc' }}>
          <div style={{ fontSize: '0.85rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Enforcement Mode</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#2563eb', marginTop: '0.25rem' }}>
            GATEWAY
          </div>
          <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.5rem' }}>
            ALLOW / REQUIRE_APPROVAL / BLOCK
          </div>
        </div>
      </div>

      <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.5rem', backgroundColor: '#fff' }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 600, margin: '0 0 1rem' }}>
          Phase 1 Complete: Runnable Skeleton Verified
        </h2>
        <ul style={{ margin: 0, paddingLeft: '1.25rem', color: '#475569', lineHeight: '1.7' }}>
          <li>Backend with Express, TypeScript, and native SQLite initialized.</li>
          <li>Full schema deployed: agents, versioned policies, task types, operations catalog, action requests, approvals, executions, incidents, corrections, and audit log.</li>
          <li>Seeded synthetic agent (<code>doc-agent-01</code>) and strict baseline policies.</li>
          <li>Vitest automated test suite passing.</li>
          <li>Frontend Vite React application connected with live polling.</li>
        </ul>
      </div>
    </div>
  );
}

export default App;
