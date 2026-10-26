import { useHadesStore } from '../store.js';

export function TopBar() {
  const { connected, nearStatus, missions, escalations } = useHadesStore(s => ({
    connected: s.connected,
    nearStatus: s.nearStatus,
    missions: s.missions,
    escalations: s.escalations,
  }));

  const active = missions.filter(m => m.status !== 'COMPLETED' && m.status !== 'FAILED').length;
  const pendingEscalations = escalations.length;

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
        {/* MINOS escalations badge */}
        <div className="text-center relative">
          <div className="relative inline-flex items-center justify-center">
            <div className={`text-base font-bold font-mono ${pendingEscalations > 0 ? 'text-ruby-400' : 'text-gray-600'}`}>
              {pendingEscalations}
            </div>
            {pendingEscalations > 0 && (
              <span className="absolute -top-1 -right-2 w-1.5 h-1.5 rounded-full bg-ruby-400 animate-ping" />
            )}
          </div>
          <div className="text-gray-500 text-[9px] uppercase tracking-wider">Pending Approvals</div>
        </div>
        <Stat label="Network" value={nearStatus?.network?.toUpperCase() ?? '—'} color="golden" />
      </div>

      {/* Right: NEAR mode + connection */}
      <div className="flex items-center gap-3 text-xs">
        {nearStatus && (
          <NEARModeBadge mode={nearStatus.mode} connected={nearStatus.connected} network={nearStatus.network} />
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

function NEARModeBadge({ mode, connected, network }: { mode: string; connected: boolean; network: string }) {
  const isReal = mode === 'real';
  return (
    <div className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[9px] font-mono ${
      isReal
        ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-400'
        : 'border-golden-400/30 bg-golden-400/8 text-golden-400'
    }`}>
      <span className="font-bold">NEAR</span>
      <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-current animate-pulse' : 'bg-ruby-400'}`} />
      <span className="uppercase tracking-wide">{isReal ? '◆ ON-CHAIN' : '◇ SIM'}</span>
      <span className="text-gray-500">·</span>
      <span className="text-gray-400">{network}</span>
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
