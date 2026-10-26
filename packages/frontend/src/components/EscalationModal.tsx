import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useHadesStore } from '../store.js';
import type { EscalationRequest } from '../types.js';

function EscalationCard({ escalation, onResolve }: { escalation: EscalationRequest; onResolve: (id: string, approved: boolean) => void }) {
  const [loading, setLoading] = useState(false);

  async function decide(approved: boolean) {
    setLoading(true);
    try {
      await fetch(`/api/escalations/${escalation.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved }),
      });
      onResolve(escalation.id, approved);
    } catch {
      setLoading(false);
    }
  }

  const timeLeft = Math.max(0, Math.floor((escalation.createdAt + escalation.timeout - Date.now()) / 1000));

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="bg-obsidian-700 border border-golden-400/40 rounded-xl p-5 shadow-golden max-w-lg w-full"
      style={{ boxShadow: '0 0 40px #FFD70022, 0 0 80px #FFD70011' }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="text-2xl">⚖️</div>
        <div>
          <div className="text-xs font-bold tracking-widest text-golden-400 font-mono uppercase">MINOS — Human Review Required</div>
          <div className="text-[10px] text-gray-500 font-mono">Escalation ID: {escalation.id.slice(0, 8)}</div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-[9px] text-gray-500 font-mono">Timeout</div>
          <div className="text-xs text-golden-400 font-mono font-bold">{Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}</div>
        </div>
      </div>

      {/* Details */}
      <div className="space-y-2 mb-5">
        <div className="glass-card rounded-lg p-3 border border-golden-400/15">
          <div className="text-[9px] text-gray-500 uppercase tracking-wider font-mono mb-1">Operation</div>
          <div className="text-xs font-bold text-electric-400 font-mono">{escalation.operationType}</div>
          <p className="text-[10px] text-gray-300 mt-1 leading-relaxed">{escalation.description}</p>
        </div>

        {escalation.amount && (
          <div className="glass-card rounded-lg p-3 border border-golden-400/15">
            <div className="text-[9px] text-gray-500 uppercase tracking-wider font-mono mb-1">Amount</div>
            <div className="text-base font-bold text-golden-400 font-mono">
              {escalation.amount.toLocaleString()} <span className="text-xs">{escalation.currency ?? 'MXN'}</span>
            </div>
          </div>
        )}

        <div className="glass-card rounded-lg p-3 border border-golden-400/15">
          <div className="text-[9px] text-gray-500 uppercase tracking-wider font-mono mb-1">Escalation Reason</div>
          <p className="text-[10px] text-golden-300 leading-relaxed">{escalation.reason}</p>
        </div>

        <div className="text-[9px] text-gray-600 font-mono">
          Requested by: <span className="text-gray-400">{escalation.agentName}</span> ·
          Mission: <span className="text-gray-400">{escalation.missionId.slice(0, 8)}</span>
        </div>
      </div>

      {/* Decision buttons */}
      <div className="flex gap-3">
        <button
          onClick={() => decide(false)}
          disabled={loading}
          className="flex-1 py-2.5 rounded-lg border border-ruby-400/40 text-ruby-400 text-xs font-bold font-mono uppercase tracking-wider
            hover:bg-ruby-400/10 hover:border-ruby-400/70 transition-all disabled:opacity-30"
        >
          ✗ Reject
        </button>
        <button
          onClick={() => decide(true)}
          disabled={loading}
          className="flex-2 flex-[2] py-2.5 rounded-lg border border-emerald-400/40 bg-emerald-400/10 text-emerald-400 text-xs font-bold font-mono uppercase tracking-wider
            hover:bg-emerald-400/20 hover:border-emerald-400/70 transition-all disabled:opacity-30"
          style={{ boxShadow: loading ? 'none' : '0 0 10px #00FF8822' }}
        >
          {loading ? '⚙ Processing…' : '✓ Approve — Record on NEAR'}
        </button>
      </div>
    </motion.div>
  );
}

export function EscalationModal() {
  const { escalations, dismissEscalation } = useHadesStore(s => ({
    escalations: s.escalations,
    dismissEscalation: s.dismissEscalation,
  }));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0, 0, 0, 0.75)', backdropFilter: 'blur(8px)' }}
    >
      <div className="flex flex-col gap-3 max-h-full overflow-y-auto">
        <AnimatePresence>
          {escalations.map(e => (
            <EscalationCard
              key={e.id}
              escalation={e}
              onResolve={(id) => dismissEscalation(id)}
            />
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
