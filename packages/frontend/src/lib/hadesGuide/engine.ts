import { KNOWLEDGE, SUGGESTIONS, AGENTS_LIST, type KnowledgeEntry, type Lang } from './knowledge.js'

/**
 * Documented-answer engine: normalized keyword search over the curated knowledge base. No network, no model, no user data.
 * `GuideProvider` is the seam for a future generative provider; the UI only talks to this interface.
 */
export type AnswerKind = 'documented' | 'not_implemented' | 'unknown' | 'refusal'
export interface GuideAnswer { kind: AnswerKind; text: string; sources: string[]; suggestions: string[]; entryId?: string }
export interface GuideProvider { readonly name: string; readonly generative: boolean; answer(question: string, lang: Lang): Promise<GuideAnswer> | GuideAnswer }

export const normalize = (s: string): string => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9\s.-]/g, ' ').replace(/\s+/g, ' ').trim()

/** Requests the guide must never act on or answer: actions, credentials, other users' data. */
const ACTION_VERBS = '(aprueba|aprobar|rechaza|rechazar|ejecuta|ejecutar|borra|borrar|elimina|eliminar|delete|execute|run|approve|reject|cancela|cancelar|cancel|crea|crear|create|transfiere|envia|send|compra|comprar|buy|reasigna|reassign|cambia|change|reinicia|restart|despliega|deploy)'
const REFUSAL_ACTIONS = new RegExp('^(por favor |please |ahora |now |puedes |can you |could you )?' + ACTION_VERBS + '\\b|\\b(por mi|for me)\\b')
const REFUSAL_SECRETS = /\b(contrasena|password|clave|token|secret|credencial|credential|api key|jwt|cadena de conexion|connection string|base de datos|database url|admin account|cuenta admin|hash de|datos de otros|other users|otro usuario|another user|sesiones de|ver usuarios|list users)\b/

const T = {
  refuseAction: { es: 'No puedo ejecutar acciones: solo explico la plataforma. Aprobar, rechazar, ejecutar o crear misiones lo hace una persona autorizada desde la interfaz (por ejemplo en Judgment o Command). Si quieres, te explico cómo hacerlo paso a paso.', en: 'I cannot perform actions: I only explain the platform. Approving, rejecting, running or creating missions is done by an authorized person from the interface (for example in Judgment or Command). If you like, I can walk you through it step by step.' },
  refuseSecrets: { es: 'No tengo acceso a credenciales, usuarios, sesiones ni datos de otras personas, y no puedo revelarlos. Puedo explicarte cómo está protegida la plataforma: sesiones DEMO aisladas, contraseñas con hash y auditoría encadenada.', en: 'I have no access to credentials, users, sessions or other people\'s data, and I cannot reveal them. I can explain how the platform is protected: isolated DEMO sessions, hashed passwords and a chained audit trail.' },
  unknown: { es: 'No encuentro eso en la documentación del proyecto, así que prefiero no inventarlo. Puedo ayudarte con: las 14 secciones, los siete agentes, cómo crear una misión, CERBERUS y el Approval Gate, el holograma y el estado de NEAR.', en: 'I cannot find that in the project documentation, so I would rather not make it up. I can help with: the 14 sections, the seven agents, how to create a mission, CERBERUS and the Approval Gate, the hologram and the NEAR status.' },
  notImpl: { es: 'Nota: esta función no está implementada todavía.', en: 'Note: this capability is not implemented yet.' },
} as const

const STOP = new Set(['de', 'la', 'el', 'los', 'las', 'un', 'una', 'que', 'es', 'y', 'o', 'en', 'para', 'por', 'como', 'the', 'a', 'an', 'is', 'of', 'to', 'and', 'in', 'what', 'how', 'do', 'i', 'me', 'my', 'mi', 'se', 'qué', 'cual', 'which'])

/** Generic phrases that appear in almost any question; they can support a match but never create one. */
const WEAK = new Set(['que es', 'what is', 'para que sirve', 'purpose', 'resumen', 'overview', 'acerca', 'about', 'proposito', 'plataforma', 'platform'])

function score(entry: KnowledgeEntry, q: string, tokens: string[]): number {
  let s = 0, strong = 0
  for (const kw of entry.keywords) {
    const k = normalize(kw)
    if (!k) continue
    if (k.includes(' ') || k.length <= 3) { if ((` ${q} `).includes(` ${k} `)) { if (WEAK.has(k)) s += 1; else { s += 3 + k.split(' ').length; strong++ } } } // phrases / short words: whole-word only
    else if (tokens.includes(k)) { s += WEAK.has(k) ? 1 : 3; if (!WEAK.has(k)) strong++ }
    else if (k.length >= 5 && tokens.some(t => t.length >= 5 && (t.startsWith(k) || k.startsWith(t)))) { s += 1.5; strong++ }
  }
  for (const t of normalize(`${entry.title.es} ${entry.title.en}`).split(' ')) if (t.length > 3 && tokens.includes(t)) { s += 2; strong++ }
  return strong === 0 ? 0 : s   // a match made only of generic words ("what is…") is not a match
}

export function suggestionsFor(lang: Lang, entryId?: string): string[] {
  const all = SUGGESTIONS[lang]
  if (!entryId) return all.map(s => s.q)
  const entry = KNOWLEDGE.find(e => e.id === entryId)
  const next = (entry?.next ?? []).map(id => all.find(s => s.id === id)?.q ?? KNOWLEDGE.find(e => e.id === id)?.title[lang]).filter((x): x is string => !!x)
  return [...next, ...all.map(s => s.q).filter(q => !next.includes(q))].slice(0, 4)
}

export function answerQuestion(question: string, lang: Lang): GuideAnswer {
  const q = normalize(question.slice(0, 300))
  const tokens = q.split(' ').filter(t => t && !STOP.has(t))
  if (!q) return { kind: 'unknown', text: T.unknown[lang], sources: [], suggestions: suggestionsFor(lang) }
  if (REFUSAL_SECRETS.test(q) && !/\b(como se protege|how is it protected|seguridad|security)\b/.test(q)) return { kind: 'refusal', text: T.refuseSecrets[lang], sources: [], suggestions: suggestionsFor(lang, 'demo') }
  if (REFUSAL_ACTIONS.test(q) && !/^(como|how|explica|explain)\b/.test(q)) return { kind: 'refusal', text: T.refuseAction[lang], sources: [], suggestions: suggestionsFor(lang, 'approval') }

  let best: { e: KnowledgeEntry; s: number } | undefined
  for (const e of KNOWLEDGE) { const s = score(e, q, tokens); if (s > 0 && (!best || s > best.s)) best = { e, s } }
  // Agent names are the strongest signal: "charon" must reach CHARON even if other words match elsewhere.
  const agent = AGENTS_LIST.find(a => a !== 'HADES' && tokens.includes(a.toLowerCase()))
  if (agent) { const e = KNOWLEDGE.find(x => x.id === agent.toLowerCase() && x.id !== 'cerberus') ?? KNOWLEDGE.find(x => x.id === 'cerberus'); if (e && (!best || best.e.id !== 'approval' || !/approval|aprobacion/.test(q))) best = { e, s: 99 } }
  if (!best || best.s < 2) return { kind: 'unknown', text: T.unknown[lang], sources: [], suggestions: suggestionsFor(lang) }
  const e = best.e
  const text = e.implemented ? e.answer[lang] : `${e.answer[lang]}${e.id === 'not-impl' ? '' : ` ${T.notImpl[lang]}`}`.trim()
  return { kind: e.implemented ? 'documented' : 'not_implemented', text, sources: e.sources, suggestions: suggestionsFor(lang, e.id), entryId: e.id }
}

/** The shipped provider: documented answers only. A generative provider can be added later behind the same interface. */
export const documentedProvider: GuideProvider = { name: 'documented-knowledge-base', generative: false, answer: (q, lang) => answerQuestion(q, lang) }
