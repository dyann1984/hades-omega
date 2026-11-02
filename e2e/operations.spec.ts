import { expect, test, type Page } from '@playwright/test'
import { CANARIES } from './global-setup'
import { adminApi, goto, login, state, watch } from './helpers'

const accept = (page: Page, promptText = 'Justificación E2E: revisado'): void => { page.on('dialog', d => { void d.accept(d.type() === 'prompt' ? promptText : undefined) }) }
const stage = (page: Page, id: string) => page.locator(`[data-stage="${id}"]`)

async function newMission(page: Page, title: string): Promise<void> {
  await goto(page, '/audit')
  await page.getByLabel('Título').fill(title)
  await page.getByRole('button', { name: 'Crear misión y ejecutar agentes' }).click()
  await expect(stage(page, 'cerberus')).toBeVisible({ timeout: 20_000 })
}

test.describe('Vault', () => {
  test('shows real backend state, NEAR pending configuration, and never exposes a secret', async ({ page }) => {
    const w = watch(page); const s = state()
    await login(page); await goto(page, '/vault')
    await expect(page.getByText('Estado real consultado al backend')).toBeVisible()
    await expect(page.getByText('Configuración pendiente').first()).toBeVisible()
    await expect(page.getByText('HADES API')).toBeVisible()
    await expect(page.getByText('Base de datos SQLite')).toBeVisible()
    await page.getByRole('button', { name: 'POLÍTICAS' }).click()
    await expect(page.getByText(/R-001/).first()).toBeVisible()
    await expect(page.getByText('near.audit_hash_submit').first()).toBeVisible()
    await page.getByRole('button', { name: 'ENTORNO' }).click()
    await expect(page.getByText('configurado · oculto').first()).toBeVisible()
    await expect(page.getByText('ANTHROPIC_API_KEY')).toBeVisible()
    const html = await page.content(), text = await page.locator('body').innerText()
    const everything = [html, text, ...w.bodies].join('\n')
    for (const secret of [...Object.values(CANARIES), s.jwt, s.password]) expect(everything.includes(secret), 'secret leaked to the browser').toBe(false)
    expect(everything).not.toMatch(/Vercel|Simulado/)
    expect(w.problems).toEqual([])
  })

  test('ADMIN manages the recipient allowlist; invalid and mainnet recipients are refused', async ({ page }) => {
    accept(page)
    await login(page); await goto(page, '/vault')
    await page.getByRole('button', { name: 'DESTINATARIOS' }).click()
    await page.locator('#recipient-tool').selectOption('near.audit_hash_submit')
    await page.getByLabel('Destinatario').fill('audit.e2e.testnet')
    await page.getByRole('button', { name: 'Agregar' }).click()
    await expect(page.getByText('audit.e2e.testnet').first()).toBeVisible()
    await page.getByLabel('Destinatario').fill('treasury.near') // mainnet-style id
    await page.getByRole('button', { name: 'Agregar' }).click()
    await expect.poll(async () => (await adminApi('GET', '/cerberus/gate/recipients')).json.data.map((r: any) => r.recipient)).toEqual(['audit.e2e.testnet'])
    await expect(page.getByText('treasury.near')).toHaveCount(0)
    await page.getByRole('button', { name: 'Quitar' }).click()
    await expect(page.getByText('Lista vacía')).toBeVisible()
  })

  test('AI egress is off by default; an ADMIN authorizes it with limits, it persists, and the stop blocks enabling it', async ({ page }) => {
    accept(page)
    expect((await adminApi('GET', '/vault/llm-policy')).json.data.policy.enabled).toBe(false)
    await login(page); await goto(page, '/vault')
    const box = page.locator('[data-llm-policy]')
    await expect(box).toContainText('desactivado')
    const next = (await adminApi('GET', '/vault/llm-policy')).json.data.policy.dailyLimit + 1 // always a real change (the server persists across both viewports)
    await box.getByLabel('Cuota diaria (llamadas)').fill(String(next)); await box.getByRole('button', { name: 'Guardar límites' }).click()
    await expect.poll(async () => (await adminApi('GET', '/vault/llm-policy')).json.data.policy.dailyLimit).toBe(next)
    await box.getByRole('button', { name: 'Autorizar egreso' }).click()
    await expect(box).toContainText('AUTORIZADO')
    expect((await adminApi('GET', '/vault/llm-policy')).json.data.policy).toMatchObject({ enabled: true, dailyLimit: next, updatedBy: expect.stringMatching(/./) })
    await box.getByRole('button', { name: 'Desactivar egreso' }).click()
    await expect(box).toContainText('desactivado')
    await adminApi('POST', '/cerberus/emergency-stop', { stopped: true })
    expect((await adminApi('POST', '/vault/llm-policy', { enabled: true })).status).toBe(409)
    await adminApi('POST', '/cerberus/emergency-stop', { stopped: false })
    expect((await adminApi('GET', '/vault/llm-policy')).json.data.policy.enabled).toBe(false)
  })

  test('the emergency stop is real: it shows ACTIVA, is persisted by the server, and can be lifted', async ({ page }) => {
    accept(page)
    await login(page); await goto(page, '/vault')
    await page.getByRole('button', { name: 'Activar parada' }).click()
    await expect(page.getByText('Parada de emergencia: ACTIVA')).toBeVisible()
    expect((await adminApi('GET', '/cerberus/emergency-stop')).json.data.stopped).toBe(true)
    await page.getByRole('button', { name: 'Reanudar' }).click()
    await expect(page.getByText('Parada de emergencia: inactiva')).toBeVisible()
    expect((await adminApi('GET', '/cerberus/emergency-stop')).json.data.stopped).toBe(false)
  })
})

test.describe('Audit flow (agents → CERBERUS approval → evidence → CHRONOS → NEAR plan)', () => {
  test('approval completes the mission; planned steps are never shown as executed', async ({ page }) => {
    const w = watch(page); accept(page)
    const title = `E2E aprobar ${Date.now()}`
    await login(page); await newMission(page, title)
    for (const id of ['intake', 'validation', 'analysis']) { await expect(stage(page, id)).toContainText('Completado'); await expect(stage(page, id)).toContainText(/(?<!no )ejecutado/) }
    await expect(stage(page, 'intake')).toContainText('CHARON'); await expect(stage(page, 'validation')).toContainText('MINOS'); await expect(stage(page, 'analysis')).toContainText('PERSEPHONE')
    await expect(stage(page, 'cerberus')).toContainText('Espera aprobación')
    for (const id of ['report', 'seal', 'evidence', 'followup', 'near']) await expect(stage(page, id)).toContainText('no ejecutado')

    await page.getByRole('button', { name: 'Aprobar (ADMIN)' }).click()
    await expect(stage(page, 'report')).toContainText('Completado', { timeout: 20_000 })
    await expect(stage(page, 'seal')).toContainText('Completado')
    await page.getByRole('button', { name: 'Registrar evidencia' }).click()
    await expect(stage(page, 'evidence')).toContainText('coincide')
    await expect(page.getByText(/Informe guardado · SHA-256/)).toBeVisible()

    await page.getByRole('button', { name: 'Programar seguimiento diario' }).click()
    await expect(stage(page, 'followup')).toContainText('Planificado')
    await expect(stage(page, 'followup')).not.toContainText('Completado')
    await expect(stage(page, 'followup')).toContainText('no ejecutado') // scheduled, not run
    await expect(stage(page, 'followup')).toContainText('todavía no se ha ejecutado')
    await page.getByRole('button', { name: 'Preparar registro NEAR' }).click()
    await expect(stage(page, 'near')).toContainText('Configuración pendiente')
    await expect(stage(page, 'near')).toContainText('no ejecutado')
    await expect(stage(page, 'near')).toContainText('No se firmó ni se envió')
    expect((await adminApi('GET', '/near/submissions')).json.data).toEqual([])
    expect((await adminApi('GET', '/near/intents')).json.data).toEqual([])

    // CHRONOS shows the follow-up task that the flow created.
    await goto(page, '/chronos')
    await expect(page.getByText(/Seguimiento de auditoría/).first()).toBeVisible()
    expect(w.problems).toEqual([])
  })

  test('rejection blocks the protected steps: no report, no evidence, no follow-up', async ({ page }) => {
    accept(page, 'No procede: monto fuera de política')
    await login(page); await newMission(page, `E2E rechazar ${Date.now()}`)
    await page.getByRole('button', { name: 'Rechazar' }).click()
    await expect(stage(page, 'cerberus')).toContainText('Bloqueado', { timeout: 20_000 })
    for (const id of ['report', 'seal', 'evidence', 'followup', 'near']) await expect(stage(page, id)).toContainText('no ejecutado')
    await expect(page.getByRole('button', { name: 'Registrar evidencia' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Programar seguimiento diario' })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Preparar registro NEAR' })).toBeDisabled()
  })
})

test.describe('NEAR, CERBERUS and CHRONOS pages', () => {
  test('NEAR page explains the blockers and offers no way to sign or send', async ({ page }) => {
    const w = watch(page)
    await login(page); await goto(page, '/near')
    await expect(page.getByText('No hay cuenta firmante configurada en el servidor.')).toBeVisible()
    await expect(page.getByText('No hay contrato de auditoría configurado')).toBeVisible()
    await expect(page.getByRole('button', { name: /Firmar y enviar/ })).toHaveCount(0)
    await expect(page.getByText('PREPARAR OPERACIÓN')).toHaveCount(0)
    expect(w.problems).toEqual([])
  })

  test('CERBERUS and CHRONOS pages load real data without errors', async ({ page }) => {
    const w = watch(page)
    await login(page)
    await goto(page, '/cerberus'); await expect(page.locator('#root')).toContainText(/CERBERUS/i)
    await goto(page, '/chronos'); await expect(page.locator('#root')).toContainText(/CHRONOS/i)
    expect(w.problems).toEqual([])
  })
})
