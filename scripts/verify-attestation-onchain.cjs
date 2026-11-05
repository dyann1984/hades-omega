#!/usr/bin/env node
/*
 * Read-only, dependency-free verification of the first HADES audit record on NEAR Testnet.
 * It only issues JSON-RPC queries (no keys, no signing, no transactions) and can be re-run by anyone:
 *
 *   node scripts/verify-attestation-onchain.cjs            # prints each check and exits 1 if any fails
 *   node scripts/verify-attestation-onchain.cjs --json     # machine-readable result
 */
const RPC = process.env.NEAR_RPC_URL || 'https://test.rpc.fastnear.com/'
const SIGNER = 'hades-omega.testnet', CONTRACT = 'audit.hades-omega.testnet'
const TX = 'BGzHzQArywmJifVAaftWm7dwKZhzCay6ECutxfagw1V3'
const DEPLOY_TX = 'QSf1bwTWzvvRCQ6W4HQ5fVmYYQN3BAyXudqqs6WsPqj'
const LIMITED_KEY = 'ed25519:Gm4bBKzHhAsHhQGUfSPpphL1QxTCA8uxbaJmPYvVtw7n'
const WASM_SHA256 = 'ae9a75fff7bb44e00bf3769e10ccc4e855b1f3c249abc768fd275b34dfb9f685' // docs/contract-attestation.json
const EXPECT = { audit_id: 'hades-attest-0001', content_hash: '4bb4f2d98d2919b60795a607a2b7150cfaa59e9d77d8367a27ed74bd44fa571b', operation_type: 'CONTRACT_ATTESTATION', agent_name: 'HADES', decision: 'PERMIT', timestamp_ms: 1793661717062 }
const crypto = require('node:crypto')
const results = []
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, ...(detail !== undefined ? { detail } : {}) }); if (!process.argv.includes('--json')) console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail !== undefined ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`) }
async function rpc(method, params) {
  const r = await fetch(RPC, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 'v', method, params }) })
  if (!r.ok) throw new Error(`RPC ${method}: HTTP ${r.status}`)
  const body = await r.json()
  if (body.error) throw new Error(`RPC ${method}: ${body.error.message || 'error'}${body.error.cause?.name ? ` (${body.error.cause.name})` : ''}`)
  if (body.result == null) throw new Error(`RPC ${method}: respuesta sin resultado`)
  return body
}
const view = async (account, m, args) => { const r = await rpc('query', { request_type: 'call_function', finality: 'final', account_id: account, method_name: m, args_base64: Buffer.from(JSON.stringify(args)).toString('base64') }); return JSON.parse(Buffer.from(r.result.result).toString()) }
function b58hex(s) { const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'; let n = 0n; for (const c of s) n = n * 58n + BigInt(A.indexOf(c)); return n.toString(16).padStart(64, '0') }
const near = y => { const s = String(y).padStart(25, '0'); return `${s.slice(0, -24)}.${s.slice(-24).replace(/0+$/, '') || '0'}` }

;(async () => {
  const tx = (await rpc('tx', { tx_hash: TX, sender_account_id: SIGNER, wait_until: 'FINAL' })).result
  check('1. Transacción encontrada', tx && tx.transaction.hash === TX, { hash: TX, explorer: `https://explorer.testnet.near.org/transactions/${TX}` })
  const outcomes = [tx.transaction_outcome, ...tx.receipts_outcome]
  check('2. Estado FINAL', tx.final_execution_status === 'FINAL', tx.final_execution_status)
  check('2. Sin errores (SuccessValue, 0 fallos en todos los recibos)', 'SuccessValue' in tx.status && !outcomes.some(o => 'Failure' in o.outcome.status), { receipts: outcomes.length })
  const a = tx.transaction.actions
  check('3. Una sola acción: FunctionCall store_audit_hash, 30 TGas, depósito 0', a.length === 1 && a[0].FunctionCall && a[0].FunctionCall.method_name === 'store_audit_hash' && a[0].FunctionCall.gas === 30000000000000 && a[0].FunctionCall.deposit === '0')
  const args = JSON.parse(Buffer.from(a[0].FunctionCall.args, 'base64').toString())
  check('3. Argumentos == los autorizados (incluye contentHash exacto)', JSON.stringify(Object.entries(args).sort()) === JSON.stringify(Object.entries(EXPECT).sort()), { content_hash: args.content_hash })
  check('4. Firmante hades-omega.testnet → contrato audit.hades-omega.testnet', tx.transaction.signer_id === SIGNER && tx.transaction.receiver_id === CONTRACT)
  check('4. Firmada con la llave FunctionCall restringida (no la FullAccess)', tx.transaction.public_key === LIMITED_KEY, tx.transaction.public_key)

  const count = await view(CONTRACT, 'get_count', {}), entry = await view(CONTRACT, 'get_audit_entry', { audit_id: EXPECT.audit_id })
  check('5. get_count == 1 (un solo registro, sin duplicados)', count === 1, count)
  check('5. get_audit_entry: content_hash coincide EXACTAMENTE', entry && entry.content_hash === EXPECT.content_hash, entry && { content_hash: entry.content_hash, recorder: entry.recorder, block_height: entry.block_height })
  check('5. get_audit_entry: tipo, agente, decisión y marca de tiempo', entry && entry.operation_type === EXPECT.operation_type && entry.agent_name === 'HADES' && entry.decision === 'PERMIT' && entry.timestamp_ms === EXPECT.timestamp_ms && entry.recorder === SIGNER)
  check('5. Propietario del contrato == hades-omega.testnet', (await view(CONTRACT, 'get_owner', {})) === SIGNER)

  const acct = (await rpc('query', { request_type: 'view_account', finality: 'final', account_id: CONTRACT })).result
  check('6. Código desplegado == WASM atestado (SHA-256)', b58hex(acct.code_hash) === WASM_SHA256, { code_hash: acct.code_hash, sha256: b58hex(acct.code_hash) })
  const code = (await rpc('query', { request_type: 'view_code', finality: 'final', account_id: CONTRACT })).result
  const sha = crypto.createHash('sha256').update(Buffer.from(code.code_base64, 'base64')).digest('hex')
  check('6. Código descargado de la cadena: SHA-256 == atestación', sha === WASM_SHA256, { bytes: Buffer.from(code.code_base64, 'base64').length, sha256: sha })
  const dep = (await rpc('tx', { tx_hash: DEPLOY_TX, sender_account_id: CONTRACT, wait_until: 'FINAL' })).result
  check('6. Despliegue + init atómico (DeployContract + FunctionCall new) exitoso', dep && dep.transaction.actions.length === 2 && 'DeployContract' in dep.transaction.actions[0] && dep.transaction.actions[1].FunctionCall.method_name === 'new' && 'SuccessValue' in dep.status, { tx: DEPLOY_TX })

  const keys = (await rpc('query', { request_type: 'view_access_key_list', finality: 'final', account_id: SIGNER })).result.keys
  const lim = keys.find(k => k.public_key === LIMITED_KEY), fc = lim && lim.access_key.permission.FunctionCall
  check('7. Llave restringida: FunctionCall, solo audit.hades-omega.testnet / store_audit_hash', fc && fc.receiver_id === CONTRACT && fc.method_names.length === 1 && fc.method_names[0] === 'store_audit_hash')
  check('7. Allowance restante <= 0.25 NEAR (y consumido solo el gas de 1 transacción)', fc && BigInt(fc.allowance) < 250000000000000000000000n && BigInt(fc.allowance) > 249000000000000000000000n, fc && `${near(fc.allowance)} NEAR`)
  check('7. Un solo envío firmado con esa llave (nonce = nonce inicial + 1)', lim && lim.access_key.nonce === tx.transaction.nonce, { nonce: tx.transaction.nonce })
  const s = (await rpc('query', { request_type: 'view_account', finality: 'final', account_id: SIGNER })).result
  check('7. Saldos', true, { 'hades-omega.testnet': near(s.amount) + ' NEAR', 'audit.hades-omega.testnet': near(acct.amount) + ' NEAR' })

  const failed = results.filter(r => !r.ok).length
  if (process.argv.includes('--json')) console.log(JSON.stringify({ network: 'testnet', rpc: RPC, checkedAt: new Date().toISOString(), allPassed: failed === 0, results }, null, 2))
  else console.log(failed === 0 ? `\nTODAS LAS VERIFICACIONES PASARON (${results.length})` : `\n${failed} VERIFICACIÓN(ES) FALLARON`)
  process.exit(failed === 0 ? 0 : 1)
})().catch(e => {
  if (process.argv.includes('--json')) console.log(JSON.stringify({ network: 'testnet', rpc: RPC, checkedAt: new Date().toISOString(), allPassed: false, results, error: e.message }, null, 2))
  else console.error('ERROR', e.message)
  process.exit(2)
})
