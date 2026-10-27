// End-to-end using real password login, real backend and isolated SQLite users.
const { spawn }=require('node:child_process')
const { randomBytes, createHash }=require('node:crypto')
const { mkdtemp, rm }=require('node:fs/promises')
const { tmpdir }=require('node:os')
const { join, resolve, dirname }=require('node:path')
const { chromium }=require('@playwright/test')
const { SqliteRepository }=require('../packages/api/dist/sqlite.js')
const { hashPassword }=require('../packages/api/dist/password.js')
const root=resolve(__dirname,'..'), base='http://127.0.0.1:44191',secret=randomBytes(32).toString('hex'), password=randomBytes(20).toString('base64url')
const wait=ms=>new Promise(r=>setTimeout(r,ms))
async function ready(url){for(let i=0;i<120;i++){try{if((await fetch(url)).ok)return}catch{}await wait(150)}throw Error(`Service unavailable ${url}`)}
async function stop(p){if(!p||p.exitCode!==null)return;p.kill();await new Promise(r=>{p.once('exit',r);setTimeout(r,2000)})}
async function login(page,username){await page.getByLabel('Usuario').fill(username);await page.getByLabel('Contraseña').fill(password);const response=page.waitForResponse(r=>r.url().endsWith('/api/v1/auth/login')&&r.request().method()==='POST');await page.getByRole('button',{name:'Ingresar'}).click();const data=await (await response).json();if(!data.success)throw Error('Login failed');await page.getByRole('button',{name:'Cerrar sesión'}).waitFor();return data.data.token}
async function main(){const dir=await mkdtemp(join(tmpdir(),'hades-phase4-'));const db=join(dir,'db.sqlite'), legacy=join(dir,'none.json');let api,ui,browser
 const startApi=()=>spawn(process.execPath,['packages/api/dist/server.js'],{cwd:root,env:{...process.env,PORT:'44191',HOST:'127.0.0.1',JWT_SECRET:secret,ALLOWED_ORIGIN:'http://127.0.0.1:44192',HADES_DATA_FILE:legacy,HADES_DB_FILE:db,NEAR_EXECUTION_MODE:'simulation'},stdio:'ignore'})
 try {
  const repo=new SqliteRepository(db,legacy);await repo.init();const hash=await hashPassword(password);for(const [name,role] of [['alice','OPERATOR'],['bob','OPERATOR'],['admin','ADMIN']])repo.createUser(name,hash,role);repo.close()
  api=startApi();ui=spawn(process.execPath,[join(dirname(require.resolve('vite/package.json',{paths:[join(root,'packages/frontend')]})),'bin/vite.js'),'--host','127.0.0.1','--port','44192','--strictPort'],{cwd:join(root,'packages/frontend'),env:{...process.env,HADES_PROXY_TARGET:base,VITE_WS_URL:'ws://127.0.0.1:44191/ws'},stdio:'ignore'});await Promise.all([ready(`${base}/health`),ready('http://127.0.0.1:44192')])
  browser=await chromium.launch({headless:true,executablePath:process.env.HADES_BROWSER_PATH||'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'});const user=await browser.newPage(),admin=await browser.newPage()
  await user.goto('http://127.0.0.1:44192/throne');const aliceToken=await login(user,'alice');const sec=user.getByRole('region',{name:'Operación local verificable'})
  await sec.getByLabel('Título').fill('Misión real Fase 4');await sec.getByLabel('Entrada').fill('entrada autenticada');await sec.getByRole('button',{name:'Solicitar operación'}).click();await sec.getByText('Misión creada. La operación espera aprobación ADMIN.').waitFor()
  const list=await (await fetch(`${base}/api/v1/missions`,{headers:{authorization:`Bearer ${aliceToken}`}})).json();const mission=list.data.find(x=>x.title==='Misión real Fase 4');if(!mission||mission.tasks[0].status!=='CERBERUS_REVIEW')throw Error('Missing approval hold')
  await stop(api);api=startApi();await ready(`${base}/health`);
  await admin.goto('http://127.0.0.1:44192/throne');await login(admin,'admin');const review=admin.getByRole('region',{name:'Operación local verificable'});await review.getByRole('button',{name:'Actualizar'}).click();await review.getByText('entrada autenticada').waitFor();admin.once('dialog',d=>d.accept('Revisado por administrador'));await review.getByRole('button',{name:'Aprobar',exact:true}).click()
  const digest=createHash('sha256').update('entrada autenticada').digest('hex');await review.getByText(`SHA-256: ${digest}`).waitFor();console.log('PASS login real y misión SHA-256 aprobada')
  await stop(api);api=startApi();await ready(`${base}/health`);await sec.getByRole('button',{name:'Actualizar'}).click();await sec.getByText(`SHA-256: ${digest}`).waitFor();console.log('PASS persistencia tras reinicio')
  await sec.getByLabel('Título').fill('Misión cancelable');await sec.getByLabel('Entrada').fill('No procesar');await sec.getByRole('button',{name:'Solicitar operación'}).click();await sec.getByText('Misión creada. La operación espera aprobación ADMIN.').waitFor();user.once('dialog',d=>d.accept('Cancelación solicitada'));await sec.getByRole('button',{name:'Cancelar misión'}).click();await sec.getByText('Misión cancelada antes de ejecutar.').waitFor();console.log('PASS cancelación durante espera de aprobación')
  await user.getByRole('button',{name:'Cerrar sesión'}).click();await user.getByRole('button',{name:'Ingresar'}).waitFor();if((await fetch(`${base}/api/v1/missions`,{headers:{authorization:`Bearer ${aliceToken}`}})).status!==401)throw Error('Session not revoked')
  const bobToken=await login(user,'bob');if((await fetch(`${base}/api/v1/missions/${mission.id}`,{headers:{authorization:`Bearer ${bobToken}`}})).status!==404)throw Error('Cross-user leak');await user.getByRole('region',{name:'Operación local verificable'}).getByRole('button',{name:'Actualizar'}).click();if(await user.getByText('Misión real Fase 4').count())throw Error('Private UI data leaked');console.log('PASS logout, revocación y cambio de usuario')
 } finally {await browser?.close();await stop(ui);await stop(api);await rm(dir,{recursive:true,force:true})}}
main().catch(e=>{console.error('FAIL',e.message);process.exitCode=1})
