import { providers } from 'near-api-js'

const TESTNET_RPC = 'https://test.rpc.fastnear.com'
type ReadProvider = {
  status(): Promise<{ chain_id: string }>
  query(args: {request_type: 'view_account'; finality: 'final'; account_id: string}): Promise<unknown>
}

/** Read-only RPC; does not construct, sign, or broadcast transactions. */
export async function readTestnetAccount(accountId: string, provider: ReadProvider = new providers.JsonRpcProvider({url: TESTNET_RPC})): Promise<{network: 'testnet'; accountId: string; balanceYocto: string; blockHeight: number}> {
  if (accountId.length > 64 || !/^[a-z0-9]+(?:[._-][a-z0-9]+)*\.testnet$/.test(accountId)) throw new Error('INVALID_TESTNET_ACCOUNT')
  const status = await provider.status()
  if (status.chain_id !== 'testnet') throw new Error('NEAR_NETWORK_MISMATCH')
  const account = await provider.query({request_type:'view_account', finality:'final', account_id:accountId}) as {amount?:unknown; block_height?:unknown}
  if (typeof account.amount !== 'string' || !/^\d+$/.test(account.amount) || !Number.isSafeInteger(account.block_height) || (account.block_height as number) < 1) throw new Error('NEAR_INVALID_RESPONSE')
  return {network:'testnet', accountId, balanceYocto:account.amount, blockHeight:account.block_height as number}
}
