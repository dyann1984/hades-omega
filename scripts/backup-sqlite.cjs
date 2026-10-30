// Consistent SQLite backup (VACUUM INTO) + integrity check. Usage:
//   HADES_DB_FILE=<db> node scripts/backup-sqlite.cjs <backup-file>
// Restore: stop the API, copy the backup over HADES_DB_FILE (remove -wal/-shm), start the API.
const Database = require('better-sqlite3')
const fs = require('node:fs')
const src = process.env.HADES_DB_FILE, dest = process.argv[2]
if (!src || !dest) { console.error('Uso: HADES_DB_FILE=<ruta> node scripts/backup-sqlite.cjs <archivo-respaldo>'); process.exit(1) }
if (fs.existsSync(dest)) { console.error('El archivo de respaldo ya existe; no se sobrescribe.'); process.exit(1) }
const db = new Database(src, { readonly: true })
db.exec(`VACUUM INTO '${dest.replace(/\\/g, '/').replace(/'/g, "''")}'`)
db.close()
const check = new Database(dest, { readonly: true })
const result = check.pragma('integrity_check', { simple: true })
const users = check.prepare('SELECT COUNT(*) c FROM users').get().c
const missions = check.prepare('SELECT COUNT(*) c FROM missions').get().c
check.close()
console.log(`Respaldo creado: integrity_check=${result} users=${users} missions=${missions}`)
if (result !== 'ok') process.exit(2)