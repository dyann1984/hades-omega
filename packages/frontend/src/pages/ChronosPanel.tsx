import { useCallback, useEffect, useState } from 'react'
import { useHadesStore } from '../store/index.js'
import { apiHeaders, apiPath, isDemoToken } from '../lib/api.js'

type TaskStatus = 'ACTIVE' | 'PAUSED' | 'CANCELLED'
interface ChronosTask {
  id: string; title: string; description: string; kind: string; params: Record<string, unknown>; cron: string
  status: TaskStatus; nextRunAt: number | null; lastRunAt: number | null; agent: string | null; maxAttempts: number
}
interface ChronosRun {
  id: string; taskId: string; trigger: 'SCHEDULE' | 'MANUAL'; status: string; attempt: number
  scheduledFor: number; finishedAt: number | null; result: unknown; error: string | null
}
interface JobKind { kind: string; description: string; effect: string; agent: string }

const CRON_EXAMPLES = [
  { label: 'Cada hora',     value: '0 * * * *'    },
  { label: 'Diario 09:00',  value: '0 9 * * *'    },
  { label: 'Semanal lunes', value: '0 0 * * 1'    },
  { label: 'Cada 15 min',   value: '*/15 * * * *' },
]

const fmt = (ms: number | null): string => ms ? new Date(ms).toLocaleString('es-MX', { timeZone: 'UTC', hour12: false }) + ' UTC' : '—'

export default function ChronosPanel(): JSX.Element {
  const { addNotification } = useHadesStore()
  const [tasks, setTasks] = useState<ChronosTask[]>([])
  const [runs, setRuns] = useState<ChronosRun[]>([])
  const [kinds, setKinds] = useState<JobKind[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [form, setForm] = useState({ title: '', kind: '', cron: '0 9 * * *', description: '', windowHours: '24' })

  const call = useCallback(async (path: string, method = 'GET', body?: unknown): Promise<{ ok: boolean; data?: unknown; error?: string }> => {
    try {
      const res = await fetch(apiPath(`/api/v1/chronos${path}`), {
        method,
        headers: apiHeaders(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      const json = await res.json().catch(() => ({})) as { data?: unknown; error?: { code?: string; message?: string } }
      if (!res.ok) return { ok: false, error: json.error?.message ?? json.error?.code ?? `HTTP ${res.status}` }
      return { ok: true, data: json.data }
    } catch { return { ok: false, error: 'API no disponible' } }
  }, [])

  const refresh = useCallback(async (): Promise<void> => {
    const [t, r, k] = await Promise.all([call('/tasks'), call('/runs?limit=30'), call('/job-kinds')])
    if (!t.ok) { setLoadError(isDemoToken() ? 'CHRONOS no está disponible en sesiones DEMO (requiere persistencia real).' : t.error ?? 'Error'); setLoading(false); return }
    setLoadError(null)
    setTasks(t.data as ChronosTask[])
    if (r.ok) setRuns(r.data as ChronosRun[])
    if (k.ok) {
      const list = k.data as JobKind[]
      setKinds(list)
      setForm(f => f.kind || !list[0] ? f : { ...f, kind: list[0].kind })
    }
    setLoading(false)
  }, [call])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => { void refresh() }, 15_000)
    return () => clearInterval(id)
  }, [refresh])

  async function act(label: string, task: ChronosTask, path: string): Promise<void> {
    setBusy(task.id)
    const res = await call(`/tasks/${encodeURIComponent(task.id)}/${path}`, 'POST')
    setBusy(null)
    if (res.ok) addNotification('info', `CHRONOS: ${label} "${task.title}"`)
    else addNotification('error', `CHRONOS: ${res.error}`)
    await refresh()
  }

  async function createTask(): Promise<void> {
    const params = form.kind === 'CERBERUS_DECISION_REPORT' ? { windowHours: Number(form.windowHours) } : {}
    const res = await call('/tasks', 'POST', { title: form.title, kind: form.kind, cron: form.cron, description: form.description, params })
    if (!res.ok) { addNotification('error', `CHRONOS: ${res.error}`); return }
    addNotification('info', `CHRONOS: tarea "${form.title}" creada`)
    setForm(f => ({ ...f, title: '', description: '' }))
    setShowNew(false)
    await refresh()
  }

  const active = tasks.filter(t => t.status === 'ACTIVE').length
  const taskTitle = (id: string): string => tasks.find(t => t.id === id)?.title ?? id.slice(0, 8)
  const kindInfo = kinds.find(k => k.kind === form.kind)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-mono text-sm font-bold text-gray-200 tracking-[0.15em]">CHRONOS</h2>
          <p className="text-[11px] text-gray-600 font-mono">Automatizaciones programadas y tareas recurrentes</p>
        </div>
        <div className="flex gap-2">
          {active > 0 && (
            <span className="font-mono text-[10px] px-2 py-1 rounded bg-electric/10 text-electric border border-electric/30">
              {active} tarea{active > 1 ? 's' : ''} activa{active > 1 ? 's' : ''}
            </span>
          )}
          <button
            onClick={() => setShowNew(s => !s)}
            disabled={!!loadError}
            className="font-mono text-[10px] text-electric border border-electric/30 px-3 py-1.5 rounded hover:bg-electric/10 transition-colors disabled:opacity-40"
          >
            {showNew ? '✕ Cancelar' : '+ Nueva tarea'}
          </button>
        </div>
      </div>

      <div className="hades-card rounded-lg px-4 py-3 flex items-start gap-3">
        <span className="text-escalate text-sm flex-shrink-0 mt-0.5">ℹ</span>
        <p className="text-[11px] text-gray-500 leading-snug">
          Las tareas y su historial se guardan en la base de datos del servidor y el planificador las ejecuta aunque cierres el navegador.
          Solo existen trabajos registrados de <span className="text-gray-400">solo lectura</span>; cualquier otra operación se deniega.
          Los horarios cron se evalúan en UTC.
        </p>
      </div>

      {loading && <p className="font-mono text-[11px] text-gray-600">Cargando…</p>}
      {loadError && <div className="hades-card rounded-lg px-4 py-3 text-[11px] text-escalate font-mono">{loadError}</div>}

      {showNew && !loadError && (
        <div className="hades-card rounded-lg p-4 flex flex-col gap-3 ring-1 ring-electric/20">
          <p className="font-mono text-[11px] text-gray-400 tracking-widest">NUEVA TAREA PROGRAMADA</p>
          <input
            className="bg-[#0A0A0F] border border-obsidian-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-electric/40"
            placeholder="Nombre de la tarea (mín. 3 caracteres)…"
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          />
          <select
            className="bg-[#0A0A0F] border border-obsidian-700 rounded px-3 py-2 text-sm text-gray-200 font-mono focus:outline-none focus:border-electric/40"
            value={form.kind}
            onChange={e => setForm(f => ({ ...f, kind: e.target.value }))}
          >
            {kinds.map(k => <option key={k.kind} value={k.kind}>{k.kind} · {k.agent}</option>)}
          </select>
          {kindInfo && <p className="text-[10px] text-gray-500">{kindInfo.description} (efecto: {kindInfo.effect})</p>}
          {form.kind === 'CERBERUS_DECISION_REPORT' && (
            <input
              type="number" min={1} max={720}
              className="bg-[#0A0A0F] border border-obsidian-700 rounded px-3 py-2 text-sm text-gray-200 font-mono focus:outline-none focus:border-electric/40"
              placeholder="Ventana en horas (1-720)"
              value={form.windowHours}
              onChange={e => setForm(f => ({ ...f, windowHours: e.target.value }))}
            />
          )}
          <div className="flex items-center gap-2 flex-wrap">
            <input
              className="flex-1 min-w-0 bg-[#0A0A0F] border border-obsidian-700 rounded px-3 py-2 text-sm text-gray-200 font-mono placeholder-gray-700 focus:outline-none focus:border-electric/40"
              placeholder="Expresión cron: 0 9 * * *"
              value={form.cron}
              onChange={e => setForm(f => ({ ...f, cron: e.target.value }))}
            />
            <div className="flex gap-1.5 flex-wrap">
              {CRON_EXAMPLES.map(ex => (
                <button
                  key={ex.value}
                  onClick={() => setForm(f => ({ ...f, cron: ex.value }))}
                  className="font-mono text-[9px] text-electric border border-electric/25 px-2 py-1 rounded hover:bg-electric/10 transition-colors whitespace-nowrap"
                >
                  {ex.label}
                </button>
              ))}
            </div>
          </div>
          <textarea
            className="bg-[#0A0A0F] border border-obsidian-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-electric/40 resize-none"
            placeholder="Descripción (opcional)…"
            rows={2}
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          />
          <button
            onClick={() => { void createTask() }}
            disabled={form.title.trim().length < 3 || !form.kind}
            className="font-mono text-[11px] text-electric border border-electric/40 py-2 rounded hover:bg-electric/10 transition-colors disabled:opacity-40"
          >
            ✓ Crear tarea
          </button>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {!loading && !loadError && tasks.length === 0 && (
          <p className="font-mono text-[11px] text-gray-600">No hay tareas programadas. Crea la primera con “+ Nueva tarea”.</p>
        )}
        {tasks.map(task => (
          <div key={task.id} className={`hades-card rounded-lg p-4 flex items-start gap-3 ${task.status === 'ACTIVE' ? 'ring-1 ring-electric/25' : ''} ${task.status === 'CANCELLED' ? 'opacity-50' : ''}`}>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <span className="text-[11px] text-gray-200 font-medium">{task.title}</span>
                <span className="font-mono text-[9px] text-electric/70 border border-electric/20 px-1.5 py-0.5 rounded">{task.cron}</span>
                <span className="font-mono text-[9px] text-gray-500 border border-white/10 px-1.5 py-0.5 rounded">{task.kind}</span>
                <span className={`font-mono text-[9px] px-1.5 py-0.5 rounded border ${task.status === 'ACTIVE' ? 'text-electric border-electric/30' : 'text-gray-500 border-white/10'}`}>{task.status}</span>
              </div>
              {task.description && <p className="text-[10px] text-gray-500">{task.description}</p>}
              <div className="flex items-center gap-3 mt-1.5 text-[9px] text-gray-600 font-mono flex-wrap">
                <span>Próxima: {fmt(task.nextRunAt)}</span>
                <span>Última: {fmt(task.lastRunAt)}</span>
                {task.agent && <span>Agente: {task.agent}</span>}
              </div>
            </div>
            {task.status !== 'CANCELLED' && (
              <div className="flex flex-col gap-1 flex-shrink-0">
                <button disabled={busy === task.id} onClick={() => { void act('ejecutada', task, 'run') }} className="font-mono text-[10px] text-electric border border-electric/25 px-2 py-1 rounded hover:bg-electric/10 transition-colors disabled:opacity-40">⚡ Ejecutar</button>
                {task.status === 'ACTIVE'
                  ? <button disabled={busy === task.id} onClick={() => { void act('pausada', task, 'pause') }} className="font-mono text-[10px] text-gray-400 border border-white/10 px-2 py-1 rounded hover:bg-white/5 transition-colors disabled:opacity-40">⏸ Pausar</button>
                  : <button disabled={busy === task.id} onClick={() => { void act('reanudada', task, 'resume') }} className="font-mono text-[10px] text-gray-400 border border-white/10 px-2 py-1 rounded hover:bg-white/5 transition-colors disabled:opacity-40">▶ Reanudar</button>}
                <button disabled={busy === task.id} onClick={() => { if (window.confirm(`¿Cancelar definitivamente "${task.title}"?`)) void act('cancelada', task, 'cancel') }} className="font-mono text-[10px] text-escalate border border-escalate/30 px-2 py-1 rounded hover:bg-escalate/10 transition-colors disabled:opacity-40">✕ Cancelar</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {runs.length > 0 && (
        <div className="hades-card rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-white/5">
            <span className="font-mono text-[10px] text-gray-500 tracking-widest">HISTORIAL DE EJECUCIONES</span>
          </div>
          <div className="p-3 flex flex-col gap-1.5 max-h-56 overflow-y-auto">
            {runs.map(r => (
              <div key={r.id} className="flex items-start gap-2 font-mono text-[10px]">
                <span className="text-gray-700 flex-shrink-0">{fmt(r.scheduledFor)}</span>
                <span className={r.status === 'SUCCEEDED' ? 'text-electric/80' : r.status === 'FAILED' ? 'text-escalate' : 'text-gray-400'}>{r.status}</span>
                <span className="text-gray-500 truncate">{taskTitle(r.taskId)} · {r.trigger} · intento {r.attempt}{r.error ? ` · ${r.error}` : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
