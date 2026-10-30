import { useCallback, useEffect, useRef, useState } from 'react'
import { startDemoSession, DemoStartError, type DemoPhase, type DemoSessionData } from '../lib/demoStart.js'
import { useT, useLang } from '../lib/i18n.js'
import { LanguageSwitch } from './LoginPanel.js'

const STEPS: Array<{ phase: DemoPhase[]; key: 'demo.w.s1' | 'demo.w.s2' | 'demo.w.s3' | 'demo.w.s4' }> = [
  { phase: ['connecting'], key: 'demo.w.s1' },
  { phase: ['waking'], key: 'demo.w.s2' },
  { phase: ['creating'], key: 'demo.w.s3' },
  { phase: ['ready'], key: 'demo.w.s4' },
]

/**
 * Shown the moment "Explore Demo" is pressed. The introduction is static content and is explicitly labelled
 * as "no active session"; a session exists only after the server confirms it.
 */
export default function DemoWelcome({ onSession, onCancel }: { onSession: (s: DemoSessionData) => Promise<void> | void; onCancel: () => void }): JSX.Element {
  const t = useT()
  const lang = useLang()
  const [phase, setPhase] = useState<DemoPhase>('connecting')
  const [errorKey, setErrorKey] = useState<'demo.error' | 'demo.capacity' | 'demo.w.timeout' | 'demo.w.limit' | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const ctl = useRef<AbortController | null>(null)
  const started = useRef(performance.now())

  const start = useCallback(() => {
    ctl.current?.abort()
    const c = new AbortController(); ctl.current = c
    started.current = performance.now()
    setErrorKey(null); setPhase('connecting')
    startDemoSession({ lang, signal: c.signal, onPhase: p => { if (!c.signal.aborted) setPhase(p) } })
      .then(s => { if (!c.signal.aborted) return onSession(s) })
      .catch(e => {
        if (c.signal.aborted) return
        const code = e instanceof DemoStartError ? e.code : 'HTTP'
        setErrorKey(code === 'CAPACITY' ? 'demo.capacity' : code === 'LIMIT' ? 'demo.w.limit' : code === 'TIMEOUT' ? 'demo.w.timeout' : 'demo.error')
      })
  }, [lang, onSession])

  // The backend wait is dead time: use it to download the heavy 3D core so the hologram is ready on arrival.
  useEffect(() => { void import('./HolographicCore3D.js').catch(() => {}); void import('../AppShell.js') }, [])
  useEffect(() => { start(); return () => ctl.current?.abort() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (errorKey) return
    const id = setInterval(() => setElapsed(Math.round((performance.now() - started.current) / 100) / 10), 100)
    return () => clearInterval(id)
  }, [errorKey])

  const current = STEPS.findIndex(s => s.phase.includes(phase))
  return (
    <main className="login-shell">
      <section className="login-card demo-welcome" aria-live="polite" data-testid="demo-welcome">
        <LanguageSwitch />
        <img className="login-logo" src="/hades-logo.png" alt="HADES — Agent Orchestration System" />
        <p className="login-intro">{t('demo.w.noSession')}</p>
        <div className="login-divider" />
        <h2>{t('demo.w.title')}</h2>
        <ol className="demo-steps">
          {STEPS.map((s, i) => {
            const state = errorKey ? (i < current ? 'done' : i === current ? 'fail' : 'todo') : i < current ? 'done' : i === current ? 'active' : 'todo'
            if (s.phase[0] === 'waking' && current < 1 && !errorKey) return null
            return <li key={s.key} className={`demo-step ${state}`}><span aria-hidden="true" className="demo-dot" />{t(s.key)}</li>
          })}
        </ol>
        <div className="demo-progress" role="progressbar" aria-valuemin={0} aria-valuemax={4} aria-valuenow={Math.max(0, current)}>
          <span style={{ width: `${errorKey ? 0 : ((Math.max(0, current) + 1) / 4) * 100}%` }} />
        </div>
        {errorKey
          ? <p role="alert" className="login-error">{t(errorKey)}</p>
          : <p className="demo-elapsed">{t('demo.w.elapsed')}: {elapsed.toFixed(1)} s</p>}
        <div className="demo-intro">
          <div><h3>{t('demo.w.i1h')}</h3><p>{t('demo.w.i1')}</p></div>
          <div><h3>{t('demo.w.i2h')}</h3><p>{t('demo.w.i2')}</p></div>
          <div><h3>{t('demo.w.i3h')}</h3><p>{t('demo.w.i3')}</p></div>
        </div>
        <div className="demo-actions">
          {errorKey && errorKey !== 'demo.capacity' && errorKey !== 'demo.w.limit' && <button type="button" className="login-demo-btn" onClick={start}>{t('demo.w.retry')}</button>}
          <button type="button" className="demo-cancel" onClick={() => { ctl.current?.abort(); onCancel() }}>{t('demo.w.cancel')}</button>
        </div>
      </section>
    </main>
  )
}
