import { useEffect, useRef } from 'react';
import { useHadesStore } from './store.js';
import type { WSMessage } from './types.js';

const WS_URL = import.meta.env.VITE_WS_URL
  ? `${import.meta.env.VITE_WS_URL}/ws`
  : `ws://${window.location.hostname}:3001/ws`;

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
          addLog('info', 'WS', `Connected to HADES OMEGA backend`);
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
          addLog('warn', 'WS', 'WebSocket error');
        };

        ws.onclose = () => {
          setConnected(false);
          wsRef.current = null;
          if (reconnectCount.current < MAX_RECONNECTS) {
            reconnectCount.current++;
            addLog('warn', 'WS', `Reconnecting (${reconnectCount.current}/${MAX_RECONNECTS})…`);
            timeoutId = setTimeout(connect, RECONNECT_DELAY);
          } else {
            addLog('error', 'WS', 'Max reconnections reached. Reload the page.');
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
