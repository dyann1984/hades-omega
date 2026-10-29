import Fastify from 'fastify'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SqliteRepository } from '../sqlite.js'
import { registerSecurity } from '../security.js'
import { localMissionRoutes } from './local-missions.js'
import { bus, type ServerEvent } from '@hades/core'

describe('persistent approval telemetry', () => {
  it('persists ordered events, resumes by cursor and isolates mission owners', async () => {
    const old = process.env.JWT_SECRET; process.env.JWT_SECRET = 'test-secret-with-at-least-thirty-two-characters'
    const dir = await mkdtemp(join(tmpdir(), 'hades-events-'))
    const db = join(dir, 'db.sqlite'), legacy = join(dir, 'none.json')
    let repo = new SqliteRepository(db, legacy)
    const app = Fastify()
    const live: ServerEvent[] = []
    const unsubscribe = bus.subscribe(event => { if (event.type === 'EXECUTION_EVENT') live.push(event) })
    try {
      await repo.init(); await registerSecurity(app)
      await app.register(async api => localMissionRoutes(api, repo), {prefix:'/api/v1'}); await app.ready()
      const headers = (sub:string, role:string) => ({authorization:`Bearer ${app.jwt.sign({sub,roles:[role],exp:Math.floor(Date.now()/1000)+120})}`})
      const created = (await app.inject({method:'POST',url:'/api/v1/local-missions',headers:headers('alice','OPERATOR'),payload:{title:'Prueba hash',input:'contenido'}})).json().data
      const path = `/api/v1/local-missions/${created.mission.id}/execution-events`
      const first = (await app.inject({url:path,headers:headers('alice','OPERATOR')})).json().data
      expect(first).toHaveLength(1); expect(first[0].type).toBe('approval.requested')
      expect(live[0]).toEqual({type:'EXECUTION_EVENT',payload:first[0]})
      expect(first[0].taskId).toBe(created.mission.tasks[0].id)
      expect((await app.inject({url:path,headers:headers('bob','OPERATOR')})).statusCode).toBe(404)
      expect((await app.inject({url:`${path}?after=-1`,headers:headers('alice','OPERATOR')})).statusCode).toBe(400)
      const decided = await app.inject({method:'POST',url:`/api/v1/local-approvals/${created.approvalId}/decision`,headers:headers('admin','ADMIN'),payload:{status:'REJECTED',justification:'No aprobado'}})
      expect(decided.statusCode).toBe(200)
      const next = (await app.inject({url:`${path}?after=${first[0].sequence}`,headers:headers('alice','OPERATOR')})).json().data
      expect(next).toHaveLength(1); expect(next[0].type).toBe('approval.denied'); expect(next[0].sequence).toBeGreaterThan(first[0].sequence)
      expect(live[1]).toEqual({type:'EXECUTION_EVENT',payload:next[0]})
      const approved = (await app.inject({method:'POST',url:'/api/v1/local-missions',headers:headers('alice','OPERATOR'),payload:{title:'Segundo hash',input:'otro'}})).json().data
      expect((await app.inject({method:'POST',url:`/api/v1/local-approvals/${approved.approvalId}/decision`,headers:headers('admin','ADMIN'),payload:{status:'APPROVED',justification:'Revisado'}})).statusCode).toBe(200)
      expect(repo.listExecutionEvents(approved.mission.id, 0).map(e => e.type)).toEqual(['approval.requested','approval.granted'])
      expect(repo.listExecutionEvents(approved.mission.id, 0).map(e => e.sequence)).toEqual([1,2])
      repo.close(); repo = new SqliteRepository(db, legacy); await repo.init()
      expect(repo.listExecutionEvents(created.mission.id, 0).map(e => e.type)).toEqual(['approval.requested','approval.denied'])
    } finally { unsubscribe(); await app.close(); repo.close(); await rm(dir,{recursive:true,force:true}); process.env.JWT_SECRET = old }
  })
})
