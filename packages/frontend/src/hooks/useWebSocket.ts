import { useEffect, useRef } from 'react'
import { useHadesStore } from '../store/index.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const VITE_WS_URL = (import.meta as any).env?.VITE_WS_URL as string | undefined
const IS_LOCAL = typeof window !== 'undefined'
  && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')

// Only attempt WS if on localhost or an explicit WS URL is configured
const SHOULD_CONNECT = IS_LOCAL || !!VITE_WS_URL
const WS_URL = VITE_WS_URL ?? 'ws://localhost:3001/ws'

export function useWebSocket(): void {
  const store     = useHadesStore()
  const wsRef     = useRef<WebSocket | null>(null)
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!SHOULD_CONNECT) {
      // Serverless mode — no persistent WS server available (Vercel)
      useHadesStore.getState().setServerlessMode(true)
      return
    }
    connect()
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      wsRef.current?.close()
    }
  }, [])

  function connect(): void {
    try {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        store.setWsConnected(true)
        pingInterval()
      }

      ws.onclose = () => {
        store.setWsConnected(false)
        timerRef.current = setTimeout(connect, 3000)
      }

      ws.onerror = () => {
        ws.close()
      }

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string)
          handleEvent(msg)
        } catch {}
      }
    } catch {}
  }

  function pingInterval(): void {
    timerRef.current = setTimeout(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'PING' }))
        pingInterval()
      }
    }, 25000)
  }

  function handleEvent(msg: Record<string, unknown>): void {
    switch (msg.type) {
      case 'AGENT_STATUS_CHANGED': {
        const p = msg.payload as any
        store.setAgentStatus(p.agent, p.status, p.currentTask)
        break
      }
      case 'MISSION_PROGRESS': {
        const p = msg.payload as any
        store.updateMission(p.missionId, { status: p.status, progress: p.progress })
        break
      }
      case 'CERBERUS_DECISION': {
        const p = msg.payload as any
        store.addAuditRecord(p.auditRecord)
        break
      }
      case 'ESCALATION_CREATED': {
        const p = msg.payload as any
        store.addEscalation(p.escalation)
        break
      }
      case 'NEAR_TX_CONFIRMED': {
        const p = msg.payload as any
        store.addNearTx({ auditId: p.auditId, txHash: p.txHash, explorerUrl: p.explorerUrl })
        break
      }
      case 'TASK_UPDATED': {
        const p = msg.payload as any
        if (p.task?.missionId) {
          const mission = useHadesStore.getState().missions.find(m => m.id === p.task.missionId)
          if (mission) {
            const tasks = mission.tasks.map((t: any) =>
              t.id === p.task.id
                ? { ...t, status: p.task.status, result: p.task.result }
                : t,
            )
            store.updateMission(p.task.missionId, { tasks })
          }
        }
        break
      }
    }
  }
}
