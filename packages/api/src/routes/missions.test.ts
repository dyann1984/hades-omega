import Fastify from 'fastify'
import { describe, expect, it } from 'vitest'
import { missionRoutes } from './missions.js'

describe('mission routes', () => {
  it('rejects an incomplete mission request', async () => {
    const app = Fastify()
    await app.register(missionRoutes, { prefix: '/api/v1' })
    const response = await app.inject({ method: 'POST', url: '/api/v1/missions', payload: { title: 'Missing description' } })
    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('VALIDATION_ERROR')
    await app.close()
  })

  it('creates a demo supplier-evaluation mission with auditable output', async () => {
    const app = Fastify()
    await app.register(missionRoutes, { prefix: '/api/v1' })
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/missions',
      payload: { title: 'Evaluación de proveedores (DEMO)', description: 'Datos de demostración', budgetLimit: 50000 },
    })
    const body = response.json()
    expect(response.statusCode).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.tasks.length).toBeGreaterThan(0)
    expect(Array.isArray(body.auditRecords)).toBe(true)
    await app.close()
  }, 15_000)
})
