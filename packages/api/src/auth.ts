import type { FastifyInstance } from 'fastify'
import type { SqliteRepository } from './sqlite.js'
import { hashPassword, verifyPassword, validatePasswordPolicy } from './password.js'
import { closeSessionSockets } from './websocket.js'
import { lockoutRemainingMs, recordLoginFailure, recordLoginSuccess } from './login-guard.js'
import { isDemoSession, revokeDemoSession } from './demo.js'
import { hashRecoveryToken, type DurableSync } from './durable.js'
const dummy = `scrypt-32768-8-3:${'0'.repeat(32)}:${'0'.repeat(128)}`
const SESSION_MS = 60 * 60 * 1000
export async function authRoutes(app: FastifyInstance, repo: SqliteRepository, durable?: DurableSync | null): Promise<void> {
  // One-time admin recovery. The operator issues a token with scripts/hades-durable.cjs (needs the durable DB credentials);
  // it is stored only as a SHA-256 hash, expires, and is burned atomically on first use. Only available when durable storage is configured.
  app.post('/api/v1/auth/recover', { bodyLimit: 4096, config: { rateLimit: { max: 3, timeWindow: '15 minutes' } } }, async (request, reply) => {
    if (!durable || durable.degraded) return reply.code(404).send({ success: false, error: { code: 'RECOVERY_NOT_AVAILABLE' } })
    const body = request.body as { username?: unknown; token?: unknown; newPassword?: unknown } | undefined
    if (typeof body?.username !== 'string' || typeof body.token !== 'string' || typeof body.newPassword !== 'string' || body.token.length < 32 || body.token.length > 256 || body.newPassword.length > 1024 || !/^[a-zA-Z0-9._-]{3,64}$/.test(body.username)) return reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR' } })
    const user = repo.findUser(body.username)
    const policy = validatePasswordPolicy(body.newPassword, body.username)
    if (policy) return reply.code(400).send({ success: false, error: { code: policy } })
    // Burn the token only after the cheap validations above, but before touching credentials.
    if (!(await durable.store.consumeRecovery(hashRecoveryToken(body.token)))) { repo.recordAuditEvent({ actor: 'anonymous', action: 'ADMIN_RECOVERY', result: 'DENIED' }); return reply.code(401).send({ success: false, error: { code: 'RECOVERY_TOKEN_INVALID' } }) }
    if (!user || user.role !== 'ADMIN') { repo.recordAuditEvent({ actor: 'anonymous', action: 'ADMIN_RECOVERY', result: 'NO_ADMIN' }); return reply.code(404).send({ success: false, error: { code: 'ADMIN_NOT_FOUND' } }) }
    repo.resetPassword(body.username, await hashPassword(body.newPassword))
    repo.recordAuditEvent({ actor: user.id, action: 'ADMIN_RECOVERY', result: 'SUCCESS' })
    recordLoginSuccess(body.username)
    void durable.flush(repo, true)
    reply.header('Cache-Control', 'no-store'); return { success: true, data: { message: 'Contraseña restablecida; todas las sesiones fueron cerradas.' } }
  })
  const issue = (userId: string, role: string) => {
    const expiresAt=Date.now()+SESSION_MS; const sid=repo.createSession(userId,expiresAt)
    const token=app.jwt.sign({sub:userId,roles:[role],sid,exp:Math.floor(expiresAt/1000)})
    return {token,expiresAt,role}
  }
  app.post('/api/v1/auth/login', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const body=request.body as {username?:unknown;password?:unknown} | undefined
    if (typeof body?.username !== 'string' || typeof body.password !== 'string' || body.username.length > 64 || body.password.length > 1024) return reply.code(400).send({success:false,error:{code:'INVALID_CREDENTIALS'}})
    if (lockoutRemainingMs(body.username) > 0) { repo.recordAuditEvent({actor:'anonymous',action:'LOGIN',result:'LOCKED'}); return reply.code(429).send({success:false,error:{code:'TOO_MANY_ATTEMPTS'}}) }
    const user=repo.findUser(body.username); const valid=await verifyPassword(body.password,user?.password_hash ?? dummy)
    if (!valid || !user?.active) { recordLoginFailure(body.username); repo.recordAuditEvent({actor:'anonymous',action:'LOGIN',result:'DENIED'}); request.log.warn({reason:'invalid_credentials'},'Authentication rejected'); return reply.code(401).send({success:false,error:{code:'INVALID_CREDENTIALS'}}) }
    recordLoginSuccess(body.username)
    reply.header('Cache-Control','no-store'); return {success:true,data:issue(user.id,user.role)}
  })
  app.post('/api/v1/auth/logout', async (request,reply) => {
    const {sid}=request.user as {sid:string}
    if (isDemoSession(sid)) revokeDemoSession(sid); else repo.revokeSession(sid)
    closeSessionSockets(sid); reply.header('Cache-Control','no-store'); return {success:true}
  })
  // Token renewal: a valid session is exchanged for a fresh one; the old session is revoked.
  app.post('/api/v1/auth/refresh', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    const claims=request.user as {sub:string;sid:string;roles:string[]}
    if (isDemoSession(claims.sid) || claims.roles.includes('DEMO')) return reply.code(403).send({success:false,error:{code:'DEMO_FORBIDDEN'}})
    const user=repo.getUserById(claims.sub); if (!user?.active) return reply.code(401).send({success:false,error:{code:'UNAUTHENTICATED'}})
    const fresh=issue(user.id,user.role); repo.revokeSession(claims.sid); closeSessionSockets(claims.sid)
    reply.header('Cache-Control','no-store'); return {success:true,data:fresh}
  })
  // Authenticated credential change (password, and optionally username). Requires the current password.
  app.post('/api/v1/auth/password', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (request, reply) => {
    const claims=request.user as {sub:string;sid:string;roles:string[]}
    if (isDemoSession(claims.sid) || claims.roles.includes('DEMO')) return reply.code(403).send({success:false,error:{code:'DEMO_FORBIDDEN'}})
    const body=request.body as {currentPassword?:unknown;newPassword?:unknown;newUsername?:unknown} | undefined
    if (typeof body?.currentPassword !== 'string' || typeof body.newPassword !== 'string' || body.currentPassword.length > 1024) return reply.code(400).send({success:false,error:{code:'VALIDATION_ERROR'}})
    const user=repo.getUserById(claims.sub); if (!user?.active) return reply.code(401).send({success:false,error:{code:'UNAUTHENTICATED'}})
    if (lockoutRemainingMs(user.username) > 0) return reply.code(429).send({success:false,error:{code:'TOO_MANY_ATTEMPTS'}})
    if (!(await verifyPassword(body.currentPassword,user.password_hash))) { recordLoginFailure(user.username); repo.recordAuditEvent({actor:user.id,action:'CREDENTIALS_CHANGE',result:'DENIED'}); return reply.code(401).send({success:false,error:{code:'INVALID_CREDENTIALS'}}) }
    let newUsername: string | undefined
    if (body.newUsername !== undefined) {
      if (typeof body.newUsername !== 'string' || !/^[a-zA-Z0-9._-]{3,64}$/.test(body.newUsername)) return reply.code(400).send({success:false,error:{code:'INVALID_USERNAME'}})
      if (user.role !== 'ADMIN') return reply.code(403).send({success:false,error:{code:'FORBIDDEN'}})
      if (body.newUsername.toLowerCase() !== user.username) newUsername = body.newUsername
    }
    const policy=validatePasswordPolicy(body.newPassword,newUsername ?? user.username)
    if (policy) return reply.code(400).send({success:false,error:{code:policy}})
    if (await verifyPassword(body.newPassword,user.password_hash)) return reply.code(400).send({success:false,error:{code:'PASSWORD_UNCHANGED'}})
    try { repo.updateCredentials(user.id,await hashPassword(body.newPassword),newUsername,claims.sid) }
    catch (error) { const m=(error as Error).message; if (m==='USERNAME_TAKEN') return reply.code(409).send({success:false,error:{code:m}}); throw error }
    recordLoginSuccess(user.username)
    reply.header('Cache-Control','no-store'); return {success:true,data:{message:'Credenciales actualizadas; las demás sesiones fueron cerradas.'}}
  })
}