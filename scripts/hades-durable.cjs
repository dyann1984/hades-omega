// Operator tool for durable storage. Needs a compiled API (npm run build) and, in the environment (never on the command line):
//   HADES_DURABLE_DATABASE_URL  - PostgreSQL connection string
//   HADES_SNAPSHOT_KEY or JWT_SECRET - same value the Render service uses (>= 32 chars)
// Commands:
//   status                      - connectivity, snapshot version/size (no data printed)
//   seed <file.sqlite>          - one-time upload of an existing SQLite DB as the first snapshot (refuses to overwrite)
//   selftest                    - full cycle with a TEMPORARY account on a throw-away snapshot id (never touches the production snapshot)
//   issue-recovery [minutes]    - prints a ONE-TIME admin recovery token (default 30 min, max 120). Shown once; only its hash is stored.
const { createHash, randomBytes } = require('node:crypto')
const { readFileSync } = require('node:fs')
const pg = require('pg')
const { PgSnapshotStore, hashRecoveryToken, deriveSnapshotKey, encryptSnapshot, runSelfTest } = require('../packages/api/dist/durable.js')

async function main() {
  const [cmd, arg] = process.argv.slice(2)
  const url = process.env.HADES_DURABLE_DATABASE_URL
  if (!url || !['status', 'seed', 'issue-recovery', 'selftest'].includes(cmd)) throw Error('Uso: HADES_DURABLE_DATABASE_URL=... node scripts/hades-durable.cjs status | seed <file.sqlite> | issue-recovery [minutos] | selftest')
  const pool = new pg.Pool({ connectionString: url, max: 1, ssl: /sslmode=disable|localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: true } })
  try {
    const store = new PgSnapshotStore(pool)
    await store.ensureSchema()
    if (cmd === 'status') {
      const s = await store.load()
      console.log(s ? `snapshot v${s.version}, ${s.data.length} bytes (cifrado)` : 'sin snapshot')
    } else if (cmd === 'seed') {
      if (!arg) throw Error('Falta la ruta del .sqlite')
      const Database = require('better-sqlite3')
      const db = new Database(arg, { readonly: true }); const image = db.serialize(); db.close()
      const v = await store.save(0, encryptSnapshot(image, deriveSnapshotKey()))
      console.log(v ? `snapshot inicial creado (v${v})` : 'YA existe un snapshot; no se sobrescribe')
    } else if (cmd === 'selftest') {
      const os = require('node:os'), path = require('node:path'), fs = require('node:fs')
      const { SqliteRepository } = require('../packages/api/dist/sqlite.js'); const { hashPassword, verifyPassword } = require('../packages/api/dist/password.js')
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hades-selftest-')); const opened = []
      try {
        const res = await runSelfTest(pool, deriveSnapshotKey(), { tmpDir: dir, hash: hashPassword, verify: verifyPassword, open: async p => { const r = new SqliteRepository(p, path.join(dir, 'l.json')); await r.init(); opened.push(r); return r } })
        for (const [name, ok] of res) console.log((ok ? 'OK   ' : 'FAIL ') + name)
        if (!res.every(([, ok]) => ok)) process.exitCode = 1
      } finally { for (const r of opened) { try { r.close() } catch {} } fs.rmSync(dir, { recursive: true, force: true }) }
    } else {
      const minutes = Math.min(120, Math.max(1, Number(arg ?? 30) || 30))
      const token = randomBytes(32).toString('hex')
      await store.issueRecovery(hashRecoveryToken(token), minutes * 60_000)
      console.log(`Token de recuperación (un solo uso, expira en ${minutes} min). No lo guardes ni lo pegues en chats:`)
      console.log(token)
    }
  } finally { await pool.end() }
}
main().catch(e => { console.error(e.message); process.exitCode = 1 })
