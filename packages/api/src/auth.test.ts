import Fastify from 'fastify'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SqliteRepository } from './sqlite.js'
import { hashPassword } from './password.js'
import { registerSecurity } from './security.js'
import { authRoutes } from './auth.js'

describe('real sessions', () => {
  it('limits repeated invalid login attempts', async () => {
    const old=process.env.JWT_SECRET; process.env.JWT_SECRET='test-secret-with-at-least-thirty-two-characters'
    const dir=await mkdtemp(join(tmpdir(),'hades-rate-')); const repo=new SqliteRepository(join(dir,'db.sqlite'),join(dir,'none.json')); const app=Fastify()
    try { await repo.init(); await registerSecurity(app,repo); await authRoutes(app,repo); await app.ready(); let status=0
      for(let i=0;i<6;i++) status=(await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{username:'unknown',password:'incorrect'}})).statusCode
      expect(status).toBe(429)
    } finally {await app.close();repo.close();await rm(dir,{recursive:true,force:true});process.env.JWT_SECRET=old}
  }, 30000)
  it('authenticates, rejects forged JWTs, and revokes sessions after logout and restart', async () => {
    const old=process.env.JWT_SECRET; process.env.JWT_SECRET='test-secret-with-at-least-thirty-two-characters'
    const dir=await mkdtemp(join(tmpdir(),'hades-auth-')), db=join(dir,'db.sqlite'), path=join(dir,'none.json'); const app=Fastify(); let repo=new SqliteRepository(db,path)
    try {
      await repo.init(); repo.createUser('alice',await hashPassword('correct horse battery staple'),'OPERATOR')
      await registerSecurity(app,repo); await authRoutes(app,repo); app.get('/api/v1/private',async req=>({user:req.user})); await app.ready()
      const login=async (password:string)=>app.inject({method:'POST',url:'/api/v1/auth/login',payload:{username:'alice',password}})
      expect((await login('wrong password')).statusCode).toBe(401)
      const good=await login('correct horse battery staple'); expect(good.statusCode).toBe(200); const token=good.json().data.token
      const headers={authorization:`Bearer ${token}`}
      expect((await app.inject({url:'/api/v1/private',headers})).statusCode).toBe(200)
      const forged=app.jwt.sign({sub:'alice',roles:['ADMIN'],exp:Math.floor(Date.now()/1000)+100})
      expect((await app.inject({url:'/api/v1/private',headers:{authorization:`Bearer ${forged}`}})).statusCode).toBe(401)
      expect(repo.resetPassword('alice',await hashPassword('another correct password'))).toBe(true)
      expect((await app.inject({url:'/api/v1/private',headers})).statusCode).toBe(401)
      const newLogin=await login('another correct password'); const newHeaders={authorization:`Bearer ${newLogin.json().data.token}`}
      expect((await app.inject({method:'POST',url:'/api/v1/auth/logout',headers:newHeaders})).statusCode).toBe(200)
      expect((await app.inject({url:'/api/v1/private',headers})).statusCode).toBe(401)
      await app.close(); repo.close(); repo=new SqliteRepository(db,path); await repo.init()
      const claims=app.jwt.verify<{sid:string}>(token); expect(repo.getActiveSession(claims.sid)).toBeUndefined()
    } finally { await app.close(); repo.close(); await rm(dir,{recursive:true,force:true}); process.env.JWT_SECRET=old }
  }, 30000)
})
