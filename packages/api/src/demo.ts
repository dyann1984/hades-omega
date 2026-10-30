import type { FastifyInstance, FastifyRequest } from 'fastify'
import { randomUUID, createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CerberusGUARD } from '@hades/core'
import { SqliteRepository } from './sqlite.js'
import { sendToSession, closeSessionSockets } from './websocket.js'

/**
 * DEMO mode: strictly separated from production.
 *  - Sessions live in memory only (never in the production SQLite) and carry the role DEMO.
 *  - Each session runs on its OWN in-memory SQLite repository with its own CERBERUS guard instance,
 *    so no production data, user, policy or document can be read or modified.
 *  - Only /api/v1/demo/* (and auth/logout) is reachable with a DEMO session (enforced in security.ts).
 */
export const DEMO_TTL_MS = 30 * 60 * 1000
export const DEMO_MAX_SESSIONS = 40
export const DEMO_MAX_RUNS = 5

type Lang = 'es' | 'en'
interface DemoSession { sid: string; sub: string; expiresAt: number; repo?: SqliteRepository; runs: number; lang: Lang; escalationIds?: Set<string> }
const sessions = new Map<string, DemoSession>()

export function isDemoSession(sid: unknown): boolean { return typeof sid === 'string' && sessions.has(sid) }
export function resolveDemoSession(sid: string): { sub: string; roles: string[] } | undefined {
  const s = sessions.get(sid)
  if (!s) return undefined
  if (s.expiresAt <= Date.now()) { revokeDemoSession(sid); return undefined }
  return { sub: s.sub, roles: ['DEMO'] }
}
export function revokeDemoSession(sid: string): void {
  const s = sessions.get(sid)
  sessions.delete(sid)
  try { s?.repo?.close() } catch { /* already closed */ }
  closeSessionSockets(sid)
}
export function activeDemoSessions(): number { return sessions.size }
export function purgeExpiredDemoSessions(now = Date.now()): number {
  let n = 0
  for (const [sid, s] of sessions) if (s.expiresAt <= now) { revokeDemoSession(sid); n++ }
  return n
}
export function resetDemoSessions(): void { for (const sid of [...sessions.keys()]) revokeDemoSession(sid) }
/** Test helper: forces a session to expire. */
export function expireDemoSessionForTest(sid: string): void { const s = sessions.get(sid); if (s) s.expiresAt = Date.now() - 1 }

const DOCS: Record<Lang, Array<{ filename: string; content: string }>> = {
  es: [
    { filename: 'propuesta-aurora.txt', content: 'Proveedor Aurora (ficticio). Precio $118,000 MXN, SLA 99.5%, entrega 15 días.' },
    { filename: 'propuesta-boreal.txt', content: 'Proveedor Boreal (ficticio). Precio $97,500 MXN, penalización 4%, entrega 25 días.' },
    { filename: 'propuesta-cobalto.txt', content: 'Proveedor Cobalto (ficticio). Precio $131,000 MXN, sin garantía, entrega 10 días.' },
  ],
  en: [
    { filename: 'proposal-aurora.txt', content: 'Vendor Aurora (fictional). Price $118,000 MXN, SLA 99.5%, delivery 15 days.' },
    { filename: 'proposal-boreal.txt', content: 'Vendor Boreal (fictional). Price $97,500 MXN, penalty 4%, delivery 25 days.' },
    { filename: 'proposal-cobalto.txt', content: 'Vendor Cobalto (fictional). Price $131,000 MXN, no warranty, delivery 10 days.' },
  ],
}

type Label = 'REAL' | 'DETERMINISTA' | 'SIMULADA' | 'NO_DISPONIBLE'
const CAPABILITIES: Array<{ id: string; label: Label; es: string; en: string }> = [
  { id: 'cerberus', label: 'REAL', es: 'CERBERUS evalúa las reglas de política reales sobre datos de demostración.', en: 'CERBERUS evaluates the real policy rules over demo data.' },
  { id: 'documents', label: 'DETERMINISTA', es: 'Análisis documental por reglas (importes, porcentajes, cláusulas); mismo resultado siempre.', en: 'Rule-based document analysis (amounts, percentages, clauses); same result every time.' },
  { id: 'approval', label: 'REAL', es: 'Approval Gate: la misión se detiene hasta que un humano aprueba o rechaza.', en: 'Approval Gate: the mission halts until a human approves or rejects.' },
  { id: 'audit', label: 'REAL', es: 'Auditoría encadenada por hash, aislada en la sesión demo.', en: 'Hash-chained audit trail, isolated in the demo session.' },
  { id: 'sha256', label: 'REAL', es: 'El sello SHA-256 del informe se calcula de verdad y puede verificarse.', en: 'The report SHA-256 seal is genuinely computed and verifiable.' },
  { id: 'llm', label: 'NO_DISPONIBLE', es: 'Planificación con LLM (Claude) no está activa en la demo.', en: 'LLM planning (Claude) is not enabled in the demo.' },
  { id: 'near', label: 'SIMULADA', es: 'NEAR funciona en modo simulación: no se firma ni envía ninguna transacción.', en: 'NEAR runs in simulation mode: no transaction is signed or sent.' },
  { id: 'purchases', label: 'SIMULADA', es: 'Las compras son escenarios ilustrativos; no hay operaciones financieras.', en: 'Purchases are illustrative scenarios; there are no financial operations.' },
]
const AGENTS = [
  { name: 'HADES', es: 'Orquestador central', en: 'Central orchestrator' },
  { name: 'CHARON', es: 'Compras y proveedores', en: 'Procurement & vendors' },
  { name: 'PERSEPHONE', es: 'Finanzas y presupuesto', en: 'Finance & budget' },
  { name: 'MINOS', es: 'Validación y políticas', en: 'Validation & policy' },
  { name: 'ELYSIUM', es: 'Planificación táctica', en: 'Tactical planning' },
  { name: 'TARTARUS', es: 'Seguridad y anomalías', en: 'Security & anomalies' },
  { name: 'CERBERUS', es: 'Guardián de políticas y auditoría', en: 'Policy guardian & audit' },
]

function langOf(request: FastifyRequest): Lang {
  const q = (request.query as { lang?: unknown } | undefined)?.lang
  return q === 'en' ? 'en' : 'es'
}
function currentSession(request: FastifyRequest): DemoSession {
  const claims = request.user as { sid?: string; roles?: string[] } | undefined
  const s = claims?.sid ? sessions.get(claims.sid) : undefined
  if (!s || !claims?.roles?.includes('DEMO') || s.expiresAt <= Date.now()) throw Object.assign(new Error('DEMO_FORBIDDEN'), { statusCode: 403 })
  return s
}
async function repoFor(s: DemoSession): Promise<SqliteRepository> {
  if (s.repo) return s.repo
  const repo = new SqliteRepository(':memory:', join(tmpdir(), `hades-demo-none-${s.sid}.json`), new CerberusGUARD())
  await repo.init()
  repo.eventSink = event => sendToSession(s.sid, { ...event, demo: true } as never)
  s.repo = repo
  return repo
}
function reportOf(mission: { tasks: Array<{ result?: { data?: unknown } }> }): { markdown?: string; sha256?: string } {
  const report = mission.tasks[3]?.result?.data as { reportMarkdown?: string } | undefined
  const seal = mission.tasks[4]?.result?.data as { sha256?: string } | undefined
  return { markdown: report?.reportMarkdown, sha256: seal?.sha256 }
}

export async function demoRoutes(app: FastifyInstance): Promise<void> {
  const timer = setInterval(() => purgeExpiredDemoSessions(), 60_000)
  timer.unref()
  app.addHook('onClose', async () => { clearInterval(timer); resetDemoSessions() })

  // Public: creates a temporary, signed, isolated DEMO session. No credentials are requested.
  app.post('/api/v1/demo/session', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
    purgeExpiredDemoSessions()
    if (sessions.size >= DEMO_MAX_SESSIONS) return reply.code(503).send({ success: false, error: { code: 'DEMO_CAPACITY' } })
    const body = request.body as { lang?: unknown } | undefined
    const sid = `demo-${randomUUID()}`, sub = `demo:${randomUUID()}`
    const expiresAt = Date.now() + DEMO_TTL_MS
    sessions.set(sid, { sid, sub, expiresAt, runs: 0, lang: body?.lang === 'en' ? 'en' : 'es' })
    const token = app.jwt.sign({ sub, roles: ['DEMO'], sid, demo: true, exp: Math.floor(expiresAt / 1000) })
    reply.header('Cache-Control', 'no-store')
    return { success: true, data: { token, expiresAt, role: 'DEMO', demo: true } }
  })

  await app.register(async demo => {
    demo.addHook('preHandler', async request => { currentSession(request) })

    demo.get('/info', async request => {
      const s = currentSession(request), lang = langOf(request)
      return { success: true, data: {
        mode: 'DEMO', expiresAt: s.expiresAt, runsUsed: s.runs, runsMax: DEMO_MAX_RUNS,
        capabilities: CAPABILITIES.map(c => ({ id: c.id, label: c.label, description: c[lang] })),
        agents: AGENTS.map(a => ({ name: a.name, description: a[lang] })),
      } }
    })
    demo.get('/agents', async request => {
      const lang = langOf(request)
      return { success: true, data: AGENTS.map(a => ({ name: a.name, id: `demo-${a.name.toLowerCase()}`, status: 'IDLE', currentTask: null, capabilities: [], description: a[lang], demo: true })) }
    })
    demo.get('/missions', async request => {
      const s = currentSession(request)
      return { success: true, data: s.repo ? s.repo.listMissions() : [] }
    })
    demo.get('/missions/:id/report', async (request, reply) => {
      const s = currentSession(request)
      const mission = s.repo?.getMission((request.params as { id: string }).id)
      if (!mission) return reply.code(404).send({ success: false, error: { code: 'MISSION_NOT_FOUND' } })
      const { markdown, sha256 } = reportOf(mission as never)
      if (!markdown || !sha256) return reply.code(409).send({ success: false, error: { code: 'REPORT_NOT_READY' } })
      const format = (request.query as { format?: string }).format
      if (format === 'md') {
        reply.header('Content-Type', 'text/markdown; charset=utf-8').header('Content-Disposition', `attachment; filename="hades-demo-report-${mission.id}.md"`)
        return `${markdown}\n\n---\nSHA-256: ${sha256}\nModo DEMO / DEMO mode — datos ficticios / fictional data\n`
      }
      return { success: true, data: { missionId: mission.id, markdown, sha256, verifiable: createHash('sha256').update(markdown, 'utf8').digest('hex') === sha256, label: 'DETERMINISTA', demo: true } }
    })
    demo.get('/local-approvals', async request => {
      const s = currentSession(request)
      return { success: true, data: s.repo ? s.repo.listPendingLocalOperations() : [] }
    })
    demo.post('/local-approvals/:id/decision', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
      const s = currentSession(request)
      const body = request.body as { status?: unknown; justification?: unknown } | undefined
      if (!s.repo) return reply.code(404).send({ success: false, error: { code: 'APPROVAL_NOT_FOUND' } })
      if ((body?.status !== 'APPROVED' && body?.status !== 'REJECTED') || typeof body.justification !== 'string' || body.justification.trim().length < 3 || body.justification.length > 500)
        return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR' } })
      const id = (request.params as { id: string }).id
      if (!s.repo.listPendingLocalOperations().some(op => op.id === id)) return reply.code(404).send({ success: false, error: { code: 'APPROVAL_NOT_FOUND' } })
      try { return { success: true, data: await s.repo.decideLocalOperation(id, body.status, s.sub, body.justification.trim()) } }
      catch { return reply.code(409).send({ success: false, error: { code: 'APPROVAL_ALREADY_RESOLVED' } }) }
    })
    demo.get('/audit/events', async request => {
      const s = currentSession(request)
      return { success: true, data: s.repo ? s.repo.listAuditEvents({ limit: 100, offset: 0 }) : [] }
    })

    // Illustrative sample data for the sections of the platform. Decisions come from a real,
    // session-local CERBERUS guard evaluating FICTIONAL proposals; missions are labelled as examples.
    demo.get('/seed', async request => {
      const s = currentSession(request), lang = langOf(request)
      const guard = new CerberusGUARD()
      const now = Date.now()
      const proposals: Array<{ agent: 'CHARON' | 'PERSEPHONE' | 'TARTARUS' | 'ELYSIUM' | 'MINOS'; op: string; payload: Record<string, unknown>; ctx: Record<string, unknown> }> = [
        { agent: 'CHARON', op: 'PURCHASE_ORDER', payload: { totalAmount: 20000, currency: 'MXN', vendorId: 'inframax' }, ctx: { budgetLimit: 50000, vendorAllowlist: ['inframax'] } },
        { agent: 'CHARON', op: 'PURCHASE_ORDER', payload: { totalAmount: 78500, currency: 'MXN', vendorId: 'cloudpro-premium' }, ctx: { budgetLimit: 50000, vendorAllowlist: ['cloudpro-premium'] } },
        { agent: 'CHARON', op: 'PURCHASE_ORDER', payload: { totalAmount: 42000, currency: 'MXN', vendorId: 'cloudpro-standard' }, ctx: { budgetLimit: 50000, vendorAllowlist: ['cloudpro-standard'] } },
        { agent: 'TARTARUS', op: 'ANOMALY_REPORT', payload: { severity: 'LOW' }, ctx: {} },
        { agent: 'ELYSIUM', op: 'CRYPTO_HASH', payload: { algorithm: 'sha256' }, ctx: {} },
      ]
      const auditRecords: unknown[] = [], escalations: unknown[] = []
      s.escalationIds = new Set()
      proposals.forEach((p, i) => {
        const decision = guard.evaluate({ id: randomUUID(), agentId: `agent:${p.agent.toLowerCase()}:001`, agentName: p.agent, operationType: p.op, payload: p.payload, missionId: `demo-m${(i % 3) + 1}`, taskId: randomUUID(), requestedAt: now } as never, p.ctx as never)
        auditRecords.push({ id: decision.auditId, timestamp: now - (i + 1) * 90_000, agentName: p.agent, operationType: p.op, guardDecision: decision.outcome, ruleMatched: decision.ruleMatched, reason: decision.reason, nearTxHash: null, nearExplorerUrl: null, executionMode: 'simulation', payload: p.payload })
        if (decision.outcome === 'ESCALATE') {
          s.escalationIds!.add(decision.auditId)
          escalations.push({ id: decision.auditId, fromAgent: p.agent, operationType: p.op, reason: decision.reason ?? 'Requires human review', priority: 'MEDIUM', createdAt: now - (i + 1) * 90_000, status: 'PENDING', context: { demo: true } })
        }
      })
      const tag = lang === 'en' ? '[DEMO] ' : '[DEMO] '
      const mk = (n: number, es: string, en: string, status: string, progress: number, tasks: Array<[string, string, string]>) => ({
        id: `demo-m${n}`, title: tag + (lang === 'en' ? en : es), description: lang === 'en' ? 'Illustrative example mission (fictional data).' : 'Misión de ejemplo ilustrativa (datos ficticios).',
        status, progress, createdAt: now - n * 3_600_000,
        tasks: tasks.map(([agent, title, st], i) => ({ id: `demo-m${n}-t${i + 1}`, title, assignedTo: agent, status: st, result: { success: st === 'EXECUTED' || st === 'COMPLETED', summary: lang === 'en' ? 'Example result' : 'Resultado de ejemplo' } })),
      })
      const missions = [
        mk(1, 'Comparar propuestas de proveedores', 'Compare vendor proposals', 'COMPLETED', 100, [['CHARON', 'Extraer documentos', 'EXECUTED'], ['MINOS', 'Validar documentos', 'EXECUTED'], ['PERSEPHONE', 'Comparar importes', 'EXECUTED']]),
        mk(2, 'Revisión de presupuesto trimestral', 'Quarterly budget review', 'IN_PROGRESS', 50, [['PERSEPHONE', 'Consolidar gastos', 'EXECUTED'], ['MINOS', 'Verificar políticas', 'IN_PROGRESS']]),
        mk(3, 'Orden de compra sobre el límite', 'Over-limit purchase order', 'FAILED', 100, [['CHARON', 'Preparar orden', 'EXECUTED'], ['ELYSIUM', 'Ejecutar orden', 'FAILED']]),
      ]
      return { success: true, data: { label: 'REAL', note: lang === 'en' ? 'Decisions are produced by the real CERBERUS policy on fictional operations; missions are illustrative examples.' : 'Las decisiones las produce la política real de CERBERUS sobre operaciones ficticias; las misiones son ejemplos ilustrativos.', auditRecords, escalations, missions, nearTxs: [] } }
    })
    demo.post('/approvals/:id/decision', async (request, reply) => {
      const s = currentSession(request)
      const id = (request.params as { id: string }).id
      const body = request.body as { status?: unknown; justification?: unknown } | undefined
      if (!s.escalationIds?.has(id)) return reply.code(404).send({ success: false, error: { code: 'APPROVAL_NOT_FOUND' } })
      if ((body?.status !== 'APPROVED' && body?.status !== 'REJECTED') || typeof body.justification !== 'string' || body.justification.trim().length < 3) return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR' } })
      s.escalationIds.delete(id)
      return { success: true, data: { id, status: body.status, demo: true, label: 'SIMULADA', note: 'Decisión demostrativa: no ejecuta ninguna operación real.' } }
    })
    demo.get('/documents/results', async () => ({ success: true, data: [] }))
    demo.get('/cerberus/policy', async request => {
      currentSession(request)
      const policy = new CerberusGUARD().getPolicy()
      return { success: true, data: { label: 'REAL', readOnly: true, version: policy.version, rules: (policy.rules ?? []).map(r => ({ id: r.id, name: r.name, operationType: r.operationType, outcome: r.outcome, priority: r.priority })) } }
    })
    demo.get('/near/status', async () => ({ success: true, data: { mode: 'simulation', label: 'SIMULADA', transactionsSigned: 0, note: 'No se firma ni envía ninguna transacción. / No transaction is signed or sent.' } }))

    // Reproducible demonstration scenario on the session's isolated engine.
    demo.post('/scenario/run', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (request, reply) => {
      const s = currentSession(request)
      if (s.runs >= DEMO_MAX_RUNS) return reply.code(429).send({ success: false, error: { code: 'DEMO_RUN_LIMIT' } })
      s.runs += 1
      const lang: Lang = (request.body as { lang?: unknown } | undefined)?.lang === 'en' ? 'en' : s.lang
      const repo = await repoFor(s)
      const title = lang === 'en' ? 'Demo: vendor proposal comparison' : 'Demo: comparación de propuestas de proveedores'
      const { mission, approvalId } = await repo.createMultiDocumentMission(s.sub, title, DOCS[lang], 150000)
      return { success: true, data: { mission, approvalId, label: 'DETERMINISTA', demo: true } }
    })
    demo.post('/reset', async request => {
      const s = currentSession(request)
      try { s.repo?.close() } catch { /* ignore */ }
      s.repo = undefined
      return { success: true }
    })

    // Anything else under /demo is explicitly unavailable.
    demo.all('/*', async (_request, reply) => reply.code(403).send({ success: false, error: { code: 'NOT_AVAILABLE_IN_DEMO', label: 'NO_DISPONIBLE' } }))
  }, { prefix: '/api/v1/demo' })
}
