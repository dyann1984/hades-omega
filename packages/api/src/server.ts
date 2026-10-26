import Fastify from 'fastify'
import cors from '@fastify/cors'
import websocketPlugin from '@fastify/websocket'
import { missionRoutes } from './routes/missions.js'
import { agentRoutes }   from './routes/agents.js'
import { cerberusRoutes }  from './routes/cerberus.js'
import { setupWebSocket, getConnectedClientsCount } from './websocket.js'
import { bus } from '@hades/core'
import { JsonRepository } from './persistence.js'
import { registerSecurity } from './security.js'
import { approvalRoutes } from './routes/approvals.js'

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
  await registerSecurity(app)
  const repository = new JsonRepository(process.env['HADES_DATA_FILE'] ?? './data/hades.json')
  await repository.init()

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
    await cerberusRoutes(api)
    await approvalRoutes(api, repository)
  }, { prefix: '/api/v1' })

  // WebSocket
  setupWebSocket(app)

  // Heartbeat every 30s
  setInterval(() => {
    bus.publish({ type: 'SYSTEM_HEARTBEAT', payload: { ts: Date.now() } })
  }, 30_000)

  await app.listen({ port: PORT, host: HOST })
  console.log(`\n🔱 HADES OMEGA API v0.3.0`)
  console.log(`   API:  http://localhost:${PORT}/api/v1`)
  console.log(`   WS:   ws://localhost:${PORT}/ws`)
  console.log(`   Mode: ${process.env['NEAR_EXECUTION_MODE'] ?? 'simulation'}\n`)
}

bootstrap().catch(err => {
  console.error('Fatal error:', err)
  process.exit(1)
})
