import type { FastifyInstance } from 'fastify'
import { hades, charon, persephone, minos, elysium, tartarus } from '../runtime.js'


const agentMap = {
  HADES:      hades,
  CHARON:     charon,
  PERSEPHONE: persephone,
  MINOS:      minos,
  ELYSIUM:    elysium,
  TARTARUS:   tartarus,
} as const

export async function agentRoutes(app: FastifyInstance): Promise<void> {
  app.get('/agents', async () => {
    const agents = Object.entries(agentMap).map(([name, agent]) => ({
      name,
      id:          agent.id,
      status:      agent.getStatus(),
      currentTask: agent.getCurrentTask(),
    }))
    return ok(agents)
  })

  app.get('/agents/:name', async (req, reply) => {
    const { name } = req.params as { name: string }
    const agent = agentMap[name.toUpperCase() as keyof typeof agentMap]
    if (!agent) return reply.code(404).send(err('AGENT_NOT_FOUND', `Agente ${name} no encontrado`))
    return ok({
      name:        agent.name,
      id:          agent.id,
      status:      agent.getStatus(),
      currentTask: agent.getCurrentTask(),
    })
  })
}

function ok<T>(data: T) {
  return { success: true, data, error: null, meta: { requestId: genId(), timestamp: Date.now(), version: '0.3.0' } }
}

function err(code: string, message: string) {
  return { success: false, data: null, error: { code, message }, meta: { requestId: genId(), timestamp: Date.now(), version: '0.3.0' } }
}

function genId(): string { return Math.random().toString(36).slice(2) }

