import React, { useState, useEffect } from 'react';
import type { AuthUser } from '../types';
import { parseJsonSafe } from '../utils';

interface HeaderProps {
  currentUser: AuthUser;
  onLogout: () => void;
  onSwitchPersona: (user: AuthUser, token: string) => void;
  onOpenScenarioModal: () => void;
  pendingCount: number;
  incidentCount: number;
  onRefresh: () => void;
  isRefreshing: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

interface DemoUserItem {
  id: string;
  username: string;
  role: string;
  label: string;
  authority_level: number;
  demoPassword?: string;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  onLogout,
  onSwitchPersona,
  onOpenScenarioModal,
  pendingCount,
  incidentCount,
  onRefresh,
  isRefreshing,
  searchQuery,
  onSearchChange
}) => {
  const [demoUsers, setDemoUsers] = useState<DemoUserItem[]>([]);
  const [demoMode, setDemoMode] = useState(false);
  const [showSwitchMenu, setShowSwitchMenu] = useState(false);

  useEffect(() => {
    fetch('/api/auth/demo-users')
      .then((res) => parseJsonSafe(res))
      .then((data) => {
        if (data?.demoMode && Array.isArray(data.users)) {
          setDemoMode(true);
          setDemoUsers(data.users);
        }
      })
      .catch(() => {});
  }, []);

  const handleQuickSwitch = async (targetUser: DemoUserItem) => {
    setShowSwitchMenu(false);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: targetUser.username,
          password: targetUser.demoPassword || 'password123'
        })
      });
      const data = await parseJsonSafe(res);
      if (res.ok && data?.token && data?.user) {
        onSwitchPersona(data.user, data.token);
      }
    } catch (err) {
      console.error('Quick switch failed:', err);
    }
  };

  const roleBadgeColor = 
    currentUser.role === 'admin' ? 'bg-purple-100 text-purple-800 border-purple-300' :
    currentUser.role === 'reviewer' ? 'bg-blue-100 text-blue-800 border-blue-300' :
    'bg-emerald-100 text-emerald-800 border-emerald-300';

  return (
    <header className="fixed top-0 left-0 right-0 h-16 bg-white/95 backdrop-blur-md z-40 border-b border-slate-200/80 shadow-[0_1px_8px_rgba(0,0,0,0.03)]">
      <div className="h-16 w-full px-6 flex items-center justify-between gap-4">
          
        {/* Brand Logo & Demarcation */}
        <div className="flex items-center gap-3 min-w-max">
          <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-sm shadow-indigo-200">
            <span className="material-symbols-outlined text-[1.35rem]">shield</span>
          </div>
          <div className="flex flex-col">
            <span className="font-semibold text-[1.125rem] text-slate-900 tracking-tight leading-none">
              AegisOS Governance
            </span>
            <span className="font-mono text-[0.625rem] text-slate-500 tracking-wider uppercase mt-1">
              SYNTHETIC DEFENCE AI CONTROL PLANE
            </span>
          </div>
        </div>

        {/* Global Search Bar */}
        <div className="flex-1 max-w-xl mx-auto px-4 hidden md:block">
          <div className="relative flex items-center">
            <span className="material-symbols-outlined absolute left-3 text-slate-400 pointer-events-none text-[1.125rem]">
              search
            </span>
            <input
              className="w-full bg-slate-100/80 pl-10 pr-12 py-1.5 rounded-lg text-xs font-sans text-slate-900 placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 border border-transparent shadow-inner transition-all"
              placeholder="Search agents, requests, policies, incidents, audit trail..."
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
            <kbd className="absolute right-2.5 px-1.5 py-0.5 bg-white rounded text-[0.6875rem] font-mono text-slate-500 shadow-sm border border-slate-200">
              ⌘K
            </kbd>
          </div>
        </div>

        {/* Right Action Tools */}
        <div className="flex items-center gap-3 min-w-max">
          {/* Quick Scenario Runner Trigger Button */}
          <button
            onClick={onOpenScenarioModal}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-semibold tracking-wide transition-all shadow-sm active:scale-95"
            title="Launch Pre-Engineered Defence Scenarios"
          >
            <span className="material-symbols-outlined text-[1rem] text-indigo-600">rocket_launch</span>
            <span className="hidden sm:inline">Run Scenarios</span>
          </button>

          {/* Refresh Data Button */}
          <button
            onClick={onRefresh}
            disabled={isRefreshing}
            className={`p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors ${
              isRefreshing ? 'animate-spin text-indigo-600' : ''
            }`}
            title="Refresh Data from Backend"
          >
            <span className="material-symbols-outlined text-[1.25rem]">sync</span>
          </button>

          {/* Notifications Alert Bell */}
          <div className="relative">
            <button 
              className="relative p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
              title={`${pendingCount} Pending Approvals, ${incidentCount} Open Incidents`}
            >
              <span className="material-symbols-outlined text-[1.25rem]">notifications</span>
              {(pendingCount > 0 || incidentCount > 0) && (
                <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-white"></span>
              )}
            </button>
          </div>

          {/* DEMO_MODE: Quick Switch User Control (Presenters swap between admin & reviewer in 2 clicks) */}
          {demoMode && (
            <div className="relative">
              <button
                onClick={() => setShowSwitchMenu(!showSwitchMenu)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-xs font-semibold tracking-wide shadow-sm transition-all"
                title="DEMO_MODE: Quick Switch Persona"
              >
                <span className="material-symbols-outlined text-[1.1rem] text-amber-600">swap_horiz</span>
                <span className="hidden lg:inline">Switch Role</span>
                <span className="material-symbols-outlined text-[0.9rem] text-amber-600">expand_more</span>
              </button>

              {showSwitchMenu && (
                <div className="absolute right-0 mt-2 w-56 bg-white border border-slate-200 rounded-xl shadow-2xl py-2 z-50">
                  <div className="px-3 py-1 text-[10px] font-mono uppercase font-bold text-slate-400 border-b border-slate-100">
                    Quick Persona Switch
                  </div>
                  {demoUsers.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => handleQuickSwitch(u)}
                      className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between hover:bg-slate-50 transition-colors ${
                        currentUser.username === u.username ? 'bg-indigo-50/70 font-semibold' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-sm text-slate-500">
                          {u.role === 'admin' ? 'admin_panel_settings' : u.role === 'reviewer' ? 'verified_user' : 'visibility'}
                        </span>
                        <div>
                          <div className="text-slate-900">{u.label}</div>
                          <div className="text-[10px] text-slate-400 font-mono">@{u.username}</div>
                        </div>
                      </div>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-100 border text-slate-600">
                        L{u.authority_level}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* User Profile Pill */}
          <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
            <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs ring-1 ring-slate-200 shadow-sm">
              {currentUser.username.substring(0, 2).toUpperCase()}
            </div>
            <div className="hidden lg:flex flex-col text-left">
              <span className="text-xs font-semibold text-slate-900 leading-tight">
                {currentUser.username}
              </span>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded border ${roleBadgeColor}`}>
                  L{currentUser.authority_level} • {currentUser.role.toUpperCase()}
                </span>
              </div>
            </div>

            {/* Logout Button */}
            <button
              onClick={onLogout}
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors ml-1"
              title="Logout Session"
            >
              <span className="material-symbols-outlined text-[1.2rem]">logout</span>
            </button>
          </div>

        </div>
      </div>
    </header>
  );
};
