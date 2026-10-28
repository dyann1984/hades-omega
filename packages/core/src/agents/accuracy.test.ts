import { describe, expect, it } from 'vitest'
import { MinosAgent } from './minos.js'
import { PersephoneAgent } from './persephone.js'
import { CerberusGUARD } from '../cerberus/guard.js'
import { CerberusAUDIT } from '../cerberus/audit.js'
import { NEARBridge } from '../near-bridge/index.js'
import type { Task, DocumentPayload } from '../types/index.js'

function makeTask(assignedTo: any, overrides: Partial<Task> = {}): Task {
  return {
    id: 'test-id',
    missionId: 'mission-test-int',
    title: 'Test task',
    description: 'Test description',
    assignedTo,
    status: 'ASSIGNED',
    priority: 'P0',
    dependsOn: [],
    createdAt: Date.now(),
    startedAt: null,
    completedAt: null,
    result: null,
    ...overrides,
  }
}

describe('Intelligence & Accuracy Tests (MINOS and PERSEPHONE)', () => {
  const guard = new CerberusGUARD()
  const audit = new CerberusAUDIT()
  const near = new NEARBridge()
  const deps = { guard, audit, near }

  const minos = new MinosAgent(deps)
  const persephone = new PersephoneAgent(deps)

  it('MINOS: accurately identifies high-risk clauses, zero penalties and mixed contradictory terms', async () => {
    const docs: DocumentPayload[] = [
      {
        filename: 'contrato_valido.txt',
        content: 'Acuerdo de Servicios de Consultoría Empresarial. El monto total es de $50,000 USD pagaderos en 30 días. Garantía de cumplimiento por 12 meses. Penalización por mora del 5% semanal hasta un tope de 20%. SLA del 99.5% garantizado.',
        mimeType: 'text/plain',
        sizeBytes: 250,
      },
      {
        filename: 'contrato_riesgo_critico.txt',
        content: 'Convenio de Provisión de Software. Precio fijado en $75,000 USD sin garantía expresa ni implícita bajo ninguna circunstancia. Penalización por retraso fijada en 0% (sin penalización). Terminación unilateral inmediata sin causa.',
        mimeType: 'text/plain',
        sizeBytes: 240,
      },
      {
        filename: 'contrato_contradictorio.txt',
        content: 'Contrato Mixto de Infraestructura. El proveedor ofrece garantía plena por 24 meses, sin embargo en el anexo B se estipula expresamente sin garantía por fallas del servidor. Monto pactado en 250,000 USD y 500,000 MXN en una misma transacción.',
        mimeType: 'text/plain',
        sizeBytes: 280,
      },
    ]

    const task = makeTask('MINOS', {
      title: 'Validación de contratos',
      context: { documents: docs },
    })

    const result = await minos.receiveTask(task)
    expect(result.success).toBe(true)
    const data = result.data as any
    expect(data.totalChecked).toBe(3)
    expect(data.highRiskCount).toBe(2) // doc-2 (sin garantía/0%) y doc-3 (contradictorio)

    const doc1Res = data.results.find((r: any) => r.filename === 'contrato_valido.txt')
    expect(doc1Res.valid).toBe(true)

    const doc2Res = data.results.find((r: any) => r.filename === 'contrato_riesgo_critico.txt')
    expect(doc2Res.valid).toBe(false)
    expect(doc2Res.riskLevel).toBe('HIGH')
    expect(doc2Res.issues.some((i: string) => i.includes('ALTO RIESGO: Cláusula explícita de exclusión'))).toBe(true)

    const doc3Res = data.results.find((r: any) => r.filename === 'contrato_contradictorio.txt')
    expect(doc3Res.valid).toBe(false)
    expect(doc3Res.issues.some((i: string) => i.includes('Monedas mixtas'))).toBe(true)
    expect(doc3Res.issues.some((i: string) => i.includes('Contradicción detectada'))).toBe(true)
  })

  it('PERSEPHONE: accurately extracts amounts, currencies, SLAs, penalties, and computes exact variances', async () => {
    const docs = [
      {
        filename: 'propuesta_alfa.txt',
        content: 'Cotización Proveedor Alfa: Precio $10,000 USD. Entrega en 15 días hábiles. Penalización por retraso: 5% semanal. SLA ofrecido: 99.9%. Garantía 12 meses.',
      },
      {
        filename: 'propuesta_beta.txt',
        content: 'Cotización Proveedor Beta: Precio $14,000 USD. Entrega en 30 días hábiles. Penalización por mora: 10% mensual. SLA ofrecido: 98.5%. Garantía extendida 24 meses.',
      },
      {
        filename: 'propuesta_gamma.txt',
        content: 'Cotización Proveedor Gamma: Precio $8,500 USD sin garantía expresa. Entrega inmediata en 5 días. Penalización: 0%. SLA 95.0%.',
      },
    ]

    const task = makeTask('PERSEPHONE', {
      title: 'Comparativa de costos',
      context: { documents: docs },
    })

    const result = await persephone.receiveTask(task)
    expect(result.success).toBe(true)
    const data = result.data as any
    expect(data.items).toHaveLength(3)

    const alfa = data.items.find((i: any) => i.filename === 'propuesta_alfa.txt')
    expect(alfa.amount).toBe(10000)
    expect(alfa.currency).toBe('USD')
    expect(alfa.penalty).toBe(5)
    expect(alfa.deliveryDays).toBe(15)
    expect(alfa.sla).toContain('99.9%')

    const gamma = data.items.find((i: any) => i.filename === 'propuesta_gamma.txt')
    expect(gamma.amount).toBe(8500)
    expect(gamma.penalty).toBe(0)
    expect(gamma.riskNote).toContain('CRÍTICO')

    expect(data.priceVariance).toBe(5500) // 14,000 - 8,500 = 5,500
    // Alpha must be recommended because Gamma has critical risk (0% penalty / sin garantía)
    expect(data.recommendedOption).toBe('propuesta_alfa.txt')
  })
})
