import { describe, expect, it } from 'vitest'
import { decideAutoDraft, isUsableAutomaticLabel, normalizedOverlapRatio, splitSuggestedAnswer } from './autoDraft'

const box = { x0: 0, y0: 0, x1: 100, y1: 30 }
const base = { rawText: 'Thận trái', labelBox: box, refWidth: 1000, refHeight: 1000, confidence: 0.9 }

describe('decideAutoDraft', () => {
  it('tin cay >= 0.8, khong nghi rac, chu hop le -> confirmed', () => {
    expect(decideAutoDraft(base)).toEqual({ status: 'confirmed', answerText: 'Thận trái', alternates: [] })
    expect(decideAutoDraft({ ...base, confidence: 0.8 }).status).toBe('confirmed')
  })

  it('tach dap an phu theo dau /', () => {
    expect(decideAutoDraft({ ...base, rawText: 'ĐM thận / Động mạch thận' })).toEqual({
      status: 'confirmed', answerText: 'ĐM thận', alternates: ['Động mạch thận']
    })
    expect(splitSuggestedAnswer(' a / b / c ')).toEqual({ answerText: 'a', alternates: ['b', 'c'] })
  })

  it('tin cay thap, null hoac vung nghi rac -> pending', () => {
    expect(decideAutoDraft({ ...base, confidence: 0.79 }).status).toBe('pending')
    expect(decideAutoDraft({ ...base, confidence: null }).status).toBe('pending')
    expect(decideAutoDraft({ ...base, suspect: true }).status).toBe('pending')
    expect(decideAutoDraft({ ...base, suspect: true }).answerText).toBeNull()
  })

  it('chu khong hop le (ma nhom GP, qua ngan) -> pending', () => {
    expect(isUsableAutomaticLabel('GP 12')).toBe(false)
    expect(isUsableAutomaticLabel('GP12 II')).toBe(false)
    expect(isUsableAutomaticLabel('a')).toBe(false)
    expect(isUsableAutomaticLabel('|=')).toBe(false)
    expect(decideAutoDraft({ ...base, rawText: 'GP 3' }).status).toBe('pending')
  })
})

describe('normalizedOverlapRatio', () => {
  it('tinh theo toa do chuan hoa nen doi do phan giai van khop', () => {
    const a = { box: { x0: 100, y0: 100, x1: 200, y1: 140 }, refWidth: 1000, refHeight: 1000 }
    const b = { box: { x0: 200, y0: 200, x1: 400, y1: 280 }, refWidth: 2000, refHeight: 2000 }
    expect(normalizedOverlapRatio(a, b)).toBeCloseTo(1, 5)
    const far = { box: { x0: 800, y0: 800, x1: 900, y1: 840 }, refWidth: 1000, refHeight: 1000 }
    expect(normalizedOverlapRatio(a, far)).toBe(0)
  })
})
