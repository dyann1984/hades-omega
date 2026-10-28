const { chromium } = require('@playwright/test')
const { spawn } = require('node:child_process')
const { randomBytes } = require('node:crypto')
const { mkdtemp, rm, mkdir } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join, resolve, dirname, basename } = require('node:path')
const { SqliteRepository } = require('../packages/api/dist/sqlite.js')
const { hashPassword } = require('../packages/api/dist/password.js')

const root = resolve(__dirname, '..')
const base = 'http://127.0.0.1:44391'
const secret = randomBytes(32).toString('hex')
const password = randomBytes(20).toString('base64url')
const wait = ms => new Promise(r => setTimeout(r, ms))

async function ready(url) {
  for (let i = 0; i < 120; i++) {
    try { if ((await fetch(url)).ok) return } catch {}
    await wait(150)
  }
  throw Error(`Service unavailable ${url}`)
}

async function stop(p) {
  if (!p || p.exitCode !== null) return
  p.kill()
  await new Promise(r => { p.once('exit', r); setTimeout(r, 2000) })
}

async function login(page, user) {
  await page.getByLabel('Usuario').fill(user)
  await page.getByLabel('Contraseña').fill(password)
  const response = page.waitForResponse(r => r.url().endsWith('/api/v1/auth/login') && r.request().method() === 'POST')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  const data = await (await response).json()
  if (!data.success) throw Error('Login failed')
  await page.getByRole('button', { name: 'Cerrar sesión' }).waitFor()
  return data.data.token
}

async function main() {
  const dir = await mkdtemp(join(tmpdir(), 'hades-webgl-val-'))
  const db = join(dir, 'db.sqlite'), legacy = join(dir, 'none.json')
  let api, ui, browser

  const startApi = () => spawn(process.execPath, ['packages/api/dist/server.js'], {
    cwd: root,
    env: {
      ...process.env,
      PORT: '44391',
      HOST: '127.0.0.1',
      JWT_SECRET: secret,
      ALLOWED_ORIGIN: 'http://127.0.0.1:44392',
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
    repo.createUser('admin', hash, 'ADMIN')
    repo.close()

    api = startApi()
    ui = spawn(process.execPath, [
      join(dirname(require.resolve('vite/package.json', { paths: [join(root, 'packages/frontend')] })), 'bin/vite.js'),
      '--host', '127.0.0.1', '--port', '44392', '--strictPort'
    ], {
      cwd: join(root, 'packages/frontend'),
      env: { ...process.env, HADES_PROXY_TARGET: base, VITE_WS_URL: 'ws://127.0.0.1:44391/ws' },
      stdio: 'ignore'
    })

    await Promise.all([ready(`${base}/health`), ready('http://127.0.0.1:44392')])

    browser = await chromium.launch({
      headless: true,
      executablePath: process.env.HADES_BROWSER_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
    })

    // 1. Test 3D Scene with WebGL in standard mode
    const page3D = await browser.newPage({ reducedMotion: 'no-preference' })
    const errors3D = []
    page3D.on('pageerror', err => errors3D.push(err.message))
    page3D.on('console', msg => { if (msg.type() === 'error') errors3D.push(msg.text()) })

    await page3D.goto('http://127.0.0.1:44392/command')
    await login(page3D, 'admin')

    const canvas = page3D.locator('canvas').first()
    await canvas.waitFor({ timeout: 15000 })
    console.log('PASS WebGL canvas rendered')

    // Inspect WebGL Context directly
    const glInfo = await page3D.evaluate(() => {
      const c = document.querySelector('canvas')
      if (!c) return { hasCanvas: false }
      const gl = c.getContext('webgl2') || c.getContext('webgl')
      if (!gl) return { hasCanvas: true, hasContext: false }
      const ext = gl.getExtension('WEBGL_debug_renderer_info')
      const renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
      const vendor = ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR)
      return {
        hasCanvas: true,
        hasContext: true,
        isWebGL2: gl instanceof (window.WebGL2RenderingContext || class {}),
        renderer,
        vendor,
        width: c.width,
        height: c.height,
        maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE)
      }
    })
    console.log('WebGL Context Details:', JSON.stringify(glInfo))
    if (!glInfo.hasContext) throw Error('WebGL context could not be created')

    // Measure FPS over 60 frames
    const fps = await page3D.evaluate(() => new Promise(resolve => {
      let n = 0, start = performance.now()
      function frame(now) {
        if (++n === 60) resolve(Math.round(59000 / (now - start)))
        else requestAnimationFrame(frame)
      }
      requestAnimationFrame(frame)
    }))
    console.log(`PASS WebGL animation loop active: ${fps} FPS`)
    if (fps < 20) throw Error(`Performance too low: ${fps} FPS`)

    if (errors3D.length > 0) throw Error(`Console errors in 3D mode: ${errors3D.join(' | ')}`)
    console.log('PASS 0 console errors in WebGL 3D mode')

    await mkdir(join(root, 'evidence-fase71'), { recursive: true })
    await page3D.screenshot({ path: join(root, 'evidence-fase71', 'webgl-3d-active.png') })

    // 2. Test Reduced Motion Fallback Mode
    const pageReduced = await browser.newPage({ reducedMotion: 'reduce' })
    const errorsReduced = []
    pageReduced.on('pageerror', err => errorsReduced.push(err.message))
    pageReduced.on('console', msg => { if (msg.type() === 'error') errorsReduced.push(msg.text()) })

    await pageReduced.goto('http://127.0.0.1:44392/command')
    await login(pageReduced, 'admin')

    const fallbackSvg = pageReduced.locator('svg[aria-label="HADES OMEGA - Red de agentes"]')
    await fallbackSvg.waitFor({ timeout: 10000 })
    console.log('PASS Reduced motion mode correctly displays FallbackCore SVG')

    const canvasCountInReduced = await pageReduced.locator('canvas').count()
    if (canvasCountInReduced !== 0) throw Error('Canvas should not be present in reduced motion mode')
    console.log('PASS No WebGL canvas rendered when reduced motion is preferred')

    if (errorsReduced.length > 0) throw Error(`Console errors in reduced motion mode: ${errorsReduced.join(' | ')}`)
    console.log('PASS 0 console errors in reduced motion mode')

    await pageReduced.screenshot({ path: join(root, 'evidence-fase71', 'reduced-motion-svg.png') })

    console.log('ALL WEBGL AND FALLBACK VALIDATIONS COMPLETED SUCCESSFULLY (PASS)')
  } finally {
    await browser?.close()
    await stop(ui)
    await stop(api)
    if (dirname(resolve(dir)) !== resolve(tmpdir()) || !basename(dir).startsWith('hades-webgl-val-')) {
      throw Error('Refusing to remove unexpected path')
    }
    await rm(dir, { recursive: true, force: true })
  }
}

main().catch(err => {
  console.error('FAIL WebGL validation:', err.message)
  process.exitCode = 1
})
