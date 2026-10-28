import { useState, useCallback, useEffect } from 'react'
import SovereignCore, { type SovereignState, AGENTS } from '../components/SovereignCore.js'

const STATES: SovereignState[] = ['IDLE', 'THINKING', 'EXECUTING', 'WAITING', 'ALERT', 'COMPLETED']

const STATE_COLORS: Record<SovereignState, string> = {
  IDLE:      '#4A90D9',
  THINKING:  '#5CCFFF',
  EXECUTING: '#087CFF',
  WAITING:   '#8899BB',
  ALERT:     '#FF4422',
  COMPLETED: '#00E5CC',
}

const STATE_DESCRIPTIONS: Record<SovereignState, string> = {
  IDLE:      'Sistema en reposo. Mínima actividad neural.',
  THINKING:  'Procesando contexto. Filamentos activos.',
  EXECUTING: 'Máxima energía. Todos los agentes en acción.',
  WAITING:   'En espera de input externo. Umbral reducido.',
  ALERT:     'Anomalía detectada. Protocolo de defensa activo.',
  COMPLETED: 'Ciclo completado. Consolidando memoria.',
}

export default function SovereignLab(): JSX.Element {
  const [state, setState]         = useState<SovereignState>('IDLE')
  const [paused, setPaused]       = useState(false)
  const [showConns, setShowConns] = useState(true)
  const [reduced, setReduced]     = useState(false)
  const [fps, setFps]             = useState(60)
  const [lastAgent, setLastAgent] = useState<string | null>(null)
  const [viewport, setViewport]   = useState<'desktop' | 'tablet' | 'mobile'>('desktop')

  useEffect(() => {
    let lastTime = performance.now()
    let frames   = 0
    let rafId: number
    const tick = () => {
      frames++
      const now = performance.now()
      if (now - lastTime >= 1000) {
        setFps(Math.round(frames * 1000 / (now - lastTime)))
        frames   = 0
        lastTime = now
      }
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [])

  const handleAgentSelect = useCallback((name: string) => {
    setLastAgent(name)
  }, [])

  const VIEWPORT_WIDTHS = { desktop: '100%', tablet: '768px', mobile: '375px' } as const

  return (
    <div style={{ width:'100vw', height:'100vh', background:'#05080F', display:'flex', flexDirection:'column', overflow:'hidden', fontFamily:'"Inter", system-ui, sans-serif' }}>

      {/* Header */}
      <header style={{ flexShrink:0, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 20px', height:'48px', borderBottom:'1px solid rgba(8,124,255,0.12)', background:'rgba(5,8,15,0.95)', backdropFilter:'blur(12px)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:'12px' }}>
          <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:'#087CFF', boxShadow:'0 0 8px #087CFF', animation:'pulse 2s infinite' }} />
          <span style={{ fontSize:'11px', fontWeight:700, letterSpacing:'0.22em', color:'#D7EEFF' }}>HADES</span>
          <span style={{ fontSize:'9px', color:'rgba(92,207,255,0.50)', letterSpacing:'0.1em' }}>/</span>
          <span style={{ fontSize:'9px', fontWeight:500, letterSpacing:'0.18em', color:'rgba(92,207,255,0.60)' }}>SOVEREIGN INTELLIGENCE LAB</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:'16px' }}>
          <span style={{ fontSize:'9px', color: fps >= 50 ? '#00FF88' : fps >= 30 ? '#C9A84C' : '#FF4422', letterSpacing:'0.1em', fontVariantNumeric:'tabular-nums' }}>
            {fps} FPS
          </span>
          <div style={{ display:'flex', gap:'4px' }}>
            {(['desktop','tablet','mobile'] as const).map(v => (
              <button
                key={v}
                onClick={() => setViewport(v)}
                style={{ padding:'3px 8px', fontSize:'8px', letterSpacing:'0.1em', fontWeight:600, borderRadius:'3px', cursor:'pointer', border:'1px solid rgba(8,124,255,0.25)', background: viewport === v ? 'rgba(8,124,255,0.20)' : 'transparent', color: viewport === v ? '#5CCFFF' : 'rgba(215,238,255,0.40)' }}
              >
                {v.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Canvas area */}
      <div style={{ flex:1, display:'flex', justifyContent:'center', alignItems:'center', minHeight:0, background: 'radial-gradient(ellipse at 50% 50%, rgba(6,26,56,0.40) 0%, #05080F 72%)' }}>
        <div style={{ width: VIEWPORT_WIDTHS[viewport], maxWidth:'100%', height:'100%', position:'relative', transition:'width 0.3s cubic-bezier(0.4,0,0.2,1)' }}>
          <SovereignCore
            state={state}
            paused={paused}
            showConnections={showConns}
            reducedMotion={reduced}
            onAgentSelect={handleAgentSelect}
            style={{ width:'100%', height:'100%' }}
          />

          {/* State badge overlay */}
          <div style={{ position:'absolute', top:'16px', left:'50%', transform:'translateX(-50%)', pointerEvents:'none' }}>
            <div style={{ background:'rgba(5,8,15,0.85)', border:`1px solid ${STATE_COLORS[state]}33`, borderRadius:'20px', padding:'5px 14px', display:'flex', alignItems:'center', gap:'8px', backdropFilter:'blur(8px)' }}>
              <div style={{ width:'6px', height:'6px', borderRadius:'50%', background:STATE_COLORS[state], boxShadow:`0 0 6px ${STATE_COLORS[state]}` }} />
              <span style={{ fontSize:'9px', fontWeight:700, letterSpacing:'0.20em', color:STATE_COLORS[state] }}>{state}</span>
            </div>
          </div>

          {/* Selected agent toast */}
          {lastAgent && (
            <div style={{ position:'absolute', bottom:'16px', left:'16px', background:'rgba(5,8,15,0.90)', border:'1px solid rgba(8,124,255,0.20)', borderRadius:'6px', padding:'6px 12px', backdropFilter:'blur(8px)', pointerEvents:'none' }}>
              <span style={{ fontSize:'8px', color:'rgba(92,207,255,0.70)', letterSpacing:'0.1em' }}>SELECTED: </span>
              <span style={{ fontSize:'9px', fontWeight:700, color:'#5CCFFF', letterSpacing:'0.15em' }}>{lastAgent}</span>
            </div>
          )}
        </div>
      </div>

      {/* Control bar */}
      <div style={{ flexShrink:0, borderTop:'1px solid rgba(8,124,255,0.10)', background:'rgba(5,8,15,0.97)', padding:'0 20px' }}>

        {/* State description */}
        <div style={{ padding:'10px 0 8px', borderBottom:'1px solid rgba(8,124,255,0.07)' }}>
          <p style={{ margin:0, fontSize:'9px', color:'rgba(215,238,255,0.40)', letterSpacing:'0.08em', textAlign:'center' }}>
            {STATE_DESCRIPTIONS[state]}
          </p>
        </div>

        {/* Controls row */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 0', gap:'16px', flexWrap:'wrap' }}>

          {/* State switcher */}
          <div style={{ display:'flex', gap:'4px', flexWrap:'wrap' }}>
            {STATES.map(s => (
              <button
                key={s}
                onClick={() => setState(s)}
                style={{
                  padding:'5px 12px', fontSize:'9px', letterSpacing:'0.14em', fontWeight:700,
                  borderRadius:'4px', cursor:'pointer', border:'1px solid',
                  borderColor: state === s ? STATE_COLORS[s] : 'rgba(8,124,255,0.18)',
                  background:  state === s ? `${STATE_COLORS[s]}18` : 'transparent',
                  color:       state === s ? STATE_COLORS[s] : 'rgba(215,238,255,0.45)',
                  boxShadow:   state === s ? `0 0 8px ${STATE_COLORS[s]}33` : 'none',
                  transition:  'all 0.18s ease',
                  fontFamily:  '"Inter", system-ui, sans-serif',
                }}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Toggle controls */}
          <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
            {[
              { label:'PAUSE',       active: paused,     onClick: () => setPaused(p => !p),        activeColor:'#C9A84C' },
              { label:'CONNECTIONS', active: showConns,  onClick: () => setShowConns(c => !c),     activeColor:'#5CCFFF' },
              { label:'REDUCED',     active: reduced,    onClick: () => setReduced(r => !r),       activeColor:'#9B59B6' },
            ].map(btn => (
              <button
                key={btn.label}
                onClick={btn.onClick}
                style={{
                  padding:'5px 12px', fontSize:'9px', letterSpacing:'0.14em', fontWeight:700,
                  borderRadius:'4px', cursor:'pointer', border:'1px solid',
                  borderColor: btn.active ? btn.activeColor : 'rgba(8,124,255,0.18)',
                  background:  btn.active ? `${btn.activeColor}18` : 'transparent',
                  color:       btn.active ? btn.activeColor : 'rgba(215,238,255,0.45)',
                  transition:  'all 0.18s ease',
                  fontFamily:  '"Inter", system-ui, sans-serif',
                }}
              >
                {btn.active && btn.label === 'PAUSE' ? 'RESUME' : btn.label}
              </button>
            ))}
          </div>
        </div>

        {/* Agent legend */}
        <div style={{ display:'flex', gap:'12px', paddingBottom:'12px', overflowX:'auto', flexWrap:'wrap' }}>
          {AGENTS.map(a => {
            const glowHex = `#${a.glowCol.getHexString()}`
            const statusColor = a.status === 'active' ? '#00FF88' : a.status === 'standby' ? '#C9A84C' : '#FF3333'
            return (
              <div key={a.id} style={{ display:'flex', alignItems:'center', gap:'5px', flexShrink:0 }}>
                <div style={{ width:'5px', height:'5px', borderRadius:'50%', background:statusColor }} />
                <span style={{ fontSize:'8px', fontWeight:600, color:glowHex, letterSpacing:'0.12em' }}>{a.name}</span>
                <span style={{ fontSize:'7px', color:'rgba(215,238,255,0.25)', letterSpacing:'0.05em' }}>{a.role}</span>
              </div>
            )
          })}
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.4; } }
        button:hover { filter: brightness(1.15); }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width:4px; height:4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(8,124,255,0.25); border-radius:2px; }
      `}</style>
    </div>
  )
}
