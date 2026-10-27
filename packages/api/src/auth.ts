import type { FastifyInstance } from 'fastify'
import type { SqliteRepository } from './sqlite.js'
import { verifyPassword } from './password.js'
import { closeSessionSockets } from './websocket.js'
const dummy = `scrypt-32768-8-3:${'0'.repeat(32)}:${'0'.repeat(128)}`
export async function authRoutes(app: FastifyInstance, repo: SqliteRepository): Promise<void> {
  app.post('/api/v1/auth/login', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body=request.body as {username?:unknown;password?:unknown} | undefined
    if (typeof body?.username !== 'string' || typeof body.password !== 'string' || body.username.length > 64 || body.password.length > 1024) return reply.code(400).send({success:false,error:{code:'INVALID_CREDENTIALS'}})
    const user=repo.findUser(body.username); const valid=await verifyPassword(body.password,user?.password_hash ?? dummy)
    if (!valid || !user?.active) { request.log.warn({reason:'invalid_credentials'},'Authentication rejected'); return reply.code(401).send({success:false,error:{code:'INVALID_CREDENTIALS'}}) }
    const expiresAt=Date.now()+60*60*1000; const sid=repo.createSession(user.id,expiresAt)
    const token=app.jwt.sign({sub:user.id,roles:[user.role],sid,exp:Math.floor(expiresAt/1000)})
    reply.header('Cache-Control','no-store'); return {success:true,data:{token,expiresAt,role:user.role}}
  })
  app.post('/api/v1/auth/logout', async (request,reply) => { const {sid}=request.user as {sid:string}; repo.revokeSession(sid); closeSessionSockets(sid); reply.header('Cache-Control','no-store'); return {success:true} })
}

