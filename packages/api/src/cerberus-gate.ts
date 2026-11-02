import type Database from 'better-sqlite3'
import { createHash, randomUUID } from 'node:crypto'
import { canonicalJson, requiresHumanApproval, type ActorRole, type ExecutionGate, type ToolRegistry } from '@hades/core'

export type GateSource = 'API' | 'AGENT' | 'CHRONOS' | 'MISSION' | 'NEAR'
export interface AuthorizeRequest {
  tool: unknown
  agent: string
  role: ActorRole
  source: GateSource
  params: unknown
  actor: string
  correlationId?: string
  /** Approval to consume. Required (after the first ESCALATE) for sensitive tools. */
  approvalId?: string
}
export type GateCode =
  | 'OK' | 'UNKNOWN_TOOL' | 'INVALID_PARAMS' | 'EMERGENCY_STOP' | 'AGENT_NOT_PERMITTED' | 'ROLE_NOT_PERMITTED'
  | 'INVALID_AMOUNT' | 'AMOUNT_LIMIT' | 'RECIPIENT_NOT_ALLOWED' | 'BUDGET_EXCEEDED'
  | 'APPROVAL_REQUIRED' | 'APPROVAL_PENDING' | 'APPROVAL_NOT_FOUND' | 'APPROVAL_REJECTED' | 'APPROVAL_EXPIRED'
  | 'APPROVAL_REUSED' | 'PARAMS_ALTERED' | 'POLICY_CHANGED'
export interface GateDecision {
  outcome: 'PERMIT' | 'DENY' | 'ESCALATE'
  code: GateCode
  reason: string
  decisionId: string
  approvalId?: string
  /** Present on PERMIT: single-use proof an executor must present (see consumeGrant). */
  grantId?: string
}
export class GateError extends Error { constructor(readonly code: string, detail?: string) { super(detail ? `${code}: ${detail}` : code) } }

const MAX_PARAMS_BYTES = 16_384
const MAX_DEPTH = 6
const PENDING_TTL_MS = 24 * 3_600_000
const MAX_APPROVAL_TTL_MS = 15 * 60_000
const GRANT_TTL_MS = 120_000
const DAY_MS = 86_400_000

interface ApprovalRow { id: string; tool: string; agent: string; params_hash: string; policy_hash: string; requested_by: string; source: string; status: 'PENDING' | 'APPROVED' | 'REJECTED'; decided_by: string | null; decided_at: number | null; justification: string | null; created_at: number; request_expires_at: number; expires_at: number | null; consumed_at: number | null; amount: number | null; currency: string | null }

export const GATE_MIGRATION_SQL = `
  CREATE TABLE IF NOT EXISTS near_security (id INTEGER PRIMARY KEY CHECK(id=1), stopped INTEGER NOT NULL);
  INSERT OR IGNORE INTO near_security VALUES (1,0);
  CREATE TABLE IF NOT EXISTS cerberus_decisions (id TEXT PRIMARY KEY, ts INTEGER NOT NULL, tool TEXT NOT NULL, agent TEXT NOT NULL, role TEXT NOT NULL, source TEXT NOT NULL, effect TEXT, params_hash TEXT, outcome TEXT NOT NULL, code TEXT NOT NULL, reason TEXT NOT NULL, actor TEXT NOT NULL, correlation_id TEXT, approval_id TEXT, grant_used_at INTEGER);
  CREATE INDEX IF NOT EXISTS cerberus_decisions_ts ON cerberus_decisions(ts DESC);
  CREATE TABLE IF NOT EXISTS cerberus_approvals (id TEXT PRIMARY KEY, tool TEXT NOT NULL, agent TEXT NOT NULL, params_hash TEXT NOT NULL, policy_hash TEXT NOT NULL, requested_by TEXT NOT NULL, source TEXT NOT NULL, status TEXT NOT NULL, decided_by TEXT, decided_at INTEGER, justification TEXT, created_at INTEGER NOT NULL, request_expires_at INTEGER NOT NULL, expires_at INTEGER, consumed_at INTEGER, amount REAL, currency TEXT);
  CREATE INDEX IF NOT EXISTS cerberus_approvals_tool ON cerberus_approvals(tool, consumed_at);
  CREATE TABLE IF NOT EXISTS cerberus_recipients (tool TEXT NOT NULL, recipient TEXT NOT NULL, added_by TEXT NOT NULL, added_at INTEGER NOT NULL, PRIMARY KEY (tool, recipient));`

/**
 * The single authorization boundary. Every executor of an external effect (CHRONOS jobs, agents, NEAR, API routes)
 * must obtain a PERMIT here. Tools are looked up by exact id in a registry, so a renamed operation is simply unknown.
 * All state (stop flag, approvals, budgets, allowlists, decisions) lives in the database, not in process memory.
 */
export class CerberusGate implements ExecutionGate {
  constructor(
    private readonly db: Database.Database,
    private readonly registry: ToolRegistry,
    private readonly opts: { policyHash: () => string; audit: (e: { actor: string; action: string; result: string; correlationId?: string }) => void; clock?: () => number },
  ) { db.exec(GATE_MIGRATION_SQL) }

  private now(): number { return (this.opts.clock ?? Date.now)() }
  get tools(): ToolRegistry { return this.registry }
  private policyHash(): string { return createHash('sha256').update(`${this.opts.policyHash()}|${this.registry.hash()}`).digest('hex') }

  isStopped(): boolean { return (this.db.prepare('SELECT stopped FROM near_security WHERE id=1').get() as { stopped: number }).stopped === 1 }
  setStopped(stopped: boolean, actor: string): void {
    this.db.transaction(() => {
      this.db.prepare('UPDATE near_security SET stopped=? WHERE id=1').run(stopped ? 1 : 0)
      this.opts.audit({ actor, action: stopped ? 'EMERGENCY_STOP' : 'EMERGENCY_CLEAR', result: 'OK' })
    })()
  }

  addRecipient(tool: string, recipient: string, actor: string): void {
    const def = this.registry.get(tool)
    if (!def?.recipientField) throw new GateError('NO_RECIPIENT_FIELD', 'tool does not take recipients')
    if (typeof recipient !== 'string' || !recipient || recipient.length > 128) throw new GateError('INVALID_RECIPIENT')
    // NEAR destinations must be well-formed testnet accounts; a mainnet or malformed id can never be allow-listed.
    if (tool.startsWith('near.') && !/^(?:[a-z\d]+[-_])*[a-z\d]+(?:\.(?:[a-z\d]+[-_])*[a-z\d]+)*\.testnet$/.test(recipient)) throw new GateError('INVALID_RECIPIENT', 'NEAR recipients must be valid .testnet accounts')
    this.db.prepare('INSERT OR IGNORE INTO cerberus_recipients VALUES (?,?,?,?)').run(tool, recipient, actor, this.now())
    this.opts.audit({ actor, action: 'CERBERUS_RECIPIENT_ADDED', result: `${tool}:${recipient}` })
  }
  removeRecipient(tool: string, recipient: string, actor: string): void {
    this.db.prepare('DELETE FROM cerberus_recipients WHERE tool=? AND recipient=?').run(tool, recipient)
    this.opts.audit({ actor, action: 'CERBERUS_RECIPIENT_REMOVED', result: `${tool}:${recipient}` })
  }
  listRecipients(tool?: string): Array<{ tool: string; recipient: string; addedBy: string; addedAt: number }> {
    const rows = tool ? this.db.prepare('SELECT * FROM cerberus_recipients WHERE tool=? ORDER BY added_at').all(tool) : this.db.prepare('SELECT * FROM cerberus_recipients ORDER BY tool, added_at').all()
    return (rows as Array<{ tool: string; recipient: string; added_by: string; added_at: number }>).map(r => ({ tool: r.tool, recipient: r.recipient, addedBy: r.added_by, addedAt: r.added_at }))
  }

  listTools(): Array<{ id: string; description: string; effect: string; agents: readonly string[]; roles: readonly string[]; requiresApproval: boolean; maxAmount?: number; dailyBudget?: number }> {
    return this.registry.list().map(t => ({ id: t.id, description: t.description, effect: t.effect, agents: t.agents, roles: t.roles, requiresApproval: requiresHumanApproval(t.effect), ...(t.maxAmount !== undefined ? { maxAmount: t.maxAmount } : {}), ...(t.dailyBudget !== undefined ? { dailyBudget: t.dailyBudget } : {}) }))
  }
  listDecisions(limit = 50): unknown[] { return this.db.prepare('SELECT id,ts,tool,agent,role,source,effect,outcome,code,reason,actor,correlation_id AS correlationId,approval_id AS approvalId FROM cerberus_decisions ORDER BY ts DESC, rowid DESC LIMIT ?').all(limit) }
  listApprovals(status?: string): unknown[] {
    const rows = (status ? this.db.prepare('SELECT * FROM cerberus_approvals WHERE status=? ORDER BY created_at DESC LIMIT 100').all(status) : this.db.prepare('SELECT * FROM cerberus_approvals ORDER BY created_at DESC LIMIT 100').all()) as ApprovalRow[]
    return rows.map(r => ({ id: r.id, tool: r.tool, agent: r.agent, paramsHash: r.params_hash, requestedBy: r.requested_by, source: r.source, status: r.status, decidedBy: r.decided_by, decidedAt: r.decided_at, justification: r.justification, createdAt: r.created_at, requestExpiresAt: r.request_expires_at, expiresAt: r.expires_at, consumedAt: r.consumed_at, amount: r.amount, currency: r.currency }))
  }

  /** Decide a pending approval. Callers must be ADMIN; the requester may not approve their own request. */
  decide(approvalId: string, status: 'APPROVED' | 'REJECTED', actor: string, justification: string, ttlMs = MAX_APPROVAL_TTL_MS): void {
    this.db.transaction(() => {
      const now = this.now()
      const row = this.db.prepare('SELECT * FROM cerberus_approvals WHERE id=?').get(approvalId) as ApprovalRow | undefined
      if (!row) throw new GateError('APPROVAL_NOT_FOUND')
      if (row.status !== 'PENDING') throw new GateError('APPROVAL_ALREADY_DECIDED')
      if (row.request_expires_at <= now) throw new GateError('APPROVAL_EXPIRED')
      // Automation (agents, CHRONOS, missions) can never approve itself; a human admin acting through the API may.
      if (row.requested_by === actor && row.source !== 'API' && row.source !== 'NEAR') throw new GateError('SELF_APPROVAL_FORBIDDEN', 'requester cannot approve their own request')
      if (typeof justification !== 'string' || justification.trim().length < 3) throw new GateError('JUSTIFICATION_REQUIRED')
      if (!Number.isFinite(ttlMs) || ttlMs <= 0 || ttlMs > MAX_APPROVAL_TTL_MS) throw new GateError('INVALID_EXPIRY', 'approval validity is limited to 15 minutes')
      // The approval is only valid for the policy and tool configuration in force right now.
      if (row.policy_hash !== this.policyHash()) throw new GateError('POLICY_CHANGED')
      this.db.prepare('UPDATE cerberus_approvals SET status=?, decided_by=?, decided_at=?, justification=?, expires_at=? WHERE id=? AND status=\'PENDING\'').run(status, actor, now, justification.trim(), status === 'APPROVED' ? now + ttlMs : null, approvalId)
      this.opts.audit({ actor, action: 'CERBERUS_APPROVAL', result: `${status}:${row.tool}:${approvalId}`, correlationId: approvalId })
    })()
  }

  authorize(req: AuthorizeRequest): GateDecision {
    return this.db.transaction(() => {
      const decision = this.evaluate(req)
      this.record(req, decision)
      return decision
    })()
  }

  /** Called by executors right before the effect. Burns the grant; works once, only for identical params, briefly. */
  consumeGrant(grantId: string, tool: string, params: unknown): void {
    this.db.transaction(() => {
      const now = this.now()
      const row = this.db.prepare('SELECT * FROM cerberus_decisions WHERE id=?').get(grantId) as { ts: number; tool: string; params_hash: string; outcome: string; agent: string; grant_used_at: number | null } | undefined
      if (!row || row.outcome !== 'PERMIT') throw new GateError('GRANT_INVALID')
      if (row.tool !== tool) throw new GateError('GRANT_TOOL_MISMATCH')
      if (row.grant_used_at !== null) throw new GateError('GRANT_REUSED')
      if (now - row.ts > GRANT_TTL_MS) throw new GateError('GRANT_EXPIRED')
      if (row.params_hash !== this.paramsHash(tool, row.agent, params)) throw new GateError('GRANT_PARAMS_ALTERED')
      // The stop switch is re-checked at execution time: it must also stop operations authorized a moment earlier.
      if (this.isStopped()) throw new GateError('EMERGENCY_STOP')
      const changed = this.db.prepare('UPDATE cerberus_decisions SET grant_used_at=? WHERE id=? AND grant_used_at IS NULL').run(now, grantId)
      if (changed.changes !== 1) throw new GateError('GRANT_REUSED')
    })()
  }

  private paramsHash(tool: string, agent: string, params: unknown): string { return createHash('sha256').update(canonicalJson({ tool, agent, params })).digest('hex') }

  private checkShape(params: unknown): string | null {
    if (params === null || typeof params !== 'object' || Array.isArray(params) || Object.getPrototypeOf(params) !== Object.prototype && Object.getPrototypeOf(params) !== null) return 'params must be a plain object'
    let size: number
    try { size = JSON.stringify(params).length } catch { return 'params must be JSON-serializable' }
    if (size > MAX_PARAMS_BYTES) return 'params too large'
    const walk = (v: unknown, depth: number): string | null => {
      if (depth > MAX_DEPTH) return 'params nested too deeply'
      if (v === null || typeof v !== 'object') return typeof v === 'function' || typeof v === 'symbol' || typeof v === 'bigint' || (typeof v === 'number' && !Number.isFinite(v)) ? 'params contain a non-JSON value' : null
      for (const k of Object.keys(v)) { if (k === '__proto__' || k === 'constructor' || k === 'prototype') return 'forbidden key'; const e = walk((v as Record<string, unknown>)[k], depth + 1); if (e) return e }
      return null
    }
    return walk(params, 0)
  }

  private evaluate(req: AuthorizeRequest): GateDecision {
    const id = randomUUID()
    const deny = (code: GateCode, reason: string): GateDecision => ({ outcome: 'DENY', code, reason, decisionId: id })
    const tool = this.registry.get(req.tool)
    if (!tool) return deny('UNKNOWN_TOOL', 'tool is not registered; unknown tools are denied')
    const shape = this.checkShape(req.params)
    if (shape) return deny('INVALID_PARAMS', shape)
    const params = req.params as Record<string, unknown>
    if (this.isStopped() && tool.effect !== 'READ') return deny('EMERGENCY_STOP', 'emergency stop is active: sensitive actions are suspended')
    if (!tool.agents.includes(req.agent as never)) return deny('AGENT_NOT_PERMITTED', `agent ${req.agent} may not use ${tool.id}`)
    if (!tool.roles.includes(req.role)) return deny('ROLE_NOT_PERMITTED', `role ${req.role} may not use ${tool.id}`)
    const extra = Object.keys(params).find(k => !tool.allowedParams.includes(k))
    if (extra) return deny('INVALID_PARAMS', `unexpected argument "${extra}"`)
    const invalid = tool.validate?.(params)
    if (invalid) return deny('INVALID_PARAMS', invalid)

    let amount: number | null = null
    if (tool.amountField) {
      const raw = params[tool.amountField]
      if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return deny('INVALID_AMOUNT', 'amount must be a positive finite number')
      if (tool.currencyField && params[tool.currencyField] !== tool.currency) return deny('INVALID_AMOUNT', `currency must be ${tool.currency}`)
      if (tool.maxAmount !== undefined && raw > tool.maxAmount) return deny('AMOUNT_LIMIT', `amount exceeds the ${tool.maxAmount} ${tool.currency ?? ''} per-operation limit`)
      amount = raw
    }
    if (tool.recipientField) {
      const r = params[tool.recipientField]
      const allowed = typeof r === 'string' && this.db.prepare('SELECT 1 FROM cerberus_recipients WHERE tool=? AND recipient=?').get(tool.id, r)
      if (!allowed) return deny('RECIPIENT_NOT_ALLOWED', 'recipient is not on the allowlist for this tool')
    }
    const now = this.now()
    if (tool.dailyBudget !== undefined && amount !== null) {
      const dayStart = Math.floor(now / DAY_MS) * DAY_MS
      const spent = (this.db.prepare('SELECT COALESCE(SUM(amount),0) AS s FROM cerberus_approvals WHERE tool=? AND consumed_at>=?').get(tool.id, dayStart) as { s: number }).s
      if (spent + amount > tool.dailyBudget) return deny('BUDGET_EXCEEDED', `daily budget of ${tool.dailyBudget} would be exceeded (spent ${spent})`)
    }
    if (!requiresHumanApproval(tool.effect)) return { outcome: 'PERMIT', code: 'OK', reason: 'permitted by tool policy', decisionId: id, grantId: id }

    // Sensitive effect: a human approval bound to this exact tool, agent, parameters and policy is mandatory.
    const paramsHash = this.paramsHash(tool.id, req.agent, params)
    const policyHash = this.policyHash()
    if (!req.approvalId) {
      const existing = this.db.prepare("SELECT id FROM cerberus_approvals WHERE params_hash=? AND status='PENDING' AND request_expires_at>? AND policy_hash=?").get(paramsHash, now, policyHash) as { id: string } | undefined
      const approvalId = existing?.id ?? randomUUID()
      if (!existing) this.db.prepare('INSERT INTO cerberus_approvals (id,tool,agent,params_hash,policy_hash,requested_by,source,status,created_at,request_expires_at,amount,currency) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(approvalId, tool.id, req.agent, paramsHash, policyHash, req.actor, req.source, 'PENDING', now, now + PENDING_TTL_MS, amount, tool.currency ?? null)
      return { outcome: 'ESCALATE', code: 'APPROVAL_REQUIRED', reason: 'human approval required before execution', decisionId: id, approvalId }
    }
    const row = this.db.prepare('SELECT * FROM cerberus_approvals WHERE id=?').get(req.approvalId) as ApprovalRow | undefined
    if (!row) return deny('APPROVAL_NOT_FOUND', 'approval does not exist')
    if (row.consumed_at !== null) return deny('APPROVAL_REUSED', 'approval was already used')
    if (row.params_hash !== paramsHash || row.tool !== tool.id || row.agent !== req.agent) return deny('PARAMS_ALTERED', 'operation differs from what was approved')
    if (row.status === 'REJECTED') return deny('APPROVAL_REJECTED', 'approval was rejected')
    if (row.status === 'PENDING') return row.request_expires_at <= now ? deny('APPROVAL_EXPIRED', 'approval request expired') : { outcome: 'ESCALATE', code: 'APPROVAL_PENDING', reason: 'still waiting for a human decision', decisionId: id, approvalId: row.id }
    if (row.expires_at === null || row.expires_at <= now) return deny('APPROVAL_EXPIRED', 'approval expired')
    if (row.policy_hash !== policyHash) return deny('POLICY_CHANGED', 'policy or tool configuration changed since approval')
    const used = this.db.prepare('UPDATE cerberus_approvals SET consumed_at=? WHERE id=? AND consumed_at IS NULL').run(now, row.id)
    if (used.changes !== 1) return deny('APPROVAL_REUSED', 'approval was already used')
    return { outcome: 'PERMIT', code: 'OK', reason: 'approved by a human and consumed', decisionId: id, approvalId: row.id, grantId: id }
  }

  private record(req: AuthorizeRequest, d: GateDecision): void {
    const tool = this.registry.get(req.tool)
    const toolName = typeof req.tool === 'string' ? req.tool.slice(0, 80) : `<${typeof req.tool}>`
    let paramsHash: string | null = null
    try { paramsHash = this.checkShape(req.params) ? null : this.paramsHash(toolName, req.agent, req.params) } catch { /* unhashable params are recorded without a hash */ }
    this.db.prepare('INSERT INTO cerberus_decisions (id,ts,tool,agent,role,source,effect,params_hash,outcome,code,reason,actor,correlation_id,approval_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
      .run(d.decisionId, this.now(), toolName, String(req.agent).slice(0, 40), req.role, req.source, tool?.effect ?? null, paramsHash, d.outcome, d.code, d.reason, String(req.actor).slice(0, 80), req.correlationId ?? null, d.approvalId ?? null)
    this.opts.audit({ actor: req.actor, action: 'CERBERUS_GATE', result: `${d.outcome}:${d.code}:${toolName}`, correlationId: req.correlationId ?? d.decisionId })
  }
}
