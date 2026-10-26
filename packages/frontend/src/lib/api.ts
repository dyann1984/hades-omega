// Local development uses Vite's same-origin proxy. A token is generated only
// by INICIAR_HADES.cmd and remains in gitignored .env.local.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const devToken = (import.meta as any).env?.VITE_DEV_TOKEN as string | undefined

export function apiPath(path: string): string { return path }

export function apiHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { ...extra, ...(devToken ? { Authorization: `Bearer ${devToken}` } : {}) }
}
