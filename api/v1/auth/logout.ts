import { createHmac, timingSafeEqual } from 'node:crypto'
import { setSafeCors } from '../../_security.js'

export const config = { maxDuration: 15 }

function extractSid(token: string, secret: string): string | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [hdr, bdy, sig] = parts as [string, string, string]
  const expected = createHmac('sha256', secret).update(`${hdr}.${bdy}`).digest('base64url')
  if (expected.length !== sig.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(sig)))
    return null
  try {
    const payload = JSON.parse(
      Buffer.from(bdy.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    ) as { sid?: string; exp?: number }
    if (payload.exp && payload.exp <= Math.floor(Date.now() / 1000)) return null
    return typeof payload.sid === 'string' ? payload.sid : null
  } catch {
    return null
  }
}

export default async function handler(req: any, res: any): Promise<void> {
  setSafeCors(req, res)
  if (req.method === 'OPTIONS') { res.status(200).end(); return }
  if (req.method !== 'POST') { res.status(405).end(); return }

  const jwtSecret = process.env.JWT_SECRET
  const tursoUrl = process.env.TURSO_URL
  const tursoToken = process.env.TURSO_AUTH_TOKEN

  const authHeader = req.headers?.authorization ?? ''
  const rawToken =
    typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7)
      : ''
  const sessionId = jwtSecret && rawToken ? extractSid(rawToken, jwtSecret) : null

  if (sessionId && tursoUrl && tursoToken) {
    try {
      await fetch(`${tursoUrl.replace(/\/$/, '')}/v2/pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tursoToken}` },
        body: JSON.stringify({
          requests: [
            {
              type: 'execute',
              stmt: {
                sql: 'UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL',
                args: [
                  { type: 'integer', value: String(Date.now()) },
                  { type: 'text', value: sessionId }
                ]
              }
            },
            { type: 'close' }
          ]
        })
      })
    } catch {
      // soft-fail: client clears token regardless
    }
  }

  res.status(200).json({ success: true })
}
