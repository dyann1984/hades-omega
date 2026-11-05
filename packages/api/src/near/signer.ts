import { createHash } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { transactions, utils } from 'near-api-js'

const TESTNET_ACCOUNT = /^[a-z0-9]+(?:[._-][a-z0-9]+)*\.testnet$/

export interface SignedTx {
  /** Base58 transaction hash (sha256 of the serialized, unsigned transaction), known before broadcasting. */
  hash: string
  /** Borsh-encoded SignedTransaction, base64. This exact payload is what gets persisted and (re)broadcast. */
  base64: string
}

/**
 * Server-side signer. The private key is held in a private field, never logged, never serialized and never returned
 * by any API; `toJSON`/inspect expose only the account and public key.
 */
export class NearSigner {
  readonly accountId: string
  readonly publicKey: string
  readonly #keyPair: utils.KeyPair

  constructor(accountId: string, privateKey: string) {
    if (accountId.length > 64 || !TESTNET_ACCOUNT.test(accountId)) throw new Error('NEAR_SIGNER_ACCOUNT_INVALID')
    let kp: utils.KeyPair
    try { kp = utils.KeyPair.fromString(privateKey as never) } catch { throw new Error('NEAR_SIGNER_KEY_INVALID') } // never echo the key
    if (kp.getPublicKey().keyType !== 0) throw new Error('NEAR_SIGNER_KEY_INVALID') // ed25519 only
    this.accountId = accountId
    this.#keyPair = kp
    this.publicKey = kp.getPublicKey().toString()
  }

  /** Signs a built transaction. The caller decides when; CERBERUS authorization must already have been consumed. */
  sign(tx: transactions.Transaction): SignedTx {
    const hashBytes = createHash('sha256').update(transactions.encodeTransaction(tx)).digest()
    const sig = this.#keyPair.sign(hashBytes)
    const signed = new transactions.SignedTransaction({ transaction: tx, signature: new transactions.Signature({ keyType: tx.publicKey.keyType, data: sig.signature }) })
    return { hash: utils.serialize.base_encode(hashBytes), base64: Buffer.from(signed.encode()).toString('base64') }
  }

  toJSON(): { accountId: string; publicKey: string } { return { accountId: this.accountId, publicKey: this.publicKey } }
  [Symbol.for('nodejs.util.inspect.custom')](): string { return `NearSigner(${this.accountId}, ${this.publicKey})` }
}

/** Fields a credentials file may contain: the JS-CLI format and the near-cli-rs 0.30 format. Anything else is refused as ambiguous. */
const KEY_FILE_FIELDS = new Set(['account_id', 'public_key', 'private_key', 'master_seed_phrase', 'seed_phrase_hd_path', 'implicit_account_id'])
const KEY_FILE_MAX_BYTES = 8192

/**
 * Reads a credentials file WITHOUT ever copying a secret into an error: only fixed error codes leave this function.
 * The seed-phrase fields of near-cli-rs files are never read or kept.
 */
function readKeyFile(file: string): { accountId: string | null; publicKey: string | null; privateKey: string } {
  if (/(^|[\\/])mainnet([\\/]|$)/i.test(file)) throw new Error('NEAR_SIGNER_KEY_FILE_MAINNET')
  let raw: string
  try { if (statSync(file).size > KEY_FILE_MAX_BYTES) throw new Error('big'); raw = readFileSync(file, 'utf8') } catch { throw new Error('NEAR_SIGNER_KEY_FILE_UNREADABLE') }
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { throw new Error('NEAR_SIGNER_KEY_FILE_INVALID') }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('NEAR_SIGNER_KEY_FILE_INVALID')
  const obj = parsed as Record<string, unknown>
  for (const k of Object.keys(obj)) if (!KEY_FILE_FIELDS.has(k)) throw new Error('NEAR_SIGNER_KEY_FILE_UNRECOGNIZED')
  for (const k of ['account_id', 'public_key', 'private_key']) if (k in obj && typeof obj[k] !== 'string') throw new Error('NEAR_SIGNER_KEY_FILE_INVALID')
  if (typeof obj['private_key'] !== 'string' || obj['private_key'] === '') throw new Error('NEAR_SIGNER_KEY_FILE_INVALID')
  return { accountId: (obj['account_id'] as string | undefined) ?? null, publicKey: (obj['public_key'] as string | undefined) ?? null, privateKey: obj['private_key'] }
}

/**
 * Loads the signer from the server environment. Returns null when nothing is configured.
 *  - NEAR_SIGNER_ACCOUNT_ID + NEAR_SIGNER_PRIVATE_KEY  (ed25519:...)
 *  - or NEAR_SIGNER_KEY_FILE pointing to a credentials JSON: JS-CLI ({ account_id, public_key, private_key }) or near-cli-rs
 *    (no account_id; then NEAR_SIGNER_ACCOUNT_ID is the explicit identity). If both name an account they must agree.
 * Two sources at once, a missing identity, a public_key that does not match the private key, unknown fields, mainnet
 * paths/accounts and non-ed25519 keys are all refused. Errors carry fixed codes only, never key material.
 */
export function loadSignerFromEnv(env: NodeJS.ProcessEnv = process.env): NearSigner | null {
  const file = env['NEAR_SIGNER_KEY_FILE'], envAccount = env['NEAR_SIGNER_ACCOUNT_ID'], envKey = env['NEAR_SIGNER_PRIVATE_KEY']
  if (file && envKey) throw new Error('NEAR_SIGNER_AMBIGUOUS_SOURCE')
  if (file) {
    const k = readKeyFile(file)
    if (k.accountId && envAccount && k.accountId !== envAccount) throw new Error('NEAR_SIGNER_IDENTITY_MISMATCH')
    const account = k.accountId ?? envAccount
    if (!account) throw new Error('NEAR_SIGNER_ACCOUNT_MISSING')
    const signer = new NearSigner(account, k.privateKey)
    if (k.publicKey !== null && k.publicKey !== signer.publicKey) throw new Error('NEAR_SIGNER_KEY_MISMATCH')
    return signer
  }
  if (!envAccount && !envKey) return null
  if (!envAccount || !envKey) throw new Error('NEAR_SIGNER_INCOMPLETE')
  return new NearSigner(envAccount, envKey)
}

/** Explicit opt-in only. The vault supplies the private key; identity remains ordinary server configuration. */
export function loadSignerWithVault(env: NodeJS.ProcessEnv, getSecret: (name: string) => string | undefined): NearSigner | null {
  const source = env['HADES_NEAR_KEY_SOURCE']
  if (!source || source === 'env') return loadSignerFromEnv(env)
  if (source !== 'vault') throw new Error('NEAR_SIGNER_SOURCE_INVALID')
  if (env['NEAR_SIGNER_PRIVATE_KEY'] || env['NEAR_SIGNER_KEY_FILE']) throw new Error('NEAR_SIGNER_AMBIGUOUS_SOURCE')
  const secret = getSecret('NEAR_SIGNER_PRIVATE_KEY')
  if (!secret) throw new Error('NEAR_SIGNER_VAULT_SECRET_MISSING')
  return loadSignerFromEnv({ NEAR_SIGNER_ACCOUNT_ID: env['NEAR_SIGNER_ACCOUNT_ID'], NEAR_SIGNER_PRIVATE_KEY: secret })
}
