import { useState } from 'react'
import NeuralHadesCore, { type CoreState } from '../components/NeuralHadesCore.js'

const STATE_CONFIG: Record<CoreState, { label: string; desc: string; color: string }> = {
  IDLE:      { label: 'EN ESPERA',  desc: 'Sistema en reposo — pulso tranquilo',             color: '#1a3a6a' },
  EXECUTING: { label: 'EJECUTANDO', desc: 'Agentes activos — red neuronal en plena actividad', color: '#0044cc' },
  ALERT:     { label: 'ALERTA',     desc: 'Anomalía detectada — modo de respuesta crítica',   color: '#8a1a08' },
}

export default function NeuralLabPage(): JSX.Element {
  const [state, setState] = useState<CoreState>('IDLE')
  const cfg = STATE_CONFIG[state]

  return (
    <div
      style={{
        height: '100vh',
        width: '100vw',
        background: '#000408',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: '"JetBrains Mono", "Space Mono", monospace',
      }}
    >
      {/* Header */}
      <div style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 28px',
        borderBottom: '1px solid #0a1a3a',
      }}>
        <div>
          <div style={{ color: '#3366aa', fontSize: 10, letterSpacing: '0.2em', marginBottom: 2 }}>
            HADES — LABORATORIO VISUAL
          </div>
          <div style={{ color: '#cce8ff', fontSize: 13, fontWeight: 600, letterSpacing: '0.08em' }}>
            NEURAL CORE — PREVIEW
          </div>
        </div>
        {/* State indicator */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 14px',
          border: `1px solid ${cfg.color}`,
          borderRadius: 4,
          backgroundColor: `${cfg.color}22`,
        }}>
          <div style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            backgroundColor: cfg.color,
            boxShadow: `0 0 8px ${cfg.color}`,
            animation: state === 'IDLE' ? 'none' : 'pulse 1s infinite',
          }} />
          <span style={{ color: cfg.color, fontSize: 11, letterSpacing: '0.14em' }}>
            {cfg.label}
          </span>
        </div>
      </div>

      {/* Core canvas — fills remaining space via absolute */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <NeuralHadesCore
          state={state}
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
        />

        {/* State description overlay */}
        <div style={{
          position: 'absolute',
          bottom: 24,
          left: '50%',
          transform: 'translateX(-50%)',
          color: '#2a4a8a',
          fontSize: 11,
          letterSpacing: '0.12em',
          textAlign: 'center',
          pointerEvents: 'none',
        }}>
          {cfg.desc}
        </div>
      </div>

      {/* State controls */}
      <div style={{
        flexShrink: 0,
        display: 'flex',
        justifyContent: 'center',
        gap: 12,
        padding: '16px 28px',
        borderTop: '1px solid #0a1a3a',
      }}>
        {(Object.keys(STATE_CONFIG) as CoreState[]).map(s => (
          <button
            key={s}
            onClick={() => setState(s)}
            style={{
              padding: '8px 22px',
              border: `1px solid ${state === s ? STATE_CONFIG[s].color : '#0a1a3a'}`,
              borderRadius: 3,
              background: state === s ? `${STATE_CONFIG[s].color}22` : 'transparent',
              color: state === s ? STATE_CONFIG[s].color : '#2a4a8a',
              fontSize: 10,
              letterSpacing: '0.18em',
              cursor: 'pointer',
              transition: 'all 0.25s',
              fontFamily: 'inherit',
            }}
          >
            {STATE_CONFIG[s].label}
          </button>
        ))}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  )
}
