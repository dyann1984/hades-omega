import { describe, it, expect } from 'vitest'
import { CapabilityRegistry, CANONICAL_CAPABILITIES, defaultCapabilityRegistry } from './registry.js'

describe('CapabilityRegistry', () => {
  it('loads canonical capabilities with all required fields', () => {
    const caps = defaultCapabilityRegistry.getAllCapabilities()
    expect(caps.length).toBeGreaterThanOrEqual(10)

    for (const cap of caps) {
      expect(cap.id).toMatch(/^cap:[a-z0-9:-]+@\d+\.\d+\.\d+$/)
      expect(cap.name).toBeTruthy()
      expect(cap.agent).toBeTruthy()
      expect(cap.version).toMatch(/^\d+\.\d+\.\d+$/)
      expect(cap.inputTypes.length).toBeGreaterThan(0)
      expect(cap.outputTypes.length).toBeGreaterThan(0)
      expect(cap.requiredPermissions.length).toBeGreaterThan(0)
      expect(cap.requiredResources.length).toBeGreaterThan(0)
      expect(cap.preconditions.length).toBeGreaterThan(0)
      expect(cap.sideEffects.length).toBeGreaterThan(0)
      expect(typeof cap.requiresApproval).toBe('boolean')
      expect(['AVAILABLE', 'BUSY', 'MAINTENANCE', 'DISABLED']).toContain(cap.availability)
      expect(cap.limits.timeoutMs).toBeGreaterThan(0)
      expect(cap.limits.maxPayloadBytes).toBeGreaterThan(0)
    }
  })

  it('rejects registering capabilities for unknown agents or invalid IDs', () => {
    const reg = new CapabilityRegistry([])
    expect(() => {
      reg.registerCapability({
        id: 'cap:fake@1.0.0',
        name: 'Fake',
        version: '1.0.0',
        agent: 'NON_EXISTENT' as any,
        description: 'invalid',
        inputTypes: ['text/plain'],
        outputTypes: ['text/plain'],
        requiredPermissions: ['OPERATOR'],
        requiredResources: ['CPU'],
        preconditions: ['NONE'],
        sideEffects: ['NONE'],
        requiresApproval: false,
        availability: 'AVAILABLE',
        limits: { timeoutMs: 1000, maxPayloadBytes: 1000 },
      })
    }).toThrow(/UNKNOWN_AGENT/)

    expect(() => {
      reg.registerCapability({
        id: 'no-version-cap',
        name: 'Invalid ID',
        version: '1.0.0',
        agent: 'CHARON',
        description: 'invalid',
        inputTypes: ['text/plain'],
        outputTypes: ['text/plain'],
        requiredPermissions: ['OPERATOR'],
        requiredResources: ['CPU'],
        preconditions: ['NONE'],
        sideEffects: ['NONE'],
        requiresApproval: false,
        availability: 'AVAILABLE',
        limits: { timeoutMs: 1000, maxPayloadBytes: 1000 },
      })
    }).toThrow(/INVALID_CAPABILITY_ID/)
  })

  it('queries capabilities by agent and finds compatible agents', () => {
    const charonCaps = defaultCapabilityRegistry.getCapabilitiesByAgent('CHARON')
    expect(charonCaps.some(c => c.id === 'cap:doc:intake@1.0.0')).toBe(true)

    const minosCaps = defaultCapabilityRegistry.getCapabilitiesByAgent('MINOS')
    expect(minosCaps.some(c => c.id === 'cap:doc:validate@1.0.0')).toBe(true)

    const tartarusCaps = defaultCapabilityRegistry.getCapabilitiesByAgent('TARTARUS')
    expect(tartarusCaps.some(c => c.id === 'cap:crypto:hash@1.0.0')).toBe(true)

    const compatibleForHash = defaultCapabilityRegistry.findCompatibleAgents('cap:crypto:hash@1.0.0')
    expect(compatibleForHash).toContain('TARTARUS')
    expect(compatibleForHash).toContain('HADES')
    expect(compatibleForHash).not.toContain('CHARON')
    expect(compatibleForHash).not.toContain('MINOS')
  })

  it('allows reassignment between genuinely compatible executors (HADES <-> TARTARUS for SHA-256)', () => {
    const check1 = defaultCapabilityRegistry.canReassign('HADES', 'TARTARUS', 'cap:crypto:hash@1.0.0')
    expect(check1.allowed).toBe(true)
    expect(check1.targetCapability?.agent).toBe('TARTARUS')

    const check2 = defaultCapabilityRegistry.canReassign('TARTARUS', 'HADES', 'cap:crypto:hash@1.0.0')
    expect(check2.allowed).toBe(true)
    expect(check2.targetCapability?.agent).toBe('HADES')
  })

  it('strictly blocks reassignment when target agent does NOT implement the capability (BLOCKED_BY_DESIGN)', () => {
    // Attempting to reassign validation from MINOS to PERSEPHONE
    const check = defaultCapabilityRegistry.canReassign('MINOS', 'PERSEPHONE', 'cap:doc:validate@1.0.0')
    expect(check.allowed).toBe(false)
    expect(check.reason).toContain('BLOCKED_BY_DESIGN')
    expect(check.reason).toContain('PERSEPHONE')

    // Attempting to reassign multi-document comparison from PERSEPHONE to CHARON
    const check2 = defaultCapabilityRegistry.canReassign('PERSEPHONE', 'CHARON', 'cap:doc:compare@1.0.0')
    expect(check2.allowed).toBe(false)
    expect(check2.reason).toContain('BLOCKED_BY_DESIGN')

    // Attempting to reassign to self
    const checkSelf = defaultCapabilityRegistry.canReassign('CHARON', 'CHARON', 'cap:doc:intake@1.0.0')
    expect(checkSelf.allowed).toBe(false)
    expect(checkSelf.reason).toContain('REASSIGN_SAME_AGENT')
  })
})
