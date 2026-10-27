import Fastify from 'fastify'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { SqliteRepository } from '../sqlite.js'
import { documentRoutes } from './documents.js'

// Mock pdf-parse to avoid needing a real PDF binary in unit tests.
// The PDF code path and pipeline logic are what we're testing here.
vi.mock('pdf-parse', () => ({
  default: vi.fn().mockResolvedValue({
    text: 'Contrato HADES OMEGA vigente hasta 2026-12-31 por $150,000 MXN. Riesgo crítico de vencimiento. Penalización del 15% por mora.',
    numpages: 3,
    info: { Title: 'Contrato HADES', Author: 'HADES OMEGA System' },
  }),
}))

// Mock mammoth similarly
vi.mock('mammoth', () => ({
  default: {
    extractRawText: vi.fn().mockResolvedValue({
      value: 'Informe Ejecutivo HADES OMEGA 2026. Presupuesto: $75,000 USD. Plazo: urgente. Riesgo alto.',
      messages: [{ type: 'warning', message: 'Font substitution applied' }],
    }),
  },
}))

async function makeApp(repo: SqliteRepository) {
  const app = Fastify()
  app.decorate('jwtVerify', async () => {})
  app.addHook('preHandler', async (req: any) => {
    req.user = { sub: 'user-pdf-test', roles: ['OPERATOR'] }
  })
  await documentRoutes(app, repo)
  return app
}

describe('PDF and DOCX processing via base64', () => {
  let dir: string
  let repo: SqliteRepository
  let app: Awaited<ReturnType<typeof makeApp>>

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'hades-pdf-'))
    repo = new SqliteRepository(join(dir, 'db.sqlite'), join(dir, 'none.json'))
    await repo.init()
    app = await makeApp(repo)
  })

  afterEach(async () => {
    await app.close()
    repo.close()
    await rm(dir, { recursive: true, force: true })
  })

  it('processes a PDF document via base64 encoding — extracts text and runs full pipeline', async () => {
    const fakePdfBase64 = Buffer.from('%PDF-1.4 fake pdf content for unit test').toString('base64')
    const res = await app.inject({
      method: 'POST',
      url: '/documents/process',
      payload: {
        filename: 'contrato-hades.pdf',
        content: fakePdfBase64,
        encoding: 'base64',
        mimeType: 'application/pdf',
      },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.success).toBe(true)
    expect(body.data.overallStatus).toBe('APPROVED')
    expect(body.data.extractionMethod).toBe('pdf-parse')
    expect(body.data.intake.detectedFormat).toBe('pdf')
    // V-006 should pass (mocked text has many words)
    expect(body.data.validation.rulesPassed).toContain('V-006: PDF_SCANNED_DETECTION')
    // PERSEPHONE should detect business data
    expect(body.data.summary.businessAnalysis).toBeTruthy()
    expect(body.data.summary.businessAnalysis.importantData.length).toBeGreaterThan(0)
    // reportText should be present
    expect(body.data.deliverable.reportText).toContain('INFORME DE PROCESAMIENTO')
    expect(body.data.deliverable.reportText).toContain('Formato:  PDF')
  })

  it('triggers V-006 warning for scanned PDF (too few words extracted)', async () => {
    // Override mock to return very little text (simulating a scanned PDF)
    const { default: pdfParseMock } = await import('pdf-parse')
    ;(pdfParseMock as any).mockResolvedValueOnce({
      text: 'Solo',  // < 10 words
      numpages: 1,
      info: {},
    })

    const fakePdfBase64 = Buffer.from('%PDF-1.4 minimal scan').toString('base64')
    const res = await app.inject({
      method: 'POST',
      url: '/documents/process',
      payload: {
        filename: 'scanned-doc.pdf',
        content: fakePdfBase64,
        encoding: 'base64',
        mimeType: 'application/pdf',
      },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.data.validation.rulesFailed).toContain('V-006: PDF_SCANNED_DETECTION')
    const v006Issue = body.data.validation.issues.find((i: any) => i.code === 'V-006')
    expect(v006Issue).toBeTruthy()
    expect(v006Issue.severity).toBe('MEDIUM')
    expect(v006Issue.message).toContain('OCR')
  })

  it('processes a DOCX document via base64 encoding — extracts text and runs full pipeline', async () => {
    const fakeDocxBase64 = Buffer.from('PK\x03\x04fake docx zip content for test').toString('base64')
    const res = await app.inject({
      method: 'POST',
      url: '/documents/process',
      payload: {
        filename: 'informe-ejecutivo.docx',
        content: fakeDocxBase64,
        encoding: 'base64',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.success).toBe(true)
    expect(body.data.overallStatus).toBe('APPROVED')
    expect(body.data.extractionMethod).toBe('mammoth')
    expect(body.data.intake.detectedFormat).toBe('docx')
    // CHARON should capture docx warnings from mammoth
    expect(body.data.intake.metadata).toBeTruthy()
    // PERSEPHONE business analysis
    expect(body.data.summary.businessAnalysis).toBeTruthy()
    expect(body.data.deliverable.reportText).toContain('Formato:  DOCX')
  })

  it('rejects extracted PDF text exceeding the processing limit', async () => {
    const { default: pdfParseMock } = await import('pdf-parse')
    ;(pdfParseMock as any).mockResolvedValueOnce({text: 'x'.repeat(5 * 1024 * 1024 + 1), numpages: 1, info: {}})
    const res = await app.inject({method:'POST',url:'/documents/process',payload:{filename:'large.pdf',content:Buffer.from('pdf').toString('base64'),encoding:'base64',mimeType:'application/pdf'}})
    expect(res.statusCode).toBe(413)
    expect(res.json().error.code).toBe('EXTRACTED_TEXT_TOO_LARGE')
    expect(repo.listDocumentResults('user-pdf-test')).toHaveLength(0)
  })

  it('returns 422 when PDF extraction fails (corrupt or unsupported PDF)', async () => {
    const { default: pdfParseMock } = await import('pdf-parse')
    ;(pdfParseMock as any).mockRejectedValueOnce(new Error('private-parser-detail'))

    const corruptPdfBase64 = Buffer.from('NOT_A_VALID_PDF').toString('base64')
    const res = await app.inject({
      method: 'POST',
      url: '/documents/process',
      payload: {
        filename: 'corrupt.pdf',
        content: corruptPdfBase64,
        encoding: 'base64',
        mimeType: 'application/pdf',
      },
    })
    expect(res.statusCode).toBe(422)
    expect(res.json().error.code).toBe('PDF_EXTRACTION_FAILED')
    expect(res.body).not.toContain('private-parser-detail')
  })

  it('returns 422 when DOCX extraction fails', async () => {
    const { default: mammothMock } = await import('mammoth')
    ;(mammothMock.extractRawText as any).mockRejectedValueOnce(new Error('Not a valid DOCX'))

    const corruptDocxBase64 = Buffer.from('NOT_A_VALID_DOCX').toString('base64')
    const res = await app.inject({
      method: 'POST',
      url: '/documents/process',
      payload: {
        filename: 'corrupt.docx',
        content: corruptDocxBase64,
        encoding: 'base64',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
    })
    expect(res.statusCode).toBe(422)
    expect(res.json().error.code).toBe('DOCX_EXTRACTION_FAILED')
  })

  it('rejects base64 PDF exceeding 5MB decompressed size (413)', async () => {
    const bigContent = Buffer.alloc(5 * 1024 * 1024 + 1, 0x41)
    const bigBase64 = bigContent.toString('base64')
    const res = await app.inject({
      method: 'POST',
      url: '/documents/process',
      payload: {
        filename: 'toobig.pdf',
        content: bigBase64,
        encoding: 'base64',
        mimeType: 'application/pdf',
      },
    })
    expect(res.statusCode).toBe(413)
    expect(res.json().error.code).toBe('FILE_TOO_LARGE')
  })

  it('PDF result is persisted to SQLite and retrievable by owner', async () => {
    const fakePdfBase64 = Buffer.from('%PDF-1.4 persistence test').toString('base64')
    const processRes = await app.inject({
      method: 'POST',
      url: '/documents/process',
      payload: {
        filename: 'test-persist.pdf',
        content: fakePdfBase64,
        encoding: 'base64',
        mimeType: 'application/pdf',
      },
    })
    expect(processRes.statusCode).toBe(200)
    const resultId = processRes.json().data.resultId as string

    const getRes = await app.inject({ method: 'GET', url: `/documents/results/${resultId}` })
    expect(getRes.statusCode).toBe(200)
    const row = getRes.json()
    expect(row.data.filename).toBe('test-persist.pdf')
    expect(row.data.data.extractionMethod).toBe('pdf-parse')
  })
})
