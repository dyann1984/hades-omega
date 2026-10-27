import { randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { SqliteRepository } from '../sqlite.js'
import { charon, minos, persephone, elysium, tartarus } from '../runtime.js'
import type { DocumentPayload, DocumentIntakeResult, DocumentValidationResult, DocumentSummaryResult } from '@hades/core'

const MAX_SIZE_BYTES = 5 * 1024 * 1024
const ALLOWED_MIME = new Set(['text/plain', 'application/json', 'text/csv', 'text/markdown', 'text/x-markdown'])
const ALLOWED_EXT = new Set(['.txt', '.json', '.csv', '.md'])

function detectMime(filename: string, declared: string): string {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase()
  if (ALLOWED_MIME.has(declared)) return declared
  if (ext === '.json') return 'application/json'
  if (ext === '.csv') return 'text/csv'
  if (ext === '.md') return 'text/markdown'
  return 'text/plain'
}

interface ProcessBody {
  filename: string
  content: string
  mimeType?: string
}

export async function documentRoutes(app: FastifyInstance, repo: SqliteRepository): Promise<void> {
  // POST /api/v1/documents/process
  // Accepts JSON body: { filename, content, mimeType? }
  // Runs full 6-agent pipeline and stores result in SQLite
  app.post('/documents/process', {
    bodyLimit: 6 * 1024 * 1024, // allow up to 6MB; handler enforces 5MB limit
    schema: {
      body: {
        type: 'object',
        required: ['filename', 'content'],
        properties: {
          filename: { type: 'string', minLength: 1, maxLength: 255 },
          content:  { type: 'string' },
          mimeType: { type: 'string', maxLength: 100 },
        },
        additionalProperties: false,
      },
    },
  }, async (req: FastifyRequest<{ Body: ProcessBody }>, reply) => {
    const { filename, content, mimeType: declaredMime = 'text/plain' } = req.body
    const mimeType = detectMime(filename, declaredMime)

    const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase()
    if (!ALLOWED_EXT.has(ext)) {
      return reply.status(415).send({ error: { code: 'UNSUPPORTED_FILE_TYPE', message: `Extensión no permitida: ${ext}. Permitidas: .txt .json .csv .md` } })
    }

    const sizeBytes = Buffer.byteLength(content, 'utf8')
    if (sizeBytes > MAX_SIZE_BYTES) {
      return reply.status(413).send({ error: { code: 'FILE_TOO_LARGE', message: `Tamaño excede el límite: ${sizeBytes} > ${MAX_SIZE_BYTES} bytes` } })
    }

    const ownerId = (req as any).user?.sub ?? 'anonymous'
    const missionId = randomUUID()
    const errors: string[] = []

    const doc: DocumentPayload = { filename, mimeType, content, sizeBytes, uploadedBy: ownerId }

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
      const persephoneTask = makeTask('PERSEPHONE', 'Resumen de documento', missionId, { intakeResult, documentContent: content })
      const persephoneResult = await persephone.receiveTask(persephoneTask)
      summaryResult = (persephoneResult.data as { documentSummary?: DocumentSummaryResult }).documentSummary
      if (!summaryResult) errors.push(`PERSEPHONE: no se generó documentSummary — ${persephoneResult.summary}`)
    }

    // Step 4: ELYSIUM — deliverable (only if we have all three results)
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

    // Determine overall status
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
