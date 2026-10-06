import { describe, expect, it } from 'vitest'
import { combine } from './readingCombiner'

describe('combine', () => {
  it('returns an empty result when nobody read anything', () => {
    expect(combine([])).toEqual({ text: '', confidence: 0, source: 'none', alternatives: [] })
  })

  it('agreement gives high confidence and no alternatives', () => {
    const r = combine([{ text: 'Mào tinh', confidence: 0.9, source: 'vietocr' }, { text: 'mào tinh', confidence: 0.7, source: 'tesseract' }])
    expect(r.text.toLowerCase()).toBe('mào tinh')
    expect(r.confidence).toBeGreaterThan(0.85)
    expect(r.alternatives).toEqual([])
    expect(r.source.startsWith('vote:')).toBe(true)
  })

  it('disagreement lowers confidence and keeps the other reading as alternative', () => {
    const r = combine([{ text: 'CƠ CẰM LƯỜI', confidence: 0.95, source: 'vietocr' }, { text: 'CƠ CẰM LƯỠI', confidence: 0.8, source: 'tesseract' }])
    expect(r.text).toBe('CƠ CẰM LƯỠI')
    expect(r.alternatives).toHaveLength(1)
    expect(r.alternatives[0].source).toBe('vietocr')
  })

  it('restores accents from the dictionary when the winner has none', () => {
    const r = combine([{ text: 'Bang quang', confidence: 0.9, source: 'tesseract' }])
    expect(r.text).toBe('Bàng quang')
    expect(r.source).toBe('dictionary:tesseract')
  })

  it('uses learned terms', () => {
    const r = combine([{ text: 'Go xyz', confidence: 0.9, source: 'a' }], ['Gờ xyz'])
    expect(r.text).toBe('Gờ xyz')
  })
})
