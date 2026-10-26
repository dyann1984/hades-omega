import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useHadesStore } from '../store.js';
import type { AgentState, AgentStatus, Mission } from '../types.js';

const STATUS_GLOW: Record<AgentStatus, string> = {
  IDLE:      '#252538',
  THINKING:  '#818CF8',
  EXECUTING: '#00D4FF',
  WAITING:   '#FFD700',
  ERROR:     '#FF4D6D',
  COMPLETED: '#00FF88',
  SUSPENDED: '#FF9F43',
};

function AgentNode({ agent, index, total }: { agent: AgentState; index: number; total: number }) {
  const angle = (index / total) * 360;
  const color = STATUS_GLOW[agent.status] ?? '#252538';
  const isActive = agent.status !== 'IDLE';

  return (
    <div
      className={`orbit-node-${index + 1}`}
      style={{ position: 'absolute', top: '50%', left: '50%', marginTop: '-14px', marginLeft: '-14px' }}
    >
      <motion.div
        animate={isActive ? { scale: [1, 1.15, 1], boxShadow: [`0 0 8px ${color}44`, `0 0 20px ${color}88`, `0 0 8px ${color}44`] } : {}}
        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        style={{ border: `1px solid ${color}88`, boxShadow: `0 0 8px ${color}44` }}
        className="w-7 h-7 rounded-full bg-obsidian-800 flex items-center justify-center text-sm relative"
        title={`${agent.name}: ${agent.status}`}
      >
        <span style={{ fontSize: '14px', lineHeight: 1 }}>{agent.icon}</span>
        {isActive && (
          <motion.div
            className="absolute inset-0 rounded-full border"
            style={{ borderColor: color + '44' }}
            animate={{ scale: [1, 1.6, 1.6], opacity: [0.8, 0, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        )}
      </motion.div>
    </div>
  );
}

function MissionStatus({ mission }: { mission: Mission }) {
  const colors: Record<Mission['status'], string> = {
    RECEIVED:        'text-gray-400',
    ANALYZING:       'text-indigo-400',
    PLANNED:         'text-electric-400',
    IN_PROGRESS:     'text-electric-400',
    COMPLETED:       'text-emerald-400',
    PARTIAL_COMPLETE:'text-golden-400',
    FAILED:          'text-ruby-400',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="glass-card rounded-xl p-3 border border-electric-400/20"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] text-gray-500 uppercase tracking-widest font-mono">Active Mission</span>
        <span className={`text-[9px] font-bold font-mono uppercase ${colors[mission.status] ?? 'text-gray-400'}`}>
          {mission.status.replace('_', ' ')}
        </span>
      </div>
      <p className="text-xs text-gray-300 leading-relaxed">{mission.text}</p>

      {mission.tasks.length > 0 && (
        <div className="mt-2 flex gap-1 flex-wrap">
          {mission.tasks.map(t => {
            const tc: Record<string, string> = {
              EXECUTED: 'bg-emerald-900/60 text-emerald-400 border-emerald-400/30',
              FAILED:   'bg-ruby-900/60 text-ruby-400 border-ruby-400/30',
              IN_PROGRESS: 'bg-electric-900/60 text-electric-400 border-electric-400/30 animate-pulse',
              AWAITING_HUMAN: 'bg-golden-900/60 text-golden-400 border-golden-400/30',
            };
            return (
              <span key={t.id} className={`text-[8px] font-mono px-1.5 py-0.5 rounded border ${tc[t.status] ?? 'bg-gray-800/60 text-gray-400 border-gray-600/30'}`}>
                {t.assignedTo}
              </span>
            );
          })}
        </div>
      )}

      {mission.report && (
        <div className="mt-2 pt-2 border-t border-white/5 text-[9px] text-gray-500 font-mono grid grid-cols-2 gap-1">
          <span>Audit Records: <span className="text-electric-400">{mission.report.totalAuditRecords}</span></span>
          <span>NEAR Txs: <span className="text-golden-400">{mission.report.nearTransactions}</span></span>
        </div>
      )}
    </motion.div>
  );
}

export function HolographicCore() {
  const { agents, activeMission, missions } = useHadesStore(s => ({
    agents: s.agents,
    activeMission: s.activeMission,
    missions: s.missions,
  }));

  const activeAgents = agents.filter(a => a.status !== 'IDLE').length;
  const totalCompleted = missions.filter(m => m.status === 'COMPLETED').length;

  return (
    <div className="flex-1 glass-card rounded-xl overflow-hidden flex flex-col border border-electric-400/15 min-h-0">
      {/* Header */}
      <div className="px-4 py-2 border-b border-electric-400/10 flex items-center justify-between shrink-0">
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">Intelligence Core</div>
        <div className="flex items-center gap-3 text-[9px] font-mono">
          <span className="text-electric-400">{activeAgents} active</span>
          <span className="text-gray-600">|</span>
          <span className="text-emerald-400">{totalCompleted} completed</span>
        </div>
      </div>

      {/* Core visualization */}
      <div className="flex-1 flex items-center justify-center relative overflow-hidden min-h-0 p-4">
        {/* Background rings */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="absolute w-72 h-72 rounded-full border border-electric-400/5 animate-spin-slow" />
          <div className="absolute w-56 h-56 rounded-full border border-electric-400/8 animate-spin-reverse" />
          <div className="absolute w-40 h-40 rounded-full border border-electric-400/12" />
          {/* Dashed outer ring */}
          <svg className="absolute w-72 h-72 animate-spin-slow" viewBox="0 0 288 288">
            <circle cx="144" cy="144" r="140" fill="none" stroke="#00D4FF" strokeWidth="0.5" strokeDasharray="4 8" opacity="0.3" />
          </svg>
        </div>

        {/* Orbital agent nodes */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {agents.map((agent, i) => (
            <AgentNode key={agent.name} agent={agent} index={i} total={agents.length || 6} />
          ))}
        </div>

        {/* Central core */}
        <div className="relative z-10 flex flex-col items-center justify-center">
          {/* Outer glow rings */}
          <motion.div
            className="absolute w-28 h-28 rounded-full border border-electric-400/20"
            animate={{ scale: [1, 1.1, 1], opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute w-20 h-20 rounded-full border border-electric-400/30"
            animate={{ scale: [1, 1.08, 1], opacity: [0.4, 0.8, 0.4] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut', delay: 0.5 }}
          />

          {/* Core body */}
          <motion.div
            animate={{ scale: [1, 1.04, 1] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
            style={{
              boxShadow: `0 0 30px #00D4FF44, 0 0 60px #00D4FF22, inset 0 0 30px #00D4FF11`,
              background: 'radial-gradient(circle, #00D4FF18 0%, #0A0A1A 70%)',
            }}
            className="w-16 h-16 rounded-full border border-electric-400/60 flex items-center justify-center relative"
          >
            <span className="text-2xl select-none">𝚯</span>
            {/* Inner spinning ring */}
            <motion.div
              className="absolute inset-0 rounded-full border border-electric-400/30"
              style={{ borderTopColor: '#00D4FF88', borderRightColor: 'transparent' }}
              animate={{ rotate: 360 }}
              transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
            />
          </motion.div>

          {/* Label */}
          <div className="mt-3 text-center">
            <div className="text-[9px] font-bold tracking-[0.4em] text-electric-400 text-glow-electric">HADES</div>
            <div className="text-[7px] text-gray-600 tracking-wider uppercase">Central Intelligence</div>
          </div>
        </div>

        {/* Connection lines SVG */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ opacity: 0.15 }}>
          <defs>
            <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#00D4FF" stopOpacity="0" />
              <stop offset="50%" stopColor="#00D4FF" stopOpacity="0.6" />
              <stop offset="100%" stopColor="#00D4FF" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {/* Mission status bar */}
      <div className="px-4 pb-3 shrink-0">
        <AnimatePresence mode="wait">
          {activeMission ? (
            <MissionStatus key={activeMission.id} mission={activeMission} />
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-3 text-[10px] text-gray-600 font-mono tracking-wider"
            >
              Awaiting mission directive…
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
