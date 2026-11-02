import { readFileSync } from 'node:fs'
import { expect, type Page } from '@playwright/test'
import { STATE_FILE } from './global-setup'

export interface E2EState { base: string; username: string; password: string; jwt: string; token: string; expiresAt: number }
export const state = (): E2EState => JSON.parse(readFileSync(STATE_FILE, 'utf8'))

/** Collects problems a user would hit: uncaught errors, console errors and failed same-origin API calls. */
export function watch(page: Page): { problems: string[]; bodies: string[] } {
  const problems: string[] = [], bodies: string[] = []
  page.on('pageerror', e => problems.push(`pageerror: ${e.message}`))
  page.on('console', m => { if (m.type() === 'error' && !/favicon|Failed to load resource.*(401|403|404)/.test(m.text())) problems.push(`console: ${m.text()}`) })
  page.on('response', async r => {
    if (!r.url().includes('/api/')) return
    try { bodies.push(await r.text()) } catch { /* redirects / aborted */ }
    if (r.status() >= 500) problems.push(`HTTP ${r.status()} ${r.url()}`)
  })
  return { problems, bodies }
}

/** Client-side navigation (no reload), like a user clicking the menu. */
export async function goto(page: Page, route: string): Promise<void> {
  await page.evaluate(r => { history.pushState({}, '', r); window.dispatchEvent(new PopStateEvent('popstate')) }, route)
}

/** Starts an authenticated session (pre-issued token, as if restored from the browser session). */
export async function login(page: Page): Promise<void> {
  const s = state()
  await page.addInitScript(([t, e]) => { try { sessionStorage.setItem('hades-session', JSON.stringify({ token: t, expiresAt: e })) } catch { /* ignore */ } }, [s.token, s.expiresAt] as const)
  await page.goto('/')
  await expect(page.locator('input[autocomplete=\"current-password\"]')).toHaveCount(0, { timeout: 20_000 })
}

/** Real form login (rate-limited route: use sparingly). */
export async function loginWithForm(page: Page): Promise<void> {
  const s = state()
  await page.goto('/')
  await page.locator('input[autocomplete="username"]').fill(s.username)
  await page.locator('input[autocomplete="current-password"]').fill(s.password)
  await page.locator('button.login-submit').click()
  await expect(page.locator('input[autocomplete="current-password"]')).toHaveCount(0, { timeout: 20_000 })
}

/** Direct API helper for seeding scenarios (as the admin created in global setup). */
export async function adminApi(method: 'GET' | 'POST', path: string, body?: unknown, headers: Record<string, string> = {}): Promise<{ status: number; json: any }> {
  const s = state()
  const res = await fetch(`${s.base}/api/v1${path}`, { method, headers: { authorization: `Bearer ${s.token}`, ...(body ? { 'content-type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined })
  return { status: res.status, json: await res.json().catch(() => ({})) }
}
