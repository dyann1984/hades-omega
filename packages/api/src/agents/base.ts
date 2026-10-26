import { v4 as uuid } from 'uuid';
import { bus } from '../mission-bus.js';
import { cerberus } from '../cerberus.js';
import type {
  AgentName,
  AgentState,
  AgentStatus,
  CERBERUSGuardResult,
  OperationProposal,
  Task,
  TaskResult,
} from '../types.js';

export abstract class AgentBase {
  readonly name: AgentName;
  protected state: AgentState;

  constructor(name: AgentName, icon: string, role: string, description: string) {
    this.name = name;
    this.state = {
      name,
      status: 'IDLE',
      lastActivity: Date.now(),
      processedTasks: 0,
      icon,
      description,
      role,
    };
  }

  getState(): AgentState {
    return { ...this.state };
  }

  protected setStatus(status: AgentStatus, currentTask?: string): void {
    this.state.status = status;
    this.state.lastActivity = Date.now();
    if (currentTask !== undefined) this.state.currentTask = currentTask;
    bus.publish('agent:status', this.getState());
  }

  protected async propose(
    operationType: string,
    description: string,
    metadata: Record<string, unknown>,
    amount?: number,
    currency = 'MXN'
  ): Promise<{ guardResult: CERBERUSGuardResult; proposal: OperationProposal }> {
    const proposal: OperationProposal = {
      id: uuid(),
      agentName: this.name,
      operationType,
      description,
      amount,
      currency,
      metadata,
      timestamp: Date.now(),
    };

    this.setStatus('EXECUTING', `CERBERUS review: ${operationType}`);
    const guardResult = await cerberus.guard(proposal);
    return { guardResult, proposal };
  }

  abstract execute(task: Task): Promise<TaskResult>;

  protected log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    bus.publish('system:log', {
      level,
      source: this.name,
      message,
    });
  }

  protected sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
