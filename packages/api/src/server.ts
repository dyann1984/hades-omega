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
import { authRoutes } from './auth.js'
import { setupRoutes, generateSetupToken } from './setup.js'
import { documentRoutes } from './routes/documents.js'

const PORT = Number(process.env['PORT'] ?? 3001)
const HOST = process.env['HOST'] ?? '0.0.0.0'

const app = Fastify({ logger: { level: 'info' } })

async function bootstrap(): Promise<void> {
  const allowedOrigin = process.env['ALLOWED_ORIGIN']
  if (!allowedOrigin) throw new Error('ALLOWED_ORIGIN must be configured; wildcard CORS is not allowed')
  await app.register(cors, {
    origin: allowedOrigin.split(',').map(s => s.trim()),
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  })

  await app.register(websocketPlugin)
  const legacyPath = process.env['HADES_DATA_FILE'] ?? './data/hades.json'
  const repository = new SqliteRepository(process.env['HADES_DB_FILE'] ?? `${legacyPath}.sqlite`, legacyPath)
  await repository.init()
  app.addHook('onClose', async () => { repository.close() })
  await registerSecurity(app, repository)
  await authRoutes(app, repository)
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

  // API routes
  await app.register(async (api) => {
    await missionRoutes(api, repository)
    await agentRoutes(api)
    await api.register(cerberusRoutes)
    await approvalRoutes(api, repository)
    await localMissionRoutes(api, repository)
    await documentRoutes(api, repository)
  }, { prefix: '/api/v1' })

  // WebSocket
  setupWebSocket(app, repository, sid => repository.getActiveSession(sid))

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
