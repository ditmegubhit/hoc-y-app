import { describe, expect, it } from 'vitest'
import { cerNoAccents, cerWithAccents, isExactMatch, levenshtein } from './textMetrics'
import { parseVocab, vietOcrInputWidth } from './vietocrOnnx'

describe('text metrics', () => {
  it('levenshtein counts edits on code points', () => {
    expect(levenshtein('thận', 'thân')).toBe(1)
    expect(levenshtein('', 'abc')).toBe(3)
  })
  it('exact match ignores case and expands abbreviations', () => {
    expect(isExactMatch('ĐM thận T', 'động mạch thận t')).toBe(true)
    expect(isExactMatch('Thận', 'Thân')).toBe(false)
  })
  it('CER with and without accents', () => {
    expect(cerWithAccents('thân', 'thận')).toBeCloseTo(0.25)
    expect(cerNoAccents('than', 'thận')).toBe(0)
    expect(cerWithAccents('', '')).toBe(0)
    expect(cerWithAccents('x', '')).toBe(1)
  })
})

describe('VietOCR helpers', () => {
  it('computes the model input width like VietOCR (round up to 10, clamp)', () => {
    expect(vietOcrInputWidth(100, 32)).toBe(100)
    expect(vietOcrInputWidth(101, 32)).toBe(110)
    expect(vietOcrInputWidth(10, 32)).toBe(32)
    expect(vietOcrInputWidth(5000, 32)).toBe(512)
    expect(vietOcrInputWidth(5000, 32, 1024)).toBe(1024)
  })
  it('parses one-token-per-line vocab keeping the space token', () => {
    expect(parseVocab('<pad>\n<sos>\n<eos>\n<mask>\na\n \n')).toEqual(['<pad>', '<sos>', '<eos>', '<mask>', 'a', ' '])
  })
})
