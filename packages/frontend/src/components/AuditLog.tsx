import { motion, AnimatePresence } from 'framer-motion';
import { useHadesStore } from '../store.js';
import type { AuditRecord } from '../types.js';

function NEARModeBadge({ mode, txHash, explorerUrl }: { mode: string; txHash: string; explorerUrl?: string }) {
  const isReal = mode === 'real';
  return (
    <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
      {/* Mode badge — prominent distinction */}
      <span
        className={`text-[7px] font-bold font-mono px-1.5 py-0.5 rounded uppercase tracking-widest border ${
          isReal
            ? 'bg-emerald-400/15 border-emerald-400/40 text-emerald-400'
            : 'bg-golden-400/10 border-golden-400/30 text-golden-500'
        }`}
      >
        {isReal ? '◆ ON-CHAIN' : '◇ SIMULATED'}
      </span>
      {/* Hash link */}
      {txHash && (
        <a
          href={explorerUrl ?? '#'}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[8px] text-golden-400/70 hover:text-golden-300 font-mono underline underline-offset-2 truncate max-w-[120px]"
          title={txHash}
        >
          {txHash.slice(0, 12)}…
        </a>
      )}
    </div>
  );
}

function AuditRow({ record }: { record: AuditRecord }) {
  const cls = {
    PERMIT:   { badge: 'decision-permit',   icon: '✓' },
    DENY:     { badge: 'decision-deny',     icon: '✗' },
    ESCALATE: { badge: 'decision-escalate', icon: '⬆' },
  }[record.decision] ?? { badge: 'border border-gray-600', icon: '?' };

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      className="glass-card rounded-lg p-2.5 border border-white/5 hover:border-electric-400/20 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-[10px] font-bold text-gray-300 font-mono">{record.agentName}</span>
            <span className="text-gray-600 text-[9px]">›</span>
            <span className="text-[9px] text-gray-400 font-mono truncate">{record.operationType}</span>
          </div>
          {record.metadata?.['vendor'] !== undefined && (
            <p className="text-[9px] text-gray-500 truncate">Vendor: {String(record.metadata['vendor'])}</p>
          )}
          {record.metadata?.['amount'] !== undefined && (
            <p className="text-[9px] text-gray-500">Amount: {Number(record.metadata['amount']).toLocaleString()} MXN</p>
          )}
          {record.humanApprovedBy && (
            <p className="text-[9px] text-emerald-400 font-mono">✓ Human approval: {record.humanApprovedBy}</p>
          )}
        </div>
        <span className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded border shrink-0 ${cls.badge}`}>
          {cls.icon} {record.decision}
        </span>
      </div>

      {/* Content hash */}
      <div className="mt-1.5 flex items-center gap-1.5">
        <span className="text-[8px] text-gray-600 font-mono uppercase">SHA-256</span>
        <code className="text-[8px] text-electric-400/60 font-mono">{record.contentHash.slice(0, 16)}…</code>
      </div>

      {/* NEAR tx — clearly labeled simulated vs on-chain */}
      {record.nearTxHash && (
        <NEARModeBadge
          mode={record.nearMode}
          txHash={record.nearTxHash}
          explorerUrl={record.nearExplorerUrl}
        />
      )}

      <div className="mt-1 text-[8px] text-gray-600 font-mono">
        {new Date(record.timestamp).toLocaleTimeString()}
      </div>
    </motion.div>
  );
}

export function AuditLog() {
  const records = useHadesStore(s => s.auditRecords);
  const simCount = records.filter(r => r.nearTxHash && r.nearMode === 'simulation').length;
  const realCount = records.filter(r => r.nearTxHash && r.nearMode === 'real').length;

  return (
    <div className="flex flex-col gap-2 flex-1 min-h-0">
      <div className="flex items-center justify-between px-0.5 shrink-0">
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">CERBERUS Audit</div>
        <div className="flex items-center gap-2 text-[9px] font-mono">
          {realCount > 0 && <span className="text-emerald-400">◆ {realCount} on-chain</span>}
          {simCount > 0 && <span className="text-golden-500">◇ {simCount} simulated</span>}
          <span className="text-electric-400">{records.length} total</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 pr-1">
        <AnimatePresence initial={false}>
          {records.length === 0 ? (
            <div className="text-center py-8 text-gray-600 text-xs">
              <div className="text-2xl mb-2">🛡️</div>
              No audit records yet
            </div>
          ) : (
            records.map(r => <AuditRow key={r.id} record={r} />)
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
