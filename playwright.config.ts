import { defineConfig } from '@playwright/test'

// Runs against the PRODUCTION builds: packages/api/dist (real process, throwaway SQLite) and `vite preview` of
// packages/frontend/dist. Uses the Microsoft Edge already installed on the machine, so no browser is downloaded.
//   npm run build && npm run test:e2e
const API_PORT = process.env.E2E_API_PORT ?? '3921'
export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['json', { outputFile: 'e2e/results.json' }]],
  use: { baseURL: 'http://127.0.0.1:4173', channel: 'msedge', locale: 'es-MX', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  outputDir: 'e2e/artifacts',
  webServer: {
    command: 'npm run preview -w @hades/frontend -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173', reuseExistingServer: false, timeout: 60_000,
    env: { HADES_PROXY_TARGET: `http://127.0.0.1:${API_PORT}` },
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1366, height: 800 } } },
    { name: 'mobile', use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
})
