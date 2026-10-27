let sessionToken: string | undefined
export function setSessionToken(token: string | undefined): void { sessionToken = token }
export function websocketToken(): string | undefined { return sessionToken }
export function apiPath(path: string): string { return path }
export function apiHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { ...extra, ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}) }
}
