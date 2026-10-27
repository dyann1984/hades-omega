import type { FastifyInstance } from 'fastify'
import type { JsonRepository } from '../persistence.js'
import { requireRole } from '../security.js'

export async function approvalRoutes(app: FastifyInstance, repository: JsonRepository): Promise<void> {
  app.get('/approvals', async () => ({ success: true, data: repository.listApprovals() }))
  app.post('/approvals/:escalationId/decision', async (req, reply) => {
    requireRole(req, ['ADMIN'])
    const body = req.body as { status?: string; justification?: string }
    if (!['APPROVED', 'REJECTED'].includes(body?.status ?? '') || typeof body.justification !== 'string' || body.justification.trim().length < 3) {
      return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'status y justificación (mínimo 3 caracteres) son requeridos' } })
    }
    try {
      const actor = (req.user as { sub?: string }).sub ?? 'unknown'
      const data = await repository.decideApproval({ escalationId: (req.params as { escalationId: string }).escalationId, status: body.status as 'APPROVED' | 'REJECTED', justification: body.justification.trim(), decidedBy: actor })
      return { success: true, data, warning: 'La decisión registrada no autoriza ni ejecuta la operación.' }
    } catch (error) {
      if ((error as Error).message === 'ESCALATION_NOT_FOUND') return reply.code(404).send({ success: false, error: { code: 'ESCALATION_NOT_FOUND' } })
      if ((error as Error).message === 'APPROVAL_ALREADY_RESOLVED') return reply.code(409).send({ success: false, error: { code: 'APPROVAL_ALREADY_RESOLVED' } })
      throw error
    }
  })
}
