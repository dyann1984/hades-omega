import { useState } from 'react'
import { apiPath, setSessionToken } from '../lib/api.js'
import { clearPrivateState } from '../store/index.js'

export default function LoginPanel({ onLogin }: { onLogin: (role:string, expiresAt:number) => void }): JSX.Element {
  const [username,setUsername]=useState(''), [password,setPassword]=useState(''), [error,setError]=useState(''), [busy,setBusy]=useState(false)
  async function submit(event: React.FormEvent): Promise<void> {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const response=await fetch(apiPath('/api/v1/auth/login'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})})
      if(!response.ok) throw new Error(response.status===429 ? 'Demasiados intentos. Inténtelo más tarde.' : 'Credenciales inválidas o servicio no disponible.')
      const body=await response.json(); clearPrivateState(); setSessionToken(body.data.token, body.data.expiresAt); setPassword(''); onLogin(body.data.role,body.data.expiresAt)
    } catch (cause) {setError(cause instanceof Error ? cause.message : 'Error de conexión')} finally {setBusy(false)}
  }
  return <main className="login-shell"><form onSubmit={submit} className="login-card"><img className="login-logo" src="/hades-logo.png" alt="HADES — Agent Orchestration System" /><p className="login-intro">Centro de inteligencia y operaciones</p><div className="login-divider" /><h2>Bienvenido</h2><p className="login-copy">Accede al centro de comando</p><label>Usuario<input autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} required /></label><label>Contraseña<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required /></label>{error && <p role="alert" className="text-red-400 text-sm">{error}</p>}<button disabled={busy}>{busy ? 'Ingresando…' : 'Ingresar al sistema'} <span aria-hidden="true">→</span></button><p className="login-foot">HADES · ACCESO SEGURO</p></form></main>
}
