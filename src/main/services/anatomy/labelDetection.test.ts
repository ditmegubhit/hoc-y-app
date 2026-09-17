import { describe, it, expect } from 'vitest'
import { toRenderPixelRect, clusterWordsIntoLabelBoxes } from './labelDetection'
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
