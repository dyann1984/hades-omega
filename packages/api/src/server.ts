import Fastify from 'fastify'
import cors from '@fastify/cors'
import websocketPlugin from '@fastify/websocket'
import { missionRoutes } from './routes/missions.js'
import { agentRoutes }   from './routes/agents.js'
import { cerberusRoutes }  from './routes/cerberus.js'
import { setupWebSocket, getConnectedClientsCount } from './websocket.js'
import { bus } from '@hades/core'

const PORT = Number(process.env['PORT'] ?? 3001)
const HOST = process.env['HOST'] ?? '0.0.0.0'

const app = Fastify({ logger: { level: 'info' } })

async function bootstrap(): Promise<void> {
  await app.register(cors, {
    origin:  process.env['NODE_ENV'] === 'production' ? false : true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  })

  await app.register(websocketPlugin)

  // Health check
  app.get('/health', async () => ({
    status:    'ok',
    version:   '0.3.0',
    timestamp: Date.now(),
    ws:        { clients: getConnectedClientsCount() },
  }))

  // API routes
  await app.register(async (api) => {
    await missionRoutes(api)
    await agentRoutes(api)
    await cerberusRoutes(api)
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
