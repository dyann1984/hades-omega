// Crea una cuenta local explícita; lee la contraseña de stdin, nunca de argumentos.
const { SqliteRepository } = require('../packages/api/dist/sqlite.js')
const { hashPassword } = require('../packages/api/dist/password.js')
async function main() {
  const [username,role] = process.argv.slice(2); const db = process.env.HADES_DB_FILE
  if (!db || !username || !role) throw new Error('Uso: HADES_DB_FILE=<ruta> node scripts/create-local-user.cjs <usuario> <rol>; contraseña por stdin')
  let password=''; for await (const chunk of process.stdin) password+=chunk
  password=password.replace(/\r?\n$/, '')
  const hash=await hashPassword(password); password=''
  const repo=new SqliteRepository(db,process.env.HADES_DATA_FILE || `${db}.legacy.json`)
  try { await repo.init(); repo.createUser(username,hash,role); console.log('Cuenta local creada') } finally { repo.close() }
}
main().catch(error=>{console.error(error.message);process.exitCode=1})
