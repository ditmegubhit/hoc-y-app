import { describe, expect, it } from 'vitest'
import { chooseBestReading, noiseRatio, type Reading } from './voting'

const r = (text: string, confidence: number, source: string, weight?: number): Reading => ({ text, confidence, source, weight })

describe('chooseBestReading', () => {
  it('returns null when nothing is readable', () => {
    expect(chooseBestReading([])).toBeNull()
    expect(chooseBestReading([r('', 0.9, 'a'), r(' | ', 0.5, 'b')])).toBeNull()
  })

  it('prefers the reading that is a known anatomy term over a plausible misspelling', () => {
    const result = chooseBestReading([r('CƠ CẰM LƯỜI', 0.95, 'viet'), r('CƠ CẰM LƯỠI', 0.8, 'tess')])
    expect(result?.text).toBe('CƠ CẰM LƯỠI')
    expect(result?.detail.known).toBe(true)
    expect(result?.disagreeing).toBe(1)
  })

  it('prefers valid syllables and low noise when no term is known', () => {
    const result = chooseBestReading([r('€ỡ ngang äáy SfậW', 0.7, 'tess'), r('cơ ngang đáy chậu', 0.9, 'viet')])
    expect(result?.source).toBe('viet')
  })

  it('lets two agreeing readers beat a single confident one', () => {
    const result = chooseBestReading([r('Hố thuyền', 0.6, 'a'), r('Hố thuyền', 0.6, 'b'), r('Hồ thuyền', 0.95, 'c')])
    expect(result?.text).toBe('Hố thuyền')
    expect(result?.disagreeing).toBe(1)
  })

  it('uses learned terms (additionalTerms) to break ties', () => {
    const result = chooseBestReading([r('Gờ xyz abc', 0.7, 'a'), r('Gờ xyy abc', 0.7, 'b')], { additionalTerms: ['Gờ xyy abc'] })
    expect(result?.text).toBe('Gờ xyy abc')
  })

  it('weights recognizers', () => {
    const result = chooseBestReading([r('mào tinh', 0.5, 'viet', 1.5), r('mào tỉnh', 0.6, 'tess', 0.5)])
    expect(result?.source).toBe('viet')
  })
})

describe('noiseRatio', () => {
  it('counts unusual symbols only', () => {
    expect(noiseRatio('Thận T')).toBe(0)
    expect(noiseRatio('ĐM, TM thận (P)')).toBe(0)
    expect(noiseRatio('†reo |')).toBeGreaterThan(0.3)
    expect(noiseRatio('   ')).toBe(1)
  })
})
