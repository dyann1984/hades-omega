import Database from 'better-sqlite3'
import { describe, it, expect } from 'vitest'
import { CerberusGUARD } from '@hades/core'
import { NearIntentStore, canonicalIntent, isAllowedNearTransition } from './near-intents.js'
const params={network:'testnet',signerId:'source.testnet',receiverId:'audit.testnet',type:'AUDIT_HASH',amountYocto:'0',auditId:'a-1',contentHash:'a'.repeat(64),operationType:'PLANNING',agentName:'HADES',decision:'PERMIT',timestampMs:1700000000000,gas:'30000000000000'} as const

describe('persistent NEAR intent approval',()=>{
  it('defines legal transitions and rejects shortcuts and terminal state changes',()=>{
    expect(isAllowedNearTransition('DRAFT','PENDING_APPROVAL')).toBe(true)
    expect(isAllowedNearTransition('DRAFT','SIGNING')).toBe(false)
    expect(isAllowedNearTransition('BROADCAST_PENDING','RECONCILIATION_REQUIRED')).toBe(true)
    expect(isAllowedNearTransition('RECONCILIATION_REQUIRED','CONFIRMED')).toBe(true)
    expect(isAllowedNearTransition('CONFIRMED','BROADCAST_PENDING')).toBe(false)
  })
  it('binds the complete operation and denies unknown types, extra fields and mainnet',()=>{
    const hash=canonicalIntent(params).hash
    expect(canonicalIntent({...params,receiverId:'other.testnet'}).hash).not.toBe(hash)
    for (const input of [{...params,type:'TRANSFER'},{...params,network:'mainnet'},{...params,amountYocto:'1'},{...params,extra:'ignored'}]) expect(()=>canonicalIntent(input)).toThrow('INVALID_INTENT')
  })
  it('records a one-use approval, rejects modification and survives a store restart',()=>{
    const db=new Database(':memory:'), guard=new CerberusGUARD(); let store=new NearIntentStore(db,guard)
    const draft=store.create(params,'operator'); expect(draft.status).toBe('DRAFT')
    expect(()=>store.claimForSigning(draft.id,draft.hash,'executor')).toThrow('INVALID_STATE')
    store.requestApproval(draft.id,'operator')
    expect(()=>store.approve(draft.id,'0'.repeat(64),'admin',Date.now()+60000)).toThrow('INTENT_CHANGED')
    const approved=store.approve(draft.id,draft.hash,'admin',Date.now()+60000);expect(approved.approvedBy).toBe('admin')
    store=new NearIntentStore(db,guard)
    expect(store.get(draft.id)?.approvalId).toBe(approved.approvalId)
    expect(()=>store.claimForSigning(draft.id,'b'.repeat(64),'executor')).toThrow('INTENT_CHANGED')
    expect(store.claimForSigning(draft.id,draft.hash,'executor').status).toBe('SIGNING')
    expect(()=>store.claimForSigning(draft.id,draft.hash,'executor')).toThrow('INVALID_STATE')
    db.close()
  })
  it('blocks expired approvals, policy changes and emergency stop',()=>{
    const db=new Database(':memory:'),guard=new CerberusGUARD(),store=new NearIntentStore(db,guard)
    const make=()=>{const d=store.create(params,'operator');store.requestApproval(d.id,'operator');return d}
    const a=make();store.approve(a.id,a.hash,'admin',Date.now()+60000);store.setEmergency(true,'admin')
    expect(()=>store.claimForSigning(a.id,a.hash,'executor')).toThrow('EMERGENCY_STOP')
    store.setEmergency(false,'admin');guard.updatePolicy({vendorAllowlist:['changed']})
    expect(()=>store.claimForSigning(a.id,a.hash,'executor')).toThrow('INTENT_CHANGED')
    const b=make();store.approve(b.id,b.hash,'admin',Date.now()+60000)
    db.prepare('UPDATE near_intents SET expires_at=1 WHERE id=?').run(b.id)
    expect(()=>store.claimForSigning(b.id,b.hash,'executor')).toThrow('APPROVAL_EXPIRED')
    db.close()
  })
  it('detects stored parameter tampering after approval',()=>{
    const db=new Database(':memory:'),store=new NearIntentStore(db,new CerberusGUARD())
    const draft=store.create(params,'operator');store.requestApproval(draft.id,'operator');store.approve(draft.id,draft.hash,'admin',Date.now()+60000)
    db.prepare('UPDATE near_intents SET params=? WHERE id=?').run(JSON.stringify({...params,receiverId:'other.testnet'}),draft.id)
    expect(()=>store.claimForSigning(draft.id,draft.hash,'executor')).toThrow('INTENT_CHANGED')
    db.close()
  })
  it('cancels or rejects without allowing a later approval or claim',()=>{
    const db=new Database(':memory:'),store=new NearIntentStore(db,new CerberusGUARD())
    const draft=store.create(params,'operator');store.requestApproval(draft.id,'operator')
    expect(store.resolve(draft.id,'REJECTED','admin').status).toBe('REJECTED')
    expect(()=>store.approve(draft.id,draft.hash,'admin',Date.now()+60000)).toThrow('INVALID_STATE')
    const next=store.create(params,'operator');store.requestApproval(next.id,'operator');store.approve(next.id,next.hash,'admin',Date.now()+60000)
    expect(store.resolve(next.id,'CANCELLED','admin').status).toBe('CANCELLED')
    expect(()=>store.claimForSigning(next.id,next.hash,'executor')).toThrow('INVALID_STATE')
    db.close()
  })
})
