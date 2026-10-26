import { createHmac, timingSafeEqual } from 'node:crypto'

type Role = 'ADMIN' | 'OPERATOR' | 'AUDITOR' | 'VIEWER'
type RequestLike = { headers?: Record<string, string | string[] | undefined> }

function base64UrlDecode(value: string): string {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
}

/** Minimal HS256 verifier for serverless handlers; no trust is placed in an unsigned token. */
export function verifyServerlessRole(req: RequestLike, allowed: Role[]): { sub: string; roles: Role[] } | null {
  const header = req.headers?.authorization
  const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : ''
  const secret = process.env.JWT_SECRET
  if (!token || !secret || secret.length < 32) return null
  const [encodedHeader, encodedPayload, signature] = token.split('.')
  if (!encodedHeader || !encodedPayload || !signature) return null
  const expected = createHmac('sha256', secret).update(`${encodedHeader}.${encodedPayload}`).digest('base64url')
  if (expected.length !== signature.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null
  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as { sub?: string; roles?: Role[]; exp?: number }
    if (!payload.sub || !Array.isArray(payload.roles) || (payload.exp && payload.exp <= Math.floor(Date.now() / 1000))) return null
    return payload.roles.some(role => allowed.includes(role)) ? { sub: payload.sub, roles: payload.roles } : null
  } catch { return null }
}

export function setSafeCors(req: RequestLike, res: any): void {
  const origin = req.headers?.origin
  const allowed = process.env.ALLOWED_ORIGIN?.split(',').map(item => item.trim()) ?? []
  if (typeof origin === 'string' && allowed.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Vary', 'Origin')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key')
}

export function unauthorized(res: any): void { res.status(401).json({ success: false, error: { code: 'UNAUTHENTICATED' } }) }
export function previewWriteDisabled(res: any): void {
  res.status(503).json({ success: false, error: { code: 'DURABLE_STORAGE_REQUIRED', message: 'Preview is read-only until a durable storage adapter is configured.' } })
}
