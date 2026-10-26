import Database from 'better-sqlite3';
import { mkdirSync } from 'fs';
import { resolve } from 'path';
import type { AuditRecord, Mission, Task } from './types.js';

// DB_PATH env var allows Docker/Railway to use a persistent volume mount
const DB_PATH = process.env.DB_PATH
  ? resolve(process.env.DB_PATH)
  : resolve(process.cwd(), 'data', 'hades.db');

mkdirSync(resolve(DB_PATH, '..'), { recursive: true });
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS missions (
    id TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    report_json TEXT
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    mission_id TEXT NOT NULL REFERENCES missions(id),
    assigned_to TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL,
    result_json TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_records (
    id TEXT PRIMARY KEY,
    proposal_id TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    operation_type TEXT NOT NULL,
    decision TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    metadata_json TEXT NOT NULL,
    human_approved_by TEXT,
    near_tx_hash TEXT,
    near_explorer_url TEXT,
    near_mode TEXT NOT NULL DEFAULT 'simulation',
    timestamp INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS near_simulations (
    id TEXT PRIMARY KEY,
    audit_record_id TEXT NOT NULL,
    simulated_tx_hash TEXT NOT NULL,
    block_height INTEGER NOT NULL,
    timestamp INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_mission ON tasks(mission_id);
  CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_records(timestamp DESC);
`);

export function saveMission(m: Mission): void {
  db.prepare(`
    INSERT OR REPLACE INTO missions (id, text, status, created_at, updated_at, report_json)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(m.id, m.text, m.status, m.createdAt, m.updatedAt, m.report ? JSON.stringify(m.report) : null);
}

export function updateMissionStatus(id: string, status: string, report?: unknown): void {
  db.prepare(`UPDATE missions SET status = ?, updated_at = ?, report_json = ? WHERE id = ?`)
    .run(status, Date.now(), report ? JSON.stringify(report) : null, id);
}

export function saveTask(t: Task): void {
  db.prepare(`
    INSERT OR REPLACE INTO tasks (id, mission_id, assigned_to, description, status, result_json, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(t.id, t.missionId, t.assignedTo, t.description, t.status, t.result ? JSON.stringify(t.result) : null, t.createdAt, t.updatedAt);
}

export function updateTaskStatus(id: string, status: string, result?: unknown): void {
  db.prepare(`UPDATE tasks SET status = ?, updated_at = ?, result_json = ? WHERE id = ?`)
    .run(status, Date.now(), result ? JSON.stringify(result) : null, id);
}

export function saveAuditRecord(r: AuditRecord): void {
  db.prepare(`
    INSERT OR REPLACE INTO audit_records
    (id, proposal_id, agent_name, operation_type, decision, content_hash, metadata_json,
     human_approved_by, near_tx_hash, near_explorer_url, near_mode, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    r.id, r.proposalId, r.agentName, r.operationType, r.decision,
    r.contentHash, JSON.stringify(r.metadata),
    r.humanApprovedBy ?? null, r.nearTxHash ?? null, r.nearExplorerUrl ?? null,
    r.nearMode, r.timestamp
  );
}

export function updateAuditRecordNEAR(id: string, txHash: string, explorerUrl: string): void {
  db.prepare(`UPDATE audit_records SET near_tx_hash = ?, near_explorer_url = ? WHERE id = ?`)
    .run(txHash, explorerUrl, id);
}

export function getRecentAuditRecords(limit = 20): AuditRecord[] {
  const rows = db.prepare(`SELECT * FROM audit_records ORDER BY timestamp DESC LIMIT ?`).all(limit) as Record<string, unknown>[];
  return rows.map(rowToAuditRecord);
}

export function getMissions(limit = 10): Mission[] {
  const rows = db.prepare(`SELECT * FROM missions ORDER BY created_at DESC LIMIT ?`).all(limit) as Record<string, unknown>[];
  return rows.map(r => ({
    id: r.id as string,
    text: r.text as string,
    status: r.status as Mission['status'],
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
    tasks: getTasksForMission(r.id as string),
    report: r.report_json ? JSON.parse(r.report_json as string) : undefined,
  }));
}

export function getTasksForMission(missionId: string): Task[] {
  const rows = db.prepare(`SELECT * FROM tasks WHERE mission_id = ? ORDER BY created_at`).all(missionId) as Record<string, unknown>[];
  return rows.map(r => ({
    id: r.id as string,
    missionId: r.mission_id as string,
    assignedTo: r.assigned_to as Task['assignedTo'],
    description: r.description as string,
    status: r.status as Task['status'],
    result: r.result_json ? JSON.parse(r.result_json as string) : undefined,
    createdAt: r.created_at as number,
    updatedAt: r.updated_at as number,
  }));
}

function rowToAuditRecord(r: Record<string, unknown>): AuditRecord {
  return {
    id: r.id as string,
    proposalId: r.proposal_id as string,
    agentName: r.agent_name as AuditRecord['agentName'],
    operationType: r.operation_type as string,
    decision: r.decision as AuditRecord['decision'],
    contentHash: r.content_hash as string,
    metadata: JSON.parse(r.metadata_json as string),
    humanApprovedBy: r.human_approved_by as string | undefined,
    nearTxHash: r.near_tx_hash as string | undefined,
    nearExplorerUrl: r.near_explorer_url as string | undefined,
    nearMode: r.near_mode as AuditRecord['nearMode'],
    timestamp: r.timestamp as number,
  };
}

export default db;
