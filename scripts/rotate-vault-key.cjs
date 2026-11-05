// Rotación operativa de la clave maestra del Vault. Nunca recibe claves por argumentos.
//   Generar una clave nueva (imprime solo la clave, para guardarla en el gestor de secretos):
//     node scripts/rotate-vault-key.cjs generate
//   Rotar (detener antes TODOS los procesos HADES que usan la base):
//     HADES_DB_FILE=<db> HADES_VAULT_MASTER_KEY=<clave actual> HADES_VAULT_NEW_KEY=<clave nueva> \
//       node scripts/rotate-vault-key.cjs rotate <archivo-respaldo>
// Procedimiento completo: docs/vault-secrets.md
const { randomBytes } = require('node:crypto')

async function main() {
  const [command, backupFile] = process.argv.slice(2)
  if (command === 'generate') { console.log(randomBytes(32).toString('base64')); return }
  const dbFile = process.env.HADES_DB_FILE
  if (command !== 'rotate' || !dbFile || !backupFile) throw new Error('Uso: node scripts/rotate-vault-key.cjs generate | rotate <archivo-respaldo> (con HADES_DB_FILE, HADES_VAULT_MASTER_KEY y HADES_VAULT_NEW_KEY en el entorno)')
  const { rotateVaultKey } = require('../packages/api/dist/vault-rotation.js')
  const report = await rotateVaultKey({ dbFile, legacyFile: process.env.HADES_DATA_FILE, oldKey: process.env.HADES_VAULT_MASTER_KEY, newKey: process.env.HADES_VAULT_NEW_KEY, backupFile, actor: `operator:${process.env.USERNAME || process.env.USER || 'cli'}` })
  console.log(`Rotación verificada: entradas=${report.entries} respaldo=${report.backupFile}`)
  console.log('Siguiente paso: actualizar HADES_VAULT_MASTER_KEY en el gestor externo y reiniciar los procesos. Conservar la clave anterior hasta validar el arranque.')
}
main().catch(error => { console.error(`Rotación abortada sin cambios o con respaldo disponible: ${error.message}`); process.exitCode = 1 })
