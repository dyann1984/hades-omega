import clsx from 'clsx'
import type { GUARDOutcome } from '../store/index.js'

const CONFIG: Record<GUARDOutcome, { label: string; icon: string; cls: string }> = {
  PERMIT:   { label: 'PERMIT',   icon: '✓', cls: 'badge-permit'   },
  DENY:     { label: 'DENY',     icon: '✗', cls: 'badge-deny'     },
  ESCALATE: { label: 'ESCALATE', icon: '⚠', cls: 'badge-escalate' },
}

export default function CerberusDecisionBadge({ outcome }: { outcome: GUARDOutcome }): JSX.Element {
  const c = CONFIG[outcome]
  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-mono font-semibold border', c.cls)}>
      <span>{c.icon}</span>
      <span>{c.label}</span>
    </span>
  )
}
