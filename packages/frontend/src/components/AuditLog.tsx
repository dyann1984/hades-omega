import { motion, AnimatePresence } from 'framer-motion';
import { useHadesStore } from '../store.js';
import type { AuditRecord } from '../types.js';

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
          {record.metadata?.vendor && (
            <p className="text-[9px] text-gray-500 truncate">Vendor: {String(record.metadata.vendor)}</p>
          )}
          {record.metadata?.amount && (
            <p className="text-[9px] text-gray-500">Amount: {Number(record.metadata.amount).toLocaleString()} MXN</p>
          )}
          {record.humanApprovedBy && (
            <p className="text-[9px] text-emerald-400 font-mono">✓ Approved by {record.humanApprovedBy}</p>
          )}
        </div>
        <span className={`text-[9px] font-bold font-mono px-1.5 py-0.5 rounded border shrink-0 ${cls.badge}`}>
          {cls.icon} {record.decision}
        </span>
      </div>

      {/* Content hash */}
      <div className="mt-1.5 flex items-center gap-1.5">
        <span className="text-[8px] text-gray-600 font-mono uppercase">hash</span>
        <code className="text-[8px] text-electric-400/60 font-mono">{record.contentHash.slice(0, 16)}…</code>
      </div>

      {/* NEAR tx link */}
      {record.nearTxHash && (
        <div className="mt-1 flex items-center gap-1.5">
          <span className="text-[8px] text-golden-400 font-mono uppercase">NEAR</span>
          <a
            href={record.nearExplorerUrl ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[8px] text-golden-400 hover:text-golden-300 font-mono underline underline-offset-2 truncate"
          >
            {record.nearTxHash.slice(0, 16)}…
          </a>
          <span className="text-[7px] text-golden-600 uppercase font-mono">{record.nearMode}</span>
        </div>
      )}

      <div className="mt-1 text-[8px] text-gray-600 font-mono">
        {new Date(record.timestamp).toLocaleTimeString()}
      </div>
    </motion.div>
  );
}

export function AuditLog() {
  const records = useHadesStore(s => s.auditRecords);

  return (
    <div className="flex flex-col gap-2 flex-1 min-h-0">
      <div className="flex items-center justify-between px-0.5 shrink-0">
        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.2em]">CERBERUS Audit</div>
        <div className="text-[9px] text-electric-400 font-mono">{records.length} records</div>
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
