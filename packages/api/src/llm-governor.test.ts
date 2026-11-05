import Fastify from 'fastify'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NEARBridge } from '@hades/core'
import { SqliteRepository } from './sqlite.js'
import { registerSecurity } from './security.js'
import { vaultRoutes } from './routes/vault.js'
import { LlmGovernor, redact } from './llm-governor.js'
import { ClaudeAnthropicPlanner } from './planner/ClaudeAnthropicPlanner.js'
import { buildVaultStatus } from './vault.js'

// All inputs below are synthetic: no real personal data is used anywhere in these tests.
const PLAN_JSON = JSON.stringify({ tasks: [{ id: 'a', title: 'Revisar contrato', description: 'd', assignedTo: 'MINOS', priority: 'P1', dependsOn: [], estimatedDuration: 20, justification: 'j' }], warnings: [] })
const intent = { title: 'Auditoría de proveedor', description: 'Contrato con prueba@ejemplo.invalid cuenta 000011112222 y clave sk-ant-FAKE-FAKE-FAKE-0000', context: { organizationId: 'org-ficticia', budgetLimit: 987654, currency: 'MXN', deadline: null, priority: 'HIGH' as const, tags: ['etiqueta-interna'] } }
const KEY = 'sk-ant-TEST-not-a-real-key-0001'

describe('LLM egress control (Anthropic)', () => {
  let dir: string, repo: SqliteRepository
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'llm-')); repo = new SqliteRepository(join(dir, 'h.sqlite'), join(dir, 'h.json')); await repo.init() })
  afterEach(async () => { delete process.env['ANTHROPIC_API_KEY']; repo.close(); await rm(dir, { recursive: true, force: true }) })

  const governor = (env: NodeJS.ProcessEnv = { ANTHROPIC_API_KEY: KEY }) => new LlmGovernor({ gate: repo.gate, policy: repo.llmPolicy, audit: ev => { repo.recordAuditEvent(ev) }, env })
  const enable = (patch: Record<string, unknown> = {}) => repo.llmPolicy.update({ enabled: true, ...patch } as never, 'admin-1', false)
  const fakeClient = (impl?: () => Promise<unknown>) => { const create = vi.fn(impl ?? (async () => ({ content: [{ type: 'text', text: PLAN_JSON }] }))); return { client: { messages: { create } } as never, create } }
  const planner = (g: LlmGovernor | null, c = fakeClient()) => { process.env['ANTHROPIC_API_KEY'] = KEY; return { p: new ClaudeAnthropicPlanner({ client: c.client, governor: () => g }), create: c.create } }
  const warnings = (r: { warnings: string[] }) => r.warnings.join(' ')

  it('is disabled by default: a key alone (or any environment variable) never enables egress', async () => {
    expect(repo.llmPolicy.get().enabled).toBe(false)
    const { p, create } = planner(governor({ ANTHROPIC_API_KEY: KEY, HADES_LLM_ENABLED: 'true' }))
    const r = await p.plan(intent)
    expect(create).not.toHaveBeenCalled()
    expect(r.tasks.every(t => t.origin !== 'LLM_GENERATED')).toBe(true)
    expect(warnings(r)).toMatch(/POLICY_DISABLED/)
  })

  it('uses an explicitly supplied vault key only after policy permits egress, with a fake client', async () => {
    const master = Buffer.alloc(32, 7).toString('base64'), vault = repo.createSecretVault(master)
    vault.put('ANTHROPIC_API_KEY', KEY, 'admin')
    const source = vi.fn(() => vault.get('ANTHROPIC_API_KEY', 'system:llm-planner'))
    const g = new LlmGovernor({ gate: repo.gate, policy: repo.llmPolicy, audit: ev => { repo.recordAuditEvent(ev) }, env: {}, keySource: source })
    const fake = fakeClient(), p = new ClaudeAnthropicPlanner({ client: fake.client, governor: () => g })
    delete process.env['ANTHROPIC_API_KEY']
    await p.plan(intent); expect(source).not.toHaveBeenCalled(); expect(fake.create).not.toHaveBeenCalled()
    enable()
    const result = await p.plan(intent)
    expect(fake.create).toHaveBeenCalledTimes(1); expect(result.tasks.some(t => t.origin === 'LLM_GENERATED')).toBe(true)
    expect(JSON.stringify(repo.listAuditEvents({ limit: 100, offset: 0 }))).not.toContain(KEY)
    expect(JSON.stringify(result)).not.toContain(KEY)
  })

  it('fails closed when no governor is attached', async () => {
    const { p, create } = planner(null)
    expect(warnings(await p.plan(intent))).toMatch(/no governor attached/)
    expect(create).not.toHaveBeenCalled()
  })

  it('CERBERUS itself refuses the egress tool while the policy is off, even if the governor is bypassed', () => {
    const params = { provider: 'api.anthropic.com', model: 'm', promptSha256: 'a'.repeat(64), chars: 10, estInputTokens: 4, maxOutputTokens: 100 }
    const ask = (over: Record<string, unknown> = {}) => repo.gate.authorize({ tool: 'llm.plan', agent: 'HADES', role: 'SYSTEM', source: 'MISSION', params, actor: 'rogue', ...over } as never)
    expect(ask().code).toBe('EGRESS_NOT_AUTHORIZED')
    enable()
    expect(ask().outcome).toBe('PERMIT')
    expect(ask({ params: { ...params, provider: 'evil.example' } }).code).toBe('INVALID_PARAMS')
    expect(ask({ params: { ...params, prompt: 'texto libre' } }).code).toBe('INVALID_PARAMS')
    expect(ask({ agent: 'CHARON' }).code).toBe('AGENT_NOT_PERMITTED')
    expect(ask({ role: 'VIEWER' }).code).toBe('ROLE_NOT_PERMITTED')
    expect(ask({ role: 'DEMO' }).code).toBe('ROLE_NOT_PERMITTED')
    repo.llmPolicy.update({ enabled: false }, 'admin-1', false)
    expect(ask().code).toBe('EGRESS_NOT_AUTHORIZED')
  })

  it('is classified as EGRESS, never as an internal write, and needs no per-call human approval', () => {
    const t = repo.gate.listTools().find(x => x.id === 'llm.plan')!
    expect(t.effect).toBe('EGRESS'); expect(t.effect).not.toBe('WRITE'); expect(t.requiresApproval).toBe(false)
  })

  it('sends only minimized content: no budget, tags, organization, e-mail, long numbers or keys', async () => {
    enable()
    const { p, create } = planner(governor())
    const r = await p.plan(intent)
    expect(create).toHaveBeenCalledTimes(1)
    const sent = JSON.stringify((create.mock.calls[0] as unknown[])[0])
    for (const leak of ['987654', 'etiqueta-interna', 'org-ficticia', 'prueba@ejemplo.invalid', '000011112222', 'sk-ant-FAKE', KEY]) expect(sent).not.toContain(leak)
    expect(sent).toContain('[correo]'); expect(sent).toContain('[clave]'); expect(sent).toContain('[numero]')
    expect(r.tasks.some(t => t.origin === 'LLM_GENERATED')).toBe(true)
  })

  it('bounds tokens: the input is truncated to the policy and max_tokens comes from the policy', async () => {
    enable({ maxInputTokens: 60, maxOutputTokens: 120 })
    const { p, create } = planner(governor())
    await p.plan({ ...intent, description: 'palabra '.repeat(80) })
    const call = (create.mock.calls[0] as unknown[])[0] as { max_tokens: number; messages: Array<{ content: string }> }
    expect(call.max_tokens).toBe(120)
    expect(call.messages[0]!.content.length).toBeLessThanOrEqual(60 * 3)
  })

  it('enforces the daily quota and falls back beyond it', async () => {
    enable({ dailyLimit: 2 })
    const { p, create } = planner(governor())
    for (let i = 0; i < 4; i++) await p.plan({ ...intent, title: `Auditoría ${i}` })
    expect(create).toHaveBeenCalledTimes(2)
    expect(repo.llmPolicy.usageToday().calls).toBe(2)
    expect(warnings(await p.plan(intent))).toMatch(/DAILY_LIMIT/)
  })

  it('enforces the estimated daily cost cap', async () => {
    enable({ dailyCostCapUsd: 0.01, outputUsdPerMTok: 1000, maxOutputTokens: 4000 }) // worst case ≈ 4 USD per call
    const { p, create } = planner(governor())
    expect(warnings(await p.plan(intent))).toMatch(/COST_LIMIT/)
    expect(create).not.toHaveBeenCalled()
    enable({ dailyCostCapUsd: 5 })
    await p.plan(intent)
    expect(create).toHaveBeenCalledTimes(1)
    expect(repo.llmPolicy.usageToday().estCostUsd).toBeGreaterThan(0)
  })

  it('only the allowed provider: a base-URL override to another host blocks the call', async () => {
    enable()
    for (const url of ['https://evil.example', 'http://api.anthropic.com', 'https://api.anthropic.com.evil.example', 'https://user:pw@api.anthropic.com', 'not a url']) {
      const { p, create } = planner(governor({ ANTHROPIC_API_KEY: KEY, ANTHROPIC_BASE_URL: url }))
      expect(warnings(await p.plan(intent)), url).toMatch(/PROVIDER_NOT_ALLOWED/)
      expect(create).not.toHaveBeenCalled()
    }
    const ok = planner(governor({ ANTHROPIC_API_KEY: KEY, ANTHROPIC_BASE_URL: 'https://api.anthropic.com' }))
    await ok.p.plan(intent); expect(ok.create).toHaveBeenCalledTimes(1)
  })

  it('the emergency stop blocks the call and refuses enabling egress', async () => {
    enable()
    repo.gate.setStopped(true, 'admin')
    const { p, create } = planner(governor())
    expect(warnings(await p.plan(intent))).toMatch(/GATE_DENIED/)
    expect(create).not.toHaveBeenCalled()
    expect(() => repo.llmPolicy.update({ enabled: true }, 'admin-1', repo.gate.isStopped())).toThrow(/emergency stop/)
  })

  it('records every decision and call by hash and size only, never the prompt or the answer', async () => {
    enable()
    const { p } = planner(governor())
    await p.plan(intent)
    const decisions = repo.gate.listDecisions(10) as Array<{ tool: string; outcome: string; effect: string }>
    expect(decisions.find(d => d.tool === 'llm.plan')).toMatchObject({ outcome: 'PERMIT', effect: 'EGRESS' })
    const events = JSON.stringify(repo.listAuditEvents({ limit: 200, offset: 0 }))
    expect(events).toMatch(/LLM_CALL/)
    expect(events).toMatch(/provider=api\.anthropic\.com:model=claude-haiku-5-5:in=\d+:out=\d+:redactions=\d+:estUsd=0\./)
    for (const secret of ['Revisar contrato', 'Auditoría de proveedor', 'prueba@ejemplo.invalid', KEY]) expect(events).not.toContain(secret)
  })

  it('a provider error still falls back and does not leak the key', async () => {
    enable()
    const { p } = planner(governor(), fakeClient(async () => { throw new Error(`401 invalid x-api-key ${KEY}`) }))
    const r = await p.plan(intent)
    expect(r.tasks.length).toBeGreaterThan(0)
    expect(JSON.stringify(r.warnings)).not.toContain(KEY)
  })

  it('rejects invalid policy values', () => {
    for (const bad of [{ dailyLimit: 0 }, { dailyLimit: 1.5 }, { maxOutputTokens: 99999 }, { dailyCostCapUsd: -1 }, { enabled: 'yes' }, { nope: 1 }]) expect(() => repo.llmPolicy.update(bad as never, 'a', false), JSON.stringify(bad)).toThrow()
    expect(repo.llmPolicy.get().enabled).toBe(false)
  })

  it('the Vault tells the truth about the provider state and never shows the key', () => {
    const svc = repo.createNearSubmissionService({ bridge: new NEARBridge(), rpc: {} as never, signer: null, config: { enabled: false, contractId: null, minBalanceYocto: 1n } })
    const status = (env: NodeJS.ProcessEnv) => buildVaultStatus({ repository: repo, near: svc, wsClients: () => 0, env }).connections.find(c => c.id === 'planner')!
    expect(status({ ANTHROPIC_API_KEY: KEY })).toMatchObject({ state: 'DISABLED' })
    enable()
    const on = status({ ANTHROPIC_API_KEY: KEY })
    expect(on).toMatchObject({ state: 'OPERATIONAL' }); expect(on.detail).toMatch(/EGRESS/)
    expect(JSON.stringify(on)).not.toContain(KEY)
  })

  it('redact() masks keys, e-mails, hashes, accounts, credentials in URLs and long numbers', () => {
    const r = redact('a@b.invalid ed25519:' + 'A'.repeat(40) + ' ' + 'f'.repeat(64) + ' hades.testnet 4111 1111 1111 1111 https://u:p@host.invalid/x texto normal')
    expect(r.text).toBe('[correo] [clave] [hash] [cuenta] [numero] [url] texto normal')
  })

  describe('HTTP (ADMIN-only policy; the NEAR probe goes through CERBERUS)', () => {
    async function withApp(fn: (call: (role: string, method: 'GET' | 'POST', url: string, payload?: unknown) => ReturnType<ReturnType<typeof Fastify>['inject']>) => Promise<void>) {
      const prev = process.env['JWT_SECRET']; process.env['JWT_SECRET'] = 'test-secret-with-at-least-thirty-two-characters'
      const app = Fastify()
      try {
        await registerSecurity(app)
        const near = repo.createNearSubmissionService({ bridge: new NEARBridge(), rpc: { chainId: async () => 'testnet' } as never, signer: null, config: { enabled: false, contractId: null, minBalanceYocto: 1n } })
        await app.register(async a => vaultRoutes(a, repo, near), { prefix: '/api/v1' }); await app.ready()
        await fn((role, method, url, payload) => app.inject({ method, url: `/api/v1${url}`, payload: payload as never, headers: { authorization: `Bearer ${app.jwt.sign({ sub: 'admin-1', roles: [role], exp: Math.floor(Date.now() / 1000) + 60 })}` } }))
      } finally { await app.close(); if (prev === undefined) delete process.env['JWT_SECRET']; else process.env['JWT_SECRET'] = prev }
    }

    it('only an ADMIN can read or change the egress policy; changes are audited', () => withApp(async call => {
      for (const role of ['OPERATOR', 'AUDITOR', 'VIEWER']) { expect((await call(role, 'GET', '/vault/llm-policy')).statusCode, role).toBe(403); expect((await call(role, 'POST', '/vault/llm-policy', { enabled: true })).statusCode, role).toBe(403) }
      expect(repo.llmPolicy.get().enabled).toBe(false)
      expect((await call('ADMIN', 'POST', '/vault/llm-policy', { dailyLimit: 0 })).statusCode).toBe(400)
      const r = await call('ADMIN', 'POST', '/vault/llm-policy', { enabled: true, dailyLimit: 5 })
      expect(r.statusCode).toBe(200); expect(r.json().data.policy).toMatchObject({ enabled: true, dailyLimit: 5, updatedBy: 'admin-1' })
      expect(JSON.stringify(repo.listAuditEvents({ limit: 50, offset: 0 }))).toMatch(/LLM_POLICY_CHANGED/)
      repo.gate.setStopped(true, 'admin-1')
      expect((await call('ADMIN', 'POST', '/vault/llm-policy', { enabled: false })).statusCode).toBe(200) // turning it off is always allowed
      expect((await call('ADMIN', 'POST', '/vault/llm-policy', { enabled: true })).statusCode).toBe(409)
    }))

    it('the NEAR probe is a registered READ tool: it leaves a CERBERUS decision and stays ADMIN-only', () => withApp(async call => {
      expect(repo.gate.listTools().find(t => t.id === 'near.probe')).toMatchObject({ effect: 'READ', requiresApproval: false, roles: ['ADMIN'] })
      expect((await call('OPERATOR', 'POST', '/vault/near/probe')).statusCode).toBe(403)
      expect((await call('ADMIN', 'POST', '/vault/near/probe')).statusCode).toBe(200)
      expect((repo.gate.listDecisions(10) as Array<{ tool: string; outcome: string }>).find(d => d.tool === 'near.probe')).toMatchObject({ outcome: 'PERMIT' })
      const g = (over: Record<string, unknown>) => repo.gate.authorize({ tool: 'near.probe', agent: 'HADES', role: 'ADMIN', source: 'API', params: {}, actor: 'x', ...over } as never)
      expect(g({ params: { accountId: 'x.testnet' } }).code).toBe('INVALID_PARAMS')
      expect(g({ role: 'OPERATOR' }).code).toBe('ROLE_NOT_PERMITTED')
      expect(g({ agent: 'CHARON' }).code).toBe('AGENT_NOT_PERMITTED')
    }))

    it('when CERBERUS denies the probe, nothing reaches the network', () => withApp(async call => {
      const chain = vi.fn(async () => 'testnet')
      const spy = vi.spyOn(repo.gate, 'authorize').mockReturnValue({ outcome: 'DENY', code: 'EMERGENCY_STOP', reason: 'x', decisionId: 'd' })
      const r = await call('ADMIN', 'POST', '/vault/near/probe')
      spy.mockRestore()
      expect(r.statusCode).toBe(403); expect(r.json().error.code).toBe('CERBERUS_DENIED'); expect(chain).not.toHaveBeenCalled()
    }))
  })
})
