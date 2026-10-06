import { describe, it, expect, afterAll } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PDFDocument, rgb } from 'pdf-lib'
import { createCanvas } from '@napi-rs/canvas'
import { asAxisRect, buildVectorShapes, extractVectorShapes, type OpsTable, type VectorShapes } from './vectorShapes'

// PDF tong hop bang pdf-lib: hop to mau + vien, hop long nhau, net thang, net co dau mui ten, hop khong co
// duong dan, nen trang phu ca trang, anh nen. Kiem tra toa do sau khi doi he (pixel anh, y huong xuong).

const SCALE = 2.2
const PAGE_W = 612
const PAGE_H = 792
const tmp = mkdtempSync(join(tmpdir(), 'vector-shapes-'))
afterAll(() => rmSync(tmp, { recursive: true, force: true }))

/** Hop PDF (goc duoi-trai, don vi pt) -> hop pixel anh. */
const px = (x: number, y: number, w: number, h: number): { x0: number; y0: number; x1: number; y1: number } => ({
  x0: x * SCALE, y0: (PAGE_H - y - h) * SCALE, x1: (x + w) * SCALE, y1: (PAGE_H - y) * SCALE
})

function close(actual: { x0: number; y0: number; x1: number; y1: number }, expected: { x0: number; y0: number; x1: number; y1: number }, tol = 2): void {
  for (const k of ['x0', 'y0', 'x1', 'y1'] as const) expect(Math.abs(actual[k] - expected[k]), `${k}: ${actual[k]} vs ${expected[k]}`).toBeLessThanOrEqual(tol)
}

async function buildSamplePdf(): Promise<string> {
  const doc = await PDFDocument.create()
  const page = doc.addPage([PAGE_W, PAGE_H])
  // Nen trang phu ca trang (phai bi bo).
  page.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: rgb(1, 1, 1) })
  // Anh nen: 1 anh PNG 40x40 ve o (50,350) 300x300 + hop trung khit voi anh (phai bi bo).
  const canvas = createCanvas(40, 40)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#336699'; ctx.fillRect(0, 0, 40, 40)
  const png = await doc.embedPng(canvas.toBuffer('image/png'))
  page.drawImage(png, { x: 50, y: 350, width: 300, height: 300 })
  page.drawRectangle({ x: 50, y: 350, width: 300, height: 300, borderColor: rgb(0, 0, 0), borderWidth: 1 })
  // Hop A: nen vang nhat + vien do.
  page.drawRectangle({ x: 400, y: 600, width: 150, height: 40, color: rgb(1, 1, 0.8), borderColor: rgb(1, 0, 0), borderWidth: 1.5 })
  // Hop C (khung chua xam) chua hop D (trang vien den) - long nhau.
  page.drawRectangle({ x: 380, y: 400, width: 200, height: 120, color: rgb(0.87, 0.87, 0.87) })
  page.drawRectangle({ x: 400, y: 440, width: 100, height: 30, color: rgb(1, 1, 1), borderColor: rgb(0, 0, 0), borderWidth: 1 })
  // Hop E: khong co duong dan.
  page.drawRectangle({ x: 60, y: 100, width: 120, height: 30, color: rgb(1, 1, 1), borderColor: rgb(0, 0, 0), borderWidth: 1 })
  // Net thang tu hop A xuong-trai (mau xanh duong).
  page.drawLine({ start: { x: 400, y: 620 }, end: { x: 250, y: 520 }, thickness: 1.5, color: rgb(0, 0.6, 1) })
  // Net co dau mui ten tu hop D: net + tam giac dac o dau xa.
  page.drawLine({ start: { x: 400, y: 455 }, end: { x: 300, y: 455 }, thickness: 1.2, color: rgb(1, 0, 0) })
  page.drawSvgPath('M 0 0 L 12 6 L 12 -6 Z', { x: 292, y: 455, color: rgb(1, 0, 0), scale: 1 })
  const path = join(tmp, 'sample.pdf')
  writeFileSync(path, await doc.save())
  return path
}

let cached: Promise<VectorShapes | null> | null = null
const shapes = (): Promise<VectorShapes | null> => {
  if (!cached) cached = buildSamplePdf().then((p) => extractVectorShapes(p, 1, SCALE))
  return cached
}

describe('extractVectorShapes (pdf tong hop)', () => {
  it('doc duoc kich thuoc trang va ghi nhan anh', async () => {
    const v = await shapes()
    expect(v).not.toBeNull()
    expect(v!.width).toBe(Math.ceil(PAGE_W * SCALE))
    expect(v!.height).toBe(Math.ceil(PAGE_H * SCALE))
    expect(v!.images).toHaveLength(1)
    close(v!.images[0], px(50, 350, 300, 300))
  })

  it('bo hop phu ca trang va hop trung khit voi anh; con lai A, C, D, E', async () => {
    const v = (await shapes())!
    expect(v.rects).toHaveLength(4)
    const find = (e: ReturnType<typeof px>) => v.rects.find((r) => Math.abs(r.box.x0 - e.x0) < 3 && Math.abs(r.box.y0 - e.y0) < 3)
    const a = find(px(400, 600, 150, 40))!
    expect(a).toBeDefined()
    close(a.box, px(400, 600, 150, 40))
    expect(a.fill).toBe('#ffffcc')
    expect(a.stroke).toBe('#ff0000')
    expect(a.lineWidth).toBeGreaterThan(2.5) // 1.5pt * 2.2
    const c = find(px(380, 400, 200, 120))!
    expect(c.fill).toBe('#dedede')
    expect(c.stroke).toBeUndefined()
    const d = find(px(400, 440, 100, 30))!
    expect(d.fill).toBe('#ffffff')
    expect(d.stroke).toBe('#000000')
    close(d.box, px(400, 440, 100, 30))
    const e = find(px(60, 100, 120, 30))!
    close(e.box, px(60, 100, 120, 30))
  })

  it('lay net thang va net co dau mui ten voi toa do dung', async () => {
    const v = (await shapes())!
    const blue = v.lines.find((l) => l.color === '#0099ff')!
    expect(blue).toBeDefined()
    const [p0, p1] = [blue.points[0], blue.points[blue.points.length - 1]]
    // Net xanh di tu (400,620) toi (250,520) trong toa do PDF -> pixel anh.
    const ends = [p0, p1].sort((m, n) => m[0] - n[0])
    expect(Math.abs(ends[0][0] - 250 * SCALE)).toBeLessThan(2)
    expect(Math.abs(ends[0][1] - (PAGE_H - 520) * SCALE)).toBeLessThan(2)
    expect(Math.abs(ends[1][0] - 400 * SCALE)).toBeLessThan(2)
    expect(Math.abs(ends[1][1] - (PAGE_H - 620) * SCALE)).toBeLessThan(2)
    expect(blue.hasArrowHead).toBe(false)

    const red = v.lines.find((l) => l.color === '#ff0000' && l.length > 150)!
    expect(red).toBeDefined()
    expect(red.hasArrowHead).toBe(true)
    // Dau mui ten keo diem cuoi toi dinh (x = 292pt) xa hon dau net (300pt).
    const xs = red.points.map((p) => p[0])
    expect(Math.min(...xs)).toBeLessThan(296 * SCALE)
    expect(v.stats.arrowHeads).toBeGreaterThanOrEqual(1)
  })
})

describe('buildVectorShapes (danh sach lenh tu tao)', () => {
  const OPS: OpsTable = {
    save: 10, restore: 11, transform: 12, constructPath: 91, fill: 20, stroke: 21, fillStroke: 22,
    setFillRGBColor: 59, setStrokeRGBColor: 58, paintImageXObject: 85
  }
  const rectPath = (x: number, y: number, w: number, h: number): Float32Array =>
    new Float32Array([0, x, y, 1, x + w, y, 1, x + w, y + h, 1, x, y + h, 4])

  it('theo doi CTM (save/transform/restore) va mau hien hanh', () => {
    const list = {
      fnArray: [OPS.setFillRGBColor, OPS.save, OPS.transform, OPS.constructPath, OPS.restore, OPS.constructPath],
      argsArray: [
        ['#00ff00'], null, [2, 0, 0, 2, 10, 20],
        [OPS.fill, [rectPath(0, 0, 50, 20)], null], null,
        [OPS.fill, [rectPath(100, 100, 50, 20)], null]
      ]
    }
    // Viewport: lat truc y (trang cao 400), khong co ty le.
    const v = buildVectorShapes(list, OPS, [1, 0, 0, -1, 0, 400], 500, 400)
    expect(v.rects).toHaveLength(2)
    // Hop 1 qua CTM 2x + tinh tien: x 10..110, y_pdf 20..60 -> y_anh 340..380.
    close(v.rects[0].box, { x0: 10, y0: 340, x1: 110, y1: 380 })
    // Hop 2 sau restore: khong con CTM.
    close(v.rects[1].box, { x0: 100, y0: 280, x1: 150, y1: 300 })
    expect(v.rects[0].fill).toBe('#00ff00')
  })

  it('gop fill + stroke cung hop thanh 1 hop (nen + vien)', () => {
    const list = {
      fnArray: [OPS.setFillRGBColor, OPS.setStrokeRGBColor, OPS.constructPath, OPS.constructPath],
      argsArray: [['#ffffff'], ['#000000'], [OPS.fill, [rectPath(20, 20, 80, 30)], null], [OPS.stroke, [rectPath(20, 20, 80, 30)], null]]
    }
    const v = buildVectorShapes(list, OPS, [1, 0, 0, 1, 0, 0], 500, 400)
    expect(v.rects).toHaveLength(1)
    expect(v.rects[0].fill).toBe('#ffffff')
    expect(v.rects[0].stroke).toBe('#000000')
  })

  it('asAxisRect nhan hop 4/5 diem, tu choi hinh cheo', () => {
    expect(asAxisRect([[0, 0], [10, 0], [10, 5], [0, 5]])).toEqual({ x0: 0, y0: 0, x1: 10, y1: 5 })
    expect(asAxisRect([[0, 0], [10, 0], [10, 5], [0, 5], [0, 0]])).not.toBeNull()
    expect(asAxisRect([[0, 0], [10, 2], [10, 7], [0, 5]])).toBeNull()
  })
})
