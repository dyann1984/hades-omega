import Fastify from 'fastify'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { registerSecurity } from '../security.js'
import { SqliteRepository } from '../sqlite.js'
import { cerberusRoutes } from './cerberus.js'

describe('NEAR intent API', () => {
  it('requires an admin and binds approval to the prepared hash without signing', async () => {
    const old=process.env.JWT_SECRET; process.env.JWT_SECRET='test-secret-with-at-least-thirty-two-characters'
    const dir=await mkdtemp(join(tmpdir(),'near-api-')),repo=new SqliteRepository(join(dir,'db.sqlite'),join(dir,'none.json')),app=Fastify()
    try {
      await repo.init(); await registerSecurity(app); await app.register(async a=>cerberusRoutes(a,repo),{prefix:'/api/v1'}); await app.ready()
      const auth=(role:string)=>({authorization:`Bearer ${app.jwt.sign({sub:'actor',roles:[role],exp:Math.floor(Date.now()/1000)+120})}`})
      const payload={network:'testnet',signerId:'source.testnet',receiverId:'audit.testnet',type:'AUDIT_HASH',amountYocto:'0',auditId:'audit-1',contentHash:'a'.repeat(64),operationType:'PLANNING',agentName:'HADES',decision:'PERMIT',timestampMs:1700000000000,gas:'30000000000000'}
      const create=(role:string)=>app.inject({method:'POST',url:'/api/v1/near/intents',headers:auth(role),payload})
      expect((await create('VIEWER')).statusCode).toBe(403)
      const result=await create('ADMIN');expect(result.statusCode).toBe(201);const intent=result.json().data
      const request=await app.inject({method:'POST',url:`/api/v1/near/intents/${intent.id}/request-approval`,headers:auth('ADMIN')}); expect(request.json().data.status).toBe('PENDING_APPROVAL')
      const approve=(hash:string)=>app.inject({method:'POST',url:`/api/v1/near/intents/${intent.id}/approve`,headers:auth('ADMIN'),payload:{hash,expiresAt:Date.now()+60000}})
      expect((await approve('0'.repeat(64))).statusCode).toBe(409)
      expect((await approve(intent.hash)).json().data.status).toBe('APPROVED')
      expect((await approve(intent.hash)).statusCode).toBe(409)
      expect((await app.inject({method:'POST',url:`/api/v1/near/intents/${intent.id}/sign`,headers:auth('ADMIN')})).statusCode).toBe(404)
    } finally { await app.close();repo.close();await rm(dir,{recursive:true,force:true});process.env.JWT_SECRET=old }
  })
})
