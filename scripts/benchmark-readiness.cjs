// Benchmark script for HADES Enterprise Readiness
const { mkdtemp, rm } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const { performance } = require('node:perf_hooks')
const { SqliteRepository } = require('../packages/api/dist/sqlite.js')

async function benchmark() {
  const dir = await mkdtemp(join(tmpdir(), 'hades-bench-'))
  const db = join(dir, 'benchmark.sqlite')
  const legacy = join(dir, 'none.json')
  const repo = new SqliteRepository(db, legacy)

  try {
    await repo.init()
    const op = repo.createUser('bench-operator', 'unused', 'OPERATOR')
    const admin = repo.createUser('bench-admin', 'unused', 'ADMIN')

    console.log('=== HADES ENTERPRISE PERFORMANCE BENCHMARK ===')

    // 1. Audit event recording latency (Blockchain chaining)
    const auditCount = 500
    const startAudit = performance.now()
    for (let i = 0; i < auditCount; i++) {
      repo.recordAuditEvent({
        actor: op,
        action: 'BENCH_OPERATION',
        result: `RESULT_${i}`,
        correlationId: `bench-corr-${i}`,
      })
    }
    const auditTime = performance.now() - startAudit
    const avgAuditMs = auditTime / auditCount
    console.log(`[AUDIT CHAIN] Registrados ${auditCount} eventos criptográficos en ${auditTime.toFixed(2)} ms (Promedio: ${avgAuditMs.toFixed(3)} ms/evento)`)

    // 2. Audit verification latency
    const startVerify = performance.now()
    const integrity = repo.verifyAuditIntegrity()
    const verifyTime = performance.now() - startVerify
    console.log(`[AUDIT INTEGRITY] Verificación de ${integrity.totalEvents} bloques en ${verifyTime.toFixed(2)} ms (Válido: ${integrity.verified})`)

    // 3. Concurrent Multi-Document mission creation and execution
    const missionCount = 20
    const sampleDocs = [
      { filename: 'doc-a.txt', content: 'Contrato Alfa: $50,000 USD, 30 días entrega, 5% penalización por mora, SLA 99.5%.' },
      { filename: 'doc-b.txt', content: 'Contrato Beta: $65,000 USD, sin garantía expresa, 0% penalización.' },
      { filename: 'doc-c.txt', content: 'Contrato Gamma: $48,000 USD, garantía 24 meses, 10% penalización.' },
    ]

    const startMissions = performance.now()
    const createdMissions = []
    for (let i = 0; i < missionCount; i++) {
      const res = await repo.createMultiDocumentMission(op, `Misión Bench ${i}`, sampleDocs, 100000)
      createdMissions.push(res)
    }
    const createTime = performance.now() - startMissions
    console.log(`[MISSIONS CREATION] Creadas ${missionCount} misiones multi-documentales en ${createTime.toFixed(2)} ms (Promedio: ${(createTime / missionCount).toFixed(2)} ms/misión)`)

    // 4. Batch decision / resolution latency
    const startDecide = performance.now()
    for (const m of createdMissions) {
      await repo.decideLocalOperation(m.approvalId, 'APPROVED', admin, 'Aprobación benchmark')
    }
    const decideTime = performance.now() - startDecide
    console.log(`[APPROVALS & EXECUTION] Procesadas ${missionCount} aprobaciones y ejecuciones completas en ${decideTime.toFixed(2)} ms (Promedio: ${(decideTime / missionCount).toFixed(2)} ms/ejecución)`)

    // 5. Memory usage
    const mem = process.memoryUsage()
    console.log(`[MEMORY] RSS: ${(mem.rss / 1024 / 1024).toFixed(2)} MB, HeapUsed: ${(mem.heapUsed / 1024 / 1024).toFixed(2)} MB`)

    console.log('==============================================')
  } finally {
    repo.close()
    await rm(dir, { recursive: true, force: true })
  }
}

benchmark().catch(e => {
  console.error('FAIL Benchmark:', e)
  process.exit(1)
})
