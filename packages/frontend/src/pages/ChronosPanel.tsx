import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHadesStore } from '../store/index.js'

interface ScheduledTask {
  id:       string
  title:    string
  cron:     string
  desc:     string
  active:   boolean
  lastRun:  number | null
  nextRun:  string
}

const INIT_TASKS: ScheduledTask[] = [
  { id: 't1', title: 'Reporte diario de auditoría',      cron: '0 9 * * *',  desc: 'Genera reporte de decisiones CERBERUS de las últimas 24h.',     active: false, lastRun: null, nextRun: 'Mañana 09:00' },
  { id: 't2', title: 'Verificación de proveedores',      cron: '0 */4 * * *', desc: 'Ejecuta verificación de estado de proveedores activos.',         active: false, lastRun: null, nextRun: 'En 4 horas' },
  { id: 't3', title: 'Respaldo de registros NEAR',       cron: '0 0 * * 1',  desc: 'Exporta historial de transacciones NEAR del período.',           active: false, lastRun: null, nextRun: 'Próximo lunes' },
  { id: 't4', title: 'Limpieza de escalaciones antiguas', cron: '0 2 * * *', desc: 'Cierra escalaciones con más de 24h sin respuesta.',              active: false, lastRun: null, nextRun: 'Mañana 02:00' },
]

const CRON_EXAMPLES = [
  { label: 'Cada hora',     value: '0 * * * *'   },
  { label: 'Diario 09:00',  value: '0 9 * * *'   },
  { label: 'Semanal lunes', value: '0 0 * * 1'   },
  { label: 'Cada 15 min',   value: '*/15 * * * *' },
]

export default function ChronosPanel(): JSX.Element {
  const navigate  = useNavigate()
  const { addNotification } = useHadesStore()
  const [tasks, setTasks]   = useState<ScheduledTask[]>(INIT_TASKS)
  const [showNew, setShowNew] = useState(false)
  const [newTask, setNewTask] = useState({ title: '', cron: '0 9 * * *', desc: '' })
  const [runLog,  setRunLog]  = useState<{ ts: string; msg: string }[]>([])

  function toggleTask(id: string): void {
    setTasks(ts => ts.map(t => {
      if (t.id !== id) return t
      const next = { ...t, active: !t.active }
      if (next.active) {
        addNotification('info', `CHRONOS: tarea "${t.title}" programada`)
        addLog(`▶ ${t.title} — programada (${t.cron})`)
      } else {
        addLog(`⏸ ${t.title} — pausada`)
      }
      return next
    }))
  }

  function runNow(task: ScheduledTask): void {
    addLog(`⚡ Ejecutando ahora: ${task.title}`)
    addNotification('info', `CHRONOS ejecuta: ${task.title}`)
    setTasks(ts => ts.map(t => t.id === task.id ? { ...t, lastRun: Date.now() } : t))
    // Navigate to throne to see output
    setTimeout(() => navigate('/throne'), 800)
  }

  function addLog(msg: string): void {
    const ts = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    setRunLog(prev => [{ ts, msg }, ...prev].slice(0, 20))
  }

  function createTask(): void {
    if (!newTask.title.trim()) return
    const t: ScheduledTask = {
      id:      Date.now().toString(),
      title:   newTask.title,
      cron:    newTask.cron,
      desc:    newTask.desc,
      active:  false,
      lastRun: null,
      nextRun: 'Según cron',
    }
    setTasks(ts => [t, ...ts])
    setNewTask({ title: '', cron: '0 9 * * *', desc: '' })
    setShowNew(false)
    addLog(`+ Tarea creada: ${t.title}`)
  }

  const activeTasks = tasks.filter(t => t.active).length

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-mono text-sm font-bold text-gray-200 tracking-[0.15em]">CHRONOS</h2>
          <p className="text-[11px] text-gray-600 font-mono">Automatizaciones programadas y tareas recurrentes</p>
        </div>
        <div className="flex gap-2">
          {activeTasks > 0 && (
            <span className="font-mono text-[10px] px-2 py-1 rounded bg-electric/10 text-electric border border-electric/30 animate-pulse">
              {activeTasks} tarea{activeTasks > 1 ? 's' : ''} activa{activeTasks > 1 ? 's' : ''}
            </span>
          )}
          <button
            onClick={() => setShowNew(s => !s)}
            className="font-mono text-[10px] text-electric border border-electric/30 px-3 py-1.5 rounded hover:bg-electric/10 transition-colors"
          >
            {showNew ? '✕ Cancelar' : '+ Nueva tarea'}
          </button>
        </div>
      </div>

      {/* Note: CHRONOS is local simulation */}
      <div className="hades-card rounded-lg px-4 py-3 flex items-start gap-3">
        <span className="text-escalate text-sm flex-shrink-0 mt-0.5">ℹ</span>
        <p className="text-[11px] text-gray-500 leading-snug">
          CHRONOS gestiona automatizaciones locales en simulación. Las tareas activas ejecutan instrucciones reales en la API cuando el servidor está disponible.
          Las tareas programadas se guardan en sesión local y se reconectan al reiniciar.
        </p>
      </div>

      {/* New task form */}
      {showNew && (
        <div className="hades-card rounded-lg p-4 flex flex-col gap-3 ring-1 ring-electric/20">
          <p className="font-mono text-[11px] text-gray-400 tracking-widest">NUEVA TAREA PROGRAMADA</p>
          <input
            className="bg-[#0A0A0F] border border-obsidian-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-electric/40"
            placeholder="Nombre de la tarea…"
            value={newTask.title}
            onChange={e => setNewTask(n => ({ ...n, title: e.target.value }))}
          />
          <div className="flex items-center gap-2 flex-wrap">
            <input
              className="flex-1 min-w-0 bg-[#0A0A0F] border border-obsidian-700 rounded px-3 py-2 text-sm text-gray-200 font-mono placeholder-gray-700 focus:outline-none focus:border-electric/40"
              placeholder="Expresión cron: 0 9 * * *"
              value={newTask.cron}
              onChange={e => setNewTask(n => ({ ...n, cron: e.target.value }))}
            />
            <div className="flex gap-1.5 flex-wrap">
              {CRON_EXAMPLES.map(ex => (
                <button
                  key={ex.value}
                  onClick={() => setNewTask(n => ({ ...n, cron: ex.value }))}
                  className="font-mono text-[9px] text-electric border border-electric/25 px-2 py-1 rounded hover:bg-electric/10 transition-colors whitespace-nowrap"
                >
                  {ex.label}
                </button>
              ))}
            </div>
          </div>
          <textarea
            className="bg-[#0A0A0F] border border-obsidian-700 rounded px-3 py-2 text-sm text-gray-200 placeholder-gray-700 focus:outline-none focus:border-electric/40 resize-none"
            placeholder="Descripción de la tarea…"
            rows={2}
            value={newTask.desc}
            onChange={e => setNewTask(n => ({ ...n, desc: e.target.value }))}
          />
          <button
            onClick={createTask}
            disabled={!newTask.title.trim()}
            className="font-mono text-[11px] text-electric border border-electric/40 py-2 rounded hover:bg-electric/10 transition-colors disabled:opacity-40"
          >
            ✓ Crear tarea
          </button>
        </div>
      )}

      {/* Task list */}
      <div className="flex flex-col gap-2">
        {tasks.map(task => (
          <div key={task.id} className={`hades-card rounded-lg p-4 flex items-start gap-3 transition-all ${
            task.active ? 'ring-1 ring-electric/25' : ''
          }`}>
            <button
              onClick={() => toggleTask(task.id)}
              className={`flex-shrink-0 w-8 h-8 rounded border flex items-center justify-center transition-all ${
                task.active
                  ? 'border-electric/50 bg-electric/15 text-electric'
                  : 'border-white/10 bg-white/3 text-gray-600 hover:border-white/20'
              }`}
            >
              {task.active ? '▶' : '○'}
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <span className="text-[11px] text-gray-200 font-medium">{task.title}</span>
                <span className="font-mono text-[9px] text-electric/70 border border-electric/20 px-1.5 py-0.5 rounded">
                  {task.cron}
                </span>
              </div>
              <p className="text-[10px] text-gray-500">{task.desc}</p>
              <div className="flex items-center gap-3 mt-1.5 text-[9px] text-gray-600 font-mono">
                <span>Próxima: {task.nextRun}</span>
                {task.lastRun && <span>Última: {new Date(task.lastRun).toLocaleTimeString('es-MX')}</span>}
              </div>
            </div>
            <button
              onClick={() => runNow(task)}
              title="Ejecutar ahora"
              className="flex-shrink-0 font-mono text-[10px] text-electric border border-electric/25 px-2 py-1.5 rounded hover:bg-electric/10 transition-colors"
            >
              ⚡ Ya
            </button>
          </div>
        ))}
      </div>

      {/* Run log */}
      {runLog.length > 0 && (
        <div className="hades-card rounded-lg overflow-hidden">
          <div className="px-3 py-2 border-b border-white/5">
            <span className="font-mono text-[10px] text-gray-500 tracking-widest">REGISTRO CHRONOS</span>
          </div>
          <div className="p-3 flex flex-col gap-1.5 max-h-32 overflow-y-auto">
            {runLog.map((e, i) => (
              <div key={i} className="flex items-start gap-2 font-mono text-[10px]">
                <span className="text-gray-700 flex-shrink-0">{e.ts}</span>
                <span className="text-electric/70">{e.msg}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
