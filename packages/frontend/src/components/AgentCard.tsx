import clsx from 'clsx'
import type { AgentState, AgentName } from '../store/index.js'

const AGENT_META: Record<AgentName, { icon: string; role: string; symbol: string }> = {
  HADES:      { icon: '✦', role: 'Orquestador Central',       symbol: '⊛' },
  CHARON:     { icon: '⚡', role: 'Compras & Proveedores',     symbol: '⚡' },
  PERSEPHONE: { icon: '₿', role: 'Finanzas & Presupuesto',    symbol: '◈' },
  MINOS:      { icon: '⚖', role: 'Validación & Escalaciones', symbol: '⚖' },
  ELYSIUM:    { icon: '⚙', role: 'Planificación',             symbol: '◎' },
  TARTARUS:   { icon: '🛡', role: 'Seguridad & Anomalías',    symbol: '▲' },
}

const STATUS_CONFIG = {
  IDLE:       { label: 'INACTIVO',   dot: 'bg-gray-600',   text: 'text-gray-500',  border: 'border-obsidian-700' },
  THINKING:   { label: 'PENSANDO',   dot: 'bg-electric',   text: 'text-electric',  border: 'border-electric/30' },
  EXECUTING:  { label: 'EJECUTANDO', dot: 'bg-electric',   text: 'text-electric',  border: 'border-electric/50' },
  WAITING:    { label: 'ESPERANDO',  dot: 'bg-yellow-400', text: 'text-yellow-400', border: 'border-yellow-400/30' },
  ERROR:      { label: 'ERROR',      dot: 'bg-deny',       text: 'text-deny',       border: 'border-deny/40' },
  SUSPENDED:  { label: 'SUSPENDIDO', dot: 'bg-gray-500',   text: 'text-gray-400',  border: 'border-gray-600' },
}

interface Props {
  agent:    AgentState
  compact?: boolean
}

export default function AgentCard({ agent, compact }: Props): JSX.Element {
  const meta   = AGENT_META[agent.name]
  const status = STATUS_CONFIG[agent.status]
  const active = agent.status === 'THINKING' || agent.status === 'EXECUTING'

  return (
    <div className={clsx(
      'hades-card border rounded-lg p-3 transition-all duration-300',
      status.border,
      active && 'agent-active',
      agent.name === 'HADES' && active && 'agent-hades-active',
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={clsx(
            'text-lg flex-shrink-0',
            agent.name === 'HADES' ? 'text-gold' : 'text-electric',
          )}>
            {meta.icon}
          </span>
          <div className="min-w-0">
            <p className="font-mono font-semibold text-xs text-gray-100 tracking-wider">{agent.name}</p>
            {!compact && <p className="text-[10px] text-gray-500 truncate">{meta.role}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', status.dot, active && 'animate-pulse')} />
          <span className={clsx('font-mono text-[10px] font-medium', status.text)}>{status.label}</span>
        </div>
      </div>

      {!compact && agent.currentTask && (
        <p className="mt-2 text-[11px] text-gray-400 truncate border-t border-obsidian-700 pt-2">
          {agent.currentTask}
        </p>
      )}
    </div>
  )
}
