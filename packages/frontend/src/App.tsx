import { useState } from 'react';
import { useWebSocket } from './ws.js';
import { useHadesStore } from './store.js';
import { TopBar } from './components/TopBar.js';
import { AgentGrid } from './components/AgentGrid.js';
import { MissionPipeline } from './components/MissionPipeline.js';
import { MissionControl } from './components/MissionControl.js';
import { AuditLog } from './components/AuditLog.js';
import { NEARPanel } from './components/NEARPanel.js';
import { LogStream } from './components/LogStream.js';
import { EscalationModal } from './components/EscalationModal.js';

type Tab = 'overview' | 'mission' | 'audit' | 'logs';

function TabBar({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'overview', label: 'Overview', icon: '⚡' },
    { id: 'mission',  label: 'Mission',  icon: '🎯' },
    { id: 'audit',    label: 'Audit',    icon: '📋' },
    { id: 'logs',     label: 'Logs',     icon: '📡' },
  ];
  return (
    <div className="bottom-tab-bar flex border-t border-white/8 bg-obsidian-950 shrink-0">
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 text-[9px] font-mono uppercase tracking-wider transition-colors
            ${active === t.id ? 'text-electric-400 border-t border-electric-400' : 'text-gray-600 hover:text-gray-400'}`}
        >
          <span className="text-sm leading-none">{t.icon}</span>
          <span>{t.label}</span>
        </button>
      ))}
    </div>
  );
}

export default function App() {
  useWebSocket();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const escalations = useHadesStore(s => s.escalations);

  return (
    <div className="h-dvh flex flex-col bg-obsidian-900 overflow-hidden">
      <TopBar />

      {/* ── Desktop layout (md+) ── */}
      <div className="hidden md:flex flex-1 min-h-0 overflow-hidden">
        {/* Left column */}
        <div className="w-64 flex flex-col gap-3 p-3 border-r border-white/5 overflow-y-auto shrink-0">
          <AgentGrid />
          <div className="border-t border-white/5 pt-3">
            <MissionControl />
          </div>
        </div>

        {/* Center column */}
        <div className="flex-1 flex flex-col gap-3 p-3 overflow-hidden min-w-0">
          <MissionPipeline />
          <NEARPanel />
        </div>

        {/* Right column */}
        <div className="w-72 flex flex-col gap-3 p-3 border-l border-white/5 overflow-hidden shrink-0">
          <div className="flex-1 overflow-hidden flex flex-col">
            <AuditLog />
          </div>
          <div className="shrink-0">
            <LogStream />
          </div>
        </div>
      </div>

      {/* ── Mobile layout (<md) ── */}
      <div className="md:hidden flex-1 overflow-y-auto min-h-0">
        {activeTab === 'overview' && (
          <div className="p-3 flex flex-col gap-3">
            <AgentGrid />
            <MissionPipeline />
          </div>
        )}
        {activeTab === 'mission' && (
          <div className="p-3">
            <MissionControl />
          </div>
        )}
        {activeTab === 'audit' && (
          <div className="p-3 flex flex-col gap-3">
            <AuditLog />
            <NEARPanel />
          </div>
        )}
        {activeTab === 'logs' && (
          <div className="p-3">
            <LogStream />
          </div>
        )}
      </div>

      {/* Mobile tab bar */}
      <div className="md:hidden">
        <TabBar active={activeTab} onChange={setActiveTab} />
      </div>

      {/* Escalation modal — overlays everything */}
      {escalations.length > 0 && <EscalationModal />}
    </div>
  );
}
