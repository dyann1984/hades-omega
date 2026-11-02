import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
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

/**
 * Loads the signer from the server environment. Returns null when nothing is configured.
 *  - NEAR_SIGNER_ACCOUNT_ID + NEAR_SIGNER_PRIVATE_KEY  (ed25519:...)
 *  - or NEAR_SIGNER_KEY_FILE pointing to a near-cli credentials JSON ({ account_id, private_key })
 */
export function loadSignerFromEnv(env: NodeJS.ProcessEnv = process.env): NearSigner | null {
  const file = env['NEAR_SIGNER_KEY_FILE']
  if (file) {
    let parsed: { account_id?: unknown; private_key?: unknown }
    try { parsed = JSON.parse(readFileSync(file, 'utf8')) } catch { throw new Error('NEAR_SIGNER_KEY_FILE_UNREADABLE') }
    if (typeof parsed.account_id !== 'string' || typeof parsed.private_key !== 'string') throw new Error('NEAR_SIGNER_KEY_FILE_INVALID')
    return new NearSigner(parsed.account_id, parsed.private_key)
  }
  const account = env['NEAR_SIGNER_ACCOUNT_ID'], key = env['NEAR_SIGNER_PRIVATE_KEY']
  if (!account && !key) return null
  if (!account || !key) throw new Error('NEAR_SIGNER_INCOMPLETE')
  return new NearSigner(account, key)
}
