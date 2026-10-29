import { createHash } from 'node:crypto'
import { defaultCapabilityRegistry, type AgentName } from '@hades/core'
import { analyzeDocuments, type TextDocument } from './document-analysis.js'

type Evidence = ReturnType<typeof analyzeDocuments>
export interface Intake { documents: TextDocument[]; evidence: Evidence }
export interface Validation { intake: Intake; checks: Array<{filename: string; nonEmpty: boolean; sourceHash: string}> }
export interface Comparison { validation: Validation; values: Array<{filename: string; amounts: number[]; percentages: number[]}> }

/** Explicit implementations only. A registry entry alone does not mean it is implemented here. */
export function dispatchCapability(agent: AgentName, capability: string, input: unknown): unknown {
  if (!defaultCapabilityRegistry.canExecute(agent, capability)) throw new Error('CAPABILITY_NOT_AVAILABLE')
  if (agent === 'CHARON' && capability === 'cap:doc:intake@1.0.0') {
    const documents = input as TextDocument[]
    if (!Array.isArray(documents) || documents.length < 2 || documents.some(d => typeof d?.content !== 'string' || typeof d.filename !== 'string')) throw new Error('INVALID_DOCUMENTS')
    return { documents, evidence: analyzeDocuments(documents) } satisfies Intake
  }
  if (agent === 'MINOS' && capability === 'cap:doc:validate@1.0.0') {
    const intake = input as Intake
    if (!intake?.documents || !intake?.evidence || intake.documents.length !== intake.evidence.length) throw new Error('INVALID_INTAKE')
    const checks = intake.documents.map((doc, index) => ({filename:doc.filename, nonEmpty:doc.content.trim().length > 0, sourceHash:intake.evidence[index]!.sha256}))
    if (checks.some(check => !check.nonEmpty)) throw new Error('EMPTY_DOCUMENT')
    return { intake, checks } satisfies Validation
  }
  if (agent === 'PERSEPHONE' && capability === 'cap:doc:compare@1.0.0') {
    const validation = input as Validation
    if (!validation?.checks || validation.checks.some(check => !check.nonEmpty)) throw new Error('INVALID_VALIDATION')
    return { validation, values: validation.intake.evidence.map(item => ({filename:item.filename, amounts:item.amounts.map(a => a.value), percentages:item.percentages.map(p => p.value)})) } satisfies Comparison
  }
  if (agent === 'ELYSIUM' && capability === 'cap:report:generate@1.0.0') {
    const comparison = input as Comparison
    if (!comparison?.values || !comparison?.validation) throw new Error('INVALID_COMPARISON')
    const reportMarkdown = '# Informe documental determinista\n\nCoincidencias textuales; no es un dictamen jurídico.\n\n' + comparison.validation.intake.evidence.map(item => `## ${item.filename}\nSHA-256: ${item.sha256}\nImportes: ${item.amounts.map(x => x.text).join(', ') || 'ninguno'}\nPorcentajes: ${item.percentages.map(x => x.text).join(', ') || 'ninguno'}\nTérminos: ${item.clauses.map(x => x.text).join(', ') || 'ninguno'}\n`).join('\n')
    return { reportMarkdown, method:'RULE_BASED' }
  }
  if ((agent === 'TARTARUS' || agent === 'HADES') && capability === 'cap:crypto:hash@1.0.0') {
    if (typeof input !== 'string') throw new Error('INVALID_HASH_INPUT')
    return { sha256:createHash('sha256').update(input,'utf8').digest('hex'), inputBytes:Buffer.byteLength(input,'utf8'), algorithm:'sha256' }
  }
  throw new Error('CAPABILITY_NOT_IMPLEMENTED')
}
