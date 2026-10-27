import Fastify from 'fastify'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { SqliteRepository } from '../sqlite.js'
import { documentRoutes } from './documents.js'
import { registerSecurity } from '../security.js'
import { authRoutes } from '../auth.js'

async function makeApp(repo: SqliteRepository) {
  const app = Fastify()
  app.decorate('jwtVerify', async () => {})
  // Mock auth: inject user sub directly on every request
  app.addHook('preHandler', async (req: any) => { req.user = { sub: 'user-test-001', roles: ['OPERATOR'] } })
  await documentRoutes(app, repo)
  return app
}

describe('document processing flow', () => {
  let dir: string
  let repo: SqliteRepository
  let app: Awaited<ReturnType<typeof makeApp>>

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'hades-docs-'))
    repo = new SqliteRepository(join(dir, 'db.sqlite'), join(dir, 'none.json'))
    await repo.init()
    app = await makeApp(repo)
  })

  afterEach(async () => {
    await app.close()
    repo.close()
    await rm(dir, { recursive: true, force: true })
  })

  it('processes a valid TXT document through the full pipeline', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/documents/process',
      payload: { filename: 'report.txt', content: 'Este es un reporte de prueba con contenido suficiente para procesar.', mimeType: 'text/plain' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.success).toBe(true)
    expect(body.data.overallStatus).toBe('APPROVED')
    expect(body.data.intake).toBeTruthy()
    expect(body.data.intake.detectedFormat).toBe('txt')
    expect(body.data.validation).toBeTruthy()
    expect(body.data.validation.valid).toBe(true)
    expect(body.data.summary).toBeTruthy()
    expect(body.data.summary.keyTerms.length).toBeGreaterThan(0)
    expect(body.data.deliverable).toBeTruthy()
    expect(body.data.deliverable.overallStatus).toBe('APPROVED')
  })

  it('processes a valid JSON document and detects structure', async () => {
    const jsonContent = JSON.stringify({ vendor: 'CloudPro', amount: 42000, currency: 'MXN', items: [{ sku: 'A1', qty: 5 }] })
    const res = await app.inject({
      method: 'POST',
      url: '/documents/process',
      payload: { filename: 'order.json', content: jsonContent, mimeType: 'application/json' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.data.intake.detectedFormat).toBe('json')
    expect(body.data.validation.valid).toBe(true)
    expect(body.data.intake.metadata.topKeys).toContain('vendor')
  })

  it('processes a valid CSV document and detects columns', async () => {
    const csvContent = 'id,name,price\n1,CloudPro,42000\n2,TechVision,38000\n3,InfraMax,29500'
    const res = await app.inject({
      method: 'POST',
      url: '/documents/process',
      payload: { filename: 'vendors.csv', content: csvContent, mimeType: 'text/csv' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.data.intake.detectedFormat).toBe('csv')
    expect(body.data.intake.metadata.columns).toContain('id')
    expect(body.data.validation.valid).toBe(true)
  })

  it('rejects unsupported file extension (.exe)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/documents/process',
      payload: { filename: 'script.exe', content: 'MZ binary content', mimeType: 'application/octet-stream' },
    })
    expect(res.statusCode).toBe(415)
    expect(res.json().error.code).toBe('UNSUPPORTED_FILE_TYPE')
  })

  it('rejects content exceeding the size limit', async () => {
    const bigContent = 'A'.repeat(5 * 1024 * 1024 + 1)
    const res = await app.inject({
      method: 'POST',
      url: '/documents/process',
      payload: { filename: 'big.txt', content: bigContent, mimeType: 'text/plain' },
    })
    expect(res.statusCode).toBe(413)
    expect(res.json().error.code).toBe('FILE_TOO_LARGE')
  })

  it('marks validation as failed for empty content', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/documents/process',
      payload: { filename: 'empty.txt', content: '   ', mimeType: 'text/plain' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.success).toBe(false)
    expect(body.data.overallStatus).toBe('REJECTED')
    expect(body.data.validation.valid).toBe(false)
    expect(body.data.validation.issues.some((i: any) => i.code === 'V-003')).toBe(true)
  })

  it('marks validation as failed for invalid JSON', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/documents/process',
      payload: { filename: 'bad.json', content: '{ not valid json }}', mimeType: 'application/json' },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.data.validation.valid).toBe(false)
    expect(body.data.validation.issues.some((i: any) => i.code === 'V-004')).toBe(true)
  })

  it('persists result to SQLite and retrieves it via listing', async () => {
    await app.inject({
      method: 'POST',
      url: '/documents/process',
      payload: { filename: 'persisted.md', content: '# Reporte\n\nContenido del reporte para verificar persistencia en SQLite.', mimeType: 'text/markdown' },
    })
    const listRes = await app.inject({ method: 'GET', url: '/documents/results' })
    expect(listRes.statusCode).toBe(200)
    const body = listRes.json()
    expect(body.data.length).toBeGreaterThanOrEqual(1)
    expect(body.data[0].filename).toBe('persisted.md')
    expect(body.data[0].status).toBe('APPROVED')
  })

  it('business analysis is included in PERSEPHONE summary result', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/documents/process',
      payload: { filename: 'analisis.txt', content: 'El proyecto tiene un riesgo crítico de vencimiento el 2026-12-31 con un presupuesto de $50,000 MXN y un 15% de contingencia.', mimeType: 'text/plain' },
    })
    expect(res.statusCode).toBe(200)
    const { data } = res.json()
    expect(data.summary.businessAnalysis).toBeTruthy()
    expect(data.summary.businessAnalysis.executiveSummary).toBeTruthy()
    expect(data.summary.businessAnalysis.analysisNote).toMatch(/API/)
    expect(data.deliverable.reportText).toBeTruthy()
    expect(data.deliverable.reportText).toContain('INFORME DE PROCESAMIENTO')
  })

  it('GET /documents/results/:resultId retrieves the stored result by ID', async () => {
    const processRes = await app.inject({
      method: 'POST',
      url: '/documents/process',
      payload: { filename: 'recovery.txt', content: 'Documento para prueba de recuperación directa por resultId.', mimeType: 'text/plain' },
    })
    expect(processRes.statusCode).toBe(200)
    const resultId = processRes.json().data.resultId as string

    const getRes = await app.inject({ method: 'GET', url: `/documents/results/${resultId}` })
    expect(getRes.statusCode).toBe(200)
    const body = getRes.json()
    expect(body.success).toBe(true)
    expect(body.data.data.resultId).toBe(resultId)
    expect(body.data.filename).toBe('recovery.txt')
  })

  it('each document processing generates a unique resultId (idempotency check)', async () => {
    const payload = { filename: 'same.txt', content: 'Contenido idéntico para verificar IDs únicos.', mimeType: 'text/plain' }
    const res1 = await app.inject({ method: 'POST', url: '/documents/process', payload })
    const res2 = await app.inject({ method: 'POST', url: '/documents/process', payload })
    expect(res1.json().data.resultId).not.toBe(res2.json().data.resultId)
    const listRes = await app.inject({ method: 'GET', url: '/documents/results' })
    expect(listRes.json().data.length).toBe(2)
  })
})
