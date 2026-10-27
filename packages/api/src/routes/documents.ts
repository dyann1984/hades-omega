import { randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { SqliteRepository } from '../sqlite.js'
import { requireRole } from '../security.js'
import { charon, minos, persephone, elysium, tartarus } from '../runtime.js'
import type { DocumentPayload, DocumentIntakeResult, DocumentValidationResult, DocumentSummaryResult } from '@hades/core'

const MAX_SIZE_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME = new Set([
  'text/plain', 'application/json', 'text/csv', 'text/markdown', 'text/x-markdown',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])
const ALLOWED_EXT = new Set(['.txt', '.json', '.csv', '.md', '.pdf', '.docx'])

function detectMime(filename: string, declared: string): string {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase()
  if (ALLOWED_MIME.has(declared)) return declared
  if (ext === '.json') return 'application/json'
  if (ext === '.csv') return 'text/csv'
  if (ext === '.md') return 'text/markdown'
  if (ext === '.pdf') return 'application/pdf'
  if (ext === '.docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  return 'text/plain'
}

interface ProcessBody {
  filename: string
  content: string
  mimeType?: string
  encoding?: 'base64'
}

export async function documentRoutes(app: FastifyInstance, repo: SqliteRepository): Promise<void> {
  // POST /api/v1/documents/process
  app.post('/documents/process', {
    bodyLimit: 12 * 1024 * 1024, // 12 MB to accommodate base64-encoded PDFs
    schema: {
      body: {
        type: 'object',
        required: ['filename', 'content'],
        properties: {
          filename: { type: 'string', minLength: 1, maxLength: 255 },
          content:  { type: 'string' },
          mimeType: { type: 'string', maxLength: 100 },
          encoding: { type: 'string', enum: ['base64'] },
        },
        additionalProperties: false,
      },
    },
  }, async (req: FastifyRequest<{ Body: ProcessBody }>, reply) => {
    requireRole(req, ['ADMIN', 'OPERATOR', 'AUDITOR'])

    const { filename, content, mimeType: declaredMime = 'text/plain', encoding } = req.body
    const mimeType = detectMime(filename, declaredMime)

    const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase()
    if (!ALLOWED_EXT.has(ext)) {
      return reply.status(415).send({ error: { code: 'UNSUPPORTED_FILE_TYPE', message: `Extensión no permitida: ${ext}. Permitidas: ${Array.from(ALLOWED_EXT).join(' ')}` } })
    }

    let textContent: string
    let extractionMethod: DocumentPayload['extractionMethod'] = 'text'
    let extractionMetadata: Record<string, unknown> = {}

    if (encoding === 'base64') {
      const buffer = Buffer.from(content, 'base64')
      const sizeBytes = buffer.length
      if (sizeBytes > MAX_SIZE_BYTES) {
        return reply.status(413).send({ error: { code: 'FILE_TOO_LARGE', message: `Tamaño excede el límite: ${sizeBytes} > ${MAX_SIZE_BYTES} bytes` } })
      }
      if (ext === '.pdf' || mimeType === 'application/pdf') {
        try {
          type PdfResult = { text: string; numpages: number; info: Record<string, unknown> | null }
          type PdfParseFn = (buffer: Buffer) => Promise<PdfResult>
          const pdfParse = (await import('pdf-parse')).default as unknown as PdfParseFn
          const parsed = await pdfParse(buffer)
          textContent = parsed.text
          extractionMethod = 'pdf-parse'
          extractionMetadata = {
            pageCount: parsed.numpages,
            pdfTitle: parsed.info?.['Title'] ?? undefined,
            pdfAuthor: parsed.info?.['Author'] ?? undefined,
          }
        } catch (err) {
          return reply.status(422).send({ error: { code: 'PDF_EXTRACTION_FAILED', message: `No se pudo extraer texto del PDF: ${(err as Error).message}` } })
        }
      } else if (ext === '.docx' || mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        try {
          const mammoth = (await import('mammoth')).default as { extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string; messages: Array<{ type: string; message: string }> }> }
          const result = await mammoth.extractRawText({ buffer })
          textContent = result.value
          extractionMethod = 'mammoth'
          extractionMetadata = {
            warnings: result.messages.filter(m => m.type === 'warning').map(m => m.message),
          }
        } catch (err) {
          return reply.status(422).send({ error: { code: 'DOCX_EXTRACTION_FAILED', message: `No se pudo extraer texto del DOCX: ${(err as Error).message}` } })
        }
      } else {
        textContent = buffer.toString('utf8')
      }
    } else {
      const sizeBytes = Buffer.byteLength(content, 'utf8')
      if (sizeBytes > MAX_SIZE_BYTES) {
        return reply.status(413).send({ error: { code: 'FILE_TOO_LARGE', message: `Tamaño excede el límite: ${sizeBytes} > ${MAX_SIZE_BYTES} bytes` } })
      }
      textContent = content
    }

    const sizeBytes = Buffer.byteLength(textContent, 'utf8')
    const ownerId = (req as any).user?.sub ?? 'anonymous'
    const missionId = randomUUID()
    const errors: string[] = []

    const doc: DocumentPayload = { filename, mimeType, content: textContent, sizeBytes, uploadedBy: ownerId, extractionMethod, extractionMetadata }

    // Step 1: CHARON — intake
    const charonTask = makeTask('CHARON', 'Procesamiento de documento', missionId, { document: doc })
    const charonResult = await charon.receiveTask(charonTask)
    const intakeResult = (charonResult.data as { intakeResult?: DocumentIntakeResult }).intakeResult
    if (!intakeResult) {
      errors.push(`CHARON: no se generó intakeResult — ${charonResult.summary}`)
    }

    // Step 2: MINOS — validation
    let validationResult: DocumentValidationResult | undefined
    if (intakeResult) {
      const minosTask = makeTask('MINOS', 'Validación de documento', missionId, { document: doc, intakeResult })
      const minosResult = await minos.receiveTask(minosTask)
      validationResult = (minosResult.data as { validationResult?: DocumentValidationResult }).validationResult
      if (!validationResult) errors.push(`MINOS: no se generó validationResult — ${minosResult.summary}`)
    }

    // Step 3: PERSEPHONE — summary
    let summaryResult: DocumentSummaryResult | undefined
    if (intakeResult) {
      const persephoneTask = makeTask('PERSEPHONE', 'Resumen de documento', missionId, { intakeResult, documentContent: textContent })
      const persephoneResult = await persephone.receiveTask(persephoneTask)
      summaryResult = (persephoneResult.data as { documentSummary?: DocumentSummaryResult }).documentSummary
      if (!summaryResult) errors.push(`PERSEPHONE: no se generó documentSummary — ${persephoneResult.summary}`)
    }

    // Step 4: ELYSIUM — deliverable
    let deliverable: unknown = null
    if (intakeResult && validationResult && summaryResult) {
      const elysiumTask = makeTask('ELYSIUM', 'Generación de entregable', missionId, {
        documentResults: { intake: intakeResult, validation: validationResult, summary: summaryResult },
      })
      const elysiumResult = await elysium.receiveTask(elysiumTask)
      deliverable = (elysiumResult.data as { deliverable?: unknown }).deliverable ?? null
      if (!deliverable) errors.push(`ELYSIUM: no se generó entregable — ${elysiumResult.summary}`)
    } else {
      errors.push('ELYSIUM: omitido por resultados incompletos de agentes anteriores')
    }

    // Step 5: TARTARUS — error logging
    const tartarusTask = makeTask('TARTARUS', 'Registro de errores', missionId, {
      errors,
      documentId: intakeResult?.documentId,
    })
    await tartarus.receiveTask(tartarusTask)

    const overallStatus = !validationResult?.valid
      ? 'REJECTED'
      : errors.length > 0 ? 'PARTIAL' : 'APPROVED'

    const resultId = randomUUID()
    const resultData = {
      resultId,
      missionId,
      filename,
      mimeType,
      sizeBytes,
      extractionMethod,
      overallStatus,
      errors,
      intake: intakeResult ?? null,
      validation: validationResult ?? null,
      summary: summaryResult ?? null,
      deliverable,
      processedAt: Date.now(),
    }

    repo.saveDocumentResult(resultId, ownerId, filename, overallStatus, resultData)

    return reply.status(200).send({
      success: overallStatus !== 'REJECTED',
      data: resultData,
    })
  })

  // GET /api/v1/documents/results/:resultId — single result with ownership check
  app.get('/documents/results/:resultId', async (req, reply) => {
    const ownerId = (req as any).user?.sub ?? 'anonymous'
    const { resultId } = req.params as { resultId: string }
    const result = repo.getDocumentResult(resultId, ownerId)
    if (!result) {
      return reply.status(404).send({ success: false, error: { code: 'RESULT_NOT_FOUND', message: 'Resultado no encontrado o no autorizado' } })
    }
    return reply.status(200).send({ success: true, data: result })
  })

  // GET /api/v1/documents/results — list results for the authenticated user
  app.get('/documents/results', async (req, reply) => {
    const ownerId = (req as any).user?.sub ?? 'anonymous'
    const results = repo.listDocumentResults(ownerId)
    return reply.status(200).send({ success: true, data: results })
  })
}

function makeTask(agent: string, title: string, missionId: string, context: Record<string, unknown>) {
  return {
    id: randomUUID(),
    missionId,
    title,
    description: title,
    assignedTo: agent as any,
    status: 'ASSIGNED' as const,
    priority: 'P1' as const,
    dependsOn: [],
    createdAt: Date.now(),
    startedAt: null,
    completedAt: null,
    result: null,
    context,
  }
}
