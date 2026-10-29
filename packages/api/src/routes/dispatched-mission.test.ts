import Fastify from 'fastify'
import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CerberusGUARD } from '@hades/core'
import { SqliteRepository } from '../sqlite.js'
import { registerSecurity } from '../security.js'
import { localMissionRoutes } from './local-missions.js'

const docs = [{filename:'a.txt',content:'Precio $11,111 MXN, SLA 99%.'},{filename:'b.txt',content:'Precio $22,222 MXN, penalización 4%.'},{filename:'c.txt',content:'Precio $33,333 MXN, sin garantía.'}]

describe('dispatched document mission', () => {
  it('runs the real adapters, waits for admin, seals the report and isolates owners', async () => {
    const old=process.env.JWT_SECRET; process.env.JWT_SECRET='test-secret-with-at-least-thirty-two-characters'
    const dir=await mkdtemp(join(tmpdir(),'hades-dispatch-')), db=join(dir,'db.sqlite'), legacy=join(dir,'none.json')
    let repo=new SqliteRepository(db,legacy); const app=Fastify()
    try {
      await repo.init(); await registerSecurity(app); await app.register(async api => localMissionRoutes(api,repo),{prefix:'/api/v1'}); await app.ready()
      const headers=(sub:string,role:string)=>({authorization:`Bearer ${app.jwt.sign({sub,roles:[role],exp:Math.floor(Date.now()/1000)+60})}`})
      for (const doc of docs) await writeFile(join(dir,doc.filename),doc.content,'utf8')
      const files=await Promise.all(docs.map(async doc=>({filename:doc.filename,content:await readFile(join(dir,doc.filename),'utf8')})))
      const create=()=>app.inject({method:'POST',url:'/api/v1/local-missions/multi-document',headers:{...headers('alice','OPERATOR'),'idempotency-key':'unique-test'},payload:{title:'Comparación',documents:files}})
      const created=await Promise.all([create(),create()]); const res=created[0]!
      expect(res.statusCode).toBe(201); const {mission,approvalId}=res.json().data
      expect(created[1]!.json().data.mission.id).toBe(mission.id)
      expect((await app.inject({method:'POST',url:'/api/v1/local-missions/multi-document',headers:{...headers('alice','OPERATOR'),'idempotency-key':'unique-test'},payload:{title:'Otro título',documents:files}})).statusCode).toBe(409)
      expect(mission.tasks.map((task:any)=>task.status)).toEqual(['COMPLETED','COMPLETED','COMPLETED','CERBERUS_REVIEW','QUEUED'])
      const events=repo.listExecutionEvents(mission.id,0)
      expect(events.slice(0,5).every(e=>e.type==='task.queued' && e.status==='QUEUED')).toBe(true)
      expect(events.filter(e=>e.type==='agent.completed').map(e=>e.agentId)).toEqual(['CHARON','MINOS','PERSEPHONE'])
      expect(mission.tasks[2].result.data.values.map((x:any)=>x.amounts[0])).toEqual([11111,22222,33333])
      expect(mission.context.guardDecision.outcome).toBe('PERMIT')
      expect((await app.inject({url:`/api/v1/local-missions/${mission.id}/execution-events`,headers:headers('bob','OPERATOR')})).statusCode).toBe(404)
      repo.close(); await repo.init()
      expect(repo.getMission(mission.id)?.tasks[3]?.status).toBe('CERBERUS_REVIEW')
      expect((await create()).json().data.mission.id).toBe(mission.id)
      const decide=()=>app.inject({method:'POST',url:`/api/v1/local-approvals/${approvalId}/decision`,headers:headers('admin','ADMIN'),payload:{status:'APPROVED',justification:'Revisado'}})
      const decisions=await Promise.all([decide(),decide()])
      expect(decisions.map(response=>response.statusCode).sort()).toEqual([200,409])
      const completed=decisions.find(response=>response.statusCode===200)!; const finished=completed.json().data
      const report=finished.tasks[3].result.data.reportMarkdown, seal=finished.tasks[4].result.data.sha256
      expect(report).toContain('$22,222'); expect(seal).toBe(createHash('sha256').update(report).digest('hex'))
      expect((await decide()).statusCode).toBe(409)
      repo.close(); repo=new SqliteRepository(db,legacy); await repo.init()
      expect(repo.getMission(mission.id)?.status).toBe('COMPLETED')
      const sequence=repo.listExecutionEvents(mission.id,0); expect(sequence.map(e=>e.sequence)).toEqual(sequence.map((_,i)=>i+1))
    } finally {await app.close(); repo.close(); await rm(dir,{recursive:true,force:true}); process.env.JWT_SECRET=old}
  })
  it('enforces an actual CERBERUS DENY policy before the protected operation', async () => {
    const dir=await mkdtemp(join(tmpdir(),'hades-deny-'))
    const guard=new CerberusGUARD({rules:[{id:'TEST-DENY',name:'deny',description:'deny hash',operationType:'CRYPTO_HASH',condition:{type:'ALWAYS'},outcome:'DENY',priority:100,active:true}]})
    const repo=new SqliteRepository(join(dir,'db.sqlite'),join(dir,'none.json'),guard)
    try { await repo.init(); const {mission}=await repo.createMultiDocumentMission('alice','Bloqueo',docs)
      expect(mission.status).toBe('FAILED'); expect(mission.tasks[4]!.status).toBe('BLOCKED')
      expect(repo.listExecutionEvents(mission.id,0).some(e=>e.type==='cerberus.blocked')).toBe(true)
    } finally {repo.close(); await rm(dir,{recursive:true,force:true})}
  })
  it('waits for a human decision when CERBERUS escalates', async () => {
    const dir=await mkdtemp(join(tmpdir(),'hades-escalate-'))
    const guard=new CerberusGUARD({rules:[{id:'TEST-ESCALATE',name:'review',description:'review hash',operationType:'CRYPTO_HASH',condition:{type:'ALWAYS'},outcome:'ESCALATE',priority:100,active:true}]})
    const repo=new SqliteRepository(join(dir,'db.sqlite'),join(dir,'none.json'),guard)
    try { await repo.init(); const {mission,approvalId}=await repo.createMultiDocumentMission('alice','Revisión',docs)
      expect(mission.context.guardDecision).toMatchObject({outcome:'ESCALATE'})
      expect(mission.tasks[4]!.status).toBe('QUEUED')
      expect(repo.listExecutionEvents(mission.id,0).some(e=>e.type==='cerberus.escalated')).toBe(true)
      const finished=await repo.decideLocalOperation(approvalId,'APPROVED','admin','Revisado')
      expect(finished.status).toBe('COMPLETED')
    } finally {repo.close(); await rm(dir,{recursive:true,force:true})}
  })
  it('records a failed executor and never dispatches dependent tasks', async () => {
    const dir=await mkdtemp(join(tmpdir(),'hades-failure-')), repo=new SqliteRepository(join(dir,'db.sqlite'),join(dir,'none.json'))
    try { await repo.init(); const {mission}=await repo.createMultiDocumentMission('alice','Error',[docs[0]!,{filename:'empty.txt',content:''}])
      expect(mission.status).toBe('FAILED'); expect(mission.tasks[1]!.status).toBe('FAILED'); expect(mission.tasks[2]!.status).toBe('QUEUED')
      expect(repo.listExecutionEvents(mission.id,0).filter(e=>e.type==='agent.started').map(e=>e.agentId)).toEqual(['CHARON','MINOS'])
    } finally {repo.close(); await rm(dir,{recursive:true,force:true})}
  })
  it('does not execute the protected stage after cancellation', async () => {
    const dir=await mkdtemp(join(tmpdir(),'hades-cancel-')), repo=new SqliteRepository(join(dir,'db.sqlite'),join(dir,'none.json'))
    try { await repo.init(); const {mission,approvalId}=await repo.createMultiDocumentMission('alice','Cancelar',docs)
      const cancelled=repo.cancelLocalMission(mission.id,'alice',false,'Decisión del usuario')
      expect(cancelled.tasks[0]!.status).toBe('COMPLETED'); expect(cancelled.tasks[3]!.status).toBe('CANCELLED')
      await expect(repo.decideLocalOperation(approvalId,'APPROVED','admin','Revisado')).rejects.toThrow('APPROVAL_ALREADY_RESOLVED')
      expect(repo.listExecutionEvents(mission.id,0).some(e=>e.agentId==='TARTARUS' && e.type==='agent.started')).toBe(false)
    } finally {repo.close(); await rm(dir,{recursive:true,force:true})}
  })
})
