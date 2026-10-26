import { EventEmitter } from 'events';

export type BusEventType =
  | 'mission:created'
  | 'mission:status'
  | 'task:created'
  | 'task:status'
  | 'agent:status'
  | 'cerberus:decision'
  | 'cerberus:audit'
  | 'near:submission'
  | 'escalation:created'
  | 'escalation:resolved'
  | 'system:log';

class MissionBus extends EventEmitter {
  private static instance: MissionBus;

  private constructor() {
    super();
    this.setMaxListeners(50);
  }

  static getInstance(): MissionBus {
    if (!MissionBus.instance) {
      MissionBus.instance = new MissionBus();
    }
    return MissionBus.instance;
  }

  publish(event: BusEventType, payload: unknown): void {
    this.emit(event, { event, payload, timestamp: Date.now() });
    this.emit('*', { event, payload, timestamp: Date.now() });
  }

  subscribe(event: BusEventType | '*', handler: (data: { event: string; payload: unknown; timestamp: number }) => void): void {
    this.on(event, handler);
  }

  unsubscribe(event: BusEventType | '*', handler: (data: { event: string; payload: unknown; timestamp: number }) => void): void {
    this.off(event, handler);
  }
}

export const bus = MissionBus.getInstance();
