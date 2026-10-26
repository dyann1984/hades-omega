import { useState } from 'react'
import { motion } from 'framer-motion'
import { useHadesStore } from '../store/index.js'
import type { AgentName, AgentStatus } from '../store/index.js'

const AGENT_META: Record<AgentName, { role: string; desc: string; symbol: string; color: string }> = {
  HADES: {
    role: 'Orquestador Central',
    desc: 'Coordina todos los agentes, planifica misiones y toma decisiones de alto nivel.',
    symbol: '⬡', color: '#FFD700',
  },
  CHARON: {
    role: 'Compras & Proveedores',
    desc: 'Evalúa solicitudes de compra, negocia con proveedores y valida presupuestos.',
    symbol: '⚡', color: '#00D4FF',
  },
  PERSEPHONE: {
    role: 'Finanzas & Presupuesto',
    desc: 'Controla el flujo financiero, aprueba transacciones y genera reportes.',
    symbol: '◈', color: '#00CCEE',
  },
  MINOS: {
    role: 'Validación & Políticas',
    desc: 'Verifica cumplimiento regulatorio y valida decisiones contra políticas internas.',
    symbol: '⚖', color: '#00BBDD',
  },
  CERBERUS: {
    role: 'Seguridad & Control',
    desc: 'GUARD determina PERMIT/DENY/ESCALATE para cada operación. AUDIT genera hash SHA-256 y registra en NEAR.',
    symbol: '◉', color: '#FFB800',
  },
  ELYSIUM: {
    role: 'Planificación Táctica',
    desc: 'Diseña planes de ejecución, prioriza tareas y optimiza recursos disponibles.',
    symbol: '◎', color: '#00D4FF',
  },
  TARTARUS: {
    role: 'Anomalías & Incidentes',
    desc: 'Detecta comportamientos anómalos, registra incidentes y activa protocolos de respuesta.',
    symbol: '▲', color: '#0099CC',
  },
}

const STATUS_LABELS: Record<AgentStatus, string> = {
  IDLE:      'Inactivo',
  THINKING:  'Analizando',
  EXECUTING: 'Ejecutando',
  WAITING:   'En espera',
  ERROR:     'Error',
  SUSPENDED: 'Suspendido',
}

const STATUS_COLOR: Record<AgentStatus, string> = {
  IDLE:      'text-gray-600',
  THINKING:  'text-electric',
  EXECUTING: 'text-electric',
  WAITING:   'text-escalate',
  ERROR:     'text-deny',
  SUSPENDED: 'text-gray-600',
}

function AgentCard({ name }: { name: AgentName }): JSX.Element {
  const [expanded, setExpanded]         = useState(false)
  const { agents, auditRecords, setAgentStatus } = useHadesStore()
  const agent  = agents[name]
  const meta   = AGENT_META[name]
  const active = agent.status !== 'IDLE' && agent.status !== 'SUSPENDED'
  const isHades = name === 'HADES'

  const agentRecords = auditRecords.filter(r => r.agentName === name).slice(0, 5)
  const permitCount  = agentRecords.filter(r => r.guardDecision === 'PERMIT').length
  const denyCount    = agentRecords.filter(r => r.guardDecision === 'DENY').length

  return (
    <motion.div
      layout
      className={`hades-card rounded-lg overflow-hidden transition-all ${
        active ? `ring-1 ring-[${meta.color}]/30` : ''
      }`}
      style={{ borderColor: active ? `${meta.color}22` : undefined }}
    >
      {/* Card header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-start gap-3 p-4 text-left"
      >
        {/* Symbol + glow */}
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 text-lg border"
          style={{
            color:            meta.color,
            borderColor:      active ? meta.color + '50' : '#ffffff10',
            backgroundColor:  active ? meta.color + '12' : '#ffffff05',
            boxShadow:        active ? `0 0 14px ${meta.color}30` : 'none',
          }}
        >
          {meta.symbol}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-mono text-xs font-bold text-gray-200">{name}</span>
            {isHades && <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-gold/15 text-gold border border-gold/30">MASTER</span>}
            <span className={`ml-auto font-mono text-[10px] flex items-center gap-1.5 ${STATUS_COLOR[agent.status]}`}>
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${active ? 'animate-pulse' : ''}`}
                style={{ background: active ? meta.color : '#4a4a5a' }} />
              {STATUS_LABELS[agent.status]}
            </span>
          </div>
          <p className="text-[11px] text-gray-500">{meta.role}</p>
          {active && agent.currentTask && (
            <p className="text-[10px] text-electric/70 mt-1 leading-snug truncate">{agent.currentTask}</p>
          )}
        </div>

        <span className="text-gray-600 text-xs flex-shrink-0 mt-1">{expanded ? '▲' : '▼'}</span>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-white/5 px-4 py-3 flex flex-col gap-3">
          <p className="text-[11px] text-gray-400 leading-relaxed">{meta.desc}</p>

          {/* Stats row */}
          {agentRecords.length > 0 && (
            <div className="flex gap-3">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-permit" />
                <span className="font-mono text-[10px] text-permit">{permitCount} PERMIT</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-deny" />
                <span className="font-mono text-[10px] text-deny">{denyCount} DENY</span>
              </div>
            </div>
          )}

          {/* Last 3 audit records */}
          {agentRecords.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="font-mono text-[9px] text-gray-600 tracking-widest">ÚLTIMAS OPERACIONES</p>
              {agentRecords.slice(0, 3).map(r => (
                <div key={r.id} className="flex items-center gap-2 text-[10px]">
                  <span className={`font-mono text-[9px] px-1 rounded ${
                    r.guardDecision === 'PERMIT' ? 'bg-permit/15 text-permit' :
                    r.guardDecision === 'DENY'   ? 'bg-deny/15 text-deny' :
                    'bg-escalate/15 text-escalate'
                  }`}>{r.guardDecision}</span>
                  <span className="text-gray-500 truncate">{r.operationType}</span>
                </div>
              ))}
            </div>
          )}

          {/* Controls — no production actions */}
          {!isHades && (
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setAgentStatus(name, agent.status === 'SUSPENDED' ? 'IDLE' : 'SUSPENDED')}
                className={`font-mono text-[10px] px-3 py-1.5 rounded border transition-colors ${
                  agent.status === 'SUSPENDED'
                    ? 'border-permit/30 text-permit hover:bg-permit/10'
                    : 'border-gray-700 text-gray-500 hover:border-gray-500'
                }`}
              >
                {agent.status === 'SUSPENDED' ? '▶ Activar' : '⏸ Suspender'}
              </button>
              <button
                onClick={() => setAgentStatus(name, 'IDLE', null)}
                disabled={agent.status === 'IDLE'}
                className="font-mono text-[10px] px-3 py-1.5 rounded border border-gray-700 text-gray-500 hover:border-gray-500 transition-colors disabled:opacity-30"
              >
                ↺ Reiniciar
              </button>
            </div>
          )}
        </div>
      )}
    </motion.div>
  )
}

export default function PantheonPanel(): JSX.Element {
  const { agents, auditRecords, missions } = useHadesStore()
  const agentNames: AgentName[] = ['HADES', 'CERBERUS', 'CHARON', 'PERSEPHONE', 'MINOS', 'ELYSIUM', 'TARTARUS']
  const activeCount = Object.values(agents).filter(a => a.status !== 'IDLE' && a.status !== 'SUSPENDED').length

  const stats = {
    total:    agentNames.length,
    active:   activeCount,
    missions: missions.length,
    audits:   auditRecords.length,
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-mono text-sm font-bold text-gray-200 tracking-[0.15em]">PANTHEON</h2>
          <p className="text-[11px] text-gray-600 font-mono">Gestión y estado operativo de todos los agentes IA</p>
        </div>
        <div className="flex gap-2 items-center">
          <span className={`font-mono text-[10px] px-2 py-1 rounded border ${
            activeCount > 0 ? 'text-electric border-electric/30 animate-pulse' : 'text-gray-600 border-gray-800'
          }`}>
            {activeCount}/{stats.total} activos
          </span>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-4 gap-3">
        <div className="hades-card rounded-lg p-3 text-center">
          <p className="font-mono text-xl font-bold text-gold">{stats.total}</p>
          <p className="font-mono text-[9px] text-gray-600">Agentes</p>
        </div>
        <div className="hades-card rounded-lg p-3 text-center">
          <p className="font-mono text-xl font-bold text-electric">{stats.active}</p>
          <p className="font-mono text-[9px] text-gray-600">Activos</p>
        </div>
        <div className="hades-card rounded-lg p-3 text-center">
          <p className="font-mono text-xl font-bold text-permit">{stats.missions}</p>
          <p className="font-mono text-[9px] text-gray-600">Misiones</p>
        </div>
        <div className="hades-card rounded-lg p-3 text-center">
          <p className="font-mono text-xl font-bold text-gray-400">{stats.audits}</p>
          <p className="font-mono text-[9px] text-gray-600">Decisiones</p>
        </div>
      </div>

      {/* Agent grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
        {agentNames.map(n => <AgentCard key={n} name={n} />)}
      </div>

      <p className="font-mono text-[9px] text-gray-700 text-center mt-2">
        Los controles de activación/suspensión afectan únicamente la simulación local · No modifican producción
      </p>
    </div>
  )
}
