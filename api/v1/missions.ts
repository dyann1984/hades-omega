// Vercel serverless function — HADES missions
// Each invocation creates fresh agent instances (stateless)
import {
  CerberusGUARD, CerberusAUDIT, NEARBridge,
  HadesOrchestrator, CharonAgent, PersephoneAgent,
  MinosAgent, ElysiumAgent, TartarusAgent,
} from '@hades/core'

export const config = { maxDuration: 30 }

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.status(200).end(); return }

  if (req.method === 'GET') {
    return res.status(200).json({ success: true, data: [], meta: { timestamp: Date.now(), version: '0.3.0' } })
  }

  if (req.method === 'POST') {
    const body = req.body ?? {}
    const { title, description, budgetLimit = 50000 } = body

    if (!title || !description) {
      return res.status(400).json({
        success: false,
        error:   { code: 'VALIDATION_ERROR', message: 'title y description son requeridos' },
      })
    }

    const guard      = new CerberusGUARD()
    const audit      = new CerberusAUDIT()
    const near       = new NEARBridge()
    const deps       = { guard, audit, near }

    const hades      = new HadesOrchestrator(deps)
    const charon     = new CharonAgent(deps)
    const persephone = new PersephoneAgent(deps)
    const minos      = new MinosAgent(deps)
    const elysium    = new ElysiumAgent(deps)
    const tartarus   = new TartarusAgent(deps)

    hades.registerSubAgents({ CHARON: charon, PERSEPHONE: persephone, MINOS: minos, ELYSIUM: elysium, TARTARUS: tartarus })

    try {
      const mission      = await hades.createMission(title, description, Number(budgetLimit) || 50000)
      const auditRecords = audit.query({})
      const nearTxs      = near.getAllTransactions()

      return res.status(200).json({
        success:      true,
        data:         mission,
        auditRecords,
        nearTxs,
        meta:         { requestId: Math.random().toString(36).slice(2), timestamp: Date.now(), version: '0.3.0' },
      })
    } catch (err: any) {
      console.error('[HADES] Mission error:', err)
      return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } })
    }
  }

  return res.status(405).end()
}
