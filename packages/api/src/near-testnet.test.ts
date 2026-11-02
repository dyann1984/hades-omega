import { describe, it, expect, vi } from 'vitest'
import { readTestnetAccount } from './near-testnet.js'

describe('testnet account read', () => {
  it('checks the network and returns the exact balance without signing', async () => {
    const provider = {status:vi.fn().mockResolvedValue({chain_id:'testnet'}),query:vi.fn().mockResolvedValue({amount:'1234567890123456789012345',block_height:50})}
    await expect(readTestnetAccount('sample.testnet', provider)).resolves.toEqual({network:'testnet',accountId:'sample.testnet',balanceYocto:'1234567890123456789012345',blockHeight:50})
    expect(provider.query).toHaveBeenCalledWith({request_type:'view_account',finality:'final',account_id:'sample.testnet'})
  })
  it('rejects wrong networks and malformed accounts before querying', async () => {
    const provider = {status:vi.fn().mockResolvedValue({chain_id:'mainnet'}),query:vi.fn()}
    await expect(readTestnetAccount('sample.testnet',provider)).rejects.toThrow('NEAR_NETWORK_MISMATCH')
    await expect(readTestnetAccount('sample.near',provider)).rejects.toThrow('INVALID_TESTNET_ACCOUNT')
    expect(provider.query).not.toHaveBeenCalled()
  })
  it('propagates RPC errors and rejects malformed responses', async () => {
    const provider = {status:vi.fn().mockResolvedValue({chain_id:'testnet'}),query:vi.fn().mockResolvedValue({amount:'no',block_height:1})}
    await expect(readTestnetAccount('sample.testnet',provider)).rejects.toThrow('NEAR_INVALID_RESPONSE')
    provider.query.mockRejectedValue(new Error('RPC unavailable'))
    await expect(readTestnetAccount('sample.testnet',provider)).rejects.toThrow('RPC unavailable')
  })
})
