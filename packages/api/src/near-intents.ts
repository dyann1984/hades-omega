import Database from 'better-sqlite3'
import { createHash, randomUUID } from 'node:crypto'
import { CerberusGUARD } from '@hades/core'

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
  constructor(private db:Database.Database, private guard:CerberusGUARD) {
    db.exec(`CREATE TABLE IF NOT EXISTS near_intents (id TEXT PRIMARY KEY, params TEXT NOT NULL, hash TEXT NOT NULL, status TEXT NOT NULL, policy_hash TEXT NOT NULL, created_at INTEGER NOT NULL, approval_id TEXT UNIQUE, approved_by TEXT, approved_at INTEGER, expires_at INTEGER, consumed_at INTEGER);
      CREATE TABLE IF NOT EXISTS near_security (id INTEGER PRIMARY KEY CHECK(id=1), stopped INTEGER NOT NULL);
      INSERT OR IGNORE INTO near_security VALUES (1,0);
      CREATE TABLE IF NOT EXISTS near_intent_events (id TEXT PRIMARY KEY, intent_id TEXT, actor TEXT NOT NULL, action TEXT NOT NULL, timestamp INTEGER NOT NULL);`)
  }
  private event(id:string|null,actor:string,action:string):void { this.db.prepare('INSERT INTO near_intent_events VALUES (?,?,?,?,?)').run(randomUUID(),id,actor,action,Date.now()) }
  get(id:string):NearIntent | undefined {
    const r=this.db.prepare('SELECT * FROM near_intents WHERE id=?').get(id) as Record<string,any>|undefined
    return r && {id:r.id,params:JSON.parse(r.params),hash:r.hash,status:r.status,policyHash:r.policy_hash,createdAt:r.created_at,approvalId:r.approval_id,approvedBy:r.approved_by,approvedAt:r.approved_at,expiresAt:r.expires_at,consumedAt:r.consumed_at}
  }
  create(input:unknown,actor:string):NearIntent {
    const {params,hash}=canonicalIntent(input), id=randomUUID(), now=Date.now()
    this.db.transaction(()=>{this.db.prepare('INSERT INTO near_intents (id,params,hash,status,policy_hash,created_at) VALUES (?,?,?,?,?,?)').run(id,JSON.stringify(params),hash,'DRAFT',this.guard.getPolicyHash(),now);this.event(id,actor,'DRAFT')})()
    return this.get(id)!
  }
  requestApproval(id:string,actor:string):NearIntent {
    return this.db.transaction(()=>{
      const item=this.get(id); if(!item || item.status!=='DRAFT') throw new Error('INVALID_STATE')
      const d=this.guard.evaluate({id:randomUUID(),agentId:'agent:hades',agentName:'HADES',operationType:'NEAR_TRANSACTION',payload:item.params,missionId:id,taskId:id,requestedAt:Date.now()})
      if(d.outcome!=='ESCALATE') throw new Error('POLICY_DENIED')
      this.db.prepare("UPDATE near_intents SET status='PENDING_APPROVAL',policy_hash=? WHERE id=?").run(this.guard.getPolicyHash(),id)
      this.event(id,actor,'PENDING_APPROVAL');return this.get(id)!
    })()
  }
  approve(id:string,expectedHash:string,actor:string,expiresAt:number):NearIntent {
    return this.db.transaction(()=>{
      const item=this.get(id), now=Date.now()
      if(!item || item.status!=='PENDING_APPROVAL') throw new Error('INVALID_STATE')
      if(item.hash!==expectedHash || canonicalIntent(item.params).hash!==item.hash || item.policyHash!==this.guard.getPolicyHash()) throw new Error('INTENT_CHANGED')
      if(!Number.isSafeInteger(expiresAt) || expiresAt<=now || expiresAt>now+15*60*1000) throw new Error('INVALID_EXPIRY')
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
  setEmergency(stopped:boolean,actor:string):void { this.db.transaction(()=>{this.db.prepare('UPDATE near_security SET stopped=? WHERE id=1').run(stopped?1:0);this.event(null,actor,stopped?'EMERGENCY_STOP':'EMERGENCY_CLEAR')})() }
  /** Atomically consumes an approval; callers must still enforce stop and intent checks before any transmission. */
  claimForSigning(id:string,expectedHash:string,actor:string):NearIntent {
    return this.db.transaction(()=>{
      const item=this.get(id), now=Date.now()
      if((this.db.prepare('SELECT stopped FROM near_security WHERE id=1').get() as {stopped:number}).stopped) throw new Error('EMERGENCY_STOP')
      if(!item || item.status!=='APPROVED' || item.consumedAt!==null) throw new Error('INVALID_STATE')
      if(item.expiresAt===null || item.expiresAt<=now) throw new Error('APPROVAL_EXPIRED')
      if(item.hash!==expectedHash || canonicalIntent(item.params).hash!==item.hash || item.policyHash!==this.guard.getPolicyHash()) throw new Error('INTENT_CHANGED')
      const changed=this.db.prepare("UPDATE near_intents SET status='SIGNING',consumed_at=? WHERE id=? AND status='APPROVED' AND consumed_at IS NULL").run(now,id)
      if(changed.changes!==1) throw new Error('INVALID_STATE')
      this.event(id,actor,'SIGNING');return this.get(id)!
    })()
  }
}
