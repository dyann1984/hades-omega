import { useState, useEffect } from 'react'
import { Routes, Route } from 'react-router-dom'
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
import NearPanel from './pages/NearPanel.js'
import DocumentsPanel from './pages/DocumentsPanel.js'
import CommandCenter from './pages/CommandCenter.js'
import NotificationToast from './components/NotificationToast.js'
import { useWebSocket } from './hooks/useWebSocket.js'
import { useApiStatus } from './hooks/useApiStatus.js'
import { useHadesStore } from './store/index.js'
import DemoTour from './pages/DemoTour.js'
import AccountPanel from './pages/AccountPanel.js'
import JustificationHost from './components/JustificationDialog.js'
import HadesGuide from './components/HadesGuide.js'
import { startDomTranslation } from './lib/domTranslate.js'
import { isDemoToken, demoPath, apiHeaders, websocketToken } from './lib/api.js'
import { takePrefetchedSeed } from './lib/demoStart.js'
import { useT, useLang } from './lib/i18n.js'
import { LanguageSwitch } from './components/LoginPanel.js'

export default function AppShell({ onLogout }: { onLogout: () => void }): JSX.Element {
  const t = useT()
  const demo = isDemoToken()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  useWebSocket()
  useApiStatus()
  const lang = useLang()
  useEffect(() => startDomTranslation(), [])
  // DEMO: load illustrative sample data (real CERBERUS decisions on fictional operations) into the in-memory store.
  // The seed is normally already in flight (prefetched while this chunk loaded); otherwise it is fetched here.
  useEffect(() => {
    if (!demo) return
    let cancelled = false
    const pending = takePrefetchedSeed(websocketToken(), lang)
      ?? fetch(demoPath('/seed?lang=' + lang), { headers: apiHeaders() }).then(r => r.ok ? r.json() : null).catch(() => null)
    Promise.resolve(pending).then(body => {
      const data = (body as { data?: { missions: never; auditRecords: never; escalations: never; nearTxs: never } } | null)?.data
      if (data && !cancelled) useHadesStore.setState({ missions: data.missions, auditRecords: data.auditRecords, escalations: data.escalations, nearTxs: data.nearTxs })
    })
    return () => { cancelled = true }
  }, [demo, lang])

  useEffect(() => {
    const saved = localStorage.getItem('hades-theme') as 'dark' | 'light' | null
    if (saved) useHadesStore.getState().setTheme(saved)
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-obsidian">
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(c => !c)} />

      <main className="flex-1 flex flex-col overflow-hidden">
        {demo && (
          <div className="demo-banner" role="status" data-testid="demo-banner">
            <strong>{t('demo.banner')}</strong><span>{t('demo.bannerSub')}</span>
            <button onClick={onLogout}>{t('demo.exit')}</button>
          </div>
        )}
        {/* Top bar */}
        <header className="flex items-center gap-3 px-4 sm:px-6 py-3 border-b border-obsidian-700 flex-shrink-0">
          <h1 className="font-display font-semibold text-sm text-gray-300">{t('app.title')}</h1>
          <div className="ml-auto flex items-center gap-2">
            <span className="badge-demo">NEAR: consultar estado</span>
            <LanguageSwitch /><button onClick={onLogout} className="text-xs text-gray-300 border border-white/20 rounded px-2 py-1">{demo ? t('demo.exit') : t('app.logout')}</button>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 sm:p-6 animate-fade-in">
          <Routes>
            <Route path="/"            element={<Dashboard />} />
            <Route path="/demo"        element={<DemoTour />} />
            <Route path="/account"     element={demo ? <DemoTour /> : <AccountPanel />} />
            <Route path="/throne"      element={<ThronePanel />} />
            <Route path="/pantheon"    element={<PantheonPanel />} />
            <Route path="/dominion"    element={<DominionPanel />} />
            <Route path="/chronos"     element={<ChronosPanel />} />
            <Route path="/near"        element={<NearPanel />} />
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
      <JustificationHost />
      <HadesGuide />
    </div>
  )
}
