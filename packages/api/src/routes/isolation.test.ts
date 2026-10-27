import Fastify from 'fastify'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'
import { registerSecurity } from '../security.js'
import { JsonRepository } from '../persistence.js'
import { missionRoutes } from './missions.js'

describe('mission isolation', () => {
  it('restricts missions to owners and allows admin access to legacy records', async () => {
    const previous = process.env.JWT_SECRET; process.env.JWT_SECRET = 'test-secret-with-at-least-thirty-two-characters'
    const dir = await mkdtemp(join(tmpdir(), 'hades-isolation-')); const app = Fastify()
    try {
      const repo = new JsonRepository(join(dir,'store.json')); await repo.init()
      await repo.saveMission({ id:'legacy', tasks:[] } as any)
      await registerSecurity(app); await app.register(async api => missionRoutes(api, repo), { prefix:'/api/v1' }); await app.ready()
      const headers = (sub: string, roles = ['OPERATOR']) => ({ authorization: `Bearer ${app.jwt.sign({sub, roles, exp:Math.floor(Date.now()/1000)+60})}` })
      const create = (sub:string) => app.inject({method:'POST',url:'/api/v1/missions',headers:headers(sub),payload:{title:'Local mission',description:'Generic local mission'}})
      const a = (await create('a')).json().data; const b = (await create('b')).json().data
      expect(a.ownerId).toBe('a'); expect(b.ownerId).toBe('b')
      for (const [user, other] of [['a',b.id],['b',a.id]]) for (const suffix of ['', '/tasks', '/report']) expect((await app.inject({url:`/api/v1/missions/${other}${suffix}`,headers:headers(user)})).statusCode).toBe(404)
      expect((await app.inject({url:'/api/v1/missions',headers:headers('a')})).json().data.map((x:any)=>x.id)).toEqual([a.id])
      expect((await app.inject({url:'/api/v1/missions/legacy',headers:headers('a')})).statusCode).toBe(404)
      expect((await app.inject({url:'/api/v1/missions/legacy',headers:headers('admin',['ADMIN'])})).statusCode).toBe(200)
    } finally { await app.close(); await rm(dir,{recursive:true,force:true}); process.env.JWT_SECRET=previous }
  }, 30000)
})
