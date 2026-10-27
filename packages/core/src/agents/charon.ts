import { v4 as uuidv4 } from 'uuid'
import type { Task, TaskResult, VendorEvaluation, PurchaseOrderProposal } from '../types/index.js'
import { AgentBase, type AgentDependencies } from './base.js'

const DEMO_VENDORS = [
  { vendorId: 'cloudpro-premium',   name: 'CloudPro Premium',   price: 78500, priceScore: 45, qualityScore: 95, deliveryScore: 90, compliant: true  },
  { vendorId: 'cloudpro-standard',  name: 'CloudPro Standard',  price: 42000, priceScore: 75, qualityScore: 80, deliveryScore: 85, compliant: true  },
  { vendorId: 'techvision',         name: 'TechVision Corp',     price: 38000, priceScore: 82, qualityScore: 78, deliveryScore: 80, compliant: true  },
  { vendorId: 'inframax',           name: 'InfraMax Solutions',  price: 29500, priceScore: 90, qualityScore: 72, deliveryScore: 75, compliant: true  },
  { vendorId: 'unregistered-corp',  name: 'Proveedor No Aprobado', price: 25000, priceScore: 95, qualityScore: 65, deliveryScore: 60, compliant: false },
]

export class CharonAgent extends AgentBase {
  constructor(deps: AgentDependencies) {
    super('CHARON', deps)
  }

  async receiveTask(task: Task): Promise<TaskResult> {
    this.currentTask = task
    this.setStatus('THINKING', task.title)

    await delay(800)

    const evaluations = await this.evaluateVendors(task)
    const bestVendor  = evaluations.find(v => v.recommendation === 'APPROVE')
      ?? evaluations.find(v => v.recommendation === 'ESCALATE')
      ?? evaluations[0]!

    this.setStatus('EXECUTING', 'Generando orden de compra')
    await delay(500)

    const { decision, auditId } = await this.proposeOperation(
      'PURCHASE_ORDER',
      {
        vendorId:     bestVendor.vendorId,
        vendorName:   bestVendor.vendorName,
        totalAmount:  bestVendor.price,
        currency:     'MXN',
        justification: `Proveedor seleccionado con puntuación total ${bestVendor.totalScore}/100`,
      } satisfies Partial<PurchaseOrderProposal>,
      task.missionId,
      task.id,
      { budgetLimit: 50000, vendorAllowlist: this.deps.guard.getPolicy().vendorAllowlist },
    )

    this.setStatus('IDLE')
    this.currentTask = null

    return {
      taskId:      task.id,
      success:     decision.outcome !== 'DENY',
      summary:     this.buildSummary(decision.outcome, bestVendor),
      data:        { simulated: true, evaluations, selectedVendor: bestVendor, decision },
      cerberusIds: [auditId],
    }
  }

  private async evaluateVendors(task: Task): Promise<VendorEvaluation[]> {
    await delay(600)
    return DEMO_VENDORS.map(v => {
      const total =
        v.priceScore   * 0.4 +
        v.qualityScore * 0.3 +
        v.deliveryScore * 0.2 +
        (v.compliant ? 100 : 0) * 0.1

      const rec: VendorEvaluation['recommendation'] =
        !v.compliant    ? 'REJECT'
        : v.price > 50000 ? 'REJECT'
        : v.price > 30000 ? 'ESCALATE'
        : 'APPROVE'

      return {
        vendorId:       v.vendorId,
        vendorName:     v.name,
        price:          v.price,
        priceScore:     v.priceScore,
        qualityScore:   v.qualityScore,
        deliveryScore:  v.deliveryScore,
        complianceOk:   v.compliant,
        totalScore:     Math.round(total),
        recommendation: rec,
        notes:          rec === 'REJECT' && !v.compliant ? 'Proveedor no en lista aprobada' : '',
      } satisfies VendorEvaluation
    })
  }

  private buildSummary(outcome: string, vendor: VendorEvaluation): string {
    switch (outcome) {
      case 'PERMIT':   return `Orden de compra aprobada para ${vendor.vendorName} — $${vendor.price.toLocaleString()} MXN [DEMO]`
      case 'ESCALATE': return `Orden de compra escalada para revisión humana — $${vendor.price.toLocaleString()} MXN [DEMO]`
      case 'DENY':     return `Orden de compra rechazada — $${vendor.price.toLocaleString()} MXN supera el límite`
      default:         return 'Evaluación completada'
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms))
}
