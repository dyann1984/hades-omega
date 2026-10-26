import { setSafeCors, unauthorized, verifyServerlessRole } from '../_security.js'

// Vercel serverless function — read-only Preview status.
export const config = { maxDuration: 10 }

const AGENT_NAMES = ['HADES', 'CHARON', 'PERSEPHONE', 'MINOS', 'CERBERUS', 'ELYSIUM', 'TARTARUS'] as const

export default function handler(req: any, res: any) {
  setSafeCors(req, res)

  if (req.method === 'OPTIONS') { res.status(200).end(); return }
  if (!verifyServerlessRole(req, ['ADMIN', 'OPERATOR', 'AUDITOR', 'VIEWER'])) { unauthorized(res); return }

  const agents = AGENT_NAMES.map(name => ({
    id:     `agent:${name}:001`,
    name,
    status: 'IDLE' as const,
  }))

  return res.status(200).json({ success: true, data: agents, meta: { timestamp: Date.now(), version: '0.3.0' } })
}
