import type { FastifyInstance } from 'fastify'
import type { SqliteRepository } from '../sqlite.js'
import { bus } from '@hades/core'
import type { Mission, AgentName } from '@hades/core'
import { requireRole } from '../security.js'

export async function localMissionRoutes(app: FastifyInstance, repository: SqliteRepository): Promise<void> {
  app.get('/local-missions/:id/execution-events', async (req, reply) => {
    const id = (req.params as {id:string}).id
    const mission = repository.getMission(id)
    const claims = req.user as {sub:string;roles:string[]}
    if (!mission || (!claims.roles.includes('ADMIN') && mission.ownerId !== claims.sub)) return reply.code(404).send({success:false,error:{code:'MISSION_NOT_FOUND'}})
    const query = req.query as {after?: string; limit?: string}
    const after = query.after === undefined ? 0 : Number(query.after)
    const limit = query.limit === undefined ? 200 : Number(query.limit)
    if (!Number.isSafeInteger(after) || after < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 200) return reply.code(400).send({success:false,error:{code:'INVALID_CURSOR'}})
    return {success:true,data:repository.listExecutionEvents(id, after, limit)}
  })
  app.get('/local-missions/:id/history', async (req, reply) => {
    const id = (req.params as {id:string}).id; const mission = repository.getMission(id); const claims = req.user as {sub:string;roles:string[]}
    if (!mission || (!claims.roles.includes('ADMIN') && mission.ownerId !== claims.sub)) return reply.code(404).send({success:false,error:{code:'MISSION_NOT_FOUND'}})
    return {success:true,data:repository.listMissionEvents(id)}
  })
  app.get('/local-approvals', async req => { requireRole(req,['ADMIN']); return {success:true,data:repository.listPendingLocalOperations()} })
  app.post('/local-missions', async (req, reply) => {
    requireRole(req,['ADMIN','OPERATOR'])
    const body = req.body as { title?: unknown; input?: unknown } | undefined
    if (typeof body?.title !== 'string' || body.title.trim().length < 3 || body.title.length > 200 || typeof body.input !== 'string' || Buffer.byteLength(body.input,'utf8') > 32768) return reply.code(400).send({success:false,error:{code:'VALIDATION_ERROR'}})
    const owner = (req.user as {sub:string}).sub
    const result = await repository.createLocalMission(owner,body.title.trim(),body.input)
    publishExecutionEvents(repository, result.mission.id, 0)
    publishMission(result.mission)
    return reply.code(201).send({success:true,data:result})
  })
  app.post('/local-missions/multi-document', async (req, reply) => {
    requireRole(req, ['ADMIN', 'OPERATOR'])
    const body = req.body as { title?: unknown; documents?: unknown; budgetLimit?: unknown } | undefined
    if (typeof body?.title !== 'string' || body.title.trim().length < 3 || body.title.length > 200 || !Array.isArray(body.documents) || body.documents.length < 2 || body.documents.length > 20) {
      return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Se requiere título y al menos dos documentos para comparación.' } })
    }
    const cleanDocs: Array<{ filename: string; content: string; mimeType?: string }> = []
    for (const d of body.documents) {
      if (typeof d?.filename !== 'string' || !d.filename.trim() || d.filename.length > 255 || typeof d?.content !== 'string' || Buffer.byteLength(d.content,'utf8') > 32768 || (d.mimeType !== undefined && typeof d.mimeType !== 'string')) {
        return reply.code(400).send({ success: false, error: { code: 'INVALID_DOCUMENT', message: 'Cada documento debe incluir filename y content' } })
      }
      cleanDocs.push({ filename: d.filename, content: d.content, mimeType: d.mimeType })
    }
    const owner = (req.user as { sub: string }).sub
    const budgetLimit = typeof body.budgetLimit === 'number' && body.budgetLimit > 0 ? body.budgetLimit : 150000
    const idempotencyKey = req.headers['idempotency-key']
    if (idempotencyKey !== undefined && (typeof idempotencyKey !== 'string' || idempotencyKey.length < 1 || idempotencyKey.length > 200)) return reply.code(400).send({success:false,error:{code:'INVALID_IDEMPOTENCY_KEY'}})
    let result: Awaited<ReturnType<SqliteRepository['createMultiDocumentMission']>>
    try { result = await repository.createMultiDocumentMission(owner, body.title.trim(), cleanDocs, budgetLimit, idempotencyKey) }
    catch (error) { if ((error as Error).message === 'IDEMPOTENCY_CONFLICT') return reply.code(409).send({success:false,error:{code:'IDEMPOTENCY_CONFLICT'}}); throw error }
    publishMission(result.mission)
    return reply.code(201).send({ success: true, data: result })
  })
  const handleReassign = async (req: any, reply: any) => {
    requireRole(req, ['ADMIN'])
    const { id: missionId, taskId } = req.params as { id: string; taskId: string }
    const body = req.body as { newAssignee?: unknown; justification?: unknown } | undefined
    if (typeof body?.newAssignee !== 'string' || typeof body?.justification !== 'string' || body.justification.trim().length < 3) {
      return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'newAssignee y justification son requeridos.' } })
    }
    const actor = (req.user as { sub: string }).sub
    try {
      const res = repository.reassignTask(missionId, taskId, body.newAssignee as AgentName, actor, body.justification.trim())
      bus.publish({ type: 'TASK_UPDATED', payload: { task: res.task } })
      return { success: true, data: res }
    } catch (err) {
      const msg = (err as Error).message
      if (msg.includes('BLOCKED_BY_DESIGN')) {
        return reply.code(409).send({ success: false, error: { code: 'REASSIGNMENT_BLOCKED_BY_DESIGN', message: msg } })
      }
      if (msg === 'MISSION_NOT_FOUND') return reply.code(404).send({ success: false, error: { code: 'MISSION_NOT_FOUND' } })
      if (msg === 'TASK_NOT_FOUND') return reply.code(404).send({ success: false, error: { code: 'TASK_NOT_FOUND' } })
      return reply.code(400).send({ success: false, error: { code: 'REASSIGNMENT_FAILED', message: msg } })
    }
  }

  app.post('/local-missions/:id/tasks/:taskId/reassign', handleReassign)
  app.post('/missions/:id/tasks/:taskId/reassign', handleReassign)
  app.post('/local-missions/:id/cancel', async (req, reply) => {
    requireRole(req,['ADMIN','OPERATOR'])
    const body=req.body as {reason?:unknown} | undefined
    if (typeof body?.reason !== 'string' || body.reason.trim().length < 3 || body.reason.length > 2000) return reply.code(400).send({success:false,error:{code:'VALIDATION_ERROR'}})
    const claims=req.user as {sub:string;roles:string[]}
    try { const mission=repository.cancelLocalMission((req.params as {id:string}).id,claims.sub,claims.roles.includes('ADMIN'),body.reason.trim()); publishMission(mission); return {success:true,data:mission} }
    catch(error) { const code=(error as Error).message; if(code==='MISSION_NOT_FOUND') return reply.code(404).send({success:false,error:{code}}); if(code==='CANNOT_CANCEL') return reply.code(409).send({success:false,error:{code,message:'No se puede detener esta operación en su estado actual.'}}); throw error }
  })
  app.post('/local-approvals/:id/decision', async (req, reply) => {
    requireRole(req,['ADMIN'])
    const body = req.body as {status?: unknown; justification?: unknown} | undefined
    if ((body?.status !== 'APPROVED' && body?.status !== 'REJECTED') || typeof body.justification !== 'string' || body.justification.trim().length < 3 || body.justification.length > 2000) return reply.code(400).send({success:false,error:{code:'VALIDATION_ERROR'}})
    try {
      const operationId = (req.params as {id:string}).id
      const missionId = repository.getLocalOperationMissionId(operationId)
      const cursor = missionId ? repository.executionCursor(missionId) : 0
      const mission = await repository.decideLocalOperation(operationId,body.status,(req.user as {sub:string}).sub,body.justification.trim())
      if (!mission.context?.tags?.includes('dispatcher-v1')) publishExecutionEvents(repository, mission.id, cursor)
      publishMission(mission)
      return {success:true,data:mission}
    } catch (error) {
      if ((error as Error).message === 'ESCALATION_NOT_FOUND') return reply.code(404).send({success:false,error:{code:'ESCALATION_NOT_FOUND'}})
      if ((error as Error).message === 'APPROVAL_ALREADY_RESOLVED') return reply.code(409).send({success:false,error:{code:'APPROVAL_ALREADY_RESOLVED'}})
      if ((error as Error).message === 'APPROVAL_BINDING_MISMATCH') return reply.code(409).send({success:false,error:{code:'APPROVAL_BINDING_MISMATCH',message:'La entrada cambió después de solicitar la aprobación; no se ejecutó. Rechace y cree una nueva solicitud.'}})
      if ((error as Error).message === 'LEGACY_WORKFLOW_BLOCKED') return reply.code(409).send({success:false,error:{code:'LEGACY_WORKFLOW_BLOCKED',message:'El flujo histórico requiere revisión antes de continuar.'}})
      throw error
    }
  })
}

function publishExecutionEvents(repository: SqliteRepository, missionId: string, after: number): void {
  for (const event of repository.listExecutionEvents(missionId, after)) bus.publish({type:'EXECUTION_EVENT',payload:event})
}

function publishMission(mission: Mission): void {
  for (const task of mission.tasks) bus.publish({type:'TASK_UPDATED',payload:{task}})
  bus.publish({type:'MISSION_PROGRESS',payload:{missionId:mission.id,status:mission.status,progress:mission.status === 'COMPLETED' ? 100 : 0}})
}
