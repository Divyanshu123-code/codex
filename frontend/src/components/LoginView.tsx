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
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col justify-center items-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-indigo-600 text-white mb-3 shadow-sm">
            <span className="material-symbols-outlined text-2xl">shield</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            AegisOS Governance
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Sign in to access the Defence AI Control Plane
          </p>
        </div>

        {/* Login Card */}
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-sm">
          {errorMessage && (
            <div className="mb-5 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2.5">
              <span className="material-symbols-outlined text-lg text-red-600 shrink-0">error</span>
              <span className="leading-snug">{errorMessage}</span>
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
              <label 
                htmlFor="username" 
                className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5"
              >
                Username
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-lg pointer-events-none">
                  person
                </span>
                <input
                  id="username"
                  type="text"
                  autoComplete="username"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-colors"
                  placeholder="Enter username"
                />
              </div>
            </div>

            <div>
              <label 
                htmlFor="password" 
                className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5"
              >
                Password
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-lg pointer-events-none">
                  lock
                </span>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 transition-colors"
                  placeholder="••••••••••••"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 shadow-sm"
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-base">progress_activity</span>
                  <span>Authenticating...</span>
                </>
              ) : (
                <span>Sign In</span>
              )}
            </button>
          </form>

          {/* DEMO MODE: Quick Persona Switcher */}
          {demoMode && (
            <div className="mt-6 pt-5 border-t border-slate-200">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Demo Personas
                </span>
                <span className="text-[11px] text-slate-400">Click to autofill & sign in</span>
              </div>

              <div className="space-y-2">
                {demoUsers.map((u) => {
                  const isCur = username === u.username;
                  const roleBadge = 
                    u.role === 'admin' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                    u.role === 'reviewer' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                    'bg-slate-100 text-slate-700 border-slate-200';

                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => selectDemoPersona(u)}
                      className={`w-full text-left p-2.5 rounded-lg border transition-colors flex items-center justify-between ${
                        isCur
                          ? 'bg-indigo-50/60 border-indigo-300 text-slate-900'
                          : 'bg-slate-50 border-slate-200 hover:bg-slate-100/80 text-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded bg-white border border-slate-200 flex items-center justify-center text-slate-600">
                          <span className="material-symbols-outlined text-sm">
                            {u.role === 'admin' ? 'admin_panel_settings' : u.role === 'reviewer' ? 'verified_user' : 'visibility'}
                          </span>
                        </div>
                        <div>
                          <div className="text-xs font-medium text-slate-900">{u.label}</div>
                          <div className="text-[11px] text-slate-500">@{u.username}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${roleBadge}`}>
                          L{u.authority_level} • {u.role.toUpperCase()}
                        </span>
                        <span className="material-symbols-outlined text-xs text-slate-400">arrow_forward</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer info */}
        <div className="text-center mt-6 text-xs text-slate-500">
          AegisOS Cryptographic Governance Control Plane
        </div>
      </div>
    </div>
  );
}
