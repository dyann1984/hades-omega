import { AgentBase } from './base.js';
import { cerberus } from '../cerberus.js';
import { minosAgent } from './minos.js';
import { completeJSON } from '../llm.js';
import type {
  CERBERUSGuardResult,
  OperationProposal,
  Task,
  TaskResult,
  VendorEvaluation,
} from '../types.js';

const VENDOR_CATALOG = [
  { id: 'v001', name: 'TechServe MX', basePrice: 45000, quality: 88, delivery: 14, compliance: true },
  { id: 'v002', name: 'CloudPro Solutions', basePrice: 38500, quality: 92, delivery: 21, compliance: true },
  { id: 'v003', name: 'ServerHub Nacional', basePrice: 52500, quality: 75, delivery: 7, compliance: false },
];

export class CharonAgent extends AgentBase {
  constructor() {
    super('CHARON', '⚙️', 'Procurement & Vendors', 'Evaluates vendors, compares proposals, generates purchase orders within authorized parameters.');
  }

  async execute(task: Task): Promise<TaskResult> {
    this.setStatus('THINKING', 'Analyzing procurement requirements');
    this.log(`Starting vendor evaluation for task ${task.id.slice(0, 8)}`);

    await this.sleep(800);

    const evaluations = await this.evaluateVendors(task);
    const best = evaluations.sort((a, b) => b.totalScore - a.totalScore)[0];

    this.log(`Best vendor: ${best.name} — score ${best.totalScore.toFixed(1)}/100`);

    const { guardResult, proposal } = await this.propose(
      'PURCHASE_ORDER',
      `Purchase order for ${best.name}: ${best.price.toLocaleString()} MXN`,
      {
        vendor: best.name,
        vendorId: best.vendorId,
        evaluations: evaluations.map(e => ({ name: e.name, score: e.totalScore, recommendation: e.recommendation })),
        justification: best.justification,
      },
      best.price,
      best.currency
    );

    // ── DENY: hard block, try alternative ──────────────────────────────────
    if (guardResult.decision === 'DENY') {
      this.log(`Purchase order denied: ${guardResult.reason}. Re-evaluating...`, 'warn');
      await cerberus.audit(proposal, guardResult);
      this.setStatus('THINKING', 'Searching alternative vendor');
      await this.sleep(600);

      const alternative = evaluations.find(e => e.price < 50000 && e.price !== best.price) ?? evaluations[1];
      const { guardResult: g2, proposal: p2 } = await this.propose(
        'PURCHASE_ORDER',
        `Alternative PO for ${alternative.name}: ${alternative.price.toLocaleString()} MXN`,
        { vendor: alternative.name, vendorId: alternative.vendorId, isAlternative: true, originalDenied: best.name },
        alternative.price,
        'MXN'
      );

      if (g2.decision === 'DENY') {
        const audit2 = await cerberus.audit(p2, g2);
        this.setStatus('IDLE');
        return {
          success: false,
          summary: `All vendor options denied by CERBERUS. ${alternative.name} (${alternative.price.toLocaleString()} MXN) also exceeds policy limits.`,
          data: { evaluations, decision: 'DENIED', reason: g2.reason },
          cerberusAuditId: audit2.id,
        };
      }

      if (g2.decision === 'ESCALATE') {
        return this.handleEscalation(task, alternative, evaluations, g2, p2);
      }

      const audit2 = await cerberus.audit(p2, g2);
      this.setStatus('IDLE');
      return {
        success: true,
        summary: `Original PO denied. Alternative: ${alternative.name} — ${alternative.price.toLocaleString()} MXN — PERMITTED.`,
        data: { evaluations, selectedVendor: alternative, decision: 'PERMIT', originalDenied: best.name },
        cerberusAuditId: audit2.id,
        nearTxHash: audit2.nearTxHash,
        nearExplorerUrl: audit2.nearExplorerUrl,
      };
    }

    // ── ESCALATE: request human approval and BLOCK until resolved ──────────
    if (guardResult.decision === 'ESCALATE') {
      return this.handleEscalation(task, best, evaluations, guardResult, proposal);
    }

    // ── PERMIT: record audit and return ────────────────────────────────────
    const auditRecord = await cerberus.audit(proposal, guardResult);
    this.setStatus('IDLE');
    return {
      success: true,
      summary: `Vendor ${best.name} selected. ${best.price.toLocaleString()} MXN. PERMITTED by CERBERUS.`,
      data: { evaluations, selectedVendor: best, decision: 'PERMIT' },
      cerberusAuditId: auditRecord.id,
      nearTxHash: auditRecord.nearTxHash,
      nearExplorerUrl: auditRecord.nearExplorerUrl,
    };
  }

  private async handleEscalation(
    task: Task,
    vendor: VendorEvaluation,
    evaluations: VendorEvaluation[],
    guardResult: CERBERUSGuardResult,
    proposal: OperationProposal
  ): Promise<TaskResult> {
    this.log(`Purchase order requires human approval: ${guardResult.reason}`, 'warn');

    const { approved, humanApprovedBy, auditRecord: humanAuditRecord } = await minosAgent.requestApproval(
      task.missionId,
      task.id,
      {
        agentName: this.name,
        operationType: 'PURCHASE_ORDER',
        description: `${vendor.name}: ${vendor.price.toLocaleString()} ${vendor.currency} — ${vendor.justification}`,
        amount: vendor.price,
        currency: vendor.currency,
        reason: guardResult.reason,
      }
    );

    if (!approved) {
      this.setStatus('IDLE');
      return {
        success: false,
        summary: `Purchase order REJECTED by human review. Vendor: ${vendor.name}, Amount: ${vendor.price.toLocaleString()} MXN.`,
        data: { evaluations, selectedVendor: vendor, decision: 'REJECTED_BY_HUMAN' },
        cerberusAuditId: humanAuditRecord.id,
        nearTxHash: humanAuditRecord.nearTxHash,
        nearExplorerUrl: humanAuditRecord.nearExplorerUrl,
      };
    }

    // Human approved — create the authorized PURCHASE_ORDER audit (now PERMIT with humanApprovedBy)
    const finalAudit = await cerberus.audit(
      proposal,
      guardResult,
      humanApprovedBy ?? 'operator@hades-omega.demo'
    );

    this.setStatus('IDLE');
    return {
      success: true,
      summary: `Vendor ${vendor.name} selected. ${vendor.price.toLocaleString()} MXN. HUMAN-APPROVED and recorded on NEAR.`,
      data: {
        evaluations,
        selectedVendor: vendor,
        decision: 'APPROVED_BY_HUMAN',
        humanApprovedBy,
        humanAuditRecordId: humanAuditRecord.id,
      },
      cerberusAuditId: finalAudit.id,
      nearTxHash: finalAudit.nearTxHash,
      nearExplorerUrl: finalAudit.nearExplorerUrl,
    };
  }

  private async evaluateVendors(_task: Task): Promise<VendorEvaluation[]> {
    this.setStatus('EXECUTING', 'Evaluating vendor catalog');

    const fallback: VendorEvaluation[] = VENDOR_CATALOG.map(v => {
      const priceScore = Math.max(0, 100 - ((v.basePrice - 35000) / 250));
      const deliveryScore = Math.max(0, 100 - v.delivery * 2);
      const totalScore = priceScore * 0.4 + v.quality * 0.3 + deliveryScore * 0.2 + (v.compliance ? 100 : 0) * 0.1;
      const recommendation = !v.compliance ? 'REJECT' as const : totalScore >= 70 ? 'APPROVE' as const : 'ESCALATE' as const;
      return {
        vendorId: v.id,
        name: v.name,
        price: v.basePrice,
        currency: 'MXN',
        priceScore: Math.round(priceScore),
        qualityScore: v.quality,
        deliveryScore: Math.round(deliveryScore),
        compliance: v.compliance,
        totalScore: Math.round(totalScore * 10) / 10,
        recommendation,
        justification: `${v.name}: Price ${v.basePrice.toLocaleString()} MXN, Quality ${v.quality}/100, Delivery ${v.delivery} days, Compliance: ${v.compliance}`,
      };
    });

    return completeJSON<VendorEvaluation[]>(
      [{ role: 'user', content: `Evaluate these vendors for enterprise server procurement. Return a JSON array with the same structure but with improved justification text. Vendors: ${JSON.stringify(VENDOR_CATALOG)}` }],
      'You are CHARON, an enterprise procurement AI agent. Evaluate vendors objectively and provide business justifications. Return only valid JSON array.',
      fallback
    );
  }
}
