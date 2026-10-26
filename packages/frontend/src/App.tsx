import { useWebSocket } from './ws.js';
import { useHadesStore } from './store.js';
import { TopBar } from './components/TopBar.js';
import { AgentGrid } from './components/AgentGrid.js';
import { HolographicCore } from './components/HolographicCore.js';
import { MissionControl } from './components/MissionControl.js';
import { AuditLog } from './components/AuditLog.js';
import { NEARPanel } from './components/NEARPanel.js';
import { LogStream } from './components/LogStream.js';
import { EscalationModal } from './components/EscalationModal.js';

export default function App() {
  useWebSocket();
  const escalations = useHadesStore(s => s.escalations);

  return (
    <div className="h-screen flex flex-col bg-obsidian-900 holo-grid overflow-hidden relative">
      {/* Scan line overlay */}
      <div className="scanline" />

      {/* Top navigation bar */}
      <TopBar />

      {/* Main layout — three columns */}
      <div className="flex flex-1 gap-0 min-h-0 overflow-hidden">

        {/* Left column — Agents + Mission Control */}
        <div className="w-72 flex flex-col gap-2 p-2 border-r border-electric-400/10 overflow-y-auto">
          <AgentGrid />
          <MissionControl />
        </div>

        {/* Center column — Holographic Core + NEAR */}
        <div className="flex-1 flex flex-col gap-2 p-2 overflow-hidden">
          <HolographicCore />
          <NEARPanel />
        </div>

        {/* Right column — Audit Log + Log Stream */}
        <div className="w-80 flex flex-col gap-2 p-2 border-l border-electric-400/10 overflow-hidden">
          <AuditLog />
          <LogStream />
        </div>
      </div>

      {/* Escalation modal — overlays everything */}
      {escalations.length > 0 && <EscalationModal />}
    </div>
  );
}
