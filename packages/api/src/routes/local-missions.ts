import type { FastifyInstance } from 'fastify'
import type { SqliteRepository } from '../sqlite.js'
import { bus } from '@hades/core'
import type { Mission } from '@hades/core'
import { requireRole } from '../security.js'

export async function localMissionRoutes(app: FastifyInstance, repository: SqliteRepository): Promise<void> {
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
    publishMission(result.mission)
    return reply.code(201).send({success:true,data:result})
  })
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
      const mission = await repository.decideLocalOperation((req.params as {id:string}).id,body.status,(req.user as {sub:string}).sub,body.justification.trim())
      publishMission(mission)
      return {success:true,data:mission}
    } catch (error) {
      if ((error as Error).message === 'ESCALATION_NOT_FOUND') return reply.code(404).send({success:false,error:{code:'ESCALATION_NOT_FOUND'}})
      if ((error as Error).message === 'APPROVAL_ALREADY_RESOLVED') return reply.code(409).send({success:false,error:{code:'APPROVAL_ALREADY_RESOLVED'}})
      throw error
    }
  })
}

function publishMission(mission: Mission): void {
  for (const task of mission.tasks) bus.publish({type:'TASK_UPDATED',payload:{task}})
  bus.publish({type:'MISSION_PROGRESS',payload:{missionId:mission.id,status:mission.status,progress:mission.status === 'COMPLETED' ? 100 : 0}})
}
