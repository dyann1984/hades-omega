import type { FastifyInstance } from 'fastify'
import { hades } from '../runtime.js'

export async function missionRoutes(app: FastifyInstance): Promise<void> {
  app.post('/missions', async (req, reply) => {
    const { title, description, budgetLimit } = req.body as any
    if (!title || !description) {
      return reply.code(400).send(err('VALIDATION_ERROR', 'title y description son requeridos'))
    }
    const mission = await hades.createMission(title, description, budgetLimit ?? 50000)
    return ok(mission)
  })

  app.get('/missions', async () => {
    return ok(hades.getAllMissions())
  })

  app.get('/missions/:id', async (req, reply) => {
    const { id } = req.params as any
    const mission = hades.getMission(id)
    if (!mission) return reply.code(404).send(err('MISSION_NOT_FOUND', `Misión ${id} no encontrada`))
    return ok(mission)
  })

  app.get('/missions/:id/tasks', async (req, reply) => {
    const { id } = req.params as any
    const mission = hades.getMission(id)
    if (!mission) return reply.code(404).send(err('MISSION_NOT_FOUND', `Misión ${id} no encontrada`))
    return ok(mission.tasks)
  })

  app.get('/missions/:id/report', async (req, reply) => {
    const { id } = req.params as any
    const mission = hades.getMission(id)
    if (!mission) return reply.code(404).send(err('MISSION_NOT_FOUND', `Misión ${id} no encontrada`))
    if (!mission.report) return reply.code(404).send(err('REPORT_NOT_READY', 'El informe aún no está disponible'))
    return ok(mission.report)
  })
}

function ok<T>(data: T) {
  return { success: true, data, error: null, meta: { requestId: genId(), timestamp: Date.now(), version: '0.3.0' } }
}

function err(code: string, message: string) {
  return { success: false, data: null, error: { code, message }, meta: { requestId: genId(), timestamp: Date.now(), version: '0.3.0' } }
}

function genId(): string { return Math.random().toString(36).slice(2) }
