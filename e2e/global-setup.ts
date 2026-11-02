import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomBytes } from 'node:crypto'

export const API_PORT = Number(process.env.E2E_API_PORT ?? 3921)
export const STATE_FILE = join(tmpdir(), 'hades-e2e-state.json')
/** Canary values: they are configured in the server environment and must never appear in any page or response. */
export const CANARIES = { ANTHROPIC_API_KEY: 'sk-ant-CANARY-e2e-0001', CHRONOS_TICK_SECRET: 'CANARY-TICK-SECRET-e2e-0000000000000000' }

let child: ChildProcess | undefined
let dir: string | undefined

export default async function globalSetup(): Promise<() => Promise<void>> {
  dir = mkdtempSync(join(tmpdir(), 'hades-pw-'))
  const jwt = randomBytes(36).toString('hex'), password = randomBytes(12).toString('hex')
  const env: NodeJS.ProcessEnv = { ...process.env }
  for (const k of Object.keys(env)) if (k.startsWith('NEAR_')) delete env[k] // NEAR deliberately unconfigured
  child = spawn(process.execPath, [resolve(__dirname, '..', 'packages', 'api', 'dist', 'server.js')], {
    env: { ...env, PORT: String(API_PORT), HOST: '127.0.0.1', ALLOWED_ORIGIN: 'http://127.0.0.1:4173', JWT_SECRET: jwt, HADES_DB_FILE: join(dir, 'pw.sqlite'), HADES_DATA_FILE: join(dir, 'pw.json'), NODE_ENV: 'test', HADES_RATE_LIMIT_MAX: '5000', ...CANARIES },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let out = ''
  child.stdout!.on('data', d => { out += d }); child.stderr!.on('data', d => { out += d })
  let token: string | undefined
  for (let i = 0; i < 80 && !token; i++) { await new Promise(r => setTimeout(r, 250)); token = /X-Setup-Token: ([0-9a-f]{64})/.exec(out)?.[1] }
  if (!token) throw new Error('API did not start:\n' + out.slice(-600))
  const base = `http://127.0.0.1:${API_PORT}`
  const init = await fetch(`${base}/api/v1/setup/init`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-setup-token': token }, body: JSON.stringify({ username: 'pw-admin', password }) })
  if (!init.ok) throw new Error('setup failed ' + init.status)
  // One real login for the whole run: the login route is rate-limited (5/min) on purpose, and one test still exercises the form.
  const lg = await fetch(`${base}/api/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'pw-admin', password }) })
  const session = (await lg.json() as { data: { token: string; expiresAt: number } }).data
  writeFileSync(STATE_FILE, JSON.stringify({ base, username: 'pw-admin', password, jwt, token: session.token, expiresAt: session.expiresAt }))
  return async () => {
    child?.kill(); await new Promise(r => setTimeout(r, 600))
    try { rmSync(dir!, { recursive: true, force: true }) } catch { /* SQLite file may stay locked briefly on Windows */ }
    try { rmSync(STATE_FILE) } catch { /* ignore */ }
  }
}
