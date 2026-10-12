import React, { useState } from 'react';
import type { Task, Agent } from '../types';
import { parseJsonSafe, formatSafeTime, formatSafeDateTime } from '../utils';

interface TasksViewProps {
  tasks: Task[];
  agents: Agent[];
  onRefresh: () => void;
}

export const TasksView: React.FC<TasksViewProps> = ({
  tasks,
  agents,
  onRefresh
}) => {
  const [selectedTask, setSelectedTask] = useState<Task | null>(tasks[0] || null);
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('Analyze synthetic vibration telemetry');
  const [newTaskType, setNewTaskType] = useState('predictive_maintenance');
  const [newTaskDesc, setNewTaskDesc] = useState('Inspect sensor stream for bearing wear');
  const [newTaskAgent, setNewTaskAgent] = useState('agent-pred-maint-01');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const totalCount = tasks.length;
  const inProgressCount = tasks.filter(t => t.status === 'IN_PROGRESS' || t.status === 'QUEUED').length;
  const escalatedCount = tasks.filter(t => t.status === 'ESCALATED').length;
  const blockedCount = tasks.filter(t => t.status === 'BLOCKED' || t.status === 'FAILED').length;

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setActionMessage(null);
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTaskTitle,
          type_id: newTaskType,
          description: newTaskDesc,
          assigned_agent_id: newTaskAgent,
          priority: 'P2'
        })
      });
      const data = await parseJsonSafe(res);
      if (!res.ok) {
        throw new Error(data?.error || `Task submission failed (${res.status})`);
      }
      setActionMessage(`Task submitted: ${data?.id || 'Task created'}`);
      setIsCreatingTask(false);
      onRefresh();
    } catch (err: any) {
      setActionMessage(`Failed to create task: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col w-full space-y-6">
      
      {/* Page Title & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Execution Tasks &amp; Workflow Governance
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-3xl">
            Task orchestration across autonomous agents, human escalation boundaries, and policy checkpoints.
          </p>
        </div>
        <button
          onClick={() => setIsCreatingTask(!isCreatingTask)}
          className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors flex items-center gap-1.5 shadow-sm self-start md:self-auto"
        >
          <span className="material-symbols-outlined text-[1rem]">add_task</span>
          {isCreatingTask ? 'Cancel Task Intake' : 'New Intake Task'}
        </button>
      </div>

      {/* Summary Metrics Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
          <span className="text-xs text-slate-500 font-medium">Total Tasks</span>
          <div className="text-2xl font-bold text-slate-900 mt-2">{totalCount}</div>
          <span className="text-[0.6875rem] text-slate-500 mt-0.5 block">Received in intake</span>
        </div>
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
          <span className="text-xs text-indigo-700 font-medium">In Progress / Queued</span>
          <div className="text-2xl font-bold text-indigo-600 mt-2">{inProgressCount}</div>
          <span className="text-[0.6875rem] text-slate-500 mt-0.5 block">Active pipelines</span>
        </div>
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
          <span className="text-xs text-amber-800 font-medium">Escalated to Human</span>
          <div className="text-2xl font-bold text-amber-700 mt-2">{escalatedCount}</div>
          <span className="text-[0.6875rem] text-slate-500 mt-0.5 block">Clearance boundary hold</span>
        </div>
        <div className="p-4 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col justify-between">
          <span className="text-xs text-rose-700 font-medium">Blocked / Failed</span>
          <div className="text-2xl font-bold text-rose-600 mt-2">{blockedCount}</div>
          <span className="text-[0.6875rem] text-slate-500 mt-0.5 block">Halted by policy gate</span>
        </div>
      </div>

      {/* Task Intake Form (Collapsible) */}
      {isCreatingTask && (
        <form onSubmit={handleCreateTask} className="p-5 bg-white border border-slate-200 rounded-xl shadow-sm space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <h2 className="text-sm font-bold text-slate-900">Task Intake Registration</h2>
            <span className="font-mono text-xs text-slate-400">Deterministic Intake</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="font-semibold text-slate-700 block mb-1">Task Title:</label>
              <input 
                type="text" 
                value={newTaskTitle} 
                onChange={(e) => setNewTaskTitle(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                required
              />
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">Task Type:</label>
              <select 
                value={newTaskType} 
                onChange={(e) => setNewTaskType(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
              >
                <option value="predictive_maintenance">Predictive Maintenance</option>
                <option value="cybersecurity_monitoring">Cybersecurity Monitoring</option>
                <option value="decision_support">Decision Support</option>
                <option value="document_analysis">Document Analysis</option>
              </select>
            </div>

            <div>
              <label className="font-semibold text-slate-700 block mb-1">Assigned Agent:</label>
              <select 
                value={newTaskAgent} 
                onChange={(e) => setNewTaskAgent(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 font-mono"
              >
                {agents.map(a => (
                  <option key={a.id} value={a.id}>{a.id} ({a.name})</option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="font-semibold text-slate-700 block mb-1">Task Description:</label>
              <textarea 
                rows={2} 
                value={newTaskDesc} 
                onChange={(e) => setNewTaskDesc(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button 
              type="button" 
              onClick={() => setIsCreatingTask(false)}
              className="px-3 py-1.5 rounded-lg text-xs text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={isSubmitting}
              className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm"
            >
              {isSubmitting ? 'Registering...' : 'Submit to Intake'}
            </button>
          </div>
        </form>
      )}

      {/* Main Two-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: Task Registry Table (~58% / 7 cols) */}
        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
          <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <span className="font-mono text-xs font-bold text-slate-700 uppercase tracking-wide">
              Registered Tasks ({tasks.length})
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-200 text-slate-400 uppercase tracking-wider text-[0.625rem] font-semibold">
                  <th className="py-2.5 px-3">Task Title & ID</th>
                  <th className="py-2.5 px-3">Agent</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Created</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tasks.map((task) => {
                  const isSelected = selectedTask?.id === task.id;
                  return (
                    <tr 
                      key={task.id}
                      onClick={() => setSelectedTask(task)}
                      className={`hover:bg-slate-50/70 cursor-pointer transition-colors ${
                        isSelected ? 'bg-indigo-50/50' : ''
                      }`}
                    >
                      <td className="py-3 px-3">
                        <div className="font-bold text-slate-900">{task.title}</div>
                        <div className="font-mono text-[0.6875rem] text-slate-400">{task.id}</div>
                      </td>
                      <td className="py-3 px-3 font-mono text-slate-700 text-[0.6875rem]">
                        {task.assigned_agent_id || 'Unassigned'}
                      </td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded text-[0.625rem] font-mono font-bold uppercase ${
                          task.status === 'COMPLETED'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : task.status === 'ESCALATED'
                            ? 'bg-amber-100 text-amber-800 border border-amber-300'
                            : task.status === 'BLOCKED' || task.status === 'FAILED'
                            ? 'bg-rose-100 text-rose-800 border border-rose-300'
                            : 'bg-indigo-100 text-indigo-800 border border-indigo-300'
                        }`}>
                          {task.status}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-[0.6875rem] text-slate-400">
                        {formatSafeTime(task.created_at)}
                      </td>
                    </tr>
                  );
                })}

                {tasks.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-8 text-center text-slate-400">
                      No tasks in registry. Click "New Intake Task" to create one.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Column: Selected Task Details (~42% / 5 cols) */}
        {selectedTask ? (
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 shadow-sm space-y-4">
            
            <div className="pb-3 border-b border-slate-200">
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                  {selectedTask.id}
                </span>
                <span className="font-mono text-[0.625rem] font-bold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                  {selectedTask.status}
                </span>
              </div>
              <h2 className="text-base font-bold text-slate-900 tracking-tight mt-1">
                {selectedTask.title}
              </h2>
            </div>

            <div>
              <span className="text-[0.625rem] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Task Specification & Description
              </span>
              <p className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-200 leading-relaxed">
                {selectedTask.description || 'Automated synthetic intelligence task dispatch.'}
              </p>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Assigned Agent:</span>
                <span className="font-mono font-bold text-indigo-700">{selectedTask.assigned_agent_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Task Type:</span>
                <span className="font-mono text-slate-800">{selectedTask.type_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Created At:</span>
                <span className="font-mono text-slate-600">{formatSafeDateTime(selectedTask.created_at)}</span>
              </div>
            </div>

            {actionMessage && (
              <div className="p-2.5 bg-indigo-50 border border-indigo-200 text-indigo-900 text-xs font-mono rounded">
                {actionMessage}
              </div>
            )}

          </div>
        ) : (
          <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-400 text-xs">
            Select a task to inspect details and execution history.
          </div>
        )}

      </div>

    </div>
  );
};
