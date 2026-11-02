import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import NearPanel from './NearPanel.js'

describe('NEAR panel', () => {
  it('renders no operations, balances or transaction hashes before the server answers, and offers no send action', () => {
    const html = renderToStaticMarkup(createElement(NearPanel))
    expect(html).toContain('Nada se firma ni se envía sin tu aprobación de un solo uso')
    expect(html).not.toContain('Firmar y enviar')
    expect(html).not.toContain('nearblocks')
    expect(html).not.toMatch(/[1-9A-HJ-NP-Za-km-z]{43,44}/) // no base58 tx hash is ever invented
  })
})
