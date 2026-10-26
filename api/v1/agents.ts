// Vercel serverless function — agent status (returns static initial state)
export const config = { maxDuration: 10 }

const AGENT_NAMES = ['HADES', 'CHARON', 'PERSEPHONE', 'MINOS', 'ELYSIUM', 'TARTARUS'] as const

export default function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.status(200).end(); return }

  const agents = AGENT_NAMES.map(name => ({
    id:     `agent:${name}:001`,
    name,
    status: 'IDLE' as const,
  }))

  return res.status(200).json({ success: true, data: agents, meta: { timestamp: Date.now(), version: '0.3.0' } })
}
