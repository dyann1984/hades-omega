// Local smoke test with isolated credentials and a temporary data directory.
const { spawn } = require('node:child_process')
const { randomBytes, createHmac } = require('node:crypto')
const { mkdtemp, rm } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const WebSocket = require('ws')
const root = resolve(__dirname, '..')
const secret = randomBytes(32).toString('hex')
const enc = x => Buffer.from(JSON.stringify(x)).toString('base64url')
const input = `${enc({alg:'HS256',typ:'JWT'})}.${enc({sub:'smoke-admin',roles:['ADMIN'],exp:Math.floor(Date.now()/1000)+300})}`
const token = `${input}.${createHmac('sha256',secret).update(input).digest('base64url')}`
const apiPort = 43991, frontPort = 43992
const base = `http://127.0.0.1:${apiPort}`
const wait = ms => new Promise(r => setTimeout(r,ms))
async function ready(url) { for(let i=0;i<100;i++){try{ const r=await fetch(url); if(r.ok)return }catch{} await wait(150)} throw Error(`service unavailable: ${url}`) }
async function stop(p) { if (!p || p.exitCode !== null) return; p.kill(); await new Promise(resolve => { p.once('exit',resolve); setTimeout(resolve,2000) }) }
async function main(){
 const dir = await mkdtemp(join(tmpdir(),'hades-phase2-')); let api,front
 const startApi=()=>spawn(process.execPath,['packages/api/dist/server.js'],{cwd:root,env:{...process.env,PORT:String(apiPort),HOST:'127.0.0.1',JWT_SECRET:secret,ALLOWED_ORIGIN:`http://127.0.0.1:${frontPort}`,HADES_DATA_FILE:join(dir,'data.json'),NEAR_EXECUTION_MODE:'simulation'},stdio:'ignore'})
 try {
  api=startApi(); front=spawn(process.execPath,[join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(frontPort),'--strictPort'],{cwd:join(root,'packages/frontend'),env:process.env,stdio:'ignore'})
  await ready(`${base}/health`); console.log('PASS backend health')
  await ready(`http://127.0.0.1:${frontPort}/`); console.log('PASS frontend HTTP')
  if((await fetch(`${base}/api/v1/missions`)).status!==401) throw Error('unauthenticated API not rejected'); console.log('PASS API rejects unauthenticated requests')
  const ws=new WebSocket(`ws://127.0.0.1:${apiPort}/ws`)
  await new Promise((resolve,reject)=>{ws.on('open',()=>ws.send(JSON.stringify({type:'AUTH',token}))); ws.on('message',data=>{if(JSON.parse(data).type==='CONNECTED') resolve()}); ws.on('error',reject); setTimeout(()=>reject(Error('WS timeout')),5000)})
  ws.close(); console.log('PASS authenticated WebSocket')
  const headers={authorization:`Bearer ${token}`,'content-type':'application/json'}
  const response=await fetch(`${base}/api/v1/missions`,{method:'POST',headers,body:JSON.stringify({title:'Verificación local',description:'Evaluación de proveedores de demostración'})})
  if(!response.ok) throw Error(`mission HTTP ${response.status}`); const mission=(await response.json()).data
  if(!mission.id || !mission.tasks.length) throw Error('missing mission/tasks'); console.log(`PASS mission created and tasks assigned (${mission.status}; no real execution claimed)`)
  await stop(api); api=startApi(); await ready(`${base}/health`)
  const restored=await fetch(`${base}/api/v1/missions/${mission.id}`,{headers}); if(!restored.ok || (await restored.json()).data.id!==mission.id) throw Error('mission not restored')
  console.log('PASS JSON mission restored after restart')
 } finally { await stop(front); await stop(api); await rm(dir,{recursive:true,force:true}) }
}
main().catch(error=>{console.error('FAIL',error.message);process.exitCode=1})

