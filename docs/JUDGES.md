# HADES OMEGA — Guide for judges

You can understand, run and verify HADES OMEGA without access to our computers. Every claim below has a command or link that proves it. Where something is not real or not finished, it says so.

## 1. What it is (30 seconds)

HADES is a multi-agent system that audits business documents. Its security idea, aimed at the **AI Security & Defense** track ("give AI money without giving it the keys to everything"):

* Agents (CHARON, MINOS, PERSEPHONE, ELYSIUM, TARTARUS, orchestrated by HADES) only analyse.
* Any sensitive action goes through **CERBERUS**: deny by default → human approval bound to the exact parameters → consumed once → emergency stop → hash-chained audit log.
* On NEAR, the server signs with a **FunctionCall key that can only call `store_audit_hash` on one contract** (0.25 NEAR gas allowance). It refuses FullAccess keys.
* **CHRONOS** persists scheduled read-only follow-ups, so the evidence is re-checked daily.

## 2. Verify the on-chain proof (no install, 30 seconds)

Pick one:

1. **Browser**: clone or download the repo and open `docs/verify/index.html` locally (GitHub shows that file as source code and will not run it). It queries a public Testnet RPC node and shows 13 checks. It cannot sign or send anything. The public demo site, once deployed, serves the same page at `/verify/index.html`.
2. **Terminal** (Node 18+, no `npm install`): `node scripts/verify-attestation-onchain.cjs` → 18 checks. It retries and falls back to alternate public RPC nodes (override with `NEAR_RPC_URLS="https://a,https://b"`). Exit code **0** = PASS (all 18 match), **1** = FAIL (the network answered and something does not match), **2** = INCONCLUSIVE (no RPC node answered: this neither confirms nor refutes the evidence — retry later or use the explorer). Add `--json` for a machine-readable verdict.

> **Last verification state (honest note).** The evidence in `evidencia-hades-attest-0001.md` / `evidence-hades-attest-0001.json` was verified over RPC on 2026-11-02 (18/18). When this guide was last updated (2026-11-05) the public RPC nodes were unreachable from our machine and the verifier returned INCONCLUSIVE, so that evidence was **not re-confirmed on that date**. The guarantee is narrow: one attestation hash of the contract binary stored by one approved transaction — not an "immutable audit log" and not on-chain policy enforcement (see `CERBERUS_PEER_REVIEW_RESPONSE.md`).
3. **Explorer**: https://explorer.testnet.near.org/transactions/BGzHzQArywmJifVAaftWm7dwKZhzCay6ECutxfagw1V3

What you should see: transaction `BGzHzQArywmJifVAaftWm7dwKZhzCay6ECutxfagw1V3` FINAL without errors; one `FunctionCall store_audit_hash` signed by `hades-omega.testnet` with key `ed25519:Gm4bBKzH…vtw7n`; `get_count` = 1; `get_audit_entry("hades-attest-0001")` with content hash `4bb4f2d9…571b`;
contract code hash equal to the WASM SHA-256 `ae9a75ff…f685` committed in [`contract-attestation.json`](contract-attestation.json); the key restricted to `store_audit_hash` of `audit.hades-omega.testnet`.
The complete story, including the five set-up transactions, is in [`evidencia-hades-attest-0001.md`](evidencia-hades-attest-0001.md) (Spanish).

Optional, to prove the contract binary is reproducible from the source: `powershell scripts/verify-contract-wasm.ps1` (needs Docker) → `MATCH`.

## 3. Run the product (offline, no keys, no accounts)

```sh
npm ci && npm run build
node scripts/e2e-audit-flow.cjs            # the full mission flow over real HTTP, 22 checks
node scripts/check-public-demo-safety.cjs  # a public deployment cannot sign or send, 25 checks
```

Interactive dashboard:
```sh
export JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
export ALLOWED_ORIGIN=http://127.0.0.1:5174
npm run dev:all          # open http://127.0.0.1:5174 → "Explore Demo" (no credentials, temporary isolated session)
```
"Explore Demo" shows `NEAR: SIMULATED, transactions signed: 0`. This is deliberate: the public demo has no key and cannot send. To see a real transaction use section 2.

## 4. A three-minute path through the demo

There are two ways in, and they differ on purpose:

* **Explore Demo** (no credentials): a temporary, isolated DEMO session (30 min, capped runs and sessions per IP). Its token can reach only `/api/v1/demo/*` (agents, missions, approvals, audit events, CERBERUS policy, documents, NEAR status); every other route returns 403. NEAR is shown as `SIMULADA / transactionsSigned: 0`.
* **Operator session** (first admin created with the one-time `X-Setup-Token` the API prints at start-up): adds the *Audit flow* panel, CHRONOS, Vault and the NEAR screens. The browser test `e2e/evidence.spec.ts` drives exactly this path; its UI is in Spanish.

Operator path, as the test performs it:

| Step | Button / screen | Expect |
|---|---|---|
| 1 | **Crear misión y ejecutar agentes** | Agents run; the mission stops at CERBERUS waiting for a human |
| 2 | **Aprobar (ADMIN)** | The report is generated and sealed with SHA-256 (stage *seal* completed) |
| 3 | **Registrar evidencia** | Stored evidence matches the report hash |
| 4 | **Programar seguimiento diario** | CHRONOS task created (runs at 09:00; not yet executed) |
| 5 | **Preparar registro NEAR** | "No se firmó ni se envió": prepared, nothing signed or sent |
| 6 | `/near` | "No hay cuenta firmante": no signer on a default install |
| 7 | Open `docs/verify/index.html` locally (or `/verify/index.html` on the deployed demo) | The real record that exists on Testnet passes every check |

Steps 1–6 are the same flow `node scripts/e2e-audit-flow.cjs` checks over HTTP (22 checks) and Playwright checks in the browser.

## 5. Real, simulated, pending

See the table in the [README](../README.md#what-is-real-simulated-and-pending). In one line: the gate, the agents, the scheduler and one on-chain record are real; the public demo's NEAR is simulated; payments, NEAR Intents, mainnet and a hosted public URL are **not** built or deployed.

## 6. Tests we ran (2026-11-02, this commit)

| Check | Result |
|---|---|
| `npm run type-check`, `npm run lint` (ESLint, forced, no cache), `npm run build` | pass |
| `npm test` | api 244 passed + 3 skipped (live-RPC tests, off by default), core 78, frontend 72 |
| Rust unit tests | 12 passed |
| Contract integration in a local `near-sandbox` (release WASM) | 6 passed (takeover refused, double init refused, failed init rolls back the deploy) |
| `node scripts/e2e-audit-flow.cjs` | 22/22 |
| `node scripts/check-public-demo-safety.cjs` | all pass |
| Playwright (Edge, desktop + mobile) | 21 passed, 2 skipped; 1 test timed out creating the browser context while another heavy job was running and passed (3/3) when re-run alone |
| Gitleaks, full history | 0 findings |

Raw logs of this run are in `docs/test-evidence-final/`.

## 7. Known limits (honest list)

* Testnet only, one real audit record, and it attests the **contract**, not a business mission. Linking a mission's evidence hash to a record from the UI is prepared but not executed.
* The CERBERUS evidence for that record comes from a local database; a third party can reproduce only the on-chain half.
* The default demo uses deterministic capabilities. The optional LLM planner is implemented but disabled and was not exercised against the live API.
* `payment.execute` is registered in the policy but has no executor, by design.
* Hosted public deployment: not done yet (needs the owner's decision).


## CERBERUS: endurecimiento posterior a la revisión externa

- **Cadena de auditoría:** `node scripts/verify-audit-chain.cjs --db <archivo.sqlite> --json [--expect-head <hash> --expect-count <n>]` (sólo lectura; PASS/FAIL, código de salida 0/1/2). Detecta alteración, truncamiento de cola, hash nulo y sustitución del último evento. Para detectar a un atacante que reescriba también el ancla interna, guarde `headHash`/`hashedEvents` fuera del servidor y páselos con `--expect-*`.
- **Códigos de decisión estables:** `GET /api/v1/cerberus/gate/codes` y `docs/cerberus-deny-codes.md`.
- **Fail-secure:** cualquier error interno de CERBERUS es DENY y queda auditado; la parada de emergencia también impide reanudar operaciones aprobadas al arrancar.
- **Honestidad:** las pruebas con RPC simulado no prueban nada on-chain; los eventos de gobernanza NEP-297 on-chain no existen (sólo eventos locales en la cadena de auditoría). La firma/transmisión NEAR sigue desactivada por defecto.
- Detalle por hallazgo: `CERBERUS_PEER_REVIEW_RESPONSE.md`, sección 8.
