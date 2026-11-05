import { createHash } from 'node:crypto'
import type Database from 'better-sqlite3'
import { LLM_PROVIDER_HOST } from '@hades/core'
import type { CerberusGate } from './cerberus-gate.js'

export const LLM_TOOL = 'llm.plan'
const DAY_MS = 86_400_000
/** Conservative estimate: ~3 characters per token (real text is usually ~4), so the estimate errs on the side of caution. */
const CHARS_PER_TOKEN = 3

export interface LlmPolicy {
  enabled: boolean
  dailyLimit: number
  maxInputTokens: number
  maxOutputTokens: number
  /** Estimated spend cap per UTC day, in USD. The estimate reserves the worst case (all output tokens used). */
  dailyCostCapUsd: number
  /** Configurable price estimates (USD per million tokens). They are estimates, not billing data. */
  inputUsdPerMTok: number
  outputUsdPerMTok: number
  updatedBy: string | null
  updatedAt: number | null
}
export const DEFAULT_LLM_POLICY: LlmPolicy = { enabled: false, dailyLimit: 20, maxInputTokens: 400, maxOutputTokens: 1500, dailyCostCapUsd: 1, inputUsdPerMTok: 1, outputUsdPerMTok: 5, updatedBy: null, updatedAt: null }
const BOUNDS: Record<Exclude<keyof LlmPolicy, 'enabled' | 'updatedBy' | 'updatedAt'>, [number, number, boolean]> = {
  dailyLimit: [1, 1000, true], maxInputTokens: [50, 4000, true], maxOutputTokens: [50, 4000, true], dailyCostCapUsd: [0.01, 100, false], inputUsdPerMTok: [0, 1000, false], outputUsdPerMTok: [0, 1000, false],
}

export class LlmPolicyError extends Error { constructor(readonly code: 'INVALID_POLICY' | 'EMERGENCY_STOP', message: string) { super(message) } }

/** Egress policy and usage ledger. Persistent, administrator-controlled, disabled by default. The environment never enables egress. */
export class LlmPolicyStore {
  constructor(private readonly db: Database.Database, private readonly clock: () => number = Date.now) {
    db.exec(`CREATE TABLE IF NOT EXISTS llm_policy (id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL, daily_limit INTEGER NOT NULL, max_input_tokens INTEGER NOT NULL, max_output_tokens INTEGER NOT NULL, daily_cost_cap_usd REAL NOT NULL, input_usd_per_mtok REAL NOT NULL, output_usd_per_mtok REAL NOT NULL, updated_by TEXT, updated_at INTEGER);
      INSERT OR IGNORE INTO llm_policy VALUES (1,0,20,400,1500,1,1,5,NULL,NULL);
      CREATE TABLE IF NOT EXISTS llm_usage (decision_id TEXT PRIMARY KEY, ts INTEGER NOT NULL, est_cost_usd REAL NOT NULL, est_input_tokens INTEGER NOT NULL, max_output_tokens INTEGER NOT NULL);`)
  }

  get(): LlmPolicy {
    const r = this.db.prepare('SELECT * FROM llm_policy WHERE id=1').get() as Record<string, number | string | null>
    return { enabled: r['enabled'] === 1, dailyLimit: r['daily_limit'] as number, maxInputTokens: r['max_input_tokens'] as number, maxOutputTokens: r['max_output_tokens'] as number, dailyCostCapUsd: r['daily_cost_cap_usd'] as number, inputUsdPerMTok: r['input_usd_per_mtok'] as number, outputUsdPerMTok: r['output_usd_per_mtok'] as number, updatedBy: r['updated_by'] as string | null, updatedAt: r['updated_at'] as number | null }
  }
  isEnabled(): boolean { return this.get().enabled }

  /** Validates and stores a change. Callers must be ADMIN (enforced by the route). Enabling is refused during the emergency stop. */
  update(patch: Partial<Omit<LlmPolicy, 'updatedBy' | 'updatedAt'>>, actor: string, stopped: boolean): LlmPolicy {
    const next = { ...this.get() }
    for (const [k, v] of Object.entries(patch)) {
      if (k === 'enabled') { if (typeof v !== 'boolean') throw new LlmPolicyError('INVALID_POLICY', 'enabled must be true or false'); next.enabled = v; continue }
      const b = (BOUNDS as Record<string, [number, number, boolean]>)[k]
      if (!b) throw new LlmPolicyError('INVALID_POLICY', `unknown setting "${k}"`)
      if (typeof v !== 'number' || !Number.isFinite(v) || v < b[0] || v > b[1] || (b[2] && !Number.isInteger(v))) throw new LlmPolicyError('INVALID_POLICY', `${k} must be ${b[2] ? 'an integer' : 'a number'} between ${b[0]} and ${b[1]}`)
      ;(next as unknown as Record<string, number>)[k] = v
    }
    if (next.enabled && stopped) throw new LlmPolicyError('EMERGENCY_STOP', 'egress cannot be enabled while the emergency stop is active')
    this.db.prepare('UPDATE llm_policy SET enabled=?,daily_limit=?,max_input_tokens=?,max_output_tokens=?,daily_cost_cap_usd=?,input_usd_per_mtok=?,output_usd_per_mtok=?,updated_by=?,updated_at=? WHERE id=1')
      .run(next.enabled ? 1 : 0, next.dailyLimit, next.maxInputTokens, next.maxOutputTokens, next.dailyCostCapUsd, next.inputUsdPerMTok, next.outputUsdPerMTok, actor, this.clock())
    return this.get()
  }

  private dayStart(): number { return Math.floor(this.clock() / DAY_MS) * DAY_MS }
  usageToday(): { calls: number; estCostUsd: number } {
    const r = this.db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(est_cost_usd),0) AS c FROM llm_usage WHERE ts>=?').get(this.dayStart()) as { n: number; c: number }
    return { calls: r.n, estCostUsd: r.c }
  }
  recordUsage(decisionId: string, estCostUsd: number, estInputTokens: number, maxOutputTokens: number): void {
    this.db.prepare('INSERT INTO llm_usage VALUES (?,?,?,?,?)').run(decisionId, this.clock(), estCostUsd, estInputTokens, maxOutputTokens)
  }
}

export type LlmDenyCode = 'POLICY_DISABLED' | 'NO_API_KEY' | 'PROVIDER_NOT_ALLOWED' | 'DAILY_LIMIT' | 'COST_LIMIT' | 'INPUT_EMPTY' | 'GATE_DENIED'
export type LlmRequest =
  | { allowed: true; content: string; redactions: number; decisionId: string; model: string; maxOutputTokens: number; estCostUsd: number }
  | { allowed: false; code: LlmDenyCode; reason: string }

/** Patterns that must never leave the server: provider/NEAR keys, e-mail addresses, long hex digests, NEAR accounts, long digit runs (accounts, phones, cards), URLs with credentials. */
const REDACTIONS: Array<[RegExp, string]> = [
  [/\bsk-[A-Za-z0-9_-]{10,}/g, '[clave]'],
  [/\bed25519:[A-Za-z0-9]{20,}/g, '[clave]'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, '[clave]'],
  [/\b[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@\S+/gi, '[url]'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[correo]'],
  [/\b[0-9a-fA-F]{32,}\b/g, '[hash]'],
  [/\b[a-z0-9_-]+(?:\.[a-z0-9_-]+)*\.(?:near|testnet)\b/gi, '[cuenta]'],
  [/\b(?:[A-Z]{4}\d{6}[A-Z0-9]{3}|[A-Z]{3,4}\d{6}[A-Z\d]{3})\b/g, '[rfc]'],
  [/\b\d[\d -]{7,}\d\b/g, '[numero]'],
]

export function redact(text: string): { text: string; count: number } {
  let count = 0
  let out = text
  for (const [re, label] of REDACTIONS) out = out.replace(re, () => { count++; return label })
  return { text: out, count }
}

/**
 * Single choke point for every call to the LLM provider. Order: administrator policy, provider key, allowed provider host,
 * minimization, daily quota, estimated cost, CERBERUS gate (agent/role/params/stop/policy), one-time grant. The prompt is
 * never stored: audit and gate keep only its SHA-256, sizes and cost estimate.
 */
export class LlmGovernor {
  constructor(private readonly deps: {
    gate: CerberusGate
    policy: LlmPolicyStore
    audit: (e: { actor: string; action: string; result: string; correlationId?: string }) => void
    env?: NodeJS.ProcessEnv
    keySource?: () => string | undefined
  }) {}

  private get env(): NodeJS.ProcessEnv { return this.deps.env ?? process.env }
  get policy(): LlmPolicyStore { return this.deps.policy }
  /** Server-only: never serialize or log this value. */
  providerKey(): string | undefined { return this.deps.keySource ? this.deps.keySource() : this.env['ANTHROPIC_API_KEY'] }
  keyConfigured(): boolean { return !!this.providerKey() }

  /** True only when no base-URL override points anywhere but the allowed provider over HTTPS. */
  providerAllowed(): boolean {
    const raw = this.env['ANTHROPIC_BASE_URL']
    if (!raw) return true
    try { const u = new URL(raw); return u.protocol === 'https:' && u.hostname === LLM_PROVIDER_HOST && !u.username && !u.password && (u.port === '' || u.port === '443') } catch { return false }
  }

  private deny(code: LlmDenyCode, reason: string, actor: string): LlmRequest {
    this.deps.audit({ actor, action: 'LLM_CALL_DENIED', result: code })
    return { allowed: false, code, reason }
  }

  request(raw: string, model: string, actor = 'system:planner'): LlmRequest {
    const pol = this.deps.policy.get()
    if (!pol.enabled) return this.deny('POLICY_DISABLED', 'El egreso a IA generativa no está autorizado por un administrador.', actor)
    if (!this.keyConfigured()) return this.deny('NO_API_KEY', 'No hay clave del proveedor configurada.', actor)
    if (!this.providerAllowed()) return this.deny('PROVIDER_NOT_ALLOWED', `Solo se permite enviar a https://${LLM_PROVIDER_HOST}.`, actor)
    const red = redact(raw)
    const content = red.text.slice(0, pol.maxInputTokens * CHARS_PER_TOKEN)
    if (!content.trim()) return this.deny('INPUT_EMPTY', 'No queda contenido que enviar tras minimizar.', actor)
    const estInputTokens = Math.max(1, Math.ceil(content.length / CHARS_PER_TOKEN))
    const estCostUsd = (estInputTokens * pol.inputUsdPerMTok + pol.maxOutputTokens * pol.outputUsdPerMTok) / 1_000_000
    const used = this.deps.policy.usageToday()
    if (used.calls >= pol.dailyLimit) return this.deny('DAILY_LIMIT', `Se alcanzó la cuota diaria de ${pol.dailyLimit} llamadas.`, actor)
    if (used.estCostUsd + estCostUsd > pol.dailyCostCapUsd) return this.deny('COST_LIMIT', `Se superaría el tope diario estimado de ${pol.dailyCostCapUsd} USD.`, actor)
    const params = { provider: LLM_PROVIDER_HOST, model, promptSha256: createHash('sha256').update(content).digest('hex'), chars: content.length, estInputTokens, maxOutputTokens: pol.maxOutputTokens }
    const verdict = this.deps.gate.authorize({ tool: LLM_TOOL, agent: 'HADES', role: 'SYSTEM', source: 'MISSION', params, actor })
    if (verdict.outcome !== 'PERMIT' || !verdict.grantId) return this.deny('GATE_DENIED', `CERBERUS no autorizó la llamada (${verdict.code}).`, actor)
    try { this.deps.gate.consumeGrant(verdict.grantId, LLM_TOOL, params) } catch (e) { return this.deny('GATE_DENIED', `CERBERUS rechazó el permiso (${e instanceof Error ? e.message : 'error'}).`, actor) }
    this.deps.policy.recordUsage(verdict.decisionId, estCostUsd, estInputTokens, pol.maxOutputTokens)
    return { allowed: true, content, redactions: red.count, decisionId: verdict.decisionId, model, maxOutputTokens: pol.maxOutputTokens, estCostUsd }
  }

  /** Records what happened with an authorized call. Only sizes, status and estimated cost: never the prompt or the response text. */
  report(req: Extract<LlmRequest, { allowed: true }>, outcome: 'OK' | 'ERROR' | 'INVALID_RESPONSE', outputChars: number, actor = 'system:planner'): void {
    this.deps.audit({ actor, action: 'LLM_CALL', result: `${outcome}:provider=${LLM_PROVIDER_HOST}:model=${req.model}:in=${req.content.length}:out=${outputChars}:redactions=${req.redactions}:estUsd=${req.estCostUsd.toFixed(6)}`, correlationId: req.decisionId })
  }
}

let current: LlmGovernor | null = null
/** Wired once at boot, after the repository (and therefore the gate) exists. Until then no call to the provider is possible. */
export function attachLlmGovernor(g: LlmGovernor | null): void { current = g }
export function getLlmGovernor(): LlmGovernor | null { return current }
