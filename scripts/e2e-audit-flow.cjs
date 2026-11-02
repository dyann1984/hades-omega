#!/usr/bin/env node
/*
 * End-to-end check of the enterprise audit flow against a REAL API process (built output) with a throwaway database.
 * Drives only HTTP: setup admin -> login -> create multi-document mission -> approve -> evidence -> CHRONOS follow-up
 * (run) -> NEAR audit preparation -> Vault status. Never signs or sends anything; NEAR is intentionally unconfigured.
 *
 *   npm run build -w @hades/api && node scripts/e2e-audit-flow.cjs
 */
const { spawn } = require('node:child_process')
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { randomBytes } = require('node:crypto')

const PORT = Number(process.env.E2E_PORT || 3917)
const BASE = `http://127.0.0.1:${PORT}`
const dir = mkdtempSync(join(tmpdir(), 'hades-e2e-'))
const evidence = []
let failures = 0
const check = (name, cond, extra) => { evidence.push({ name, ok: !!cond, ...(extra !== undefined ? { extra } : {}) }); if (!cond) failures++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`) }

async function http(method, path, token, body, headers = {}) {
  const res = await fetch(BASE + path, { method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined })
  const json = await res.json().catch(() => ({}))
  return { status: res.status, json }
}

async function main() {
  const jwt = randomBytes(36).toString('hex'), password = randomBytes(12).toString('hex')
  const env = { ...process.env }
  // NEAR must be unconfigured for this check; absent (not empty) variables.
  for (const k of Object.keys(env)) if (k.startsWith('NEAR_') || k === 'ANTHROPIC_API_KEY' || k === 'CHRONOS_TICK_SECRET') delete env[k]
  const child = spawn(process.execPath, [join(__dirname, '..', 'packages', 'api', 'dist', 'server.js')], {
    env: { ...env, PORT: String(PORT), HOST: '127.0.0.1', ALLOWED_ORIGIN: 'http://localhost:5173', JWT_SECRET: jwt, HADES_DB_FILE: join(dir, 'e2e.sqlite'), HADES_DATA_FILE: join(dir, 'e2e.json'), NODE_ENV: 'test' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let out = ''
  child.stdout.on('data', d => { out += d }); child.stderr.on('data', d => { out += d })
  try {
    for (let i = 0; i < 60 && !/X-Setup-Token: ([0-9a-f]{64})/.test(out); i++) await new Promise(r => setTimeout(r, 500))
    const setup = /X-Setup-Token: ([0-9a-f]{64})/.exec(out)
    if (!setup) throw new Error('server did not print a setup token:\n' + out.slice(-800))
    check('API process is up', (await http('GET', '/health')).json.status === 'ok')
    check('setup creates the first admin', (await http('POST', '/api/v1/setup/init', null, { username: 'e2e-admin', password }, { 'x-setup-token': setup[1] })).status < 300)
    const login = await http('POST', '/api/v1/auth/login', null, { username: 'e2e-admin', password })
    const token = login.json.data.token
    check('admin can log in', login.status === 200 && !!token)

    const v0 = (await http('GET', '/api/v1/vault/status', token)).json.data
    check('Vault: NEAR is "configuración pendiente" (no account/contract configured)', v0.connections.find(c => c.id === 'near').state === 'CONFIGURATION_PENDING')
    check('Vault: database + audit chain verified', v0.connections.find(c => c.id === 'database').state === 'OPERATIONAL')
    check('Vault: no secret value or fixture string in the payload', !/ed25519:|JWT_SECRET"\s*:\s*"[^"]|Vercel/.test(JSON.stringify(v0)) && !JSON.stringify(v0).includes(jwt))
    check('Vault: policy rules and tools come from the server', v0.rules.length > 5 && v0.tools.some(t => t.id === 'near.audit_hash_submit'))

    const docs = [
      { filename: 'contrato.txt', content: 'Contrato de suministro. Monto total 120,000 MXN. Penalización 5%.' },
      { filename: 'cotizacion.txt', content: 'Cotización vigente. Monto 98,500 MXN. Plazo 30 días.' },
    ]
    const created = await http('POST', '/api/v1/local-missions/multi-document', token, { title: 'E2E auditoría de proveedor', documents: docs, budgetLimit: 150000 }, { 'idempotency-key': 'e2e-1' })
    check('mission created; CHARON, MINOS and PERSEPHONE ran', created.status === 201)
    const missionId = created.json.data.mission.id
    let flow = (await http('GET', `/api/v1/audit-flow/${missionId}`, token)).json.data
    const st = id => flow.stages.find(s => s.id === id)
    check('flow: three agent stages completed and executed', ['intake', 'validation', 'analysis'].every(id => st(id).status === 'DONE' && st(id).executed))
    check('flow: CERBERUS waits for human approval; report/seal/evidence not executed', st('cerberus').status === 'WAITING_APPROVAL' && !st('report').executed && !st('seal').executed && !st('evidence').executed)
    check('evidence cannot be recorded before completion (409)', (await http('POST', `/api/v1/audit-flow/${missionId}/evidence`, token)).status === 409)

    const pending = (await http('GET', '/api/v1/local-approvals', token)).json.data.find(p => p.missionId === missionId)
    const decided = await http('POST', `/api/v1/local-approvals/${pending.id}/decision`, token, { status: 'APPROVED', justification: 'E2E: documentos revisados' })
    check('ADMIN approval completes the mission (ELYSIUM report + TARTARUS seal)', decided.status === 200 && decided.json.data.status === 'COMPLETED')

    const ev = await http('POST', `/api/v1/audit-flow/${missionId}/evidence`, token)
    check('evidence recorded with SHA-256', ev.status === 200 && /^[0-9a-f]{64}$/.test(ev.json.data.evidence.reportSha256))
    const fu = await http('POST', `/api/v1/audit-flow/${missionId}/followup`, token)
    check('CHRONOS follow-up scheduled (READ-only job)', fu.status === 200 && fu.json.data.task.kind === 'MISSION_FOLLOWUP')
    flow = (await http('GET', `/api/v1/audit-flow/${missionId}`, token)).json.data
    check('follow-up is scheduled but NOT reported as executed yet', st('followup').status === 'DONE' && st('followup').executed === false)
    const run = await http('POST', `/api/v1/chronos/tasks/${fu.json.data.task.id}/run`, token)
    check('follow-up run succeeds and finds intact evidence + intact audit chain', run.status < 300 && JSON.stringify(run.json).includes('"evidenceIntact":true') && JSON.stringify(run.json).includes('"auditChainVerified":true'))

    const near = await http('POST', `/api/v1/audit-flow/${missionId}/near-audit`, token)
    check('NEAR audit stays CONFIGURATION_PENDING: no intent, nothing signed or sent', near.status === 200 && near.json.data.state === 'CONFIGURATION_PENDING' && near.json.data.intent === null)
    check('NEAR intents list is empty', (await http('GET', '/api/v1/near/intents', token)).json.data.length === 0)
    check('NEAR submissions list is empty', (await http('GET', '/api/v1/near/submissions', token)).json.data.length === 0)
    flow = (await http('GET', `/api/v1/audit-flow/${missionId}`, token)).json.data
    check('final flow: near stage CONFIGURATION_PENDING and executed=false', st('near').status === 'CONFIGURATION_PENDING' && st('near').executed === false)
    check('audit hash chain still verifies', (await http('GET', '/api/v1/audit/integrity', token)).json.data.verified === true)
    const stop = await http('POST', '/api/v1/cerberus/emergency-stop', token, { stopped: true })
    check('emergency stop is reflected in the Vault', stop.status === 200 && (await http('GET', '/api/v1/vault/status', token)).json.data.security.emergencyStop === true)

    writeFileSync(join(__dirname, '..', 'docs', 'evidence-e2e-audit-flow.json'), JSON.stringify({ generatedAt: new Date().toISOString(), note: 'Real API process, throwaway database, NEAR unconfigured; nothing signed or sent.', missionStatus: flow.missionStatus, stages: flow.stages.map(s => ({ id: s.id, agent: s.agent, status: s.status, executed: s.executed })), reportSha256: flow.report && flow.report.sha256, checks: evidence }, null, 2) + '\n')
  } finally {
    child.kill()
    await new Promise(r => setTimeout(r, 500))
    try { rmSync(dir, { recursive: true, force: true }) } catch { /* Windows may keep the SQLite file locked briefly */ }
  }
  console.log(failures ? `\n${failures} check(s) FAILED` : `\nAll ${evidence.length} checks passed`)
  process.exit(failures ? 1 : 0)
}
main().catch(e => { console.error('E2E error:', e.message); process.exit(2) })
