import Fastify from 'fastify'
import websocketPlugin from '@fastify/websocket'
import WebSocket from 'ws'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SqliteRepository } from './sqlite.js'
import { hashPassword } from './password.js'
import { registerSecurity } from './security.js'
import { authRoutes } from './auth.js'
import { setupWebSocket } from './websocket.js'

describe('WebSocket session revocation', () => {
  it('closes an authenticated socket on logout and refuses the revoked session', async () => {
    const old=process.env.JWT_SECRET; process.env.JWT_SECRET='test-secret-with-at-least-thirty-two-characters'
    const dir=await mkdtemp(join(tmpdir(),'hades-ws-session-')); const repo=new SqliteRepository(join(dir,'db.sqlite'),join(dir,'none.json')); const app=Fastify()
    try {
      await repo.init(); repo.createUser('alice',await hashPassword('correct horse battery staple'),'OPERATOR')
      await app.register(websocketPlugin); await registerSecurity(app,repo); await authRoutes(app,repo); setupWebSocket(app,repo,sid=>repo.getActiveSession(sid))
      const addr=await app.listen({host:'127.0.0.1',port:0}); const login=await app.inject({method:'POST',url:'/api/v1/auth/login',payload:{username:'alice',password:'correct horse battery staple'}}); const token=login.json().data.token
      const socket=new WebSocket(addr.replace('http:','ws:')+'/ws')
      await new Promise<void>((resolve,reject)=>{socket.once('open',()=>socket.send(JSON.stringify({type:'AUTH',token})));socket.once('message',()=>resolve());socket.once('error',reject)})
      const closed=new Promise<number>(resolve=>socket.once('close',resolve))
      expect((await app.inject({method:'POST',url:'/api/v1/auth/logout',headers:{authorization:`Bearer ${token}`}})).statusCode).toBe(200)
      expect(await closed).toBe(1008)
      const next=new WebSocket(addr.replace('http:','ws:')+'/ws'); const rejected=new Promise<number>(resolve=>next.once('close',resolve)); next.once('open',()=>next.send(JSON.stringify({type:'AUTH',token}))); expect(await rejected).toBe(1008)
    } finally { await app.close(); repo.close(); await rm(dir,{recursive:true,force:true}); process.env.JWT_SECRET=old }
  })
})
