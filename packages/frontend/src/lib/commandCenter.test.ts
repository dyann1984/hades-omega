import { describe, expect, it } from 'vitest'
import { isPendingReview, taskColumn, taskDescription } from './commandCenter.js'
describe('command center data mapping', () => {
  it('maps actual task states without dropping failures or unknown states', () => {
    expect(taskColumn('CERBERUS_REVIEW')).toBe('review')
    expect(taskColumn('EXECUTED')).toBe('done')
    expect(taskColumn('FAILED')).toBe('stopped')
    expect(taskColumn('NEW_STATE')).toBe('unknown')
  })
  it('recognizes a persisted local mission awaiting review', () => {
    expect(isPendingReview('PARTIAL_COMPLETE', ['CERBERUS_REVIEW'])).toBe(true)
    expect(isPendingReview('COMPLETED', ['EXECUTED'])).toBe(false)
  })
  it('converts task objects from the API to safe labels', () => {
    expect(taskDescription({title:'Análisis'})).toBe('Análisis')
    expect(taskDescription({payload:'secret'})).toBe(null)
  })
})
