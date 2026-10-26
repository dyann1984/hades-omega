import { useMemo } from 'react'
import { useHadesStore } from '../store/index.js'
import type { AgentName } from '../store/index.js'

const AGENT_NAMES: AgentName[] = ['CHARON', 'PERSEPHONE', 'MINOS', 'CERBERUS', 'ELYSIUM', 'TARTARUS']

function BarChart({ value, max, color }: { value: number; max: number; color: string }): JSX.Element {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className="h-1.5 bg-obsidian-700 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

export default function OraclePanel(): JSX.Element {
  const { missions, auditRecords, nearTxs } = useHadesStore()

  const agentStats = useMemo(() =>
    AGENT_NAMES.map(name => {
      const records  = auditRecords.filter(r => r.agentName === name)
      const permits  = records.filter(r => r.guardDecision === 'PERMIT').length
      const denies   = records.filter(r => r.guardDecision === 'DENY').length
      const escalates = records.filter(r => r.guardDecision === 'ESCALATE').length
      const total    = records.length
      const pctOk    = total > 0 ? Math.round((permits / total) * 100) : 0
      return { name, total, permits, denies, escalates, pctOk }
    }),
  [auditRecords])

  const missionStats = useMemo(() => {
    const total     = missions.length
    const completed = missions.filter(m => m.status === 'COMPLETED').length
    const failed    = missions.filter(m => m.status === 'FAILED').length
    const partial   = missions.filter(m => m.status === 'PARTIAL_COMPLETE').length
    const avgProgress = total > 0
      ? Math.round(missions.reduce((s, m) => s + m.progress, 0) / total)
      : 0
    return { total, completed, failed, partial, avgProgress }
  }, [missions])

  const operationTypes = useMemo(() => {
    const freq: Record<string, number> = {}
    for (const r of auditRecords) freq[r.operationType] = (freq[r.operationType] ?? 0) + 1
    return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 8)
  }, [auditRecords])

  const maxAgentTotal = Math.max(...agentStats.map(a => a.total), 1)
  const maxOpFreq     = operationTypes[0]?.[1] ?? 1

  const cerberusSummary = useMemo(() => {
    const total   = auditRecords.length
    const permits = auditRecords.filter(r => r.guardDecision === 'PERMIT').length
    const denies  = auditRecords.filter(r => r.guardDecision === 'DENY').length
    const esc     = auditRecords.filter(r => r.guardDecision === 'ESCALATE').length
    const withNear = auditRecords.filter(r => r.nearTxHash).length
    return { total, permits, denies, esc, withNear }
  }, [auditRecords])

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div>
        <h2 className="font-mono text-sm font-bold text-gray-200 tracking-[0.15em]">ORACLE</h2>
        <p className="text-[11px] text-gray-600 font-mono">Análisis operativo y métricas del sistema multiagente</p>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="hades-card rounded-lg p-3 text-center">
          <p className="font-mono text-2xl font-bold text-electric">{missionStats.total}</p>
          <p className="font-mono text-[9px] text-gray-600">Misiones totales</p>
          {missionStats.total > 0 && (
            <p className="font-mono text-[9px] text-permit mt-1">{missionStats.completed} completadas</p>
          )}
        </div>
        <div className="hades-card rounded-lg p-3 text-center">
          <p className="font-mono text-2xl font-bold text-gold">{nearTxs.length}</p>
          <p className="font-mono text-[9px] text-gray-600">NEAR TXs</p>
          <p className="font-mono text-[9px] text-escalate mt-1">Testnet simulado</p>
        </div>
        <div className="hades-card rounded-lg p-3 text-center">
          <p className="font-mono text-2xl font-bold text-permit">{cerberusSummary.permits}</p>
          <p className="font-mono text-[9px] text-gray-600">PERMIT (audit)</p>
          {cerberusSummary.total > 0 && (
            <p className="font-mono text-[9px] text-gray-500 mt-1">
              {Math.round((cerberusSummary.permits / cerberusSummary.total) * 100)}% aprobación
            </p>
          )}
        </div>
        <div className="hades-card rounded-lg p-3 text-center">
          <p className="font-mono text-2xl font-bold text-deny">{cerberusSummary.denies}</p>
          <p className="font-mono text-[9px] text-gray-600">DENY</p>
          {cerberusSummary.esc > 0 && (
            <p className="font-mono text-[9px] text-escalate mt-1">{cerberusSummary.esc} escalados</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Agent activity */}
        <div className="hades-card rounded-lg p-4">
          <p className="font-mono text-[10px] text-gray-500 tracking-widest mb-3">ACTIVIDAD POR AGENTE</p>
          {auditRecords.length === 0 ? (
            <p className="text-[11px] text-gray-700 font-mono">Sin datos — ejecuta misiones desde THRONE</p>
          ) : (
            <div className="flex flex-col gap-3">
              {agentStats.filter(a => a.total > 0).sort((a, b) => b.total - a.total).map(a => (
                <div key={a.name}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-electric">{a.name}</span>
                      <span className="text-[9px] text-gray-600">{a.total} ops</span>
                    </div>
                    <div className="flex items-center gap-2 text-[9px]">
                      <span className="text-permit">{a.permits}P</span>
                      {a.denies > 0 && <span className="text-deny">{a.denies}D</span>}
                      {a.escalates > 0 && <span className="text-escalate">{a.escalates}E</span>}
                    </div>
                  </div>
                  <BarChart value={a.total} max={maxAgentTotal} color="#00D4FF" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Operation types */}
        <div className="hades-card rounded-lg p-4">
          <p className="font-mono text-[10px] text-gray-500 tracking-widest mb-3">TIPOS DE OPERACIÓN MÁS FRECUENTES</p>
          {operationTypes.length === 0 ? (
            <p className="text-[11px] text-gray-700 font-mono">Sin datos de auditoría</p>
          ) : (
            <div className="flex flex-col gap-3">
              {operationTypes.map(([op, freq]) => (
                <div key={op}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-gray-400 truncate">{op}</span>
                    <span className="font-mono text-[10px] text-gray-500 flex-shrink-0 ml-2">{freq}x</span>
                  </div>
                  <BarChart value={freq} max={maxOpFreq} color="#FFD700" />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Mission progress */}
        {missions.length > 0 && (
          <div className="hades-card rounded-lg p-4">
            <p className="font-mono text-[10px] text-gray-500 tracking-widest mb-3">PROGRESO DE MISIONES</p>
            <div className="flex flex-col gap-3">
              {missions.slice(0, 6).map(m => (
                <div key={m.id}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-gray-400 truncate">{m.title.slice(0, 36)}</span>
                    <span className={`font-mono text-[9px] ml-2 flex-shrink-0 ${
                      m.status === 'COMPLETED' ? 'text-permit' :
                      m.status === 'FAILED' ? 'text-deny' : 'text-electric'
                    }`}>{m.progress}%</span>
                  </div>
                  <BarChart
                    value={m.progress}
                    max={100}
                    color={m.status === 'COMPLETED' ? '#00CC66' : m.status === 'FAILED' ? '#FF3366' : '#00D4FF'}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CERBERUS breakdown */}
        <div className="hades-card rounded-lg p-4">
          <p className="font-mono text-[10px] text-gray-500 tracking-widest mb-3">DECISIONES CERBERUS</p>
          <div className="flex flex-col gap-2">
            {[
              { label: 'PERMIT',   count: cerberusSummary.permits,  color: '#00CC66', textColor: 'text-permit' },
              { label: 'DENY',     count: cerberusSummary.denies,   color: '#FF3366', textColor: 'text-deny' },
              { label: 'ESCALATE', count: cerberusSummary.esc,      color: '#FFB800', textColor: 'text-escalate' },
              { label: '+ NEAR TX', count: cerberusSummary.withNear, color: '#FFD700', textColor: 'text-gold' },
            ].map(row => (
              <div key={row.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className={`font-mono text-[10px] ${row.textColor}`}>{row.label}</span>
                  <span className="font-mono text-[10px] text-gray-500">{row.count}</span>
                </div>
                <BarChart value={row.count} max={cerberusSummary.total || 1} color={row.color} />
              </div>
            ))}
          </div>
          {cerberusSummary.total === 0 && (
            <p className="text-[11px] text-gray-700 font-mono mt-2">Sin decisiones registradas aún</p>
          )}
        </div>
      </div>

      <p className="font-mono text-[9px] text-gray-700 text-center">
        Todos los datos son del estado local · Actualizado en tiempo real con la actividad del sistema
      </p>
    </div>
  )
}
