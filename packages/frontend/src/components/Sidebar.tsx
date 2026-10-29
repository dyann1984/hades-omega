import { NavLink } from 'react-router-dom'
import clsx from 'clsx'
import { useHadesStore } from '../store/index.js'

const NAV_ITEMS = [
  { path: '/',            icon: '⬡', label: 'Dashboard',   shortLabel: 'HQ'   },
  { path: '/throne',      icon: '✦', label: 'Throne',      shortLabel: 'THR'  },
  { path: '/pantheon',    icon: '⊛', label: 'Pantheon',    shortLabel: 'PAN'  },
  { path: '/dominion',    icon: '◫', label: 'Dominion',    shortLabel: 'DOM'  },
  { path: '/chronos',     icon: '◷', label: 'Chronos',     shortLabel: 'CHR'  },
  { path: '/oracle',      icon: '◈', label: 'Oracle',      shortLabel: 'ORC'  },
  { path: '/vault',       icon: '◌', label: 'Vault',       shortLabel: 'VLT'  },
  { path: '/judgment',    icon: '⚖', label: 'Judgment',    shortLabel: 'JDG'  },
  { path: '/archives',    icon: '▤', label: 'Archives',    shortLabel: 'ARC'  },
  { path: '/cerberus',    icon: '⚔', label: 'Cerberus',    shortLabel: 'CRB'  },
  { path: '/observatory', icon: '◎', label: 'Observatory', shortLabel: 'OBS'  },
  { path: '/documents',   icon: '▤', label: 'Documentos',  shortLabel: 'DOC'  },
  { path: '/command',     icon: '⌘', label: 'Command',      shortLabel: 'CMD'  },
]

interface Props {
  collapsed:  boolean
  onToggle:   () => void
}

export default function Sidebar({ collapsed, onToggle }: Props): JSX.Element {
  const { wsConnected, escalations, theme, setTheme } = useHadesStore()

  return (
    <aside className={clsx(
      'flex flex-col h-full bg-[#0D0D15] border-r border-obsidian-700 transition-all duration-300 flex-shrink-0',
      collapsed ? 'w-14' : 'w-56',
    )}>
      {/* Logo */}
      <div className="flex items-center gap-3 px-3 py-4 border-b border-obsidian-700">
        {!collapsed && <img src="/hades-logo.png" alt="HADES — Agent Orchestration System" className="sidebar-logo" />}
        {collapsed && <span className="text-gold text-xs font-bold" aria-label="HADES">H</span>}
        <button
          onClick={onToggle}
          className="ml-auto text-gray-600 hover:text-gray-400 text-xs"
          aria-label="Toggle sidebar"
        >
          {collapsed ? '▶' : '◀'}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 flex flex-col gap-1 px-2 overflow-y-auto">
        {NAV_ITEMS.map(item => (
          <NavLink
            key={item.path}
            to={item.path}
            aria-label={item.label}
            title={item.label}
            end={item.path === '/'}
            className={({ isActive }) => clsx(
              'flex items-center gap-3 px-2.5 py-2 rounded-lg transition-colors font-mono text-xs',
              isActive
                ? 'bg-electric/15 text-gray-100 border border-electric/40 shadow-[inset_3px_0_0_#45c9ec]'
                : 'text-gray-300 hover:text-white hover:bg-obsidian-700',
            )}
          >
            <span className="text-base flex-shrink-0 w-5 text-center">{item.icon}</span>
            {!collapsed && <span>{item.label}</span>}
            {!collapsed && item.path === '/judgment' && escalations.filter(e => e.status === 'PENDING').length > 0 && (
              <span className="ml-auto bg-escalate text-black text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                {escalations.filter(e => e.status === 'PENDING').length}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Status & theme */}
      <div className="border-t border-obsidian-700 px-3 py-3 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', wsConnected ? 'bg-permit animate-pulse' : 'bg-gray-600')} />
          {!collapsed && (
            <span className="font-mono text-[10px] text-gray-500">
              {wsConnected ? 'WebSocket OK' : 'Sin conexión'}
            </span>
          )}
        </div>
        {!collapsed && (
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="text-[10px] font-mono text-gray-500 hover:text-gray-400 text-left"
          >
            {theme === 'dark' ? '☀ Modo claro' : '☾ Modo oscuro'}
          </button>
        )}
      </div>
    </aside>
  )
}
