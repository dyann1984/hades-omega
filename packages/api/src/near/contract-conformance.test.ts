import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AUDIT_METHOD, auditCallArgs } from './tx.js'
import { canonicalIntent } from '../near-intents.js'

// The Rust contract cannot be compiled on every machine, so this test pins the contract SOURCE to what the API sends:
// it checks the method and rule literals in lib.rs and proves that every intent the API accepts also satisfies the
// contract's own validation (an accepted intent can therefore never fail on-chain for input-format reasons).
const RUST = readFileSync(join(__dirname, '..', '..', '..', 'contracts', 'src', 'lib.rs'), 'utf8')

/** Line-for-line mirror of the validation in `store_audit_hash` (lib.rs). The first test below ties it to the source text. */
function contractAccepts(a: { audit_id: string; content_hash: string; operation_type: string; agent_name: string; decision: string; timestamp_ms: number }): boolean {
  const validId = (s: string, max: number, ok: (c: string) => boolean): boolean => s.length > 0 && s.length <= max && [...s].every(ok)
  return validId(a.audit_id, 64, c => /^[A-Za-z0-9-]$/.test(c))
    && /^[0-9a-f]{64}$/.test(a.content_hash)
    && validId(a.operation_type, 64, c => /^[A-Z_]$/.test(c))
    && validId(a.agent_name, 32, c => /^[A-Za-z0-9_]$/.test(c))
    && ['PERMIT', 'DENY', 'ESCALATE'].includes(a.decision)
    && Number.isInteger(a.timestamp_ms) && a.timestamp_ms >= 0 && a.timestamp_ms <= Number.MAX_SAFE_INTEGER
}

describe('audit contract source ↔ API conformance', () => {
  it('the contract exposes exactly the method the API calls, with the argument names and order the API sends', () => {
    expect(AUDIT_METHOD).toBe('store_audit_hash')
    expect(RUST).toMatch(/pub fn store_audit_hash\(\s*&mut self,\s*audit_id: String,\s*content_hash: String,\s*operation_type: String,\s*agent_name: String,\s*decision: String,\s*timestamp_ms: u64,\s*\) -> AuditEntry/)
    const args = auditCallArgs({ network: 'testnet', signerId: 'a.testnet', receiverId: 'b.testnet', type: 'AUDIT_HASH', amountYocto: '0', auditId: 'x', contentHash: 'a'.repeat(64), operationType: 'PLANNING', agentName: 'HADES', decision: 'PERMIT', timestampMs: 1, gas: '30000000000000' })
    expect(Object.keys(args)).toEqual(['audit_id', 'content_hash', 'operation_type', 'agent_name', 'decision', 'timestamp_ms'])
  })

  it('write access is owner-only, non-payable, and reads exist', () => {
    expect(RUST).toMatch(/assert_eq!\(env::predecessor_account_id\(\), self\.owner, "only the owner may record entries"\)/)
    expect(RUST).not.toMatch(/#\[payable\]/)
    for (const view of ['get_audit_entry', 'get_count', 'get_owner']) expect(RUST).toMatch(new RegExp(`pub fn ${view}\\(&self`))
    expect(RUST).toMatch(/#\[init\]\s*pub fn new\(owner_id: AccountId\)/)
    expect(RUST).toMatch(/PanicOnDefault/)
  })

  it('the validation rules in the source are the ones mirrored here', () => {
    expect(RUST).toContain('valid_id(&audit_id, 64, |c| c.is_ascii_alphanumeric() || c == \'-\')')
    expect(RUST).toContain('content_hash.len() == 64 && content_hash.chars().all(|c| c.is_ascii_digit() || (\'a\'..=\'f\').contains(&c))')
    expect(RUST).toContain('valid_id(&operation_type, 64, |c| c.is_ascii_uppercase() || c == \'_\')')
    expect(RUST).toContain('valid_id(&agent_name, 32, |c| c.is_ascii_alphanumeric() || c == \'_\')')
    expect(RUST).toContain('["PERMIT", "DENY", "ESCALATE"].contains(&decision.as_str())')
    // idempotent retry vs conflicting reuse
    expect(RUST).toContain('audit_id already recorded with different content')
  })

  it('has Rust unit tests for the cases the contract promises (duplicates, invalid input, permissions)', () => {
    for (const t of ['records_and_reads_back', 'identical_retry_is_a_no_op', 'conflicting_reuse_of_an_id_panics', 'non_owner_cannot_record', 'rejects_uppercase_or_short_hashes', 'rejects_unknown_decision', 'rejects_malformed_ids']) expect(RUST, t).toContain(`fn ${t}()`)
  })

  it('every intent the API accepts also passes the contract validation (randomized)', () => {
    const pool = ['a', 'Z', '0', '-', '_', ' ', '!', '\n', 'é', 'A', 'f', 'g']
    let seed = 0x9e3779b9 // mulberry32: deterministic, and unlike a bare LCG its low bits are well distributed
    const rnd = (n: number): number => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n) }
    const str = (max: number): string => Array.from({ length: rnd(max + 3) }, () => pool[rnd(pool.length)]!).join('')
    const validStr = (alphabet: string, len: number): string => {
      const s = Array.from({ length: len }, () => alphabet[rnd(alphabet.length)]).join('')
      if (rnd(2)) return s
      const at = rnd(s.length + 1) // sprinkle one boundary character so an over-permissive API validator is caught
      return s.slice(0, at) + [...pool, '.', '/', 'a', '9'][rnd(pool.length + 4)] + s.slice(at)
    }
    const hex = (): string => (rnd(4) === 0 ? str(66) : Array.from({ length: rnd(5) === 0 ? 63 + rnd(3) : 64 }, () => '0123456789abcdefABCDEFg'[rnd(23)]).join(''))
    let accepted = 0
    for (let i = 0; i < 4000; i++) {
      const candidate = {
        network: 'testnet', signerId: 'hades.testnet', receiverId: 'audit.hades.testnet', type: 'AUDIT_HASH', amountYocto: '0',
        auditId: rnd(10) < 7 ? validStr('abcXYZ019-', 1 + rnd(64)) : str(66), contentHash: rnd(10) < 7 ? validStr('0123456789abcdef', 64) : hex(), operationType: rnd(10) < 7 ? validStr('ABCDXYZ_', 1 + rnd(64)) : str(66), agentName: ['HADES', 'CHARON', 'PERSEPHONE', 'MINOS', 'ELYSIUM', 'TARTARUS', 'CERBERUS', 'X'][rnd(8)]!,
        decision: ['PERMIT', 'DENY', 'ESCALATE', 'PERMIT', 'DENY', 'MAYBE'][rnd(6)]!, timestampMs: [0, 1, 1700000000000, 1700000000001, 1700000000002, -1, 1.5, Number.MAX_SAFE_INTEGER][rnd(8)]!, gas: '30000000000000',
      }
      let params
      try { params = canonicalIntent(candidate).params } catch { continue }
      accepted++
      expect(contractAccepts({ audit_id: params.auditId, content_hash: params.contentHash, operation_type: params.operationType, agent_name: params.agentName, decision: params.decision, timestamp_ms: params.timestampMs }), JSON.stringify(candidate)).toBe(true)
    }
    expect(accepted).toBeGreaterThan(50) // the generator really exercises the accepting path
  })
})
