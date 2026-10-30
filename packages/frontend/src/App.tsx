import { useState, useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { clearPrivateState } from './store/index.js'
import { apiHeaders, apiPath, setSessionToken, getStoredSession } from './lib/api.js'
import LoginPanel from './components/LoginPanel.js'

// The whole signed-in app (pages, sidebar, websocket) is a separate chunk; the login screen preloads it when idle.
const AppShell = lazy(() => import('./AppShell.js'))

// Visual preview labs — dev only, do NOT affect dashboard
const NeuralLabPage   = lazy(() => import('./pages/NeuralLabPage.js'))
const SovereignLab    = lazy(() => import('./pages/SovereignLab.js'))
const HadesCoreLab    = lazy(() => import('./pages/HadesCoreLab.js'))
const PremiumCoreLab  = lazy(() => import('./pages/PremiumCoreLab.js'))

export default function App(): JSX.Element {
  // Restore session from sessionStorage on mount (survives page refresh, cleared on tab close)
  const stored = getStoredSession()
  const [role, setRole] = useState<string | null>(() => {
    if (!stored) return null
    // We don't know the role from storage; defer to a /me check or optimistically trust storage.
    // Decode role from JWT payload (base64url, no verify needed — server still validates on API calls).
    try {
      const payload = JSON.parse(atob(stored.token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')))
      return (payload.roles?.[0] as string) ?? null
    } catch { return null }
  })
  const [logoutError, setLogoutError] = useState('')
  const [expiresAt, setExpiresAt] = useState<number | null>(() => stored?.expiresAt ?? null)
  useEffect(() => {
    if (!expiresAt) return
    const remaining = expiresAt - Date.now()
    if (remaining <= 0) { setSessionToken(undefined); clearPrivateState(); setRole(null); setExpiresAt(null); return }
    const timer = setTimeout(() => { setSessionToken(undefined); clearPrivateState(); setRole(null); setExpiresAt(null) }, remaining)
    return () => clearTimeout(timer)
  }, [expiresAt])
  async function logout(force = false): Promise<void> {
    if (!force) {
      try {
        await fetch(apiPath('/api/v1/auth/logout'), { method:'POST', headers:apiHeaders() })
      } catch { /* ignore network errors on logout */ }
    }
    setSessionToken(undefined, undefined); clearPrivateState(); setRole(null); setExpiresAt(null); setLogoutError('')
    try { window.history.replaceState(null, '', '/') } catch { /* ignore */ }
  }

  // Clear stale session automatically if the server rejects our token
  useEffect(() => {
    if (!role) return
    fetch(apiPath('/api/v1/agents'), { headers: apiHeaders() })
      .then(r => { if (r.status === 401) logout(true) })
      .catch(() => {})
  }, [role]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!role) return <LoginPanel onLogin={(nextRole, expiry) => { setExpiresAt(expiry); setRole(nextRole) }} />
  return (
    <BrowserRouter>
      <Routes>
        {/* Visual labs — full-screen, no sidebar */}
        <Route path="/lab" element={
          <Suspense fallback={<div style={{ background: '#000408', height: '100vh' }} />}>
            <NeuralLabPage />
          </Suspense>
        } />
        <Route path="/lab/sovereign" element={
          <Suspense fallback={<div style={{ background: '#05080F', height: '100vh' }} />}>
            <SovereignLab />
          </Suspense>
        } />
        <Route path="/lab/hades-core" element={
          <Suspense fallback={<div style={{ background: '#03050C', height: '100vh' }} />}>
            <HadesCoreLab />
          </Suspense>
        } />
        <Route path="/lab/premium-core" element={
          <Suspense fallback={<div style={{ background: '#03050C', height: '100vh' }} />}>
            <PremiumCoreLab />
          </Suspense>
        } />
        {/* Main app shell */}
        <Route path="/*" element={<><Suspense fallback={<div style={{ background: '#040810', height: '100vh' }} />}><AppShell onLogout={() => void logout()} /></Suspense>{logoutError && <div role="alert">{logoutError}</div>}</>} />
      </Routes>
    </BrowserRouter>
  )
}
