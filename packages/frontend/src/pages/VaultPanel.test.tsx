import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import VaultPanel from './VaultPanel.js'

describe('Vault testnet lookup', () => {
  it('renders a labelled read-only account lookup without inventing a balance', () => {
    const html = renderToStaticMarkup(createElement(VaultPanel))
    expect(html).toContain('Consulta pública de cuenta testnet (solo lectura)')
    expect(html).toContain('near-testnet-account')
    expect(html).not.toContain('yoctoNEAR · bloque')
  })
})
