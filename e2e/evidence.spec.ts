import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'
import { goto, login } from './helpers'

// Screenshots of the real production build for the demo/evidence pack. Off by default:  E2E_SCREENSHOTS=1 npx playwright test evidence
const OUT = join(__dirname, '..', 'docs', 'evidence-ui')
test.skip(process.env.E2E_SCREENSHOTS !== '1', 'set E2E_SCREENSHOTS=1 to capture evidence screenshots')

test('capture evidence screenshots', async ({ page }, info) => {
  mkdirSync(OUT, { recursive: true })
  const shot = async (name: string): Promise<void> => { await page.waitForLoadState('networkidle'); await page.screenshot({ path: join(OUT, `${info.project.name}-${name}.png`), fullPage: true }) }
  page.on('dialog', d => { void d.accept(d.type() === 'prompt' ? 'Revisado para la demostración' : undefined) })
  await login(page)
  await goto(page, '/vault'); await expect(page.getByText('Configuración pendiente').first()).toBeVisible(); await shot('vault-connections')
  await page.getByRole('button', { name: 'POLÍTICAS' }).click(); await expect(page.getByText(/R-001/).first()).toBeVisible(); await shot('vault-policies')
  await page.getByRole('button', { name: 'ENTORNO' }).click(); await expect(page.getByText('configurado · oculto').first()).toBeVisible(); await shot('vault-environment-masked')
  await goto(page, '/audit')
  await page.getByLabel('Título').fill('Auditoría de proveedor — demostración')
  await page.getByRole('button', { name: 'Crear misión y ejecutar agentes' }).click()
  await expect(page.locator('[data-stage="cerberus"]')).toContainText('Espera aprobación'); await shot('audit-waiting-approval')
  await page.getByRole('button', { name: 'Aprobar (ADMIN)' }).click(); await expect(page.locator('[data-stage="seal"]')).toContainText('Completado', { timeout: 20_000 })
  await page.getByRole('button', { name: 'Registrar evidencia' }).click(); await expect(page.locator('[data-stage="evidence"]')).toContainText('coincide')
  await page.getByRole('button', { name: 'Programar seguimiento diario' }).click(); await expect(page.locator('[data-stage="followup"]')).toContainText('todavía no se ha ejecutado')
  await page.getByRole('button', { name: 'Preparar registro NEAR' }).click(); await expect(page.locator('[data-stage="near"]')).toContainText('No se firmó ni se envió'); await shot('audit-completed-near-pending')
  await goto(page, '/near'); await expect(page.getByText('No hay cuenta firmante')).toBeVisible(); await shot('near-config-pending')
  await goto(page, '/chronos'); await expect(page.getByText(/Seguimiento de auditoría/).first()).toBeVisible(); await shot('chronos-followup')
})
