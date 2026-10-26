import { describe, expect, it } from 'vitest'
import { useHadesStore } from './index.js'

describe('HADES interface state', () => {
  it('exposes exactly six operational agents around HADES CORE', () => {
    const agents = useHadesStore.getState().agents
    const operational = Object.keys(agents).filter(name => name !== 'HADES')
    expect(operational.sort()).toEqual(['CERBERUS', 'CHARON', 'ELYSIUM', 'MINOS', 'PERSEPHONE', 'TARTARUS'])
  })

  it('records a human review without treating approval as execution authorization', () => {
    const store = useHadesStore.getState()
    const id = 'review-test'
    store.addEscalation({
      id,
      fromAgent: 'MINOS',
      operationType: 'VENDOR_CONTRACT',
      reason: 'Human review required',
      priority: 'HIGH',
      createdAt: Date.now(),
      status: 'PENDING',
    })
    store.resolveEscalation(id, 'APPROVED')
    const review = useHadesStore.getState().escalations.find(item => item.id === id)
    expect(review?.status).toBe('APPROVED')
    expect(review?.operationType).toBe('VENDOR_CONTRACT')
  })
})
