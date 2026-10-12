import React from 'react';
import type { Tab } from '../types';

interface SidebarProps {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  pendingApprovalsCount: number;
  openIncidentsCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  pendingApprovalsCount,
  openIncidentsCount
}) => {
  const operationalNav = [
    { id: 'overview' as Tab, label: 'Overview', icon: 'dashboard' },
    { id: 'agents' as Tab, label: 'Agents Fleet', icon: 'smart_toy' },
    { id: 'policies' as Tab, label: 'Policies', icon: 'policy' },
    { 
      id: 'approvals' as Tab, 
      label: 'Approvals', 
      icon: 'rule', 
      badge: pendingApprovalsCount > 0 ? pendingApprovalsCount : undefined,
      badgeColor: 'bg-amber-100 text-amber-800 border border-amber-300'
    },
    { 
      id: 'incidents' as Tab, 
      label: 'Incidents', 
      icon: 'gpp_maybe', 
      badge: openIncidentsCount > 0 ? openIncidentsCount : undefined,
      badgeColor: 'bg-rose-100 text-rose-800 border border-rose-300'
    },
    { id: 'corrections' as Tab, label: 'Corrections', icon: 'build_circle' },
  ];

  const executionNav = [
    { id: 'tasks' as Tab, label: 'Tasks', icon: 'account_tree' },
    { id: 'audit' as Tab, label: 'Audit Log', icon: 'history' },
    { id: 'backups' as Tab, label: 'Backups & Recovery', icon: 'settings_backup_restore' },
  ];

  return (
    <aside 
      className="fixed left-0 bottom-0 w-64 bg-white border-r border-slate-200 z-30 flex flex-col justify-between shadow-[0_1px_8px_rgba(0,0,0,0.02)]"
      style={{ top: '4rem' }}
    >
      <div className="flex-1 overflow-y-auto px-4 py-4">
        
        {/* Section 1: Operational Control */}
        <div className="mb-2 px-2">
          <span className="font-mono text-[0.625rem] text-slate-400 uppercase tracking-wider font-semibold">
            Operational Control
          </span>
        </div>
        <nav className="space-y-1 mb-6">
          {operationalNav.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-all text-left ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
                    : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                }`}
              >
                <span className={`material-symbols-outlined text-[1.25rem] ${isActive ? 'text-white' : 'text-slate-500'}`}>
                  {item.icon}
                </span>
                <span className="flex-1">{item.label}</span>
                {item.badge !== undefined && (
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
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-semibold transition-all text-left ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-200'
                    : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                }`}
              >
                <span className={`material-symbols-outlined text-[1.25rem] ${isActive ? 'text-white' : 'text-slate-500'}`}>
                  {item.icon}
                </span>
                <span className="flex-1">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Session Auth Status Footer Card */}
      <div className="p-3.5 bg-slate-50 m-3 rounded-xl border border-slate-200/80">
        <div className="flex items-center justify-between mb-1">
          <span className="font-mono text-[0.625rem] text-slate-500 uppercase tracking-wider font-bold">
            Session Auth
          </span>
          <span className="flex items-center gap-1 font-mono text-[0.6875rem] text-emerald-700 font-semibold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
            Live
          </span>
        </div>
        <p className="text-xs font-bold text-slate-900 leading-tight truncate">
          Elena Vance
        </p>
        <p className="text-[0.6875rem] text-slate-500 truncate mt-0.5">
          Delegated Approver (L3)
        </p>
        <div className="mt-2 pt-2 border-t border-slate-200/80 flex items-center justify-between text-slate-500">
          <span className="font-mono text-[0.625rem] text-slate-400">ID: #EV-9942</span>
          <span className="material-symbols-outlined text-[0.875rem] text-indigo-600" title="Cryptographically Bound">
            verified_user
          </span>
        </div>
      </div>
    </aside>
  );
};
