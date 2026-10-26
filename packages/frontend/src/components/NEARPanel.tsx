import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useHadesStore } from '../store.js';
import type { AuditRecord, BudgetState } from '../types.js';

export function NEARPanel() {
  const { nearStatus, auditRecords } = useHadesStore(s => ({
    nearStatus: s.nearStatus,
    auditRecords: s.auditRecords,
  }));

  const [budget, setBudget] = useState<BudgetState[]>([]);

  useEffect(() => {
    fetch('/api/budget')
      .then(r => r.json() as Promise<BudgetState[]>)
      .then(setBudget)
      .catch(() => {});
  }, [auditRecords.length]);

  const nearTxs = auditRecords.filter(r => r.nearTxHash);
  const latestTx = nearTxs[0];

  return (
    <div className="shrink-0 glass-card rounded-xl border border-golden-400/15 p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">NEAR Testnet</div>
        {nearStatus && (
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${nearStatus.connected ? 'bg-emerald-400 animate-pulse' : 'bg-ruby-400'}`} />
            <span className="text-[9px] font-mono text-golden-400 uppercase">{nearStatus.mode}</span>
            <span className="text-[9px] text-gray-600">·</span>
            <span className="text-[9px] text-gray-400 font-mono">{nearStatus.network}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* Left: NEAR stats */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-[9px] font-mono">
            <span className="text-gray-500">Transactions</span>
            <span className="text-golden-400 font-bold">{nearTxs.length}</span>
          </div>
          <div className="flex items-center justify-between text-[9px] font-mono">
            <span className="text-gray-500">Contract</span>
            <span className="text-gray-400 truncate ml-2">{nearStatus?.contractId?.slice(0, 20) ?? '—'}…</span>
          </div>
          <div className="flex items-center justify-between text-[9px] font-mono">
            <span className="text-gray-500">Account</span>
            <span className="text-gray-400 truncate ml-2">{nearStatus?.accountId?.slice(0, 20) ?? '—'}…</span>
          </div>

          {/* Latest tx */}
          <AnimatePresence>
            {latestTx && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="pt-1.5 border-t border-golden-400/10"
              >
                <div className="text-[8px] text-gray-500 font-mono uppercase mb-0.5">Latest Tx</div>
                <a
                  href={latestTx.nearExplorerUrl ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[8px] text-golden-400 hover:text-golden-300 font-mono underline break-all block"
                >
                  {latestTx.nearTxHash?.slice(0, 20)}…
                </a>
                <div className="text-[8px] text-gray-600 font-mono mt-0.5">{latestTx.agentName} · {latestTx.decision}</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Right: Budget gauges */}
        <div className="space-y-2">
          {budget.length > 0 ? (
            budget.map(b => (
              <BudgetGauge key={b.category} budget={b} />
            ))
          ) : (
            <div className="text-[9px] text-gray-600 font-mono pt-1">Loading budgets…</div>
          )}
        </div>
      </div>
    </div>
  );
}

function BudgetGauge({ budget }: { budget: BudgetState }) {
  const pct = Math.min(budget.utilizationPercent, 100);
  const color = pct > 90 ? '#FF4D6D' : pct > 80 ? '#FFD700' : '#00FF88';

  return (
    <div>
      <div className="flex items-center justify-between text-[8px] font-mono mb-0.5">
        <span className="text-gray-500">{budget.category.slice(0, 12)}</span>
        <span style={{ color }}>{pct.toFixed(0)}%</span>
      </div>
      <div className="w-full h-1 bg-obsidian-700 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1, ease: 'easeOut' }}
          style={{ background: color, boxShadow: `0 0 6px ${color}88` }}
        />
      </div>
      <div className="text-[7px] text-gray-600 font-mono mt-0.5">
        {budget.committed.toLocaleString()} / {budget.total.toLocaleString()} {budget.currency}
      </div>
    </div>
  );
}
