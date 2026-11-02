import { describe, expect, it } from 'vitest'
import { utils } from 'near-api-js'
import { JsonRpcNearRpc, NO_CONTRACT_CODE_HASH } from './rpc.js'

// Read-only calls against the public NEAR testnet RPC. Skipped unless NEAR_LIVE_TESTS=1 so CI never needs the network.
// Nothing here builds, signs or sends a transaction.
describe.skipIf(process.env['NEAR_LIVE_TESTS'] !== '1')('JsonRpcNearRpc (live testnet, read-only)', () => {
  const rpc = new JsonRpcNearRpc()
  it('talks to testnet and reads blocks', async () => {
    expect(await rpc.chainId()).toBe('testnet')
    const b = await rpc.finalBlock()
    expect(b.height).toBeGreaterThan(1_000_000); expect(b.hash.length).toBeGreaterThan(30)
    expect(await rpc.latestHeight()).toBeGreaterThanOrEqual(b.height)
  }, 30_000)
  it('reports nonexistent accounts as null, including the previously hard-coded audit contract id', async () => {
    expect(await rpc.viewAccount('audit.hades-omega.testnet')).toBeNull()
    expect(await rpc.viewAccount('hades-omega.testnet')).toBeNull()
  }, 30_000)
  it('reads an existing account and treats a missing access key / unknown tx as such', async () => {
    const root = await rpc.viewAccount('testnet')
    expect(root).not.toBeNull(); expect(root!.codeHash).toBeTypeOf('string')
    expect(NO_CONTRACT_CODE_HASH).toHaveLength(32)
    expect(await rpc.viewAccessKey('testnet', utils.KeyPair.fromRandom('ed25519').getPublicKey().toString())).toBeNull()
    expect(await rpc.txStatus('11111111111111111111111111111111', 'testnet')).toMatchObject({ state: 'UNKNOWN' })
  }, 30_000)
})
