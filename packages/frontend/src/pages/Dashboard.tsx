import { useState } from 'react'
import { motion } from 'framer-motion'
import HolographicCore from '../components/HolographicCore.js'
import AgentCard from '../components/AgentCard.js'
import { useHadesStore } from '../store/index.js'
import type { AgentName } from '../store/index.js'

const AGENT_NAMES: AgentName[] = ['HADES', 'CHARON', 'PERSEPHONE', 'MINOS', 'ELYSIUM', 'TARTARUS']

interface NewMissionForm {
  title:       string
  description: string
  budget:      string
}

export default function Dashboard(): JSX.Element {
  const { agents, missions, auditRecords, nearTxs, wsConnected } = useHadesStore()
  const [showForm, setShowForm]   = useState(false)
  const [loading,  setLoading]    = useState(false)
  const [form, setForm]           = useState<NewMissionForm>({ title: '', description: '', budget: '50000' })

  const activeAgents = Object.values(agents).filter(a => a.status !== 'IDLE').length
  const totalDecisions = auditRecords.length
  const permits  = auditRecords.filter(r => r.guardDecision === 'PERMIT').length
  const denials  = auditRecords.filter(r => r.guardDecision === 'DENY').length
  const escalations = auditRecords.filter(r => r.guardDecision === 'ESCALATE').length

  async function createMission(): Promise<void> {
    if (!form.title.trim()) return
    setLoading(true)
    try {
      const apiBase = (import.meta as any).env?.VITE_API_URL ?? ''
      const res = await fetch(`${apiBase}/api/v1/missions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:       form.title,
          description: form.description || `Misión: ${form.title}`,
          budgetLimit: Number(form.budget) || 50000,
        }),
      })
      const json = await res.json()
      if (json.success) {
        const m = json.data
        useHadesStore.getState().addMission({
          id:          m.id,
          title:       m.title,
          description: m.description,
          status:      m.status,
          progress:    0,
          createdAt:   m.createdAt,
          tasks:       m.tasks?.map((t: any) => ({
            id: t.id, title: t.title, assignedTo: t.assignedTo, status: t.status,
          })) ?? [],
        })
        setShowForm(false)
        setForm({ title: '', description: '', budget: '50000' })
      }
    } catch (e) {
      useHadesStore.getState().addNotification('error', 'Error al crear misión. ¿Está el API corriendo?')
    } finally {
      setLoading(false)
    }
  }

  function startDemoMission(): void {
    setForm({
      title:       'Evaluar proveedores de infraestructura',
      description: 'Empresa TechCore Industries requiere evaluar proveedores de servidores cloud con presupuesto $50,000 MXN. Evaluar calidad, precio y tiempos de entrega.',
      budget:      '50000',
    })
    setShowForm(true)
  }

  return (
    <div className="flex flex-col h-full gap-4">
      {/* Status bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <StatusPill label="CERBERUS" active={true} color="electric" />
        <StatusPill label={`NEAR ${wsConnected ? 'CONECTADO' : 'SIMULACIÓN'}`} active={true} color={wsConnected ? 'electric' : 'gold'} />
        <StatusPill label={`${activeAgents} AGENTES ACTIVOS`} active={activeAgents > 0} color="gold" />
        <span className="badge-demo ml-auto">MODO DEMO</span>
      </div>

      {/* Main content — 3 columns on desktop */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0">

        {/* Left column: Agents */}
        <div className="flex flex-col gap-3">
          <h2 className="font-mono text-xs font-semibold text-gray-400 uppercase tracking-widest">
            PANTHEON — Agentes
          </h2>
          {AGENT_NAMES.map(name => (
            <AgentCard key={name} agent={agents[name]} />
          ))}
        </div>

        {/* Center column: Holographic core + stats */}
        <div className="flex flex-col gap-4">
          <div className="hades-card p-4 flex-1 flex items-center justify-center min-h-[280px] lg:min-h-0">
            <HolographicCore />
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 gap-2">
            <StatCard label="Decisiones" value={totalDecisions} />
            <StatCard label="PERMIT" value={permits} color="text-permit" />
            <StatCard label="DENY" value={denials} color="text-deny" />
            <StatCard label="ESCALATE" value={escalations} color="text-escalate" />
          </div>

          {/* NEAR TXs */}
          {nearTxs.length > 0 && (
            <div className="hades-card p-3">
              <p className="font-mono text-[10px] text-gray-400 mb-2">NEAR TESTNET — últimas txs</p>
              <div className="flex flex-col gap-1.5">
                {nearTxs.slice(0, 3).map(tx => (
                  <a
                    key={tx.auditId}
                    href={tx.explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-[11px] font-mono text-blue-300 hover:text-blue-200"
                  >
                    <span>🔗</span>
                    <span>{tx.txHash.slice(0, 12)}…</span>
                    <span className="badge-demo">SIM</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column: Missions + New Mission */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-xs font-semibold text-gray-400 uppercase tracking-widest">
              DOMINION — Misiones
            </h2>
            <button
              onClick={() => setShowForm(true)}
              className="text-xs font-mono text-electric border border-electric/30 px-2.5 py-1 rounded hover:bg-electric/10 transition-colors"
            >
              + Nueva
            </button>
          </div>

          {!showForm && missions.length === 0 && (
            <div className="hades-card p-4 text-center flex flex-col gap-3">
              <p className="text-gray-500 text-sm">No hay misiones activas</p>
              <button
                onClick={startDemoMission}
                className="text-xs font-mono text-gold border border-gold/30 px-3 py-2 rounded hover:bg-gold/10 transition-colors"
              >
                ▶ Iniciar Demo del Hackathon
              </button>
              <p className="text-[10px] text-gray-600">
                Flujo completo: TechCore Industries · $50,000 MXN
              </p>
            </div>
          )}

          {showForm && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="hades-card-elevated p-4 flex flex-col gap-3 border border-electric/30"
            >
              <h3 className="font-mono text-xs text-electric">NUEVA MISIÓN</h3>
              <input
                className="bg-obsidian border border-obsidian-600 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-electric/50"
                placeholder="Título de la misión"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              />
              <textarea
                className="bg-obsidian border border-obsidian-600 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-electric/50 resize-none"
                placeholder="Descripción y contexto"
                rows={3}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
              <div className="flex items-center gap-2">
                <label className="font-mono text-xs text-gray-400">Presupuesto MXN:</label>
                <input
                  type="number"
                  className="flex-1 bg-obsidian border border-obsidian-600 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-electric/50"
                  value={form.budget}
                  onChange={e => setForm(f => ({ ...f, budget: e.target.value }))}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={createMission}
                  disabled={loading || !form.title.trim()}
                  className="flex-1 bg-electric/20 border border-electric/50 text-electric font-mono text-xs py-2 rounded hover:bg-electric/30 transition-colors disabled:opacity-40"
                >
                  {loading ? 'PROCESANDO…' : '▶ EJECUTAR'}
                </button>
                <button
                  onClick={() => setShowForm(false)}
                  className="px-3 border border-obsidian-600 text-gray-400 font-mono text-xs py-2 rounded hover:border-gray-500 transition-colors"
                >
                  ✕
                </button>
              </div>
            </motion.div>
          )}

          {missions.map(m => (
            <MissionItem key={m.id} mission={m} />
          ))}
        </div>
      </div>
    </div>
  )
}

function StatusPill({ label, active, color }: { label: string; active: boolean; color: 'electric' | 'gold' }): JSX.Element {
  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-mono ${
      color === 'electric'
        ? 'border-electric/30 text-electric bg-electric/5'
        : 'border-gold/30 text-gold bg-gold/5'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${active ? (color === 'electric' ? 'bg-electric animate-pulse' : 'bg-gold animate-pulse') : 'bg-gray-600'}`} />
      {label}
    </div>
  )
}

function StatCard({ label, value, color = 'text-gray-200' }: { label: string; value: number; color?: string }): JSX.Element {
  return (
    <div className="hades-card px-3 py-2">
      <p className="font-mono text-[10px] text-gray-500">{label}</p>
      <p className={`font-display text-2xl font-semibold ${color}`}>{value}</p>
    </div>
  )
}

function MissionItem({ mission }: { mission: import('../store/index.js').Mission }): JSX.Element {
  const statusColor =
    mission.status === 'COMPLETED'   ? 'text-permit'
    : mission.status === 'FAILED'    ? 'text-deny'
    : mission.status === 'IN_PROGRESS' ? 'text-electric'
    : 'text-gray-400'

  return (
    <div className="hades-card p-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-sm text-gray-200 font-medium leading-snug">{mission.title}</p>
        <span className={`font-mono text-[10px] flex-shrink-0 ${statusColor}`}>
          {mission.status}
        </span>
      </div>

      {mission.status === 'IN_PROGRESS' || mission.status === 'COMPLETED' ? (
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="font-mono text-[10px] text-gray-500">Progreso</span>
            <span className="font-mono text-[10px] text-electric">{mission.progress}%</span>
          </div>
          <div className="w-full bg-obsidian-600 rounded-full h-1.5">
            <div
              className="bg-electric rounded-full h-1.5 transition-all duration-500"
              style={{ width: `${mission.progress}%` }}
            />
          </div>
        </div>
      ) : null}

      {mission.tasks.length > 0 && (
        <div className="mt-2 flex flex-col gap-1">
          {mission.tasks.slice(0, 4).map((task: import('../store/index.js').MissionTask) => (
            <div key={task.id} className="flex items-center gap-2 text-[11px]">
              <span className={
                task.status === 'EXECUTED'    ? 'text-permit'
                : task.status === 'FAILED'   ? 'text-deny'
                : task.status === 'IN_PROGRESS' ? 'text-electric'
                : 'text-gray-600'
              }>
                {task.status === 'EXECUTED' ? '✓' : task.status === 'FAILED' ? '✗' : task.status === 'IN_PROGRESS' ? '⏳' : '○'}
              </span>
              <span className="font-mono text-[10px] text-gray-400">[{task.assignedTo}]</span>
              <span className="text-gray-500 truncate">{task.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
