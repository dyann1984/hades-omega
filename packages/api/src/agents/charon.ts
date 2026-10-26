import { AgentBase } from './base.js';
import { cerberus } from '../cerberus.js';
import { completeJSON } from '../llm.js';
import type { Task, TaskResult, VendorEvaluation } from '../types.js';

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

    const auditRecord = await cerberus.audit(proposal, guardResult);

    if (guardResult.decision === 'DENY') {
      this.log(`Purchase order denied: ${guardResult.reason}. Re-evaluating...`, 'warn');
      this.setStatus('THINKING', 'Searching alternative vendor');
      await this.sleep(600);

      const alternative = evaluations.find(e => e.price < 50000 && e.price !== best.price) ?? evaluations[1];
      const { guardResult: g2, proposal: p2 } = await this.propose(
        'PURCHASE_ORDER',
        `Alternative PO for ${alternative.name}: ${alternative.price.toLocaleString()} MXN`,
        {
          vendor: alternative.name,
          vendorId: alternative.vendorId,
          isAlternative: true,
          originalDenied: best.name,
        },
        alternative.price,
        'MXN'
      );

      const audit2 = await cerberus.audit(p2, g2);
      this.setStatus('IDLE');
      return {
        success: g2.decision !== 'DENY',
        summary: `Vendor evaluation complete. Original PO denied (${guardResult.reason}). Alternative: ${alternative.name} — ${alternative.price.toLocaleString()} MXN — ${g2.decision}`,
        data: { evaluations, selectedVendor: alternative, primaryDecision: guardResult.decision, finalDecision: g2.decision },
        cerberusAuditId: audit2.id,
        nearTxHash: audit2.nearTxHash,
        nearExplorerUrl: audit2.nearExplorerUrl,
      };
    }

    this.setStatus('IDLE');
    return {
      success: true,
      summary: `Vendor evaluation complete. Selected: ${best.name} — ${best.price.toLocaleString()} MXN — ${guardResult.decision}`,
      data: { evaluations, selectedVendor: best, decision: guardResult.decision },
      cerberusAuditId: auditRecord.id,
      nearTxHash: auditRecord.nearTxHash,
      nearExplorerUrl: auditRecord.nearExplorerUrl,
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
