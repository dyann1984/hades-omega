import { useState } from 'react'
import { apiPath, setSessionToken } from '../lib/api.js'
import { clearPrivateState } from '../store/index.js'

function EyeIcon({ open }: { open: boolean }): JSX.Element {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

export default function LoginPanel({ onLogin }: { onLogin: (role: string, expiresAt: number) => void }): JSX.Element {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [slowWarning, setSlowWarning] = useState(false)

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    setBusy(true)
    setError('')
    setSlowWarning(false)
    // Warn the user if Render Free cold-start is causing a delay (>5 s)
    const slowTimer = setTimeout(() => setSlowWarning(true), 5000)
    try {
      const response = await fetch(apiPath('/api/v1/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      if (!response.ok) {
        const code = response.status
        if (code === 429) throw new Error('Demasiados intentos. Espere 1 minuto e inténtelo de nuevo. [HTTP 429]')
        if (code === 503) throw new Error('El servidor no está disponible. Espere unos segundos y reintente. [HTTP 503]')
        throw new Error(`Credenciales inválidas. [HTTP ${code}]`)
      }
      const body = await response.json()
      clearPrivateState()
      setSessionToken(body.data.token, body.data.expiresAt)
      setPassword('')
      onLogin(body.data.role, body.data.expiresAt)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Sin conexión con el servidor. Reintente en 30 segundos.')
    } finally {
      clearTimeout(slowTimer)
      setSlowWarning(false)
      setBusy(false)
    }
  }

  return (
    <main className="login-shell">
      <form onSubmit={submit} className="login-card">
        <img className="login-logo" src="/hades-logo.png" alt="HADES — Agent Orchestration System" />
        <p className="login-intro">Centro de inteligencia y operaciones</p>
        <div className="login-divider" />
        <h2>Bienvenido</h2>
        <p className="login-copy">Accede al centro de comando</p>
        <label>
          Usuario
          <input
            autoComplete="username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
          />
        </label>
        <label>
          Contraseña
          <div className="login-pw-wrap">
            <input
              type={showPw ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              className="login-eye-btn"
              onClick={() => setShowPw(v => !v)}
              aria-label={showPw ? 'Ocultar contraseña' : 'Mostrar contraseña'}
            >
              <EyeIcon open={showPw} />
            </button>
          </div>
        </label>
        {slowWarning && !error && (
          <p role="status" className="login-error" style={{color:'#f0a500'}}>
            El servicio puede tardar hasta 50 s en despertar del modo inactivo. Por favor espere…
          </p>
        )}
        {error && <p role="alert" className="login-error">{error}</p>}
        <button type="submit" className="login-submit" disabled={busy}>
          {busy ? 'Ingresando…' : 'Ingresar al sistema'}
          <span aria-hidden="true">→</span>
        </button>
        <p className="login-foot">HADES · ACCESO SEGURO</p>
      </form>
    </main>
  )
}
