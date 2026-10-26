import { createHmac } from 'node:crypto'
import { afterEach, describe, expect, it } from 'vitest'
import handler from './missions.js'

function token(roles: string[]): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({ sub: 'preview-tester', roles, exp: Math.floor(Date.now() / 1000) + 60 })).toString('base64url')
  return `${header}.${payload}.${createHmac('sha256', process.env.JWT_SECRET!).update(`${header}.${payload}`).digest('base64url')}`
}
function response() {
  const result: { statusCode?: number; body?: unknown; headers: Record<string, string> } = { headers: {} }
  return { result, setHeader: (key: string, value: string) => { result.headers[key] = value }, status: (code: number) => ({ json: (body: unknown) => { result.statusCode = code; result.body = body }, end: () => { result.statusCode = code } }), end: () => {} }
}

describe('Preview missions function', () => {
  const original = process.env.JWT_SECRET
  afterEach(() => { process.env.JWT_SECRET = original })
  it('rejects anonymous mutation and disables authenticated mutation without durable storage', async () => {
    process.env.JWT_SECRET = 'preview-test-secret-with-at-least-thirty-two-chars'
    const anonymous = response()
    await handler({ method: 'POST', headers: {} }, anonymous)
    expect(anonymous.result.statusCode).toBe(401)
    const secure = response()
    await handler({ method: 'POST', headers: { authorization: `Bearer ${token(['OPERATOR'])}` } }, secure)
    expect(secure.result.statusCode).toBe(503)
    expect((secure.result.body as { error: { code: string } }).error.code).toBe('DURABLE_STORAGE_REQUIRED')
  })
})
