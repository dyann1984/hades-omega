import { describe, it, expect } from 'vitest'
import { AGENT_COLOR, AGENT_ROLE } from './agentColors.js'

describe('agent identity', () => {
  it('gives each of the seven agents a unique color and a bilingual role', () => {
    const names = Object.keys(AGENT_COLOR)
    expect(names).toEqual(['HADES', 'CHARON', 'PERSEPHONE', 'MINOS', 'CERBERUS', 'ELYSIUM', 'TARTARUS'])
    expect(new Set(Object.values(AGENT_COLOR)).size).toBe(7)
    for (const n of names) { expect(AGENT_COLOR[n as keyof typeof AGENT_COLOR]).toMatch(/^#[0-9A-F]{6}$/i); expect(AGENT_ROLE[n as keyof typeof AGENT_ROLE].en.length).toBeGreaterThan(3) }
  })
})
