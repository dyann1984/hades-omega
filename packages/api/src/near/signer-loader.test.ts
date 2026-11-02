import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inspect } from 'node:util'
import { utils } from 'near-api-js'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NearSigner, loadSignerFromEnv } from './signer.js'

// Every credential here is SYNTHETIC and generated per run. No real key or seed phrase is read, written or asserted.
const ACCOUNT = 'hades-omega.testnet'
const SEED = 'synthetic seed phrase words only for leak assertions not a real mnemonic at all'

describe('credential loader: near-cli-rs 0.30 format and JS-CLI format, strict and non-leaking', () => {
  let dir: string, kp: utils.KeyPair, secret: string, pub: string
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'signer-')); kp = utils.KeyPair.fromRandom('ed25519'); secret = kp.toString(); pub = kp.getPublicKey().toString() })
  afterEach(async () => { await rm(dir, { recursive: true, force: true }) })
  const put = async (name: string, body: unknown): Promise<string> => { const p = join(dir, name); await writeFile(p, typeof body === 'string' ? body : JSON.stringify(body)); return p }
  const cliFile = (extra: Record<string, unknown> = {}) => ({ seed_phrase_hd_path: "m/44'/397'/0'", master_seed_phrase: SEED, implicit_account_id: 'a'.repeat(64), public_key: pub, private_key: secret, ...extra })
  const code = (fn: () => unknown): string => { try { fn() } catch (e) { return (e as Error).message } return 'NO_ERROR' }

  it('accepts the near-cli-rs file (no account_id) when NEAR_SIGNER_ACCOUNT_ID names the identity, and exposes only account + public key', async () => {
    const f = await put('cli.json', cliFile())
    const s = loadSignerFromEnv({ NEAR_SIGNER_KEY_FILE: f, NEAR_SIGNER_ACCOUNT_ID: ACCOUNT })!
    expect(s.accountId).toBe(ACCOUNT); expect(s.publicKey).toBe(pub)
    for (const out of [JSON.stringify(s), inspect(s, { depth: 5, showHidden: true }), String(s), JSON.stringify({ s })]) { expect(out).not.toContain(secret); expect(out).not.toContain(SEED) }
  })

  it('still accepts the JS-CLI format (account_id inside the file), alone or consistent with the environment', async () => {
    const f = await put('js.json', { account_id: ACCOUNT, public_key: pub, private_key: secret })
    expect(loadSignerFromEnv({ NEAR_SIGNER_KEY_FILE: f })!.accountId).toBe(ACCOUNT)
    expect(loadSignerFromEnv({ NEAR_SIGNER_KEY_FILE: f, NEAR_SIGNER_ACCOUNT_ID: ACCOUNT })!.accountId).toBe(ACCOUNT)
    const noPub = await put('nopub.json', { account_id: ACCOUNT, private_key: secret }) // pre-existing minimal format
    expect(loadSignerFromEnv({ NEAR_SIGNER_KEY_FILE: noPub })!.publicKey).toBe(pub)
  })

  it('refuses ambiguity and inconsistency with fixed error codes', async () => {
    const cli = await put('cli.json', cliFile())
    const other = utils.KeyPair.fromRandom('ed25519')
    expect(code(() => loadSignerFromEnv({ NEAR_SIGNER_KEY_FILE: cli }))).toBe('NEAR_SIGNER_ACCOUNT_MISSING') // no identity anywhere
    expect(code(() => loadSignerFromEnv({ NEAR_SIGNER_KEY_FILE: cli, NEAR_SIGNER_PRIVATE_KEY: secret, NEAR_SIGNER_ACCOUNT_ID: ACCOUNT }))).toBe('NEAR_SIGNER_AMBIGUOUS_SOURCE')
    const js = await put('js.json', { account_id: ACCOUNT, private_key: secret })
    expect(code(() => loadSignerFromEnv({ NEAR_SIGNER_KEY_FILE: js, NEAR_SIGNER_ACCOUNT_ID: 'other.testnet' }))).toBe('NEAR_SIGNER_IDENTITY_MISMATCH')
    const mismatch = await put('mismatch.json', cliFile({ public_key: other.getPublicKey().toString() }))
    expect(code(() => loadSignerFromEnv({ NEAR_SIGNER_KEY_FILE: mismatch, NEAR_SIGNER_ACCOUNT_ID: ACCOUNT }))).toBe('NEAR_SIGNER_KEY_MISMATCH')
  })

  it('refuses malformed, unrecognized, oversized and non-ed25519 files, and mainnet accounts or paths', async () => {
    const env = (f: string) => ({ NEAR_SIGNER_KEY_FILE: f, NEAR_SIGNER_ACCOUNT_ID: ACCOUNT })
    expect(code(() => loadSignerFromEnv(env(join(dir, 'missing.json'))))).toBe('NEAR_SIGNER_KEY_FILE_UNREADABLE')
    expect(code(() => loadSignerFromEnv(env(dir)))).toBe('NEAR_SIGNER_KEY_FILE_UNREADABLE') // a directory
    const big = await put('big.json', ' '.repeat(9000))
    expect(code(() => loadSignerFromEnv(env(big)))).toBe('NEAR_SIGNER_KEY_FILE_UNREADABLE')
    for (const [name, body] of [['notjson', '{ nope'], ['array', [1, 2]], ['null', 'null'], ['nokey', { public_key: pub }], ['emptykey', { private_key: '' }], ['numkey', { private_key: 5 }], ['numacct', { account_id: 5, private_key: secret }]] as const)
    { const p = await put(`${name}.json`, body); expect(code(() => loadSignerFromEnv(env(p))), name).toBe('NEAR_SIGNER_KEY_FILE_INVALID') }
    for (const extra of [{ secret_key: secret }, { network_id: 'mainnet' }, { privateKey: secret }])
    { const p = await put(`x${Object.keys(extra)[0]}.json`, cliFile(extra)); expect(code(() => loadSignerFromEnv(env(p))), JSON.stringify(Object.keys(extra))).toBe('NEAR_SIGNER_KEY_FILE_UNRECOGNIZED') }
    const secp = utils.KeyPair.fromRandom('secp256k1').toString()
    const secpF = await put('secp.json', { private_key: secp })
    expect(code(() => loadSignerFromEnv(env(secpF)))).toBe('NEAR_SIGNER_KEY_INVALID')
    const okF = await put('ok.json', cliFile()), mainF = await put('okk.json', { account_id: 'x.near', private_key: secret })
    expect(code(() => loadSignerFromEnv({ NEAR_SIGNER_KEY_FILE: okF, NEAR_SIGNER_ACCOUNT_ID: 'hades.near' }))).toBe('NEAR_SIGNER_ACCOUNT_INVALID')
    expect(code(() => loadSignerFromEnv({ NEAR_SIGNER_KEY_FILE: mainF }))).toBe('NEAR_SIGNER_ACCOUNT_INVALID')
    await mkdir(join(dir, 'mainnet'))
    const mainP = await put(join('mainnet', 'k.json'), cliFile())
    expect(code(() => loadSignerFromEnv(env(mainP)))).toBe('NEAR_SIGNER_KEY_FILE_MAINNET')
  })

  it('never puts the private key or the seed phrase in any error (message, stack or serialization), for any failure mode', async () => {
    const cases: Array<NodeJS.ProcessEnv> = [
      { NEAR_SIGNER_KEY_FILE: await put('a.json', cliFile()) },
      { NEAR_SIGNER_KEY_FILE: await put('b.json', cliFile({ public_key: utils.KeyPair.fromRandom('ed25519').getPublicKey().toString() })), NEAR_SIGNER_ACCOUNT_ID: ACCOUNT },
      { NEAR_SIGNER_KEY_FILE: await put('c.json', cliFile({ secret_key: secret })), NEAR_SIGNER_ACCOUNT_ID: ACCOUNT },
      { NEAR_SIGNER_KEY_FILE: await put('d.json', `{"private_key":"${secret}", broken`), NEAR_SIGNER_ACCOUNT_ID: ACCOUNT },
      { NEAR_SIGNER_ACCOUNT_ID: ACCOUNT, NEAR_SIGNER_PRIVATE_KEY: secret.slice(0, 20) },
      { NEAR_SIGNER_ACCOUNT_ID: 'hades.near', NEAR_SIGNER_PRIVATE_KEY: secret },
      { NEAR_SIGNER_KEY_FILE: await put('e.json', cliFile()), NEAR_SIGNER_PRIVATE_KEY: secret },
    ]
    for (const env of cases) {
      let err: Error | null = null
      try { loadSignerFromEnv(env) } catch (e) { err = e as Error }
      expect(err).not.toBeNull()
      const blob = [err!.message, err!.stack ?? '', JSON.stringify(err, Object.getOwnPropertyNames(err!)), inspect(err, { depth: 6 })].join('\n')
      expect(blob).not.toContain(secret); expect(blob).not.toContain(secret.slice(8, 40)); expect(blob).not.toContain(SEED); expect(blob).not.toContain('seed phrase')
      expect(err!.message).toMatch(/^NEAR_SIGNER_[A-Z_]+$/) // a fixed code, nothing else
    }
  })

  it('the environment-variable form keeps working and the constructor still refuses bad keys without echoing them', () => {
    expect(loadSignerFromEnv({})).toBeNull()
    expect(loadSignerFromEnv({ NEAR_SIGNER_ACCOUNT_ID: ACCOUNT, NEAR_SIGNER_PRIVATE_KEY: secret })!.publicKey).toBe(pub)
    expect(code(() => loadSignerFromEnv({ NEAR_SIGNER_ACCOUNT_ID: ACCOUNT }))).toBe('NEAR_SIGNER_INCOMPLETE')
    expect(code(() => new NearSigner(ACCOUNT, 'ed25519:short'))).toBe('NEAR_SIGNER_KEY_INVALID')
  })
})
