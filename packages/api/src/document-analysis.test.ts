import { describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { analyzeDocuments } from './document-analysis.js'

describe('deterministic document evidence', () => {
  it('extracts values from each source and keeps verifiable offsets and hashes', () => {
    const docs = [
      { filename: 'a.txt', content: 'Precio $12,345 MXN; SLA 99.5%; garantía incluida.' },
      { filename: 'b.txt', content: 'Precio $8,700 MXN; sin garantía; plazo 30 días.' },
      { filename: 'c.txt', content: 'Precio 4500 USD; penalización 3%.' },
    ]
    const findings = analyzeDocuments(docs)
    expect(findings.map(item => item.amounts[0]?.value)).toEqual([12345, 8700, 4500])
    expect(findings.map(item => item.sha256)).toEqual(docs.map(doc => createHash('sha256').update(doc.content).digest('hex')))
    for (const [index, item] of findings.entries()) {
      for (const match of [...item.amounts, ...item.percentages, ...item.clauses]) {
        expect(docs[index]!.content.slice(match.offset, match.offset + match.text.length)).toBe(match.text)
      }
    }
    expect(findings[1]!.clauses.some(clause => clause.text === 'sin garantía')).toBe(true)
  })

  it('does not invent amounts or clauses when the input contains none', () => {
    const [result] = analyzeDocuments([{ filename: 'empty.txt', content: 'Solo texto sin cifras.' }])
    expect(result!.amounts).toEqual([])
    expect(result!.percentages).toEqual([])
    expect(result!.clauses).toEqual([])
  })
})
