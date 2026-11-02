import Database from 'better-sqlite3'
import { createHash, randomUUID } from 'node:crypto'
import { CerberusGUARD, NEAR_SUBMIT_TOOL } from '@hades/core'
import type { CerberusGate } from './cerberus-gate.js'

export type NearState = 'DRAFT'|'PENDING_APPROVAL'|'APPROVED'|'SIGNING'|'BROADCAST_PENDING'|'BROADCASTED'|'CONFIRMED'|'FAILED'|'REJECTED'|'CANCELLED'|'RECONCILIATION_REQUIRED'
const TRANSITIONS: Record<NearState, readonly NearState[]> = {
  DRAFT:['PENDING_APPROVAL','CANCELLED'], PENDING_APPROVAL:['APPROVED','REJECTED','CANCELLED'],
  APPROVED:['SIGNING','CANCELLED'], SIGNING:['BROADCAST_PENDING','FAILED','RECONCILIATION_REQUIRED'],
  BROADCAST_PENDING:['BROADCASTED','RECONCILIATION_REQUIRED'], BROADCASTED:['CONFIRMED','FAILED','RECONCILIATION_REQUIRED'],
  RECONCILIATION_REQUIRED:['BROADCASTED','CONFIRMED','FAILED'], CONFIRMED:[], FAILED:[], REJECTED:[], CANCELLED:[],
}
export function isAllowedNearTransition(from:NearState, to:NearState):boolean { return TRANSITIONS[from].includes(to) }
export interface AuditIntent { network:'testnet'; signerId:string; receiverId:string; type:'AUDIT_HASH'; amountYocto:'0'; auditId:string; contentHash:string; operationType:string; agentName:string; decision:'PERMIT'|'DENY'|'ESCALATE'; timestampMs:number; gas:string }
export interface NearIntent { id:string; params:AuditIntent; hash:string; status:NearState; policyHash:string; createdAt:number; approvalId:string|null; approvedBy:string|null; approvedAt:number|null; expiresAt:number|null; consumedAt:number|null }

// Construct a fixed-field encoding, rejecting extra arguments so approval covers the entire operation.
export function canonicalIntent(input: unknown): {params:AuditIntent; hash:string} {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_INTENT')
  const o=input as Record<string,unknown>
  const keys=['network','signerId','receiverId','type','amountYocto','auditId','contentHash','operationType','agentName','decision','timestampMs','gas']
  if (Object.keys(o).length !== keys.length || keys.some(k=>!Object.hasOwn(o,k))) throw new Error('INVALID_INTENT')
  const account=(v:unknown) => typeof v==='string' && v.length<=64 && /^[a-z0-9]+(?:[._-][a-z0-9]+)*\.testnet$/.test(v)
  if (o.network!=='testnet' || o.type!=='AUDIT_HASH' || o.amountYocto!=='0' || o.gas!=='30000000000000' || !account(o.signerId) || !account(o.receiverId) || typeof o.auditId!=='string' || !/^[a-zA-Z0-9-]{1,64}$/.test(o.auditId) || typeof o.contentHash!=='string' || !/^[0-9a-f]{64}$/.test(o.contentHash) || typeof o.operationType!=='string' || !/^[A-Z_]{1,64}$/.test(o.operationType) || typeof o.agentName!=='string' || !['HADES','CHARON','PERSEPHONE','MINOS','ELYSIUM','TARTARUS','CERBERUS'].includes(o.agentName) || !['PERMIT','DENY','ESCALATE'].includes(o.decision as string) || !Number.isSafeInteger(o.timestampMs) || (o.timestampMs as number)<0) throw new Error('INVALID_INTENT')
  const params:AuditIntent={network:'testnet',signerId:o.signerId as string,receiverId:o.receiverId as string,type:'AUDIT_HASH',amountYocto:'0',auditId:o.auditId,contentHash:o.contentHash,operationType:o.operationType,agentName:o.agentName,decision:o.decision as AuditIntent['decision'],timestampMs:o.timestampMs as number,gas:'30000000000000'}
  return {params,hash:createHash('sha256').update(JSON.stringify(params)).digest('hex')}
}

/** Durable approval gate only; no signer or broadcaster is connected to this store. */
export class NearIntentStore {
  constructor(private db:Database.Database, private guard:CerberusGUARD, private gate:CerberusGate) {
    db.exec(`CREATE TABLE IF NOT EXISTS near_intents (id TEXT PRIMARY KEY, params TEXT NOT NULL, hash TEXT NOT NULL, status TEXT NOT NULL, policy_hash TEXT NOT NULL, created_at INTEGER NOT NULL, approval_id TEXT UNIQUE, approved_by TEXT, approved_at INTEGER, expires_at INTEGER, consumed_at INTEGER);
      CREATE TABLE IF NOT EXISTS near_security (id INTEGER PRIMARY KEY CHECK(id=1), stopped INTEGER NOT NULL);
      INSERT OR IGNORE INTO near_security VALUES (1,0);
      CREATE TABLE IF NOT EXISTS near_intent_events (id TEXT PRIMARY KEY, intent_id TEXT, actor TEXT NOT NULL, action TEXT NOT NULL, timestamp INTEGER NOT NULL);`)
    // Link to the CERBERUS gate approval that actually authorizes execution of this intent.
    if (!(db.prepare('PRAGMA table_info(near_intents)').all() as Array<{name:string}>).some(c=>c.name==='gate_approval_id')) db.exec('ALTER TABLE near_intents ADD COLUMN gate_approval_id TEXT')
  }
  private gateApprovalId(id:string):string|null { return (this.db.prepare('SELECT gate_approval_id AS g FROM near_intents WHERE id=?').get(id) as {g:string|null}|undefined)?.g ?? null }
  // The routes that reach this store are ADMIN-only; the gate still enforces tool, agent, params and recipient rules.
  private gateRequest(item:NearIntent, actor:string, source:'NEAR'|'API', approvalId?:string) {
    return {tool:NEAR_SUBMIT_TOOL,agent:'HADES',role:'ADMIN' as const,source,params:item.params as unknown as Record<string,unknown>,actor,correlationId:item.id,...(approvalId?{approvalId}:{})}
  }
  private event(id:string|null,actor:string,action:string):void { this.db.prepare('INSERT INTO near_intent_events VALUES (?,?,?,?,?)').run(randomUUID(),id,actor,action,Date.now()) }
  get(id:string):NearIntent | undefined {
    const r=this.db.prepare('SELECT * FROM near_intents WHERE id=?').get(id) as Record<string,any>|undefined
    return r && {id:r.id,params:JSON.parse(r.params),hash:r.hash,status:r.status,policyHash:r.policy_hash,createdAt:r.created_at,approvalId:r.approval_id,approvedBy:r.approved_by,approvedAt:r.approved_at,expiresAt:r.expires_at,consumedAt:r.consumed_at}
  }
  list(limit=50):NearIntent[] {
    return (this.db.prepare('SELECT id FROM near_intents ORDER BY created_at DESC, rowid DESC LIMIT ?').all(limit) as Array<{id:string}>).map(r=>this.get(r.id)!)
  }
  /** Moves an intent along the legal state machine; compare-and-set so concurrent workers cannot both win. */
  transition(id:string,to:NearState,actor:string):NearIntent {
    return this.db.transaction(()=>{
      const item=this.get(id)
      if(!item || !isAllowedNearTransition(item.status,to)) throw new Error('INVALID_STATE')
      const changed=this.db.prepare('UPDATE near_intents SET status=? WHERE id=? AND status=?').run(to,id,item.status)
      if(changed.changes!==1) throw new Error('INVALID_STATE')
      this.event(id,actor,to);return this.get(id)!
    })()
  }
  create(input:unknown,actor:string):NearIntent {
    const {params,hash}=canonicalIntent(input), id=randomUUID(), now=Date.now()
    this.db.transaction(()=>{this.db.prepare('INSERT INTO near_intents (id,params,hash,status,policy_hash,created_at) VALUES (?,?,?,?,?,?)').run(id,JSON.stringify(params),hash,'DRAFT',this.guard.getPolicyHash(),now);this.event(id,actor,'DRAFT')})()
    return this.get(id)!
  }
  requestApproval(id:string,actor:string):NearIntent {
    const pre=this.get(id); if(!pre || pre.status!=='DRAFT') throw new Error('INVALID_STATE')
    const d=this.guard.evaluate({id:randomUUID(),agentId:'agent:hades',agentName:'HADES',operationType:'NEAR_TRANSACTION',payload:pre.params,missionId:id,taskId:id,requestedAt:Date.now()})
    if(d.outcome!=='ESCALATE') throw new Error('POLICY_DENIED')
    // Outside the state transaction on purpose: a denial must stay recorded in the gate's decision log.
    const g=this.gate.authorize(this.gateRequest(pre,actor,'NEAR'))
    if(g.outcome!=='ESCALATE' || !g.approvalId) throw new Error(`POLICY_DENIED:${g.code}`)
    return this.db.transaction(()=>{
      const item=this.get(id); if(!item || item.status!=='DRAFT') throw new Error('INVALID_STATE')
      this.db.prepare("UPDATE near_intents SET status='PENDING_APPROVAL',policy_hash=?,gate_approval_id=? WHERE id=?").run(this.guard.getPolicyHash(),g.approvalId,id)
      this.event(id,actor,'PENDING_APPROVAL');return this.get(id)!
    })()
  }
  approve(id:string,expectedHash:string,actor:string,expiresAt:number):NearIntent {
    return this.db.transaction(()=>{
      const item=this.get(id), now=Date.now()
      if(!item || item.status!=='PENDING_APPROVAL') throw new Error('INVALID_STATE')
      if(item.hash!==expectedHash || canonicalIntent(item.params).hash!==item.hash || item.policyHash!==this.guard.getPolicyHash()) throw new Error('INTENT_CHANGED')
      if(!Number.isSafeInteger(expiresAt) || expiresAt<=now || expiresAt>now+15*60*1000) throw new Error('INVALID_EXPIRY')
      const gateApproval=this.gateApprovalId(id); if(!gateApproval) throw new Error('INVALID_STATE')
      this.gate.decide(gateApproval,'APPROVED',actor,`NEAR intent ${id} approved for hash ${expectedHash.slice(0,12)}`,expiresAt-now)
      this.db.prepare("UPDATE near_intents SET status='APPROVED',approval_id=?,approved_by=?,approved_at=?,expires_at=? WHERE id=?").run(randomUUID(),actor,now,expiresAt,id)
      this.event(id,actor,'APPROVED');return this.get(id)!
    })()
  }
  resolve(id:string, outcome:'REJECTED'|'CANCELLED', actor:string):NearIntent {
    return this.db.transaction(()=>{
      const item=this.get(id)
      if(!item || !isAllowedNearTransition(item.status,outcome)) throw new Error('INVALID_STATE')
      const changed=this.db.prepare('UPDATE near_intents SET status=? WHERE id=? AND status=?').run(outcome,id,item.status)
      if(changed.changes!==1) throw new Error('INVALID_STATE')
      this.event(id,actor,outcome);return this.get(id)!
    })()
  }
  setEmergency(stopped:boolean,actor:string):void { this.db.transaction(()=>{this.gate.setStopped(stopped,actor);this.event(null,actor,stopped?'EMERGENCY_STOP':'EMERGENCY_CLEAR')})() }
  /**
   * Atomically consumes an approval and returns the intent plus the single-use grant the executor must present to
   * the NEAR bridge. Every check is repeated here and again by the gate, so no stale approval can be replayed.
   */
  claimForSigning(id:string,expectedHash:string,actor:string):NearIntent & {grantId:string} {
    const pre=this.get(id), now=Date.now()
    if(this.gate.isStopped()) throw new Error('EMERGENCY_STOP')
    if(!pre || pre.status!=='APPROVED' || pre.consumedAt!==null) throw new Error('INVALID_STATE')
    if(pre.expiresAt===null || pre.expiresAt<=now) throw new Error('APPROVAL_EXPIRED')
    if(pre.hash!==expectedHash || canonicalIntent(pre.params).hash!==pre.hash || pre.policyHash!==this.guard.getPolicyHash()) throw new Error('INTENT_CHANGED')
    const gateApproval=this.gateApprovalId(id); if(!gateApproval) throw new Error('INVALID_STATE')
    // Consumes the gate approval (one use, expiry, params hash, policy hash) and logs the decision, including denials.
    const g=this.gate.authorize(this.gateRequest(pre,actor,'NEAR',gateApproval))
    if(g.outcome!=='PERMIT' || !g.grantId) throw new Error(g.code==='APPROVAL_EXPIRED'?'APPROVAL_EXPIRED':g.code==='EMERGENCY_STOP'?'EMERGENCY_STOP':`POLICY_DENIED:${g.code}`)
    const grantId=g.grantId
    return this.db.transaction(()=>{
      const changed=this.db.prepare("UPDATE near_intents SET status='SIGNING',consumed_at=? WHERE id=? AND status='APPROVED' AND consumed_at IS NULL").run(now,id)
      if(changed.changes!==1) throw new Error('INVALID_STATE')
      this.event(id,actor,'SIGNING');return {...this.get(id)!,grantId}
    })()
  }
}
