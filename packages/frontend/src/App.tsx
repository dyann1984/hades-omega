import { useState, useEffect, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar.js'
import Dashboard from './pages/Dashboard.js'
import CerberusPanel from './pages/CerberusPanel.js'
import ObservatoryPanel from './pages/ObservatoryPanel.js'
import ThronePanel from './pages/ThronePanel.js'
import JudgmentPanel from './pages/JudgmentPanel.js'
import ArchivesPanel from './pages/ArchivesPanel.js'
import PantheonPanel from './pages/PantheonPanel.js'
import DominionPanel from './pages/DominionPanel.js'
import VaultPanel from './pages/VaultPanel.js'
import OraclePanel from './pages/OraclePanel.js'
import ChronosPanel from './pages/ChronosPanel.js'
import DocumentsPanel from './pages/DocumentsPanel.js'
import CommandCenter from './pages/CommandCenter.js'
import NotificationToast from './components/NotificationToast.js'
import { useWebSocket } from './hooks/useWebSocket.js'
import { useApiStatus } from './hooks/useApiStatus.js'
import { useHadesStore, clearPrivateState } from './store/index.js'
import { apiHeaders, apiPath, setSessionToken, getStoredSession } from './lib/api.js'
import LoginPanel from './components/LoginPanel.js'

// Visual preview labs — dev only, do NOT affect dashboard
const NeuralLabPage   = lazy(() => import('./pages/NeuralLabPage.js'))
const SovereignLab    = lazy(() => import('./pages/SovereignLab.js'))
const HadesCoreLab    = lazy(() => import('./pages/HadesCoreLab.js'))
const PremiumCoreLab  = lazy(() => import('./pages/PremiumCoreLab.js'))

function AppShell({ onLogout }: { onLogout: () => void }): JSX.Element {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  useWebSocket()
  useApiStatus()

  useEffect(() => {
    const saved = localStorage.getItem('hades-theme') as 'dark' | 'light' | null
    if (saved) useHadesStore.getState().setTheme(saved)
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-obsidian">
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(c => !c)} />

      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-obsidian-700 flex-shrink-0">
          <h1 className="font-display font-semibold text-sm text-gray-300">
            HADES — Centro de Comando IA
          </h1>
          <div className="ml-auto flex items-center gap-2">
            <span className="badge-demo">NEAR: consultar estado</span>
            <button onClick={onLogout} className="text-xs text-gray-300 border border-white/20 rounded px-2 py-1">Cerrar sesión</button>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 sm:p-6 animate-fade-in">
          <Routes>
            <Route path="/"            element={<Dashboard />} />
            <Route path="/throne"      element={<ThronePanel />} />
            <Route path="/pantheon"    element={<PantheonPanel />} />
            <Route path="/dominion"    element={<DominionPanel />} />
            <Route path="/chronos"     element={<ChronosPanel />} />
            <Route path="/oracle"      element={<OraclePanel />} />
            <Route path="/vault"       element={<VaultPanel />} />
            <Route path="/judgment"    element={<JudgmentPanel />} />
            <Route path="/archives"    element={<ArchivesPanel />} />
            <Route path="/cerberus"    element={<CerberusPanel />} />
            <Route path="/observatory" element={<ObservatoryPanel />} />
            <Route path="/documents"   element={<DocumentsPanel />} />
            <Route path="/command"     element={<CommandCenter />} />
          </Routes>
        </div>
      </main>

      <NotificationToast />
    </div>
  )
}

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
  async function logout(): Promise<void> {
    try {
      const response = await fetch(apiPath('/api/v1/auth/logout'), { method:'POST', headers:apiHeaders() })
      if (!response.ok) throw new Error('No se pudo revocar la sesión. Compruebe la conexión y vuelva a intentarlo.')
      setSessionToken(undefined, undefined); clearPrivateState(); setRole(null); setExpiresAt(null); setLogoutError('')
    } catch (error) { setLogoutError(error instanceof Error ? error.message : 'Error de conexión') }
  }
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
        <Route path="/*" element={<><AppShell onLogout={() => void logout()} />{logoutError && <div role="alert">{logoutError}</div>}</>} />
      </Routes>
    </BrowserRouter>
  )
}
