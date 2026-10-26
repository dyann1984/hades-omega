import { motion, AnimatePresence } from 'framer-motion';
import { useHadesStore } from '../store.js';
import type { AgentState, AgentStatus } from '../types.js';

const STATUS_CONFIG: Record<AgentStatus, { label: string; dot: string; text: string; bg: string }> = {
  IDLE:      { label: 'IDLE',      dot: 'bg-gray-600',    text: 'text-gray-400',   bg: 'bg-gray-800/30' },
  THINKING:  { label: 'THINKING',  dot: 'bg-indigo-400',  text: 'text-indigo-400', bg: 'bg-indigo-900/20' },
  EXECUTING: { label: 'EXECUTING', dot: 'bg-electric-400 animate-pulse', text: 'text-electric-400', bg: 'bg-electric-900/20' },
  WAITING:   { label: 'WAITING',   dot: 'bg-golden-400',  text: 'text-golden-400', bg: 'bg-golden-900/20' },
  ERROR:     { label: 'ERROR',     dot: 'bg-ruby-400',    text: 'text-ruby-400',   bg: 'bg-ruby-900/20' },
  COMPLETED: { label: 'COMPLETED', dot: 'bg-emerald-400', text: 'text-emerald-400', bg: 'bg-emerald-900/10' },
  SUSPENDED: { label: 'SUSPENDED', dot: 'bg-orange-400',  text: 'text-orange-400', bg: 'bg-orange-900/10' },
};

const AGENT_COLORS: Record<string, string> = {
  HADES:      'border-golden-400/30 hover:border-golden-400/60',
  CHARON:     'border-electric-400/30 hover:border-electric-400/60',
  PERSEPHONE: 'border-emerald-400/30 hover:border-emerald-400/60',
  MINOS:      'border-golden-400/30 hover:border-golden-400/60',
  ELYSIUM:    'border-electric-400/30 hover:border-electric-400/60',
  TARTARUS:   'border-ruby-400/30 hover:border-ruby-400/60',
};

function AgentCard({ agent }: { agent: AgentState }) {
  const cfg = STATUS_CONFIG[agent.status] ?? STATUS_CONFIG.IDLE;
  const border = AGENT_COLORS[agent.name] ?? 'border-electric-400/20';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`glass-card rounded-lg p-2.5 border transition-all cursor-default select-none ${border}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base shrink-0">{agent.icon}</span>
          <div className="min-w-0">
            <div className="text-[11px] font-bold tracking-widest text-gray-200 font-mono">{agent.name}</div>
            <div className="text-[9px] text-gray-500 truncate">{agent.role}</div>
          </div>
        </div>
        <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-mono uppercase shrink-0 ${cfg.bg}`}>
          <div className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
          <span className={cfg.text}>{cfg.label}</span>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {agent.currentTask && agent.status !== 'IDLE' && (
          <motion.div
            key={agent.currentTask}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-1.5 pt-1.5 border-t border-white/5"
          >
            <p className="text-[9px] text-gray-400 truncate font-mono leading-relaxed">{agent.currentTask}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex items-center justify-between mt-1.5 text-[9px] text-gray-600">
        <span className="font-mono">{agent.processedTasks} tasks</span>
        <span>{new Date(agent.lastActivity).toLocaleTimeString()}</span>
      </div>
    </motion.div>
  );
}

export function AgentGrid() {
  const agents = useHadesStore(s => s.agents);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-0.5">
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Agent Network</div>
        <div className="text-[9px] text-electric-400 font-mono">{agents.length}/6</div>
      </div>
      <AnimatePresence>
        {agents.length === 0 ? (
          <div className="text-center py-8 text-gray-600 text-xs">
            <div className="text-2xl mb-2">⚡</div>
            Connecting to backend…
          </div>
        ) : (
          agents.map(a => <AgentCard key={a.name} agent={a} />)
        )}
      </AnimatePresence>
    </div>
  );
}
