import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHadesStore } from '../store/index.js'
import type { Mission, MissionStatus } from '../store/index.js'

const STATUS_LABEL: Record<MissionStatus, string> = {
  RECEIVED:         'Recibida',
  ANALYZING:        'Analizando',
  PLANNED:          'Planificada',
  IN_PROGRESS:      'En progreso',
  COMPLETED:        'Completada',
  PARTIAL_COMPLETE: 'Parcial',
  CANCELLED:        'Cancelada',
  FAILED:           'Fallida',
}

const STATUS_COLOR: Record<MissionStatus, string> = {
  RECEIVED:         'text-gray-500 bg-gray-800',
  ANALYZING:        'text-electric bg-electric/10',
  PLANNED:          'text-blue-400 bg-blue-900/20',
  IN_PROGRESS:      'text-electric bg-electric/15',
  COMPLETED:        'text-permit bg-permit/10',
  PARTIAL_COMPLETE: 'text-escalate bg-escalate/10',
  CANCELLED:        'text-gray-400 bg-gray-800',
  FAILED:           'text-deny bg-deny/10',
}

function MissionCard({ m }: { m: Mission }): JSX.Element {
  const navigate = useNavigate()
  const done   = m.tasks.filter(t => t.status === 'EXECUTED').length
  const total  = m.tasks.length
  const pct    = total ? Math.round((done / total) * 100) : m.progress

  return (
    <div className="hades-card rounded-lg p-4 flex flex-col gap-3 hover:ring-1 hover:ring-electric/20 transition-all cursor-pointer"
      onClick={() => navigate('/archives')}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${STATUS_COLOR[m.status]}`}>
              {STATUS_LABEL[m.status]}
            </span>
            <span className="font-mono text-[9px] text-gray-600">{m.id.slice(0, 8)}</span>
          </div>
          <h3 className="text-sm text-gray-200 font-medium leading-snug">{m.title}</h3>
          {m.description && m.description !== m.title && (
            <p className="text-[11px] text-gray-500 mt-1 leading-snug line-clamp-2">{m.description}</p>
          )}
        </div>
        <span className="font-mono text-[10px] text-gray-600 flex-shrink-0">
          {new Date(m.createdAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
        </span>
      </div>

      {/* Progress */}
      {total > 0 && (
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <div className="flex gap-2">
              {Array.from(new Set(m.tasks.map(t => t.assignedTo))).slice(0, 5).map(a => (
                <span key={a} className="font-mono text-[9px] text-electric/70">{a}</span>
              ))}
            </div>
            <span className="font-mono text-[10px] text-gray-500">{done}/{total}</span>
          </div>
          <div className="h-1 bg-obsidian-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                m.status === 'FAILED' ? 'bg-deny' :
                m.status === 'COMPLETED' ? 'bg-permit' :
                'bg-electric'
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default function DominionPanel(): JSX.Element {
  const { missions } = useHadesStore()
  const navigate     = useNavigate()
  const [filter, setFilter] = useState<'ALL' | MissionStatus>('ALL')
  const [sort, setSort]     = useState<'newest' | 'oldest'>('newest')

  const sorted = [...missions].sort((a, b) =>
    sort === 'newest' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt
  )

  const filtered = filter === 'ALL' ? sorted : sorted.filter(m => m.status === filter)

  const groups: Partial<Record<MissionStatus, number>> = {}
  for (const m of missions) groups[m.status] = (groups[m.status] ?? 0) + 1

  const summary = [
    { label: 'Total',      value: missions.length,                                     color: 'text-gray-300' },
    { label: 'Completadas', value: groups['COMPLETED'] ?? 0,                           color: 'text-permit' },
    { label: 'En progreso', value: (groups['IN_PROGRESS'] ?? 0) + (groups['ANALYZING'] ?? 0), color: 'text-electric' },
    { label: 'Fallidas',    value: groups['FAILED'] ?? 0,                              color: 'text-deny' },
  ]

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-mono text-sm font-bold text-gray-200 tracking-[0.15em]">DOMINION</h2>
          <p className="text-[11px] text-gray-600 font-mono">Gestión de misiones y proyectos operativos</p>
        </div>
        <button
          onClick={() => navigate('/throne')}
          className="font-mono text-[10px] text-electric border border-electric/30 px-3 py-1.5 rounded hover:bg-electric/10 transition-colors"
        >
          + Nueva misión →
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        {summary.map(s => (
          <div key={s.label} className="hades-card rounded-lg p-3 text-center">
            <p className={`font-mono text-xl font-bold ${s.color}`}>{s.value}</p>
            <p className="font-mono text-[9px] text-gray-600">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters + sort */}
      <div className="flex items-center gap-2 flex-wrap">
        {(['ALL', 'COMPLETED', 'IN_PROGRESS', 'FAILED'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`font-mono text-[10px] px-2.5 py-1.5 rounded border transition-colors ${
              filter === f ? 'border-electric/50 text-electric bg-electric/10' : 'border-white/5 text-gray-600 hover:border-white/15'
            }`}
          >
            {f === 'ALL' ? `TODAS (${missions.length})` : `${f} (${groups[f as MissionStatus] ?? 0})`}
          </button>
        ))}
        <div className="ml-auto flex gap-1">
          {(['newest', 'oldest'] as const).map(s => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={`font-mono text-[10px] px-2 py-1 rounded transition-colors ${
                sort === s ? 'text-gray-300' : 'text-gray-600 hover:text-gray-400'
              }`}
            >
              {s === 'newest' ? '↓ Recientes' : '↑ Antiguas'}
            </button>
          ))}
        </div>
      </div>

      {/* Mission list */}
      <div className="flex flex-col gap-3">
        {filtered.length === 0 ? (
          <div className="hades-card rounded-lg p-12 text-center">
            {missions.length === 0 ? (
              <>
                <p className="font-mono text-gray-600 text-sm mb-3">Sin misiones registradas</p>
                <button
                  onClick={() => navigate('/throne')}
                  className="font-mono text-[11px] text-electric border border-electric/30 px-4 py-2 rounded hover:bg-electric/10 transition-colors"
                >
                  Crear primera misión en THRONE →
                </button>
              </>
            ) : (
              <p className="font-mono text-gray-600 text-sm">Sin misiones con el filtro seleccionado</p>
            )}
          </div>
        ) : (
          filtered.map(m => <MissionCard key={m.id} m={m} />)
        )}
      </div>
    </div>
  )
}
