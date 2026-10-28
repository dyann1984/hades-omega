import Fastify from 'fastify'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SqliteRepository } from '../sqlite.js'
import { registerSecurity } from '../security.js'
import { cerberusRoutes } from './cerberus.js'
import { agentRoutes } from './agents.js'

describe('persistent audit and CERBERUS service', () => {
  it('persists redacted events, restricts them to ADMIN, and pages filtered results', async () => {
    const old=process.env.JWT_SECRET; process.env.JWT_SECRET='test-secret-with-at-least-thirty-two-characters'
    const dir=await mkdtemp(join(tmpdir(),'hades-audit-')), db=join(dir,'data.sqlite'), legacy=join(dir,'none.json'); let repo=new SqliteRepository(db,legacy); const app=Fastify()
    try {
      await repo.init(); const admin=repo.createUser('admin','unused','ADMIN'), operator=repo.createUser('operator','unused','OPERATOR')
      await registerSecurity(app,repo); await app.register(async api=>{await api.register(async scope=>cerberusRoutes(scope,repo));await agentRoutes(api)},{prefix:'/api/v1'}); await app.ready()
      const auth=(id:string,role:string)=>{const sid=repo.createSession(id,Date.now()+60000);return {authorization:`Bearer ${app.jwt.sign({sub:id,roles:[role],sid,exp:Math.floor(Date.now()/1000)+60})}`}}
      const adminHeaders=auth(admin,'ADMIN'), userHeaders=auth(operator,'OPERATOR')
      const {mission,approvalId}=await repo.createLocalMission(operator,'Audit mission','PRIVATE DOCUMENT CONTENT')
      await repo.decideLocalOperation(approvalId,'APPROVED',admin,'private justification')
      const list=await app.inject({url:`/api/v1/audit/events?missionId=${mission.id}&limit=2&offset=0`,headers:adminHeaders})
      expect(list.statusCode).toBe(200);expect(list.json().data).toHaveLength(2); expect(list.body).not.toContain('PRIVATE DOCUMENT CONTENT');expect(list.body).not.toContain('private justification')
      expect((await app.inject({url:'/api/v1/audit/events',headers:userHeaders})).statusCode).toBe(403)
      expect((await app.inject({url:'/api/v1/audit/events?limit=-1',headers:adminHeaders})).statusCode).toBe(400)
      const agents=(await app.inject({url:'/api/v1/agents',headers:adminHeaders})).json().data
      const service=agents.find((a:{name:string})=>a.name==='CERBERUS');expect(service.service.available).toBe(true);expect(typeof service.service.denied).toBe('number')
      await app.close();repo.close();repo=new SqliteRepository(db,legacy);await repo.init()
      expect(repo.listAuditEvents({missionId:mission.id,limit:100,offset:0}).length).toBeGreaterThan(1)
    } finally {await app.close();repo.close();await rm(dir,{recursive:true,force:true});process.env.JWT_SECRET=old}
  })
})
