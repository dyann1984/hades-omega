import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'

// Structural guard: the only modules allowed to open an outbound network connection (or import a client that can), and
// what protects each of them. A new egress path must be added here deliberately, together with its CERBERUS control.
const ROOTS = [resolve(__dirname), resolve(__dirname, '..', '..', 'core', 'src')]
const files = (dir: string): string[] => readdirSync(dir).flatMap(f => { const p = join(dir, f); return statSync(p).isDirectory() ? (f === 'node_modules' || f === 'dist' ? [] : files(p)) : /\.ts$/.test(f) && !/\.test\.ts$/.test(f) ? [p] : [] })
const norm = (p: string): string => relative(resolve(__dirname, '..', '..'), p).split(sep).join('/')
const find = (re: RegExp): string[] => ROOTS.flatMap(files).filter(f => re.test(readFileSync(f, 'utf8'))).map(norm).sort()

describe('outbound network paths are known and guarded', () => {
  it('the LLM provider SDK is imported only by the planner, which is driven by the LlmGovernor (llm.plan tool)', () => {
    expect(find(/from ['"]@anthropic-ai\/sdk['"]/)).toEqual(['api/src/planner/ClaudeAnthropicPlanner.ts'])
    const planner = readFileSync(join(__dirname, 'planner', 'ClaudeAnthropicPlanner.ts'), 'utf8')
    expect(planner.indexOf('governor.request(')).toBeGreaterThan(-1)
    expect(planner.indexOf('governor.request(')).toBeLessThan(planner.indexOf('messages.create('))
  })

  it('NEAR RPC clients exist only in the read-only account lookup (gated by near.account_view) and the submission RPC (gated by the NEAR intent flow)', () => {
    expect(find(/JsonRpcProvider/)).toEqual(['api/src/near-testnet.ts', 'api/src/near/rpc.ts'])
    const route = readFileSync(join(__dirname, 'routes', 'cerberus.ts'), 'utf8')
    expect(route.indexOf("tool: 'near.account_view'")).toBeGreaterThan(-1)
    expect(route.indexOf("tool: 'near.account_view'")).toBeLessThan(route.indexOf('readTestnetAccount(accountId)'))
  })

  it('the NEAR probe route asks CERBERUS (near.probe) before touching the network', () => {
    const route = readFileSync(join(__dirname, 'routes', 'vault.ts'), 'utf8')
    expect(route.indexOf("tool: 'near.probe'")).toBeGreaterThan(-1)
    expect(route.indexOf("tool: 'near.probe'")).toBeLessThan(route.indexOf('near.probe()'))
    // every NEAR network read in the routes sits behind a registered tool
    expect(find(/\.probe\(\)/).filter(f => f.startsWith('api/src/routes/'))).toEqual(['api/src/routes/vault.ts'])
  })

  it('no module performs raw HTTP requests, opens client sockets or spawns processes', () => {
    expect(find(/\bfetch\(|\bhttps?\.(?:request|get)\(|from ['"]node:https?['"]|from ['"](?:axios|undici|node-fetch)['"]|new WebSocket\(|child_process/)).toEqual([])
  })

  it('there is no payment executor: payment.execute is registered but nothing calls it', () => {
    expect(find(/['"]payment\.execute['"]/)).toEqual(['core/src/cerberus/tools.ts'])
  })
})
