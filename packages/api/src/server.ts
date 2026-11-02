import Fastify from 'fastify'
import cors from '@fastify/cors'
import websocketPlugin from '@fastify/websocket'
import { missionRoutes } from './routes/missions.js'
import { agentRoutes }   from './routes/agents.js'
import { cerberusRoutes }  from './routes/cerberus.js'
import { setupWebSocket, getConnectedClientsCount } from './websocket.js'
import { bus } from '@hades/core'
import { SqliteRepository } from './sqlite.js'
import { registerSecurity } from './security.js'
import { approvalRoutes } from './routes/approvals.js'
import { localMissionRoutes } from './routes/local-missions.js'
import { demoRoutes, resolveDemoSession } from './demo.js'
import { authRoutes } from './auth.js'
import { setupRoutes, generateSetupToken } from './setup.js'
import { documentRoutes } from './routes/documents.js'
import { chronosRoutes, registerChronosTick } from './routes/chronos.js'
import { near } from './runtime.js'
import { nearTxRoutes } from './routes/near-tx.js'
import { JsonRpcNearRpc } from './near/rpc.js'
import { loadSignerFromEnv } from './near/signer.js'
import { nearServiceConfigFromEnv } from './near/submission.js'
import { createDurableFromEnv, registerDurableGuard } from './durable.js'

const PORT = Number(process.env['PORT'] ?? 3001)
const HOST = process.env['HOST'] ?? '0.0.0.0'

// Behind Render's proxy every client shares the proxy IP unless trustProxy is set, which would collapse all per-IP
// rate limits into one global bucket. Trust only the configured number of hops (default 1 in production) so
// X-Forwarded-For cannot be spoofed beyond the platform proxy.
const proxyHops = Number(process.env['HADES_TRUST_PROXY_HOPS'] ?? (process.env['NODE_ENV'] === 'production' ? 1 : 0))
const app = Fastify({ logger: { level: 'info' }, trustProxy: Number.isInteger(proxyHops) && proxyHops > 0 ? (_address: string, hop: number) => hop < proxyHops : false })

async function bootstrap(): Promise<void> {
  const allowedOrigin = process.env['ALLOWED_ORIGIN']
  if (!allowedOrigin) throw new Error('ALLOWED_ORIGIN must be configured; wildcard CORS is not allowed')
  await app.register(cors, {
    origin: allowedOrigin.split(',').map(s => s.trim()),
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  })

  await app.register(websocketPlugin)
  const legacyPath = process.env['HADES_DATA_FILE'] ?? './data/hades.json'
  const dbPath = process.env['HADES_DB_FILE'] ?? `${legacyPath}.sqlite`
  // Optional durable mirror (PostgreSQL) so the admin and data survive Render Free spin-downs. Off unless configured.
  const durable = await createDurableFromEnv(process.env, app.log)
  if (durable) app.log.info({ outcome: await durable.restoreIfMissing(dbPath) }, 'Durable storage boot')
  const repository = new SqliteRepository(dbPath, legacyPath)
  await repository.init()
  near.attachGate(repository.gate)
  durable?.start(repository)
  app.addHook('onClose', async () => { if (durable) await durable.stop(repository); repository.close() })
  for (const sig of ['SIGTERM', 'SIGINT'] as const) process.once(sig, () => { void app.close().finally(() => process.exit(0)) })
  await registerSecurity(app, repository)
  if (durable) registerDurableGuard(app, durable, repository)
  await authRoutes(app, repository, durable)
  await demoRoutes(app)
  const unsubscribeAudit = bus.subscribe(event => {
    if (event.type === 'CERBERUS_DECISION') {
      const record = event.payload.auditRecord
      repository.recordAuditEvent({actor:record.agentName,missionId:record.missionId,action:'POLICY_EVALUATED',result:record.guardDecision,correlationId:record.missionId ?? record.id})
    } else if (event.type === 'AGENT_STATUS_CHANGED' && ['EXECUTING','ERROR'].includes(event.payload.status)) {
      repository.recordAuditEvent({actor:event.payload.agent,missionId:event.payload.missionId,action:'AGENT_STATUS',result:event.payload.status})
    }
  })
  app.addHook('onClose', async () => { unsubscribeAudit() })
  app.addHook('onError', async (request, _reply, error) => {
    const actor = (request.user as {sub?:string} | undefined)?.sub ?? 'anonymous'
    repository.recordAuditEvent({actor,action:'REQUEST_ERROR',result:String(error.statusCode ?? 500),correlationId:request.id})
  })
  await setupRoutes(app, repository)

  const healthResponse = async () => ({
    status:    'ok',
    version:   '0.3.0',
    mode:      'fastify-dev',
    timestamp: Date.now(),
    ws:        { clients: getConnectedClientsCount() },
  })
  app.get('/health',     healthResponse)
  app.get('/api/health', healthResponse)

  // NEAR submission. Signing stays off unless NEAR_SIGNING_ENABLED=true AND a signer, a contract and execution mode are set.
  const nearService = repository.createNearSubmissionService({ bridge: near, rpc: new JsonRpcNearRpc(), signer: loadSignerFromEnv(), config: nearServiceConfigFromEnv() })
  if (nearService.blockers().length === 0) {
    void nearService.recoverAll().catch(e => app.log.error({ err: (e as Error).message }, 'NEAR recovery failed'))
    const timer = setInterval(() => { void nearService.recoverAll().catch(() => undefined) }, 60_000); timer.unref()
    app.addHook('onClose', async () => { clearInterval(timer) })
  }

  // API routes
  await app.register(async (api) => {
    await missionRoutes(api, repository)
    await agentRoutes(api)
    await api.register(async scoped => cerberusRoutes(scoped, repository))
    await approvalRoutes(api, repository)
    await localMissionRoutes(api, repository)
    await documentRoutes(api, repository)
    await chronosRoutes(api, repository)
    await api.register(async scoped => nearTxRoutes(scoped, repository, nearService))
  }, { prefix: '/api/v1' })

  // CHRONOS scheduler. A long-lived host runs it in-process; serverless/hibernating hosts should instead call the
  // tick endpoint from an external scheduler (it is only exposed when CHRONOS_TICK_SECRET is configured).
  if (process.env['CHRONOS_SCHEDULER'] !== 'off') repository.chronos.start(Number(process.env['CHRONOS_TICK_MS'] ?? 30_000))
  app.addHook('onClose', async () => { repository.chronos.stop() })
  registerChronosTick(app, repository, process.env['CHRONOS_TICK_SECRET'])

  // WebSocket
  setupWebSocket(app, repository, sid => repository.getActiveSession(sid) ?? resolveDemoSession(sid))

  // Heartbeat every 30s
  setInterval(() => {
    bus.publish({ type: 'SYSTEM_HEARTBEAT', payload: { ts: Date.now() } })
  }, 30_000)

  await app.listen({ port: PORT, host: HOST })
  const setupToken = generateSetupToken(repository)
  if (setupToken) {
    console.log(`\n⚠️  HADES OMEGA — FIRST RUN DETECTED`)
    console.log(`   No users found. Create the first admin account:`)
    console.log(`   POST /api/v1/setup/init`)
    console.log(`   Header: X-Setup-Token: ${setupToken}`)
    console.log(`   Body:   { "username": "<name>", "password": "<12+ chars>" }`)
    console.log(`   Token expires in 1 hour. This message will not repeat.\n`)
  }
  console.log(`\n🔱 HADES OMEGA API v0.3.0`)
  console.log(`   API:  http://localhost:${PORT}/api/v1`)
  console.log(`   WS:   ws://localhost:${PORT}/ws`)
  console.log(`   Mode: ${process.env['NEAR_EXECUTION_MODE'] ?? 'simulation'}\n`)
}

bootstrap().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
