import { createHash } from 'node:crypto'

export interface TextDocument { filename: string; content: string }

/** Deterministic text analysis. Findings include their source; no legal conclusion is inferred. */
export function analyzeDocuments(documents: TextDocument[]) {
  return documents.map(document => {
    const text = document.content
    const amounts = Array.from(text.matchAll(/(?:\$\s*([\d,]+(?:\.\d+)?))|(?:\b([\d,]+(?:\.\d+)?)\s*(?:MXN|USD)\b)/gi), match => ({
      text: match[0], value: Number((match[1] ?? match[2]!).replace(/,/g, '')), offset: match.index!,
    }))
    const percentages = Array.from(text.matchAll(/\b\d+(?:\.\d+)?\s*%/g), match => ({ text: match[0], value: Number(match[0].replace('%', '').trim()), offset: match.index! }))
    const clauses = Array.from(text.matchAll(/sin garant[ií]a|garant[ií]a|penalizaci[oó]n|SLA|plazo/gi), match => ({ text: match[0], offset: match.index! }))
    return { filename: document.filename, sha256: createHash('sha256').update(text, 'utf8').digest('hex'), bytes: Buffer.byteLength(text, 'utf8'), amounts, percentages, clauses }
  })
}
