import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { bus } from './mission-bus.js';
import { hadesAgent } from './agents/hades.js';
import { minosAgent } from './agents/minos.js';
import { getRecentAuditRecords, getMissions } from './db.js';
import { near } from './near.js';
import type { WebSocketMessage } from './types.js';

const PORT = parseInt(process.env.API_PORT ?? '3001', 10);
const HOST = '0.0.0.0';

const app = Fastify({ logger: { level: 'warn' } });

await app.register(cors, {
  origin: true,
  credentials: true,
});

await app.register(websocket);

type WS = { readyState: number; send: (data: string) => void };
const wsClients = new Set<WS>();

function broadcast(msg: WebSocketMessage): void {
  const payload = JSON.stringify(msg);
  for (const client of wsClients) {
    if (client.readyState === 1 /* OPEN */) {
      client.send(payload);
    }
  }
}

function publishToWS(type: WebSocketMessage['type']) {
  return (data: { event: string; payload: unknown; timestamp: number }) => {
    broadcast({ type, payload: data.payload, timestamp: data.timestamp });
  };
}

bus.subscribe('mission:created', publishToWS('MISSION_UPDATE'));
bus.subscribe('mission:status', publishToWS('MISSION_UPDATE'));
bus.subscribe('task:created', publishToWS('TASK_UPDATE'));
bus.subscribe('task:status', publishToWS('TASK_UPDATE'));
bus.subscribe('agent:status', publishToWS('AGENT_STATUS'));
bus.subscribe('cerberus:decision', publishToWS('CERBERUS_EVENT'));
bus.subscribe('cerberus:audit', publishToWS('AUDIT_RECORD'));
bus.subscribe('near:submission', publishToWS('NEAR_EVENT'));
bus.subscribe('escalation:created', publishToWS('ESCALATION'));
bus.subscribe('escalation:resolved', publishToWS('ESCALATION'));
bus.subscribe('system:log', publishToWS('LOG'));

app.get('/ws', { websocket: true }, (socket) => {
  const ws = socket as unknown as WS;
  wsClients.add(ws);

  const initMsg: WebSocketMessage = {
    type: 'SYSTEM',
    payload: {
      message: 'HADES OMEGA connected',
      nearStatus: near.getConnectionStatus(),
      agentStates: hadesAgent.getAllAgentStates(),
    },
    timestamp: Date.now(),
  };
  ws.send(JSON.stringify(initMsg));

  socket.on('close', () => wsClients.delete(ws));
  socket.on('error', () => wsClients.delete(ws));
});

app.post('/api/missions', async (req, reply) => {
  const body = req.body as { text?: string } | null;
  const text = body?.text?.trim();
  if (!text || text.length < 10) {
    return reply.status(400).send({ error: 'Mission text must be at least 10 characters' });
  }
  const mission = await hadesAgent.receiveMission(text);
  return reply.status(201).send(mission);
});

app.get('/api/missions', async (_req, reply) => {
  return reply.send(getMissions(20));
});

app.get('/api/agents', async (_req, reply) => {
  return reply.send(hadesAgent.getAllAgentStates());
});

app.get('/api/audit', async (req, reply) => {
  const query = req.query as { limit?: string };
  const limit = Math.min(parseInt(query.limit ?? '30', 10), 100);
  return reply.send(getRecentAuditRecords(limit));
});

app.get('/api/budget', async (_req, reply) => {
  return reply.send(hadesAgent.getPersephoneBudgetStatus());
});

app.get('/api/near/status', async (_req, reply) => {
  return reply.send(near.getConnectionStatus());
});

app.post('/api/escalations/:id/resolve', async (req, reply) => {
  const { id } = req.params as { id: string };
  const body = req.body as { approved?: boolean } | null;
  const approved = body?.approved !== false;
  const resolved = minosAgent.resolveEscalation(id, approved);
  if (!resolved) {
    return reply.status(404).send({ error: 'Escalation not found or already resolved' });
  }
  return reply.send({ success: true, escalationId: id, approved });
});

app.get('/api/escalations', async (_req, reply) => {
  return reply.send(minosAgent.getPendingEscalations());
});

app.get('/health', async (_req, reply) => {
  return reply.send({
    status: 'ok',
    service: 'HADES OMEGA API',
    version: '0.1.0',
    timestamp: Date.now(),
  });
});

try {
  await app.listen({ port: PORT, host: HOST });
  console.log(`\n  ╔══════════════════════════════════════╗`);
  console.log(`  ║     HADES OMEGA — API Gateway        ║`);
  console.log(`  ║     http://localhost:${PORT}            ║`);
  console.log(`  ║     ws://localhost:${PORT}/ws           ║`);
  console.log(`  ║     NEAR Mode: ${(process.env.NEAR_EXECUTION_MODE ?? 'simulation').padEnd(21)}║`);
  console.log(`  ╚══════════════════════════════════════╝\n`);
} catch (err) {
  console.error('Failed to start server:', err);
  process.exit(1);
}
