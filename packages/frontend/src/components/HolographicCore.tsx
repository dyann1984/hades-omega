import { Component, Suspense, lazy } from 'react'
import { useHadesStore } from '../store/index.js'
import type { SubAgent } from './HolographicCore3D.js'

// Three.js core loaded lazily
const ThreeDCore = lazy(() => import('./HolographicCore3D.js'))

function FallbackCore(): JSX.Element {
  const agents = useHadesStore(s => s.agents)

  const agentList = Object.values(agents)
  const anyActive = agentList.some(a => a.status !== 'IDLE')

  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <svg
        viewBox="0 0 400 400"
        className="w-full h-full max-w-sm"
        aria-label="HADES - Red de agentes"
      >
        {/* Outer ring */}
        <circle cx="200" cy="200" r="180" fill="none" stroke="#1E1E30" strokeWidth="1" />
        <circle cx="200" cy="200" r="140" fill="none" stroke="#00D4FF22" strokeWidth="1" strokeDasharray="4 4" />

        {/* Core glow */}
        {anyActive && <circle cx="200" cy="200" r="55" fill="#FFD70011" className="animate-pulse" />}
        <circle cx="200" cy="200" r="48" fill="#12121A" stroke="#FFD700" strokeWidth="1.5" />

        {/* HADES symbol */}
        <text x="200" y="196" textAnchor="middle" fill="#FFD700" fontSize="18" fontFamily="Space Grotesk">✦</text>
        <text x="200" y="214" textAnchor="middle" fill="#FFD700" fontSize="9" fontFamily="JetBrains Mono" fontWeight="600">HADES</text>

        {/* Connection lines to agents */}
        {[
          { x: 200, y: 60,  name: 'CHARON'     },
          { x: 340, y: 130, name: 'PERSEPHONE'  },
          { x: 340, y: 270, name: 'MINOS'       },
          { x: 200, y: 340, name: 'ELYSIUM'     },
          { x: 60,  y: 270, name: 'TARTARUS'    },
          { x: 60,  y: 130, name: 'CERBERUS'    },
        ].map(({ x, y, name }) => {
          const agName = name as keyof typeof agents
          const agent  = agents[agName]
          const color  = !agent ? '#444466'
            : agent.status === 'THINKING'  ? '#00D4FF'
            : agent.status === 'EXECUTING' ? '#00D4FF'
            : agent.status === 'WAITING'   ? '#FFB800'
            : agent.status === 'ERROR'     ? '#FF3366'
            : '#444466'

          return (
            <g key={name}>
              <line
                x1="200" y1="200" x2={x} y2={y}
                stroke={color} strokeWidth="0.5" opacity="0.6"
                strokeDasharray={agent?.status !== 'IDLE' ? '3 3' : undefined}
              />
              <circle cx={x} cy={y} r="24" fill="#12121A" stroke={color} strokeWidth="1.5" />
              <text x={x} y={y + 4} textAnchor="middle" fill={color} fontSize="7.5" fontFamily="JetBrains Mono" fontWeight="600">
                {name.slice(0, 7)}
              </text>
              {agent?.status !== 'IDLE' && (
                <circle cx={x + 18} cy={y - 18} r="4" fill={color} className="animate-pulse" />
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

class CoreErrorBoundary extends Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <FallbackCore /> : this.props.children }
}

interface Props {
  selectedAgent?: SubAgent | null
  onAgentSelect?: (name: SubAgent) => void
  paused?: boolean
  missionActive?: boolean
  lowPower?: boolean
}

export default function HolographicCore({ selectedAgent, onAgentSelect, paused, missionActive, lowPower }: Props = {}): JSX.Element {
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  if (prefersReducedMotion) return <FallbackCore />

  return (
    <CoreErrorBoundary><Suspense fallback={<FallbackCore />}>
      <ThreeDCore selectedAgent={selectedAgent} onAgentSelect={onAgentSelect} paused={paused} missionActive={missionActive} lowPower={lowPower} />
    </Suspense></CoreErrorBoundary>
  )
}
