import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'node:crypto'
import { bus } from '@hades/core'
import type { ServerEvent } from '@hades/core'
import type { WebSocket } from 'ws'
import type { JsonRepository } from './persistence.js'

interface Claims { sub?: unknown; roles?: unknown; exp?: unknown }
interface WSClient { socket: WebSocket; token: string }
const clients = new Map<string, WSClient>()
const allowedRoles = new Set(['ADMIN', 'OPERATOR', 'AUDITOR', 'VIEWER'])

export function setupWebSocket(app: FastifyInstance, repository?: JsonRepository): void {
  app.get('/ws', { websocket: true }, (socket, request) => {
    const id = randomUUID()
    let token: string | undefined
    let unsubscribe: (() => void) | undefined
    const reject = (reason: string) => {
      request.log.warn({ reason }, 'WebSocket access rejected')
      socket.close(1008, 'Unauthorized or invalid message')
    }
    const claimsFor = (value: string): Claims | null => {
      try {
        const claims = app.jwt.verify<Claims>(value)
        if (typeof claims.sub !== 'string' || !claims.sub.trim() || !Array.isArray(claims.roles) || !claims.roles.some(role => allowedRoles.has(role)) || typeof claims.exp !== 'number' || claims.exp <= Date.now() / 1000) return null
        return claims
      } catch { return null }
    }
    const timeout = setTimeout(() => { if (!token) reject('authentication_timeout') }, 5000)
    socket.on('message', (raw, isBinary) => {
      if (isBinary || !Buffer.isBuffer(raw) || raw.length > 8192) return reject('invalid_message')
      let msg: unknown
      try { msg = JSON.parse(raw.toString()) } catch { return reject('invalid_json') }
      if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return reject('invalid_message')
      const data = msg as Record<string, unknown>
      if (!token) {
        if (data.type !== 'AUTH' || typeof data.token !== 'string' || Object.keys(data).length !== 2 || !claimsFor(data.token)) return reject('authentication_failed')
        token = data.token
        clients.set(id, { socket, token })
        clearTimeout(timeout)
        unsubscribe = bus.subscribe((event: ServerEvent) => {
          const claims = token && claimsFor(token)
          if (!claims) return reject('session_expired')
          if (event.type !== 'SYSTEM_HEARTBEAT' && !(claims.roles as string[]).includes('ADMIN')) {
            const missionId = event.type === 'MISSION_PROGRESS' ? event.payload.missionId : event.type === 'TASK_UPDATED' ? event.payload.task.missionId : undefined
            if (!missionId || !repository || repository.getMission(missionId)?.ownerId !== claims.sub) return
          }
          if (socket.readyState === 1) socket.send(JSON.stringify(event))
        })
        socket.send(JSON.stringify({ type: 'CONNECTED', clientId: id }))
        return
      }
      if (!claimsFor(token)) return reject('session_expired')
      if (data.type === 'PING' && Object.keys(data).length === 1) socket.send(JSON.stringify({ type: 'PONG' }))
      else reject('unsupported_message')
    })
    socket.on('close', () => { clearTimeout(timeout); unsubscribe?.(); clients.delete(id) })
    socket.on('error', () => { clearTimeout(timeout); unsubscribe?.(); clients.delete(id) })
  })
}

// All broadcasts must pass through the per-client authorization in the bus subscriber.
export function broadcastEvent(event: ServerEvent): void { bus.publish(event) }
export function getConnectedClientsCount(): number { return clients.size }

