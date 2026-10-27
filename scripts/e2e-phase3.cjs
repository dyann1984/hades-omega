// Runs real API, SQLite and two Vite sessions using ephemeral test identities.
const { spawn } = require('node:child_process')
const { randomBytes, createHash, createHmac } = require('node:crypto')
const { mkdtemp, rm } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join, resolve } = require('node:path')
const { chromium } = require('@playwright/test')
const root=resolve(__dirname,'..'), secret=randomBytes(32).toString('hex'), base='http://127.0.0.1:44091'
const enc=x=>Buffer.from(JSON.stringify(x)).toString('base64url')
function token(sub,roles){const payload=`${enc({alg:'HS256',typ:'JWT'})}.${enc({sub,roles,exp:Math.floor(Date.now()/1000)+600})}`;return `${payload}.${createHmac('sha256',secret).update(payload).digest('base64url')}`}
const alice=token('alice',['OPERATOR']), admin=token('admin',['ADMIN']), bob=token('bob',['VIEWER'])
const wait=ms=>new Promise(r=>setTimeout(r,ms))
async function ready(url){for(let i=0;i<120;i++){try{if((await fetch(url)).ok)return}catch{} await wait(150)}throw Error(`Service unavailable ${url}`)}
async function stop(p){if(!p||p.exitCode!==null)return;p.kill();await new Promise(r=>{p.once('exit',r);setTimeout(r,2000)})}
async function main(){
 const dir=await mkdtemp(join(tmpdir(),'hades-browser-'));let api,uiA,uiAdmin,browser
 const startApi=()=>spawn(process.execPath,['packages/api/dist/server.js'],{cwd:root,env:{...process.env,PORT:'44091',HOST:'127.0.0.1',JWT_SECRET:secret,ALLOWED_ORIGIN:'http://127.0.0.1:44092,http://127.0.0.1:44093',HADES_DATA_FILE:join(dir,'legacy.json'),HADES_DB_FILE:join(dir,'db.sqlite'),NEAR_EXECUTION_MODE:'simulation'},stdio:'ignore'})
 const startUi=(port,t)=>spawn(process.execPath,[join(root,'node_modules/vite/bin/vite.js'),'--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:join(root,'packages/frontend'),env:{...process.env,VITE_DEV_TOKEN:t,HADES_PROXY_TARGET:base,VITE_WS_URL:'ws://127.0.0.1:44091/ws'},stdio:'ignore'})
 try {
  api=startApi();uiA=startUi(44092,alice);uiAdmin=startUi(44093,admin);await Promise.all([ready(`${base}/health`),ready('http://127.0.0.1:44092'),ready('http://127.0.0.1:44093')])
  const executablePath=process.env.HADES_BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  browser=await chromium.launch({headless:true,executablePath}); const user=await browser.newPage(), reviewer=await browser.newPage()
  await user.goto('http://127.0.0.1:44092/throne');const userSection=user.getByRole('region',{name:'Operación local verificable'})
  await userSection.getByLabel('Título').fill('Misión real E2E');await userSection.getByLabel('Entrada').fill('entrada real verificable');await userSection.getByRole('button',{name:'Solicitar operación'}).click();await userSection.getByText('Misión creada. La operación espera aprobación ADMIN.').waitFor()
  const list=await (await fetch(`${base}/api/v1/missions`,{headers:{authorization:`Bearer ${alice}`}})).json();const mission=list.data.find(x=>x.title==='Misión real E2E');if(!mission||mission.tasks[0].status!=='CERBERUS_REVIEW')throw Error('Approval hold missing')
  if((await fetch(`${base}/api/v1/missions/${mission.id}`,{headers:{authorization:`Bearer ${bob}`}})).status!==404)throw Error('Owner isolation failed')
  await reviewer.goto('http://127.0.0.1:44093/throne');const review=reviewer.getByRole('region',{name:'Operación local verificable'});await review.getByRole('button',{name:'Actualizar'}).click();await review.getByText('entrada real verificable').waitFor();reviewer.once('dialog',d=>d.accept('Revisado en prueba E2E'));await review.getByRole('button',{name:'Aprobar',exact:true}).click()
  const digest=createHash('sha256').update('entrada real verificable').digest('hex');await review.getByText(`SHA-256: ${digest}`).waitFor();console.log('PASS navegador: creación, espera, aprobación ADMIN y resultado real SHA-256')
  await stop(api);api=startApi();await ready(`${base}/health`);await userSection.getByRole('button',{name:'Actualizar'}).click();await userSection.getByText(`SHA-256: ${digest}`).waitFor()
  const history=await fetch(`${base}/api/v1/local-missions/${mission.id}/history`,{headers:{authorization:`Bearer ${alice}`}});if(!history.ok || !(await history.json()).data.some(e=>e.payload.state==='COMPLETED'))throw Error('History missing')
  console.log('PASS reinicio SQLite, historial y denegación de otro usuario')
 } finally {await browser?.close();await stop(uiA);await stop(uiAdmin);await stop(api);await rm(dir,{recursive:true,force:true})}
}
main().catch(e=>{console.error('FAIL',e.message);process.exitCode=1})
