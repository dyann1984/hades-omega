import { useHadesStore } from '../store/index.js'
import type { AgentName } from '../store/index.js'

const AGENT_NAMES: AgentName[] = ['HADES', 'CHARON', 'PERSEPHONE', 'MINOS', 'ELYSIUM', 'TARTARUS']

export default function ObservatoryPanel(): JSX.Element {
  const { agents, auditRecords, missions, nearTxs } = useHadesStore()

  const missionStats = {
    total:     missions.length,
    completed: missions.filter(m => m.status === 'COMPLETED').length,
    active:    missions.filter(m => m.status === 'IN_PROGRESS').length,
    failed:    missions.filter(m => m.status === 'FAILED').length,
  }

  const auditStats = {
    total:    auditRecords.length,
    permit:   auditRecords.filter(r => r.guardDecision === 'PERMIT').length,
    deny:     auditRecords.filter(r => r.guardDecision === 'DENY').length,
    escalate: auditRecords.filter(r => r.guardDecision === 'ESCALATE').length,
  }

  const agentActivity = AGENT_NAMES.map(name => ({
    name,
    decisions: auditRecords.filter(r => r.agentName === name).length,
    status:    agents[name].status,
  })).sort((a, b) => b.decisions - a.decisions)

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-xl font-semibold text-gray-100">OBSERVATORY</h1>

      {/* Mission stats */}
      <section>
        <h2 className="font-mono text-xs text-gray-500 mb-3 uppercase tracking-widest">Métricas de Misiones</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard label="Total Misiones" value={missionStats.total} />
          <MetricCard label="Completadas" value={missionStats.completed} color="text-permit" />
          <MetricCard label="En Progreso" value={missionStats.active} color="text-electric" />
          <MetricCard label="Fallidas" value={missionStats.failed} color="text-deny" />
        </div>
      </section>

      {/* CERBERUS stats */}
      <section>
        <h2 className="font-mono text-xs text-gray-500 mb-3 uppercase tracking-widest">Métricas CERBERUS</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <MetricCard label="Total Decisiones" value={auditStats.total} />
          <MetricCard label="PERMIT" value={auditStats.permit} color="text-permit" />
          <MetricCard label="DENY" value={auditStats.deny} color="text-deny" />
          <MetricCard label="ESCALATE" value={auditStats.escalate} color="text-escalate" />
        </div>
      </section>

      {/* NEAR stats */}
      <section>
        <h2 className="font-mono text-xs text-gray-500 mb-3 uppercase tracking-widest">NEAR Testnet</h2>
        <div className="hades-card p-4">
          <div className="flex items-center gap-3 mb-4">
            <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
            <span className="font-mono text-xs text-blue-400">SIMULACIÓN ACTIVA</span>
            <span className="badge-demo ml-2">SIM</span>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <MetricCard label="Transacciones" value={nearTxs.length} color="text-blue-400" />
            <MetricCard label="Confirmadas" value={nearTxs.length} color="text-blue-400" />
          </div>
          {nearTxs.slice(0, 5).map(tx => (
            <div key={tx.auditId} className="flex items-center gap-2 py-1.5 border-t border-obsidian-700 text-xs font-mono">
              <span className="text-blue-400">🔗</span>
              <a href={tx.explorerUrl} target="_blank" rel="noopener noreferrer" className="text-blue-300 hover:text-blue-200 truncate">
                {tx.txHash.slice(0, 20)}…
              </a>
              <span className="badge-demo flex-shrink-0">SIM</span>
            </div>
          ))}
          {nearTxs.length === 0 && (
            <p className="text-gray-600 font-mono text-xs">Sin transacciones aún — ejecuta una misión</p>
          )}
        </div>
      </section>

      {/* Agent activity */}
      <section>
        <h2 className="font-mono text-xs text-gray-500 mb-3 uppercase tracking-widest">Actividad por Agente</h2>
        <div className="hades-card overflow-auto">
          <table className="w-full text-xs font-mono">
            <thead>
              <tr className="border-b border-obsidian-700 text-gray-500">
                <th className="text-left px-3 py-2">Agente</th>
                <th className="text-left px-3 py-2">Estado</th>
                <th className="text-left px-3 py-2">Decisiones</th>
                <th className="text-left px-3 py-2">Actividad</th>
              </tr>
            </thead>
            <tbody>
              {agentActivity.map(({ name, decisions, status }) => (
                <tr key={name} className="border-b border-obsidian-700/50">
                  <td className="px-3 py-2 text-electric font-semibold">{name}</td>
                  <td className="px-3 py-2 text-gray-400">{status}</td>
                  <td className="px-3 py-2 text-gray-300">{decisions}</td>
                  <td className="px-3 py-2">
                    <div className="w-24 bg-obsidian-600 rounded-full h-1.5">
                      <div
                        className="bg-electric rounded-full h-1.5 transition-all"
                        style={{ width: auditStats.total ? `${Math.min(100, (decisions / auditStats.total) * 100)}%` : '0%' }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function MetricCard({ label, value, color = 'text-gray-200' }: { label: string; value: number; color?: string }): JSX.Element {
  return (
    <div className="hades-card px-3 py-2.5">
      <p className="font-mono text-[10px] text-gray-500">{label}</p>
      <p className={`font-display text-2xl font-bold ${color}`}>{value}</p>
    </div>
  )
}
