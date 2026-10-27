// Recuperación manual: acceso al archivo SQLite y contraseña nueva por stdin.
const { SqliteRepository }=require('../packages/api/dist/sqlite.js')
const { hashPassword }=require('../packages/api/dist/password.js')
async function main(){
 const username=process.argv[2],db=process.env.HADES_DB_FILE
 if(!db||!username)throw Error('Uso: HADES_DB_FILE=<ruta> node scripts/reset-local-password.cjs <usuario>; contraseña nueva por stdin')
 let password='';for await(const chunk of process.stdin)password+=chunk;password=password.replace(/\r?\n$/,'')
 const hash=await hashPassword(password);password=''
 const repo=new SqliteRepository(db,process.env.HADES_DATA_FILE||`${db}.legacy.json`)
 try{await repo.init();if(!repo.resetPassword(username,hash))throw Error('Usuario no encontrado');console.log('Contraseña actualizada y sesiones revocadas')}finally{repo.close()}
}
main().catch(error=>{console.error(error.message);process.exitCode=1})
