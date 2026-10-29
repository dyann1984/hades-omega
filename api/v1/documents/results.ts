import { setSafeCors, unauthorized, verifyServerlessRole, previewWriteDisabled } from '../../_security.js'

export const config = { maxDuration: 10 }

export default function handler(req: any, res: any) {
  setSafeCors(req, res)
  if (req.method === 'OPTIONS') { res.status(200).end(); return }
  if (!verifyServerlessRole(req, ['ADMIN', 'OPERATOR', 'AUDITOR', 'VIEWER'])) { unauthorized(res); return }
  if (req.method === 'GET') {
    return res.status(200).json({ success: true, data: [], meta: { timestamp: Date.now(), version: '0.3.0', mode: 'preview-read-only' } })
  }
  previewWriteDisabled(res)
}
