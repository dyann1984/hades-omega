import { createHash } from 'node:crypto'
import type { CerberusGate } from './cerberus-gate.js'

export const LLM_TOOL = 'llm.plan'
const DAY_MS = 86_400_000

export interface LlmGovernorConfig { enabled: boolean; keyConfigured: boolean; dailyLimit: number; maxChars: number }
export type LlmDenyCode = 'LLM_DISABLED' | 'NO_API_KEY' | 'DAILY_LIMIT' | 'INPUT_EMPTY' | 'GATE_DENIED'
export type LlmRequest =
  | { allowed: true; content: string; redactions: number; decisionId: string; model: string }
  | { allowed: false; code: LlmDenyCode; reason: string }

/** Patterns that must never leave the server: provider/NEAR keys, e-mail addresses, long hex digests, long digit runs (accounts, phones, cards). */
const REDACTIONS: Array<[RegExp, string]> = [
  [/\bsk-[A-Za-z0-9_-]{10,}/g, '[clave]'],
  [/\bed25519:[A-Za-z0-9]{20,}/g, '[clave]'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, '[clave]'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[correo]'],
  [/\b[0-9a-fA-F]{32,}\b/g, '[hash]'],
  [/\b[a-z0-9_-]+(?:\.[a-z0-9_-]+)*\.(?:near|testnet)\b/gi, '[cuenta]'],
  [/\b\d[\d -]{7,}\d\b/g, '[numero]'],
]

export function redact(text: string): { text: string; count: number } {
  let count = 0
  let out = text
  for (const [re, label] of REDACTIONS) out = out.replace(re, () => { count++; return label })
  return { text: out, count }
}

/**
 * Single choke point for every call to the LLM provider. Order: explicit opt-in, key present, daily cap, CERBERUS gate
 * (agent/role/params, emergency stop), one-time grant. The prompt itself is never stored: audit and gate keep only its SHA-256 and length.
 */
export class LlmGovernor {
  constructor(private readonly deps: {
    gate: CerberusGate
    audit: (e: { actor: string; action: string; result: string; correlationId?: string }) => void
    env?: NodeJS.ProcessEnv
    clock?: () => number
  }) {}

  private get env(): NodeJS.ProcessEnv { return this.deps.env ?? process.env }

  config(): LlmGovernorConfig {
    const limit = Number(this.env['HADES_LLM_DAILY_LIMIT'] ?? 20)
    const maxChars = Number(this.env['HADES_LLM_MAX_INPUT_CHARS'] ?? 1200)
    return {
      enabled: this.env['HADES_LLM_ENABLED'] === 'true',
      keyConfigured: typeof this.env['ANTHROPIC_API_KEY'] === 'string' && this.env['ANTHROPIC_API_KEY'].length > 0,
      dailyLimit: Number.isInteger(limit) && limit >= 1 && limit <= 1000 ? limit : 20,
      maxChars: Number.isInteger(maxChars) && maxChars >= 200 && maxChars <= 4000 ? maxChars : 1200,
    }
  }

  usageToday(): number { return this.deps.gate.countPermits(LLM_TOOL, Math.floor((this.deps.clock ?? Date.now)() / DAY_MS) * DAY_MS) }

  private deny(code: LlmDenyCode, reason: string, actor: string): LlmRequest {
    this.deps.audit({ actor, action: 'LLM_CALL_DENIED', result: `${code}` })
    return { allowed: false, code, reason }
  }

  /** Decide whether one outbound call may happen. `raw` is minimized (redacted, truncated) before it is hashed or returned. */
  request(raw: string, model: string, actor = 'system:planner'): LlmRequest {
    const cfg = this.config()
    if (!cfg.enabled) return this.deny('LLM_DISABLED', 'El uso de IA generativa está desactivado (HADES_LLM_ENABLED no es "true").', actor)
    if (!cfg.keyConfigured) return this.deny('NO_API_KEY', 'No hay clave del proveedor configurada.', actor)
    const red = redact(raw)
    const content = red.text.slice(0, cfg.maxChars)
    if (!content.trim()) return this.deny('INPUT_EMPTY', 'No queda contenido que enviar tras minimizar.', actor)
    if (this.usageToday() >= cfg.dailyLimit) return this.deny('DAILY_LIMIT', `Se alcanzó el límite diario de ${cfg.dailyLimit} llamadas.`, actor)
    const params = { model, promptSha256: createHash('sha256').update(content).digest('hex'), chars: content.length }
    const verdict = this.deps.gate.authorize({ tool: LLM_TOOL, agent: 'HADES', role: 'SYSTEM', source: 'MISSION', params, actor })
    if (verdict.outcome !== 'PERMIT' || !verdict.grantId) return this.deny('GATE_DENIED', `CERBERUS no autorizó la llamada (${verdict.code}).`, actor)
    try { this.deps.gate.consumeGrant(verdict.grantId, LLM_TOOL, params) } catch (e) { return this.deny('GATE_DENIED', `CERBERUS rechazó el permiso (${e instanceof Error ? e.message : 'error'}).`, actor) }
    return { allowed: true, content, redactions: red.count, decisionId: verdict.decisionId, model }
  }

  /** Records what happened with an authorized call. Only sizes and status: never the prompt or the response text. */
  report(req: Extract<LlmRequest, { allowed: true }>, outcome: 'OK' | 'ERROR' | 'INVALID_RESPONSE', outputChars: number, actor = 'system:planner'): void {
    this.deps.audit({ actor, action: 'LLM_CALL', result: `${outcome}:model=${req.model}:in=${req.content.length}:out=${outputChars}:redactions=${req.redactions}`, correlationId: req.decisionId })
  }
}

let current: LlmGovernor | null = null
/** Wired once at boot, after the repository (and therefore the gate) exists. Until then no call to the provider is possible. */
export function attachLlmGovernor(g: LlmGovernor | null): void { current = g }
export function getLlmGovernor(): LlmGovernor | null { return current }
