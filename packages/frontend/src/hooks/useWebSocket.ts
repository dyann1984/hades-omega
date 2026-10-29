import { useEffect, useRef } from 'react'
import { useHadesStore } from '../store/index.js'
import { websocketToken } from '../lib/api.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const VITE_WS_URL = (import.meta as any).env?.VITE_WS_URL as string | undefined
const IS_LOCAL = typeof window !== 'undefined'
  && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')

// Only attempt WS if on localhost or an explicit WS URL is configured
const SHOULD_CONNECT = IS_LOCAL || !!VITE_WS_URL
// Use Vite's same-origin proxy so REST and WebSocket reach the same API.
const WS_URL = VITE_WS_URL ?? (typeof window === 'undefined' ? '' : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`)

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
    let stopped = false
    connect(() => stopped)
    return () => {
      stopped = true
      if (timerRef.current) clearTimeout(timerRef.current)
      wsRef.current?.close()
    }
  }, [])

  function connect(isStopped: () => boolean): void {
    if (isStopped()) return
    try {
      const target = new URL(WS_URL, window.location.href)
      const local = target.hostname === 'localhost' || target.hostname === '127.0.0.1' || target.hostname === '[::1]'
      if (target.protocol !== 'wss:' && !(target.protocol === 'ws:' && local)) {
        store.setWsConnected(false)
        return
      }
      const ws = new WebSocket(target)
      wsRef.current = ws

      ws.onopen = () => {
        const token = websocketToken()
        if (!token) { ws.close(); return }
        ws.send(JSON.stringify({ type: 'AUTH', token }))
      }

      ws.onclose = () => {
        store.setWsConnected(false)
        if (!isStopped()) timerRef.current = setTimeout(() => connect(isStopped), 3000)
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
      case 'CONNECTED':
        store.setWsConnected(true)
        // Re-read authorized snapshots after initial connection and reconnection.
        window.dispatchEvent(new Event('hades:mission-update'))
        pingInterval()
        break
      case 'AGENT_STATUS_CHANGED': {
        const p = msg.payload as any
        store.setAgentStatus(p.agent, p.status, p.currentTask)
        break
      }
      case 'MISSION_PROGRESS': {
        window.dispatchEvent(new Event('hades:mission-update'))
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
        window.dispatchEvent(new Event('hades:mission-update'))
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
      case 'EXECUTION_EVENT': {
        const p = msg.payload as { type: string; agentId: string | null; missionId: string; status: string }
        const agentId = p.agentId as import('../store/index.js').AgentName | null
        switch (p.type) {
          case 'task.queued':
            store.setAgentStatus('HADES', 'EXECUTING', `mission:${p.missionId}`)
            break
          case 'agent.started':
            if (agentId) store.setAgentStatus(agentId, 'EXECUTING', `mission:${p.missionId}`)
            break
          case 'agent.completed':
            if (agentId) store.setAgentStatus(agentId, 'IDLE', null)
            break
          case 'agent.failed':
            if (agentId) store.setAgentStatus(agentId, 'ERROR', null)
            break
          case 'cerberus.blocked':
            store.setAgentStatus('CERBERUS', 'ERROR', null)
            break
          case 'cerberus.escalated':
          case 'approval.requested':
            store.setAgentStatus('CERBERUS', 'WAITING', null)
            break
          case 'approval.granted':
            store.setAgentStatus('CERBERUS', 'IDLE', null)
            break
          case 'approval.denied':
            store.setAgentStatus('CERBERUS', 'ERROR', null)
            break
          case 'mission.completed':
            store.setAgentStatus('HADES', 'IDLE', null)
            window.dispatchEvent(new Event('hades:mission-update'))
            break
          case 'mission.failed':
            store.setAgentStatus('HADES', 'ERROR', null)
            window.dispatchEvent(new Event('hades:mission-update'))
            break
        }
        break
      }
    }
  }
}
