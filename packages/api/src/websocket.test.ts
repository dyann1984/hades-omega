import Fastify from 'fastify'
import websocketPlugin from '@fastify/websocket'
import WebSocket from 'ws'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { bus } from '@hades/core'
import { registerSecurity } from './security.js'
import { setupWebSocket } from './websocket.js'

const app = Fastify()
let url: string
const oldSecret = process.env.JWT_SECRET
const next = (ws: WebSocket) => new Promise<any>((resolve, reject) => { ws.once('message', data => resolve(JSON.parse(data.toString()))); ws.once('error', reject) })
const closed = (ws: WebSocket) => new Promise<number>(resolve => ws.once('close', code => resolve(code)))
async function connect() { const ws = new WebSocket(url); await new Promise<void>((resolve, reject) => { ws.once('open', () => resolve()); ws.once('error', reject) }); return ws }
beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret-with-at-least-thirty-two-characters'
  await app.register(websocketPlugin); await registerSecurity(app); setupWebSocket(app)
  const address = await app.listen({ host: '127.0.0.1', port: 0 }); url = address.replace('http:', 'ws:') + '/ws'
})
afterAll(async () => { await app.close(); process.env.JWT_SECRET = oldSecret })
describe('WebSocket security', () => {
  it('rejects invalid authentication and malformed messages', async () => {
    const ws = await connect(); const done = closed(ws); ws.send(JSON.stringify({ type: 'AUTH', token: 'bad' })); expect(await done).toBe(1008)
    const ws2 = await connect(); const done2 = closed(ws2); ws2.send('{'); expect(await done2).toBe(1008)
  })
  it('limits sensitive events to administrators', async () => {
    const viewer = await connect(); const admin = await connect()
    const authenticate = async (ws: WebSocket, role: string) => { const response = next(ws); ws.send(JSON.stringify({ type: 'AUTH', token: app.jwt.sign({ sub: role, roles: [role], exp: Math.floor(Date.now()/1000)+60 }) })); expect((await response).type).toBe('CONNECTED') }
    await authenticate(viewer, 'VIEWER'); await authenticate(admin, 'ADMIN')
    const seen: string[] = []; viewer.on('message', data => seen.push(JSON.parse(data.toString()).type))
    const event = next(admin); bus.publish({ type: 'MISSION_PROGRESS', payload: { missionId: 'private', status: 'IN_PROGRESS', progress: 1 } }); expect((await event).type).toBe('MISSION_PROGRESS')
    const pong = next(viewer); viewer.send(JSON.stringify({ type: 'PING' })); expect((await pong).type).toBe('PONG'); expect(seen).not.toContain('MISSION_PROGRESS')
    viewer.close(); admin.close()
  })
})
