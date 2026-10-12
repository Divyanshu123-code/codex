import { useState, useEffect } from 'react';
import type { AuthUser } from '../types';
import { setStoredSession } from '../auth';
import { parseJsonSafe } from '../utils';

interface LoginViewProps {
  onLoginSuccess: (user: AuthUser, token: string) => void;
}

interface DemoUserItem {
  id: string;
  username: string;
  role: string;
  label: string;
  authority_level: number;
  demoPassword?: string;
}

export function LoginView({ onLoginSuccess }: LoginViewProps) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('password123');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  const [demoMode, setDemoMode] = useState(false);
  const [demoUsers, setDemoUsers] = useState<DemoUserItem[]>([]);

  useEffect(() => {
    // Fetch demo users if demo mode is enabled
    fetch('/api/auth/demo-users')
      .then((res) => parseJsonSafe(res))
      .then((data) => {
        if (data?.demoMode && Array.isArray(data.users)) {
          setDemoMode(true);
          setDemoUsers(data.users);
        }
      })
      .catch(() => {
        // demo mode not enabled or network error
      });
  }, []);

  const handleLogin = async (loginUser = username, loginPass = password) => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUser, password: loginPass })
      });

      const data = await parseJsonSafe(res);

      if (!res.ok) {
        throw new Error(data?.error || `Authentication failed (${res.status})`);
      }

      if (data?.token && data?.user) {
        setStoredSession(data.token, data.user);
        onLoginSuccess(data.user, data.token);
      } else {
        throw new Error('Invalid authentication response from server.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Login failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  const selectDemoPersona = (user: DemoUserItem) => {
    setUsername(user.username);
    const pass = user.demoPassword || 'password123';
    setPassword(pass);
    handleLogin(user.username, pass);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b08_1px,transparent_1px),linear-gradient(to_bottom,#1e293b08_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Header Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 mb-4 shadow-xl backdrop-blur-md">
            <span className="material-symbols-outlined text-3xl">security</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
            AegisOS Control Plane
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-300">
              v1.0-DEF
            </span>
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Defence Autonomous AI Governance & Enforcement Enclave
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-2xl backdrop-blur-xl">
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800/80">
            <span className="text-xs font-semibold tracking-wider uppercase text-slate-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Secure Identity Gateway
            </span>
            <span className="text-[11px] font-mono text-slate-500">
              JWT • 8H SESSION
            </span>
          </div>

          {errorMessage && (
            <div className="mb-4 p-3 rounded-lg bg-red-950/60 border border-red-800/80 text-red-300 text-xs flex items-center gap-2">
              <span className="material-symbols-outlined text-sm text-red-400">error</span>
              <span>{errorMessage}</span>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleLogin();
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Username
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-500 text-base">
                  person
                </span>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                  placeholder="Enter operator username"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Passphrase / Token Secret
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-500 text-base">
                  key
                </span>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500 transition-colors"
                  placeholder="••••••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-sm font-medium rounded-lg shadow-lg shadow-indigo-600/25 transition-all flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-base">lock_open</span>
                  <span>Authenticate Operator</span>
                </>
              )}
            </button>
          </form>

          {/* DEMO MODE: Quick Persona Switcher Cards */}
          {demoMode && (
            <div className="mt-6 pt-5 border-t border-slate-800/80">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm">stars</span>
                  Demo Mode • One-Click Personas
                </span>
                <span className="text-[10px] text-slate-500 font-mono">Presenters Only</span>
              </div>

              <div className="space-y-2">
                {demoUsers.map((u) => {
                  const isCur = username === u.username;
                  const roleBadge = 
                    u.role === 'admin' ? 'bg-purple-950/80 text-purple-300 border-purple-800/70' :
                    u.role === 'reviewer' ? 'bg-blue-950/80 text-blue-300 border-blue-800/70' :
                    'bg-emerald-950/80 text-emerald-300 border-emerald-800/70';

                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => selectDemoPersona(u)}
                      className={`w-full text-left p-2.5 rounded-lg border transition-all flex items-center justify-between ${
                        isCur
                          ? 'bg-slate-800/90 border-indigo-500/70 shadow-sm'
                          : 'bg-slate-950/70 border-slate-800 hover:bg-slate-800/50 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-md bg-slate-800 flex items-center justify-center text-slate-300">
                          <span className="material-symbols-outlined text-sm">
                            {u.role === 'admin' ? 'admin_panel_settings' : u.role === 'reviewer' ? 'verified_user' : 'visibility'}
                          </span>
                        </div>
                        <div>
                          <div className="text-xs font-semibold text-slate-200">{u.label}</div>
                          <div className="text-[10px] font-mono text-slate-400">@{u.username}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${roleBadge}`}>
                          L{u.authority_level} • {u.role.toUpperCase()}
                        </span>
                        <span className="material-symbols-outlined text-xs text-slate-500">arrow_forward</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="text-center mt-6 text-[11px] text-slate-600 font-mono">
          AegisOS Cryptographic Governance • Token Security Protected
        </div>
      </div>
    </div>
  );
}
