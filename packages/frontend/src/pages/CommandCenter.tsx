import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from 'react-router-dom'
import HolographicCore from '../components/HolographicCore.js'
import { useHadesStore } from '../store/index.js'
import type { AgentName, AgentState, AuditRecord } from '../store/index.js'
import type { SubAgent } from '../components/HolographicCore3D.js'
import { apiHeaders, apiPath } from '../lib/api.js'
import { TASK_COLUMNS, taskColumn, isPendingReview, taskDescription } from '../lib/commandCenter.js'

// ─── TYPES ───────────────────────────────────────────────────────────────────

interface SystemHealth {
  apiOk: boolean | null
  wsClients: number | null
  version: string | null
  lastCheck: number | null
  error: string | null
}

interface LocalMission {
  id: string
  title: string
  status: string
  ownerId: string
  createdAt: number
  context?: { tags?: string[] }
  tasks: { id: string; title?: string; assignedTo?: string; dependsOn?: string[]; status: string; result?: { summary?: string; data?: { sha256?: string } } }[]
}

interface PendingApproval {
  id: string
  missionId: string
  ownerId: string
  input: string
  createdAt?: string
}

interface DocResult {
  id: string
  filename: string
  status: string
  createdAt: number
}

interface ApiAgent {
  name: string
  id: string
  status: string
  currentTask: unknown
}

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

const AGENT_NAMES: AgentName[] = ['HADES', 'CHARON', 'PERSEPHONE', 'MINOS', 'CERBERUS', 'ELYSIUM', 'TARTARUS']

const AGENT_META: Record<AgentName, { role: string; symbol: string; color: string }> = {
  HADES:      { role: 'Orquestador Central',    symbol: '⬡', color: 'text-gold' },
  CHARON:     { role: 'Compras & Proveedores',  symbol: '⚡', color: 'text-electric' },
  PERSEPHONE: { role: 'Finanzas & Presupuesto', symbol: '◈', color: 'text-electric' },
  MINOS:      { role: 'Validación & Políticas', symbol: '⚖', color: 'text-electric' },
  CERBERUS:   { role: 'Políticas & Auditoría',  symbol: '◉', color: 'text-escalate' },
  ELYSIUM:    { role: 'Planificación Táctica',  symbol: '◎', color: 'text-electric' },
  TARTARUS:   { role: 'Seguridad & Anomalías',  symbol: '▲', color: 'text-deny' },
}

const STATUS_LABELS: Record<string, string> = {
  IDLE: 'INACTIVO', THINKING: 'ANALIZANDO', EXECUTING: 'EJECUTANDO',
  WAITING: 'ESPERANDO', ERROR: 'ERROR', SUSPENDED: 'SUSPENDIDO', UNKNOWN: 'DESCONOCIDO',
}

const MISSION_STATUS_COLORS: Record<string, string> = {
  CREATED: 'text-gray-400',
  QUEUED: 'text-escalate',
  RUNNING: 'text-electric',
  WAITING_APPROVAL: 'text-escalate',
  APPROVED: 'text-permit',
  COMPLETED: 'text-permit',
  FAILED: 'text-deny',
  CANCELLED: 'text-gray-600',
}

// Kanban columns for task states
const KANBAN_COLUMNS = TASK_COLUMNS

// ─── SECTION HEADER ──────────────────────────────────────────────────────────

function SectionHeader({ title, badge, children }: { title: string; badge?: string | number; children?: React.ReactNode }): JSX.Element {
  return (
    <div className="px-3 py-2.5 border-b border-white/5 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] font-semibold text-gray-400 tracking-widest">{title}</span>
        {badge !== undefined && (
          <span className="font-mono text-[9px] bg-electric/10 text-electric border border-electric/20 px-1.5 py-0.5 rounded-full">
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

// ─── SYSTEM HEALTH PANEL (Etapa 7) ───────────────────────────────────────────

function SystemHealthPanel({ health, wsConnected, activeMissions }: {
  health: SystemHealth
  wsConnected: boolean
  activeMissions: number
}): JSX.Element {
  const apiColor = health.apiOk === null ? 'text-gray-500'
    : health.apiOk ? 'text-permit' : 'text-deny'
  const apiLabel = health.apiOk === null ? 'VERIFICANDO…'
    : health.apiOk ? 'OPERATIVA' : 'INACCESIBLE'

  const rows: { label: string; value: string; color: string }[] = [
    { label: 'API FASTIFY', value: apiLabel, color: apiColor },
    { label: 'WEBSOCKET',   value: wsConnected ? 'CONECTADO' : 'DESCONECTADO', color: wsConnected ? 'text-permit' : 'text-deny' },
    { label: 'WS CLIENTES', value: health.wsClients !== null ? String(health.wsClients) : '—', color: 'text-gray-300' },
    { label: 'MISIONES ACTIVAS', value: String(activeMissions), color: activeMissions > 0 ? 'text-electric' : 'text-gray-600' },
    { label: 'VERSIÓN',     value: health.version ?? '—', color: 'text-gray-400' },
  ]

  return (
    <div className="hades-card rounded-lg overflow-hidden">
      <SectionHeader title="SALUD DEL SISTEMA">
        {health.lastCheck && (
          <span className="font-mono text-[9px] text-gray-600">
            {new Date(health.lastCheck).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        )}
      </SectionHeader>
      <div className="p-3 flex flex-col gap-1.5">
        {rows.map(r => (
          <div key={r.label} className="flex items-center justify-between">
            <span className="font-mono text-[10px] text-gray-600">{r.label}</span>
            <span className={`font-mono text-[10px] font-semibold ${r.color}`}>{r.value}</span>
          </div>
        ))}
        {health.error && (
          <p className="mt-1 font-mono text-[9px] text-deny/70 break-all">{health.error}</p>
        )}
      </div>
    </div>
  )
}

// ─── AGENT MONITOR PANEL (Etapa 3) ───────────────────────────────────────────

function AgentMonitorPanel({ agents, apiAgents }: {
  agents: Record<AgentName, AgentState>
  apiAgents: ApiAgent[] | null
}): JSX.Element {
  const getApiStatus = (name: string) => apiAgents?.find(a => a.name === name)

  return (
    <div className="hades-card rounded-lg overflow-hidden">
      <SectionHeader title="MONITOR DE AGENTES" badge={AGENT_NAMES.length}>
        <span className="font-mono text-[9px] text-gray-600">
          {apiAgents ? 'API' : 'SIN TELEMETRÍA'}
        </span>
      </SectionHeader>
      <div className="p-2 flex flex-col gap-0.5">
        {AGENT_NAMES.map(name => {
          const agent   = agents[name]
          const apiData = getApiStatus(name)
          const status  = apiData ? agent.status : 'UNKNOWN'
          const task    = apiData ? agent.currentTask : null
          const meta    = AGENT_META[name]
          const isActive = status !== 'IDLE' && status !== 'UNKNOWN'
          const isError  = status === 'ERROR'

          const dotColor = isError ? 'bg-deny' : isActive ? (name === 'HADES' ? 'bg-gold' : 'bg-electric') : 'bg-gray-700'
          const labelColor = isError ? 'text-deny' : isActive ? meta.color : 'text-gray-600'

          return (
            <div key={name} className={`flex items-start gap-2 py-1.5 px-2 rounded transition-all ${isActive ? 'bg-electric/5 border border-electric/10' : 'border border-transparent'}`}>
              <span className={`mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotColor} ${isActive ? 'animate-pulse' : ''}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className={`font-mono text-[10px] font-semibold ${labelColor}`}>
                    {meta.symbol} {name}
                  </span>
                  <span className={`font-mono text-[9px] ${labelColor}`}>
                    {STATUS_LABELS[status] ?? status}
                  </span>
                </div>
                <p className="text-[9px] text-gray-700 leading-tight">{meta.role}</p>
                {isActive && task && (
                  <p className="mt-0.5 text-[9px] text-electric/70 truncate">{task}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── MISSION CONTROL PANEL (Etapa 2) ─────────────────────────────────────────

function MissionControlPanel({ missions, onRefresh, busy }: {
  missions: LocalMission[]
  onRefresh: () => void
  busy: boolean
}): JSX.Element {
  const [creating, setCreating] = useState(false)
  const [title, setTitle]       = useState('')
  const [input, setInput]       = useState('')
  const [notice, setNotice]     = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function createMission(): Promise<void> {
    if (!title.trim() || !input.trim()) return
    setSubmitting(true)
    setNotice('')
    try {
      const res = await fetch(apiPath('/api/v1/local-missions'), {
        method: 'POST',
        headers: apiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ title: title.trim(), input: input.trim() }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error?.message ?? `HTTP ${res.status}`)
      }
      setTitle('')
      setInput('')
      setCreating(false)
      setNotice('Misión creada — esperando aprobación ADMIN')
      onRefresh()
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : 'Error al crear misión')
    } finally {
      setSubmitting(false)
    }
  }

  async function cancelMission(id: string): Promise<void> {
    const reason = window.prompt('Motivo de cancelación (mínimo 3 caracteres):')?.trim()
    if (!reason || reason.length < 3) return
    try {
      const res = await fetch(apiPath(`/api/v1/local-missions/${encodeURIComponent(id)}/cancel`), {
        method: 'POST',
        headers: apiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ reason }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setNotice('Misión cancelada antes de ejecutar')
      onRefresh()
    } catch (e: unknown) {
      setNotice(e instanceof Error ? e.message : 'Error al cancelar')
    }
  }

  return (
    <div className="hades-card rounded-lg overflow-hidden">
      <SectionHeader title="CONTROL DE MISIONES" badge={missions.length}>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCreating(c => !c)}
            className="font-mono text-[10px] text-electric border border-electric/30 px-2 py-1 rounded hover:bg-electric/10 transition-colors"
          >
            {creating ? '✕ CANCELAR' : '+ NUEVA MISIÓN'}
          </button>
          <button
            onClick={onRefresh}
            disabled={busy}
            className="font-mono text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
            aria-label="Actualizar misiones"
          >
            ↺
          </button>
        </div>
      </SectionHeader>

      <div className="p-3 flex flex-col gap-2">
        <AnimatePresence>
          {creating && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="border border-electric/20 rounded-lg p-3 flex flex-col gap-2 mb-2 bg-electric/5">
                <span className="font-mono text-[10px] text-electric">NUEVA MISIÓN LOCAL</span>
                <input
                  className="bg-obsidian border border-obsidian-700 rounded px-2 py-1.5 text-[11px] text-gray-200 placeholder-gray-700 focus:outline-none focus:border-electric/50"
                  placeholder="Título de la operación"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  maxLength={200}
                />
                <textarea
                  className="bg-obsidian border border-obsidian-700 rounded px-2 py-1.5 text-[11px] text-gray-200 placeholder-gray-700 focus:outline-none focus:border-electric/50 resize-none"
                  placeholder="Datos de entrada para la operación"
                  rows={3}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                />
                <button
                  onClick={() => void createMission()}
                  disabled={submitting || !title.trim() || !input.trim()}
                  className="font-mono text-[10px] text-gold border border-gold/30 px-3 py-1.5 rounded hover:bg-gold/10 transition-colors disabled:opacity-40"
                >
                  {submitting ? '⏳ ENVIANDO…' : '▶ SOLICITAR OPERACIÓN'}
                </button>
                <p className="font-mono text-[9px] text-gray-700">
                  La operación requerirá aprobación ADMIN antes de ejecutarse
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {notice && (
          <p role="status" className="font-mono text-[10px] text-escalate">{notice}</p>
        )}

        {missions.length === 0 ? (
          <p className="text-[10px] text-gray-700 font-mono py-2">Sin misiones activas</p>
        ) : (
          <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
            {missions.map(m => {
              const canCancel = !!m.context?.tags?.includes('local-sha256') && isPendingReview(m.status, m.tasks.map(t => t.status))
              const statusColor = MISSION_STATUS_COLORS[m.status] ?? 'text-gray-400'
              return (
                <div key={m.id} className="border border-white/5 rounded p-2 flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-mono text-[10px] text-gray-300 truncate flex-1">{m.title}</p>
                    <span className={`font-mono text-[9px] flex-shrink-0 ${statusColor}`}>{m.status}</span>
                  </div>
                  <p className="font-mono text-[9px] text-gray-600">
                    {new Date(m.createdAt).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}
                  </p>
                  {m.tasks.length > 0 && (
                    <div className="flex gap-1 flex-wrap">
                      {m.tasks.map((t) => (
                        <span key={t.id} className={`font-mono text-[8px] px-1 rounded ${
                          ['COMPLETED', 'EXECUTED'].includes(t.status) ? 'bg-permit/10 text-permit' :
                          t.status === 'FAILED'    ? 'bg-deny/10 text-deny' :
                          t.status === 'RUNNING'   ? 'bg-electric/10 text-electric' :
                          'bg-white/5 text-gray-600'
                        }`}>{t.status}</span>
                      ))}
                    </div>
                  )}
                  {m.tasks.map(t => t.result?.data?.sha256 ? <p key={t.id} className="font-mono text-[9px] text-electric break-all">SHA-256: {t.result.data.sha256}</p> : null)}
                  {canCancel && (
                    <button
                      onClick={() => void cancelMission(m.id)}
                      className="font-mono text-[9px] text-deny/70 hover:text-deny self-start mt-0.5 transition-colors"
                    >
                      ✕ Cancelar misión
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── APPROVALS KANBAN PANEL (Etapa 5) ────────────────────────────────────────

function ApprovalsKanban({ missions, pendingApprovals, onDecide, onRefresh, busy }: {
  missions: LocalMission[]
  pendingApprovals: PendingApproval[]
  onDecide: (id: string, status: 'APPROVED' | 'REJECTED') => Promise<void>
  onRefresh: () => void
  busy: boolean
}): JSX.Element {
  const allTasks = missions.flatMap(m =>
    m.tasks.map(t => ({ ...t, missionTitle: m.title, missionId: m.id }))
  )

  return (
    <div className="hades-card rounded-lg overflow-hidden">
      <SectionHeader title="FLUJO DE APROBACIONES" badge={pendingApprovals.length > 0 ? `${pendingApprovals.length} PENDIENTES` : undefined}>
        <button
          onClick={onRefresh}
          disabled={busy}
          className="font-mono text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
          aria-label="Actualizar aprobaciones"
        >
          ↺
        </button>
      </SectionHeader>

      {/* Pending approvals requiring decision */}
      {pendingApprovals.length > 0 && (
        <div className="p-3 border-b border-white/5">
          <p className="font-mono text-[10px] text-escalate mb-2">DECISIONES REQUERIDAS</p>
          <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
            {pendingApprovals.map(p => (
              <div key={p.id} className="border border-escalate/20 bg-escalate/5 rounded p-2 flex flex-col gap-1.5">
                <p className="font-mono text-[10px] text-gray-300 break-all whitespace-pre-wrap">{p.input}</p>
                <p className="font-mono text-[9px] text-gray-600">Misión: {p.missionId.slice(0, 8)}…</p>
                <div className="flex gap-2 mt-0.5">
                  <button
                    onClick={() => void onDecide(p.id, 'APPROVED')}
                    className="font-mono text-[9px] text-permit border border-permit/30 px-2 py-1 rounded hover:bg-permit/10 transition-colors"
                  >
                    ✓ APROBAR
                  </button>
                  <button
                    onClick={() => void onDecide(p.id, 'REJECTED')}
                    className="font-mono text-[9px] text-deny border border-deny/30 px-2 py-1 rounded hover:bg-deny/10 transition-colors"
                  >
                    ✗ RECHAZAR
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Kanban board */}
      <div className="p-3 overflow-x-auto">
        <div className="flex gap-2 min-w-[600px]">
          {KANBAN_COLUMNS.map(col => {
            const tasks = allTasks.filter(t => taskColumn(t.status) === col.key)
            return (
              <div key={col.key} className="flex-1 min-w-[100px]">
                <div className={`border-t-2 ${col.color} pb-1 mb-1.5`}>
                  <p className="font-mono text-[9px] text-gray-500 pt-1.5 text-center">{col.label}</p>
                  <p className="font-mono text-[10px] font-bold text-center text-gray-400">{tasks.length}</p>
                </div>
                <div className="flex flex-col gap-1">
                  {tasks.map((t, i) => (
                    <div key={i} className="bg-white/5 border border-white/5 rounded p-1.5">
                      <p className="font-mono text-[8px] text-gray-500 truncate">{t.missionTitle} · {t.title ?? t.id}</p>
                      <p className="font-mono text-[8px] text-gray-600">{t.assignedTo ?? '—'} · {t.status}</p>
                      {!!t.dependsOn?.length && <p className="font-mono text-[8px] text-gray-600">Dependencias: {t.dependsOn.length}</p>}
                      {t.result?.summary && (
                        <p className="font-mono text-[8px] text-gray-600 truncate mt-0.5">{t.result.summary}</p>
                      )}
                    </div>
                  ))}
                  {tasks.length === 0 && (
                    <div className="border border-dashed border-white/5 rounded p-1.5 text-center">
                      <span className="font-mono text-[8px] text-gray-700">—</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── DOCUMENTS & AUDIT PANEL (Etapa 6) ───────────────────────────────────────

function DocumentsAuditPanel({ docResults, auditRecords }: {
  docResults: DocResult[]
  auditRecords: AuditRecord[]
}): JSX.Element {
  const [tab, setTab] = useState<'docs' | 'audit'>('docs')

  return (
    <div className="hades-card rounded-lg overflow-hidden">
      <SectionHeader title="DOCUMENTOS · AUDITORÍA">
        <div className="flex gap-1">
          {(['docs', 'audit'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`font-mono text-[9px] px-2 py-0.5 rounded transition-colors ${
                tab === t
                  ? 'bg-electric/15 text-electric border border-electric/30'
                  : 'text-gray-600 hover:text-gray-400'
              }`}
            >
              {t === 'docs' ? 'ARCHIVOS' : 'TRAIL'}
            </button>
          ))}
        </div>
      </SectionHeader>

      <div className="p-3 max-h-56 overflow-y-auto">
        {tab === 'docs' ? (
          docResults.length === 0 ? (
            <div className="text-center py-4">
              <p className="text-[10px] text-gray-700">Sin documentos procesados</p>
              <Link to="/documents" className="font-mono text-[10px] text-electric hover:underline mt-1 block">
                → Ir al módulo de Documentos
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {docResults.map(d => (
                <div key={d.id} className="flex items-center gap-2 border border-white/5 rounded p-2">
                  <span className={`font-mono text-[9px] px-1 rounded ${
                    d.status === 'APPROVED' ? 'bg-permit/10 text-permit' :
                    d.status === 'REJECTED' ? 'bg-deny/10 text-deny' :
                    'bg-escalate/10 text-escalate'
                  }`}>{d.status}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-mono text-[10px] text-gray-300 truncate">{d.filename}</p>
                    <p className="font-mono text-[9px] text-gray-600">
                      {new Date(d.createdAt).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          auditRecords.length === 0 ? (
            <p className="text-[10px] text-gray-700 text-center py-4">Sin eventos de auditoría recibidos en esta sesión</p>
          ) : (
            <div className="flex flex-col gap-1">
              <p className="text-[9px] text-gray-600">Eventos recibidos en esta sesión; historial persistente no disponible aquí.</p>
              {auditRecords.slice(0, 20).map(r => (
                <div key={r.id} className="flex items-center gap-2 py-1 border-b border-white/5">
                  <span className={`font-mono text-[9px] px-1 rounded flex-shrink-0 ${
                    r.guardDecision === 'PERMIT'   ? 'bg-permit/10 text-permit' :
                    r.guardDecision === 'DENY'     ? 'bg-deny/10 text-deny' :
                    'bg-escalate/10 text-escalate'
                  }`}>{r.guardDecision}</span>
                  <span className="font-mono text-[9px] text-gray-500 flex-shrink-0 w-16 truncate">{r.agentName}</span>
                  <span className="font-mono text-[9px] text-gray-600 truncate flex-1">{r.operationType}</span>
                  <span className="font-mono text-[9px] text-gray-700 flex-shrink-0">
                    {new Date(r.timestamp).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  )
}

// ─── HOLOGRAPHIC NUCLEUS PANEL (Etapa 4) ─────────────────────────────────────

function HolographicNucleus({ anyActive, pendingCount, telemetryAvailable, paused, onTogglePaused, selectedAgent, onAgentSelect, auditRecords }: {
  anyActive: boolean
  telemetryAvailable: boolean
  pendingCount: number
  paused: boolean
  onTogglePaused: () => void
  selectedAgent: SubAgent | null
  onAgentSelect: (name: SubAgent) => void
  auditRecords: AuditRecord[]
}): JSX.Element {
  const systemState  = !telemetryAvailable ? 'SIN TELEMETRÍA' : pendingCount > 0 ? 'BAJO REVISIÓN'
    : anyActive ? 'MISIÓN ACTIVA'
    : 'OPERATIVO'
  const systemColor  = !telemetryAvailable ? 'text-gray-500' : pendingCount > 0 ? 'text-escalate'
    : anyActive ? 'text-electric'
    : 'text-permit'

  return (
    <div className="hades-card rounded-lg overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className={`w-2 h-2 rounded-full ${anyActive ? 'bg-gold animate-pulse' : 'bg-gray-700'}`} />
          <span className="font-mono text-[12px] font-bold text-gray-300 tracking-[0.2em]">HADES CORE</span>
          <span className={`font-mono text-[10px] ${systemColor}`}>{systemState}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onTogglePaused}
            className="font-mono text-[9px] text-gray-500 hover:text-electric border border-white/10 px-2 py-1 rounded transition-colors"
            aria-label={paused ? 'Reanudar animación' : 'Pausar animación'}
          >
            {paused ? '▶' : '⏸'}
          </button>
        </div>
      </div>

      <div
        className="relative flex-1 min-h-[320px]"
        style={{
          background: 'radial-gradient(ellipse 80% 70% at 50% 50%, rgba(0,212,255,0.04) 0%, rgba(255,215,0,0.02) 35%, transparent 70%)',
        }}
      >
        {telemetryAvailable ? <HolographicCore selectedAgent={selectedAgent} onAgentSelect={onAgentSelect} paused={paused} /> : <div className="absolute inset-0 flex items-center justify-center text-xs text-gray-500">Telemetría de agentes no disponible</div>}

        {/* Grid overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: [
              'linear-gradient(rgba(0,212,255,0.06) 1px, transparent 1px)',
              'linear-gradient(90deg, rgba(0,212,255,0.06) 1px, transparent 1px)',
            ].join(', '),
            backgroundSize: '52px 52px',
            WebkitMaskImage: 'radial-gradient(ellipse 65% 60% at 50% 50%, transparent 40%, rgba(0,0,0,0.6) 70%, black 100%)',
            maskImage: 'radial-gradient(ellipse 65% 60% at 50% 50%, transparent 40%, rgba(0,0,0,0.6) 70%, black 100%)',
          }}
        />

        {/* Corner brackets */}
        <div className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-electric/20 pointer-events-none" />
        <div className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-electric/20 pointer-events-none" />
        <div className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-electric/20 pointer-events-none" />
        <div className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-electric/20 pointer-events-none" />

        {!selectedAgent && (
          <p className="absolute bottom-3 left-1/2 -translate-x-1/2 font-mono text-[9px] text-gray-700 pointer-events-none whitespace-nowrap">
            Haz clic en un agente para ver su estado
          </p>
        )}

        {/* Recent CERBERUS decisions overlay */}
        {auditRecords.length > 0 && (
          <div className="absolute top-2 left-2 flex flex-col gap-1 pointer-events-none">
            <AnimatePresence>
              {auditRecords.slice(0, 3).map(r => (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  className={`font-mono text-[8px] px-1.5 py-0.5 rounded border ${
                    r.guardDecision === 'PERMIT'   ? 'bg-permit/10 border-permit/20 text-permit' :
                    r.guardDecision === 'DENY'     ? 'bg-deny/10 border-deny/20 text-deny' :
                    'bg-escalate/10 border-escalate/20 text-escalate'
                  }`}
                >
                  {r.guardDecision} · {r.agentName}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Footer with real metrics */}
      <div className="px-4 py-2.5 border-t border-white/5 grid grid-cols-3 gap-0 text-center">
        <div className="flex flex-col gap-0.5">
          <p className="font-mono text-[9px] text-gray-600 uppercase">Sistema</p>
          <p className="font-mono text-[10px] text-gray-400">IA DISTRIBUIDA</p>
        </div>
        <div className="flex flex-col gap-0.5 border-x border-white/5">
          <p className="font-mono text-[9px] text-gray-600 uppercase">Decisiones</p>
          <p className={`font-mono text-[10px] ${auditRecords.length > 0 ? 'text-electric' : 'text-gray-600'}`}>
            {auditRecords.length} CERBERUS
          </p>
        </div>
        <div className="flex flex-col gap-0.5">
          <p className="font-mono text-[9px] text-gray-600 uppercase">Red</p>
          <p className="font-mono text-[10px] text-gold/80">NEAR SIMULACIÓN</p>
        </div>
      </div>
    </div>
  )
}

// ─── COMMAND CENTER ───────────────────────────────────────────────────────────

export default function CommandCenter(): JSX.Element {
  const { agents, auditRecords, wsConnected, apiReady } = useHadesStore()
  const escalations = useHadesStore(s => s.escalations)

  const [health,         setHealth]         = useState<SystemHealth>({ apiOk: null, wsClients: null, version: null, lastCheck: null, error: null })
  const [missions,       setMissions]       = useState<LocalMission[]>([])
  const [pendingApprovals, setPendingApprovals] = useState<PendingApproval[]>([])
  const [docResults,     setDocResults]     = useState<DocResult[]>([])
  const [apiAgents,      setApiAgents]      = useState<ApiAgent[] | null>(null)
  const [loadingData,    setLoadingData]    = useState(false)
  const [requestIssue, setRequestIssue] = useState<string | null>(null)
  const [selectedAgent,  setSelectedAgent]  = useState<SubAgent | null>(null)
  const [orbitalPaused,  setOrbitalPaused]  = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const prefersReducedMotion = typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  useEffect(() => {
    if (prefersReducedMotion) setOrbitalPaused(true)
  }, [prefersReducedMotion])

  const fetchHealth = useCallback(async () => {
    try {
      const res = await fetch(apiPath('/api/health'))
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setHealth({
        apiOk: true,
        wsClients: data?.ws?.clients ?? null,
        version: data?.version ?? null,
        lastCheck: Date.now(),
        error: null,
      })
    } catch (e: unknown) {
      setHealth(prev => ({
        ...prev,
        apiOk: false,
        lastCheck: Date.now(),
        error: e instanceof Error ? e.message : 'Sin respuesta',
      }))
    }
  }, [])

  const fetchMissions = useCallback(async () => {
    try {
      const res = await fetch(apiPath('/api/v1/missions'), { headers: apiHeaders() })
      if (!res.ok) throw new Error(`Misiones: HTTP ${res.status}`)
      const body = await res.json()
      setMissions(Array.isArray(body.data) ? body.data : [])
    } catch { setMissions([]); setRequestIssue('No se pudieron consultar las misiones.') }
  }, [])

  const fetchApprovals = useCallback(async () => {
    try {
      const res = await fetch(apiPath('/api/v1/local-approvals'), { headers: apiHeaders() })
      if (res.status === 403) { setPendingApprovals([]); return }
      if (!res.ok) throw new Error('approvals')
      const body = await res.json()
      setPendingApprovals(Array.isArray(body.data) ? body.data : [])
    } catch { setPendingApprovals([]); setRequestIssue('No se pudieron consultar las aprobaciones.') }
  }, [])

  const fetchDocResults = useCallback(async () => {
    try {
      const res = await fetch(apiPath('/api/v1/documents/results'), { headers: apiHeaders() })
      if (!res.ok) throw new Error('documents')
      const body = await res.json()
      setDocResults(Array.isArray(body.data) ? body.data : [])
    } catch { setDocResults([]); setRequestIssue('No se pudieron consultar los documentos.') }
  }, [])

  const fetchAgents = useCallback(async () => {
    try {
      const res = await fetch(apiPath('/api/v1/agents'), { headers: apiHeaders() })
      if (!res.ok) { setApiAgents(null); return }
      const body = await res.json()
      const items: ApiAgent[] = Array.isArray(body.data) ? body.data : []
      setApiAgents(items)
      for (const item of items) {
        if (AGENT_NAMES.includes(item.name as AgentName) && ['IDLE','THINKING','EXECUTING','WAITING','ERROR','SUSPENDED'].includes(item.status)) {
          useHadesStore.getState().setAgentStatus(item.name as AgentName, item.status as AgentState['status'], taskDescription(item.currentTask))
        }
      }
    } catch { setApiAgents(null) }
  }, [])

  const refreshAll = useCallback(async () => {
    setLoadingData(true)
    setRequestIssue(null)
    await Promise.allSettled([
      fetchHealth(),
      fetchMissions(),
      fetchApprovals(),
      fetchDocResults(),
      fetchAgents(),
    ])
    setLoadingData(false)
  }, [fetchHealth, fetchMissions, fetchApprovals, fetchDocResults, fetchAgents])

  useEffect(() => {
    void refreshAll()
    intervalRef.current = setInterval(() => void refreshAll(), 30000)
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [refreshAll])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => { void fetchMissions(); void fetchApprovals() }, 150) }
    window.addEventListener('hades:mission-update', refresh)
    return () => { window.removeEventListener('hades:mission-update', refresh); if (timer) clearTimeout(timer) }
  }, [fetchMissions, fetchApprovals])

  const anyActive = wsConnected && !!apiAgents && apiAgents.some(a => ['THINKING','EXECUTING','WAITING','ERROR'].includes(agents[a.name as AgentName]?.status ?? ''))
  const activeMissionCount = missions.filter(m => ['RECEIVED','ANALYZING','PLANNED','IN_PROGRESS','RUNNING','WAITING_APPROVAL','QUEUED'].includes(m.status) || isPendingReview(m.status, m.tasks.map(t => t.status))).length

  async function handleDecide(id: string, status: 'APPROVED' | 'REJECTED'): Promise<void> {
    const justification = window.prompt('Justificación (mínimo 3 caracteres):')?.trim()
    if (!justification || justification.length < 3) return
    try {
      const res = await fetch(apiPath(`/api/v1/local-approvals/${encodeURIComponent(id)}/decision`), {
        method: 'POST',
        headers: apiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ status, justification }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err?.error?.message ?? `HTTP ${res.status}`)
      }
      await refreshAll()
    } catch (e: unknown) {
      setRequestIssue(e instanceof Error ? e.message : 'No se pudo registrar la decisión.')
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {requestIssue && <p role="alert" className="text-xs text-deny">{requestIssue}</p>}
      {/* ── TOP STATUS BAR ── */}
      <div className="flex items-center gap-2 flex-wrap py-1">
        <StatusChip
          color={apiReady ? 'electric' : 'gray'}
          dot={apiReady ? 'animate-pulse' : ''}
          label={apiReady ? 'API CONECTADA' : 'API INACTIVA'}
        />
        <StatusChip
          color={wsConnected ? 'electric' : 'gray'}
          dot={wsConnected ? 'animate-pulse' : ''}
          label={wsConnected ? 'WS ACTIVO' : 'WS INACTIVO'}
        />
        {activeMissionCount > 0 && (
          <StatusChip color="gold" dot="animate-pulse" label={`${activeMissionCount} MISIÓN${activeMissionCount > 1 ? 'ES' : ''} ACTIVA${activeMissionCount > 1 ? 'S' : ''}`} />
        )}
        {escalations.filter(e => e.status === 'PENDING').length > 0 && (
          <StatusChip color="escalate" dot="animate-pulse" label={`${escalations.filter(e => e.status === 'PENDING').length} APROBACIONES PENDIENTES`} />
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => void refreshAll()}
            disabled={loadingData}
            className="font-mono text-[10px] text-gray-600 hover:text-gray-400 border border-white/10 px-2 py-1 rounded transition-colors"
          >
            {loadingData ? '⏳' : '↺ ACTUALIZAR'}
          </button>
          <span className="font-mono text-[10px] text-gray-600">HADES COMMAND CENTER</span>
        </div>
      </div>

      {/* ── MAIN GRID ── */}
      <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr_280px] gap-4">
        {/* Left: Agent Monitor + System Health */}
        <div className="flex flex-col gap-4">
          <AgentMonitorPanel agents={agents} apiAgents={apiAgents} />
          <SystemHealthPanel health={health} wsConnected={wsConnected} activeMissions={activeMissionCount} />
        </div>

        {/* Center: Holographic Nucleus */}
        <HolographicNucleus
          anyActive={anyActive}
          pendingCount={pendingApprovals.length}
          telemetryAvailable={wsConnected && !!apiAgents}
          paused={orbitalPaused}
          onTogglePaused={() => setOrbitalPaused(v => !v)}
          selectedAgent={selectedAgent}
          onAgentSelect={name => setSelectedAgent(prev => prev === name ? null : name)}
          auditRecords={auditRecords}
        />

        {/* Right: Mission Control */}
        <MissionControlPanel
          missions={missions}
          onRefresh={() => void refreshAll()}
          busy={loadingData}
        />
      </div>

      {/* ── BOTTOM ROW ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ApprovalsKanban
          missions={missions}
          pendingApprovals={pendingApprovals}
          onDecide={handleDecide}
          onRefresh={() => void refreshAll()}
          busy={loadingData}
        />
        <DocumentsAuditPanel docResults={docResults} auditRecords={auditRecords} />
      </div>
    </div>
  )
}

// ─── STATUS CHIP ─────────────────────────────────────────────────────────────

function StatusChip({ label, color, dot }: { label: string; color: 'electric' | 'gold' | 'gray' | 'escalate'; dot?: string }): JSX.Element {
  const scheme = {
    electric: { text: 'text-electric', border: 'border-electric/30', bg: 'bg-electric/5', dotBg: 'bg-electric' },
    gold:     { text: 'text-gold',     border: 'border-gold/30',     bg: 'bg-gold/5',     dotBg: 'bg-gold' },
    gray:     { text: 'text-gray-500', border: 'border-gray-700',    bg: '',              dotBg: 'bg-gray-600' },
    escalate: { text: 'text-escalate', border: 'border-escalate/30', bg: 'bg-escalate/5', dotBg: 'bg-escalate' },
  }[color]

  return (
    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border font-mono text-[11px] ${scheme.text} ${scheme.border} ${scheme.bg}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${scheme.dotBg} ${dot ?? ''}`} />
      {label}
    </div>
  )
}
