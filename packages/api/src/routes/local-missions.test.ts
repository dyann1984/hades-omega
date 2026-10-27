import Fastify from 'fastify'
import { createHash } from 'node:crypto'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SqliteRepository } from '../sqlite.js'
import { registerSecurity } from '../security.js'
import { localMissionRoutes } from './local-missions.js'
import { missionRoutes } from './missions.js'

describe('local approved execution', () => {
  it('holds execution before approval, executes once, persists, and rejects other users', async () => {
    const old=process.env.JWT_SECRET; process.env.JWT_SECRET='test-secret-with-at-least-thirty-two-characters'
    const dir=await mkdtemp(join(tmpdir(),'hades-local-')); const db=join(dir,'db.sqlite'); const json=join(dir,'none.json'); const app=Fastify()
    let repo = new SqliteRepository(db,json)
    try {
      await repo.init(); await registerSecurity(app); await app.register(async api => { await missionRoutes(api,repo); await localMissionRoutes(api,repo) },{prefix:'/api/v1'}); await app.ready()
      const headers=(sub:string,role:string)=>({authorization:`Bearer ${app.jwt.sign({sub,roles:[role],exp:Math.floor(Date.now()/1000)+120})}`})
      const create=()=>app.inject({method:'POST',url:'/api/v1/local-missions',headers:headers('alice','OPERATOR'),payload:{title:'Hash local',input:'entrada verificable'}})
      const created=(await create()).json().data; const id=created.mission.id, approval=created.approvalId
      expect(created.mission.tasks[0].status).toBe('CERBERUS_REVIEW')
      expect(created.mission.tasks[0].result.data.sha256).toBeUndefined()
      expect((await app.inject({url:`/api/v1/missions/${id}`,headers:headers('bob','VIEWER')})).statusCode).toBe(404)
      const decide=(role:string,status='APPROVED')=>app.inject({method:'POST',url:`/api/v1/local-approvals/${approval}/decision`,headers:headers('reviewer',role),payload:{status,justification:'Verificado'}})
      expect((await decide('OPERATOR')).statusCode).toBe(403)
      const result=await decide('ADMIN'); expect(result.statusCode).toBe(200)
      expect(result.json().data.tasks[0].result.data.sha256).toBe(createHash('sha256').update('entrada verificable').digest('hex'))
      expect((await decide('ADMIN')).statusCode).toBe(409)
      const reject=(await create()).json().data
      const rejected=await app.inject({method:'POST',url:`/api/v1/local-approvals/${reject.approvalId}/decision`,headers:headers('admin','ADMIN'),payload:{status:'REJECTED',justification:'No autorizado'}})
      expect(rejected.json().data.tasks[0].result.data.cancelled).toBe(true)
      repo.close(); repo=new SqliteRepository(db,json); await repo.init()
      expect(repo.getMission(id)?.tasks[0].status).toBe('EXECUTED'); expect(repo.listApprovals()).toHaveLength(2)
    } finally { await app.close(); repo.close(); await rm(dir,{recursive:true,force:true}); process.env.JWT_SECRET=old }
  })
})
