import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import HolographicCore from '../components/HolographicCore.js'
import { useHadesStore } from '../store/index.js'
import type { AgentName, AgentState, AuditRecord, NEARTx, Mission, MissionTask } from '../store/index.js'
import type { SubAgent } from '../components/HolographicCore3D.js'

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

const AGENT_NAMES: AgentName[] = ['HADES', 'CHARON', 'PERSEPHONE', 'MINOS', 'CERBERUS', 'ELYSIUM', 'TARTARUS']

const AGENT_META: Record<AgentName, { role: string; symbol: string }> = {
  HADES:      { role: 'Orquestador Central',       symbol: '⬡' },
  CHARON:     { role: 'Compras & Proveedores',     symbol: '⚡' },
  PERSEPHONE: { role: 'Finanzas & Presupuesto',    symbol: '◈' },
  MINOS:      { role: 'Validación & Políticas',    symbol: '⚖' },
  CERBERUS:   { role: 'Políticas & Auditoría',     symbol: '◉' },
  ELYSIUM:    { role: 'Planificación Táctica',     symbol: '◎' },
  TARTARUS:   { role: 'Seguridad & Anomalías',     symbol: '▲' },
}

const STATUS_LABELS: Record<AgentState['status'], string> = {
  IDLE:      'INACTIVO',
  THINKING:  'ANALIZANDO',
  EXECUTING: 'EJECUTANDO',
  WAITING:   'ESPERANDO',
  ERROR:     'ERROR',
  SUSPENDED: 'SUSPENDIDO',
}

const POLICIES = ['R-001', 'R-002', 'R-003', 'R-004', 'R-005', 'R-006', 'R-007', 'R-008']

const STAGE_TIMELINE: { agent: AgentName; task: string; progressTarget: number; delayMs: number }[] = [
  { agent: 'HADES',      task: 'Analizando misión y distribuyendo tareas',  progressTarget: 12, delayMs: 0    },
  { agent: 'CHARON',     task: 'Evaluando proveedores y cotizaciones',       progressTarget: 35, delayMs: 900  },
  { agent: 'PERSEPHONE', task: 'Validando presupuesto disponible',           progressTarget: 55, delayMs: 2100 },
  { agent: 'MINOS',      task: 'Revisando políticas CERBERUS',              progressTarget: 70, delayMs: 3200 },
  { agent: 'ELYSIUM',    task: 'Generando plan táctico de adquisición',      progressTarget: 85, delayMs: 4400 },
  { agent: 'TARTARUS',   task: 'Análisis de anomalías y riesgos',            progressTarget: 97, delayMs: 5500 },
]

// ─── UTILITIES ───────────────────────────────────────────────────────────────

function downloadReport(mission: Mission, records: AuditRecord[], txs: NEARTx[]): void {
  const data = {
    meta: { platform: 'HADES OMEGA v0.3.0', mode: 'DEMO — NEAR TESTNET SIMULACIÓN', generatedAt: new Date().toISOString() },
    mission: { ...mission, createdAt: new Date(mission.createdAt).toISOString() },
    cerberusAuditRecords: records,
    nearTransactions: txs.map(tx => ({
      ...tx,
      note: 'SIMULACIÓN — No es una transacción real en NEAR Protocol',
    })),
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `hades-mision-${mission.id.slice(0, 8)}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ─── STATUS BAR ──────────────────────────────────────────────────────────────

function StatusBar({
  apiReady, serverlessMode, wsConnected, activeAgentCount,
}: {
  apiReady: boolean | null
  serverlessMode: boolean
  wsConnected: boolean
  activeAgentCount: number
}): JSX.Element {
  const apiLabel  = apiReady === null  ? 'API VERIFICANDO…'
    : apiReady             ? (serverlessMode ? 'API SERVERLESS' : 'API CONECTADA')
    : 'API INACTIVA'
  const apiColor  = apiReady === null  ? 'text-gray-500 border-gray-700'
    : apiReady             ? 'text-electric border-electric/30 bg-electric/5'
    : 'text-deny border-deny/30 bg-deny/5'
  const apiDot    = apiReady === null  ? 'bg-gray-600'
    : apiReady             ? 'bg-electric animate-pulse'
    : 'bg-deny animate-pulse'

  const connLabel = serverlessMode ? 'SERVERLESS' : wsConnected ? 'WS ACTIVO' : 'WS INACTIVO'
  const connColor = serverlessMode
    ? 'text-gold border-gold/30 bg-gold/5'
    : wsConnected
    ? 'text-electric border-electric/30 bg-electric/5'
    : 'text-gray-500 border-gray-700'

  return (
    <div className="flex items-center gap-2 flex-wrap py-1">
      {/* API status */}
      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-mono text-[11px] ${apiColor}`}>
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${apiDot}`} />
        {apiLabel}
      </div>

      {/* CERBERUS */}
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-mono text-[11px] text-electric border-electric/30 bg-electric/5">
        <span className="w-1.5 h-1.5 rounded-full bg-electric animate-pulse" />
        CERBERUS ACTIVO · 8 POLÍTICAS
      </div>

      {/* NEAR */}
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-mono text-[11px] text-gold border-gold/30 bg-gold/5">
        <span className="w-1.5 h-1.5 rounded-full bg-gold" />
        NEAR TESTNET · SIMULACIÓN
      </div>

      {/* Connection mode */}
      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-mono text-[11px] ${connColor}`}>
        {serverlessMode ? '⬡' : wsConnected ? '◉' : '○'} {connLabel}
      </div>

      <div className="ml-auto flex items-center gap-2">
        {activeAgentCount > 0 && (
          <span className="font-mono text-[11px] text-electric animate-pulse">
            {activeAgentCount} AGENTE{activeAgentCount > 1 ? 'S' : ''} ACTIVO{activeAgentCount > 1 ? 'S' : ''}
          </span>
        )}
        <span className="badge-demo">MODO DEMO</span>
        <span className="font-mono text-[10px] text-gray-600">v0.3.0</span>
      </div>
    </div>
  )
}

// ─── AGENT ROW ───────────────────────────────────────────────────────────────

function AgentRowItem({ agent }: { agent: AgentState }): JSX.Element {
  const meta    = AGENT_META[agent.name]
  const active  = agent.status !== 'IDLE'
  const isError = agent.status === 'ERROR'
  const isHades = agent.name === 'HADES'

  const dotColor    = isError ? 'bg-deny' : active ? (isHades ? 'bg-gold' : 'bg-electric') : 'bg-gray-700'
  const nameColor   = isHades ? 'text-gold' : active ? 'text-electric' : 'text-gray-300'
  const statusColor = isError ? 'text-deny' : active ? (isHades ? 'text-gold' : 'text-electric') : 'text-gray-600'

  return (
    <div className={`flex items-start gap-2.5 py-2 px-2.5 rounded transition-all duration-300 ${active ? 'bg-electric/5 border border-electric/15' : 'border border-transparent'}`}>
      <span className={`mt-[5px] w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor} ${active ? 'animate-pulse' : ''}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className={`font-mono text-[11px] font-semibold tracking-wider ${nameColor}`}>
            {meta.symbol} {agent.name}
          </span>
          <span className={`font-mono text-[10px] ${statusColor}`}>{STATUS_LABELS[agent.status]}</span>
        </div>
        <p className="text-[10px] text-gray-600 leading-tight">{meta.role}</p>
        {active && agent.currentTask && (
          <p className="mt-0.5 text-[10px] text-electric/80 truncate">{agent.currentTask}</p>
        )}
      </div>
    </div>
  )
}

// ─── AGENTS PANEL ────────────────────────────────────────────────────────────

function AgentsPanel({ agents }: { agents: Record<AgentName, AgentState> }): JSX.Element {
  return (
    <div className="hades-card rounded-lg overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-white/5 flex items-center justify-between">
        <span className="font-mono text-[11px] font-semibold text-gray-400 tracking-widest">PANTHEON</span>
        <span className="font-mono text-[10px] text-gray-600">6 AGENTES</span>
      </div>

      {/* Agent list */}
      <div className="flex-1 flex flex-col gap-0.5 p-2">
        {AGENT_NAMES.map(name => (
          <AgentRowItem key={name} agent={agents[name]} />
        ))}
      </div>

      {/* CERBERUS policies */}
      <div className="border-t border-white/5 px-3 py-2.5">
        <p className="font-mono text-[10px] text-gray-500 mb-2">CERBERUS GUARD — 8 POLÍTICAS</p>
        <div className="flex flex-wrap gap-1">
          {POLICIES.map(p => (
            <span key={p} className="font-mono text-[9px] text-electric/70 border border-electric/20 bg-electric/5 px-1.5 py-0.5 rounded">
              {p}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── AGENT DETAIL OVERLAY ────────────────────────────────────────────────────

const AGENT_ROLES: Record<AgentName, string> = {
  HADES:      'Orquestador Central',
  CHARON:     'Compras & Proveedores',
  PERSEPHONE: 'Finanzas & Presupuesto',
  MINOS:      'Validación & Políticas',
  CERBERUS:   'Políticas & Auditoría',
  ELYSIUM:    'Planificación Táctica',
  TARTARUS:   'Seguridad & Anomalías',
}

function AgentDetailOverlay({
  agentName,
  onClose,
  auditRecords,
}: {
  agentName: SubAgent
  onClose: () => void
  auditRecords: AuditRecord[]
}): JSX.Element {
  const agent  = useHadesStore(s => s.agents[agentName])
  const active = agent?.status !== 'IDLE'
  const recentRecords = auditRecords.filter(r => r.agentName === agentName).slice(0, 4)

  const statusColor = agent?.status === 'ERROR' ? 'text-deny'
    : agent?.status === 'WAITING'   ? 'text-escalate'
    : active                         ? 'text-electric'
    : 'text-gray-600'

  const STATUS_LABELS: Record<string, string> = {
    IDLE: 'INACTIVO', THINKING: 'ANALIZANDO', EXECUTING: 'EJECUTANDO',
    WAITING: 'ESPERANDO', ERROR: 'ERROR', SUSPENDED: 'SUSPENDIDO',
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      className="absolute bottom-0 right-0 w-52 m-3 bg-[#0D0D18] border border-electric/25 rounded-lg shadow-2xl z-10"
    >
      <div className="px-3 py-2.5 border-b border-white/5 flex items-center justify-between">
        <span className="font-mono text-[11px] text-electric font-bold">{agentName}</span>
        <button onClick={onClose} className="text-gray-600 hover:text-gray-400 text-xs">✕</button>
      </div>
      <div className="px-3 py-2.5 flex flex-col gap-2">
        <p className="text-[10px] text-gray-500">{AGENT_ROLES[agentName]}</p>
        <div className="flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-electric animate-pulse' : 'bg-gray-700'}`} />
          <span className={`font-mono text-[10px] ${statusColor}`}>{STATUS_LABELS[agent?.status ?? 'IDLE']}</span>
        </div>
        {active && agent?.currentTask && (
          <p className="text-[10px] text-electric/70 leading-snug">{agent.currentTask}</p>
        )}
        {recentRecords.length > 0 && (
          <div className="border-t border-white/5 pt-2 flex flex-col gap-1.5">
            <p className="font-mono text-[9px] text-gray-600 tracking-widest">ÚLTIMAS DECISIONES</p>
            {recentRecords.map(r => (
              <div key={r.id} className="flex items-center gap-1.5">
                <span className={`font-mono text-[8px] px-1 rounded ${
                  r.guardDecision === 'PERMIT' ? 'bg-permit/20 text-permit' :
                  r.guardDecision === 'DENY'   ? 'bg-deny/20 text-deny' :
                  'bg-escalate/20 text-escalate'
                }`}>{r.guardDecision}</span>
                <span className="text-[9px] text-gray-600 truncate">{r.operationType}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ─── CORE PANEL ──────────────────────────────────────────────────────────────

function CorePanel({
  anyActive,
  selectedAgent,
  onAgentSelect,
  auditRecords,
}: {
  anyActive: boolean
  selectedAgent: SubAgent | null
  onAgentSelect: (name: SubAgent) => void
  auditRecords: AuditRecord[]
}): JSX.Element {
  return (
    <div className="hades-card rounded-lg overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${anyActive ? 'bg-gold animate-pulse' : 'bg-gray-700'}`} />
          <span className="font-mono text-[12px] font-bold text-gray-300 tracking-[0.2em]">HADES CORE</span>
        </div>
        <div className="flex items-center gap-2">
          {selectedAgent && (
            <span className="font-mono text-[10px] text-electric">⬡ {selectedAgent}</span>
          )}
          <span className={`font-mono text-[10px] tracking-wider ${anyActive ? 'text-electric animate-pulse' : 'text-gray-600'}`}>
            {anyActive ? '◉ PROCESANDO' : '○ EN ESPERA'}
          </span>
        </div>
      </div>

      {/* 3D holographic core — tall container */}
      <div
        className="flex-1 min-h-[480px] relative"
        style={{
          background: 'radial-gradient(ellipse 80% 70% at 50% 50%, rgba(0,212,255,0.045) 0%, rgba(255,215,0,0.02) 35%, rgba(10,10,15,0) 70%)',
        }}
      >
        <HolographicCore selectedAgent={selectedAgent} onAgentSelect={onAgentSelect} />

        {/* Grid lines — masked */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: [
              'linear-gradient(rgba(0,212,255,0.07) 1px, transparent 1px)',
              'linear-gradient(90deg, rgba(0,212,255,0.07) 1px, transparent 1px)',
            ].join(', '),
            backgroundSize: '52px 52px',
            WebkitMaskImage: 'radial-gradient(ellipse 65% 60% at 50% 50%, transparent 40%, rgba(0,0,0,0.6) 70%, black 100%)',
            maskImage:       'radial-gradient(ellipse 65% 60% at 50% 50%, transparent 40%, rgba(0,0,0,0.6) 70%, black 100%)',
          }}
        />

        {/* Corner brackets */}
        <div className="absolute top-3 left-3 w-5 h-5 border-t-2 border-l-2 border-electric/25 pointer-events-none rounded-tl" />
        <div className="absolute top-3 right-3 w-5 h-5 border-t-2 border-r-2 border-electric/25 pointer-events-none rounded-tr" />
        <div className="absolute bottom-3 left-3 w-5 h-5 border-b-2 border-l-2 border-electric/25 pointer-events-none rounded-bl" />
        <div className="absolute bottom-3 right-3 w-5 h-5 border-b-2 border-r-2 border-electric/25 pointer-events-none rounded-br" />

        {/* Hint label */}
        {!selectedAgent && (
          <p className="absolute bottom-4 left-1/2 -translate-x-1/2 font-mono text-[9px] text-gray-700 pointer-events-none whitespace-nowrap">
            Haz clic en un agente para ver su estado
          </p>
        )}

        {/* Agent detail overlay */}
        <AnimatePresence>
          {selectedAgent && (
            <AgentDetailOverlay
              key={selectedAgent}
              agentName={selectedAgent}
              onClose={() => onAgentSelect(selectedAgent)}
              auditRecords={auditRecords}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-white/5 grid grid-cols-3 gap-0 text-center">
        <div className="flex flex-col gap-0.5">
          <p className="font-mono text-[9px] text-gray-600 tracking-widest uppercase">Sistema</p>
          <p className="font-mono text-[10px] text-gray-400">IA DISTRIBUIDA</p>
        </div>
        <div className="flex flex-col gap-0.5 border-x border-white/5">
          <p className="font-mono text-[9px] text-gray-600 tracking-widest uppercase">Red</p>
          <p className="font-mono text-[10px] text-gold/80">NEAR SIMULACIÓN</p>
        </div>
        <div className="flex flex-col gap-0.5">
          <p className="font-mono text-[9px] text-gray-600 tracking-widest uppercase">Motor</p>
          <p className="font-mono text-[10px] text-electric/80">CERBERUS v0.3</p>
        </div>
      </div>
    </div>
  )
}

// ─── METRIC BAR ──────────────────────────────────────────────────────────────

function MetricBar({ label, count, total, colorClass }: {
  label: string; count: number; total: number; colorClass: string
}): JSX.Element {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[10px] text-gray-500 w-16 flex-shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-obsidian-600 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${colorClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className={`font-mono text-sm font-bold w-6 text-right ${count > 0 ? colorClass.replace('bg-', 'text-') : 'text-gray-600'}`}>
        {count}
      </span>
    </div>
  )
}

// ─── ACTIVITY PANEL ──────────────────────────────────────────────────────────

function ActivityPanel({ permits, denies, escalations, totalDecisions, nearTxs, auditRecords }: {
  permits: number; denies: number; escalations: number
  totalDecisions: number; nearTxs: NEARTx[]; auditRecords: AuditRecord[]
}): JSX.Element {
  const lastRecords = auditRecords.slice(0, 4)

  return (
    <div className="hades-card rounded-lg overflow-hidden flex flex-col gap-0">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-white/5">
        <span className="font-mono text-[11px] font-semibold text-gray-400 tracking-widest">SEGURIDAD</span>
      </div>

      {/* CERBERUS decisions */}
      <div className="px-3 py-3 border-b border-white/5">
        <div className="flex items-center justify-between mb-2.5">
          <p className="font-mono text-[10px] text-gray-600">DECISIONES CERBERUS</p>
          <span className={`font-mono text-[10px] font-bold ${totalDecisions > 0 ? 'text-gray-300' : 'text-gray-600'}`}>
            {totalDecisions} total
          </span>
        </div>
        <div className="flex flex-col gap-2">
          <MetricBar label="PERMIT"   count={permits}     total={totalDecisions} colorClass="bg-permit"   />
          <MetricBar label="DENY"     count={denies}      total={totalDecisions} colorClass="bg-deny"     />
          <MetricBar label="ESCALATE" count={escalations} total={totalDecisions} colorClass="bg-escalate" />
        </div>
      </div>

      {/* NEAR */}
      <div className="px-3 py-2.5 border-b border-white/5">
        <p className="font-mono text-[10px] text-gray-600 mb-2">NEAR TESTNET</p>
        {nearTxs.length === 0 ? (
          <p className="text-[10px] text-gray-700">Sin transacciones aún</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {nearTxs.slice(0, 3).map(tx => (
              <a
                key={tx.auditId}
                href={tx.explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-[10px] font-mono text-blue-400 hover:text-blue-300 transition-colors"
              >
                <span className="text-gold text-[9px]">⬡</span>
                <span className="truncate">{tx.txHash.slice(0, 14)}…</span>
                <span className="badge-demo ml-auto flex-shrink-0">SIM</span>
              </a>
            ))}
            {nearTxs.length > 3 && (
              <p className="text-[10px] text-gray-600">+{nearTxs.length - 3} más</p>
            )}
          </div>
        )}
      </div>

      {/* Audit log */}
      <div className="px-3 py-2.5 flex-1">
        <p className="font-mono text-[10px] text-gray-600 mb-2">REGISTRO RECIENTE</p>
        {lastRecords.length === 0 ? (
          <p className="text-[10px] text-gray-700 leading-relaxed">
            Sin registros.<br />Inicia una misión para ver las decisiones de CERBERUS.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {lastRecords.map(r => (
              <div key={r.id} className="flex items-start gap-1.5">
                <span className={`font-mono text-[9px] flex-shrink-0 mt-0.5 px-1 rounded ${
                  r.guardDecision === 'PERMIT'   ? 'bg-permit/20 text-permit' :
                  r.guardDecision === 'DENY'     ? 'bg-deny/20 text-deny' :
                  'bg-escalate/20 text-escalate'
                }`}>{r.guardDecision}</span>
                <div className="min-w-0">
                  <p className="font-mono text-[10px] text-gray-400 truncate">{r.agentName}</p>
                  <p className="text-[9px] text-gray-600 truncate">{r.operationType}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── STAGE CARD ──────────────────────────────────────────────────────────────

function StageCard({ stageName, isActive, isDone }: {
  stageName: AgentName; isActive: boolean; isDone: boolean
}): JSX.Element {
  return (
    <div className={`rounded border px-2.5 py-2 text-center transition-all duration-300 ${
      isActive ? 'border-electric/50 bg-electric/10' :
      isDone   ? 'border-permit/25 bg-permit/5'      :
                 'border-white/5   bg-obsidian-800/50'
    }`}>
      <p className={`font-mono text-[10px] font-bold ${
        isActive ? 'text-electric' : isDone ? 'text-permit' : 'text-gray-600'
      }`}>
        {isActive ? '▶' : isDone ? '✓' : '○'} {stageName}
      </p>
    </div>
  )
}

// ─── EXECUTION TIMELINE ──────────────────────────────────────────────────────

function ExecutionTimeline({ missionTitle, animProgress, agents }: {
  missionTitle: string; animProgress: number; agents: Record<AgentName, AgentState>
}): JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-3"
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <p className="font-mono text-[10px] text-gray-500 tracking-widest">EJECUTANDO MISIÓN</p>
          <p className="text-sm text-gray-200 font-medium truncate max-w-md">{missionTitle}</p>
        </div>
        <div className="text-right">
          <p className="font-mono text-2xl font-bold text-electric">{animProgress}%</p>
          <p className="font-mono text-[10px] text-gray-600">completado</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-obsidian-600 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-electric rounded-full"
          animate={{ width: `${animProgress}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        />
      </div>

      {/* Stage grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {STAGE_TIMELINE.map(({ agent: stageName, progressTarget }) => {
          const isActive = agents[stageName]?.status === 'EXECUTING'
          const isDone   = !isActive && animProgress >= progressTarget
          return <StageCard key={stageName} stageName={stageName} isActive={isActive} isDone={isDone} />
        })}
      </div>

      <p className="text-[10px] text-gray-600 font-mono text-center animate-pulse">
        Procesando — CERBERUS evaluando políticas en tiempo real…
      </p>
    </motion.div>
  )
}

// ─── TASK RESULT CARD ────────────────────────────────────────────────────────

function TaskResultCard({ task }: { task: MissionTask }): JSX.Element {
  const ok   = task.status === 'EXECUTED'
  const fail = task.status === 'FAILED'
  return (
    <div className={`rounded border p-2.5 ${
      ok   ? 'border-permit/25 bg-permit/5'  :
      fail ? 'border-deny/25   bg-deny/5'    :
             'border-white/5   bg-obsidian-600/30'
    }`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`font-mono text-[10px] ${ok ? 'text-permit' : fail ? 'text-deny' : 'text-gray-600'}`}>
          {ok ? '✓' : fail ? '✗' : '○'}
        </span>
        <span className="font-mono text-[10px] font-bold text-gray-400">[{task.assignedTo}]</span>
      </div>
      <p className="text-[11px] text-gray-300 leading-tight">{task.title}</p>
      {task.result?.summary && (
        <p className="mt-1 text-[10px] text-gray-500 leading-tight line-clamp-2">{task.result.summary}</p>
      )}
    </div>
  )
}

// ─── MISSION RESULT PANEL ────────────────────────────────────────────────────

function MissionResultPanel({ mission, auditRecords, nearTxs, onNew }: {
  mission: Mission; auditRecords: AuditRecord[]; nearTxs: NEARTx[]
  onNew: () => void
}): JSX.Element {
  const permits    = auditRecords.filter(r => r.guardDecision === 'PERMIT').length
  const denies     = auditRecords.filter(r => r.guardDecision === 'DENY').length
  const escalations = auditRecords.filter(r => r.guardDecision === 'ESCALATE').length
  const isOk       = mission.status === 'COMPLETED' || mission.status === 'PARTIAL_COMPLETE'

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-3"
    >
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`font-mono text-[10px] tracking-widest ${isOk ? 'text-permit' : 'text-deny'}`}>
              {isOk ? '✓ MISIÓN COMPLETADA' : '⚠ MISIÓN PARCIAL'}
            </span>
            <span className="badge-demo">MODO DEMO</span>
          </div>
          <p className="text-sm text-gray-200 font-medium mt-0.5 truncate max-w-md">{mission.title}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => downloadReport(mission, auditRecords, nearTxs)}
            className="font-mono text-[11px] text-gold border border-gold/30 px-3 py-1.5 rounded hover:bg-gold/10 transition-colors flex items-center gap-1.5"
          >
            ↓ Descargar Reporte
          </button>
          <button
            onClick={onNew}
            className="font-mono text-[11px] text-gray-400 border border-white/10 px-3 py-1.5 rounded hover:border-gray-500 transition-colors"
          >
            + Nueva Misión
          </button>
        </div>
      </div>

      {/* 100% progress bar */}
      <div className="h-1 bg-obsidian-600 rounded-full overflow-hidden">
        <div className={`h-full w-full rounded-full ${isOk ? 'bg-permit' : 'bg-escalate'}`} />
      </div>

      {/* Tasks grid */}
      {mission.tasks.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {mission.tasks.slice(0, 5).map(task => (
            <TaskResultCard key={task.id} task={task} />
          ))}
        </div>
      )}

      {/* Summary footer */}
      <div className="flex items-center gap-3 flex-wrap text-[11px] font-mono text-gray-600 border-t border-white/5 pt-2">
        <span>CERBERUS: {auditRecords.length} decisiones</span>
        {permits > 0    && <span className="text-permit">PERMIT: {permits}</span>}
        {denies > 0     && <span className="text-deny">DENY: {denies}</span>}
        {escalations > 0 && <span className="text-escalate">ESCALATE: {escalations}</span>}
        <span>NEAR: {nearTxs.length} TXs</span>
        <span className="badge-demo ml-auto">SIMULACIÓN</span>
      </div>
    </motion.div>
  )
}

// ─── MISSION CREATION FORM ───────────────────────────────────────────────────

function MissionForm({ form, setForm, onExecute, onCancel, loading }: {
  form: { title: string; description: string; budget: string }
  setForm: (f: (prev: any) => any) => void
  onExecute: () => void
  onCancel: () => void
  loading: boolean
}): JSX.Element {
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="hades-card-elevated border border-electric/25 rounded-lg p-4 flex flex-col gap-3"
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-[11px] text-electric tracking-widest">NUEVA MISIÓN</span>
        <button onClick={onCancel} className="text-gray-600 hover:text-gray-400 text-sm font-mono transition-colors">✕</button>
      </div>

      <input
        className="bg-obsidian border border-obsidian-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-electric/50 transition-colors"
        placeholder="Título de la misión"
        value={form.title}
        onChange={e => setForm((f: any) => ({ ...f, title: e.target.value }))}
      />

      <textarea
        className="bg-obsidian border border-obsidian-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-electric/50 resize-none transition-colors"
        placeholder="Descripción, contexto y requerimientos"
        rows={3}
        value={form.description}
        onChange={e => setForm((f: any) => ({ ...f, description: e.target.value }))}
      />

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 flex-1">
          <label className="font-mono text-[11px] text-gray-500 whitespace-nowrap">Presupuesto MXN</label>
          <input
            type="number"
            className="flex-1 bg-obsidian border border-obsidian-700 rounded px-3 py-1.5 text-sm text-gray-200 focus:outline-none focus:border-electric/50 transition-colors"
            value={form.budget}
            onChange={e => setForm((f: any) => ({ ...f, budget: e.target.value }))}
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={onExecute}
            disabled={loading || !form.title.trim()}
            className="bg-electric/15 border border-electric/50 text-electric font-mono text-[11px] px-4 py-2 rounded hover:bg-electric/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? '⏳ PROCESANDO…' : '▶ EJECUTAR MISIÓN'}
          </button>
        </div>
      </div>

      <p className="font-mono text-[10px] text-gray-700">
        CERBERUS evaluará todas las políticas · NEAR registrará en testnet (SIMULACIÓN)
      </p>
    </motion.div>
  )
}

// ─── MISSIONS PANEL ──────────────────────────────────────────────────────────

function MissionsPanel({
  phase, form, setForm, animProgress, agents,
  activeMission, auditRecords, nearTxs,
  onNew, onDemo, onCancel, onCreate, onReset,
}: {
  phase: 'idle' | 'form' | 'executing' | 'done'
  form: { title: string; description: string; budget: string }
  setForm: (f: (prev: any) => any) => void
  animProgress: number
  agents: Record<AgentName, AgentState>
  activeMission: Mission | null
  auditRecords: AuditRecord[]
  nearTxs: NEARTx[]
  onNew: () => void
  onDemo: () => void
  onCancel: () => void
  onCreate: () => void
  onReset: () => void
}): JSX.Element {
  return (
    <div className="hades-card rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-white/5 flex items-center justify-between flex-wrap gap-2">
        <span className="font-mono text-[11px] font-semibold text-gray-400 tracking-widest">
          DOMINION — CONTROL DE MISIONES
        </span>
        {phase === 'idle' && (
          <div className="flex items-center gap-2">
            <button
              onClick={onNew}
              className="font-mono text-[11px] text-electric border border-electric/30 px-3 py-1.5 rounded hover:bg-electric/10 transition-colors"
            >
              + Nueva Misión
            </button>
            <button
              onClick={onDemo}
              className="font-mono text-[11px] text-gold border border-gold/30 px-3 py-1.5 rounded hover:bg-gold/10 transition-colors"
            >
              ▶ Demo: TechCore Industries $50k
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <AnimatePresence mode="wait">
          {phase === 'idle' && (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center py-6 flex flex-col items-center gap-3"
            >
              <div className="w-10 h-10 rounded-full border border-electric/20 flex items-center justify-center text-electric/40 text-lg">
                ⬡
              </div>
              <p className="text-gray-500 text-sm">Plataforma lista · Sin misiones activas</p>
              <p className="text-gray-600 text-xs font-mono max-w-sm">
                Crea una misión para ver el flujo completo: CERBERUS evaluará políticas,
                los 6 agentes procesarán en paralelo y NEAR registrará las decisiones en testnet.
              </p>
            </motion.div>
          )}

          {phase === 'form' && (
            <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <MissionForm
                form={form}
                setForm={setForm}
                onExecute={onCreate}
                onCancel={onCancel}
                loading={false}
              />
            </motion.div>
          )}

          {phase === 'executing' && (
            <motion.div key="exec" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <ExecutionTimeline
                missionTitle={form.title}
                animProgress={animProgress}
                agents={agents}
              />
            </motion.div>
          )}

          {phase === 'done' && activeMission && (
            <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <MissionResultPanel
                mission={activeMission}
                auditRecords={auditRecords}
                nearTxs={nearTxs}
                onNew={onReset}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ─── DASHBOARD ───────────────────────────────────────────────────────────────

interface FormState {
  title:       string
  description: string
  budget:      string
}

export default function Dashboard(): JSX.Element {
  const { agents, missions, auditRecords, nearTxs, wsConnected, serverlessMode, apiReady } = useHadesStore()

  const [phase,         setPhase]         = useState<'idle' | 'form' | 'executing' | 'done'>('idle')
  const [form,          setForm]          = useState<FormState>({ title: '', description: '', budget: '50000' })
  const [animProgress,  setAnimProgress]  = useState(0)
  const [lastMissionId, setLastMissionId] = useState<string | null>(null)
  const [selectedAgent, setSelectedAgent] = useState<SubAgent | null>(null)
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([])

  const activeAgentCount = Object.values(agents).filter(a => a.status !== 'IDLE').length
  const anyActive        = activeAgentCount > 0
  const activeMission    = lastMissionId ? missions.find(m => m.id === lastMissionId) ?? null : null

  // Derived totals
  const totalDecisions = auditRecords.length
  const permits        = auditRecords.filter(r => r.guardDecision === 'PERMIT').length
  const denies         = auditRecords.filter(r => r.guardDecision === 'DENY').length
  const escalations    = auditRecords.filter(r => r.guardDecision === 'ESCALATE').length

  function startStageAnimation(): void {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []

    STAGE_TIMELINE.forEach(({ agent, task, progressTarget, delayMs }, idx) => {
      const t = setTimeout(() => {
        // Reset previous agent
        if (idx > 0) {
          useHadesStore.getState().setAgentStatus(STAGE_TIMELINE[idx - 1].agent, 'IDLE', null)
        }
        setAnimProgress(progressTarget)
        useHadesStore.getState().setAgentStatus(agent, 'EXECUTING', task)
      }, delayMs)
      timersRef.current.push(t)
    })
  }

  function stopStageAnimation(): void {
    timersRef.current.forEach(clearTimeout)
    timersRef.current = []
    AGENT_NAMES.forEach(name => useHadesStore.getState().setAgentStatus(name, 'IDLE', null))
  }

  async function createMission(): Promise<void> {
    if (!form.title.trim()) return
    setPhase('executing')
    setAnimProgress(0)
    startStageAnimation()

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const apiBase = (import.meta as any).env?.VITE_API_URL ?? ''
      const res = await fetch(`${apiBase}/api/v1/missions`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          title:       form.title,
          description: form.description || `Misión de evaluación: ${form.title}`,
          budgetLimit: Number(form.budget) || 50000,
        }),
      })
      const json = await res.json()
      stopStageAnimation()
      setAnimProgress(100)

      if (json.success) {
        const m     = json.data
        const tasks = (m.tasks ?? []).map((t: any) => ({
          id: t.id, title: t.title, assignedTo: t.assignedTo, status: t.status, result: t.result,
        }))
        const done     = tasks.filter((t: any) => t.status === 'EXECUTED' || t.status === 'FAILED').length
        const progress = tasks.length ? Math.round((done / tasks.length) * 100) : 0

        const store = useHadesStore.getState()
        store.addMission({ id: m.id, title: m.title, description: m.description, status: m.status, progress, createdAt: m.createdAt, tasks })
        json.auditRecords?.forEach((r: any) => store.addAuditRecord(r))
        json.nearTxs?.forEach((tx: any) => store.addNearTx({ auditId: tx.auditId, txHash: tx.txHash, explorerUrl: tx.explorerUrl }))

        setLastMissionId(m.id)
        setPhase('done')
        setForm({ title: '', description: '', budget: '50000' })
      } else {
        throw new Error(json.error?.message ?? 'Error desconocido del servidor')
      }
    } catch (e: any) {
      stopStageAnimation()
      useHadesStore.getState().addNotification('error', `Error al crear misión: ${e.message}`)
      setPhase('idle')
    }
  }

  function startDemo(): void {
    setForm({
      title:       'Evaluar proveedores de infraestructura cloud',
      description: 'TechCore Industries requiere evaluar 3 proveedores de servidores cloud con presupuesto de $50,000 MXN. Criterios: precio, rendimiento y disponibilidad. Ejecutar evaluación CERBERUS completa con revisión de políticas R-001 a R-008.',
      budget:      '50000',
    })
    setPhase('form')
  }

  function resetMissions(): void {
    setPhase('idle')
    setLastMissionId(null)
    setAnimProgress(0)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Status bar */}
      <StatusBar
        apiReady={apiReady}
        serverlessMode={serverlessMode}
        wsConnected={wsConnected}
        activeAgentCount={activeAgentCount}
      />

      {/* 3-column grid: Agents | Core | Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_260px] gap-4">
        <AgentsPanel agents={agents} />
        <CorePanel
          anyActive={anyActive}
          selectedAgent={selectedAgent}
          onAgentSelect={name => setSelectedAgent(prev => prev === name ? null : name)}
          auditRecords={auditRecords}
        />
        <ActivityPanel
          permits={permits}
          denies={denies}
          escalations={escalations}
          totalDecisions={totalDecisions}
          nearTxs={nearTxs}
          auditRecords={auditRecords}
        />
      </div>

      {/* Missions panel */}
      <MissionsPanel
        phase={phase}
        form={form}
        setForm={setForm}
        animProgress={animProgress}
        agents={agents}
        activeMission={activeMission}
        auditRecords={auditRecords}
        nearTxs={nearTxs}
        onNew={() => setPhase('form')}
        onDemo={startDemo}
        onCancel={() => setPhase('idle')}
        onCreate={createMission}
        onReset={resetMissions}
      />
    </div>
  )
}
