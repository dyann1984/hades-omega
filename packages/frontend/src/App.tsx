import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar.js'
import Dashboard from './pages/Dashboard.js'
import CerberusPanel from './pages/CerberusPanel.js'
import ObservatoryPanel from './pages/ObservatoryPanel.js'
import NotificationToast from './components/NotificationToast.js'
import { useWebSocket } from './hooks/useWebSocket.js'
import { useApiStatus } from './hooks/useApiStatus.js'
import { useHadesStore } from './store/index.js'

function AppShell(): JSX.Element {
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
            HADES OMEGA — Centro de Comando IA
          </h1>
          <div className="ml-auto flex items-center gap-2">
            <span className="badge-demo">NEAR TESTNET</span>
            <span className="badge-demo">MODO DEMO</span>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4 sm:p-6 animate-fade-in">
          <Routes>
            <Route path="/"            element={<Dashboard />} />
            <Route path="/cerberus"    element={<CerberusPanel />} />
            <Route path="/observatory" element={<ObservatoryPanel />} />
          </Routes>
        </div>
      </main>

      <NotificationToast />
    </div>
  )
}

export default function App(): JSX.Element {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  )
}
