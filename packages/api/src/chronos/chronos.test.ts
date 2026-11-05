import Fastify from 'fastify'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SqliteRepository } from '../sqlite.js'
import { registerSecurity } from '../security.js'
import { chronosRoutes } from '../routes/chronos.js'
import { ChronosError, JOB_REGISTRY } from './chronos.js'
import { nextCronRun, parseCron } from './cron.js'

const T0 = Date.UTC(2026, 10, 2, 12, 0, 0) // 2026-11-02 12:00 UTC (a Monday)
const HOUR = 3_600_000

describe('cron', () => {
  it('computes next runs in UTC', () => {
    expect(nextCronRun('0 9 * * *', T0)).toBe(Date.UTC(2026, 10, 3, 9, 0))
    expect(nextCronRun('*/15 * * * *', T0)).toBe(T0 + 15 * 60_000)
    expect(nextCronRun('0 0 * * 1', T0)).toBe(Date.UTC(2026, 10, 9, 0, 0))
    expect(nextCronRun('30 8 1 1 *', T0)).toBe(Date.UTC(2027, 0, 1, 8, 30))
    expect(nextCronRun('0 12 * * 0,7', T0)).toBe(Date.UTC(2026, 10, 8, 12, 0)) // 7 == Sunday
  })
  it('rejects malformed expressions', () => {
    for (const bad of ['', '* * * *', '60 * * * *', '* 24 * * *', '*/0 * * * *', 'a b c d e', '1-70 * * * *', '5-1 * * * *']) expect(() => parseCron(bad), bad).toThrow()
  })
})

describe('CHRONOS service (real SQLite)', () => {
  let dir: string, repo: SqliteRepository, now: number
  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'chronos-'))
    repo = new SqliteRepository(join(dir, 'h.sqlite'), join(dir, 'h.json')); await repo.init()
    now = T0
  })
  afterEach(async () => { repo.close(); await rm(dir, { recursive: true, force: true }) })
  const svc = () => repo.createChronos(() => now)

  it('denies unregistered job kinds, including prototype keys and instruction-like payloads', () => {
    for (const kind of ['SEND_NEAR_TRANSFER', 'constructor', '__proto__', 'rm -rf /', undefined]) {
      expect(() => svc().create({ title: 'bad job', kind, cron: '* * * * *' }, 'a'), String(kind)).toThrow(ChronosError)
    }
    expect(() => svc().create({ title: 'ok name', kind: 'AUDIT_CHAIN_VERIFY', params: { url: 'http://x' }, cron: '* * * * *' }, 'a')).toThrow(/no parameters/)
    expect(Object.values(JOB_REGISTRY).every(j => j.effect === 'READ_ONLY')).toBe(true)
  })

  it('persists tasks across a restart and runs them for real on schedule', async () => {
    const task = svc().create({ title: 'Audit every hour', kind: 'AUDIT_CHAIN_VERIFY', cron: '0 * * * *' }, 'admin')
    expect(task.nextRunAt).toBe(T0 + HOUR)
    repo.close()
    repo = new SqliteRepository(join(dir, 'h.sqlite'), join(dir, 'h.json')); await repo.init()
    expect(svc().list().map(t => t.id)).toEqual([task.id])
    expect(svc().tick().started).toBe(0)
    now = T0 + HOUR
    const tick = svc().tick()
    expect(tick.started).toBe(1)
    const run = tick.executed[0]!
    expect(run).toMatchObject({ status: 'SUCCEEDED', trigger: 'SCHEDULE', attempt: 1, scheduledFor: T0 + HOUR })
    expect(run.result).toMatchObject({ verified: true })
    expect(svc().get(task.id)).toMatchObject({ nextRunAt: T0 + 2 * HOUR, lastRunAt: T0 + HOUR })
    expect(repo.listAuditEvents({ action: 'CHRONOS_RUN', limit: 10, offset: 0 }).map(e => e.result)).toContain(`SUCCEEDED:AUDIT_CHAIN_VERIFY:${task.id}`)
    expect(repo.verifyAuditIntegrity().verified).toBe(true)
  })

  it('does not run twice when two schedulers tick the same slot', () => {
    const task = svc().create({ title: 'Digest', kind: 'APPROVALS_DIGEST', cron: '0 * * * *' }, 'a')
    now = T0 + HOUR
    const a = repo.createChronos(() => now), b = repo.createChronos(() => now)
    const total = a.tick().started + b.tick().started
    expect(total).toBe(1)
    expect(svc().runs(task.id)).toHaveLength(1)
  })

  it('coalesces slots missed during downtime into one catch-up run', () => {
    const task = svc().create({ title: 'Every 15 min', kind: 'APPROVALS_DIGEST', cron: '*/15 * * * *' }, 'a')
    now = T0 + 10 * HOUR
    expect(svc().tick().started).toBe(1)
    expect(svc().runs(task.id)).toHaveLength(1)
    expect(svc().get(task.id).nextRunAt).toBe(T0 + 10 * HOUR + 15 * 60_000)
  })

  it('pauses, resumes without replaying paused slots, and cancels', () => {
    const task = svc().create({ title: 'Pausable', kind: 'APPROVALS_DIGEST', cron: '0 * * * *' }, 'a')
    svc().pause(task.id, 'a')
    now = T0 + 5 * HOUR
    expect(svc().tick().started).toBe(0)
    expect(() => svc().pause(task.id, 'a')).toThrow(/cannot pause/)
    expect(svc().resume(task.id, 'a').nextRunAt).toBe(T0 + 6 * HOUR)
    svc().cancel(task.id, 'a')
    now = T0 + 7 * HOUR
    expect(svc().tick().started).toBe(0)
    expect(() => svc().runNow(task.id, 'a')).toThrow(/cancelled/)
    expect(svc().get(task.id)).toMatchObject({ status: 'CANCELLED', nextRunAt: null })
  })

  it('runs immediately on request, even while paused, recording who asked', () => {
    const task = svc().create({ title: 'Report', kind: 'CERBERUS_DECISION_REPORT', params: { windowHours: 6 }, cron: '0 9 * * *' }, 'a')
    svc().pause(task.id, 'a')
    const run = svc().runNow(task.id, 'operator-1')
    expect(run).toMatchObject({ status: 'SUCCEEDED', trigger: 'MANUAL' })
    expect(run.result).toMatchObject({ windowHours: 6, total: 0 })
    expect(repo.listAuditEvents({ action: 'CHRONOS_RUN_REQUESTED', limit: 5, offset: 0 })[0]).toMatchObject({ actor: 'operator-1' })
  })

  it('retries idempotent failures with backoff, then fails after maxAttempts', () => {
    const task = svc().create({ title: 'Flaky', kind: 'APPROVALS_DIGEST', cron: '0 * * * *', maxAttempts: 2 }, 'a')
    const original = JOB_REGISTRY['APPROVALS_DIGEST']!.run
    JOB_REGISTRY['APPROVALS_DIGEST']!.run = () => { throw new Error('boom') }
    try {
      const first = svc().runNow(task.id, 'a')
      expect(first).toMatchObject({ status: 'RETRYING', attempt: 1, error: 'boom' })
      expect(svc().tick().retried).toBe(0) // backoff not elapsed
      now += 31_000
      const retry = svc().tick()
      expect(retry.retried).toBe(1)
      expect(retry.executed[0]).toMatchObject({ status: 'FAILED', attempt: 2 })
      now += 3_600_000
      expect(svc().tick().retried).toBe(0)
    } finally { JOB_REGISTRY['APPROVALS_DIGEST']!.run = original }
  })

  it('holds pending retries while paused and resumes them after restart', async () => {
    const task = svc().create({ title: 'Pausable retry', kind: 'APPROVALS_DIGEST', cron: '0 * * * *' }, 'a')
    const original = JOB_REGISTRY['APPROVALS_DIGEST']!.run
    JOB_REGISTRY['APPROVALS_DIGEST']!.run = () => { throw new Error('temporary failure') }
    try {
      const run = svc().runNow(task.id, 'a')
      expect(run.status).toBe('RETRYING')
      svc().pause(task.id, 'a')
      repo.close()
      repo = new SqliteRepository(join(dir, 'h.sqlite'), join(dir, 'h.json')); await repo.init()
      now += 31_000
      expect(svc().tick().retried).toBe(0)
      expect(svc().runs(task.id)[0]).toMatchObject({ id: run.id, status: 'RETRYING', attempt: 1 })
      JOB_REGISTRY['APPROVALS_DIGEST']!.run = original
      svc().resume(task.id, 'a')
      expect(svc().tick().executed[0]).toMatchObject({ id: run.id, status: 'SUCCEEDED', attempt: 2 })
    } finally { JOB_REGISTRY['APPROVALS_DIGEST']!.run = original }
  })

  it('recovers runs interrupted by a crash', () => {
    const task = svc().create({ title: 'Crashy', kind: 'APPROVALS_DIGEST', cron: '0 * * * *' }, 'a')
    const run = svc().runNow(task.id, 'a')
    // Simulate a process dying mid-run: force the row back to RUNNING.
    ;(repo as unknown as { db: { prepare(s: string): { run(...a: unknown[]): void } } }).db.prepare("UPDATE chronos_runs SET status = 'RUNNING', finished_at = NULL WHERE id = ?").run(run.id)
    expect(svc().recover()).toBe(1)
    const tick = svc().tick()
    expect(tick.retried).toBe(1)
    expect(tick.executed[0]).toMatchObject({ id: run.id, status: 'SUCCEEDED' })
  })
})

describe('CHRONOS HTTP API', () => {
  it('enforces roles, validates input and exposes persisted state', async () => {
    const previous = process.env.JWT_SECRET
    process.env.JWT_SECRET = 'test-secret-with-at-least-thirty-two-characters'
    const dir = await mkdtemp(join(tmpdir(), 'chronos-api-'))
    const repo = new SqliteRepository(join(dir, 'h.sqlite'), join(dir, 'h.json')); await repo.init()
    const app = Fastify()
    try {
      await registerSecurity(app)
      await app.register(async api => chronosRoutes(api, repo), { prefix: '/api/v1' })
      await app.ready()
      const call = (role: string, method: 'GET' | 'POST', url: string, payload?: unknown) => app.inject({ method, url: `/api/v1${url}`, payload: payload as object, headers: { authorization: `Bearer ${app.jwt.sign({ sub: role, roles: [role], exp: Math.floor(Date.now() / 1000) + 60 })}` } })
      const body = { title: 'Daily audit', kind: 'AUDIT_CHAIN_VERIFY', cron: '0 9 * * *' }
      expect((await call('VIEWER', 'POST', '/chronos/tasks', body)).statusCode).toBe(403)
      expect((await call('AUDITOR', 'POST', '/chronos/tasks', body)).statusCode).toBe(403)
      expect((await call('OPERATOR', 'POST', '/chronos/tasks', { ...body, kind: 'TRANSFER_FUNDS' })).statusCode).toBe(403)
      expect((await call('OPERATOR', 'POST', '/chronos/tasks', { ...body, cron: 'nope' })).statusCode).toBe(400)
      const created = await call('OPERATOR', 'POST', '/chronos/tasks', body)
      expect(created.statusCode).toBe(201)
      const id = created.json().data.id as string
      expect((await call('VIEWER', 'GET', '/chronos/tasks')).json().data).toHaveLength(1)
      expect((await call('VIEWER', 'POST', `/chronos/tasks/${id}/run`)).statusCode).toBe(403)
      const run = await call('ADMIN', 'POST', `/chronos/tasks/${id}/run`)
      expect(run.json().data).toMatchObject({ status: 'SUCCEEDED', trigger: 'MANUAL' })
      expect((await call('VIEWER', 'GET', `/chronos/runs?taskId=${id}`)).json().data).toHaveLength(1)
      expect((await call('ADMIN', 'POST', '/chronos/tasks/missing/pause')).statusCode).toBe(404)
      expect((await call('ADMIN', 'POST', `/chronos/tasks/${id}/cancel`)).json().data.status).toBe('CANCELLED')
      expect((await call('ADMIN', 'POST', `/chronos/tasks/${id}/cancel`)).statusCode).toBe(409)
    } finally { await app.close(); repo.close(); await rm(dir, { recursive: true, force: true }); process.env.JWT_SECRET = previous }
  })
})
