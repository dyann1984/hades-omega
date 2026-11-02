import { createHash } from 'crypto'
import type { AgentName } from '../types/index.js'

/** What a tool does to the outside world. Approval requirements derive from this class, never from a per-tool flag. */
export type EffectClass = 'READ' | 'WRITE' | 'EXTERNAL' | 'FINANCIAL' | 'BLOCKCHAIN'
/** Who is asking. SYSTEM covers automation (CHRONOS, missions); it never carries more rights than a human role. */
export type ActorRole = 'ADMIN' | 'OPERATOR' | 'AUDITOR' | 'VIEWER' | 'DEMO' | 'SYSTEM'

export interface ToolDefinition {
  id: string
  description: string
  effect: EffectClass
  /** Agents that may invoke the tool. */
  agents: readonly AgentName[]
  /** Roles that may request the tool. */
  roles: readonly ActorRole[]
  /** The only argument names the tool accepts; anything else is rejected, not ignored. */
  allowedParams: readonly string[]
  /** Financial/blockchain amount argument (must be a positive finite number) and its fixed currency. */
  amountField?: string
  currency?: string
  currencyField?: string
  /** Hard per-operation ceiling. Above it the operation is denied, not escalated. */
  maxAmount?: number
  /** Cumulative ceiling per UTC day, counted over consumed approvals. */
  dailyBudget?: number
  /** Argument holding the destination; it must be on the tool's recipient allowlist. */
  recipientField?: string
  /** Extra argument validation; return an error message or null. */
  validate?(params: Record<string, unknown>): string | null
}

export const SENSITIVE_EFFECTS: readonly EffectClass[] = ['EXTERNAL', 'FINANCIAL', 'BLOCKCHAIN']
export const requiresHumanApproval = (effect: EffectClass): boolean => SENSITIVE_EFFECTS.includes(effect)

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>()
  constructor(defs: readonly ToolDefinition[] = []) { for (const d of defs) this.register(d) }
  register(def: ToolDefinition): void {
    if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/.test(def.id)) throw new Error(`Invalid tool id: ${def.id}`)
    if (this.tools.has(def.id)) throw new Error(`Tool already registered: ${def.id}`)
    if (SENSITIVE_EFFECTS.includes(def.effect) && def.roles.includes('VIEWER')) throw new Error('Sensitive tools cannot be requested by VIEWER')
    if (def.effect === 'FINANCIAL' && (!def.amountField || def.maxAmount === undefined || !def.currency || !def.recipientField)) throw new Error('Financial tools need amountField, maxAmount, currency and recipientField')
    this.tools.set(def.id, Object.freeze({ ...def }))
  }
  /** Exact, case-sensitive lookup: there are no aliases, so renaming a tool can only produce an unknown tool. */
  get(id: unknown): ToolDefinition | undefined { return typeof id === 'string' ? this.tools.get(id) : undefined }
  list(): ToolDefinition[] { return [...this.tools.values()] }
  /** Changes whenever any tool, permission or limit changes, which invalidates outstanding approvals. */
  hash(): string {
    const view = this.list().sort((a, b) => a.id.localeCompare(b.id)).map(t => ({ ...t, validate: undefined }))
    return createHash('sha256').update(canonicalJson(view)).digest('hex')
  }
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const o = value as Record<string, unknown>
  return `{${Object.keys(o).filter(k => o[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${canonicalJson(o[k])}`).join(',')}}`
}

const TESTNET_ACCOUNT = /^[a-z0-9]+(?:[._-][a-z0-9]+)*\.testnet$/

export const DEFAULT_TOOLS: readonly ToolDefinition[] = [
  { id: 'chronos.audit_chain_verify', description: 'Recompute the audit hash chain', effect: 'READ', agents: ['CERBERUS', 'HADES'], roles: ['ADMIN', 'OPERATOR', 'AUDITOR', 'SYSTEM'], allowedParams: [] },
  { id: 'chronos.cerberus_decision_report', description: 'Count CERBERUS decisions in a window', effect: 'READ', agents: ['CERBERUS', 'HADES'], roles: ['ADMIN', 'OPERATOR', 'AUDITOR', 'SYSTEM'], allowedParams: ['windowHours'],
    validate: p => (Number.isInteger(p['windowHours']) && (p['windowHours'] as number) >= 1 && (p['windowHours'] as number) <= 720) ? null : 'windowHours must be an integer 1-720' },
  { id: 'chronos.approvals_digest', description: 'Summarize recorded approval decisions', effect: 'READ', agents: ['CERBERUS', 'HADES'], roles: ['ADMIN', 'OPERATOR', 'AUDITOR', 'SYSTEM'], allowedParams: [] },
  { id: 'near.account_view', description: 'Read-only testnet account lookup', effect: 'READ', agents: ['HADES', 'PERSEPHONE'], roles: ['ADMIN', 'OPERATOR', 'AUDITOR'], allowedParams: ['accountId'],
    validate: p => (typeof p['accountId'] === 'string' && p['accountId'].length <= 64 && TESTNET_ACCOUNT.test(p['accountId'])) ? null : 'accountId must be a .testnet account' },
  { id: 'near.audit_hash_submit', description: 'Store an audit hash on NEAR testnet (zero deposit)', effect: 'BLOCKCHAIN', agents: ['HADES', 'PERSEPHONE'], roles: ['ADMIN', 'OPERATOR', 'SYSTEM'],
    allowedParams: ['network', 'signerId', 'receiverId', 'type', 'amountYocto', 'auditId', 'contentHash', 'operationType', 'agentName', 'decision', 'timestampMs', 'gas'],
    recipientField: 'receiverId',
    validate: p => {
      if (p['network'] !== 'testnet') return 'only testnet is allowed'
      if (p['type'] !== 'AUDIT_HASH' || p['amountYocto'] !== '0') return 'only zero-deposit AUDIT_HASH is allowed'
      if (typeof p['signerId'] !== 'string' || !TESTNET_ACCOUNT.test(p['signerId']) || typeof p['receiverId'] !== 'string' || !TESTNET_ACCOUNT.test(p['receiverId'])) return 'testnet accounts required'
      return typeof p['contentHash'] === 'string' && /^[0-9a-f]{64}$/.test(p['contentHash']) ? null : 'contentHash must be 64 hex characters'
    } },
  // No executor exists for payments yet. Registering it fixes its classification and limits so that any future
  // implementation is born behind approval, allowlist and budget checks.
  { id: 'payment.execute', description: 'Pay a vendor', effect: 'FINANCIAL', agents: ['PERSEPHONE'], roles: ['ADMIN', 'OPERATOR', 'SYSTEM'],
    allowedParams: ['recipient', 'amount', 'currency', 'reference'], amountField: 'amount', currency: 'MXN', currencyField: 'currency', maxAmount: 50_000, dailyBudget: 100_000, recipientField: 'recipient' },
]

export function createDefaultToolRegistry(): ToolRegistry { return new ToolRegistry(DEFAULT_TOOLS) }

/**
 * Argument names that only make sense for money movement or blockchain/credential handling. Operations classified as
 * internal must never carry them: that combination is an attempt to smuggle an external effect under a benign name.
 */
const HIDDEN_EFFECT_KEYS = /^(recipient\w*|receiver\w*|payee\w*|beneficiar\w*|destination\w*|signer\w*|iban|clabe|wallet\w*|deposit\w*|amountyocto|gas|privatekey|secretkey|seedphrase|mnemonic|methodname|contractid|accesskey|apikey|password|token)$/i

export function findHiddenEffectKeys(value: unknown, depth = 0, found: string[] = []): string[] {
  if (depth > 8 || value === null || typeof value !== 'object') return found
  if (Array.isArray(value)) { for (const v of value) findHiddenEffectKeys(v, depth + 1, found); return found }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (HIDDEN_EFFECT_KEYS.test(k)) found.push(k)
    findHiddenEffectKeys(v, depth + 1, found)
  }
  return found
}

const STRICT_AMOUNT_KEYS = /^(amount|totalamount)$/i
const LOOSE_AMOUNT_KEYS = /^(total|value|sum|price|cost|subtotal)$/i
/**
 * Every amount-like value in the payload (top level and nested), so an attacker cannot hide a large figure behind a
 * small one under a different key. Strict keys are returned as found (callers fail closed on non-numbers); loose keys
 * only when they are numeric, to avoid rejecting unrelated fields such as a text "value".
 */
export function collectAmounts(value: unknown, depth = 0, out: unknown[] = []): unknown[] {
  if (depth > 8 || value === null || typeof value !== 'object') return out
  if (Array.isArray(value)) { for (const v of value) collectAmounts(v, depth + 1, out); return out }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (STRICT_AMOUNT_KEYS.test(k)) out.push(v)
    else if (LOOSE_AMOUNT_KEYS.test(k) && (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))))) out.push(v)
    collectAmounts(v, depth + 1, out)
  }
  return out
}
