import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SqliteRepository } from './sqlite.js'
import { LlmGovernor, redact } from './llm-governor.js'
import { ClaudeAnthropicPlanner } from './planner/ClaudeAnthropicPlanner.js'
import { buildVaultStatus } from './vault.js'
import { NEARBridge } from '@hades/core'

const PLAN_JSON = JSON.stringify({ tasks: [{ id: 'a', title: 'Revisar contrato', description: 'd', assignedTo: 'MINOS', priority: 'P1', dependsOn: [], estimatedDuration: 20, justification: 'j' }], warnings: [] })
const intent = { title: 'Auditoría de proveedor', description: 'Contrato con ventas@proveedor.mx cuenta 123456789012 y clave sk-ant-api03-ABCDEFGHIJKLMNOP', context: { organizationId: 'org-secreta', budgetLimit: 987654, currency: 'MXN', deadline: null, priority: 'HIGH' as const, tags: ['etiqueta-interna'] } }

describe('LLM egress control (Anthropic)', () => {
  let dir: string, repo: SqliteRepository
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'llm-')); repo = new SqliteRepository(join(dir, 'h.sqlite'), join(dir, 'h.json')); await repo.init() })
  afterEach(async () => { repo.close(); await rm(dir, { recursive: true, force: true }) })

  const KEY = 'sk-ant-TEST-not-a-real-key-0001'
  const env = (over: Record<string, string> = {}): NodeJS.ProcessEnv => ({ ANTHROPIC_API_KEY: KEY, HADES_LLM_ENABLED: 'true', ...over })
  const governor = (e = env()) => new LlmGovernor({ gate: repo.gate, audit: ev => { repo.recordAuditEvent(ev) }, env: e })
  const fakeClient = (text = PLAN_JSON) => { const create = vi.fn(async () => ({ content: [{ type: 'text', text }] })); return { client: { messages: { create } } as never, create } }
  const planner = (g: LlmGovernor | null, client = fakeClient()) => { process.env['ANTHROPIC_API_KEY'] = KEY; return { p: new ClaudeAnthropicPlanner({ client: client.client, governor: () => g }), create: client.create } }
  afterEach(() => { delete process.env['ANTHROPIC_API_KEY'] })

  it('is off by default: with a key but no opt-in nothing is sent and the rule-based plan is used', async () => {
    const { p, create } = planner(governor(env({ HADES_LLM_ENABLED: 'false' })))
    const r = await p.plan(intent)
    expect(create).not.toHaveBeenCalled()
    expect(r.tasks.every(t => t.origin !== 'LLM_GENERATED')).toBe(true)
    expect(r.warnings.join(' ')).toMatch(/LLM_DISABLED/)
  })

  it('fails closed when no governor is attached (nothing can reach the provider unguarded)', async () => {
    const { p, create } = planner(null)
    const r = await p.plan(intent)
    expect(create).not.toHaveBeenCalled()
    expect(r.warnings.join(' ')).toMatch(/no governor attached/)
  })

  it('sends only minimized content: no budget, tags, organization, e-mail, long numbers or keys', async () => {
    const { p, create } = planner(governor())
    const r = await p.plan(intent)
    expect(create).toHaveBeenCalledTimes(1)
    const sent = JSON.stringify((create.mock.calls[0] as unknown[])[0])
    for (const leak of ['987654', 'etiqueta-interna', 'org-secreta', 'ventas@proveedor.mx', '123456789012', 'sk-ant-api03', 'ABCDEFGHIJKLMNOP', KEY]) expect(sent).not.toContain(leak)
    expect(sent).toContain('[correo]'); expect(sent).toContain('[clave]'); expect(sent).toContain('[numero]')
    expect(r.tasks.some(t => t.origin === 'LLM_GENERATED')).toBe(true) // AI output is labelled as such
  })

  it('records each call in the CERBERUS decisions and the audit chain by hash only, never the prompt or the answer', async () => {
    const { p } = planner(governor())
    await p.plan(intent)
    const decisions = repo.gate.listDecisions(10) as Array<{ tool: string; outcome: string; effect: string }>
    expect(decisions.find(d => d.tool === 'llm.plan')).toMatchObject({ outcome: 'PERMIT', effect: 'WRITE' })
    const events = JSON.stringify(repo.listAuditEvents({ limit: 200, offset: 0 }))
    expect(events).toMatch(/LLM_CALL/)
    expect(events).toMatch(/model=claude-haiku-5-5:in=\d+:out=\d+:redactions=\d/)
    for (const secret of ['Revisar contrato', 'Auditoría de proveedor', 'ventas@proveedor.mx', KEY]) expect(events).not.toContain(secret)
  })

  it('enforces the daily cap and falls back to the rules planner beyond it', async () => {
    const g = governor(env({ HADES_LLM_DAILY_LIMIT: '2' }))
    const { p, create } = planner(g)
    for (let i = 0; i < 4; i++) await p.plan({ ...intent, title: `Auditoría ${i}` })
    expect(create).toHaveBeenCalledTimes(2)
    expect(g.usageToday()).toBe(2)
    expect((await p.plan(intent)).warnings.join(' ')).toMatch(/DAILY_LIMIT/)
  })

  it('the emergency stop blocks the outbound call', async () => {
    repo.gate.setStopped(true, 'admin')
    const { p, create } = planner(governor())
    const r = await p.plan(intent)
    expect(create).not.toHaveBeenCalled()
    expect(r.warnings.join(' ')).toMatch(/GATE_DENIED/)
    repo.gate.setStopped(false, 'admin')
  })

  it('a provider error still falls back, is logged as ERROR, and does not leak the key', async () => {
    const create = vi.fn(async () => { throw new Error(`401 invalid x-api-key ${KEY}`) })
    const { p } = planner(governor(), { client: { messages: { create } } as never, create } as never)
    const r = await p.plan(intent)
    expect(r.tasks.length).toBeGreaterThan(0)
    expect(JSON.stringify(r.warnings)).not.toContain(KEY)
  })

  it('llm.plan only accepts hashes and sizes: raw prompt text in params is rejected', () => {
    const base = { tool: 'llm.plan', agent: 'HADES', role: 'SYSTEM' as const, source: 'MISSION' as const, actor: 't' }
    expect(repo.gate.authorize({ ...base, params: { model: 'm', promptSha256: 'a'.repeat(64), chars: 10 } }).outcome).toBe('PERMIT')
    expect(repo.gate.authorize({ ...base, params: { model: 'm', promptSha256: 'a'.repeat(64), chars: 10, prompt: 'texto' } }).code).toBe('INVALID_PARAMS')
    expect(repo.gate.authorize({ ...base, agent: 'CHARON', params: { model: 'm', promptSha256: 'a'.repeat(64), chars: 10 } }).code).toBe('AGENT_NOT_PERMITTED')
    expect(repo.gate.authorize({ ...base, role: 'VIEWER', params: { model: 'm', promptSha256: 'a'.repeat(64), chars: 10 } }).code).toBe('ROLE_NOT_PERMITTED')
  })

  it('the Vault says the truth about the provider state and never shows the key', () => {
    const svc = repo.createNearSubmissionService({ bridge: new NEARBridge(), rpc: {} as never, signer: null, config: { enabled: false, contractId: null, minBalanceYocto: 1n } })
    const off = buildVaultStatus({ repository: repo, near: svc, wsClients: () => 0, env: { ANTHROPIC_API_KEY: KEY } })
    expect(off.connections.find(c => c.id === 'planner')).toMatchObject({ state: 'DISABLED' })
    expect(off.connections.find(c => c.id === 'planner')!.detail).toMatch(/HADES_LLM_ENABLED/)
    const on = buildVaultStatus({ repository: repo, near: svc, wsClients: () => 0, env: { ANTHROPIC_API_KEY: KEY, HADES_LLM_ENABLED: 'true' } })
    expect(on.connections.find(c => c.id === 'planner')!.detail).toMatch(/llm\.plan/)
    expect(JSON.stringify(on)).not.toContain(KEY)
  })

  it('redact() masks keys, e-mails, hashes, accounts and long numbers', () => {
    const r = redact('a@b.com ed25519:' + 'A'.repeat(40) + ' ' + 'f'.repeat(64) + ' hades.testnet 4111 1111 1111 1111 texto normal')
    expect(r.text).toBe('[correo] [clave] [hash] [cuenta] [numero] texto normal')
    expect(r.count).toBe(5)
  })
})
