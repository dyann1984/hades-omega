import { AgentBase } from './base.js';
import type { ElysiumPlan, Task, TaskResult } from '../types.js';

export class ElysiumAgent extends AgentBase {
  constructor() {
    super('ELYSIUM', '📊', 'Planning & Optimization', 'Optimizes resource allocation, schedules tasks on the critical path, and identifies bottlenecks across active missions.');
  }

  async execute(task: Task): Promise<TaskResult> {
    this.setStatus('THINKING', 'Analyzing mission scope and constraints');
    this.log(`ELYSIUM computing execution plan for mission ${task.missionId.slice(0, 8)}`);

    await this.sleep(700);
    this.setStatus('EXECUTING', 'Calculating critical path');

    const plan = this.computeExecutionPlan(task);

    await this.sleep(500);
    this.setStatus('IDLE');
    this.log(
      `Plan ready: ${plan.criticalPath.join(' → ')} | Risk: ${plan.riskLevel} | Score: ${plan.planScore}/100`
    );

    return {
      success: true,
      summary: `Execution plan generated. Critical path: ${plan.criticalPath.join(' → ')}. Risk: ${plan.riskLevel}. Score: ${plan.planScore}/100. Est. duration: ${Math.round(plan.estimatedDurationMs / 1000)}s.`,
      data: plan,
    };
  }

  private computeExecutionPlan(task: Task): ElysiumPlan {
    const desc = task.description.toLowerCase();
    const budgetMatch = task.description.match(/\$?\s*([\d,]+(?:\.\d+)?)\s*MXN/i);
    const estimatedAmount = budgetMatch ? parseFloat(budgetMatch[1].replace(/,/g, '')) : 50000;

    const riskLevel: ElysiumPlan['riskLevel'] =
      estimatedAmount > 40000 ? 'HIGH' : estimatedAmount > 20000 ? 'MEDIUM' : 'LOW';

    const criticalPath: string[] = ['ELYSIUM'];
    if (desc.includes('vendor') || desc.includes('procurement') || desc.includes('purchase') || desc.includes('server')) {
      criticalPath.push('CHARON');
    }
    if (desc.includes('budget') || desc.includes('finance') || estimatedAmount > 0) {
      criticalPath.push('PERSEPHONE');
    }
    if (riskLevel !== 'LOW') {
      criticalPath.push('MINOS');
    }
    criticalPath.push('TARTARUS');

    const agentTimes: Record<string, number> = {
      ELYSIUM: 1200,
      CHARON: 3500,
      PERSEPHONE: 1800,
      MINOS: riskLevel === 'HIGH' ? 120000 : 30000,
      TARTARUS: 1200,
    };

    const estimatedDurationMs = criticalPath.reduce((sum, a) => sum + (agentTimes[a] ?? 1000), 0);

    const bottlenecks: string[] = [];
    if (riskLevel === 'HIGH') {
      bottlenecks.push(`High-value operation (${estimatedAmount.toLocaleString()} MXN) — MINOS human approval required`);
    }
    if (estimatedAmount > 40000) {
      bottlenecks.push('Budget commitment > 80% utilization — PERSEPHONE may trigger ESCALATE');
    }
    if (!desc.includes('vendor') && !desc.includes('server')) {
      bottlenecks.push('Vendor pool not specified — CHARON evaluation scope uncertain');
    }

    const suggestions: string[] = [
      'Pre-qualify compliant vendors to accelerate CHARON scoring',
      'Split large procurements into batches < 10,000 MXN to reduce MINOS overhead',
    ];
    if (riskLevel === 'HIGH') {
      suggestions.unshift(`CRITICAL: Human operator must be available to approve ${estimatedAmount.toLocaleString()} MXN operation`);
    }

    const planScore = Math.max(
      20,
      100
        - bottlenecks.length * 15
        - (riskLevel === 'HIGH' ? 20 : riskLevel === 'MEDIUM' ? 10 : 0)
    );

    return {
      missionId: task.missionId,
      criticalPath,
      estimatedDurationMs,
      resourceRequirements: {
        agents: criticalPath,
        estimatedCost: estimatedAmount,
        currency: 'MXN',
      },
      bottlenecks,
      optimizationSuggestions: suggestions,
      riskLevel,
      planScore,
    };
  }
}
