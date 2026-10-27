import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useHadesStore } from '../store/index.js'
import type { AuditRecord, Escalation } from '../store/index.js'
import { apiHeaders, apiPath } from '../lib/api.js'

function AuditRow({ record }: { record: AuditRecord }): JSX.Element {
  const [open, setOpen] = useState(false)
  const verdict = record.guardDecision
  const colors = {
    PERMIT:  { text: 'text-permit',   bg: 'bg-permit/10',   border: 'border-permit/30' },
    DENY:    { text: 'text-deny',     bg: 'bg-deny/10',     border: 'border-deny/30' },
    ESCALATE:{ text: 'text-escalate', bg: 'bg-escalate/10', border: 'border-escalate/30' },
  }[verdict]

  return (
    <div className={`border rounded-lg overflow-hidden transition-colors ${colors.border} ${colors.bg}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
      >
        <span className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border ${colors.border} ${colors.text} flex-shrink-0`}>
          {verdict}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] text-gray-300 truncate">{record.operationType}</p>
          <p className="font-mono text-[9px] text-gray-600">{record.agentName} · {record.id.slice(0, 8)}</p>
        </div>
        <span className="font-mono text-[9px] text-gray-600 flex-shrink-0">
          {new Date(record.timestamp).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
        <span className="text-gray-600 text-xs ml-1">{open ? '▲' : '▼'}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
            className="overflow-hidden border-t border-white/5"
          >
            <div className="px-3 py-3 flex flex-col gap-2 text-[10px]">
              {record.guardReason && (
                <div>
                  <span className="text-gray-600 font-mono">Razón: </span>
                  <span className="text-gray-300">{record.guardReason}</span>
                </div>
              )}
              {record.policyHits && record.policyHits.length > 0 && (
                <div>
                  <span className="text-gray-600 font-mono">Políticas activadas: </span>
                  <span className="text-gray-400">{record.policyHits.join(', ')}</span>
                </div>
              )}
              {Boolean(record.payload) && (
                <details className="cursor-pointer">
                  <summary className="text-gray-600 font-mono hover:text-gray-400">Payload</summary>
                  <pre className="mt-1 text-gray-500 bg-black/40 rounded p-2 overflow-x-auto text-[9px]">
                    {JSON.stringify(record.payload, null, 2) ?? 'null'}
                  </pre>
                </details>
              )}
              {record.nearTxHash && (
                <div className="flex items-center gap-2">
                  <span className="text-gold font-mono">⬡ NEAR TX:</span>
                  <span className="text-blue-400 font-mono truncate">{record.nearTxHash}</span>
                  <span className="text-[8px] badge-demo">SIM</span>
                </div>
              )}
              {record.sha256 && (
                <div>
                  <span className="text-gray-600 font-mono">SHA-256: </span>
                  <span className="text-gray-600 font-mono text-[9px] break-all">{record.sha256.slice(0, 40)}…</span>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function EscalationCard({ esc }: { esc: Escalation }): JSX.Element {
  const { resolveEscalation } = useHadesStore()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function decide(approve: boolean): Promise<void> {
    const justification = window.prompt('Justificación de la decisión (mínimo 3 caracteres):')?.trim()
    if (!justification || justification.length < 3) return
    setLoading(true); setError('')
    try {
      const response = await fetch(apiPath(`/api/v1/approvals/${encodeURIComponent(esc.id)}/decision`), {
        method: 'POST', headers: apiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ status: approve ? 'APPROVED' : 'REJECTED', justification }),
      })
      if (!response.ok) throw new Error(`No se pudo registrar la decisión (HTTP ${response.status}).`)
      resolveEscalation(esc.id, approve ? 'APPROVED' : 'REJECTED')
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Error de conexión') }
    finally { setLoading(false) }
  }

  const isPending = esc.status === 'PENDING'

  return (
    <motion.div
      layout
      className={`border rounded-lg p-4 flex flex-col gap-3 ${
        isPending
          ? 'border-escalate/40 bg-escalate/5'
          : esc.status === 'APPROVED'
            ? 'border-permit/25 bg-permit/5'
            : 'border-deny/20 bg-deny/5'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border ${
              isPending ? 'text-escalate border-escalate/30 bg-escalate/10' :
              esc.status === 'APPROVED' ? 'text-permit border-permit/30' :
              'text-deny border-deny/30'
            }`}>{esc.status}</span>
            <span className="font-mono text-[9px] text-gray-600">{esc.fromAgent}</span>
          </div>
          <p className="text-sm text-gray-200">{esc.reason}</p>
        </div>
        <span className="font-mono text-[9px] text-gray-600 flex-shrink-0">
          {new Date(esc.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
      {Boolean(esc.context) && (
        <div className="bg-black/30 rounded p-2 text-[10px] text-gray-500 font-mono">
          {typeof esc.context === 'string' ? esc.context : (JSON.stringify(esc.context)?.slice(0, 120) ?? 'null') + '…'}
        </div>
      )}
      {error && <p role="alert" className="text-deny text-xs">{error}</p>}
      <p className="text-xs text-gray-500">La decisión se registra; la operación no se reanuda automáticamente.</p>
      {isPending && (
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => decide(true)}
            disabled={loading}
            className="flex-1 font-mono text-[11px] text-permit border border-permit/40 rounded py-2 hover:bg-permit/10 transition-colors disabled:opacity-40"
          >
            {loading ? '…' : '✓ APROBAR'}
          </button>
          <button
            onClick={() => decide(false)}
            disabled={loading}
            className="flex-1 font-mono text-[11px] text-deny border border-deny/40 rounded py-2 hover:bg-deny/10 transition-colors disabled:opacity-40"
          >
            {loading ? '…' : '✗ RECHAZAR'}
          </button>
        </div>
      )}
    </motion.div>
  )
}

export default function JudgmentPanel(): JSX.Element {
  const { auditRecords, escalations } = useHadesStore()
  const [filter, setFilter] = useState<'ALL' | 'PERMIT' | 'DENY' | 'ESCALATE'>('ALL')
  const [tab, setTab] = useState<'escalations' | 'audit'>('escalations')

  const pendingEsc  = escalations.filter(e => e.status === 'PENDING')
  const resolvedEsc = escalations.filter(e => e.status !== 'PENDING')

  const filtered = filter === 'ALL' ? auditRecords : auditRecords.filter(r => r.guardDecision === filter)

  const stats = {
    PERMIT:   auditRecords.filter(r => r.guardDecision === 'PERMIT').length,
    DENY:     auditRecords.filter(r => r.guardDecision === 'DENY').length,
    ESCALATE: auditRecords.filter(r => r.guardDecision === 'ESCALATE').length,
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-mono text-sm font-bold text-gray-200 tracking-[0.15em]">JUDGMENT</h2>
          <p className="text-[11px] text-gray-600 font-mono">Centro de escalaciones y auditoría CERBERUS</p>
        </div>
        {pendingEsc.length > 0 && (
          <span className="font-mono text-[10px] px-2 py-1 rounded bg-escalate/15 text-escalate border border-escalate/30 animate-pulse">
            {pendingEsc.length} PENDIENTE{pendingEsc.length > 1 ? 'S' : ''}
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {(['PERMIT', 'DENY', 'ESCALATE'] as const).map(k => (
          <button
            key={k}
            onClick={() => { setFilter(f => f === k ? 'ALL' : k); setTab('audit') }}
            className={`hades-card rounded-lg p-3 text-center transition-colors ${filter === k ? 'ring-1 ring-electric/50' : ''}`}
          >
            <p className={`font-mono text-2xl font-bold ${
              k === 'PERMIT' ? 'text-permit' : k === 'DENY' ? 'text-deny' : 'text-escalate'
            }`}>{stats[k]}</p>
            <p className="font-mono text-[9px] text-gray-600 mt-1">{k}</p>
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#0A0A0F] rounded-lg p-1">
        {(['escalations', 'audit'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 font-mono text-[11px] py-2 rounded transition-colors ${
              tab === t ? 'bg-electric/15 text-electric' : 'text-gray-600 hover:text-gray-400'
            }`}
          >
            {t === 'escalations' ? `ESCALACIONES${pendingEsc.length ? ` (${pendingEsc.length})` : ''}` : 'AUDITORÍA CERBERUS'}
          </button>
        ))}
      </div>

      {tab === 'escalations' ? (
        <div className="flex flex-col gap-4">
          {escalations.length === 0 ? (
            <div className="hades-card rounded-lg p-8 text-center">
              <p className="text-gray-600 font-mono text-sm">Sin escalaciones</p>
              <p className="text-[10px] text-gray-700 mt-1">Aparecerán aquí cuando CERBERUS requiera aprobación humana</p>
            </div>
          ) : (
            <>
              {pendingEsc.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="font-mono text-[10px] text-escalate tracking-widest">PENDIENTES DE APROBACIÓN</p>
                  {pendingEsc.map(e => <EscalationCard key={e.id} esc={e} />)}
                </div>
              )}
              {resolvedEsc.length > 0 && (
                <div className="flex flex-col gap-2">
                  <p className="font-mono text-[10px] text-gray-600 tracking-widest">RESUELTAS</p>
                  {resolvedEsc.slice(0, 10).map(e => <EscalationCard key={e.id} esc={e} />)}
                </div>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Filter */}
          <div className="flex gap-2 flex-wrap">
            {(['ALL', 'PERMIT', 'DENY', 'ESCALATE'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`font-mono text-[10px] px-2.5 py-1 rounded border transition-colors ${
                  filter === f ? 'border-electric/50 text-electric bg-electric/10' : 'border-white/5 text-gray-600 hover:border-white/15'
                }`}
              >
                {f} {f !== 'ALL' && `(${stats[f as keyof typeof stats]})`}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 max-h-[520px] overflow-y-auto pr-1">
            {filtered.length === 0 ? (
              <div className="hades-card rounded-lg p-8 text-center">
                <p className="text-gray-600 font-mono text-sm">Sin registros de auditoría</p>
              </div>
            ) : (
              filtered.map(r => <AuditRow key={r.id} record={r} />)
            )}
          </div>
        </div>
      )}
    </div>
  )
}
