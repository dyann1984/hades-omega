import { useState, useEffect, useCallback } from 'react'
import PremiumObsidianCore, { type CoreState } from '../components/PremiumObsidianCore.js'

const STATES = ['IDLE', 'THINKING', 'EXECUTING', 'WAITING', 'ALERT', 'COMPLETED'] as const

const STATE_COLOR: Record<string, string> = {
  IDLE:      '#4A90D9',
  THINKING:  '#5CCFFF',
  EXECUTING: '#087CFF',
  WAITING:   '#8899BB',
  ALERT:     '#FF4422',
  COMPLETED: '#00E5CC',
}

export default function PremiumCoreLab(): JSX.Element {
  const [state, setState] = useState<CoreState>('IDLE')
  const [paused, setPaused] = useState(false)
  const [fps, setFps] = useState(60)
  const [lastAgent, setLastAgent] = useState<string | null>(null)

  useEffect(() => {
    let last = performance.now(), frames = 0, id: number
    const tick = () => {
      frames++
      const now = performance.now()
      if (now - last >= 1000) {
        setFps(Math.round(frames * 1000 / (now - last)))
        frames = 0; last = now
      }
      id = requestAnimationFrame(tick)
    }
    id = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(id)
  }, [])

  const handleSelect = useCallback((name: string) => setLastAgent(name), [])

  const BTN: React.CSSProperties = {
    padding: '5px 13px', fontSize: '8px', letterSpacing: '0.15em', fontWeight: 700,
    borderRadius: '4px', cursor: 'pointer', border: '1px solid rgba(8,124,255,0.20)',
    background: 'transparent', color: 'rgba(215,238,255,0.45)',
    fontFamily: '"Inter", system-ui, sans-serif', transition: 'all 0.15s ease',
  }

  return (
    <div style={{ width:'100vw', height:'100vh', background:'#03050C', display:'flex', flexDirection:'column', overflow:'hidden', fontFamily:'"Inter", system-ui, sans-serif' }}>

      {/* Header */}
      <header style={{ flexShrink:0, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 20px', height:'46px', borderBottom:'1px solid rgba(8,124,255,0.10)', background:'rgba(3,5,12,0.96)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
          <div style={{ width:'7px', height:'7px', borderRadius:'50%', background:STATE_COLOR[state], boxShadow:`0 0 8px ${STATE_COLOR[state]}` }} />
          <span style={{ fontSize:'11px', fontWeight:700, letterSpacing:'0.22em', color:'#D7EEFF' }}>HADES OMEGA</span>
          <span style={{ color:'rgba(92,207,255,0.35)', fontSize:'9px' }}>/</span>
          <span style={{ fontSize:'9px', fontWeight:500, letterSpacing:'0.18em', color:'rgba(92,207,255,0.55)' }}>PREMIUM CORE — LAB</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'14px' }}>
          {lastAgent && (
            <span style={{ fontSize:'8px', letterSpacing:'0.10em', color:'rgba(92,207,255,0.55)' }}>
              ▶ <span style={{ color:'#5CCFFF' }}>{lastAgent}</span>
            </span>
          )}
          <span style={{ fontSize:'9px', color: fps >= 50 ? '#00EE88' : fps >= 30 ? '#C9A84C' : '#FF4422', fontVariantNumeric:'tabular-nums', letterSpacing:'0.08em' }}>
            {fps} FPS
          </span>
        </div>
      </header>

      {/* Canvas */}
      <div style={{ flex:1, minHeight:0, background:'radial-gradient(ellipse at 50% 60%, rgba(6,20,50,0.45) 0%, #03050C 70%)' }}>
        <PremiumObsidianCore
          state={state}
          paused={paused}
          onAgentSelect={handleSelect}
          style={{ width:'100%', height:'100%' }}
        />
      </div>

      {/* Controls */}
      <div style={{ flexShrink:0, borderTop:'1px solid rgba(8,124,255,0.08)', background:'rgba(3,5,12,0.98)', padding:'10px 20px 12px' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'16px', flexWrap:'wrap' }}>

          {/* State buttons */}
          <div style={{ display:'flex', gap:'4px', flexWrap:'wrap' }}>
            {STATES.map(s => (
              <button
                key={s}
                style={{
                  ...BTN,
                  borderColor: state === s ? STATE_COLOR[s] : 'rgba(8,124,255,0.18)',
                  background:  state === s ? `${STATE_COLOR[s]}15` : 'transparent',
                  color:       state === s ? STATE_COLOR[s] : 'rgba(215,238,255,0.42)',
                  boxShadow:   state === s ? `0 0 10px ${STATE_COLOR[s]}25` : 'none',
                }}
                onClick={() => setState(s)}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Toggle buttons */}
          <div style={{ display:'flex', gap:'6px' }}>
            <button
              onClick={() => setPaused(p => !p)}
              style={{
                ...BTN,
                borderColor: paused ? '#C9A84C' : 'rgba(8,124,255,0.18)',
                background:  paused ? '#C9A84C12' : 'transparent',
                color:       paused ? '#C9A84C' : 'rgba(215,238,255,0.42)',
              }}
            >
              {paused ? 'REANUDAR' : 'PAUSA'}
            </button>
          </div>
        </div>

        {/* Info */}
        <div style={{ marginTop:'9px', fontSize:'8px', color:'rgba(92,207,255,0.35)', letterSpacing:'0.08em' }}>
          LABORATORIO AISLADO — NÚCLEO OBSIDIANA CRISTALINA — BASEADO EN REFERENCIA APROBADA
        </div>
      </div>
    </div>
  )
}
