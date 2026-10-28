import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import { SqliteRepository } from './sqlite.js'

describe('SQLite migration and persistence', () => {
  it('backs up and imports legacy records once, preserving tasks and decisions after restart', async () => {
    const dir=await mkdtemp(join(tmpdir(),'hades-sqlite-')); const json=join(dir,'legacy.json'); const db=join(dir,'data.sqlite')
    const legacy={version:1,missions:[{id:'m1',ownerId:'a',tasks:[{id:'t1',missionId:'m1',status:'CERBERUS_REVIEW',result:{data:{escalationId:'e1'}}}]}],audits:[],approvals:[],events:[],idempotency:{}}
    const original=JSON.stringify(legacy); await writeFile(json,original)
    try {
      const first=new SqliteRepository(db,json); await first.init()
      expect(first.getMission('m1')?.tasks[0].id).toBe('t1')
      await first.decideApproval({escalationId:'e1',status:'APPROVED',justification:'Reviewed',decidedBy:'admin'})
      await expect(first.decideApproval({escalationId:'e1',status:'REJECTED',justification:'Duplicate',decidedBy:'admin'})).rejects.toThrow('APPROVAL_ALREADY_RESOLVED')
      first.close()
      const second=new SqliteRepository(db,json); await second.init()
      expect(second.listMissions()).toHaveLength(1); expect(second.listApprovals()).toHaveLength(1); second.close()
      expect(await readFile(json,'utf8')).toBe(original)
      const backup=(await readdir(dir)).find(x=>x.startsWith('legacy.json.backup-')); expect(backup).toBeDefined(); expect(await readFile(join(dir,backup!),'utf8')).toBe(original)
    } finally { await rm(dir,{recursive:true,force:true}) }
  })
  it('recovers a pending local approval across restart and commits one deterministic result', async () => {
    const dir=await mkdtemp(join(tmpdir(),'hades-recovery-')); const db=join(dir,'data.sqlite'), json=join(dir,'none.json')
    try {
      const first=new SqliteRepository(db,json); await first.init(); const {mission,approvalId}=await first.createLocalMission('owner','Real operation','hello'); first.close()
      const second=new SqliteRepository(db,json); await second.init()
      expect(second.listPendingLocalOperations().map(item=>item.id)).toContain(approvalId)
      const results=await Promise.allSettled([second.decideLocalOperation(approvalId,'APPROVED','admin','Reviewed'),second.decideLocalOperation(approvalId,'APPROVED','admin','Reviewed')])
      expect(results.filter(result=>result.status==='fulfilled')).toHaveLength(1)
      expect(second.getMission(mission.id)?.tasks[0].status).toBe('EXECUTED')
      expect(second.listMissionEvents(mission.id).map(e=>(e.payload as {state:string}).state)).toEqual(['CREATED','WAITING_APPROVAL','APPROVED','RESUMING','RUNNING','COMPLETED'])
      second.close()
    } finally { await rm(dir,{recursive:true,force:true}) }
  })
  it('cancels a pending mission once and never runs a cancelled operation', async () => {
    const dir=await mkdtemp(join(tmpdir(),'hades-cancel-')); const repo=new SqliteRepository(join(dir,'data.sqlite'),join(dir,'none.json'))
    try { await repo.init(); const {mission,approvalId}=await repo.createLocalMission('owner','Cancel test','sensitive input')
      expect(() => repo.cancelLocalMission(mission.id,'other',false,'Not authorized')).toThrow('MISSION_NOT_FOUND')
      expect(repo.cancelLocalMission(mission.id,'owner',false,'No longer needed').status).toBe('CANCELLED')
      await expect(repo.decideLocalOperation(approvalId,'APPROVED','admin','Reviewed')).rejects.toThrow('APPROVAL_ALREADY_RESOLVED')
      expect(repo.getMission(mission.id)?.tasks[0].status).toBe('CANCELLED')
    } finally {repo.close(); await rm(dir,{recursive:true,force:true})}
  })
  it('fails safely on malformed legacy JSON without deleting the original', async () => {
    const dir=await mkdtemp(join(tmpdir(),'hades-sqlite-')); const json=join(dir,'legacy.json'); await writeFile(json,'invalid')
    try { const repo=new SqliteRepository(join(dir,'data.sqlite'),json); await expect(repo.init()).rejects.toThrow(); repo.close(); expect(await readFile(json,'utf8')).toBe('invalid') }
    finally { await rm(dir,{recursive:true,force:true}) }
  })
  it('document results survive process restart (SQLite WAL persistence)', async () => {
    const dir=await mkdtemp(join(tmpdir(),'hades-restart-')); const db=join(dir,'data.sqlite'), json=join(dir,'none.json')
    try {
      // Session 1: save document results
      const s1=new SqliteRepository(db,json); await s1.init()
      s1.saveDocumentResult('doc-001','owner-alice','informe.pdf','APPROVED',{resultId:'doc-001',filename:'informe.pdf',overallStatus:'APPROVED',extractionMethod:'pdf-parse'})
      s1.saveDocumentResult('doc-002','owner-alice','contrato.docx','REJECTED',{resultId:'doc-002',filename:'contrato.docx',overallStatus:'REJECTED',extractionMethod:'mammoth'})
      s1.close()
      // Session 2: open the same DB (simulates a process restart)
      const s2=new SqliteRepository(db,json); await s2.init()
      const list=s2.listDocumentResults('owner-alice')
      expect(list).toHaveLength(2)
      expect(list.map(r=>r.filename).sort()).toEqual(['contrato.docx','informe.pdf'])
      const single=s2.getDocumentResult('doc-001','owner-alice')
      expect(single?.filename).toBe('informe.pdf')
      expect((single?.data as Record<string, unknown>)?.['extractionMethod']).toBe('pdf-parse')
      // Cross-owner isolation still enforced after restart
      expect(s2.getDocumentResult('doc-001','owner-bob')).toBeUndefined()
      s2.close()
    } finally { await rm(dir,{recursive:true,force:true}) }
  })
})
