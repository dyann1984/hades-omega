import {
  CerberusGUARD,
  CerberusAUDIT,
  NEARBridge,
  HadesOrchestrator,
  CharonAgent,
  PersephoneAgent,
  MinosAgent,
  ElysiumAgent,
  TartarusAgent,
} from '@hades/core'
import { createClaudeAnthropicPlanner } from './planner/ClaudeAnthropicPlanner.js'

const guard  = new CerberusGUARD()
const audit  = new CerberusAUDIT()
const near   = new NEARBridge()
const deps   = { guard, audit, near }

const planner = createClaudeAnthropicPlanner()
export const hades      = new HadesOrchestrator(deps, planner)
export const charon     = new CharonAgent(deps)
export const persephone = new PersephoneAgent(deps)
export const minos      = new MinosAgent(deps)
export const elysium    = new ElysiumAgent(deps)
export const tartarus   = new TartarusAgent(deps)

hades.registerSubAgents({ CHARON: charon, PERSEPHONE: persephone, MINOS: minos, ELYSIUM: elysium, TARTARUS: tartarus })

export { guard, audit, near }
