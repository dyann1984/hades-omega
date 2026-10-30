import { useState } from 'react'
import { apiHeaders, apiPath } from '../lib/api.js'
import { useT } from '../lib/i18n.js'

const ERRORS: Record<string, string> = {
  INVALID_CREDENTIALS: 'La contraseña actual no es correcta / Current password is incorrect',
  TOO_MANY_ATTEMPTS: 'Demasiados intentos / Too many attempts',
  PASSWORD_TOO_SHORT: 'Mínimo 12 caracteres / At least 12 characters',
  PASSWORD_TOO_WEAK: 'Débil: usa una frase de varias palabras o mezcla mayúsculas, números y símbolos / Weak: use a multi-word passphrase or mix cases, digits and symbols',
  PASSWORD_TOO_COMMON: 'Contraseña demasiado común / Too common',
  PASSWORD_LOW_VARIETY: 'Poca variedad de caracteres / Low character variety',
  PASSWORD_CONTAINS_USERNAME: 'No debe contener el usuario / Must not contain the username',
  PASSWORD_UNCHANGED: 'La nueva contraseña debe ser distinta / New password must differ',
  USERNAME_TAKEN: 'Usuario no disponible / Username taken',
  INVALID_USERNAME: 'Usuario inválido / Invalid username',
}

export default function AccountPanel(): JSX.Element {
  const t = useT()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [username, setUsername] = useState('')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault()
    if (next !== again) { setMessage({ ok: false, text: t('acct.mismatch') }); return }
    setBusy(true); setMessage(null)
    try {
      const res = await fetch(apiPath('/api/v1/auth/password'), {
        method: 'POST', headers: apiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ currentPassword: current, newPassword: next, ...(username.trim() ? { newUsername: username.trim() } : {}) }),
      })
      if (res.ok) { setMessage({ ok: true, text: t('acct.ok') }); setCurrent(''); setNext(''); setAgain(''); setUsername('') }
      else { const code = (await res.json().catch(() => null))?.error?.code as string | undefined; setMessage({ ok: false, text: `${t('acct.err')}: ${(code && ERRORS[code]) ?? `HTTP ${res.status}`}` }) }
    } catch { setMessage({ ok: false, text: t('acct.err') }) }
    finally { setBusy(false) }
  }

  return (
    <div className="tour" style={{ maxWidth: 520 }}>
      <section className="tour-card">
        <h2>{t('acct.title')}</h2>
        <p style={{ margin: '8px 0 14px', color: '#9aa0ad' }}>{t('acct.hint')}</p>
        <form onSubmit={submit} className="login-card" style={{ boxShadow: 'none', padding: 0, background: 'transparent', border: 0 }}>
          <label>{t('acct.current')}<input type="password" autoComplete="current-password" value={current} onChange={e => setCurrent(e.target.value)} required /></label>
          <label>{t('acct.new')}<input type="password" autoComplete="new-password" value={next} onChange={e => setNext(e.target.value)} minLength={12} required /></label>
          <label>{t('acct.confirm')}<input type="password" autoComplete="new-password" value={again} onChange={e => setAgain(e.target.value)} required /></label>
          <label>{t('acct.username')}<input autoComplete="username" value={username} onChange={e => setUsername(e.target.value)} /></label>
          {message && <p role={message.ok ? 'status' : 'alert'} style={{ color: message.ok ? '#3ddc97' : '#ff8a8a' }}>{message.text}</p>}
          <button type="submit" className="login-submit" disabled={busy}>{t('acct.save')}</button>
        </form>
      </section>
    </div>
  )
}