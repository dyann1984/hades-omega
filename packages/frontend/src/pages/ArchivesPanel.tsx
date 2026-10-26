import { useState } from 'react'
import { useHadesStore } from '../store/index.js'
import type { Mission } from '../store/index.js'

function MissionRow({ m }: { m: Mission }): JSX.Element {
  const [open, setOpen] = useState(false)
  const done    = m.tasks.filter(t => t.status === 'EXECUTED').length
  const failed  = m.tasks.filter(t => t.status === 'FAILED').length

  function downloadReport(): void {
    const report = {
      id: m.id, title: m.title, description: m.description, status: m.status,
      progress: m.progress, createdAt: m.createdAt,
      tasks: m.tasks.map(t => ({ id: t.id, title: t.title, assignedTo: t.assignedTo, status: t.status, result: t.result })),
    }
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const a    = document.createElement('a')
    a.href     = URL.createObjectURL(blob)
    a.download = `hades-mission-${m.id.slice(0, 8)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className={`border rounded-lg overflow-hidden transition-colors ${
      m.status === 'COMPLETED' ? 'border-permit/20' : m.status === 'FAILED' ? 'border-deny/20' : 'border-white/5'
    }`}>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <button onClick={() => setOpen(o => !o)} className="flex-1 flex items-center gap-3 text-left min-w-0">
          <span className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
            m.status === 'COMPLETED' ? 'text-permit bg-permit/10' :
            m.status === 'FAILED'    ? 'text-deny bg-deny/10' :
            'text-electric bg-electric/10'
          }`}>{m.status === 'COMPLETED' ? '✓' : m.status === 'FAILED' ? '✗' : '○'}</span>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] text-gray-200 truncate">{m.title}</p>
            <p className="font-mono text-[9px] text-gray-600">
              {m.id.slice(0, 8)} · {done}/{m.tasks.length} tareas · {new Date(m.createdAt).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <span className="text-gray-600 text-xs ml-1 flex-shrink-0">{open ? '▲' : '▼'}</span>
        </button>
        <button
          onClick={downloadReport}
          title="Descargar reporte JSON"
          className="flex-shrink-0 font-mono text-[10px] text-electric border border-electric/30 px-2 py-1 rounded hover:bg-electric/10 transition-colors"
        >
          ↓ JSON
        </button>
      </div>
      {open && (
        <div className="border-t border-white/5 px-3 py-3">
          <p className="text-[10px] text-gray-500 mb-2">{m.description}</p>
          {failed > 0 && (
            <p className="text-[10px] text-deny mb-2">⚠ {failed} tarea(s) fallida(s)</p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {m.tasks.map(t => (
              <div key={t.id} className={`rounded border p-2 text-[10px] ${
                t.status === 'EXECUTED' ? 'border-permit/20 bg-permit/5' :
                t.status === 'FAILED'   ? 'border-deny/20 bg-deny/5' :
                'border-white/5'
              }`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="font-mono font-bold text-electric">{t.assignedTo}</span>
                  <span className={`font-mono text-[9px] ${
                    t.status === 'EXECUTED' ? 'text-permit' : t.status === 'FAILED' ? 'text-deny' : 'text-gray-600'
                  }`}>{t.status}</span>
                </div>
                <p className="text-gray-400 leading-snug">{t.title}</p>
                {t.result && (
                  <p className="text-gray-600 mt-1 leading-snug">{String(t.result).slice(0, 80)}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function ArchivesPanel(): JSX.Element {
  const { missions, auditRecords, nearTxs } = useHadesStore()
  const [tab, setTab] = useState<'missions' | 'audit' | 'near'>('missions')
  const [searchMission, setSearchMission] = useState('')
  const [searchAudit, setSearchAudit] = useState('')

  const filteredMissions = missions.filter(m =>
    !searchMission || m.title.toLowerCase().includes(searchMission.toLowerCase()) || m.id.includes(searchMission)
  )

  const filteredAudit = auditRecords.filter(r =>
    !searchAudit || r.operationType.toLowerCase().includes(searchAudit.toLowerCase()) || r.agentName.includes(searchAudit.toUpperCase())
  )

  function exportAllMissions(): void {
    const blob = new Blob([JSON.stringify(missions, null, 2)], { type: 'application/json' })
    const a    = document.createElement('a')
    a.href     = URL.createObjectURL(blob)
    a.download = `hades-missions-export-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  function exportAuditLog(): void {
    const blob = new Blob([JSON.stringify(auditRecords, null, 2)], { type: 'application/json' })
    const a    = document.createElement('a')
    a.href     = URL.createObjectURL(blob)
    a.download = `hades-audit-log-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  const stats = {
    completed: missions.filter(m => m.status === 'COMPLETED').length,
    failed:    missions.filter(m => m.status === 'FAILED').length,
    nearTxs:   nearTxs.length,
    permits:   auditRecords.filter(r => r.guardDecision === 'PERMIT').length,
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-mono text-sm font-bold text-gray-200 tracking-[0.15em]">ARCHIVES</h2>
          <p className="text-[11px] text-gray-600 font-mono">Historial completo de misiones, auditoría y NEAR txs</p>
        </div>
        <button
          onClick={tab === 'missions' ? exportAllMissions : exportAuditLog}
          className="font-mono text-[10px] text-electric border border-electric/30 px-3 py-1.5 rounded hover:bg-electric/10 transition-colors"
        >
          ↓ Exportar {tab === 'missions' ? 'misiones' : 'auditoría'}
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-3">
        <div className="hades-card rounded-lg p-3 text-center">
          <p className="font-mono text-xl font-bold text-electric">{missions.length}</p>
          <p className="font-mono text-[9px] text-gray-600">Total Misiones</p>
        </div>
        <div className="hades-card rounded-lg p-3 text-center">
          <p className="font-mono text-xl font-bold text-permit">{stats.completed}</p>
          <p className="font-mono text-[9px] text-gray-600">Completadas</p>
        </div>
        <div className="hades-card rounded-lg p-3 text-center">
          <p className="font-mono text-xl font-bold text-gold">{stats.nearTxs}</p>
          <p className="font-mono text-[9px] text-gray-600">NEAR TXs</p>
        </div>
        <div className="hades-card rounded-lg p-3 text-center">
          <p className="font-mono text-xl font-bold text-gray-400">{auditRecords.length}</p>
          <p className="font-mono text-[9px] text-gray-600">Registros Audit</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#0A0A0F] rounded-lg p-1">
        {(['missions', 'audit', 'near'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 font-mono text-[11px] py-2 rounded transition-colors ${
              tab === t ? 'bg-electric/15 text-electric' : 'text-gray-600 hover:text-gray-400'
            }`}
          >
            {t === 'missions' ? `MISIONES (${missions.length})` : t === 'audit' ? `AUDITORÍA (${auditRecords.length})` : `NEAR TXS (${nearTxs.length})`}
          </button>
        ))}
      </div>

      {tab === 'missions' && (
        <div className="flex flex-col gap-3">
          <input
            className="bg-[#0A0A0F] border border-obsidian-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-electric/40 transition-colors"
            placeholder="Buscar misión por título o ID…"
            value={searchMission}
            onChange={e => setSearchMission(e.target.value)}
          />
          <div className="flex flex-col gap-2 max-h-[520px] overflow-y-auto pr-1">
            {filteredMissions.length === 0 ? (
              <div className="hades-card rounded-lg p-8 text-center">
                <p className="text-gray-600 font-mono text-sm">
                  {missions.length === 0 ? 'Sin misiones registradas — crea una desde THRONE' : 'Sin resultados para la búsqueda'}
                </p>
              </div>
            ) : (
              filteredMissions.map(m => <MissionRow key={m.id} m={m} />)
            )}
          </div>
        </div>
      )}

      {tab === 'audit' && (
        <div className="flex flex-col gap-3">
          <input
            className="bg-[#0A0A0F] border border-obsidian-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-electric/40 transition-colors"
            placeholder="Buscar por tipo de operación o agente…"
            value={searchAudit}
            onChange={e => setSearchAudit(e.target.value)}
          />
          <div className="flex flex-col gap-1.5 max-h-[520px] overflow-y-auto pr-1">
            {filteredAudit.length === 0 ? (
              <div className="hades-card rounded-lg p-8 text-center">
                <p className="text-gray-600 font-mono text-sm">Sin registros de auditoría</p>
              </div>
            ) : (
              filteredAudit.map(r => (
                <div key={r.id} className="flex items-center gap-3 px-3 py-2 hades-card rounded">
                  <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${
                    r.guardDecision === 'PERMIT'   ? 'text-permit bg-permit/10' :
                    r.guardDecision === 'DENY'     ? 'text-deny bg-deny/10' :
                    'text-escalate bg-escalate/10'
                  }`}>{r.guardDecision}</span>
                  <span className="font-mono text-[10px] text-electric flex-shrink-0">{r.agentName}</span>
                  <span className="text-[10px] text-gray-400 truncate flex-1">{r.operationType}</span>
                  {r.nearTxHash && <span className="text-[9px] text-gold flex-shrink-0">⬡</span>}
                  <span className="font-mono text-[9px] text-gray-600 flex-shrink-0">
                    {new Date(r.timestamp).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {tab === 'near' && (
        <div className="flex flex-col gap-2">
          {nearTxs.length === 0 ? (
            <div className="hades-card rounded-lg p-8 text-center">
              <p className="text-gray-600 font-mono text-sm">Sin transacciones NEAR</p>
              <p className="text-[10px] text-gray-700 mt-1">Se crearán al ejecutar misiones con validación CERBERUS</p>
            </div>
          ) : (
            nearTxs.map(tx => (
              <div key={tx.auditId} className="hades-card rounded-lg px-3 py-2.5 flex items-center gap-3">
                <span className="text-gold text-sm">⬡</span>
                <div className="flex-1 min-w-0">
                  <a
                    href={tx.explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[11px] text-blue-400 hover:text-blue-300 transition-colors truncate block"
                  >
                    {tx.txHash}
                  </a>
                  <p className="font-mono text-[9px] text-gray-600">Audit: {tx.auditId.slice(0, 12)}…</p>
                </div>
                <span className="font-mono text-[9px] px-1.5 py-0.5 rounded border border-escalate/30 text-escalate bg-escalate/10">SIM</span>
                <a href={tx.explorerUrl} target="_blank" rel="noopener noreferrer"
                  className="font-mono text-[10px] text-electric border border-electric/30 px-2 py-1 rounded hover:bg-electric/10 transition-colors flex-shrink-0">
                  Explorer →
                </a>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
