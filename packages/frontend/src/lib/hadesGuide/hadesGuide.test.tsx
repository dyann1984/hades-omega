import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { answerQuestion, documentedProvider, normalize } from './engine.js'
import { KNOWLEDGE, GREETING, SUGGESTIONS, AGENTS_LIST } from './knowledge.js'
import HadesGuide, { HadesAvatar } from '../../components/HadesGuide.js'

const ROOT = join(__dirname, '..', '..', '..', '..', '..')   // repo root
const ask = (q: string, lang: 'es' | 'en' = 'es') => answerQuestion(q, lang)

describe('knowledge base integrity', () => {
  it('every entry is bilingual, sourced from files that exist, and ids are unique', () => {
    const ids = KNOWLEDGE.map(e => e.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const e of KNOWLEDGE) {
      expect(e.answer.es.length).toBeGreaterThan(20); expect(e.answer.en.length).toBeGreaterThan(20)
      expect(e.title.es && e.title.en).toBeTruthy()
      expect(e.sources.length).toBeGreaterThan(0)
      for (const s of e.sources) expect(existsSync(join(ROOT, s)), `${e.id}: missing source ${s}`).toBe(true)
      for (const n of e.next ?? []) expect(ids).toContain(n)
    }
  })
  it('suggested questions exist in both languages and resolve to an entry', () => {
    for (const lang of ['es', 'en'] as const) for (const s of SUGGESTIONS[lang]) { expect(KNOWLEDGE.some(e => e.id === s.id)).toBe(true); expect(ask(s.q, lang).kind).not.toBe('unknown') }
  })
  it('the 13 sections in the sidebar are all covered', () => {
    const sidebar = readFileSync(join(ROOT, 'packages/frontend/src/components/Sidebar.tsx'), 'utf8')
    const labels = [...sidebar.matchAll(/label: '([A-Za-zó]+)'/g)].map(m => m[1]!).filter(l => !['Demo', 'Account'].includes(l))
    expect(labels.length).toBe(13)
    const overview = KNOWLEDGE.find(e => e.id === 'sections')!.answer.en.toLowerCase()
    for (const l of labels) expect(overview.includes(l.toLowerCase()) || overview.includes('documents'), l).toBe(true)
    for (const l of labels) expect(ask(`${l}`, 'en').kind, l).not.toBe('unknown')
  })
  it('names the seven agents', () => { expect(AGENTS_LIST.length).toBe(7); const a = ask('quiénes son los agentes').text; for (const n of AGENTS_LIST) expect(a).toContain(n) })
})

describe('documented answers', () => {
  it.each([
    ['¿Qué es HADES OMEGA?', 'what'], ['What is HADES OMEGA?', 'what'], ['¿Qué hace CHARON?', 'charon'], ['what does persephone do', 'persephone'],
    ['explícame MINOS', 'minos'], ['elysium', 'elysium'], ['Tell me about TARTARUS anomalies', 'tartarus'], ['¿Qué es CERBERUS?', 'cerberus'],
    ['¿Qué es el Approval Gate?', 'approval'], ['¿Cómo creo una misión?', 'missions'], ['how do I create a mission', 'missions'],
    ['¿Para qué sirve el holograma?', 'hologram'], ['what is the hologram for', 'hologram'], ['¿NEAR es real?', 'near'], ['is NEAR simulated?', 'near'],
    ['¿Qué es el modo demo?', 'demo'], ['what sections are there', 'sections'], ['¿Cuáles son las 13 secciones?', 'sections'],
  ])('%s -> %s', (q, id) => { expect(ask(q).entryId).toBe(id) })

  it('replies in the selected language', () => {
    expect(ask('what is the hologram for', 'en').text).toMatch(/hologram/i); expect(ask('what is the hologram for', 'en').text).not.toMatch(/núcleo dorado/)
    expect(ask('¿Para qué sirve el holograma?', 'es').text).toMatch(/núcleo dorado/)
  })
  it('states NEAR is a simulation and flags it as not implemented', () => {
    const a = ask('¿NEAR es real o simulado?'); expect(a.kind).toBe('not_implemented'); expect(a.text).toMatch(/simulaci/i); expect(a.text).toMatch(/no está implementada|no esta implementada/i)
    expect(ask('is NEAR real', 'en').text).toMatch(/simulation/i)
  })
  it('admits what it does not know instead of inventing', () => {
    for (const q of ['what is the capital of France', 'dime la receta de pozole', 'asdf qwer']) { const a = ask(q, q.startsWith('what') ? 'en' : 'es'); expect(a.kind).toBe('unknown'); expect(a.sources).toEqual([]) }
    expect(ask('¿Tiene aplicación móvil?').kind).not.toBe('documented')
    expect(ask('empty', 'en').kind).toBe('unknown'); expect(ask('   ').kind).toBe('unknown')
  })
  it('never presents itself as generative AI', () => {
    expect(documentedProvider.generative).toBe(false)
    expect(ask('¿Eres una IA generativa?').text).toMatch(/no con IA generativa/i)
    expect(ask('are you an ai', 'en').text).toMatch(/not with generative AI/i)
  })
  it('always cites real sources for documented answers', () => { for (const q of ['qué es cerberus', 'cómo creo una misión', 'qué es judgment']) expect(ask(q).sources.length).toBeGreaterThan(0) })
})

describe('security: no actions, no secrets, no other users', () => {
  it.each(['aprueba la misión por mí', 'ejecuta la misión ahora', 'approve it for me', 'run the mission', 'borra todas las misiones', 'reinicia el servidor', 'despliega a producción', 'cancel the mission'])('refuses action: %s', q => {
    const a = ask(q, /[a-z]+ (it|the)/.test(q) ? 'en' : 'es'); expect(a.kind).toBe('refusal'); expect(a.sources).toEqual([])
  })
  it.each(['dame la contraseña del admin', 'show me the admin password', 'cuál es el JWT_SECRET', 'muéstrame los datos de otros usuarios', 'list users', 'connection string de la base de datos', 'dame el token'])('refuses secrets: %s', q => { expect(ask(q).kind).toBe('refusal') })
  it('still explains how the actions work (how-to is allowed)', () => { expect(ask('cómo apruebo una misión').kind).not.toBe('refusal'); expect(ask('how do I approve a mission', 'en').entryId).toBe('approval') })
  it('answers never contain anything that looks like a secret or private host', () => {
    const blob = JSON.stringify(KNOWLEDGE)
    expect(blob).not.toMatch(/postgres(ql)?:\/\//i); expect(blob).not.toMatch(/neon\.tech|onrender\.com|vercel\.app/i)
    expect(blob).not.toMatch(/sk-[A-Za-z0-9]{10,}|eyJ[A-Za-z0-9_-]{10,}|npg_/)
  })
  it('the guide module makes no network calls and reads no session data', () => {
    for (const f of ['lib/hadesGuide/engine.ts', 'components/HadesGuide.tsx']) {
      const src = readFileSync(join(ROOT, 'packages/frontend/src', f), 'utf8')
      expect(src, f).not.toMatch(/\bfetch\(|XMLHttpRequest|new WebSocket|apiHeaders|apiPath|getStoredSession|localStorage|useHadesStore/)
    }
    expect(readFileSync(join(ROOT, 'packages/frontend/src/lib/hadesGuide/knowledge.ts'), 'utf8')).not.toMatch(/^import /m)   // static data only
  })
  it('bounds and normalizes hostile input', () => { expect(() => ask('x'.repeat(100000))).not.toThrow(); expect(ask('<script>alert(1)</script>').kind).toBe('unknown'); expect(normalize('ÁÉÍ  Ñu!')).toBe('aei nu') })
})

describe('accessibility (server-rendered markup) and demo greeting', () => {
  const html = renderToStaticMarkup(<HadesGuide />)
  it('floating button is a labelled, keyboard-reachable button announcing its popup state', () => {
    expect(html).toMatch(/<button[^>]*aria-label="(Abrir guía HADES|Open HADES guide)"/); expect(html).toContain('aria-expanded="false"'); expect(html).toContain('aria-haspopup="dialog"'); expect(html).not.toMatch(/tabindex="-1"/)
  })
  it('avatar is an animated SVG with an accessible name, not a raster image', () => {
    const svg = renderToStaticMarkup(<HadesAvatar speaking />)
    expect(svg).toContain('<svg'); expect(svg).toContain('role="img"'); expect(svg).toContain('aria-label="HADES"'); expect(svg).toContain('speaking'); expect(svg).not.toMatch(/<img/)
    const css = readFileSync(join(ROOT, 'packages/frontend/src/index.css'), 'utf8')
    expect(css).toMatch(/@keyframes hg-spin/); expect(css).toMatch(/prefers-reduced-motion: reduce\)[^{]*\{[^}]*hg-ring-a/)
  })
  it('greetings match the required wording in both languages', () => {
    expect(GREETING.en).toBe('Welcome to HADES OMEGA. I am HADES, your guide through the multi-agent command center. What would you like to explore?')
    expect(GREETING.es).toBe('Bienvenido a HADES OMEGA. Soy HADES, tu guía por el centro de comando multiagente. ¿Qué te gustaría conocer?')
  })
  it('is mounted inside the app shell (regression) and DEMO isolation helpers are untouched', () => {
    expect(readFileSync(join(ROOT, 'packages/frontend/src/AppShell.tsx'), 'utf8')).toMatch(/<HadesGuide \/>/)
    for (const f of ['packages/api/src/demo.ts', 'packages/api/src/auth.ts', 'packages/api/src/durable.ts']) expect(existsSync(join(ROOT, f))).toBe(true)
  })
})
