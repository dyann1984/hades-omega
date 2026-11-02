import { expect, test } from '@playwright/test'
import { goto, login, loginWithForm, watch } from './helpers'

const ROUTES = ['/', '/throne', '/pantheon', '/dominion', '/chronos', '/oracle', '/vault', '/judgment', '/archives', '/cerberus', '/observatory', '/documents', '/command', '/audit', '/near']

test('login rejects wrong credentials and keeps the form', async ({ page }) => {
  await page.goto('/')
  await page.locator('input[autocomplete="username"]').fill('nobody-here')
  await page.locator('input[autocomplete="current-password"]').fill('definitely-wrong-password')
  await page.locator('button.login-submit').click()
  await expect(page.getByRole('alert')).toBeVisible()
  await expect(page.locator('input[autocomplete="current-password"]')).toBeVisible()
})

test('the real login form signs in with the correct password', async ({ page }) => {
  await loginWithForm(page)
  await expect(page.locator('#root')).not.toBeEmpty()
})

test('every section renders after login without script errors or horizontal overflow', async ({ page }) => {
  const w = watch(page)
  await login(page)
  for (const route of ROUTES) {
    await goto(page, route)
    await page.waitForLoadState('networkidle')
    await expect(page.locator('#root')).not.toBeEmpty()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow, `${route} horizontal overflow`).toBeLessThanOrEqual(1)
  }
  expect(w.problems).toEqual([])
})
