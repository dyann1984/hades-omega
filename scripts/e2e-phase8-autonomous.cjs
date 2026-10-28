// End-to-end autonomous intelligence mission with 3 contrasting documents, reassignments, approval and isolation
const { spawn } = require('node:child_process')
const { randomBytes, createHash } = require('node:crypto')
const { mkdtemp, rm, mkdir } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join, resolve, dirname, basename } = require('node:path')
const { chromium } = require('@playwright/test')
const { SqliteRepository } = require('../packages/api/dist/sqlite.js')
const { hashPassword } = require('../packages/api/dist/password.js')

const root = resolve(__dirname, '..')
const base = 'http://127.0.0.1:44195'
const secret = randomBytes(32).toString('hex')
const password = randomBytes(20).toString('base64url')
const wait = ms => new Promise(r => setTimeout(r, ms))

async function ready(url) {
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(url)).ok) return
    } catch {}
    await wait(150)
  }
  throw Error(`Service unavailable ${url}`)
}

async function stop(p) {
  if (!p || p.exitCode !== null) return
  p.kill()
  await new Promise(r => {
    p.once('exit', r)
    setTimeout(r, 2000)
  })
}

async function login(page, username) {
  await page.getByLabel('Usuario').fill(username)
  await page.getByLabel('Contraseña').fill(password)
  const response = page.waitForResponse(r => r.url().endsWith('/api/v1/auth/login') && r.request().method() === 'POST')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  const data = await (await response).json()
  if (!data.success) throw Error('Login failed')
  await page.getByRole('button', { name: 'Cerrar sesión' }).waitFor()
  return data.data.token
}

async function main() {
  const dir = await mkdtemp(join(tmpdir(), 'hades-phase8-'))
  const db = join(dir, 'db.sqlite')
  const legacy = join(dir, 'none.json')
  let api, ui, browser

  const startApi = () => spawn(process.execPath, ['packages/api/dist/server.js'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: '44195',
      HOST: '127.0.0.1',
      JWT_SECRET: secret,
      ALLOWED_ORIGIN: 'http://127.0.0.1:44196',
      HADES_DATA_FILE: legacy,
      HADES_DB_FILE: db,
      NEAR_EXECUTION_MODE: 'simulation'
    },
    stdio: 'ignore'
  })

  try {
    const repo = new SqliteRepository(db, legacy)
    await repo.init()
    const hash = await hashPassword(password)
    for (const [name, role] of [['alice', 'OPERATOR'], ['bob', 'OPERATOR'], ['admin', 'ADMIN']]) {
      repo.createUser(name, hash, role)
    }
    repo.close()

    api = startApi()
    ui = spawn(
      process.execPath,
      [join(dirname(require.resolve('vite/package.json', { paths: [join(root, 'packages/frontend')] })), 'bin/vite.js'), '--host', '127.0.0.1', '--port', '44196', '--strictPort'],
      {
        cwd: join(root, 'packages/frontend'),
        env: { ...process.env, HADES_PROXY_TARGET: base, VITE_WS_URL: 'ws://127.0.0.1:44195/ws' },
        stdio: 'ignore'
      }
    )

    await Promise.all([ready(`${base}/health`), ready('http://127.0.0.1:44196')])

    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.HADES_BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    })

    const user = await browser.newPage({ reducedMotion: 'reduce' })
    const admin = await browser.newPage({ reducedMotion: 'reduce' })

    // Step 1: Alice logs in
    await user.goto('http://127.0.0.1:44196/command')
    const aliceToken = await login(user, 'alice')
    console.log('PASS Login de usuario Alice (OPERATOR)')

    // Step 2: Alice creates a Multi-document Comparison mission
    await user.getByRole('button', { name: '+ NUEVA MISIÓN' }).click()
    await user.getByRole('button', { name: 'MULTI-DOCUMENTAL' }).click()
    await user.getByPlaceholder('Título de la comparación multi-documental').fill('Auditoría Comparativa Tripartita F8')
    await user.getByPlaceholder('Doc A (Base): Precio $10,000 USD, Garantía 12 meses...').fill('Proveedor Alfa: Precio $10,000 USD, Garantía 12 meses, Entrega 15 días.')
    await user.getByPlaceholder('Doc B (Riesgo): Precio $12,500 USD, sin garantía expresa...').fill('Proveedor Beta: Precio $12,500 USD, sin garantía expresa, entrega inmediata.')
    await user.getByPlaceholder('Doc C (Dispar): Precio $9,800 USD, Penalización 0%...').fill('Proveedor Gamma: Precio $9,800 USD, Garantía 24 meses, Penalización 0% por mora.')

    await user.getByRole('button', { name: '⚡ PLANIFICAR Y COMPARAR (FASE 8)' }).click()
    await user.getByText('Misión multi-documental creada — esperando aprobación ADMIN').waitFor()
    console.log('PASS Misión multi-documental planificada con 3 documentos contrastantes')

    // Verify mission in API
    const listRes = await fetch(`${base}/api/v1/missions`, { headers: { authorization: `Bearer ${aliceToken}` } })
    const list = await listRes.json()
    const mission = list.data.find(x => x.title === 'Auditoría Comparativa Tripartita F8')
    if (!mission || mission.tasks.length !== 6) throw Error('Planificador no generó las 6 tareas esperadas')
    console.log('PASS Planificador estructuró 6 tareas deterministas acopladas a capacidades canónicas')

    // Step 3: Admin logs in and checks verified capabilities
    await admin.goto('http://127.0.0.1:44196/command')
    const adminToken = await login(admin, 'admin')
    const capRes = await fetch(`${base}/api/v1/capabilities`, { headers: { authorization: `Bearer ${adminToken}` } })
    const caps = await capRes.json()
    if (!caps.success || caps.data.length < 8) throw Error('Catálogo de capacidades incompleto')
    console.log('PASS Catálogo de capacidades canónicas inspeccionado por ADMIN')

    // Step 4: Test atomic reassignment on compatible executor (cap:crypto:hash@1.0.0)
    // Task 6 is computeSha256 assigned to HADES. Admin reassigns it to TARTARUS
    const hashTask = mission.tasks.find(t => t.id === 'task-6-hash' || t.title?.includes('Custodia') || t.title?.includes('SHA-256') || t.title?.includes('sellado'))
    if (!hashTask) throw Error('Tarea de sellado SHA-256 no encontrada')

    const reassignOk = await fetch(`${base}/api/v1/local-missions/${mission.id}/tasks/${hashTask.id}/reassign`, {
      method: 'POST',
      headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ newAssignee: 'TARTARUS', justification: 'Balanceo de carga a segundo ejecutor SHA-256' })
    })
    const reassignOkData = await reassignOk.json()
    if (!reassignOkData.success || reassignOkData.data.task.assignedTo !== 'TARTARUS') {
      throw Error(`Reasignación legítima a TARTARUS falló: ${JSON.stringify(reassignOkData)}`)
    }
    console.log('PASS Reasignación atómica verificada: HADES -> TARTARUS para cap:crypto:hash@1.0.0')

    // Step 5: Test invalid reassignment (BLOCKED BY DESIGN)
    // Task 5 is report generation assigned to ELYSIUM (status: ASSIGNED). Attempt to reassign to CHARON
    const reportTaskBefore = mission.tasks.find(t => t.id === 'task-5-report' || t.title?.includes('informe'))
    if (!reportTaskBefore) throw Error(`Tarea de informe de ELYSIUM no encontrada: ${JSON.stringify(mission.tasks.map(t=>t.title))}`)

    const reassignBlock = await fetch(`${base}/api/v1/local-missions/${mission.id}/tasks/${reportTaskBefore.id}/reassign`, {
      method: 'POST',
      headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ newAssignee: 'CHARON', justification: 'Intento inválido de reasignar informe a compras' })
    })
    if (reassignBlock.status !== 409) {
      const errText = await reassignBlock.text()
      throw Error(`Reasignación incompatible no fue rechazada con 409. Status=${reassignBlock.status}, body=${errText}`)
    }
    const blockData = await reassignBlock.json()
    if (blockData.error?.code !== 'REASSIGNMENT_BLOCKED_BY_DESIGN') {
      throw Error('Código de error incorrecto para reasignación bloqueada')
    }
    console.log('PASS Reasignación incompatible rechazada formalmente: REASSIGNMENT_BLOCKED_BY_DESIGN (409)')

    // Step 6: Admin approves the multi-document mission in Approval Gate
    await admin.getByRole('button', { name: '↺ ACTUALIZAR' }).click()
    const appRes = await fetch(`${base}/api/v1/local-approvals`, { headers: { authorization: `Bearer ${adminToken}` } })
    const appData = await appRes.json()
    const pending = appData.data.find(a => a.missionId === mission.id)
    if (!pending) throw Error('No hay aprobación pendiente registrada para la misión multi-documento')

    admin.once('dialog', d => d.accept('Aprobación autorizada para ejecución de cadena multiagente'))
    // Click approve button in UI
    await admin.getByRole('button', { name: '✓ APROBAR', exact: true }).first().click()
    console.log('PASS Misión aprobada por ADMIN en Approval Gate')

    // Wait for mission execution and report delivery
    await wait(2000)
    await user.getByRole('button', { name: '↺ ACTUALIZAR' }).click()

    // Step 7: Verify Multi-Agent pipeline execution & report results
    const finishedListRes = await fetch(`${base}/api/v1/missions`, { headers: { authorization: `Bearer ${aliceToken}` } })
    const finishedList = await finishedListRes.json()
    const finishedMission = finishedList.data.find(x => x.id === mission.id)
    if (!finishedMission || finishedMission.status !== 'COMPLETED') {
      throw Error(`Estado de misión inesperado: ${finishedMission?.status}`)
    }

    const reportTask = finishedMission.tasks.find(t => t.id === 'task-5-report' || t.title?.includes('informe') || t.assignedTo === 'ELYSIUM')
    const finalHashTask = finishedMission.tasks.find(t => t.id === 'task-6-hash' || t.title?.includes('Custodia') || t.title?.includes('SHA-256'))

    if (!reportTask?.result?.data?.reportMarkdown || !reportTask.result.data.reportMarkdown.includes('INFORME CONSOLIDADO')) {
      throw Error(`Informe de ELYSIUM no contiene la síntesis ejecutiva esperada: ${JSON.stringify(reportTask)}`)
    }
    if (!finalHashTask?.result?.data?.sha256 || finalHashTask.assignedTo !== 'TARTARUS') {
      throw Error(`Hash sellado por TARTARUS no está presente o ejecutor fue alterado: ${JSON.stringify(finalHashTask)}`)
    }
    console.log('PASS Flujo multiagente completo (CHARON -> MINOS -> PERSEPHONE -> HADES -> ELYSIUM -> TARTARUS)')
    console.log(`PASS Reporte ejecutivo Markdown generado y sellado con SHA-256 por ${finalHashTask.assignedTo}: ${finalHashTask.result.data.sha256.slice(0, 16)}...`)

    // Save screenshot evidence
    await mkdir(join(root, 'evidence-fase8'), { recursive: true })
    await admin.screenshot({ path: join(root, 'evidence-fase8', 'command-center-phase8-execution.png'), fullPage: true })

    // Step 8: Backend restart and persistence verification
    await stop(api)
    api = startApi()
    await ready(`${base}/health`)
    console.log('PASS Backend reiniciado')

    const persistedRes = await fetch(`${base}/api/v1/missions/${mission.id}`, { headers: { authorization: `Bearer ${aliceToken}` } })
    if (!persistedRes.ok) throw Error('Misión no persistió tras el reinicio del servidor')
    const persistedMission = (await persistedRes.json()).data
    const persistedHashTask = persistedMission.tasks.find(t => t.id === 'task-6-hash' || t.title?.includes('Custodia') || t.title?.includes('SHA-256'))
    if (persistedMission.status !== 'COMPLETED' || persistedHashTask?.assignedTo !== 'TARTARUS') {
      throw Error(`Datos persistidos en SQLite corruptos o incompletos tras reinicio: status=${persistedMission.status}, assignedTo=${persistedHashTask?.assignedTo}`)
    }
    console.log('PASS Persistencia íntegra de la misión y tareas en SQLite tras reinicio')

    // Step 9: User Isolation Check
    await user.getByRole('button', { name: 'Cerrar sesión' }).click()
    await user.getByRole('button', { name: 'Ingresar' }).waitFor()
    const bobToken = await login(user, 'bob')
    const bobAccess = await fetch(`${base}/api/v1/missions/${mission.id}`, { headers: { authorization: `Bearer ${bobToken}` } })
    if (bobAccess.status !== 404) throw Error('Fuga de aislamiento multiusuario: Bob pudo acceder a la misión de Alice')
    await user.getByRole('button', { name: '↺ ACTUALIZAR' }).click()
    if (await user.getByText('Auditoría Comparativa Tripartita F8').count()) throw Error('Fuga de interfaz: Bob ve la misión privada de Alice')
    console.log('PASS Aislamiento estricto multiusuario: Bob no puede acceder a las misiones de Alice (404 y UI)')

  } finally {
    await browser?.close()
    await stop(ui)
    await stop(api)
    if (dirname(resolve(dir)) !== resolve(tmpdir()) || !basename(dir).startsWith('hades-phase8-')) {
      throw Error('Refusing to remove unexpected temporary path')
    }
    await rm(dir, { recursive: true, force: true })
  }
}

main().then(() => {
  console.log('=============================================')
  console.log('FASE 8: AUTONOMOUS INTELLIGENCE E2E COMPLETO')
  console.log('=============================================')
  process.exit(0)
}).catch(e => {
  console.error('FAIL E2E FASE 8:', e.message)
  process.exit(1)
})
