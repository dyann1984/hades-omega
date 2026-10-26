import { motion, AnimatePresence } from 'framer-motion';
import { useHadesStore } from '../store.js';
import type { AgentState, AgentStatus } from '../types.js';

const STATUS_CONFIG: Record<AgentStatus, { label: string; cls: string }> = {
  IDLE:      { label: 'IDLE',      cls: 'text-gray-500 border-gray-700 bg-gray-800/30' },
  THINKING:  { label: 'THINKING',  cls: 'text-indigo-400 border-indigo-400/30 bg-indigo-900/20' },
  EXECUTING: { label: 'EXEC',      cls: 'text-electric-400 border-electric-400/40 bg-electric-400/8' },
  WAITING:   { label: 'WAITING',   cls: 'text-golden-400 border-golden-400/40 bg-golden-900/20' },
  ERROR:     { label: 'ERROR',     cls: 'text-ruby-400 border-ruby-400/40 bg-ruby-900/20' },
  COMPLETED: { label: 'DONE',      cls: 'text-emerald-400 border-emerald-400/40 bg-emerald-900/10' },
  SUSPENDED: { label: 'SUSP',      cls: 'text-orange-400 border-orange-400/30 bg-orange-900/10' },
};

const AGENT_ACCENT: Record<string, string> = {
  HADES:      'border-l-golden-400/40',
  CHARON:     'border-l-electric-400/40',
  PERSEPHONE: 'border-l-emerald-400/40',
  MINOS:      'border-l-golden-400/40',
  ELYSIUM:    'border-l-electric-400/30',
  TARTARUS:   'border-l-ruby-400/30',
};

function AgentRow({ agent }: { agent: AgentState }) {
  const cfg = STATUS_CONFIG[agent.status] ?? STATUS_CONFIG.IDLE;
  const accent = AGENT_ACCENT[agent.name] ?? 'border-l-gray-600/30';
  const isActive = agent.status !== 'IDLE' && agent.status !== 'COMPLETED';

  return (
    <motion.div
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`border-l-2 ${accent} pl-2 py-1.5 pr-2 rounded-r-lg border border-l-0 border-white/4 hover:border-white/8 transition-colors`}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm shrink-0 w-5 text-center">{agent.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold font-mono text-gray-200">{agent.name}</span>
            {isActive && <div className="w-1.5 h-1.5 rounded-full bg-electric-400 animate-pulse shrink-0" />}
          </div>
          <div className="text-[8px] text-gray-600">{agent.role}</div>
        </div>
        <div className="flex flex-col items-end gap-0.5 shrink-0">
          <span className={`text-[7px] font-bold font-mono px-1 py-0.5 rounded border uppercase ${cfg.cls}`}>
            {cfg.label}
          </span>
          <span className="text-[7px] text-gray-600 font-mono">{agent.processedTasks}t</span>
        </div>
      </div>
      <AnimatePresence>
        {agent.currentTask && isActive && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="text-[8px] text-gray-500 truncate mt-1 font-mono leading-relaxed"
          >
            {agent.currentTask}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function AgentGrid() {
  const agents = useHadesStore(s => s.agents);
  const activeCount = agents.filter(a => a.status !== 'IDLE').length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Agent Network</span>
        <span className="text-[9px] font-mono">
          <span className="text-electric-400">{activeCount}</span>
          <span className="text-gray-600">/{agents.length || 6}</span>
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <AnimatePresence initial={false}>
          {agents.length === 0 ? (
            <div className="py-6 text-center text-[10px] text-gray-600 font-mono">
              Connecting to agent network…
            </div>
          ) : (
            agents.map(a => <AgentRow key={a.name} agent={a} />)
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
