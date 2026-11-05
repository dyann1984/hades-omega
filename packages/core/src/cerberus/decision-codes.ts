/**
 * Stable catalogue of CERBERUS decision codes. These identifiers are a public contract for UIs, indexers and logs:
 * never rename or reuse one. Adding a code requires updating the pinned list in fail-secure.test.ts and
 * docs/cerberus-deny-codes.md. Human-readable `reason` texts may change; the codes may not.
 */
export type DecisionOutcome = 'PERMIT' | 'DENY' | 'ESCALATE'
export interface DecisionCodeInfo {
  readonly outcome: DecisionOutcome
  /** Suggested HTTP status when an API surfaces this decision. */
  readonly http: 200 | 400 | 403 | 409 | 423
  /** Generic, value-free explanation that is safe to show to any authenticated user. */
  readonly description: string
}

/** Tool gate (CerberusGate). */
export const GATE_CODES = {
  OK: { outcome: 'PERMIT', http: 200, description: 'The operation was permitted by tool policy or by a consumed human approval.' },
  UNKNOWN_TOOL: { outcome: 'DENY', http: 403, description: 'The tool is not registered; unknown tools are denied by default.' },
  INVALID_PARAMS: { outcome: 'DENY', http: 400, description: 'The parameters are malformed, unexpected or fail the tool validation.' },
  EMERGENCY_STOP: { outcome: 'DENY', http: 423, description: 'The emergency stop is active; new executions are suspended.' },
  EGRESS_NOT_AUTHORIZED: { outcome: 'DENY', http: 403, description: 'Sending data to an external provider is not authorized by an administrator policy.' },
  AGENT_NOT_PERMITTED: { outcome: 'DENY', http: 403, description: 'This agent may not use the requested tool.' },
  ROLE_NOT_PERMITTED: { outcome: 'DENY', http: 403, description: 'The requesting role may not use the requested tool.' },
  INVALID_AMOUNT: { outcome: 'DENY', http: 400, description: 'The amount or currency is missing or invalid.' },
  AMOUNT_LIMIT: { outcome: 'DENY', http: 403, description: 'The amount exceeds the per-operation limit.' },
  RECIPIENT_NOT_ALLOWED: { outcome: 'DENY', http: 403, description: 'The recipient is not on the allowlist for this tool.' },
  BUDGET_EXCEEDED: { outcome: 'DENY', http: 403, description: 'The daily budget would be exceeded.' },
  APPROVAL_REQUIRED: { outcome: 'ESCALATE', http: 409, description: 'A human approval bound to these exact parameters is required before execution.' },
  APPROVAL_PENDING: { outcome: 'ESCALATE', http: 409, description: 'The approval request is still waiting for a human decision.' },
  APPROVAL_NOT_FOUND: { outcome: 'DENY', http: 409, description: 'The referenced approval does not exist.' },
  APPROVAL_REJECTED: { outcome: 'DENY', http: 403, description: 'The approval was rejected or revoked.' },
  APPROVAL_EXPIRED: { outcome: 'DENY', http: 409, description: 'The approval or its request has expired.' },
  APPROVAL_REUSED: { outcome: 'DENY', http: 409, description: 'The approval was already consumed; approvals are single-use.' },
  PARAMS_ALTERED: { outcome: 'DENY', http: 409, description: 'The operation differs from what was approved.' },
  POLICY_CHANGED: { outcome: 'DENY', http: 409, description: 'The policy or tool configuration changed after the approval was issued.' },
  GATE_INTERNAL_ERROR: { outcome: 'DENY', http: 403, description: 'An internal error occurred while evaluating; the operation is denied (fail-secure).' },
} as const satisfies Record<string, DecisionCodeInfo>

/** Policy guard (CerberusGUARD) reason codes, derived from the rule that decided. */
export const GUARD_CODES = {
  POLICY_PERMITTED: { outcome: 'PERMIT', http: 200, description: 'The operation is a registered internal operation permitted by policy.' },
  POLICY_AMOUNT_LIMIT: { outcome: 'DENY', http: 403, description: 'An amount exceeds the absolute limit.' },
  POLICY_AMOUNT_ESCALATION: { outcome: 'ESCALATE', http: 409, description: 'A high amount requires human review.' },
  POLICY_VENDOR_NOT_ALLOWED: { outcome: 'DENY', http: 403, description: 'The vendor is not on the approved list.' },
  POLICY_BUDGET_EXCEEDED: { outcome: 'DENY', http: 403, description: 'The available budget is not sufficient.' },
  POLICY_AGENT_NOT_PERMITTED: { outcome: 'DENY', http: 403, description: 'This agent may not propose this type of operation.' },
  POLICY_INVALID_AMOUNT: { outcome: 'DENY', http: 400, description: 'Financial operations require a positive amount in the allowed currency.' },
  POLICY_APPROVAL_REQUIRED: { outcome: 'ESCALATE', http: 409, description: 'This sensitive operation requires human approval.' },
  POLICY_TOOL_NOT_AUTHORIZED: { outcome: 'DENY', http: 403, description: 'Generic tool execution is not authorized.' },
  POLICY_HIDDEN_EFFECT: { outcome: 'DENY', http: 403, description: 'An internal operation carries parameters of an external effect.' },
  POLICY_DEFAULT_DENY: { outcome: 'DENY', http: 403, description: 'No rule permits this operation; denied by default.' },
  POLICY_CUSTOM_RULE: { outcome: 'DENY', http: 403, description: 'A custom policy rule decided this operation.' },
  GUARD_INTERNAL_ERROR: { outcome: 'DENY', http: 403, description: 'An internal error occurred while evaluating; the operation is denied (fail-secure).' },
  GUARD_POLICY_STALE: { outcome: 'DENY', http: 409, description: 'The proposal was prepared under a different policy than the one in force.' },
} as const satisfies Record<string, DecisionCodeInfo>

export const DECISION_CODES = { ...GATE_CODES, ...GUARD_CODES } as const
export type GateCode = keyof typeof GATE_CODES
export type GuardReasonCode = keyof typeof GUARD_CODES
export type DecisionCode = keyof typeof DECISION_CODES
/** Any code that can accompany a DENY decision. */
export type DenyReason = { [K in DecisionCode]: (typeof DECISION_CODES)[K]['outcome'] extends 'DENY' ? K : never }[DecisionCode]

const RULE_CODES: Record<string, GuardReasonCode> = {
  'R-001': 'POLICY_AMOUNT_LIMIT', 'R-002': 'POLICY_AMOUNT_ESCALATION', 'R-003': 'POLICY_VENDOR_NOT_ALLOWED', 'R-004': 'POLICY_BUDGET_EXCEEDED',
  'R-005': 'POLICY_PERMITTED', 'R-006': 'POLICY_PERMITTED', 'R-007': 'POLICY_PERMITTED', 'R-008': 'POLICY_DEFAULT_DENY', 'R-009': 'POLICY_AGENT_NOT_PERMITTED',
  'R-010': 'POLICY_AMOUNT_LIMIT', 'R-011': 'POLICY_AMOUNT_ESCALATION', 'R-012': 'POLICY_INVALID_AMOUNT', 'R-013': 'POLICY_APPROVAL_REQUIRED',
  'R-014': 'POLICY_TOOL_NOT_AUTHORIZED', 'R-015': 'POLICY_PERMITTED', 'R-016': 'POLICY_HIDDEN_EFFECT',
}
/** Stable code for the rule that decided (null = no rule matched). */
export function ruleReasonCode(ruleId: string | null): GuardReasonCode {
  if (ruleId === null) return 'POLICY_DEFAULT_DENY'
  return Object.hasOwn(RULE_CODES, ruleId) ? RULE_CODES[ruleId]! : 'POLICY_CUSTOM_RULE'
}
