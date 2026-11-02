import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import VaultPanel from './VaultPanel.js'

describe('Vault panel', () => {
  it('before the backend answers it shows no connection states, policies or secrets', () => {
    const html = renderToStaticMarkup(createElement(VaultPanel))
    expect(html).toContain('Estado real consultado al backend')
    expect(html).toContain('Consultando el backend')
    for (const fiction of ['Vercel', 'Simulado', 'BUDGET_LIMIT', 'ACTIVA', '••••••', 'NEAR_PRIVATE_KEY', 'yoctoNEAR · bloque']) expect(html).not.toContain(fiction)
  })
  it('source contains no hard-coded connection status, policy list or environment values', () => {
    const src = readFileSync(join(__dirname, 'VaultPanel.tsx'), 'utf8')
    expect(src).not.toMatch(/status:\s*'(connected|simulated)'/)
    expect(src).not.toMatch(/CERBERUS_POLICIES|BUDGET_LIMIT|NEAR_EXECUTION_MODE',\s*value/)
  })
})
