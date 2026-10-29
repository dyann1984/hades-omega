import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { dispatchCapability, type Intake, type Validation, type Comparison } from './capability-dispatcher.js'

describe('deterministic capability dispatcher', () => {
  it('passes document evidence through the registered pipeline and seals the actual report', () => {
    const docs = [
      {filename:'a.txt',content:'Oferta $12,100 MXN, SLA 99%.'},
      {filename:'b.txt',content:'Oferta $45,600 MXN, penalización 2%.'},
      {filename:'c.txt',content:'Oferta $78,900 MXN, sin garantía.'},
    ]
    const intake = dispatchCapability('CHARON', 'cap:doc:intake@1.0.0', docs) as Intake
    const validation = dispatchCapability('MINOS', 'cap:doc:validate@1.0.0', intake) as Validation
    const comparison = dispatchCapability('PERSEPHONE', 'cap:doc:compare@1.0.0', validation) as Comparison
    const report = dispatchCapability('ELYSIUM', 'cap:report:generate@1.0.0', comparison) as {reportMarkdown:string}
    const seal = dispatchCapability('TARTARUS', 'cap:crypto:hash@1.0.0', report.reportMarkdown) as {sha256:string}
    expect(validation.checks.map(x => x.sourceHash)).toEqual(docs.map(d => createHash('sha256').update(d.content).digest('hex')))
    expect(comparison.values.map(x => x.amounts[0])).toEqual([12100,45600,78900])
    expect(comparison.ranges).toEqual([{currency:'MXN',minimum:12100,maximum:78900,difference:66800,documents:['a.txt','b.txt','c.txt']}])
    expect(report.reportMarkdown).toContain('$45,600')
    expect(report.reportMarkdown).not.toContain('150,000')
    expect(seal.sha256).toBe(createHash('sha256').update(report.reportMarkdown).digest('hex'))
  })
  it('rejects mismatched capabilities, missing implementations and invalid upstream output', () => {
    expect(() => dispatchCapability('CHARON', 'cap:doc:validate@1.0.0', {})).toThrow('CAPABILITY_NOT_AVAILABLE')
    expect(() => dispatchCapability('CHARON', 'cap:procurement:eval@1.0.0', {})).toThrow('CAPABILITY_NOT_IMPLEMENTED')
    expect(() => dispatchCapability('MINOS', 'cap:doc:validate@1.0.0', {})).toThrow('INVALID_INTAKE')
    const intake = dispatchCapability('CHARON','cap:doc:intake@1.0.0',[{filename:'a',content:''},{filename:'b',content:'b'}])
    expect(() => dispatchCapability('MINOS','cap:doc:validate@1.0.0',intake)).toThrow('EMPTY_DOCUMENT')
  })
})
