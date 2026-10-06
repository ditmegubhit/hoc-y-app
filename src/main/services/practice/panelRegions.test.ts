import { describe, it, expect } from 'vitest'
import { createCanvas } from '@napi-rs/canvas'
import type { Rect } from '../../../shared/types/anatomyQuiz'
import type { GroupFragment } from './labelGrouping'
import type { RgbaImage } from './leaderLine'
import type { VectorLine, VectorRect, VectorShapes } from './vectorShapes'
import {
  groupFragmentsIntoPanels, matchVectorLeader, readingOrder, vectorPanelCandidates, type PanelCandidate
} from './panelRegions'
import { analyzePageLabels } from './pageAnalysis'

const frag = (x0: number, y0: number, x1: number, y1: number, text: string, confidence: number | null = 0.9): GroupFragment =>
  ({ box: { x0, y0, x1, y1 }, text, confidence })
const panel = (x0: number, y0: number, x1: number, y1: number): PanelCandidate =>
  ({ box: { x0, y0, x1, y1 }, fill: '#ffffff', stroke: '#000000', lineWidth: 2, source: 'vector' })
const line = (pts: Array<[number, number]>, color = '#ffff00'): VectorLine => {
  let len = 0
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
  return { points: pts, color, width: 3, hasArrowHead: false, length: len, source: 'fill' }
}
const whiteImage = (width: number, height: number): RgbaImage => ({ data: new Uint8ClampedArray(width * height * 4).fill(255), width, height })

describe('groupFragmentsIntoPanels', () => {
  it('hop nhieu dong -> 1 vung, doc tren xuong va noi bang khoang trang (du thu tu dau vao bi dao)', () => {
    const frags = [frag(80, 920, 133, 955, 'HẦU', 0.8), frag(80, 887, 248, 918, 'CUNG KHẨU CÁI', 0.99)]
    const r = groupFragmentsIntoPanels(frags, [panel(68, 880, 306, 969)], 1347, 1743)
    expect(r.groups).toHaveLength(1)
    expect(r.free).toEqual([])
    expect(r.groups[0].text).toBe('CUNG KHẨU CÁI HẦU')
    expect(r.groups[0].members).toEqual([1, 0])
    // Confidence trung binh co trong so theo do dai chu: (0.99*13 + 0.8*3)/16
    expect(r.groups[0].confidence).toBeCloseTo((0.99 * 13 + 0.8 * 3) / 16, 5)
  })

  it('hop vua voi chu -> mask la ca hop; hop qua rong so voi chu -> hop co theo chu + le', () => {
    const fit = groupFragmentsIntoPanels([frag(100, 100, 200, 130, 'A B')], [panel(90, 90, 210, 140)], 1000, 1000)
    expect(fit.groups[0].box).toEqual({ x0: 90, y0: 90, x1: 210, y1: 140 })
    // Hop 400x120 chua chu 60x20 (ti le dien tich 40 > 10): co lai quanh chu, van nam trong hop.
    const wide = groupFragmentsIntoPanels([frag(100, 100, 160, 120, 'Ab')], [panel(60, 60, 460, 180)], 1000, 1000, { maxAreaRatio: 100 })
    const b = wide.groups[0].box
    expect(b.x0).toBeGreaterThanOrEqual(60)
    expect(b.x1 - b.x0).toBeLessThan(120)
    expect(b.x0).toBeLessThanOrEqual(100)
    expect(b.x1).toBeGreaterThanOrEqual(160)
  })

  it('hop long nhau: lay hop NHO NHAT chua manh; chu ngoai hop nho nhung trong khung chua rong -> giu nguyen (free)', () => {
    const inner = panel(120, 120, 280, 170)
    const outer = panel(60, 60, 460, 360)
    const frags = [frag(130, 130, 270, 160, 'TRONG'), frag(300, 300, 420, 330, 'NGOAI')]
    const r = groupFragmentsIntoPanels(frags, [outer, inner], 1000, 1000)
    expect(r.groups).toHaveLength(1)
    expect(r.groups[0].text).toBe('TRONG')
    expect(r.groups[0].panel.box).toEqual(inner.box)
    expect(r.free).toEqual([1])
  })

  it('chu khong nam trong hop nao giu nguyen; hop co qua nhieu manh bi bo (khung chua)', () => {
    const frags = [frag(10, 10, 80, 30, 'tu do')]
    const r = groupFragmentsIntoPanels(frags, [panel(200, 200, 300, 260)], 1000, 1000)
    expect(r.groups).toHaveLength(0)
    expect(r.free).toEqual([0])
    const many = Array.from({ length: 8 }, (_, i) => frag(110 + (i % 2) * 120, 110 + Math.floor(i / 2) * 40, 190 + (i % 2) * 120, 135 + Math.floor(i / 2) * 40, `m${i}`))
    const c = groupFragmentsIntoPanels(many, [panel(100, 100, 360, 280)], 1000, 1000)
    expect(c.groups).toHaveLength(0)
    expect(c.free).toHaveLength(8)
  })

  it('manh chong >= 60% dien tich vao hop duoc tinh trong hop du tam o ngoai', () => {
    const r = groupFragmentsIntoPanels([frag(50, 100, 150, 130, 'tran')], [panel(100, 90, 220, 140)], 1000, 1000)
    expect(r.groups).toHaveLength(1) // tam x=100 nam tren mep, chong 50%x100% = 50% -> nhung tam trong hop (+dung sai)
  })

  it('readingOrder chia dong theo tam doc', () => {
    const f = [frag(300, 12, 380, 32, 'c'), frag(10, 10, 90, 30, 'a'), frag(10, 50, 90, 70, 'd'), frag(120, 11, 200, 31, 'b')]
    expect(readingOrder(f, [0, 1, 2, 3])).toEqual([1, 3, 0, 2])
  })
})

describe('vectorPanelCandidates (tuong phan)', () => {
  const white = whiteImage(600, 600)
  const rect = (fill: string | undefined, stroke: string | undefined): VectorRect =>
    ({ box: { x0: 100, y0: 100, x1: 300, y1: 160 }, fill, stroke, lineWidth: stroke ? 2 : 0 })
  it('nen trang tren trang khong vien -> loai; co vien den -> nhan; nen mau tren trang -> nhan', () => {
    expect(vectorPanelCandidates([rect('#ffffff', undefined)], white)).toHaveLength(0)
    expect(vectorPanelCandidates([rect('#ffffff', '#000000')], white)).toHaveLength(1)
    expect(vectorPanelCandidates([rect('#ffcc00', undefined)], white)).toHaveLength(1)
  })
  it('vien cung mau nen va nen cung mau xung quanh -> loai', () => {
    expect(vectorPanelCandidates([rect('#ffffff', '#ffffff')], white)).toHaveLength(0)
  })
})

describe('matchVectorLeader', () => {
  const box: Rect = { x0: 100, y0: 100, x1: 300, y1: 160 }
  it('net co dau cham/nam duoi hop va keo dai ra ngoai -> endpoint o dau kia', () => {
    const m = matchVectorLeader(box, 25, [line([[250, 130], [300, 200], [500, 400]])])
    expect(m).not.toBeNull()
    expect(m!.best.endpoint).toEqual({ x: 500, y: 400 })
    expect(m!.best.attach).toEqual({ x: 250, y: 130 })
  })
  it('chap nhan dung sai cham mep; khong chap nhan net cach xa', () => {
    expect(matchVectorLeader(box, 25, [line([[304, 130], [500, 300]])])).not.toBeNull()
    expect(matchVectorLeader(box, 25, [line([[330, 130], [500, 300]])])).toBeNull()
  })
  it('net qua ngan, net doc theo mep hop, net nguech ngoac -> khong phai duong dan', () => {
    expect(matchVectorLeader(box, 25, [line([[300, 130], [320, 140]])])).toBeNull()
    expect(matchVectorLeader(box, 25, [line([[100, 162], [300, 162]])])).toBeNull()
    const scribble = line([[300, 130], [400, 200], [310, 250], [420, 310], [310, 350], [430, 400], [320, 200]])
    expect(matchVectorLeader(box, 25, [scribble])).toBeNull()
  })
  it('net co dau xa nam trong hop khac -> khong thuoc hop nay', () => {
    const other: Rect = { x0: 400, y0: 300, x1: 600, y1: 360 }
    expect(matchVectorLeader(box, 25, [line([[250, 130], [500, 330]])], [other])).toBeNull()
  })
})

describe('analyzePageLabels voi hop vector', () => {
  const image = whiteImage(800, 600)
  const vector = (rects: VectorRect[], lines: VectorLine[]): VectorShapes => ({
    width: 800, height: 600, rects, lines, images: [], stats: { constructPaths: 0, images: 0, rawRects: 0, thinPolygons: 0, arrowHeads: 0 }
  })
  it('hop co net vector -> 1 vung co duong dan; hop khong net -> nghi rac; chu ngoai hop -> free', () => {
    const rects: VectorRect[] = [
      { box: { x0: 100, y0: 100, x1: 340, y1: 190 }, fill: '#ffffff', stroke: '#000000', lineWidth: 2 },
      { box: { x0: 100, y0: 300, x1: 340, y1: 360 }, fill: '#ffffff', stroke: '#000000', lineWidth: 2 }
    ]
    const frags = [
      frag(120, 150, 230, 180, 'HẦU', 0.9), frag(120, 110, 320, 142, 'CUNG KHẨU CÁI', 0.9),
      frag(120, 310, 300, 345, 'KHÔNG DÂY', 0.9), frag(500, 500, 640, 530, 'chu ngoai', 0.9)
    ]
    const res = analyzePageLabels(image, frags, { vector: vector(rects, [line([[250, 140], [600, 400]])]) })
    expect(res.panelSource).toBe('vector')
    const texts = res.labels.map((l) => l.text)
    expect(texts).toContain('CUNG KHẨU CÁI HẦU')
    const a = res.labels.find((l) => l.text === 'CUNG KHẨU CÁI HẦU')!
    expect(a.origin).toBe('panel-vector')
    expect(a.leaderSource).toBe('vector')
    expect(a.leader.hasLeader).toBe(true)
    expect(a.leader.endpoint).toEqual({ x: 600, y: 400 })
    expect(a.verdict.codes).not.toContain('no-leader')
    const b = res.labels.find((l) => l.text === 'KHÔNG DÂY')!
    expect(b.leader.hasLeader).toBe(false)
    expect(b.verdict.codes).toContain('no-leader')
    const c = res.labels.find((l) => l.text === 'chu ngoai')!
    expect(c.origin).toBe('free')
    expect(res.labels).toHaveLength(3)
  })
  it('disablePanels -> khong gom theo hinh khoi (duong cu)', () => {
    const res = analyzePageLabels(image, [frag(120, 110, 320, 142, 'A', 0.9)], { vector: vector([], []), disablePanels: true })
    expect(res.panelSource).toBe('none')
  })
})

describe('du phong anh (trang khong co vector)', () => {
  // Anh tong hop: nen nau, hop trang vien den chua 2 dong chu (thanh den), 1 chu roi ben ngoai.
  function sceneImage(): RgbaImage {
    const canvas = createCanvas(700, 400)
    const ctx = canvas.getContext('2d')
    // Nen nau nhieu (giong anh chup that), bo sinh gia ngau nhien co dinh.
    const base = ctx.createImageData(700, 400)
    let seed = 777
    for (let i = 0; i < 700 * 400; i++) {
      seed = (seed * 1664525 + 1013904223) % 4294967296
      const n = (seed / 4294967296 - 0.5) * 60
      base.data[i * 4] = 120 + n; base.data[i * 4 + 1] = 85 + n; base.data[i * 4 + 2] = 70 + n; base.data[i * 4 + 3] = 255
    }
    ctx.putImageData(base, 0, 0)
    ctx.fillStyle = '#ffffff'; ctx.fillRect(100, 100, 220, 90)
    ctx.strokeStyle = '#000000'; ctx.lineWidth = 3; ctx.strokeRect(100, 100, 220, 90)
    ctx.fillStyle = '#111111'
    for (let i = 0; i < 12; i++) ctx.fillRect(116 + i * 14, 114, 9, 24) // dong 1
    for (let i = 0; i < 5; i++) ctx.fillRect(116 + i * 14, 148, 9, 24) // dong 2
    ctx.fillStyle = '#e8d8c8'
    for (let i = 0; i < 6; i++) ctx.fillRect(450 + i * 14, 300, 4, 24) // chu roi tren nen anh (net manh)
    const out = ctx.getImageData(0, 0, 700, 400)
    return { data: out.data, width: 700, height: 400 }
  }
  it('imagePanelCandidates tim hop trang vien den; 2 dong thanh 1 vung, chu roi giu free', () => {
    const image = sceneImage()
    const frags = [
      frag(114, 112, 288, 140, 'CUNG KHẨU CÁI'), frag(114, 146, 184, 174, 'HẦU'), frag(448, 298, 534, 326, 'roi')
    ]
    const res = analyzePageLabels(image, frags, { vector: null })
    expect(res.panelSource).toBe('image')
    const merged = res.labels.find((l) => l.text === 'CUNG KHẨU CÁI HẦU')
    expect(merged).toBeDefined()
    expect(merged!.origin).toBe('panel-image')
    expect(merged!.members).toEqual([0, 1])
    expect(res.labels.find((l) => l.text === 'roi')?.origin).toBe('free')
    expect(res.labels).toHaveLength(2)
  })
})
