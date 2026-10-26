import { useHadesStore } from '../store.js';

export function TopBar() {
  const { connected, nearStatus, missions } = useHadesStore(s => ({
    connected: s.connected,
    nearStatus: s.nearStatus,
    missions: s.missions,
  }));

  const active = missions.filter(m => m.status !== 'COMPLETED' && m.status !== 'FAILED').length;

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-electric-400/15 bg-obsidian-950/80 backdrop-blur-sm z-10 shrink-0">
      {/* Logo */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="text-2xl">𝚯</div>
          <div className="absolute inset-0 blur-md text-2xl text-electric-400 opacity-60">𝚯</div>
        </div>
        <div>
          <div className="text-sm font-bold tracking-[0.3em] text-electric-400 text-glow-electric">HADES OMEGA</div>
          <div className="text-[10px] text-gray-500 tracking-widest uppercase">Enterprise AI Agent OS</div>
        </div>
      </div>

      {/* Center stats */}
      <div className="flex items-center gap-6 text-xs">
        <Stat label="Active Missions" value={active} color="electric" />
        <Stat label="Completed" value={missions.filter(m => m.status === 'COMPLETED').length} color="emerald" />
        <Stat label="Network" value={nearStatus?.network?.toUpperCase() ?? '—'} color="golden" />
      </div>

      {/* Connection status */}
      <div className="flex items-center gap-3 text-xs">
        {nearStatus && (
          <div className="flex items-center gap-1.5 px-2 py-1 rounded near-badge">
            <div className="text-electric-400 font-mono text-[10px]">NEAR</div>
            <div className={`w-1.5 h-1.5 rounded-full ${nearStatus.connected ? 'bg-emerald-400' : 'bg-ruby-400'}`} />
            <span className="text-golden-400 uppercase text-[10px]">{nearStatus.mode}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5">
          <div className={`w-2 h-2 rounded-full transition-colors ${connected ? 'bg-emerald-400 shadow-emerald' : 'bg-ruby-400'}`} />
          <span className={`font-mono text-[10px] uppercase ${connected ? 'text-emerald-400' : 'text-ruby-400'}`}>
            {connected ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number | string; color: 'electric' | 'golden' | 'emerald' }) {
  const cls = {
    electric: 'text-electric-400',
    golden: 'text-golden-400',
    emerald: 'text-emerald-400',
  }[color];

  return (
    <div className="text-center">
      <div className={`text-base font-bold font-mono ${cls}`}>{value}</div>
      <div className="text-gray-500 text-[9px] uppercase tracking-wider">{label}</div>
    </div>
  );
}
