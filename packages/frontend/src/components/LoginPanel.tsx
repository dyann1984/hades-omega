import { useState } from 'react'
import { apiPath, setSessionToken } from '../lib/api.js'
import { clearPrivateState } from '../store/index.js'
import { useT, useLang, setLang } from '../lib/i18n.js'

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

export function LanguageSwitch(): JSX.Element {
  const lang = useLang()
  const t = useT()
  return (
    <div className="lang-switch" role="group" aria-label={t('lang.label')}>
      <button type="button" className={lang === 'es' ? 'active' : ''} aria-pressed={lang === 'es'} onClick={() => setLang('es')}>ES</button>
      <button type="button" className={lang === 'en' ? 'active' : ''} aria-pressed={lang === 'en'} onClick={() => setLang('en')}>EN</button>
    </div>
  )
}

export default function LoginPanel({ onLogin }: { onLogin: (role: string, expiresAt: number) => void }): JSX.Element {
  const t = useT()
  const lang = useLang()
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
        if (code === 429) throw new Error(`${t('login.locked')} [HTTP 429]`)
        if (code === 503) throw new Error(`${t('login.down')} [HTTP 503]`)
        throw new Error(`${t('login.bad')} [HTTP ${code}]`)
      }
      const body = await response.json()
      clearPrivateState()
      setSessionToken(body.data.token, body.data.expiresAt)
      setPassword('')
      onLogin(body.data.role, body.data.expiresAt)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('login.offline'))
    } finally {
      clearTimeout(slowTimer)
      setSlowWarning(false)
      setBusy(false)
    }
  }

  // "Explore Demo": no credentials. The server issues a temporary, isolated DEMO session.
  async function startDemo(): Promise<void> {
    setBusy(true)
    setError('')
    const slowTimer = setTimeout(() => setSlowWarning(true), 5000)
    try {
      const response = await fetch(apiPath('/api/v1/demo/session'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang }),
      })
      if (response.status === 503) throw new Error(t('demo.capacity'))
      if (!response.ok) throw new Error(`${t('demo.error')} [HTTP ${response.status}]`)
      const body = await response.json()
      clearPrivateState()
      setSessionToken(body.data.token, body.data.expiresAt)
      try { window.history.replaceState(null, '', '/demo') } catch { /* ignore */ }
      onLogin(body.data.role, body.data.expiresAt)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t('demo.error'))
    } finally {
      clearTimeout(slowTimer)
      setSlowWarning(false)
      setBusy(false)
    }
  }

  return (
    <main className="login-shell">
      <form onSubmit={submit} className="login-card">
        <LanguageSwitch />
        <img className="login-logo" src="/hades-logo.png" alt="HADES — Agent Orchestration System" />
        <p className="login-intro">{t('login.intro')}</p>
        <div className="login-divider" />
        <h2>{t('login.welcome')}</h2>
        <p className="login-copy">{t('login.sub')}</p>
        <label>
          {t('login.user')}
          <input
            autoComplete="username"
            value={username}
            onChange={e => setUsername(e.target.value)}
            required
          />
        </label>
        <label>
          {t('login.password')}
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
              aria-label={showPw ? t('login.hide') : t('login.show')}
            >
              <EyeIcon open={showPw} />
            </button>
          </div>
        </label>
        {slowWarning && !error && (
          <p role="status" className="login-error" style={{color:'#f0a500'}}>{t('login.slow')}</p>
        )}
        {error && <p role="alert" className="login-error">{error}</p>}
        <button type="submit" className="login-submit" disabled={busy}>
          {busy ? t('login.busy') : t('login.submit')}
          <span aria-hidden="true">→</span>
        </button>
        <div className="login-demo">
          <span className="login-demo-or">{t('demo.or')}</span>
          <button type="button" className="login-demo-btn" onClick={() => void startDemo()} disabled={busy}>
            {t('demo.button')}
          </button>
          <p className="login-demo-sub">{t('demo.subtitle')}</p>
        </div>
        <p className="login-foot">{t('login.foot')}</p>
      </form>
    </main>
  )
}
