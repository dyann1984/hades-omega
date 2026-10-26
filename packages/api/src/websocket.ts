import type { FastifyInstance } from 'fastify'
import { bus } from '@hades/core'
import type { ServerEvent } from '@hades/core'

interface WSClient {
  id:               string
  socket:           any
  subscribedMissions: Set<string>
}

const clients = new Map<string, WSClient>()

export function setupWebSocket(app: FastifyInstance): void {
  app.get('/ws', { websocket: true }, (socket, _req) => {
    const clientId = Math.random().toString(36).slice(2)
    const client: WSClient = { id: clientId, socket, subscribedMissions: new Set() }
    clients.set(clientId, client)

    socket.send(JSON.stringify({ type: 'CONNECTED', clientId }))

    const unsubscribe = bus.subscribe((event: ServerEvent) => {
      if (socket.readyState === 1) {
        socket.send(JSON.stringify(event))
      }
    })

    socket.on('message', (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString())
        if (msg.type === 'PING') socket.send(JSON.stringify({ type: 'PONG' }))
      } catch {}
    })

    socket.on('close', () => {
      unsubscribe()
      clients.delete(clientId)
    })
  })
}

export function broadcastEvent(event: ServerEvent): void {
  const msg = JSON.stringify(event)
  clients.forEach(c => {
    if (c.socket.readyState === 1) c.socket.send(msg)
  })
}

export function getConnectedClientsCount(): number {
  return clients.size
}
