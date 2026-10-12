import React from 'react';

interface HeaderProps {
  onOpenScenarioModal: () => void;
  pendingCount: number;
  incidentCount: number;
  onRefresh: () => void;
  isRefreshing: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenScenarioModal,
  pendingCount,
  incidentCount,
  onRefresh,
  isRefreshing,
  searchQuery,
  onSearchChange
}) => {
  return (
    <>
      {/* 1. Persistent Top Demo Notice Banner */}
      <div 
        id="top-demo-banner" 
        className="fixed top-0 left-0 right-0 h-7 bg-amber-50 border-b border-amber-200/80 z-50 flex items-center justify-center px-4"
      >
        <div className="flex items-center gap-2 text-amber-900 font-mono text-[0.6875rem] tracking-wider uppercase font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse"></span>
          <span>Demo Environment — Synthetic, Non-Operational Data Only</span>
          <span className="text-amber-600/70 hidden sm:inline">•</span>
          <span className="text-amber-700 hidden sm:inline">No Live Weapons or Classified Networks</span>
        </div>
      </div>

      {/* 2. Fixed Application Header */}
      <header className="fixed top-7 left-0 right-0 h-16 bg-white/95 backdrop-blur-md z-40 border-b border-slate-200/80 shadow-[0_1px_8px_rgba(0,0,0,0.03)]">
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
                SYNTHETIC DEMO ENV • NON-OPERATIONAL
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

            {/* Live Active Pill */}
            <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-full">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="font-mono text-[0.6875rem] font-semibold text-emerald-700 uppercase tracking-wide">
                Enforcement Active
              </span>
            </div>

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

            {/* User Profile Pill */}
            <div className="flex items-center gap-2.5 pl-2 border-l border-slate-200">
              <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white flex items-center justify-center font-semibold text-xs ring-1 ring-slate-200 shadow-sm">
                EV
              </div>
              <div className="hidden lg:flex flex-col text-left">
                <span className="text-xs font-semibold text-slate-900 leading-tight">
                  Elena Vance
                </span>
                <span className="text-[0.6875rem] text-slate-500 leading-tight">
                  Delegated Reviewer (L3)
                </span>
              </div>
            </div>

          </div>
        </div>
      </header>
    </>
  );
};
