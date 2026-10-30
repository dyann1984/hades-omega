import { useEffect, useRef, useState } from 'react'
import { useT } from '../lib/i18n.js'

interface Request { title: string; defaultValue: string; resolve: (value: string | null) => void }
let setRequest: ((r: Request | null) => void) | null = null

/** Opens the in-app justification dialog. Resolves with the trimmed text, or null when cancelled. */
export function askJustification(title: string, defaultValue = ''): Promise<string | null> {
  return new Promise(resolve => {
    if (!setRequest) { resolve(null); return }
    setRequest({ title, defaultValue, resolve })
  })
}

/** Mount once near the app root. Replaces window.prompt (blocked in many browsers/automation) with an accessible dialog. */
export default function JustificationHost(): JSX.Element | null {
  const t = useT()
  const [request, setLocal] = useState<Request | null>(null)
  const [value, setValue] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { setRequest = setLocal; return () => { setRequest = null } }, [])
  useEffect(() => { if (request) { setValue(request.defaultValue); setTimeout(() => ref.current?.focus(), 0) } }, [request])

  if (!request) return null
  const trimmed = value.trim()
  const valid = trimmed.length >= 3 && trimmed.length <= 500
  const close = (result: string | null) => { request.resolve(result); setLocal(null) }

  return (
    <div className="dlg-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) close(null) }}>
      <form
        className="dlg" role="dialog" aria-modal="true" aria-labelledby="dlg-title" data-testid="justification-dialog"
        onSubmit={e => { e.preventDefault(); if (valid) close(trimmed) }}
        onKeyDown={e => { if (e.key === 'Escape') close(null) }}
      >
        <h3 id="dlg-title">{request.title}</h3>
        <textarea ref={ref} value={value} onChange={e => setValue(e.target.value)} maxLength={500} rows={4} aria-label={t('dlg.label')} data-testid="justification-input" />
        <p className="dlg-hint">{t('dlg.hint')} ({trimmed.length}/500)</p>
        <div className="dlg-actions">
          <button type="button" className="ghost" onClick={() => close(null)} data-testid="justification-cancel">{t('dlg.cancel')}</button>
          <button type="submit" className="primary" disabled={!valid} data-testid="justification-confirm">{t('dlg.confirm')}</button>
        </div>
      </form>
    </div>
  )
}