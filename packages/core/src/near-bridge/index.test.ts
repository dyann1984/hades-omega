import { describe, expect, it, vi } from 'vitest'
import { NEARBridge } from './index.js'

describe('read-only testnet verification', () => {
  it('checks chain and account without signing or sending a transaction', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ok:true, json:async () => ({result:{chain_id:'testnet'}})})
      .mockResolvedValueOnce({ok:true, json:async () => ({result:{amount:'123',block_height:42}})})
    await expect(new NEARBridge().verifyTestnetAccount('hades.testnet', fetcher)).resolves.toEqual({networkId:'testnet', accountId:'hades.testnet', blockHeight:42})
    expect(fetcher.mock.calls.map(call => JSON.parse(call[1].body).method)).toEqual(['status','query'])
  })
  it('rejects the wrong chain and invalid account before proceeding', async () => {
    const fetcher = vi.fn().mockResolvedValue({ok:true,json:async () => ({result:{chain_id:'mainnet'}})})
    await expect(new NEARBridge().verifyTestnetAccount('hades.testnet', fetcher)).rejects.toThrow('NEAR_NETWORK_MISMATCH')
    await expect(new NEARBridge().verifyTestnetAccount('hades.near', fetcher)).rejects.toThrow('INVALID_TESTNET_ACCOUNT')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('rejects RPC errors and malformed responses', async () => {
    const bad = vi.fn().mockResolvedValue({ok:true,json:async () => ({error:{code:-1}})})
    await expect(new NEARBridge().verifyTestnetAccount('hades.testnet', bad)).rejects.toThrow('NEAR_RPC_ERROR')
  })
})
