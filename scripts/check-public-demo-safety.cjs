#!/usr/bin/env node
/*
 * Proves that a PUBLIC demo deployment is safe: it boots the built API exactly as a public host would run it
 * (no NEAR_* variable, no signer key, no LLM key) with a throwaway database and checks, over HTTP, that
 *   - anonymous visitors and DEMO sessions cannot reach any NEAR/CERBERUS/Vault route,
 *   - even an ADMIN cannot sign or send anything: signing is off, no signer is configured,
 *   - no response or log line contains key material.
 * Nothing here talks to the NEAR network.
 *
 *   npm run build -w @hades/api && node scripts/check-public-demo-safety.cjs
 */
const { spawn } = require('node:child_process')
const { mkdtempSync, rmSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { randomBytes } = require('node:crypto')

const PORT = Number(process.env.SAFETY_PORT || 3927), BASE = `http://127.0.0.1:${PORT}`
const dir = mkdtempSync(join(tmpdir(), 'hades-safety-'))
let failures = 0
const check = (name, cond, extra) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`); if (!cond) failures++ }
async function http(method, path, token, body, headers = {}) {
  const res = await fetch(BASE + path, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined })
  const text = await res.text(); let json = {}; try { json = JSON.parse(text) } catch { /* not json */ }
  return { status: res.status, json, text }
}

async function main() {
  const jwt = randomBytes(36).toString('hex'), password = randomBytes(12).toString('hex')
  const env = { ...process.env }
  for (const k of Object.keys(env)) if (k.startsWith('NEAR_') || k.startsWith('ANTHROPIC') || k === 'CHRONOS_TICK_SECRET') delete env[k] // exactly what a public host sets: none of them
  const child = spawn(process.execPath, [join(__dirname, '..', 'packages', 'api', 'dist', 'server.js')], {
    env: { ...env, PORT: String(PORT), HOST: '127.0.0.1', ALLOWED_ORIGIN: 'http://localhost:5173', JWT_SECRET: jwt, HADES_DB_FILE: join(dir, 's.sqlite'), HADES_DATA_FILE: join(dir, 's.json'), NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let out = ''
  child.stdout.on('data', d => { out += d }); child.stderr.on('data', d => { out += d })
  try {
    for (let i = 0; i < 60 && !/X-Setup-Token: ([0-9a-f]{64})/.test(out); i++) await new Promise(r => setTimeout(r, 500))
    const setup = /X-Setup-Token: ([0-9a-f]{64})/.exec(out)
    if (!setup) throw new Error('server did not start:\n' + out.slice(-600))
    check('API up', (await http('GET', '/health')).json.status === 'ok')

    // 1. Anonymous visitors
    for (const [m, p] of [['GET', '/api/v1/near/config'], ['GET', '/api/v1/near/intents'], ['POST', '/api/v1/near/intents'], ['POST', '/api/v1/near/intents/x/submit'], ['GET', '/api/v1/vault/status'], ['POST', '/api/v1/cerberus/emergency-stop'], ['POST', '/api/v1/cerberus/gate/recipients/add']])
      check(`anonymous ${m} ${p} is rejected (401)`, (await http(m, p, null, m === 'POST' ? {} : undefined)).status === 401)

    // 2. "Explore Demo" session: temporary, isolated, default-deny
    const demo = await http('POST', '/api/v1/demo/session', null, {})
    const dt = demo.json.data && demo.json.data.token
    check('DEMO session is issued without credentials', demo.status < 300 && !!dt)
    for (const [m, p] of [['GET', '/api/v1/near/config'], ['GET', '/api/v1/near/intents'], ['POST', '/api/v1/near/intents'], ['POST', '/api/v1/near/intents/x/submit'], ['GET', '/api/v1/vault/status'], ['POST', '/api/v1/vault/near/probe'], ['POST', '/api/v1/cerberus/emergency-stop'], ['POST', '/api/v1/cerberus/gate/approvals/x/decision'], ['POST', '/api/v1/cerberus/gate/recipients/add']])
      check(`DEMO session ${m} ${p} is forbidden (403)`, (await http(m, p, dt, m === 'POST' ? {} : undefined)).status === 403)
    const ns = await http('GET', '/api/v1/demo/near/status', dt)
    check('DEMO sees only the simulated NEAR status', ns.status === 200 && !/ed25519:|private_key|master_seed/.test(ns.text), ns.json.data)

    // 3. Even a full ADMIN cannot sign or send on this deployment
    check('setup creates the first admin (private operator access)', (await http('POST', '/api/v1/setup/init', null, { username: 'safety-admin', password }, { 'x-setup-token': setup[1] })).status < 300)
    const login = await http('POST', '/api/v1/auth/login', null, { username: 'safety-admin', password })
    const at = login.json.data && login.json.data.token
    const cfg = (await http('GET', '/api/v1/near/config', at)).json.data
    check('signing is OFF and no signer/contract exists on this deployment', cfg && cfg.signingEnabled === false && cfg.blockers.includes('SIGNING_DISABLED') && !cfg.signer && !cfg.contractId, { signingEnabled: cfg && cfg.signingEnabled, blockers: cfg && cfg.blockers })
    const sub = await http('POST', '/api/v1/near/intents/00000000-0000-4000-8000-000000000000/submit', at)
    check('ADMIN submit of an unknown intent is refused (the blockers above are what stop any real one)', sub.status >= 400, { http: sub.status, code: sub.json.error && sub.json.error.code })
    const subs = (await http('GET', '/api/v1/near/submissions', at)).json.data
    check('no submission exists', JSON.stringify(subs) === '[]' || (subs && subs.length === 0) || (subs && Array.isArray(subs.items) && subs.items.length === 0), subs)
    const vault = await http('GET', '/api/v1/vault/status', at)
    check('Vault reports NEAR as not configured on this deployment', (vault.json.data.connections.find(c => c.id === 'near') || {}).state === 'CONFIGURATION_PENDING')

    // 4. No key material anywhere
    check('no key material in the server output', !/ed25519:[1-9A-HJ-NP-Za-km-z]{30,}|master_seed|private_key|sk-ant-/.test(out))
  } finally { child.kill(); try { rmSync(dir, { recursive: true, force: true }) } catch { /* best effort */ } }
  console.log(failures === 0 ? '\nPUBLIC DEMO SAFETY: ALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
  process.exit(failures === 0 ? 0 : 1)
}
main().catch(e => { console.error('ERROR', e.message); process.exit(2) })
