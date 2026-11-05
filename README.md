# HADES OMEGA

**A multi-agent system that audits business documents and may only touch the blockchain through a human-approved, one-time, tamper-evident gate.**

Built for the NEAR HACKATHON 2026 (tracks: **AI Security & Defense**, **AI Swarms**). Network: **NEAR Testnet**. Status: working prototype; one real on-chain record exists and is independently verifiable (below).

## The problem

An AI agent that can sign blockchain transactions is dangerous: a prompt injection or a bug becomes a loss of funds. HADES shows a pattern for "AI that can act, without the keys to everything":
agents do the analysis; every sensitive action (a blockchain write, an external call) must pass **CERBERUS**, which denies by default, requires a **human approval bound to the exact parameters**, consumes it **once**, and signs with a **NEAR FunctionCall key restricted to one method of one contract**.

## Verify the on-chain result in 30 seconds (no install, no keys)

| Fact | Value |
|---|---|
| Network | NEAR Testnet |
| Contract | `audit.hades-omega.testnet` (Rust, `hades-audit-registry` v0.4.0, WASM SHA-256 `ae9a75fff7bb44e00bf3769e10ccc4e855b1f3c249abc768fd275b34dfb9f685`) |
| Owner / signer account | `hades-omega.testnet` |
| Audit record | `hades-attest-0001`, content hash `4bb4f2d98d2919b60795a607a2b7150cfaa59e9d77d8367a27ed74bd44fa571b` |
| Transaction | [`BGzHzQArywmJifVAaftWm7dwKZhzCay6ECutxfagw1V3`](https://explorer.testnet.near.org/transactions/BGzHzQArywmJifVAaftWm7dwKZhzCay6ECutxfagw1V3) (FINAL, 1 `FunctionCall store_audit_hash`, 30 TGas, 0 NEAR deposit) |
| Signing key | `ed25519:Gm4bBKzHhAsHhQGUfSPpphL1QxTCA8uxbaJmPYvVtw7n`, permission `FunctionCall`: only `store_audit_hash` on `audit.hades-omega.testnet`, 0.25 NEAR gas allowance |

```sh
node scripts/verify-attestation-onchain.cjs      # Node 18+, only public JSON-RPC queries, 18 checks, exit code 1 if any fails
```
Or clone/download the repository and open `docs/verify/index.html` in a browser (same checks, runs client-side; GitHub only shows that file as source code, it does not run it). Checked: transaction FINAL without errors; arguments equal the authorized ones; `get_count` = 1;
`get_audit_entry("hades-attest-0001")` returns exactly that content hash; the code on-chain hashes to the attested WASM; the key is restricted; that key signed exactly one transaction.
The five transactions that set everything up (accounts, atomic deploy+init, restricted key, the record) are listed in [`docs/evidencia-hades-attest-0001.md`](docs/evidencia-hades-attest-0001.md).

## Run the whole flow locally (offline, ~2 minutes)

```sh
npm ci
npm run build
node scripts/e2e-audit-flow.cjs            # real API process + throwaway DB: 22 checks across the full mission flow
node scripts/check-public-demo-safety.cjs  # proves a public deployment cannot sign or send anything
```
`e2e-audit-flow.cjs` drives HTTP only: first admin → login → multi-document mission → agents run → CERBERUS waits for approval → ADMIN approves → report and SHA-256 seal →
evidence recorded → CHRONOS follow-up scheduled and executed → NEAR audit **prepared but not sent** (NEAR is intentionally unconfigured in this check).

Interactive UI (React dashboard, "Explore Demo" needs no credentials):
```sh
export JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")   # PowerShell: $env:JWT_SECRET = -join ((1..32) | % { '{0:x2}' -f (Get-Random -Max 256) })
export ALLOWED_ORIGIN=http://127.0.0.1:5174
npm run dev:all        # API :3001 + web http://127.0.0.1:5174; the API prints a one-time X-Setup-Token for creating the first admin
```
Details for judges: [`docs/JUDGES.md`](docs/JUDGES.md).

## How it works

```
documents ─▶ HADES (orchestrator) ─▶ CHARON ─▶ MINOS ─▶ PERSEPHONE ─▶ CERBERUS ─▶ ELYSIUM ─▶ TARTARUS ─▶ CHRONOS
             plan + task bus        intake    validate   compare      human        report     SHA-256    daily read-only
                                                                       approval                seal       follow-up
                                                  │
        any sensitive action (NEAR write, external call, payment) ──▶ CERBERUS gate ──▶ NEAR bridge ──▶ audit.hades-omega.testnet
```

* **Multi-agent pipeline** (`packages/core`, `packages/api/src/audit-flow.ts`): HADES plans; CHARON extracts documents, MINOS verifies conditions, PERSEPHONE compares documents; ELYSIUM writes the report; TARTARUS seals it with SHA-256 and records evidence.
  The agents use deterministic capabilities (document intake/validate/compare, report, hash). No LLM is required for the flow above.
* **CERBERUS** (`packages/api/src/cerberus-gate.ts`, `packages/core/src/cerberus`): a tool registry with effect classes (READ, WRITE, EXTERNAL, FINANCIAL, BLOCKCHAIN, EGRESS). Unregistered tools are denied.
  Sensitive tools require a human approval that is bound to the hash of the exact parameters and the policy, expires (≤ 15 min) and is **consumed once**. A **persistent emergency stop** blocks every non-read action.
  Every decision is written to a hash-chained audit log that can be verified (`/api/v1/audit/integrity`). NEAR writes only go to recipients on an allowlist.
* **CHRONOS** (`packages/api/src/chronos`): a persistent scheduler (SQLite tables `chronos_tasks`, `chronos_runs`, cron expressions, retry after a crash). The mission follow-up (`0 9 * * *`) is READ-only: it re-checks that the stored evidence and the audit chain are intact.
* **NEAR integration** (`packages/api/src/near`, `packages/contracts`): intent → CERBERUS escalation → one-time approval → preflight over RPC (network, contract code, owner, key permissions, balance, no duplicate) → sign → persist the exact signed bytes → broadcast → confirm from the final on-chain outcome and compare the stored record.
  The server accepts only a **FunctionCall key limited to `store_audit_hash` of the audit contract with a bounded allowance**; FullAccess keys, mainnet accounts, ambiguous credential files and secrets in errors are rejected.
* **Contract** (`packages/contracts`, near-sdk 5.30): `new` is `#[init] #[private]` (nobody can take over an uninitialized deployment), `store_audit_hash` is owner-only, deposit-free and idempotent, no transfers and no cross-contract calls.
  The deployed WASM is reproducible from the commit: `powershell scripts/verify-contract-wasm.ps1` (Docker) prints `MATCH`.

## What is real, simulated, and pending

| Area | Status |
|---|---|
| Multi-document mission flow, CERBERUS approvals, emergency stop, hash-chained audit, CHRONOS follow-up | **Real** (tested; `e2e-audit-flow.cjs`, Playwright) |
| Rust contract deployed on Testnet, atomic deploy + init, restricted key, **one real audit transaction** | **Real, verifiable on-chain** |
| NEAR submission pipeline (sign, broadcast, confirm, recover) | **Real** and used once; in every other run it is **off** (`NEAR_SIGNING_ENABLED` unset) |
| Public "Explore Demo" | **Simulated NEAR by design**: the DEMO session is isolated, temporary and can reach only `/api/v1/demo/*`; it shows `mode: simulation, transactionsSigned: 0` |
| LLM planning (`llm.plan`, Anthropic) | **Implemented behind an egress policy, disabled by default; not exercised against the live API** in our verification |
| Payments (`payment.execute`) | **Not implemented**: registered in CERBERUS but has no executor |
| Agent capabilities `cap:procurement:eval`, `cap:policy:verify`, `cap:financial:analyze`, `cap:resilience:recover`, `cap:orchestration:plan`, `cap:security:guard` | **Not implemented**: listed in the registry, rejected at run time with `CAPABILITY_NOT_IMPLEMENTED` (`/capabilities` reports `implemented`) |
| Governance events on-chain (NEP-297) | **Not implemented** (needs a contract change); only local events (`POLICY_ACTIVE`, `CERBERUS_APPROVAL_REVOKED`) in the hash-chained audit log |
| Current on-chain verification | **Depends on a reachable public RPC**; the verifier prints `INCONCLUSIVE` (exit 2) when none answers, never a false PASS |
| NEAR Intents, Chain Signatures, mainnet | **Not used** |
| Link "mission evidence → on-chain record" in the UI | **Pending**: the pipeline prepares the intent; the only on-chain record so far attests the contract itself, not a mission |
| Hosted public deployment | **Pending** (config files exist; none verified here) |

## Security evidence

* Secrets: Gitleaks over the full history (0 findings); no `.env`, database, key or WASM is tracked. The restricted key and its seed live only in the operator's OS-protected folder, never in the repository, logs or errors (tests assert this).
* `node scripts/check-public-demo-safety.cjs`: anonymous users get 401, DEMO sessions get 403 on every NEAR/CERBERUS/Vault route, and even an ADMIN on such a deployment has `signingEnabled: false` with no signer.
* Contract: 12 Rust unit tests and 6 integration tests in a local `near-sandbox` against the release WASM (third-party takeover refused, double init refused, failed init rolls the deploy back; mutation-checked).

## Tests

`npm run type-check`, `npm run lint`, `npm run build`, `npm test` (api, core, frontend unit tests), `npx playwright test` (22 browser end-to-end tests, Edge), plus the Rust tests (`cargo test --manifest-path packages/contracts/Cargo.toml`; sandbox tests: `powershell scripts/test-contract-sandbox.ps1`).
Current counts are in [`docs/JUDGES.md`](docs/JUDGES.md).

## Repository layout

* `packages/core`: agents, CERBERUS policy engine, planner, NEAR bridge · `packages/api`: Fastify API, SQLite persistence, CERBERUS gate, CHRONOS, NEAR pipeline · `packages/frontend`: React/Vite UI · `packages/contracts`: NEAR Rust contract and sandbox tests
* `scripts/`: verification and safety scripts · `docs/`: operations, attestation (`contract-attestation.json`), evidence, runbooks. Older documents under `docs/` and root reports describe earlier phases and may mention planned behavior.

## Hackathon disclosures

* **Timeline**: the first commit is dated 2026-10-24, after the 2026-10-19 announcement; the whole repository is within the window. The NEAR contract, the transaction pipeline and the on-chain record were built 2026-10-26 to 2026-11-02.
* **AI-assisted code**: most of the code was written with Claude Code (Anthropic) under human direction and review. Libraries: Fastify, better-sqlite3, React, Vite, near-api-js, near-sdk (Rust), Playwright, Vitest.
* **License**: MIT, Copyright (c) 2026 Diana Lopez (see [`LICENSE`](LICENSE)). Third-party dependencies keep their own licenses.


### Auditoría y códigos de CERBERUS
Verificador independiente de la cadena: `node scripts/verify-audit-chain.cjs --db data/hades.sqlite --json`. Ancla externa: `--export-anchor ancla.json` (guardarla fuera del servidor; también `GET /api/v1/cerberus/audit/anchor`, ADMIN) y después `--anchor-file ancla.json`. Catálogo de códigos de decisión: `docs/cerberus-deny-codes.md` (`GET /api/v1/cerberus/gate/codes`). Estado de la revisión externa: `CERBERUS_PEER_REVIEW_RESPONSE.md` §8.
