import { EventEmitter } from 'events'
import type { ServerEvent } from '../types/index.js'

type EventHandler = (event: ServerEvent) => void

export class MissionBus extends EventEmitter {
  private static instance: MissionBus

  static getInstance(): MissionBus {
    if (!MissionBus.instance) {
      MissionBus.instance = new MissionBus()
      MissionBus.instance.setMaxListeners(50)
    }
    return MissionBus.instance
  }

  publish(event: ServerEvent): void {
    this.emit('event', event)
    this.emit(event.type, event.payload)
  }

  subscribe(handler: EventHandler): () => void {
    this.on('event', handler)
    return () => this.off('event', handler)
  }

  subscribeToType<T extends ServerEvent['type']>(
    type: T,
    handler: (payload: Extract<ServerEvent, { type: T }>['payload']) => void,
  ): () => void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.on(type, handler as any)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return () => this.off(type, handler as any)
  }
}

export const bus = MissionBus.getInstance()
