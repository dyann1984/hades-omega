# CERBERUS authorization gate

`packages/api/src/cerberus-gate.ts` is the single boundary every external effect must cross. It complements the rule
engine in `packages/core/src/cerberus/guard.ts` (used by agents through `proposeOperation`).

## Model

| Concept | Where | Rule |
|---|---|---|
| Tool registry | `core/src/cerberus/tools.ts` | Exact, case-sensitive ids. No aliases. Unknown id => `DENY UNKNOWN_TOOL`. |
| Effect class | same | `READ`, `WRITE`, `EXTERNAL`, `FINANCIAL`, `BLOCKCHAIN`. `EXTERNAL/FINANCIAL/BLOCKCHAIN` always need a human approval; this is derived from the class, not a per-tool flag. |
| Agent + role policy | `ToolDefinition.agents/roles` | Both must match. `SYSTEM` is the role of automation (CHRONOS). `DEMO` is in no sensitive tool. |
| Parameters | `allowedParams`, `validate` | Whitelist: any extra argument is rejected, not ignored. |
| Amounts | `amountField`, `maxAmount`, `currency` | Positive finite number, fixed currency, hard per-operation ceiling (deny, not escalate). |
| Recipients | `recipientField` + `cerberus_recipients` | Destination must be on the per-tool allowlist (admin-managed). Empty by default. |
| Budget | `dailyBudget` | Sum of **consumed** approvals per UTC day. |
| Approval | `cerberus_approvals` | Bound to sha256 of canonical `{tool, agent, params}` and to the policy+registry hash. Max validity 15 min. Single use (atomic `consumed_at`). Pending requests expire after 24 h. |
| Grant | `cerberus_decisions.id` of a `PERMIT` | Single-use proof the executor presents (`consumeGrant`) with the exact params, valid 2 min, re-checks the emergency stop. |
| Emergency stop | table `near_security` | One persistent flag for NEAR and every non-`READ` tool. Re-checked at grant consumption. |
| Audit | `cerberus_decisions` + hash-chained `audit_events` | Every decision, including denials, is persisted. |

Automation (`AGENT`, `CHRONOS`, `MISSION` sources) can never approve its own request. A human admin acting through the
API may approve a request they made (single-admin deployments).

## Who is wired to the gate

- **CHRONOS**: a job kind must map to a `READ` tool (checked at creation); every run calls `authorize` as
  `SYSTEM/CHRONOS`. A denial fails the run and is never retried.
- **NEAR intents**: `requestApproval` creates the gate approval (tool `near.audit_hash_submit`), `approve` decides it,
  `claimForSigning` consumes it and returns a `grantId`. `NEARBridge.storeAuditHash` in real mode refuses to run
  without an attached gate and a valid grant for the same params. **No signer or broadcaster exists**: even with a
  valid grant the bridge stops at "requires credentials".
- **Agents**: `guard.evaluate` now checks every amount-like key (not only the first), rejects internal operations that
  carry recipient/account/deposit/credential keys (rule R-016), and no longer fails on prototype names.
- **API**: `GET /near/testnet/account/:id` is authorized as `near.account_view`.

## Endpoints (ADMIN only)

`GET /api/v1/cerberus/gate/{tools,decisions,approvals,recipients}`,
`POST /api/v1/cerberus/gate/approvals/:id/decision`, `POST /api/v1/cerberus/gate/recipients/{add,remove}`,
`GET|POST /api/v1/cerberus/emergency-stop` (alias of `/near/emergency-stop`).

## Known limits (not yet closed)

- The Anthropic planner call (`ClaudeAnthropicPlanner`) is outbound data egress and is not routed through the gate.
- `payment.execute` is registered for classification and limits but has no executor.
- No text-level prompt-injection detection: protection comes from whitelisting tools and arguments, not from
  inspecting natural language.
- The gate protects code paths that call it. A new executor that does not call `authorize` and `consumeGrant` is not
  protected; `NEARBridge` enforces this itself, other future executors must do the same.
