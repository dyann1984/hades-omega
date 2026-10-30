import { describe, it, expect } from 'vitest'
import { apiPath, isDemoToken, demoPath } from './api.js'
import { translate } from './i18n.js'
import { translateForTest } from './domTranslate.js'

const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const token = (roles: string[]) => `${b64({ alg: 'HS256' })}.${b64({ sub: 'x', roles })}.sig`

describe('demo helpers', () => {
  it('detects DEMO tokens only by role claim', () => {
    expect(isDemoToken(token(['DEMO']))).toBe(true)
    expect(isDemoToken(token(['ADMIN']))).toBe(false)
    expect(isDemoToken('garbage')).toBe(false)
    expect(isDemoToken(undefined)).toBe(false)
  })
  it('keeps production paths untouched without a demo session', () => {
    expect(apiPath('/api/v1/missions').endsWith('/api/v1/missions')).toBe(true)
    expect(apiPath('/api/v1/missions')).not.toContain('/demo/')
    expect(demoPath('/info').endsWith('/api/v1/demo/info')).toBe(true)
  })
  it('translates every key in both languages without falling back to the key', () => {
    for (const key of ['login.submit', 'demo.button', 'demo.subtitle', 'demo.banner', 'tour.run', 'label.SIMULADA', 'nav.Documentos'] as const) {
      expect(translate('es', key)).not.toBe(key)
      expect(translate('en', key)).not.toBe(key)
    }
    expect(translate('en', 'demo.button')).toBe('Explore Demo')
    expect(translate('es', 'demo.button')).toBe('Explorar demo')
    expect(translate('es', 'demo.subtitle')).toContain('Conoce HADES')
    expect(translate('en', 'demo.subtitle')).toContain('Discover HADES')
  })
})
describe('legacy UI string translation', () => {
  it('translates known chrome strings preserving case style, and never touches unknown/user content', () => {
    expect(translateForTest('Sin misiones activas')).toBe('No active missions')
    expect(translateForTest('  SIN ESCALACIONES ')).toBe('  NO ESCALATIONS ')
    expect(translateForTest('Completada')).toBe('Completed')
    expect(translateForTest('1 APROBACIONES PENDIENTES')).toBe('1 PENDING APPROVAL')
    expect(translateForTest('3 MISIONES ACTIVAS')).toBe('3 ACTIVE MISSIONS')
    expect(translateForTest('Comparar propuestas de proveedores')).toBeNull()
    expect(translateForTest('SHA-256 abc123')).toBeNull()
  })
})