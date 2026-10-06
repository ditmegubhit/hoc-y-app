import { describe, it, expect } from 'vitest'
import { toRenderPixelRect, clusterWordsIntoLabelBoxes, clusterLabelFragments, type LabelCluster } from './labelDetection'
import type { WordPositionRow } from '../../db/repositories/wordPositions.repo'

describe('toRenderPixelRect', () => {
  const target = { scale: 2, width: 200, height: 200 }

  it('image_pixel: chi quy doi ty le theo refWidth/refHeight', () => {
    const word: WordPositionRow = {
      text: 'x',
      bbox: { x0: 10, y0: 10, x1: 20, y1: 20 },
      coordSpace: 'image_pixel',
      refWidth: 100,
      refHeight: 100
    }
    expect(toRenderPixelRect(word, target)).toEqual({ x0: 20, y0: 20, x1: 40, y1: 40 })
  })

  it('pdf_point: nhan RENDER_SCALE va lat truc y (page height - y)', () => {
    const word: WordPositionRow = {
      text: 'x',
      bbox: { x0: 10, y0: 10, x1: 20, y1: 20 },
      coordSpace: 'pdf_point',
      refWidth: 100,
      refHeight: 100
    }
    const rect = toRenderPixelRect(word, target)
    expect(rect).toEqual({ x0: 20, x1: 40, y0: 160, y1: 180 })
  })
})

describe('detector and PDF label fragments', () => {
  const fragment = (text: string, x0: number, y0: number, x1: number, y1: number, coordSpace: LabelCluster['coordSpace'] = 'image_pixel'): LabelCluster =>
    ({ text, box: { x0, y0, x1, y1 }, coordSpace, confidence: 0.9 })
  it.each(['image_pixel', 'pdf_point'] as const)('joins three-line %s iliac labels from test PDF page 3', (source) => {
    const result = clusterLabelFragments([
      fragment('ĐM TM', 668, 313, 736, 341, source), fragment('chậu', 673, 339, 717, 361, source),
      fragment('ngoài', 668, 355, 720, 384, source), fragment('ĐM TM', 713, 509, 771, 529, source),
      fragment('chậu', 713, 531, 757, 550, source), fragment('trong', 713, 552, 759, 571, source)
    ])
    expect(result.map((item) => item.text)).toEqual(['ĐM TM chậu ngoài', 'ĐM TM chậu trong'])
  })
  it('does not merge independent side-by-side labels', () => {
    expect(clusterLabelFragments([fragment('Thận P', 10, 10, 65, 30), fragment('Thận T', 100, 10, 155, 30)])).toHaveLength(2)
  })
  it('keeps complete annotations separate across a narrow gutter', () => {
    expect(clusterLabelFragments([fragment('Hành DV', 0, 0, 70, 20),
      fragment('Hoành niệu dục', 80, 0, 190, 20), fragment('Đuôi mào tinh', 0, 30, 100, 50),
      fragment('Trung tâm gân đáy chậu', 110, 30, 250, 50)])).toHaveLength(4)
  })
  it('does not let an unrelated large heading inflate spacing thresholds', () => {
    expect(clusterLabelFragments([fragment('Tiêu đề', 0, 0, 300, 100), fragment('Thận P', 10, 200, 65, 210),
      fragment('Thận T', 100, 200, 155, 210)])).toHaveLength(3)
  })
  it('joins split PDF glyphs without introducing spaces inside Vietnamese syllables', () => {
    const result = clusterLabelFragments([fragment('th', 0, 0, 10, 10, 'pdf_point'),
      fragment('ượ', 10, 0, 20, 10, 'pdf_point'), fragment('ng ', 20, 0, 30, 10, 'pdf_point'),
      fragment('thận', 33, 0, 55, 10, 'pdf_point')])
    expect(result[0].text).toBe('thượng thận')
  })
})

describe('clusterWordsIntoLabelBoxes', () => {
  const target = { scale: 1, width: 500, height: 500 }

  function word(text: string, x0: number, y0: number, x1: number, y1: number): WordPositionRow {
    return { text, bbox: { x0, y0, x1, y1 }, coordSpace: 'image_pixel', refWidth: 500, refHeight: 500 }
  }

  it('gom cac tu cung 1 dong thanh 1 o', () => {
    const words = [word('Niệu', 10, 10, 30, 20), word('quản', 32, 10, 50, 20)]
    const clusters = clusterWordsIntoLabelBoxes(words, target)
    expect(clusters).toHaveLength(1)
    expect(clusters[0].text).toBe('Niệu quản')
    expect(clusters[0].box).toEqual({ x0: 10, y0: 10, x1: 50, y1: 20 })
  })

  it('gop 2 dong xep chong sat nhau, chong lan truc x, thanh 1 o', () => {
    const words = [
      word('Niệu quản', 10, 10, 60, 20),
      word('đoạn bụng', 10, 22, 55, 32)
    ]
    const clusters = clusterWordsIntoLabelBoxes(words, target)
    expect(clusters).toHaveLength(1)
    expect(clusters[0].text).toContain('Niệu quản')
    expect(clusters[0].text).toContain('đoạn bụng')
  })

  it('2 nhan cach xa nhau thi khong gop', () => {
    const words = [word('Bàng quang', 10, 10, 60, 20), word('Niệu đạo', 10, 300, 60, 310)]
    const clusters = clusterWordsIntoLabelBoxes(words, target)
    expect(clusters).toHaveLength(2)
  })
})
