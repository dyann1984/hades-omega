import { useEffect, useRef } from 'react';
import { useHadesStore } from './store.js';
import type { WSMessage } from './types.js';

function getWsUrl(): string {
  // In production: use VITE_WS_URL env var (set at build time by Vercel/CI)
  // In development: proxy via Vite to localhost:3001
  const envWs = (import.meta as { env?: Record<string, string> }).env?.['VITE_WS_URL'];
  if (envWs) {
    return `${envWs}/ws`;
  }
  // Same-host WebSocket (works behind a reverse proxy)
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.hostname;
  const port = window.location.port ? `:${window.location.port}` : '';
  // Dev: explicit backend port
  if (host === 'localhost' || host === '127.0.0.1') {
    return `ws://${host}:3001/ws`;
  }
  return `${proto}//${host}${port}/ws`;
}

const WS_URL = getWsUrl();
const RECONNECT_DELAY = 3000;
const MAX_RECONNECTS = 10;

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCount = useRef(0);
  const { setConnected, handleWSMessage, addLog } = useHadesStore();

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    function connect() {
      try {
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
          setConnected(true);
          reconnectCount.current = 0;
          addLog('info', 'WS', `Connected to HADES OMEGA (${WS_URL})`);
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data as string) as WSMessage;
            handleWSMessage(msg);
          } catch {
            addLog('warn', 'WS', 'Received unparseable message');
          }
        };

        ws.onerror = () => {
          addLog('warn', 'WS', 'WebSocket error — backend may not be running');
        };

        ws.onclose = () => {
          setConnected(false);
          wsRef.current = null;
          if (reconnectCount.current < MAX_RECONNECTS) {
            reconnectCount.current++;
            addLog('warn', 'WS', `Reconnecting (${reconnectCount.current}/${MAX_RECONNECTS})… Use Demo Mode to preview without backend`);
            timeoutId = setTimeout(connect, RECONNECT_DELAY);
          } else {
            addLog('error', 'WS', 'Max reconnections reached. Use Demo Mode or start the backend server.');
          }
        };
      } catch (err) {
        addLog('error', 'WS', `Connection failed: ${err}`);
      }
    }

    connect();

    return () => {
      clearTimeout(timeoutId);
      wsRef.current?.close();
    };
  }, []);

  return wsRef;
}
