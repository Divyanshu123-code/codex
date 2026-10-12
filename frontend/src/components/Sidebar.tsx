import React from 'react';
import type { Tab, AuthUser } from '../types';

interface SidebarProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  pendingApprovalsCount: number;
  openIncidentsCount: number;
  currentUser: AuthUser;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  pendingApprovalsCount,
  openIncidentsCount,
  currentUser
}) => {
  const isAuditor = currentUser.role === 'auditor';
  const isAdmin = currentUser.role === 'admin';

  const operationalNav = [
    { id: 'overview' as Tab, label: 'Overview', icon: 'dashboard', allowed: true },
    { 
      id: 'live-agent' as Tab, 
      label: 'Live Agent Console', 
      icon: 'terminal',
      badge: 'LIVE',
      badgeColor: 'bg-emerald-100 text-emerald-800 border border-emerald-300',
      allowed: true
    },
    { id: 'agents' as Tab, label: 'Agents Fleet', icon: 'smart_toy', allowed: true },
    { id: 'policies' as Tab, label: 'Policies', icon: 'policy', allowed: true },
    { 
      id: 'approvals' as Tab, 
      label: 'Approvals', 
      icon: 'rule', 
      badge: pendingApprovalsCount > 0 ? pendingApprovalsCount : undefined,
      badgeColor: 'bg-amber-100 text-amber-800 border border-amber-300',
      allowed: true
    },
    { 
      id: 'incidents' as Tab, 
      label: 'Incidents', 
      icon: 'gpp_maybe', 
      badge: openIncidentsCount > 0 ? openIncidentsCount : undefined,
      badgeColor: 'bg-rose-100 text-rose-800 border border-rose-300',
      allowed: true
    },
    { 
      id: 'corrections' as Tab, 
      label: 'Corrections', 
      icon: 'build_circle',
      allowed: isAdmin,
      requiredRole: 'Admin (L2)'
    },
  ];

  const executionNav = [
    { id: 'tasks' as Tab, label: 'Tasks', icon: 'account_tree', allowed: true },
    { id: 'audit' as Tab, label: 'Audit Log', icon: 'history', allowed: true },
    { 
      id: 'backups' as Tab, 
      label: 'Backups & Recovery', 
      icon: 'settings_backup_restore',
      allowed: isAdmin,
      requiredRole: 'Admin (L2)'
    },
  ];

  return (
    <aside 
      className="fixed left-0 bottom-0 w-64 bg-white border-r border-slate-200 z-30 flex flex-col justify-between shadow-[0_1px_8px_rgba(0,0,0,0.02)]"
      style={{ top: '4rem' }}
    >
      <div className="flex-1 overflow-y-auto px-4 py-4">
        
        {/* Section 1: Operational Control */}
        <div className="mb-2 px-2 flex items-center justify-between">
          <span className="font-mono text-[0.625rem] text-slate-400 uppercase tracking-wider font-semibold">
            Operational Control
          </span>
          {isAuditor && (
            <span className="text-[9px] font-mono font-bold px-1.5 py-0.2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded">
              READ-ONLY
            </span>
          )}
        </div>
        <nav className="space-y-1 mb-6">
          {operationalNav.map((item) => {
            const isActive = activeTab === item.id;
            const isBlocked = !item.allowed;

            return (
              <button
                key={item.id}
                onClick={() => {
                  if (!isBlocked) {
                    setActiveTab(item.id);
                  }
                }}
                disabled={isBlocked}
                title={isBlocked ? `Requires ${item.requiredRole}` : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-all text-left ${
                  isBlocked
                    ? 'opacity-40 cursor-not-allowed text-slate-400 bg-slate-50'
                    : isActive
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
                    : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                }`}
              >
                <span className={`material-symbols-outlined text-[1.25rem] ${isActive ? 'text-white' : 'text-slate-500'}`}>
                  {isBlocked ? 'lock' : item.icon}
                </span>
                <span className="flex-1">{item.label}</span>
                {isBlocked && (
                  <span className="text-[9px] font-mono text-slate-400">
                    L2
                  </span>
                )}
                {!isBlocked && item.badge !== undefined && (
                  <span className={`px-1.5 py-0.5 rounded text-[0.6875rem] font-mono font-bold ${
                    isActive ? 'bg-white/20 text-white' : item.badgeColor
                  }`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Section 2: Execution & Governance */}
        <div className="mb-2 px-2">
          <span className="font-mono text-[0.625rem] text-slate-400 uppercase tracking-wider font-semibold">
            Execution & Governance
          </span>
        </div>
        <nav className="space-y-1">
          {executionNav.map((item) => {
            const isActive = activeTab === item.id;
            const isBlocked = !item.allowed;

            return (
              <button
                key={item.id}
                onClick={() => {
                  if (!isBlocked) {
                    setActiveTab(item.id);
                  }
                }}
                disabled={isBlocked}
                title={isBlocked ? `Requires ${item.requiredRole}` : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-all text-left ${
                  isBlocked
                    ? 'opacity-40 cursor-not-allowed text-slate-400 bg-slate-50'
                    : isActive
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
                    : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                }`}
              >
                <span className={`material-symbols-outlined text-[1.25rem] ${isActive ? 'text-white' : 'text-slate-500'}`}>
                  {isBlocked ? 'lock' : item.icon}
                </span>
                <span className="flex-1">{item.label}</span>
                {isBlocked && (
                  <span className="text-[9px] font-mono text-slate-400">
                    L2
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Session Auth Status Footer Card */}
      <div className="p-3.5 bg-slate-50 m-3 rounded-xl border border-slate-200/80">
        <div className="flex items-center justify-between mb-1">
          <span className="font-mono text-[0.625rem] text-slate-500 uppercase tracking-wider font-bold">
            Session Identity
          </span>
          <span className="flex items-center gap-1 font-mono text-[0.6875rem] text-emerald-700 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            Verified
          </span>
        </div>
        <p className="text-xs font-bold text-slate-900 leading-tight truncate">
          {currentUser.username}
        </p>
        <p className="text-[0.6875rem] text-slate-500 truncate mt-0.5">
          {currentUser.label} (L{currentUser.authority_level})
        </p>
        <div className="mt-2 pt-2 border-t border-slate-200/80 flex items-center justify-between text-slate-500">
          <span className="font-mono text-[0.625rem] text-slate-400">ID: #{currentUser.id}</span>
          <span className="material-symbols-outlined text-[0.875rem] text-indigo-600" title="Token Bound Identity">
            verified_user
          </span>
        </div>
      </div>
    </aside>
  );
};
