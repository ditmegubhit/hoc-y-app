import { describe, expect, it } from 'vitest'
import { assessTextLayer, isTextLayerTrustworthy, mergeTextItemsIntoLines, type TextLayerItem } from './textLayer'

const item = (str: string, x: number, y: number, width: number, size = 11, scaleX = size): TextLayerItem =>
  ({ str, transform: [scaleX, 0, 0, size, x, y], width, height: size })

describe('mergeTextItemsIntoLines', () => {
  it('glues adjacent runs of one Vietnamese label without inserting spaces', () => {
    // "tm th" + "ượ" + "ng th" + "ậ" + "n trái" tach theo font (PowerPoint -> PDF).
    const items = [item('tm th', 376.5, 694.2, 15.4, 6.3), item('ượ', 391.9, 694.2, 10.1, 6.3), item('ng th', 402, 694.2, 15.4, 6.3),
      item('ậ', 417.4, 694.2, 3.5, 6.3), item('n trái', 420.9, 694.2, 15.4, 6.3)]
    const lines = mergeTextItemsIntoLines(items)
    expect(lines).toHaveLength(1)
    expect(lines[0].text).toBe('tm thượng thận trái')
    expect(lines[0].trusted).toBe(true)
  })

  it('inserts a space for real gaps and ignores whitespace-only runs that span far', () => {
    const items = [item('TM', 100, 500, 14), item(' ', 114, 500, 355), item('CỬA', 120, 500, 24)]
    const lines = mergeTextItemsIntoLines(items)
    expect(lines.map((l) => l.text)).toEqual(['TM CỬA'])
  })

  it('splits labels far apart on the same baseline', () => {
    const lines = mergeTextItemsIntoLines([item('TM CỬA', 30, 300, 40), item('TM CHỦ DƯỚI', 500, 300, 70)])
    expect(lines.map((l) => l.text).sort()).toEqual(['TM CHỦ DƯỚI', 'TM CỬA'])
  })

  it('keeps separate baselines as separate lines, top to bottom', () => {
    const lines = mergeTextItemsIntoLines([item('hầu', 40, 361.9, 20), item('CUNG KHẨU CÁI', 38.5, 377.4, 70)])
    expect(lines.map((l) => l.text)).toEqual(['CUNG KHẨU CÁI', 'hầu'])
  })

  it('converts the box to PDF points with y up', () => {
    const [line] = mergeTextItemsIntoLines([item('Thận P', 10, 100, 30, 10)])
    expect(line.box.x0).toBe(10)
    expect(line.box.x1).toBe(40)
    expect(line.box.y0).toBeLessThan(100)
    expect(line.box.y1).toBeGreaterThan(100)
  })
})

describe('text layer trust', () => {
  it('does not trust a stretched font (hidden OCR layer) or garbage words', () => {
    const lines = mergeTextItemsIntoLines([item('AM fines', 279.9, 541.2, 39, 8.8, 10.6)])
    expect(lines[0].trusted).toBe(false)
    expect(lines[0].reasons.join(' ')).toContain('keo gian')
  })

  it('does not trust a short accent-less token (probably handwriting OCR)', () => {
    const [line] = mergeTextItemsIntoLines([item('tren', 100, 100, 20, 10)])
    expect(line.trusted).toBe(false)
  })

  it('does not trust split syllables', () => {
    const [line] = mergeTextItemsIntoLines([item('tm th', 10, 10, 15, 8), item('ượ', 40, 10, 8, 8), item('ng', 70, 10, 8, 8)])
    expect(line.trusted).toBe(false)
  })

  it('page-level verdict needs most lines to be trusted', () => {
    const good = [item('Bàng quang', 50, 700, 50), item('Niệu quản', 50, 600, 45), item('Tuyến tiền liệt', 50, 500, 70)]
    expect(isTextLayerTrustworthy(good)).toBe(true)
    const bad = [item('Fah Ain ainh be', 50, 700, 50, 9, 14), item('Trungtaman', 50, 600, 45, 9, 14), item('Bàng quang', 50, 500, 50)]
    const verdict = assessTextLayer(bad)
    expect(verdict.trustworthy).toBe(false)
    expect(verdict.trustedLines).toBe(1)
    expect(isTextLayerTrustworthy([])).toBe(false)
  })
})
