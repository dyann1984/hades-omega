import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import DemoTour from './DemoTour.js'

const REAL_TX = 'BGzHzQArywmJifVAaftWm7dwKZhzCay6ECutxfagw1V3'
const html = (): string => renderToStaticMarkup(createElement(MemoryRouter, null, createElement(DemoTour)))

describe('Demo tour NEAR section', () => {
  it('labels NEAR as simulated AND points to the real on-chain evidence', () => {
    const out = html()
    expect(out).toContain('tour-chip SIMULADA')
    expect(out).toContain('data-testid="demo-real-evidence"')
    expect(out).toContain(`https://explorer.testnet.near.org/transactions/${REAL_TX}`)
    expect(out).toContain('/verify/index.html')
  })

  it('opens the external links safely and invents no other transaction hash', () => {
    const out = html()
    expect(out).toMatch(/<a href="https:\/\/explorer\.testnet\.near\.org[^>]*rel="noopener noreferrer"/)
    const hashes = new Set(out.match(/[1-9A-HJ-NP-Za-km-z]{43,44}/g) ?? [])
    expect([...hashes]).toEqual([REAL_TX])
  })

  it('serves a verifier page that is identical to docs/verify and cannot sign or hold keys', () => {
    const pub = readFileSync(resolve(__dirname, '../../public/verify/index.html'), 'utf8')
    const doc = readFileSync(resolve(__dirname, '../../../../docs/verify/index.html'), 'utf8')
    expect(pub).toBe(doc)
    expect(pub).toContain(REAL_TX)
    expect(pub).not.toMatch(/send_tx|broadcast_tx|private_key|master_seed|ed25519:[1-9A-HJ-NP-Za-km-z]{80,}/)
  })
})
