import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import AuditFlowPanel from './AuditFlowPanel.js'

describe('Audit flow panel', () => {
  it('starts with the mission form and no stages, hashes or results invented', () => {
    const html = renderToStaticMarkup(createElement(MemoryRouter, null, createElement(AuditFlowPanel)))
    expect(html).toContain('AUDITORÍA EMPRESARIAL')
    expect(html).toContain('Crear misión y ejecutar agentes')
    expect(html).toContain('no es un dictamen jurídico')
    expect(html).not.toContain('data-stage')
    expect(html).not.toContain('Completado')
    expect(html).not.toMatch(/[0-9a-f]{64}/)
  })
})
