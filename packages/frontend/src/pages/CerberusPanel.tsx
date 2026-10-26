import { useState } from 'react'
import { useHadesStore } from '../store/index.js'
import CerberusDecisionBadge from '../components/CerberusDecisionBadge.js'
import NEARBadge from '../components/NEARBadge.js'
import type { GUARDOutcome } from '../store/index.js'

const OUTCOME_FILTERS: (GUARDOutcome | 'ALL')[] = ['ALL', 'PERMIT', 'DENY', 'ESCALATE']

export default function CerberusPanel(): JSX.Element {
  const { auditRecords } = useHadesStore()
  const [filter, setFilter] = useState<GUARDOutcome | 'ALL'>('ALL')

  const filtered = filter === 'ALL' ? auditRecords : auditRecords.filter(r => r.guardDecision === filter)

  const stats = {
    total:    auditRecords.length,
    permit:   auditRecords.filter(r => r.guardDecision === 'PERMIT').length,
    deny:     auditRecords.filter(r => r.guardDecision === 'DENY').length,
    escalate: auditRecords.filter(r => r.guardDecision === 'ESCALATE').length,
    near:     auditRecords.filter(r => r.nearTxHash).length,
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="font-display text-xl font-semibold text-gray-100">CERBERUS</h1>
        <span className="font-mono text-xs text-gray-500">Motor de Seguridad & Auditoría</span>
        <span className="ml-auto flex items-center gap-1.5 font-mono text-xs text-permit">
          <span className="w-1.5 h-1.5 rounded-full bg-permit animate-pulse" />
          ACTIVO
        </span>
      </div>

      {/* Three heads */}
      <div className="grid grid-cols-3 gap-3">
        <CerberusHead title="GUARD" icon="⚔" count={stats.total} desc="Evaluaciones de política" />
        <CerberusHead title="AUDIT" icon="📋" count={stats.total} desc="Registros inmutables" />
        <CerberusHead title="RESPONSE" icon="🛡" count={0} desc="Contenciones activas" />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniStat label="Total" value={stats.total} />
        <MiniStat label="PERMIT" value={stats.permit} color="text-permit" />
        <MiniStat label="DENY" value={stats.deny} color="text-deny" />
        <MiniStat label="NEAR TXs" value={stats.near} color="text-blue-400" />
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] text-gray-500">FILTRAR:</span>
        {OUTCOME_FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`font-mono text-[11px] px-2.5 py-1 rounded border transition-colors ${
              filter === f
                ? 'border-electric/60 bg-electric/15 text-electric'
                : 'border-obsidian-700 text-gray-500 hover:border-gray-600'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Audit records table */}
      <div className="hades-card overflow-auto">
        {filtered.length === 0 ? (
          <p className="text-center text-gray-600 font-mono text-sm py-8">Sin registros aún</p>
        ) : (
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-obsidian-700 text-gray-500">
                <th className="text-left px-3 py-2">Hora</th>
                <th className="text-left px-3 py-2">Agente</th>
                <th className="text-left px-3 py-2">Operación</th>
                <th className="text-left px-3 py-2">Decisión</th>
                <th className="text-left px-3 py-2">Regla</th>
                <th className="text-left px-3 py-2">NEAR</th>
                <th className="text-left px-3 py-2">Modo</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(record => (
                <tr key={record.id} className="border-b border-obsidian-700/50 hover:bg-obsidian-700/30 transition-colors">
                  <td className="px-3 py-2 text-gray-500">
                    {new Date(record.timestamp).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </td>
                  <td className="px-3 py-2 text-electric">{record.agentName}</td>
                  <td className="px-3 py-2 text-gray-300">{record.operationType}</td>
                  <td className="px-3 py-2">
                    <CerberusDecisionBadge outcome={record.guardDecision} />
                  </td>
                  <td className="px-3 py-2 text-gray-500">{record.ruleMatched ?? '—'}</td>
                  <td className="px-3 py-2">
                    {record.nearTxHash && record.nearExplorerUrl
                      ? <NEARBadge txHash={record.nearTxHash} explorerUrl={record.nearExplorerUrl} />
                      : <span className="text-gray-600">—</span>
                    }
                  </td>
                  <td className="px-3 py-2">
                    <span className="badge-demo">{record.executionMode?.toUpperCase() ?? 'SIM'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function CerberusHead({ title, icon, count, desc }: { title: string; icon: string; count: number; desc: string }): JSX.Element {
  return (
    <div className="hades-card p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-electric">{icon}</span>
        <span className="font-mono text-xs font-semibold text-gray-200">{title}</span>
        <span className="ml-auto w-1.5 h-1.5 rounded-full bg-permit" />
      </div>
      <p className="font-display text-2xl font-bold text-electric">{count}</p>
      <p className="font-mono text-[10px] text-gray-500">{desc}</p>
    </div>
  )
}

function MiniStat({ label, value, color = 'text-gray-200' }: { label: string; value: number; color?: string }): JSX.Element {
  return (
    <div className="hades-card px-3 py-2">
      <p className="font-mono text-[10px] text-gray-500">{label}</p>
      <p className={`font-display text-xl font-semibold ${color}`}>{value}</p>
    </div>
  )
}
