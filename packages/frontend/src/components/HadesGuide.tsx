import { useCallback, useEffect, useRef, useState } from 'react'
import { useLang } from '../lib/i18n.js'
import { isDemoToken } from '../lib/api.js'
import { documentedProvider, suggestionsFor, type GuideAnswer, type GuideProvider } from '../lib/hadesGuide/engine.js'
import { GREETING, type Lang } from '../lib/hadesGuide/knowledge.js'

type Msg = { id: number; role: 'user' | 'guide'; text: string; sources?: string[]; kind?: GuideAnswer['kind'] }

const L = {
  open:    { es: 'Abrir guía HADES', en: 'Open HADES guide' },
  close:   { es: 'Cerrar guía', en: 'Close guide' },
  title:   { es: 'HADES · Guía', en: 'HADES · Guide' },
  badge:   { es: 'Guía documentada · no es IA generativa', en: 'Documented guide · not generative AI' },
  input:   { es: 'Escribe tu pregunta', en: 'Type your question' },
  send:    { es: 'Enviar', en: 'Send' },
  sources: { es: 'Fuentes', en: 'Sources' },
  invite:  { es: 'Hablar con HADES', en: 'Talk to HADES' },
  dismiss: { es: 'Descartar invitación', en: 'Dismiss invitation' },
  sugg:    { es: 'Preguntas sugeridas', en: 'Suggested questions' },
  log:     { es: 'Conversación con la guía', en: 'Conversation with the guide' },
  you:     { es: 'Tú', en: 'You' },
  guide:   { es: 'HADES', en: 'HADES' },
} as const

const reducedMotion = (): boolean => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Animated holographic bust: obsidian helm, gold trim, electric-blue energy. Pure SVG + CSS (no static image). */
export function HadesAvatar({ speaking, size = 72 }: { speaking: boolean; size?: number }): JSX.Element {
  return (
    <svg className={`hg-avatar${speaking ? ' speaking' : ''}`} width={size} height={size} viewBox="0 0 100 100" role="img" aria-label="HADES" data-testid="hades-avatar">
      <defs>
        <radialGradient id="hgGlow" cx="50%" cy="45%" r="55%"><stop offset="0%" stopColor="#00D4FF" stopOpacity=".35" /><stop offset="100%" stopColor="#00D4FF" stopOpacity="0" /></radialGradient>
        <linearGradient id="hgObs" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1b2230" /><stop offset="100%" stopColor="#05070b" /></linearGradient>
        <linearGradient id="hgGold" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#FFE27A" /><stop offset="55%" stopColor="#D4A017" /><stop offset="100%" stopColor="#8a6410" /></linearGradient>
      </defs>
      <circle cx="50" cy="50" r="46" fill="url(#hgGlow)" />
      <ellipse className="hg-ring hg-ring-a" cx="50" cy="50" rx="46" ry="16" fill="none" stroke="#00D4FF" strokeWidth=".8" opacity=".7" />
      <ellipse className="hg-ring hg-ring-b" cx="50" cy="50" rx="46" ry="16" fill="none" stroke="#FFD700" strokeWidth=".6" opacity=".55" />
      {/* helm */}
      <path d="M50 8 C30 10 22 26 22 44 L22 62 L30 74 L40 80 L40 90 L60 90 L60 80 L70 74 L78 62 L78 44 C78 26 70 10 50 8 Z" fill="url(#hgObs)" stroke="url(#hgGold)" strokeWidth="1.6" />
      <path d="M50 8 L50 30" stroke="url(#hgGold)" strokeWidth="2" />
      <path d="M30 28 Q50 20 70 28" fill="none" stroke="url(#hgGold)" strokeWidth="1.4" />
      <path d="M26 56 L34 66 M74 56 L66 66" stroke="url(#hgGold)" strokeWidth="1.4" />
      {/* visor */}
      <path d="M30 42 L44 46 L50 44 L56 46 L70 42 L66 52 L54 52 L50 56 L46 52 L34 52 Z" fill="#02060c" stroke="url(#hgGold)" strokeWidth="1" />
      <g className="hg-eyes"><rect x="36" y="46" width="9" height="2.6" rx="1.2" fill="#00D4FF" /><rect x="55" y="46" width="9" height="2.6" rx="1.2" fill="#00D4FF" /></g>
      {/* energy veins */}
      <path className="hg-vein" d="M50 60 L50 76 M44 66 L56 66" stroke="#00D4FF" strokeWidth="1" strokeLinecap="round" />
      <line className="hg-scan" x1="22" x2="78" y1="10" y2="10" stroke="#00D4FF" strokeWidth=".8" opacity=".7" />
      {/* voice bars (visible while speaking) */}
      <g className="hg-voice" aria-hidden="true">{[0, 1, 2, 3, 4].map(i => <rect key={i} x={38 + i * 5} y="82" width="2.4" height="6" rx="1" fill="#00D4FF" style={{ animationDelay: `${i * 90}ms` }} />)}</g>
    </svg>
  )
}

export default function HadesGuide({ provider = documentedProvider }: { provider?: GuideProvider }): JSX.Element {
  const lang: Lang = useLang()
  const [open, setOpen] = useState(false)
  const [invite, setInvite] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [shown, setShown] = useState<{ id: number; chars: number } | null>(null)
  const [draft, setDraft] = useState('')
  const [sugg, setSugg] = useState<string[]>(() => suggestionsFor(lang))
  const [announce, setAnnounce] = useState('')
  const idRef = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const logRef = useRef<HTMLDivElement>(null)
  const speaking = shown !== null

  // Greeting appears once per browser session, only in DEMO, as a discreet invitation (not an automatic popup panel).
  useEffect(() => {
    if (!isDemoToken()) return
    let seen = false
    try { seen = sessionStorage.getItem('hades-guide-invited') === '1' } catch { /* ignore */ }
    if (seen) return
    const show = setTimeout(() => setInvite(true), 1200)
    const hide = setTimeout(() => setInvite(false), 16_000)
    return () => { clearTimeout(show); clearTimeout(hide) }
  }, [])
  useEffect(() => { setSugg(suggestionsFor(lang)) }, [lang])

  const push = useCallback((m: Omit<Msg, 'id'>): number => { const id = ++idRef.current; setMsgs(prev => [...prev, { ...m, id }]); return id }, [])

  const reveal = useCallback((id: number, text: string) => {
    if (reducedMotion()) { setAnnounce(text); return }
    let n = 0
    setShown({ id, chars: 0 })
    const timer = setInterval(() => {
      n += 3
      if (n >= text.length) { clearInterval(timer); setShown(null); setAnnounce(text) } else setShown({ id, chars: n })
    }, 16)
  }, [])

  const openPanel = useCallback(() => {
    setOpen(true); setInvite(false)
    try { sessionStorage.setItem('hades-guide-invited', '1') } catch { /* ignore */ }
    setMsgs(prev => {
      if (prev.length) return prev
      const id = ++idRef.current
      queueMicrotask(() => reveal(id, GREETING[lang]))
      return [{ id, role: 'guide', text: GREETING[lang], kind: 'documented' }]
    })
  }, [lang, reveal])

  const ask = useCallback(async (raw: string) => {
    const q = raw.trim().slice(0, 300)
    if (!q || speaking) return
    push({ role: 'user', text: q }); setDraft('')
    const a = await provider.answer(q, lang)
    const id = push({ role: 'guide', text: a.text, sources: a.sources, kind: a.kind })
    setSugg(a.suggestions.length ? a.suggestions : suggestionsFor(lang))
    reveal(id, a.text)
  }, [lang, provider, push, reveal, speaking])

  useEffect(() => { if (open) inputRef.current?.focus() }, [open])
  useEffect(() => { logRef.current?.scrollTo?.({ top: logRef.current.scrollHeight }) }, [msgs, shown])

  const close = useCallback(() => { setOpen(false); setShown(null); btnRef.current?.focus() }, [])
  const onKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); return }
    if (e.key !== 'Tab' || !panelRef.current) return
    const f = [...panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]),input')]
    if (!f.length) return
    const first = f[0]!, last = f[f.length - 1]!
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  return (
    <div className="hg-root" data-testid="hades-guide">
      {invite && !open && (
        <div className="hg-invite" role="status">
          <button type="button" className="hg-invite-main" onClick={openPanel}><HadesAvatar speaking={false} size={34} /><span>{GREETING[lang]}</span></button>
          <button type="button" className="hg-invite-x" aria-label={L.dismiss[lang]} onClick={() => { setInvite(false); try { sessionStorage.setItem('hades-guide-invited', '1') } catch { /* ignore */ } }}>×</button>
        </div>
      )}
      {open && (
        <div ref={panelRef} className="hg-panel" role="dialog" aria-modal="false" aria-label={L.title[lang]} onKeyDown={onKeyDown} data-testid="hades-guide-panel">
          <header className="hg-head">
            <HadesAvatar speaking={speaking} size={52} />
            <div className="hg-head-t"><strong>{L.title[lang]}</strong><span>{L.badge[lang]}</span></div>
            <button type="button" className="hg-close" aria-label={L.close[lang]} onClick={close}>×</button>
          </header>
          <div ref={logRef} className="hg-log" role="log" aria-label={L.log[lang]} tabIndex={0}>
            {msgs.map(m => {
              const partial = shown && shown.id === m.id
              const text = partial ? m.text.slice(0, shown!.chars) : m.text
              return (
                <div key={m.id} className={`hg-msg ${m.role}${m.kind === 'not_implemented' ? ' warn' : ''}${m.kind === 'refusal' ? ' refuse' : ''}`} data-no-translate>
                  <span className="hg-who">{m.role === 'user' ? L.you[lang] : L.guide[lang]}</span>
                  <p aria-hidden={partial ? true : undefined}>{text}{partial && <i className="hg-caret" />}</p>
                  {m.role === 'guide' && !partial && m.sources && m.sources.length > 0 && <small className="hg-src">{L.sources[lang]}: {m.sources.join(' · ')}</small>}
                </div>
              )
            })}
          </div>
          <div className="sr-only" aria-live="polite" data-testid="hades-guide-live">{announce}</div>
          <div className="hg-sugg" role="group" aria-label={L.sugg[lang]}>
            {sugg.slice(0, 4).map(s => <button key={s} type="button" disabled={speaking} onClick={() => void ask(s)}>{s}</button>)}
          </div>
          <form className="hg-form" onSubmit={e => { e.preventDefault(); void ask(draft) }}>
            <input ref={inputRef} value={draft} maxLength={300} onChange={e => setDraft(e.target.value)} placeholder={L.input[lang]} aria-label={L.input[lang]} autoComplete="off" data-no-translate />
            <button type="submit" disabled={!draft.trim() || speaking}>{L.send[lang]}</button>
          </form>
        </div>
      )}
      <button ref={btnRef} type="button" className={`hg-fab${open ? ' on' : ''}`} aria-label={L.open[lang]} aria-expanded={open} aria-haspopup="dialog" title={L.invite[lang]} onClick={() => (open ? close() : openPanel())}>
        <HadesAvatar speaking={speaking} size={40} />
      </button>
    </div>
  )
}
