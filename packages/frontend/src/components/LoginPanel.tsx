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
      const body=await response.json(); clearPrivateState(); setSessionToken(body.data.token); setPassword(''); onLogin(body.data.role,body.data.expiresAt)
    } catch (cause) {setError(cause instanceof Error ? cause.message : 'Error de conexión')} finally {setBusy(false)}
  }
  return <main className="min-h-screen bg-obsidian flex items-center justify-center p-6"><form onSubmit={submit} className="panel p-6 flex flex-col gap-4 w-full max-w-sm"><h1 className="text-gold text-xl">HADES OMEGA</h1><p className="text-gray-400 text-sm">Inicio de sesión</p><label className="text-gray-300 text-sm">Usuario<input autoComplete="username" className="w-full bg-black/40 border border-white/20 rounded p-2 mt-1" value={username} onChange={e=>setUsername(e.target.value)} required /></label><label className="text-gray-300 text-sm">Contraseña<input type="password" autoComplete="current-password" className="w-full bg-black/40 border border-white/20 rounded p-2 mt-1" value={password} onChange={e=>setPassword(e.target.value)} required /></label>{error && <p role="alert" className="text-red-400 text-sm">{error}</p>}<button disabled={busy} className="border border-gold/40 rounded p-2">Ingresar</button></form></main>
}
