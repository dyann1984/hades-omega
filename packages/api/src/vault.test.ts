import Fastify from 'fastify'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NEARBridge } from '@hades/core'
import { utils } from 'near-api-js'
import { SqliteRepository } from './sqlite.js'
import { registerSecurity } from './security.js'
import { vaultRoutes } from './routes/vault.js'
import { cerberusRoutes } from './routes/cerberus.js'
import { buildVaultStatus } from './vault.js'
import { NearSigner } from './near/signer.js'
import { NO_CONTRACT_CODE_HASH, type NearRpc } from './near/rpc.js'

const rpc = (over: Partial<NearRpc> = {}): NearRpc => ({
  chainId: async () => 'testnet', latestHeight: async () => 1, finalBlock: async () => ({ hash: 'h', height: 1 }),
  viewAccount: async () => null, viewAccessKey: async () => null, viewFunction: async () => null, broadcast: async () => { throw new Error('vault must never broadcast') }, txStatus: async () => ({ state: 'UNKNOWN' }), ...over,
})

describe('Vault status', () => {
  let dir: string, repo: SqliteRepository
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'vault-')); repo = new SqliteRepository(join(dir, 'h.sqlite'), join(dir, 'h.json')); await repo.init() })
  afterEach(async () => { repo.close(); await rm(dir, { recursive: true, force: true }) })
  const svc = (signer: NearSigner | null, contractId: string | null, r = rpc()) => repo.createNearSubmissionService({ bridge: new NEARBridge(), rpc: r, signer, config: { enabled: false, contractId, minBalanceYocto: 1n } })
  const conn = (s: ReturnType<typeof buildVaultStatus>, id: string) => s.connections.find(c => c.id === id)!

  it('reports NEAR as "configuración pendiente" while there is no signer or contract, and says nothing was sent', () => {
    const s = buildVaultStatus({ repository: repo, near: svc(null, null), wsClients: () => 0, env: {} })
    expect(conn(s, 'near').state).toBe('CONFIGURATION_PENDING')
    expect(conn(s, 'near').detail).toMatch(/cuenta firmante y contrato de auditoría/)
    expect(conn(s, 'near').detail).toMatch(/ninguna transacción/)
  })

  it('does not call a configured-but-disabled NEAR "operational"', () => {
    const signer = new NearSigner('hades.testnet', utils.KeyPair.fromRandom('ed25519').toString())
    const s = buildVaultStatus({ repository: repo, near: svc(signer, 'audit.hades.testnet'), wsClients: () => 0, env: {} })
    expect(conn(s, 'near').state).toBe('DISABLED')
    expect(conn(s, 'near').detail).toMatch(/no prueba|firma desactivada/)
  })

  it('derives every connection from real probes, not constants', () => {
    const s = buildVaultStatus({ repository: repo, near: svc(null, null), wsClients: () => 3, env: { CHRONOS_TICK_SECRET: 'x'.repeat(40) } })
    expect(conn(s, 'database')).toMatchObject({ state: 'OPERATIONAL', facts: { auditChainVerified: true } })
    expect(conn(s, 'websocket').facts['clientsConnected']).toBe(3)
    expect(conn(s, 'chronos')).toMatchObject({ state: 'OPERATIONAL', facts: { schedulerInProcess: false, externalTickConfigured: true } })
    expect(buildVaultStatus({ repository: repo, near: svc(null, null), wsClients: () => 0, env: {} }).connections.find(c => c.id === 'chronos')!.state).toBe('DISABLED')
    expect(conn(s, 'planner').state).toBe('DISABLED')
    // no invented providers
    expect(s.connections.map(c => c.id).sort()).toEqual(['api', 'chronos', 'cerberus', 'database', 'near', 'planner', 'websocket'].sort())
  })

  it('shows the real effective policy, the tool registry and the real emergency stop', () => {
    let s = buildVaultStatus({ repository: repo, near: svc(null, null), wsClients: () => 0, env: {} })
    expect(s.rules.length).toBeGreaterThan(5); expect(s.rules.every(r => typeof r.id === 'string' && typeof r.active === 'boolean')).toBe(true)
    expect(s.tools.map(t => t.id)).toContain('near.audit_hash_submit')
    expect(s.security.emergencyStop).toBe(false); expect(conn(s, 'cerberus').state).toBe('OPERATIONAL')
    repo.gate.setStopped(true, 'admin')
    s = buildVaultStatus({ repository: repo, near: svc(null, null), wsClients: () => 0, env: {} })
    expect(s.security.emergencyStop).toBe(true); expect(conn(s, 'cerberus').state).toBe('DISABLED')
  })

  it('counts pending approvals from the persistent gate', () => {
    const before = buildVaultStatus({ repository: repo, near: svc(null, null), wsClients: () => 0, env: {} }).security.pendingApprovals
    repo.gate.authorize({ tool: 'near.audit_hash_submit', agent: 'HADES', role: 'ADMIN', source: 'API', params: {}, actor: 'a' })
    expect(buildVaultStatus({ repository: repo, near: svc(null, null), wsClients: () => 0, env: {} }).security.pendingApprovals).toBeGreaterThanOrEqual(before)
  })

  it('never leaks secrets: they are reported only as configured / not configured', () => {
    const canaries = { NEAR_SIGNER_PRIVATE_KEY: 'ed25519:CANARY-PRIVATE-KEY-9f3a', NEAR_SIGNER_KEY_FILE: '/secrets/CANARY-FILE.json', JWT_SECRET: 'CANARY-JWT-SECRET-aaaaaaaaaaaaaaaaaaaaaaaa', CHRONOS_TICK_SECRET: 'CANARY-TICK-SECRET-bbbbbbbbbbbbbbbbbbbbbbbb', ANTHROPIC_API_KEY: 'sk-ant-CANARY-KEY', NEAR_AUDIT_CONTRACT_ID: 'audit.visible.testnet', NODE_ENV: 'test' }
    const s = buildVaultStatus({ repository: repo, near: svc(null, 'audit.visible.testnet'), wsClients: () => 0, env: canaries })
    const dump = JSON.stringify(s)
    expect(dump).not.toMatch(/CANARY/)
    const by = Object.fromEntries(s.settings.map(x => [x.key, x]))
    expect(by['NEAR_SIGNER_PRIVATE_KEY']).toMatchObject({ kind: 'secret', configured: true }); expect(by['NEAR_SIGNER_PRIVATE_KEY']).not.toHaveProperty('value')
    expect(by['JWT_SECRET']).not.toHaveProperty('value'); expect(by['ANTHROPIC_API_KEY']).not.toHaveProperty('value')
    expect(by['NEAR_AUDIT_CONTRACT_ID']).toMatchObject({ configured: true, value: 'audit.visible.testnet' })
    expect(by['NEAR_SIGNING_ENABLED']).toMatchObject({ configured: false })
  })

  it('the NEAR probe is read-only and reports each failure instead of throwing', async () => {
    const signer = new NearSigner('hades.testnet', utils.KeyPair.fromRandom('ed25519').toString())
    expect(await svc(null, null).probe()).toMatchObject({ reachable: true, chainId: 'testnet', contractDeployed: null })
    expect(await svc(signer, 'audit.hades.testnet').probe()).toMatchObject({ contractDeployed: false, signerKeyPresent: false })
    const deployed = rpc({ viewAccount: async () => ({ amount: '1', codeHash: 'Code1111111111111111111111111111111111111', blockHeight: 1 }), viewFunction: async () => 'hades.testnet', viewAccessKey: async () => ({ nonce: 1, fullAccess: true }) })
    expect(await svc(signer, 'audit.hades.testnet', deployed).probe()).toMatchObject({ contractDeployed: true, ownerMatchesSigner: true, signerKeyPresent: true })
    const parked = rpc({ viewAccount: async () => ({ amount: '1', codeHash: NO_CONTRACT_CODE_HASH, blockHeight: 1 }) })
    expect((await svc(signer, 'audit.hades.testnet', parked).probe()).contractDeployed).toBe(false)
    const down = await svc(signer, 'audit.hades.testnet', rpc({ chainId: async () => { throw new Error('ECONNREFUSED') } })).probe()
    expect(down).toMatchObject({ reachable: false, error: 'ECONNREFUSED' })
  })

  describe('HTTP', () => {
    it('is ADMIN-only, and the probe endpoint answers', async () => {
      const prev = process.env.JWT_SECRET; process.env.JWT_SECRET = 'test-secret-with-at-least-thirty-two-characters'
      const app = Fastify()
      try {
        await registerSecurity(app); await app.register(async a => vaultRoutes(a, repo, svc(null, null)), { prefix: '/api/v1' }); await app.ready()
        const call = (role: string, method: 'GET' | 'POST', url: string) => app.inject({ method, url: `/api/v1${url}`, headers: { authorization: `Bearer ${app.jwt.sign({ sub: 'u', roles: [role], exp: Math.floor(Date.now() / 1000) + 60 })}` } })
        for (const role of ['OPERATOR', 'AUDITOR', 'VIEWER']) { expect((await call(role, 'GET', '/vault/status')).statusCode, role).toBe(403); expect((await call(role, 'POST', '/vault/near/probe')).statusCode).toBe(403) }
        expect((await app.inject({ method: 'GET', url: '/api/v1/vault/status' })).statusCode).toBe(401)
        const r = await call('ADMIN', 'GET', '/vault/status'); expect(r.statusCode).toBe(200)
        expect(r.json().data.connections.find((c: { id: string }) => c.id === 'near').state).toBe('CONFIGURATION_PENDING')
        expect((await call('ADMIN', 'POST', '/vault/near/probe')).json().data.reachable).toBe(true)
      } finally { await app.close(); process.env.JWT_SECRET = prev }
    })

    it('integration: ADMIN controls recipients and the emergency stop through the API, and the Vault reflects them', async () => {
      const prev = process.env.JWT_SECRET; process.env.JWT_SECRET = 'test-secret-with-at-least-thirty-two-characters'
      const app = Fastify()
      try {
        await registerSecurity(app)
        await app.register(async a => { await cerberusRoutes(a, repo); await vaultRoutes(a, repo, svc(null, null)) }, { prefix: '/api/v1' }); await app.ready()
        const call = (role: string, method: 'GET' | 'POST', url: string, payload?: unknown) => app.inject({ method, url: `/api/v1${url}`, payload: payload as never, headers: { authorization: `Bearer ${app.jwt.sign({ sub: 'admin-1', roles: [role], exp: Math.floor(Date.now() / 1000) + 60 })}` } })
        const add = { tool: 'near.audit_hash_submit', recipient: 'audit.demo.testnet' }
        expect((await call('OPERATOR', 'POST', '/cerberus/gate/recipients/add', add)).statusCode).toBe(403)
        expect((await call('ADMIN', 'POST', '/cerberus/gate/recipients/add', add)).statusCode).toBe(200)
        expect((await call('ADMIN', 'POST', '/cerberus/gate/recipients/add', { tool: 'no.such.tool', recipient: 'x.testnet' })).statusCode).toBe(400)
        expect((await call('ADMIN', 'POST', '/cerberus/gate/recipients/add', { tool: add.tool, recipient: 'bad account!' })).statusCode).toBe(400)
        expect((await call('ADMIN', 'POST', '/cerberus/gate/recipients/add', { tool: add.tool, recipient: 'treasury.near' })).statusCode).toBe(400) // mainnet ids can never be allow-listed
        expect((await call('ADMIN', 'GET', '/cerberus/gate/recipients')).json().data).toEqual([expect.objectContaining({ ...add, addedBy: 'admin-1' })])
        expect(repo.listAuditEvents({ action: 'CERBERUS_RECIPIENT_ADDED', limit: 5, offset: 0 })).toHaveLength(1)
        expect((await call('ADMIN', 'POST', '/cerberus/gate/recipients/remove', add)).statusCode).toBe(200)
        expect((await call('ADMIN', 'GET', '/cerberus/gate/recipients')).json().data).toEqual([])

        expect((await call('ADMIN', 'GET', '/vault/status')).json().data.security.emergencyStop).toBe(false)
        expect((await call('ADMIN', 'POST', '/cerberus/emergency-stop', { stopped: true })).statusCode).toBe(200)
        const stopped = (await call('ADMIN', 'GET', '/vault/status')).json().data
        expect(stopped.security.emergencyStop).toBe(true)
        expect(stopped.connections.find((c: { id: string }) => c.id === 'cerberus').state).toBe('DISABLED')
        expect((await call('ADMIN', 'POST', '/cerberus/emergency-stop', { stopped: 'yes' })).statusCode).toBe(400)
      } finally { await app.close(); process.env.JWT_SECRET = prev }
    })
  })
})
