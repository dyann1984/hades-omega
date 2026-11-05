import { describe, expect, it } from 'vitest'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { join, resolve } from 'node:path'
import type { AddressInfo } from 'node:net'

const root = resolve(process.cwd(), '../..') // vitest runs from packages/api
const nodeRequire = createRequire(join(root, 'package.json'))
const { createRpcClient, parseUrls, RpcUnavailableError, RpcAnswerError } = nodeRequire(join(root, 'scripts/lib/rpc-client.cjs'))
const run = promisify(execFile)

const res = (status: number, body?: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response
const noSleep = async () => undefined

describe('NEAR verifier RPC client', () => {
  it('retries transient HTTP errors on the same node and then succeeds', async () => {
    const calls: string[] = []
    const fetchImpl = async (url: string) => { calls.push(url); return calls.length < 3 ? res(408) : res(200, { result: { ok: 1 } }) }
    const c = createRpcClient({ urls: ['https://a/'], fetchImpl, retries: 2, sleep: noSleep })
    expect((await c.call('query', {})).result).toEqual({ ok: 1 })
    expect(calls).toEqual(['https://a/', 'https://a/', 'https://a/'])
    expect(c.rpcUsed).toBe('https://a/')
    expect(c.attempts.map((a: { error: string }) => a.error)).toEqual(['HTTP 408', 'HTTP 408'])
  })
  it('falls back to the next RPC when the first keeps failing, and prefers the working one afterwards', async () => {
    const calls: string[] = []
    const fetchImpl = async (url: string) => { calls.push(url); if (url === 'https://a/') throw new Error('fetch failed'); return res(200, { result: 1 }) }
    const c = createRpcClient({ urls: ['https://a/', 'https://b/'], fetchImpl, retries: 1, sleep: noSleep })
    await c.call('x', {}); await c.call('y', {})
    expect(calls).toEqual(['https://a/', 'https://a/', 'https://b/', 'https://b/'])
    expect(c.rpcUsed).toBe('https://b/')
  })
  it('does not retry a JSON-RPC answer: it is the network speaking', async () => {
    let n = 0
    const fetchImpl = async () => { n++; return res(200, { error: { message: 'Server error', cause: { name: 'UNKNOWN_TRANSACTION' } } }) }
    const c = createRpcClient({ urls: ['https://a/', 'https://b/'], fetchImpl, retries: 3, sleep: noSleep })
    await expect(c.call('tx', {})).rejects.toBeInstanceOf(RpcAnswerError)
    expect(n).toBe(1)
  })
  it('reports unavailability (not a failed check) when no node answers, listing every attempt', async () => {
    const c = createRpcClient({ urls: ['https://a/', 'https://b/'], fetchImpl: async () => res(408), retries: 1, sleep: noSleep })
    const err = await c.call('tx', {}).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RpcUnavailableError)
    expect((err as { attempts: unknown[] }).attempts).toHaveLength(4)
  })
  it('validates configured URLs and removes duplicates', () => {
    expect(parseUrls({ NEAR_RPC_URLS: 'https://a, https://b,https://a' })).toEqual(['https://a', 'https://b'])
    expect(() => parseUrls({ NEAR_RPC_URLS: 'file:///etc/passwd' })).toThrow('inválida')
    expect(parseUrls({}).length).toBeGreaterThanOrEqual(2)
  })
})

describe('verify-attestation-onchain.cjs verdicts (local fake RPC, no network)', () => {
  const script = join(root, 'scripts/verify-attestation-onchain.cjs')
  const withServer = async (handler: (body: { method: string }) => { status: number; body?: unknown }, fn: (url: string) => Promise<void>) => {
    const server = createServer((req, rsp) => {
      let data = ''; req.on('data', c => { data += c }); req.on('end', () => { const out = handler(JSON.parse(data)); rsp.statusCode = out.status; rsp.setHeader('content-type', 'application/json'); rsp.end(JSON.stringify(out.body ?? {})) })
    })
    await new Promise<void>(r => server.listen(0, '127.0.0.1', r))
    try { await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`) } finally { await new Promise(r => server.close(r)) }
  }
  const exec = (url: string) => run(process.execPath, [script, '--json'], { env: { ...process.env, NEAR_RPC_URLS: url, NEAR_RPC_RETRIES: '1', NEAR_RPC_BACKOFF_MS: '1' } }).then(r => ({ code: 0, out: JSON.parse(r.stdout) }), (e: { code: number; stdout: string }) => ({ code: e.code, out: JSON.parse(e.stdout) }))

  it('exits 2 with verdict INCONCLUSIVE and no checks when the RPC only answers HTTP 408', async () => {
    await withServer(() => ({ status: 408 }), async url => {
      const r = await exec(url)
      expect(r.code).toBe(2)
      expect(r.out).toMatchObject({ verdict: 'INCONCLUSIVE', allPassed: false, checksRun: 0 })
      expect(r.out.attempts.length).toBeGreaterThan(0)
    })
  })
  it('exits 1 with verdict FAIL when the network answers that the transaction does not exist', async () => {
    await withServer(() => ({ status: 200, body: { error: { message: 'Server error', cause: { name: 'UNKNOWN_TRANSACTION' } } } }), async url => {
      const r = await exec(url)
      expect(r.code).toBe(1)
      expect(r.out).toMatchObject({ verdict: 'FAIL', allPassed: false })
    })
  })
})
