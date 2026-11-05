'use strict'
// Cliente JSON-RPC de solo lectura con reintentos y RPC alternativos. Sin dependencias, sin claves.
//  - Errores de transporte (red, timeout, HTTP 408/425/429/5xx) => se reintenta con espera y luego se pasa al siguiente RPC.
//  - Un error JSON-RPC (p. ej. UNKNOWN_TRANSACTION) es una RESPUESTA de la red: no se reintenta y se propaga como RpcAnswerError.
//  - Si ningún RPC responde: RpcUnavailableError (la verificación queda SIN VEREDICTO, no "fallida").

class RpcUnavailableError extends Error {
  constructor(attempts) { super(`ningún RPC respondió (${attempts.length} intentos)`); this.name = 'RpcUnavailableError'; this.attempts = attempts }
}
class RpcAnswerError extends Error {
  constructor(method, message) { super(`RPC ${method}: ${message}`); this.name = 'RpcAnswerError' }
}

// The archival node is last: regular nodes garbage-collect old transactions (about 2.5 days), so a record older than that is only
// answerable by an archival endpoint. All three are public and are only ever queried read-only.
const DEFAULT_URLS = ['https://test.rpc.fastnear.com/', 'https://rpc.testnet.near.org/', 'https://archival-rpc.testnet.near.org/']
const RETRYABLE_HTTP = new Set([408, 425, 429, 500, 502, 503, 504])

function parseUrls(env = process.env) {
  const list = (env.NEAR_RPC_URLS || env.NEAR_RPC_URL || '').split(',').map(s => s.trim()).filter(Boolean)
  const urls = list.length ? list : DEFAULT_URLS
  for (const u of urls) { if (!/^https?:\/\//.test(u)) throw new Error(`URL de RPC inválida: ${u}`) }
  return [...new Set(urls)]
}

function createRpcClient({ urls = DEFAULT_URLS, fetchImpl = globalThis.fetch, retries = 2, baseDelayMs = 500, timeoutMs = 15000, sleep = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  const attempts = []
  let lastGoodUrl = null
  async function call(method, params) {
    const ordered = lastGoodUrl ? [lastGoodUrl, ...urls.filter(u => u !== lastGoodUrl)] : urls
    for (const url of ordered) {
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          const res = await fetchImpl(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 'v', method, params }), signal: AbortSignal.timeout(timeoutMs) })
          if (!res.ok) {
            attempts.push({ url, method, error: `HTTP ${res.status}` })
            if (RETRYABLE_HTTP.has(res.status)) { if (attempt < retries) await sleep(baseDelayMs * 2 ** attempt); continue }
            break // HTTP no recuperable en este nodo: probar el siguiente
          }
          const body = await res.json()
          if (body.error) throw new RpcAnswerError(method, `${body.error.message || 'error'}${body.error.cause?.name ? ` (${body.error.cause.name})` : ''}`)
          if (body.result == null) throw new RpcAnswerError(method, 'respuesta sin resultado')
          lastGoodUrl = url
          return body
        } catch (e) {
          if (e instanceof RpcAnswerError) throw e
          attempts.push({ url, method, error: String(e && e.message || e).slice(0, 120) })
          if (attempt < retries) await sleep(baseDelayMs * 2 ** attempt)
        }
      }
    }
    throw new RpcUnavailableError(attempts.slice())
  }
  return { call, attempts, get rpcUsed() { return lastGoodUrl } }
}

module.exports = { createRpcClient, parseUrls, RpcUnavailableError, RpcAnswerError, DEFAULT_URLS }
