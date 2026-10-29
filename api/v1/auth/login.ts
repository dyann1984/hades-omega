import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { setSafeCors } from '../../_security.js'

export const config = { maxDuration: 30 }

// ——— JWT (HS256, matches verifyServerlessRole in _security.ts) ——————————————
function signJwt(payload: Record<string, unknown>, secret: string): string {
  const hdr = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const bdy = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = createHmac('sha256', secret).update(`${hdr}.${bdy}`).digest('base64url')
  return `${hdr}.${bdy}.${sig}`
}

// ——— scrypt (same params as packages/api/src/password.ts) ——————————————————
const SCRYPT = { N: 32768, r: 8, p: 3, maxmem: 67108864 }

function deriveKey(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) =>
    scrypt(password, salt, 64, SCRYPT, (err, key) => (err ? reject(err) : resolve(key as Buffer)))
  )
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, salt, encoded] = stored.split(':')
  if (
    algorithm !== 'scrypt-32768-8-3' ||
    !/^[0-9a-f]{32}$/.test(salt ?? '') ||
    !/^[0-9a-f]{128}$/.test(encoded ?? '') ||
    Buffer.byteLength(password, 'utf8') > 1024
  )
    return false
  const actual = await deriveKey(password, salt!)
  return timingSafeEqual(actual, Buffer.from(encoded!, 'hex'))
}

// ——— Turso HTTP (zero-dependency, uses Node 22 built-in fetch) ——————————————
interface TursoCell { type: string; value: string | null }
interface TursoResult { cols: { name: string }[]; rows: TursoCell[][] }

async function tursoQuery(sql: string, args: { type: string; value: string }[]): Promise<TursoResult | null> {
  const url = process.env.TURSO_URL
  const token = process.env.TURSO_AUTH_TOKEN
  if (!url || !token) return null
  try {
    const resp = await fetch(`${url.replace(/\/$/, '')}/v2/pipeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        requests: [
          { type: 'execute', stmt: { sql, args } },
          { type: 'close' }
        ]
      })
    })
    if (!resp.ok) return null
    const json = (await resp.json()) as { results?: { type: string; response?: { result?: TursoResult } }[] }
    const first = json?.results?.[0]
    if (first?.type !== 'ok') return null
    return first.response?.result ?? null
  } catch {
    return null
  }
}

function pickRow(result: TursoResult | null, i = 0): Record<string, string | null> | null {
  if (!result?.rows?.[i]) return null
  const obj: Record<string, string | null> = {}
  result.cols.forEach((col, idx) => {
    obj[col.name] = result.rows[i]![idx]?.value ?? null
  })
  return obj
}

// ——— Handler ——————————————————————————————————————————————————————————————
export default async function handler(req: any, res: any): Promise<void> {
  setSafeCors(req, res)
  if (req.method === 'OPTIONS') { res.status(200).end(); return }
  if (req.method !== 'POST') { res.status(405).end(); return }

  const jwtSecret = process.env.JWT_SECRET
  const tursoReady = Boolean(process.env.TURSO_URL && process.env.TURSO_AUTH_TOKEN)
  if (!jwtSecret || jwtSecret.length < 32 || !tursoReady) {
    res.status(503).json({
      success: false,
      error: { code: 'MISCONFIGURED', message: 'Authentication service is not yet configured.' }
    })
    return
  }

  const body = (req.body ?? {}) as Record<string, unknown>
  const username = typeof body.username === 'string' ? body.username.toLowerCase().trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!username || !password) {
    res.status(400).json({ success: false, error: { code: 'INVALID_REQUEST' } })
    return
  }

  const userResult = await tursoQuery(
    'SELECT id, password_hash, role FROM users WHERE username = ?',
    [{ type: 'text', value: username }]
  )
  const user = pickRow(userResult)

  // Always run scrypt to prevent timing-based user enumeration
  const DUMMY = `scrypt-32768-8-3:${'0'.repeat(32)}:${'0'.repeat(128)}`
  let valid: boolean
  if (user?.password_hash) {
    valid = await verifyPassword(password, user.password_hash)
  } else {
    await verifyPassword(password, DUMMY)
    valid = false
  }

  if (!user || !valid) {
    res.status(401).json({ success: false, error: { code: 'INVALID_CREDENTIALS' } })
    return
  }

  const TTL = 8 * 60 * 60 // 8 hours
  const now = Math.floor(Date.now() / 1000)
  const exp = now + TTL
  const expiresAt = exp * 1000 // ms for frontend

  const sessionId = randomBytes(16).toString('hex')
  await tursoQuery('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)', [
    { type: 'text', value: sessionId },
    { type: 'text', value: user.id! },
    { type: 'integer', value: String(now * 1000) },
    { type: 'integer', value: String(expiresAt) }
  ])

  const token = signJwt(
    { sub: user.id!, roles: [user.role!], sid: sessionId, exp, iat: now },
    jwtSecret
  )

  res.status(200).json({ success: true, data: { token, expiresAt, role: user.role } })
}
